import 'server-only';
import {randomUUID} from 'node:crypto';
import {QUOTE_READY_KIND,type ChatMessage,type Conversation,type MessageRole,type QuoteNotice} from '@/domain';
import type {Category,ChatTurn} from '@/lib/contracts';
import {all,nowIso,one,run,scalar} from './sql';

// Customer chat: conversations, messages and the query log behind analytics. Reads are scoped
// to the customer, so one customer can never load another's conversation. The rep's transcript
// reads (conversationMessagePage, conversationMessageCount; B1) take a conversation id alone: the
// rep service checks the quote is the rep's first, and the customer barrel doesn't export them.
// TODO(R-5): chat transcripts (messages) and query_logs keep the customer's words as typed; add a PII
// removal layer before they are stored or shown to reps.

const CONVERSATION='SELECT id,customer_id,contact_id,started_at FROM conversations';

export function createConversation({id=randomUUID(),customerId,contactId=null,at=nowIso()}:{id?:string;customerId:string;contactId?:string|null;at?:string}){
  run('INSERT INTO conversations(id,customer_id,contact_id,started_at) VALUES(?,?,?,?)',id,customerId,contactId,at);
  return one<Conversation>(`${CONVERSATION} WHERE id=?`,id)!;
}
export function conversation(customerId:string,conversationId:string){return one<Conversation>(`${CONVERSATION} WHERE id=? AND customer_id=?`,conversationId,customerId);}

/**
 * The customer's most recently active conversation: the one with the newest message, or, for a
 * conversation with no messages yet, the newest start. undefined when the customer has none.
 */
export function latestConversation(customerId:string){
  return one<Conversation>(`SELECT c.id,c.customer_id,c.contact_id,c.started_at FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id
    WHERE c.customer_id=? GROUP BY c.id ORDER BY max(coalesce(m.created_at,c.started_at)) DESC,c.started_at DESC,c.rowid DESC LIMIT 1`,customerId);
}

type MessageRow=Omit<ChatMessage,'payload'>&{payload:string|null};
const MESSAGE='SELECT m.id,m.conversation_id,m.role,m.kind,m.content,m.payload,m.created_at FROM messages m';
const toMessage=(row:MessageRow):ChatMessage=>({...row,payload:row.payload===null?null:JSON.parse(row.payload)});

/** The conversation's messages in order, or [] if it isn't this customer's. */
export function conversationMessages(customerId:string,conversationId:string){
  return all<MessageRow>(`${MESSAGE} JOIN conversations c ON c.id=m.conversation_id WHERE m.conversation_id=? AND c.customer_id=? ORDER BY m.created_at,m.rowid`,conversationId,customerId).map(toMessage);
}

/** One message as the rep's chat drawer shows it (B1, spec §9): never the payload, which can carry anything. */
export interface TranscriptMessage {id:string;role:MessageRole;kind:string;content:string;created_at:string}
export interface TranscriptPage {
  /** Oldest first within the page. */
  messages:TranscriptMessage[];
  /** The cursor for the next (older) page, the oldest message's id here; null when there are no older messages. */
  next_before:string|null;
}
/** The drawer loads 50 messages at a time (decision 26). */
export const TRANSCRIPT_PAGE=50;

/**
 * One page of a conversation for the rep (B1): the newest `limit` messages older than the `before`
 * message, or the newest page without a cursor, oldest first. Order is created_at, then the order
 * they were written (rowid), as in conversationMessages; the cursor is a message id, so it stays put
 * when newer messages arrive. A cursor that isn't a message of this conversation answers an empty page.
 */
export function conversationMessagePage(conversationId:string,{before=null,limit=TRANSCRIPT_PAGE}:{before?:string|null;limit?:number}={}):TranscriptPage{
  const rows=all<TranscriptMessage>(`SELECT m.id,m.role,m.kind,m.content,m.created_at FROM messages m LEFT JOIN messages c ON c.id=? AND c.conversation_id=m.conversation_id
    WHERE m.conversation_id=? AND (? IS NULL OR m.created_at<c.created_at OR (m.created_at=c.created_at AND m.rowid<c.rowid))
    ORDER BY m.created_at DESC,m.rowid DESC LIMIT ?`,before,conversationId,before,limit+1);
  const page=rows.slice(0,limit).reverse();
  return {messages:page,next_before:rows.length>limit?page[0].id:null};
}
/** How many messages a conversation has (0 for an unknown one). */
export const conversationMessageCount=(conversationId:string)=>scalar<number>('SELECT count(*) FROM messages WHERE conversation_id=?',conversationId)??0;

/**
 * Appends a message to one of the customer's conversations; payload is stored as JSON (e.g. the
 * item pop-up's lines). Returns undefined, writing nothing, if the conversation isn't this customer's.
 * TODO(R-5): the content is stored as the customer typed it, PII included.
 */
export function addMessage(customerId:string,conversationId:string,{id=randomUUID(),role,kind='text',content,payload=null,at=nowIso()}:{id?:string;role:MessageRole;kind?:string;content:string;payload?:unknown;at?:string}){
  if(!conversation(customerId,conversationId))return undefined;
  run('INSERT INTO messages(id,conversation_id,role,kind,content,payload,created_at) VALUES(?,?,?,?,?,?,?)',id,conversationId,role,kind,content,payload===null?null:JSON.stringify(payload),at);
  return toMessage(one<MessageRow>(`${MESSAGE} WHERE m.id=?`,id)!);
}

/** The payload's fields, copied one by one and type-checked; undefined when any is missing or of the wrong type. */
function noticeFields(payload:unknown):Omit<QuoteNotice,'id'|'conversation_id'|'created_at'|'text'>|undefined{
  if(!payload||typeof payload!=='object')return undefined;
  const p=payload as Record<string,unknown>;
  const text=(key:string)=>typeof p[key]==='string';
  if(!text('quote_id')||!text('quote_number')||!Number.isInteger(p.revision)||typeof p.total!=='number'||!Number.isFinite(p.total)
    ||!text('valid_until')||!text('headline')||typeof p.attach_pdf!=='boolean'||!text('pdf_url'))return undefined;
  return {quote_id:p.quote_id as string,quote_number:p.quote_number as string,revision:p.revision as number,total:p.total as number,valid_until:p.valid_until as string,
    headline:p.headline as string,attach_pdf:p.attach_pdf as boolean,pdf_url:p.pdf_url as string};
}

/**
 * Customer-safe: the "quote is ready" messages Approve & send posted in the customer's chat (task
 * 3.7), oldest first, in all their conversations or only `conversationId`. history() leaves them
 * out (they have no query-log row), so the chat reads them here (task 5.1). Only a message about one
 * of the customer's own quotes is returned, with its payload rebuilt field by field; a malformed one
 * is skipped.
 */
export function quoteNotices(customerId:string,conversationId:string|null=null):QuoteNotice[]{
  return all<MessageRow>(`${MESSAGE} JOIN conversations c ON c.id=m.conversation_id JOIN quotes q ON q.id=json_extract(m.payload,'$.quote_id') AND q.customer_id=c.customer_id
    WHERE c.customer_id=? AND m.kind=? AND (? IS NULL OR m.conversation_id=?) ORDER BY m.created_at,m.rowid`,customerId,QUOTE_READY_KIND,conversationId,conversationId)
    .flatMap(row=>{
      const fields=noticeFields(toMessage(row).payload);
      return fields?[{id:row.id,conversation_id:row.conversation_id,created_at:row.created_at,text:row.content,...fields}]:[];
    });
}

export interface QueryLogEntry {customerId:string;conversationId:string;question:string;categories:Category[];handled:Category[];toolCalls:string[];rowCount:number;latency:number;outcome:string;answer:string;at?:string}

/**
 * Logs one chat question and answer (feeds history and analytics) in one of the customer's
 * conversations. Returns false, writing nothing, if the conversation isn't this customer's.
 * TODO(R-5): the question and answer are logged as typed, PII included.
 */
export function appendLog(entry:QueryLogEntry){
  if(!conversation(entry.customerId,entry.conversationId))return false;
  run('INSERT INTO query_logs(id,customer_id,conversation_id,question,categories,handled_categories,tool_calls,row_count,latency_ms,outcome,answer,timestamp) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    randomUUID(),entry.customerId,entry.conversationId,entry.question,JSON.stringify(entry.categories),JSON.stringify(entry.handled),JSON.stringify(entry.toolCalls),entry.rowCount,entry.latency,entry.outcome,entry.answer,entry.at??nowIso());
  return true;
}

/**
 * The customer's logged questions and answers in one conversation, oldest first. A turn whose reply
 * has a payload (a clarifying question's buttons, the item pop-up's cart) carries the reply's kind
 * and payload, so reopening the chat shows the same controls. Replies are paired with log entries in
 * order, by their text; a reply with no log entry (a system notice) is skipped.
 */
export function history(customerId:string,conversationId:string):ChatTurn[]{
  const replies=conversationMessages(customerId,conversationId).filter(m=>m.role==='assistant');
  let next=0;
  return all<Omit<ChatTurn,'categories'>&{categories:string}>('SELECT id,question,answer,categories,outcome,row_count,timestamp FROM query_logs WHERE customer_id=? AND conversation_id=? ORDER BY timestamp,rowid',customerId,conversationId)
    .map(row=>{
      const turn:ChatTurn={...row,categories:JSON.parse(row.categories) as Category[]};
      const found=replies.findIndex((m,i)=>i>=next&&m.content===row.answer);
      if(found<0)return turn;
      next=found+1;
      const {kind,payload}=replies[found];
      return payload===null?turn:{...turn,kind:kind as ChatTurn['kind'],payload:payload as ChatTurn['payload']};
    });
}
