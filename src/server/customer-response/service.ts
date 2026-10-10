import 'server-only';
import {z} from 'zod';
import {DECLINE_REASONS,type CustomerQuotePreview} from '@/domain';
import {customerQuotePreview} from '@/server/customer/quote-preview';
import {checkFulfillmentTime,cleanDeclineNote,cleanNote,cleanPo,DECLINE_NOTE_MAX,declineNoteProblem,NOTE_MAX,noteProblem,PO_MAX,poProblem,QuoteActionError} from '@/server/quotes';
import {acceptQuote,declineQuote,requestChanges} from '@/server/quotes/service';
import {IdempotencyStore} from '@/server/rep/idempotency';

export {parseIdempotencyKey} from '@/server/rep/idempotency';

// The customer's answer to a sent quote: the PDF preview modal's Accept and Request changes, after
// their Confirm dialog (spec §3, §5.4; task 5.2), and Decline after its reasons dialog (v3 spec §2.1,
// task A1). The transitions are task 1.5's acceptQuote and requestChanges and A1's declineQuote
// (status, the rep's unread badge, Activity); this layer is what a customer route may call.
//
// This is the SECOND module that reads cost which a customer route may call (boundary.test.ts names
// it, next to the quote intake), because the quote service it calls loads the internal quote. So:
//   - it takes only what the customer may send, for the session customer's own quote: the revision
//     they saw, a pickup or delivery day and time and a PO (Accept), a note (Request changes), or an
//     optional reason and Other note (Decline).
//     The body schema is strict, so branch, pickup or delivery, prices or anything else are
//     refused: Accept can't change what the rep approved;
//   - it answers with the customer-safe preview only (customerQuotePreview), never the Quote the
//     quote service returns. Its tests and the routes' tests deep-scan every answer for cost, and
//     Decline's for the reason and note too: they are the rep's only (decision 14).
//
// On top of 1.5's checks it enforces what the service leaves to the caller: the time rules
// (response-rules: a weekday slot at least an hour ahead, never in the past), the PO and note
// limits, plain text for both, and one answer per click (an Idempotency-Key replays a repeat).
// Another customer's quote and an unknown one are the same 404, whatever the body.

const clock=()=>new Date().toISOString();
const firstName=(name:string)=>name.trim().split(/\s+/)[0];
const monthDay=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});

export interface CustomerResponse {
  /** The quote as the preview modal shows it after the answer. */
  quote:CustomerQuotePreview;
  /** A repeat of an earlier request with the same Idempotency-Key: nothing was done again. */
  replayed:boolean;
}

export interface CustomerResponseOptions {
  /** The request's Idempotency-Key: a repeat within ten minutes gets the first answer back. null: no replay (the status guard still refuses a second answer). */
  idempotencyKey?:string|null;
  now?:string;
}

/** The signed-in customer, from the session only. */
export interface Responder {customerId:string}

/** Answers already given, by customer, quote, action and key (see rep/idempotency). */
const answers=new IdempotencyStore();

const invalid=(message:string)=>new QuoteActionError('invalid_input',message);
const notFound=()=>new QuoteActionError('not_found','Quote not found.');

const Revision=z.number().int().min(1).max(999_999);
const AcceptBody=z.strictObject({revision:Revision,day:z.string().max(40),time:z.string().max(40),po:z.string().max(PO_MAX*10)});
const ChangesBody=z.strictObject({revision:Revision,note:z.string().max(NOTE_MAX*10)});
/** v3 spec §5: {reason?, note?}. The revision is optional so a bare decline works; the modal always sends it (A1 assumption). */
const DeclineBody=z.strictObject({revision:Revision.optional(),reason:z.enum(DECLINE_REASONS).nullish(),note:z.string().max(DECLINE_NOTE_MAX*10).nullish()});
/** Keys that would change what the rep approved. */
const LOCKED=/branch|fulfil|pickup|deliver|ship|will_?call|address/i;

/** The customer's own quote as the preview shows it, or the 404 every other id gets. */
function ownQuote(who:Responder,quoteIdOrNumber:string,now:string){
  const preview=customerQuotePreview(who.customerId,quoteIdOrNumber,undefined,now);
  if(!preview)throw notFound();
  return preview;
}

const repOf=(p:CustomerQuotePreview)=>p.rep?firstName(p.rep.name):'your rep';
const fulfillmentOf=(p:CustomerQuotePreview)=>p.shown?.fulfillment??'will_call';
const capitalized=(text:string)=>text.charAt(0).toUpperCase()+text.slice(1);

/**
 * The quote is waiting for this customer's answer on `revision`: sent, not expired, and
 * `revision` is the latest (a second tab can't answer a superseded one). acceptQuote and
 * requestChanges check the same again as they write; this says it in the customer's words first.
 */
function assertOpen(p:CustomerQuotePreview,revision:number){
  const n=p.quote_number,rep=repOf(p);
  if(p.status==='expired')
    throw new QuoteActionError('expired',`${n} expired: it was valid until ${p.shown?.valid_until?monthDay.format(new Date(`${p.shown.valid_until}T00:00:00.000Z`)):'its end date'}. Ask ${rep} for a new quote.`);
  if(p.status==='accepted')throw new QuoteActionError('illegal_transition',`You already accepted ${n}.`);
  if(p.status==='declined')throw new QuoteActionError('illegal_transition',`You already declined ${n}.`);
  if(p.status==='changes_requested')throw new QuoteActionError('illegal_transition',`You already asked for changes to ${n}. ${capitalized(rep)} is revising it.`);
  if(p.status!=='sent'||!p.shown)throw new QuoteActionError('illegal_transition',`${n} hasn’t been sent to you yet.`);
  if(revision!==p.latest_revision)throw new QuoteActionError('conflict',`${n} rev ${revision} is out of date: rev ${p.latest_revision} is the latest. Review it first.`);
}

function parseAccept(body:unknown,p:CustomerQuotePreview){
  const what=fulfillmentOf(p)==='delivery'?'delivery':'pickup';
  const result=AcceptBody.safeParse(body);
  if(result.success)return result.data;
  const issue=result.error.issues[0];
  if(issue.code==='unrecognized_keys'){
    if(issue.keys.some(key=>LOCKED.test(key)))throw invalid(`Branch and ${what} are locked to what ${capitalized(repOf(p))} approved. To change them, use Request changes.`);
    throw invalid(`Accept takes the revision, a day, a time and your PO only (not ${issue.keys.join(', ')}).`);
  }
  switch(issue.path[0]){
    case 'revision':throw invalid('Accept needs the revision you are looking at. Reload the quote and try again.');
    case 'day':throw invalid(`Choose a ${what} day.`);
    case 'time':throw invalid(`Choose a ${what} time.`);
    case 'po':throw invalid(issue.code==='too_big'?`Keep the PO number to ${PO_MAX} characters.`:'Enter your PO number.');
    default:throw invalid(`Choose a ${what} day and time, and enter your PO number.`);
  }
}

function parseChanges(body:unknown){
  const result=ChangesBody.safeParse(body);
  if(result.success)return result.data;
  const issue=result.error.issues[0];
  if(issue.code==='unrecognized_keys')throw invalid(`Request changes takes the revision and your note only (not ${issue.keys.join(', ')}). Say what should change in the note.`);
  if(issue.path[0]==='revision')throw invalid('Request changes needs the revision you are looking at. Reload the quote and try again.');
  if(issue.path[0]==='note'&&issue.code==='too_big')throw invalid(`Keep the note to ${NOTE_MAX.toLocaleString('en-US')} characters.`);
  throw invalid('Say what should change: a note is required.');
}

/**
 * Accept (spec §3): the customer's latest sent revision, with a pickup or delivery time and a PO.
 * Branch and pickup or delivery stay as the rep approved them. `body` is the untrusted request body:
 * {revision, day: YYYY-MM-DD, time: HH:MM (Mountain), po}. Throws QuoteActionError: not_found (404)
 * for another customer's or an unknown quote; invalid_input (400) for any other field (branch,
 * fulfillment, prices), a time in the past, too soon, on a weekend or outside the slots, or a
 * missing or overlong PO; expired, illegal_transition (already answered, never sent) and conflict
 * (an older revision) (409).
 */
export function acceptCustomerQuote(who:Responder,quoteIdOrNumber:string,body:unknown,{idempotencyKey=null,now=clock()}:CustomerResponseOptions={}):CustomerResponse{
  const before=ownQuote(who,quoteIdOrNumber,now);
  const input=parseAccept(body,before);
  const {value,replayed}=answers.once(`${who.customerId}:${before.id}:accept`,idempotencyKey,()=>{
    const p=ownQuote(who,before.id,now);
    assertOpen(p,input.revision);
    const time=checkFulfillmentTime({day:input.day,time:input.time,fulfillment:fulfillmentOf(p),now});
    if('problem' in time)throw invalid(time.problem);
    const po=cleanPo(input.po),problem=poProblem(po);
    if(problem)throw invalid(problem);
    acceptQuote(who.customerId,p.id,{revision:input.revision,fulfillmentTime:time.at,customerPo:po,now});
    return ownQuote(who,p.id,now);
  });
  return {quote:value,replayed};
}

/**
 * Request changes (spec §3): the customer's note on their latest sent revision. `body` is
 * {revision, note}; the note is required, plain text, at most 1,000 characters. The quote goes back
 * to the rep to edit (changes_requested). Throws QuoteActionError as acceptCustomerQuote does.
 */
export function requestCustomerChanges(who:Responder,quoteIdOrNumber:string,body:unknown,{idempotencyKey=null,now=clock()}:CustomerResponseOptions={}):CustomerResponse{
  const before=ownQuote(who,quoteIdOrNumber,now);
  const input=parseChanges(body);
  const {value,replayed}=answers.once(`${who.customerId}:${before.id}:request_changes`,idempotencyKey,()=>{
    const p=ownQuote(who,before.id,now);
    assertOpen(p,input.revision);
    const note=cleanNote(input.note),problem=noteProblem(note);
    if(problem)throw invalid(problem);
    requestChanges(who.customerId,p.id,{revision:input.revision,note,now});
    return ownQuote(who,p.id,now);
  });
  return {quote:value,replayed};
}

function parseDecline(body:unknown){
  const result=DeclineBody.safeParse(body);
  if(result.success)return result.data;
  const issue=result.error.issues[0];
  if(issue.code==='unrecognized_keys')throw invalid(`Decline takes the revision, a reason and a note only (not ${issue.keys.join(', ')}).`);
  switch(issue.path[0]){
    case 'revision':throw invalid('Decline needs the revision you are looking at. Reload the quote and try again.');
    case 'reason':throw invalid('Choose one of the reasons, or none.');
    case 'note':throw invalid(issue.code==='too_big'?`Keep the note to ${DECLINE_NOTE_MAX} characters.`:'The note must be text.');
    default:throw invalid('Decline takes the revision, a reason and a note only.');
  }
}

/**
 * Decline (v3 spec §2.1, decisions 13 to 15): the customer's latest sent revision, final. `body` is
 * {revision?, reason?, note?}: every field optional, since Decline records the decline with no
 * reason chosen; the note counts only with reason 'other' (plain text, at most 250 characters). The
 * answer is the customer-safe preview, whose response says only {kind:'declined', revision}: the
 * reason and note are the rep's. Throws QuoteActionError as acceptCustomerQuote does.
 */
export function declineCustomerQuote(who:Responder,quoteIdOrNumber:string,body:unknown,{idempotencyKey=null,now=clock()}:CustomerResponseOptions={}):CustomerResponse{
  const before=ownQuote(who,quoteIdOrNumber,now);
  const input=parseDecline(body);
  const {value,replayed}=answers.once(`${who.customerId}:${before.id}:decline`,idempotencyKey,()=>{
    const p=ownQuote(who,before.id,now);
    const revision=input.revision??p.latest_revision;
    assertOpen(p,revision);
    const reason=input.reason??null;
    const note=reason==='other'?cleanDeclineNote(input.note):'',problem=declineNoteProblem(note);
    if(problem)throw invalid(problem);
    declineQuote(who.customerId,p.id,{revision,reason,note:note||null,now});
    return ownQuote(who,p.id,now);
  });
  return {quote:value,replayed};
}
