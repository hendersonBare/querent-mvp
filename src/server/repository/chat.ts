import 'server-only';
import {randomUUID} from 'node:crypto';
import type {ChatMessage,Conversation,MessageRole} from '@/domain';
import type {Category,ChatTurn} from '@/lib/contracts';
import {all,nowIso,one,run} from './sql';

// Customer chat: conversations, messages and the query log behind analytics. Reads are scoped
// to the customer, so one customer can never load another's conversation.

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

/**
 * Appends a message to one of the customer's conversations; payload is stored as JSON (e.g. the
 * item pop-up's lines). Returns undefined, writing nothing, if the conversation isn't this customer's.
 */
export function addMessage(customerId:string,conversationId:string,{id=randomUUID(),role,kind='text',content,payload=null,at=nowIso()}:{id?:string;role:MessageRole;kind?:string;content:string;payload?:unknown;at?:string}){
  if(!conversation(customerId,conversationId))return undefined;
  run('INSERT INTO messages(id,conversation_id,role,kind,content,payload,created_at) VALUES(?,?,?,?,?,?,?)',id,conversationId,role,kind,content,payload===null?null:JSON.stringify(payload),at);
  return toMessage(one<MessageRow>(`${MESSAGE} WHERE m.id=?`,id)!);
}

export interface QueryLogEntry {customerId:string;conversationId:string;question:string;categories:Category[];handled:Category[];toolCalls:string[];rowCount:number;latency:number;outcome:string;answer:string;at?:string}

/**
 * Logs one chat question and answer (feeds history and analytics) in one of the customer's
 * conversations. Returns false, writing nothing, if the conversation isn't this customer's.
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
  return all<Omit<ChatTurn,'sql'|'categories'>&{categories:string}>('SELECT id,question,answer,categories,outcome,row_count,timestamp FROM query_logs WHERE customer_id=? AND conversation_id=? ORDER BY timestamp,rowid',customerId,conversationId)
    .map(row=>{
      const turn:ChatTurn={...row,sql:null,categories:JSON.parse(row.categories) as Category[]};
      const found=replies.findIndex((m,i)=>i>=next&&m.content===row.answer);
      if(found<0)return turn;
      next=found+1;
      const {kind,payload}=replies[found];
      return payload===null?turn:{...turn,kind:kind as ChatTurn['kind'],payload:payload as ChatTurn['payload']};
    });
}
