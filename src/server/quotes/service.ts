import 'server-only';
import {DECLINE_REASONS,QUOTE_READY_KIND,type ChatMessage,type DeclineReason,type Quote,type QuoteRevision,type QuoteTransition} from '@/domain';
import {quoteFloors} from '@/server/floors/service';
import type {DistanceProvider} from '@/server/freight/distance';
import {formatUsd,type QuoteFreight} from '@/server/freight/engine';
import {freightForQuote,freightOverrideOf,overrideFreight} from '@/server/freight/quote';
import {
  accountSummary,addMessage,addQuoteActivity,addQuoteRevision,branch,conversation,createConversation,createQuote,inTransaction,latestConversation,markQuoteRead,quote,quoteByNumber,
  quoteRevision,quotes,rep,resetSampleQuote,saveQuoteTransition,supplier,
} from '@/server/repository';
import {QUOTE_MESSAGE_MAX,quoteReadyPayload,sanitizeChatText} from './announce';
import {QuoteActionError} from './errors';
import {assertEvent,daysUntil,effectiveStatus,expiresAt,isExpired,utcDay,validUntilOnSend} from './lifecycle';
import {cleanDeclineNote,DECLINE_REASON_LABELS,declineNoteProblem} from './response-rules';
import {sendBlockers,type SendBlocker} from './send-check';
import {buildSnapshot,cents,customerUnitPrice,letterheadOf,repContactOf,type SnapshotInput} from './snapshot';

// Quote lifecycle services (spec §5.4): the only code that changes a quote's status. Each one
// reads the quote, asks ./lifecycle whether the move is legal, and persists it with
// saveQuoteTransition, which writes only if the quote is still in the status the decision was
// made on. The transition, the revision and the Activity entry commit together or not at all.
//
// Refusals throw QuoteActionError (see ./errors for the codes and HTTP statuses). Times are ISO
// strings; `now` defaults to the clock and is a parameter so tests and the E2E seed can pin it.

const clock=()=>new Date().toISOString();
const firstName=(name:string)=>name.trim().split(/\s+/)[0];
/** How Activity names the customer: the contact's first name ("Dana"), or the company. */
const customerWho=(q:Quote)=>q.contact_name?firstName(q.contact_name):q.customer_name;

/** The quote by id or number (Q-24817). */
function load(quoteIdOrNumber:string):Quote{
  const q=quote(quoteIdOrNumber)??quoteByNumber(quoteIdOrNumber);
  if(!q)throw new QuoteActionError('not_found',`No quote ${quoteIdOrNumber}.`);
  return q;
}

function repName(repId:string){
  const r=rep(repId);
  if(!r)throw new QuoteActionError('invalid_input',`Unknown rep ${repId}.`);
  return r.name;
}

/**
 * What the customer PDF prints around the quote, as it stands at send: the account's payment
 * terms, the quote's rep with their contact, and the branch letterhead. Frozen into the revision
 * so its PDF never changes when those records do (spec §5.4, task 4.1).
 */
function printedFacts(q:Quote):Pick<SnapshotInput,'terms'|'repContact'|'letterhead'>{
  const quoteRep=rep(q.rep_id),quoteBranch=branch(q.branch_id);
  return {terms:accountSummary(q.customer_id)?.terms??null,repContact:quoteRep?repContactOf(quoteRep):null,letterhead:quoteBranch?letterheadOf(supplier(),quoteBranch):null};
}

/** Saves the move, guarded on the status `q` was read in. Throws conflict (rolling back the transaction) if it changed. */
function persist(q:Quote,t:Omit<QuoteTransition,'from'>){
  if(!saveQuoteTransition(q.id,{...t,from:q.status}))throw new QuoteActionError('conflict',`${q.quote_number} changed while this was being saved. Reload it and try again.`);
}

// ---- Send (rep: Approve & send + Confirm) ----

export interface SendCheck {
  quote_id:string;quote_number:string;status:Quote['status'];
  /** The revision a send would store. */
  revision:number;
  can_send:boolean;
  /** Why the status doesn't allow a send (e.g. already sent), or null. */
  status_problem:string|null;
  /** Why the quote is unfinished (spec §4). */
  blockers:SendBlocker[];
  /** Lines below the rep's floor: a warning only, shown as a count in Confirm send. */
  below_floor_count:number;
  freight:QuoteFreight;
  /** Priced lines only, at the customer-facing unit price (with freight recovery), to the cent, as the snapshot will total them. */
  subtotal:number;
  /** subtotal + freight, or null while freight is call for freight. */
  total:number|null;
}

const pricedSubtotal=(q:Quote)=>cents(q.lines.reduce((sum,l)=>sum+(l.unit_price!==null&&Number.isFinite(l.unit_price)?cents(l.qty*customerUnitPrice(l.unit_price,l.freight_recovery)):0),0));

/** What the Approve & send dialog needs: can it go, and if not, why; plus the floor warnings and the total. */
export async function sendCheck(quoteIdOrNumber:string,{provider,now=clock()}:{provider?:DistanceProvider;now?:string}={}):Promise<SendCheck>{
  const q=load(quoteIdOrNumber);
  const freight=await freightForQuote(q,{provider});
  let status_problem:string|null=null;
  try{assertEvent(q,'send');}catch(error){if(!(error instanceof QuoteActionError))throw error;status_problem=error.message;}
  const blockers=sendBlockers(q,freight,{today:utcDay(now)});
  const subtotal=pricedSubtotal(q);
  return {quote_id:q.id,quote_number:q.quote_number,status:q.status,revision:q.revision+1,can_send:!status_problem&&!blockers.length,status_problem,blockers,
    below_floor_count:quoteFloors(q)?.belowFloorCount??0,freight,subtotal,total:typeof freight.amount==='number'?cents(subtotal+freight.amount):null};
}

export interface SendOptions {
  /** The rep sending: stored as sent_by and named in Activity. */
  repId:string;
  /**
   * The editable chat message from the send dialog. Stored as plain text (sanitizeChatText), in
   * the chat and on the revision; at most QUOTE_MESSAGE_MAX characters once sanitized. Empty: none.
   */
  message?:string|null;
  /** Attach PDF, on by default (spec §4): the customer's preview modal offers Download. */
  attachPdf?:boolean;
  /**
   * What the rep confirmed in Confirm send: the revision it named and the total it showed. A send
   * that would store anything else is refused (conflict): the quote changed after they looked.
   */
  expected?:{revision?:number;total?:number};
  now?:string;
  /** Freight's distance provider (task 1.3); haversine by default. */
  provider?:DistanceProvider;
}

/**
 * Where the "quote is ready" message goes (task 3.7): the chat the customer asked for the quote
 * in ("Quote Q-24817 will arrive here in chat"); for a quote with no chat of its own (a duplicate,
 * one from before chat), the customer's most recently active conversation; failing both, a new
 * conversation for the quote's contact.
 */
function quoteChat(q:Quote,at:string):string{
  if(q.conversation_id&&conversation(q.customer_id,q.conversation_id))return q.conversation_id;
  return latestConversation(q.customer_id)?.id??createConversation({customerId:q.customer_id,contactId:q.contact_id,at}).id;
}

/**
 * Approve & send (spec §5.4): ready_for_review or changes_requested --> sent. Stores rev n+1 with
 * a frozen snapshot, sets valid_until (the rep's expiration date, else the send's day + valid_days), flags the quote unread for
 * the customer, posts it in the customer's Querent chat (spec §3: a `quote_ready` message with
 * the rep's message, "Quote Q-… is ready: $X, valid until …" and the revision's PDF link), and
 * logs it, all in one transaction. Refuses an illegal status (a double send), an unfinished quote
 * (send_blocked, with the blockers), a message over the limit (invalid_input), and a quote that
 * isn't what the rep confirmed (conflict): a draft edited while freight was being priced, or a
 * revision or total other than `expected`.
 */
export async function sendQuote(quoteIdOrNumber:string,{repId,message=null,attachPdf=true,expected={},now=clock(),provider}:SendOptions):Promise<{quote:Quote;revision:QuoteRevision;message:ChatMessage}>{
  const text=sanitizeChatText(message);
  if(text.length>QUOTE_MESSAGE_MAX)throw new QuoteActionError('invalid_input',`Keep the message to ${QUOTE_MESSAGE_MAX.toLocaleString('en-US')} characters (it has ${text.length.toLocaleString('en-US')}).`);
  const draft=load(quoteIdOrNumber);
  assertEvent(draft,'send');
  const sender=repName(repId);
  const freight=await freightForQuote(draft,{provider});
  return inTransaction(()=>{
    const q=load(draft.id);
    assertEvent(q,'send');
    if(q.updated_at!==draft.updated_at)throw new QuoteActionError('conflict',`${q.quote_number} was edited while it was being sent. Review it and send again.`);
    const blockers=sendBlockers(q,freight,{today:utcDay(now)});
    if(blockers.length)throw new QuoteActionError('send_blocked',`Can't send ${q.quote_number} yet. ${blockers.map(b=>b.message).join(' ')}`,{blockers});
    const revision=q.revision+1,validUntil=validUntilOnSend(q,now);
    const snapshot=buildSnapshot(q,{revision,sentAt:now,validUntil,validDays:daysUntil(now,validUntil),freight:typeof freight.amount==='number'?freight.amount:Number.NaN,freightMiles:freight.computed.miles,...printedFacts(q)});
    if(expected.revision!==undefined&&expected.revision!==revision)
      throw new QuoteActionError('conflict',`${q.quote_number} would go out as rev ${revision}, not the rev ${expected.revision} you confirmed. Review it and send again.`);
    if(expected.total!==undefined&&cents(expected.total)!==snapshot.total)
      throw new QuoteActionError('conflict',`${q.quote_number} now totals ${formatUsd(snapshot.total)}, not the ${formatUsd(cents(expected.total))} you confirmed. Review it and send again.`);
    persist(q,{to:'sent',at:now,revision,sentAt:now,validUntil,unreadForRep:false,unreadForCustomer:true});
    const stored=addQuoteRevision(q.id,{revision,sentBy:repId,message:text||null,attachPdf,total:snapshot.total,snapshot,sentAt:now});
    const payload=quoteReadyPayload({quoteId:q.id,quoteNumber:q.quote_number,revision,total:snapshot.total,validUntil,sentAt:now,attachPdf});
    const posted=addMessage(q.customer_id,quoteChat(q,now),{role:'system',kind:QUOTE_READY_KIND,content:text,payload,at:now});
    if(!posted)throw new Error(`${q.quote_number}: the quote's chat couldn't be written.`);
    addQuoteActivity(q.id,{actor:'rep',actorId:repId,kind:'sent',at:now,message:`${sender} sent ${q.quote_number} rev ${revision} to ${customerWho(q)} (${formatUsd(snapshot.total)})`});
    return {quote:load(q.id),revision:stored,message:posted};
  });
}

// ---- Expiry (system: now > valid_until) ----

/** Stores the expiry, dated when it happened (00:00Z after valid_until), not when it was noticed. */
function expireLoaded(q:Quote){
  const at=expiresAt(q.valid_until!);
  persist(q,{to:'expired',at});
  addQuoteActivity(q.id,{actor:'system',kind:'expired',at,message:`${q.quote_number} rev ${q.revision} expired without a response`});
}

/** sent --> expired, once now > valid_until. Refuses any other status, and a quote still within valid_until. */
export function expireQuote(quoteIdOrNumber:string,{now=clock()}:{now?:string}={}):Quote{
  return inTransaction(()=>{
    const q=load(quoteIdOrNumber);
    assertEvent(q,'expire');
    if(!isExpired(q.valid_until,now))throw new QuoteActionError('illegal_transition',`${q.quote_number} is valid until ${q.valid_until}; it can't expire before then.`);
    expireLoaded(q);
    return load(q.id);
  });
}

/**
 * Stores the expiry of every sent quote past valid_until (optionally one customer's). Run it
 * before reading statuses for a list, a badge or a win rate; until then effectiveStatus() shows
 * them as expired. Returns the quote numbers it expired.
 */
export function expireOverdueQuotes({now=clock(),customerId=null}:{now?:string;customerId?:string|null}={}):string[]{
  const due=quotes({customerId,statuses:['sent']}).filter(row=>isExpired(row.valid_until,now));
  return inTransaction(()=>due.flatMap(row=>{
    const q=quote(row.id);
    if(!q||q.status!=='sent'||!isExpired(q.valid_until,now))return [];
    expireLoaded(q);
    return [q.quote_number];
  }));
}

// ---- Customer responses (PDF preview action bar + Confirm) ----

/**
 * Loads a quote for a customer action and checks it can be taken: the customer's own quote
 * (anyone else's reads as not found), not expired (spec §3: the action bar is disabled; a sent
 * quote found past valid_until has its expiry stored first), a legal move, and the revision the
 * customer is looking at is still the latest (a second tab can't accept a superseded revision).
 */
function forCustomerAction(customerId:string,quoteIdOrNumber:string,event:'accept'|'request_changes'|'decline',revision:number,now:string){
  const q=load(quoteIdOrNumber);
  if(q.customer_id!==customerId)throw new QuoteActionError('not_found',`No quote ${quoteIdOrNumber}.`);
  if(effectiveStatus(q,now)==='expired'){
    if(q.status==='sent')inTransaction(()=>expireLoaded(q));
    throw new QuoteActionError('expired',`${q.quote_number} expired: it was valid until ${q.valid_until}. Ask your rep for a new quote.`);
  }
  assertEvent(q,event);
  if(revision!==q.revision)throw new QuoteActionError('conflict',`${q.quote_number} rev ${revision} is out of date: rev ${q.revision} is the latest. Review it first.`);
  return q;
}

/** Customer text from a request body: trimmed, and '' when missing or not a string, so it fails validation instead of crashing. */
const text=(value:unknown)=>typeof value==='string'?value.trim():'';

/** A day (2026-09-24) or a date-time (2026-09-24T15:00, optionally with seconds and a zone). */
const TIME=/^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
function isTime(value:string){
  const match=TIME.exec(value);
  if(!match||Number.isNaN(Date.parse(value)))return false;
  // Date.parse rolls Feb 30 over to Mar 2; the day must survive a round trip.
  return new Date(`${match[1]}T00:00:00.000Z`).toISOString().slice(0,10)===match[1];
}

export interface AcceptInput {
  /** The revision the customer is accepting: the one named in the Confirm dialog. */
  revision:number;
  /** The pickup or delivery time (ISO day or date-time). Branch and pickup/delivery stay as the rep approved. */
  fulfillmentTime:string;
  customerPo:string;
  now?:string;
}

/**
 * Accept (spec §3, §5.4): sent --> accepted, with the pickup or delivery time and a PO. There is
 * no way to change branch or pickup/delivery here: that needs Request changes. Flags the rep
 * (badge) and logs it; acceptance ends the MVP flow.
 */
export function acceptQuote(customerId:string,quoteIdOrNumber:string,{revision,fulfillmentTime,customerPo,now=clock()}:AcceptInput):Quote{
  const q=forCustomerAction(customerId,quoteIdOrNumber,'accept',revision,now);
  const time=text(fulfillmentTime),po=text(customerPo);
  if(!isTime(time))throw new QuoteActionError('invalid_input',`Choose a ${q.fulfillment==='delivery'?'delivery':'pickup'} time.`);
  if(!po)throw new QuoteActionError('invalid_input','Enter a PO number.');
  const total=quoteRevision(q.id,q.revision)?.total;
  return inTransaction(()=>{
    persist(q,{to:'accepted',at:now,respondedAt:now,fulfillmentTime:time,customerPo:po,unreadForRep:true,unreadForCustomer:false});
    const how=q.fulfillment==='delivery'?`delivery from ${q.branch_code}`:`pickup at ${q.branch_code}`;
    addQuoteActivity(q.id,{actor:'customer',actorId:q.contact_id,kind:'accepted',at:now,
      message:`${customerWho(q)} accepted ${q.quote_number} rev ${q.revision}${total===undefined?'':` (${formatUsd(total)})`} with PO ${po}, ${how}`});
    return load(q.id);
  });
}

/** Request changes (spec §3, §5.4): sent --> changes_requested, with a required note. Flags the rep and logs the note. */
export function requestChanges(customerId:string,quoteIdOrNumber:string,{revision,note,now=clock()}:{revision:number;note:string;now?:string}):Quote{
  const q=forCustomerAction(customerId,quoteIdOrNumber,'request_changes',revision,now);
  const body=text(note);
  if(!body)throw new QuoteActionError('invalid_input','Say what should change: a note is required.');
  return inTransaction(()=>{
    persist(q,{to:'changes_requested',at:now,respondedAt:now,changeRequestNote:body,unreadForRep:true,unreadForCustomer:false});
    addQuoteActivity(q.id,{actor:'customer',actorId:q.contact_id,kind:'changes_requested',at:now,message:`${customerWho(q)} requested changes to ${q.quote_number} rev ${q.revision}: "${body}"`});
    return load(q.id);
  });
}

export interface DeclineInput {
  /** The revision the customer is declining: the latest one sent. */
  revision:number;
  /** One of the five reasons, or null: Decline works with nothing chosen (decision 14). */
  reason:DeclineReason|null;
  /** The Other text. Kept only with reason 'other': plain text, trimmed, at most 250 characters (OA-28). */
  note?:string|null;
  now?:string;
}

/**
 * Decline (v3 spec §2.1, decisions 13 to 15): sent --> declined, final. Stores when and why, flags
 * the rep (badge) and logs the reason (and the Other note) in Activity, all in one transaction. The
 * reason and note are the rep's only: nothing customer-facing reads them.
 */
export function declineQuote(customerId:string,quoteIdOrNumber:string,{revision,reason,note=null,now=clock()}:DeclineInput):Quote{
  const q=forCustomerAction(customerId,quoteIdOrNumber,'decline',revision,now);
  if(reason!==null&&!DECLINE_REASONS.includes(reason))throw new QuoteActionError('invalid_input','Choose one of the reasons, or none.');
  const kept=reason==='other'?cleanDeclineNote(note)||null:null;
  const problem=kept&&declineNoteProblem(kept);
  if(problem)throw new QuoteActionError('invalid_input',problem);
  return inTransaction(()=>{
    persist(q,{to:'declined',at:now,respondedAt:now,declinedAt:now,declineReason:reason,declineNote:kept,unreadForRep:true,unreadForCustomer:false});
    const why=reason===null?' (no reason given)':`: ${DECLINE_REASON_LABELS[reason]}${kept?`: "${kept}"`:''}`;
    addQuoteActivity(q.id,{actor:'customer',actorId:q.contact_id,kind:'declined',at:now,message:`${customerWho(q)} declined ${q.quote_number} rev ${q.revision}${why}`});
    return load(q.id);
  });
}

// ---- Duplicate and Reset sample (the rep's ⋯ menu) ----

/**
 * Duplicate quote (spec §5.4): a new ready_for_review quote from any quote, typically an expired
 * one. It copies the draft as the rep sees it: lines with their prices, bases and Querent's
 * notes, pickup or delivery, branch, ship-to, requested day, valid days, the printed note and any
 * freight override. It starts at rev 0 with no send, response or PO, and isn't the sample. The
 * rep made it, so it isn't unread for them. Both quotes log it.
 */
export function duplicateQuote(quoteIdOrNumber:string,{repId,now=clock()}:{repId:string;now?:string}):Quote{
  return inTransaction(()=>{
    const src=load(quoteIdOrNumber);
    const who=repName(repId);
    const copy=createQuote({customerId:src.customer_id,contactId:src.contact_id,conversationId:src.conversation_id,requestText:src.request_text,
      fulfillment:src.fulfillment,branchId:src.branch_id,requestedDate:src.requested_date,
      shipTo:src.ship_to_address===null?null:{address:src.ship_to_address,lat:src.ship_to_lat,lng:src.ship_to_lng},
      validDays:src.valid_days,customerNote:src.customer_note,duplicatedFrom:src.id,at:now,
      lines:src.lines.map(l=>({itemId:l.item_id,qty:l.qty,unitPrice:l.unit_price,priceBasis:l.price_basis,suggestedPrice:l.suggested_price,suggestedBasis:l.suggested_basis,
        customerPrice:l.customer_price,explanation:l.explanation,requestedText:l.requested_text,matchScore:l.match_score,addedBy:l.added_by}))});
    markQuoteRead(copy.id,'rep');
    const message=`${who} duplicated ${src.quote_number} as ${copy.quote_number}`;
    addQuoteActivity(copy.id,{actor:'rep',actorId:repId,kind:'duplicated',at:now,message});
    addQuoteActivity(src.id,{actor:'rep',actorId:repId,kind:'duplicated',at:now,message});
    const override=freightOverrideOf(src);
    if(override)overrideFreight(copy.id,repId,override,now);
    return load(copy.id);
  });
}

/**
 * Reset sample quote: rebuilds Q-24817 exactly as seeded (ready_for_review, rev 0, no revisions,
 * the seeded lines and Activity, unread for the rep), whatever the demo did to it. Its duplicates
 * are kept, no longer linked to it.
 */
export function resetSample():Quote{
  return resetSampleQuote();
}
