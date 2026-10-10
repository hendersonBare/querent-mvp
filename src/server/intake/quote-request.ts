import 'server-only';
import {z} from 'zod';
import {FULFILLMENTS,type ChatMessage,type ItemPopupPayload,type QuoteRequestedPayload} from '@/domain';
import type {ChatTurn,QuoteRequestInput,QuoteRequestResult} from '@/lib/contracts';
import type {DistanceProvider} from '@/server/freight/distance';
import {applyQuoteRecovery,prepareFuelPrice,quoteRoadMiles} from '@/server/freight/quote';
import {draftLineFields} from '@/server/pricing';
import {priceLines} from '@/server/pricing/service';
import {
  addMessage,addQuoteActivity,appendLog,assignedRep,branches,catalogItem,conversation,conversationMessages,createQuote,customerAccount,customerQuote,inTransaction,
} from '@/server/repository';

// Request quote: the item pop-up's button (spec §3 step 4, §1 step 5; task 2.3). The customer
// confirms the matched lines, qty, pickup or delivery and the branch; this drafts the quote the
// rep reviews: ready_for_review, unread for the rep (the Quotes badge), every line priced by the
// pricing engine (task 1.1: Querent's suggested price and basis, with its "Why this price?" note),
// Activity entries, and a chat turn that says "Sent to Brandi for review.".
//
// This is the ONE module that reads cost which a customer route may call (boundary.test.ts names
// it). So it takes only what a customer may choose: the conversation, SKUs and qty from the open
// pop-up, pickup or delivery, and a branch. Any other field (a price, a cost) is refused. It
// returns only the new quote's id, number and status, and the chat turn: never a price, cost,
// margin, basis or explanation (its tests deep-scan the result for them).
//
// Freight (task 1.3) and upsells (task 1.6) are not stored on a draft: freight is computed from the
// quote's branch, ship-to and subtotal whenever it is read (only a rep override is stored), and
// the "Suggested by Querent" chips are computed per view (quoteUpsells). The draft carries their
// inputs: the branch, pickup or delivery, and the ship-to on file.
//
// Free delivery pricing (spec §4.2, §4.4, §4.5) is frozen at creation, in the same transaction:
// the modelled delivery cost of a delivery, and, when the quote carries recovery, the rate in force
// with its ramp step and each line's recovery (applyQuoteRecovery). The road miles are measured
// first, with the DistanceProvider, from the chosen branch to the account's ship-to (the quote's).
// None of it reaches the customer's answer.
//
// Lines the customer added from the pop-up's "Frequently bought together" (task E1) are accepted
// only when that pop-up offered them, and are stored as added_by 'suggestion' (the matched lines
// stay 'querent'), so the Team dashboard can count accepted suggestions.
//
// One pop-up makes at most one quote: the quote_requested message records the pop-up it came from,
// and pressing Request quote again (a double click, a retry, a second tab) replays that quote. The
// check and the writes are one synchronous transaction, so two requests can't both create one.

export const MAX_QTY=9999;
export const MAX_LINES=50;

/** A refusal, with the HTTP status the customer route answers with. */
export class QuoteRequestError extends Error{
  constructor(readonly status:404|409|422,message:string){super(message);this.name='QuoteRequestError';}
}

const QTY_PROBLEM=`Quantities must be whole numbers from 1 to ${MAX_QTY}.`;
const Line=z.strictObject({sku:z.string().trim().min(1).max(64),qty:z.number().int().min(1).max(MAX_QTY)});
const Body=z.strictObject({
  conversation_id:z.string().trim().min(1).max(100),
  fulfillment:z.enum(FULFILLMENTS),
  branch_id:z.string().trim().min(1).max(64),
  lines:z.array(Line).min(1).max(MAX_LINES),
});

/** The customer's fields, or a 422 that says what's wrong in their terms. */
function parse(body:unknown):QuoteRequestInput{
  const result=Body.safeParse(body);
  if(result.success)return result.data;
  const issue=result.error.issues[0];
  if(issue.code==='unrecognized_keys')throw new QuoteRequestError(422,`Request quote takes items, quantities, pickup or delivery and a branch only (not ${issue.keys.join(', ')}). Your rep sets the prices.`);
  const field=issue.path[0];
  if(field==='lines'&&issue.path.length===1)throw new QuoteRequestError(422,issue.code==='too_small'?'Your list is empty: keep at least one item.':`A quote request can have up to ${MAX_LINES} items.`);
  if(field==='lines'&&issue.path[2]==='qty')throw new QuoteRequestError(422,QTY_PROBLEM);
  if(field==='fulfillment')throw new QuoteRequestError(422,'Choose pickup or delivery.');
  if(field==='branch_id')throw new QuoteRequestError(422,'Choose a branch.');
  throw new QuoteRequestError(422,'That quote request is incomplete. Reload the chat and try again.');
}

const firstName=(name:string)=>name.trim().split(/\s+/)[0];
const plural=(n:number,one:string,many=`${one}s`)=>`${n} ${n===1?one:many}`;
const isPopup=(payload:unknown):payload is ItemPopupPayload=>typeof payload==='object'&&payload!==null&&Array.isArray((payload as ItemPopupPayload).lines);
const requestedFrom=(m:ChatMessage)=>m.kind==='quote_requested'?(m.payload as Partial<QuoteRequestedPayload>|null)?.popup_message_id:undefined;

/**
 * The request behind the pop-up at `popupIndex`: the customer message that started it (before any
 * clarifying replies that led to the pop-up), and how many clarifying replies there were.
 */
function requestBehind(messages:readonly ChatMessage[],popupIndex:number){
  let start=popupIndex,clarifications=0;
  for(let i=popupIndex-1;i>=0;i--){
    const m=messages[i];
    if(m.role!=='assistant')continue;
    if(m.kind!=='clarify')break;
    clarifications++;start=i;
  }
  return {text:messages.slice(0,start).findLast(m=>m.role==='customer')?.content??null,clarifications};
}

/** The chat turn of an earlier Request quote (a replay): the customer's Request quote line, then the confirmation. */
function earlierTurn(messages:readonly ChatMessage[],confirmation:ChatMessage):ChatTurn{
  const asked=messages.slice(0,messages.indexOf(confirmation)).findLast(m=>m.role==='customer');
  const payload=confirmation.payload as QuoteRequestedPayload;
  return {id:confirmation.id,question:asked?.content??'Request quote',answer:confirmation.content,categories:[],outcome:'answered',row_count:0,
    kind:'quote_requested',payload,timestamp:confirmation.created_at};
}

export interface QuoteRequester {customerId:string;contactId:string|null}

/**
 * Road miles from the chosen branch to the account's ship-to (where the quote will deliver), for a
 * delivery; null for will call, or when either end is unknown (the transaction refuses those).
 */
async function deliveryMiles(customerId:string,input:QuoteRequestInput,provider?:DistanceProvider){
  const shipTo=customerAccount(customerId)?.ship_to;
  if(input.fulfillment!=='delivery'||!shipTo||!branches().some(b=>b.id===input.branch_id))return null;
  // The ship-to createQuote will copy onto the quote (repository customerShipTo).
  const address=`${shipTo.address}, ${shipTo.city}, ${shipTo.state} ${shipTo.zip}`;
  return quoteRoadMiles({fulfillment:'delivery',branch_id:input.branch_id,ship_to_address:address,ship_to_lat:shipTo.lat,ship_to_lng:shipTo.lng},provider);
}
export interface QuoteRequestOptions {
  /** ISO timestamp for the quote and its Activity; defaults to the clock. (The chat turn always takes the clock.) */
  now?:string;
  /** The pricing day (YYYY-MM-DD); defaults to now's day. */
  on?:string;
  /** Road miles for the modelled delivery cost (spec §4.2); haversine × road factor by default. */
  provider?:DistanceProvider;
}

/**
 * Request quote for the signed-in customer. `body` is the untrusted request body
 * (QuoteRequestInput). Throws QuoteRequestError, writing nothing, when the conversation isn't the
 * customer's (404), there is no pop-up to quote or no rep to price it (409), or a field is invalid
 * (422): an unknown or repeated SKU, a SKU not on the pop-up, a qty outside 1 to 9999, an unknown
 * branch, delivery without a ship-to on file, or any field besides those four (a price, a cost).
 */
export async function requestQuote(who:QuoteRequester,body:unknown,{now=new Date().toISOString(),on=now.slice(0,10),provider}:QuoteRequestOptions={}):Promise<QuoteRequestResult>{
  const input=parse(body);
  const {customerId}=who;
  const miles=await deliveryMiles(customerId,input,provider);
  // The delivering branch's fuel price, fetched at most once a day, for the modelled cost (spec §4.3).
  if(branches().some(b=>b.id===input.branch_id))await prepareFuelPrice(input,{now});
  return inTransaction(()=>{
    if(!conversation(customerId,input.conversation_id))throw new QuoteRequestError(404,'Conversation not found.');
    const messages=conversationMessages(customerId,input.conversation_id);
    const popupIndex=messages.findLastIndex(m=>m.role==='assistant'&&m.kind==='item_popup');
    const popup=messages[popupIndex];
    if(!popup||!isPopup(popup.payload))throw new QuoteRequestError(409,'There is no item list to quote in this chat. Ask for the items first.');

    // The same pop-up again (a double click, a retry): the quote it already made.
    const done=messages.find(m=>requestedFrom(m)===popup.id);
    if(done){
      const payload=done.payload as QuoteRequestedPayload;
      const status=customerQuote(customerId,payload.quote_id)?.status??payload.status;
      return {quote:{id:payload.quote_id,quote_number:payload.quote_number,status},turn:earlierTurn(messages,done),replayed:true};
    }

    // The pop-up's lines, and the "Frequently bought together" items it offered (task E1): the only
    // SKUs a request may carry. Who added a line is decided here, never taken from the body.
    const offered=new Map(popup.payload.lines.map(l=>[l.sku.toUpperCase(),l]));
    const suggested=new Set((popup.payload.suggestions??[]).map(s=>s.sku.toUpperCase()));
    const seen=new Set<string>();
    const lines=input.lines.map(({sku,qty})=>{
      const item=catalogItem(sku);
      if(!item)throw new QuoteRequestError(422,`No item has SKU ${sku}.`);
      const listed=offered.get(item.sku.toUpperCase());
      const fromSuggestion=!listed&&suggested.has(item.sku.toUpperCase());
      if(!listed&&!fromSuggestion)throw new QuoteRequestError(422,`${item.sku} isn't on your list. Ask for it in the chat to add it.`);
      if(seen.has(item.id))throw new QuoteRequestError(422,`${item.sku} is on the request twice.`);
      seen.add(item.id);
      return {item,qty,requestedText:listed?.requested_text??null,addedBy:fromSuggestion?'suggestion' as const:'querent' as const};
    });
    const all=branches();
    const branch=all.find(b=>b.id===input.branch_id);
    if(!branch)throw new QuoteRequestError(422,`Choose a branch: ${all.map(b=>b.code).join(', ')}.`);
    const rep=assignedRep(customerId);
    if(!rep)throw new QuoteRequestError(409,'Your account has no assigned rep to price a quote yet. Call customer service.');
    const repFirst=firstName(rep.name);
    if(input.fulfillment==='delivery'&&!customerAccount(customerId)?.ship_to)
      throw new QuoteRequestError(422,`We have no delivery address on file for your account. Choose pickup, or ask ${repFirst} to add one.`);

    // Task 1.1: Querent's suggestion is each line's starting price, with its basis and explanation.
    const priced=priceLines({customerId,repId:rep.id,branchId:branch.id,lines:lines.map(l=>({itemId:l.item.id,qty:l.qty})),on});
    if(priced.length!==lines.length)throw new Error('Pricing skipped a line.');
    const request=requestBehind(messages,popupIndex);
    const q=createQuote({
      customerId,contactId:who.contactId,conversationId:input.conversation_id,requestText:request.text,fulfillment:input.fulfillment,branchId:branch.id,
      lines:lines.map((l,i)=>({itemId:l.item.id,qty:l.qty,...draftLineFields(priced[i]),requestedText:l.requestedText,addedBy:l.addedBy})),
      requestedAt:now,at:now,
    });
    applyQuoteRecovery(q,miles,{now,remodel:true});

    const where=input.fulfillment==='will_call'?`pickup at ${branch.code}`:`delivery from ${branch.code}`;
    const items=plural(lines.length,'item');
    const customerName=q.contact_name?firstName(q.contact_name):q.customer_name;
    addQuoteActivity(q.id,{actor:'customer',actorId:who.contactId,kind:'requested',at:now,message:`${customerName} requested a quote in Querent chat: ${items}, ${where}`});
    addQuoteActivity(q.id,{actor:'querent',kind:'matched',at:now,
      message:`Querent matched ${items}${request.clarifications?` after ${plural(request.clarifications,'clarifying question')}`:''}`});
    addQuoteActivity(q.id,{actor:'querent',kind:'drafted',at:now,message:`Draft quote built at Querent's suggested prices and sent to ${repFirst} for review`});

    // The chat turn: the customer's Request quote, then the confirmation (spec §3).
    const question=`Request quote: ${lines.map(l=>`${l.qty} × ${l.item.sku}`).join(', ')} (${where}).`;
    const payload:QuoteRequestedPayload={quote_id:q.id,quote_number:q.quote_number,status:q.status,popup_message_id:popup.id};
    const answer=`Sent to ${repFirst} for review. Your quote number is **${q.quote_number}**. ${repFirst} will price it and send it to you here in chat.`;
    // Chat writes take the clock, like every chat turn, so they always follow the pop-up. Logged like
    // any turn so history() shows it after a reload; the request_quote tool call marks it for
    // analytics, and no information category was asked about.
    addMessage(customerId,input.conversation_id,{role:'customer',content:question});
    const confirmation=addMessage(customerId,input.conversation_id,{role:'assistant',kind:'quote_requested',content:answer,payload})!;
    appendLog({customerId,conversationId:input.conversation_id,question,categories:[],handled:[],toolCalls:['request_quote'],rowCount:lines.length,latency:0,outcome:'answered',answer});
    const turn:ChatTurn={id:confirmation.id,question,answer,categories:[],outcome:'answered',row_count:lines.length,kind:'quote_requested',payload,timestamp:confirmation.created_at};
    return {quote:{id:q.id,quote_number:q.quote_number,status:q.status},turn,replayed:false};
  });
}
