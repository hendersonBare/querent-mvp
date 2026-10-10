import 'server-only';
import type {
  ActivityActor,CustomerQuoteRevision,CustomerQuoteSummary,CustomerQuoteView,LineSource,NewQuote,NewQuoteLine,NewQuoteRevision,Quote,QuoteActivity,QuoteFulfillmentPatch,
  QuoteHeader,QuoteLine,QuoteLinePatch,QuoteListRow,QuoteNote,QuoteRevision,QuoteSnapshot,QuoteStatus,QuoteTermsPatch,QuoteTransition,Rep,
} from '@/domain';
import {db,seedAnchor} from '../db';
import {SAMPLE_QUOTE,seedSampleQuote} from '../db/seed';
import {roundDollars} from '@/lib/money';
import {all,bool,flag,inTransaction,nowIso,one,run,scalar} from './sql';

// Quote persistence (spec §4, §5.4). This module stores what the services decide: the state
// machine (task 1.5) chooses transitions, the pricing engine (1.1) chooses prices. Quote and
// QuoteLine carry cost and are internal; customers get customerQuotes / customerQuote only.

const HEADER=`SELECT q.id,q.quote_number,q.customer_id,cu.name customer_name,cu.account_number,q.contact_id,ct.name contact_name,q.rep_id,r.name rep_name,
  q.status,q.revision,q.conversation_id,q.request_text,q.requested_at,q.created_at,q.updated_at,q.sent_at,q.responded_at,q.fulfillment,q.branch_id,b.code branch_code,
  q.requested_date,q.fulfillment_time,q.ship_to_address,q.ship_to_lat,q.ship_to_lng,q.freight_override,q.freight_override_reason,q.valid_days,q.valid_until,q.expires_on,
  q.customer_po,q.customer_note,q.change_request_note,q.declined_at,q.decline_reason,q.decline_note,q.unread_for_rep,q.unread_for_customer,q.is_sample,q.duplicated_from
  FROM quotes q JOIN customers cu ON cu.id=q.customer_id JOIN reps r ON r.id=q.rep_id JOIN branches b ON b.id=q.branch_id LEFT JOIN contacts ct ON ct.id=q.contact_id`;
type Flags='unread_for_rep'|'unread_for_customer'|'is_sample';
type HeaderRow=Omit<QuoteHeader,Flags>&Record<Flags,number>;
const toHeader=(row:HeaderRow):QuoteHeader=>({...row,unread_for_rep:bool(row.unread_for_rep),unread_for_customer:bool(row.unread_for_customer),is_sample:bool(row.is_sample)});

const LINE=`SELECT l.id,l.quote_id,l.line_no,l.item_id,i.sku,i.description,i.pack,i.case_qty,i.category_id,c.name category_name,i.list_price,l.qty,l.unit_price,l.price_basis,
  l.suggested_price,l.suggested_basis,l.customer_price,l.unit_cost,l.explanation,l.requested_text,l.match_score,l.added_by
  FROM quote_lines l JOIN items i ON i.id=l.item_id JOIN product_categories c ON c.id=i.category_id`;
const quoteLines=(quoteId:string)=>all<QuoteLine>(`${LINE} WHERE l.quote_id=? ORDER BY l.line_no`,quoteId);
const quoteLine=(quoteId:string,lineId:string)=>one<QuoteLine>(`${LINE} WHERE l.quote_id=? AND l.id=?`,quoteId,lineId);

const LATEST_SENT_TOTAL='(SELECT v.total FROM quote_revisions v WHERE v.quote_id=q.id ORDER BY v.revision DESC LIMIT 1)';

// ---- Reads (internal) ----

/** Internal: the quote with its lines (including cost). */
export function quote(quoteId:string):Quote|undefined{
  const row=one<HeaderRow>(`${HEADER} WHERE q.id=?`,quoteId);
  return row&&{...toHeader(row),lines:quoteLines(row.id)};
}
export function quoteByNumber(quoteNumber:string){
  const id=scalar<string>('SELECT id FROM quotes WHERE upper(quote_number)=upper(?)',quoteNumber);
  return id?quote(id):undefined;
}

export interface QuoteFilter {customerId?:string|null;repId?:string|null;statuses?:readonly QuoteStatus[]}

/** The rep's Quotes list, newest request first. */
export function quotes({customerId=null,repId=null,statuses}:QuoteFilter={}):QuoteListRow[]{
  const rows=all<Omit<QuoteListRow,'margin'|'unread_for_rep'|'is_sample'>&{unread_for_rep:number;is_sample:number}>(`SELECT q.id,q.quote_number,q.customer_id,cu.name customer_name,q.rep_id,r.name rep_name,
      q.status,q.revision,q.requested_at,q.created_at,q.updated_at,q.sent_at,q.responded_at,q.valid_until,q.fulfillment,q.change_request_note,q.unread_for_rep,q.is_sample,
      (SELECT count(*) FROM quote_lines l WHERE l.quote_id=q.id) line_count,
      (SELECT coalesce(sum(l.qty*l.unit_price),0) FROM quote_lines l WHERE l.quote_id=q.id AND l.unit_price IS NOT NULL) subtotal,
      (SELECT coalesce(sum(l.qty*l.unit_cost),0) FROM quote_lines l WHERE l.quote_id=q.id AND l.unit_price IS NOT NULL) cost_total,
      q.freight_override,${LATEST_SENT_TOTAL} sent_total
    FROM quotes q JOIN customers cu ON cu.id=q.customer_id JOIN reps r ON r.id=q.rep_id
    WHERE (@customerId IS NULL OR q.customer_id=@customerId) AND (@repId IS NULL OR q.rep_id=@repId) AND (@statuses IS NULL OR q.status IN (SELECT value FROM json_each(@statuses)))
    ORDER BY q.requested_at DESC,q.quote_number DESC`,{customerId,repId,statuses:statuses?JSON.stringify(statuses):null});
  return rows.map(row=>{
    const subtotal=roundDollars(row.subtotal),cost_total=roundDollars(row.cost_total);
    return {...row,subtotal,cost_total,margin:subtotal>0?(subtotal-cost_total)/subtotal:null,unread_for_rep:bool(row.unread_for_rep),is_sample:bool(row.is_sample)};
  });
}

/** Quotes waiting on the rep (the unread badge on Quotes). */
export function unreadQuoteCount(repId:string){return scalar<number>('SELECT count(*) FROM quotes WHERE rep_id=? AND unread_for_rep=1',repId)??0;}

// ---- Writes (internal) ----

function checkQty(qty:number){if(!Number.isInteger(qty)||qty<0)throw new RangeError(`Quantity must be a whole number of at least 0 (got ${qty}).`);}

/** Writes one line; unit cost is copied from the item, never taken from the caller. `atLineNo` must be free (restoreQuoteLine checks). */
function insertLine(quoteId:string,line:NewQuoteLine,addedBy:LineSource,atLineNo?:number){
  checkQty(line.qty);
  const cost=scalar<number>('SELECT cost FROM items WHERE id=?',line.itemId);
  if(cost===undefined)throw new Error(`Unknown item ${line.itemId}.`);
  // A new line takes the number after the highest one on the quote. The id is built from the number,
  // so it can come back: Undo restores a removed line under its old number and id, and removing the
  // last line frees its number for the next Add.
  const lineNo=atLineNo??(scalar<number|null>('SELECT max(line_no) FROM quote_lines WHERE quote_id=?',quoteId)??0)+1;
  const id=`${quoteId}-${lineNo}`;
  run(`INSERT INTO quote_lines(id,quote_id,line_no,item_id,qty,unit_price,price_basis,suggested_price,suggested_basis,customer_price,unit_cost,explanation,requested_text,match_score,added_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,quoteId,lineNo,line.itemId,line.qty,line.unitPrice??null,line.priceBasis??null,line.suggestedPrice??null,line.suggestedBasis??null,
    line.customerPrice??null,cost,line.explanation??null,line.requestedText??null,line.matchScore??null,line.addedBy??addedBy);
  return id;
}

/** Sets columns on a quote and stamps updated_at. Column names come from fixed maps, never from input. */
function updateQuote(quoteId:string,columns:[string,unknown][],at:string){
  const set=[...columns,['updated_at',at] as [string,unknown]];
  return run(`UPDATE quotes SET ${set.map(([column])=>`${column}=?`).join(',')} WHERE id=?`,...set.map(([,value])=>value),quoteId).changes===1;
}
const touch=(quoteId:string,at:string)=>updateQuote(quoteId,[],at);

function customerShipTo(customerId:string){
  const c=one<{address:string|null;city:string|null;state:string|null;zip:string|null;lat:number|null;lng:number|null}>('SELECT ship_to_address address,ship_to_city city,ship_to_state state,ship_to_zip zip,ship_to_lat lat,ship_to_lng lng FROM customers WHERE id=?',customerId);
  return c?.address?{address:`${c.address}, ${c.city}, ${c.state} ${c.zip}`,lat:c.lat,lng:c.lng}:null;
}

/**
 * Creates a quote in ready_for_review with the next quote number, for the customer's assigned
 * rep, flagged unread for the rep. Lines are numbered in order. Throws (and writes nothing) if
 * the customer has no rep or an item is unknown.
 */
export function createQuote(input:NewQuote):Quote{
  return inTransaction(()=>{
    const repId=scalar<string>('SELECT rep_id FROM customer_rep WHERE customer_id=?',input.customerId);
    if(!repId)throw new Error(`Customer ${input.customerId} has no assigned rep.`);
    const next=(scalar<number|null>('SELECT max(CAST(substr(quote_number,3) AS INTEGER)) FROM quotes')??10000)+1;
    const id=`q-${next}`,at=input.at??nowIso();
    const shipTo=input.shipTo===undefined?customerShipTo(input.customerId):input.shipTo;
    run(`INSERT INTO quotes(id,quote_number,customer_id,contact_id,rep_id,status,revision,conversation_id,request_text,requested_at,created_at,updated_at,fulfillment,branch_id,
        requested_date,ship_to_address,ship_to_lat,ship_to_lng,valid_days,customer_note,unread_for_rep,unread_for_customer,is_sample,duplicated_from)
      VALUES(?,?,?,?,?,'ready_for_review',0,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,0,?)`,
      id,`Q-${next}`,input.customerId,input.contactId??null,repId,input.conversationId??null,input.requestText??null,input.requestedAt??at,at,at,input.fulfillment,input.branchId,
      input.requestedDate??null,shipTo?.address??null,shipTo?.lat??null,shipTo?.lng??null,input.validDays??14,input.customerNote??null,input.duplicatedFrom??null);
    for(const line of input.lines)insertLine(id,line,'querent');
    return quote(id)!;
  });
}

/** Adds a line at the end (added_by defaults to 'rep'). Returns undefined if the quote doesn't exist. */
export function addQuoteLine(quoteId:string,line:NewQuoteLine,at=nowIso()){
  return inTransaction(()=>{
    if(!touch(quoteId,at))return undefined;
    return quoteLine(quoteId,insertLine(quoteId,line,'rep'));
  });
}

/** What a restored line takes from the line that was removed, never from the caller. */
type RemovedLine=Required<Pick<NewQuoteLine,'requestedText'|'matchScore'|'addedBy'>>;

/**
 * Puts a removed line back under its old line number, so Undo on the rep's quote returns it to
 * its place in the grid (task 3.3). Who added it, its match score and the customer's words come
 * from the removed line (removeQuoteLine keeps them), not from `line` (task 7.1). Returns
 * undefined if the quote doesn't exist, or no line `lineNo` of that item was removed from it.
 */
export function restoreQuoteLine(quoteId:string,lineNo:number,line:Omit<NewQuoteLine,keyof RemovedLine>,at=nowIso()){
  return inTransaction(()=>{
    const removed=one<RemovedLine>('SELECT requested_text requestedText,match_score matchScore,added_by addedBy FROM quote_removed_lines WHERE quote_id=? AND line_no=? AND item_id=?',quoteId,lineNo,line.itemId);
    if(!removed||!touch(quoteId,at))return undefined;
    run('DELETE FROM quote_removed_lines WHERE quote_id=? AND line_no=?',quoteId,lineNo);
    // A line added since takes the number after the highest one left, which can be this one: then the line goes at the end.
    const free=scalar<number>('SELECT 1 FROM quote_lines WHERE quote_id=? AND line_no=?',quoteId,lineNo)===undefined;
    return quoteLine(quoteId,insertLine(quoteId,{...line,...removed},'rep',free?lineNo:undefined));
  });
}

const LINE_COLUMNS={qty:'qty',unitPrice:'unit_price',priceBasis:'price_basis',suggestedPrice:'suggested_price',suggestedBasis:'suggested_basis',customerPrice:'customer_price',explanation:'explanation'} as const;

/** Changes qty, price, basis or Querent's suggestion on one line; omitted fields are left alone. */
export function updateQuoteLine(quoteId:string,lineId:string,patch:QuoteLinePatch,at=nowIso()){
  if(patch.qty!==undefined)checkQty(patch.qty);
  const columns=(Object.keys(LINE_COLUMNS) as (keyof QuoteLinePatch)[]).filter(key=>patch[key]!==undefined).map(key=>[LINE_COLUMNS[key],patch[key]] as const);
  return inTransaction(()=>{
    if(columns.length){
      const {changes}=run(`UPDATE quote_lines SET ${columns.map(([column])=>`${column}=?`).join(',')} WHERE id=? AND quote_id=?`,...columns.map(([,value])=>value),lineId,quoteId);
      if(!changes)return undefined;
      touch(quoteId,at);
    }
    return quoteLine(quoteId,lineId);
  });
}

/** Removes one line. Other lines keep their numbers. What Querent recorded about it is kept for restoreQuoteLine (Undo). */
export function removeQuoteLine(quoteId:string,lineId:string,at=nowIso()){
  return inTransaction(()=>{
    run(`INSERT OR REPLACE INTO quote_removed_lines(quote_id,line_no,item_id,requested_text,match_score,added_by,removed_at)
      SELECT quote_id,line_no,item_id,requested_text,match_score,added_by,? FROM quote_lines WHERE id=? AND quote_id=?`,at,lineId,quoteId);
    const removed=run('DELETE FROM quote_lines WHERE id=? AND quote_id=?',lineId,quoteId).changes===1;
    if(removed)touch(quoteId,at);
    return removed;
  });
}

const TERMS_COLUMNS={validDays:'valid_days',expiresOn:'expires_on',customerPo:'customer_po',customerNote:'customer_note'} as const;
/** Quote terms: the expiration date (null: valid_days after sending), customer PO, note printed on the quote. Returns false if the quote doesn't exist. */
export function updateQuoteTerms(quoteId:string,patch:QuoteTermsPatch,at=nowIso()){
  const columns=(Object.keys(TERMS_COLUMNS) as (keyof QuoteTermsPatch)[]).filter(key=>patch[key]!==undefined).map(key=>[TERMS_COLUMNS[key],patch[key]] as [string,unknown]);
  return updateQuote(quoteId,columns,at);
}

/** Pickup or delivery, branch, requested day and ship-to. A null shipTo clears it. */
export function updateQuoteFulfillment(quoteId:string,patch:QuoteFulfillmentPatch,at=nowIso()){
  const columns:[string,unknown][]=[];
  if(patch.fulfillment!==undefined)columns.push(['fulfillment',patch.fulfillment]);
  if(patch.branchId!==undefined)columns.push(['branch_id',patch.branchId]);
  if(patch.requestedDate!==undefined)columns.push(['requested_date',patch.requestedDate]);
  if(patch.shipTo!==undefined)columns.push(['ship_to_address',patch.shipTo?.address??null],['ship_to_lat',patch.shipTo?.lat??null],['ship_to_lng',patch.shipTo?.lng??null]);
  return updateQuote(quoteId,columns,at);
}

/** The rep's freight override (spec §5.3): an amount with a reason, or null to go back to computed freight. */
export function setFreightOverride(quoteId:string,override:{amount:number;reason:string}|null,at=nowIso()){
  if(override&&(!Number.isFinite(override.amount)||override.amount<0))throw new RangeError(`Freight must be at least 0 (got ${override.amount}).`);
  if(override&&!override.reason.trim())throw new Error('A freight override needs a reason.');
  return updateQuote(quoteId,[['freight_override',override?.amount??null],['freight_override_reason',override?.reason.trim()??null]],at);
}

/**
 * Persists a transition chosen by the quote state machine (task 1.5), with the fields it sets.
 * Writes only if the quote is still in `from`; returns whether it did.
 */
export function saveQuoteTransition(quoteId:string,t:QuoteTransition){
  const columns:[string,unknown][]=[['status',t.to]];
  const optional:[keyof QuoteTransition,string][]=[['revision','revision'],['sentAt','sent_at'],['respondedAt','responded_at'],['validUntil','valid_until'],['fulfillmentTime','fulfillment_time'],['customerPo','customer_po'],['changeRequestNote','change_request_note'],
    ['declinedAt','declined_at'],['declineReason','decline_reason'],['declineNote','decline_note']];
  for(const [key,column] of optional)if(t[key]!==undefined)columns.push([column,t[key]]);
  if(t.unreadForRep!==undefined)columns.push(['unread_for_rep',flag(t.unreadForRep)]);
  if(t.unreadForCustomer!==undefined)columns.push(['unread_for_customer',flag(t.unreadForCustomer)]);
  const set=[...columns,['updated_at',t.at??nowIso()] as [string,unknown]];
  return run(`UPDATE quotes SET ${set.map(([column])=>`${column}=?`).join(',')} WHERE id=? AND status=?`,...set.map(([,value])=>value),quoteId,t.from).changes===1;
}

/** Clears the unread flag for the rep or the customer. Reading doesn't change updated_at. */
export function markQuoteRead(quoteId:string,reader:'rep'|'customer'){
  return run(`UPDATE quotes SET ${reader==='rep'?'unread_for_rep':'unread_for_customer'}=0 WHERE id=?`,quoteId).changes===1;
}

// ---- Touch and view clocks (v3 spec §3, decision 25: "why quotes went untouched", D3) ----
// Like reading, neither changes updated_at: a look is not an edit.

/** The owning rep opened the quote detail or edited the quote (rep/quotes touchRepQuote decides who counts). */
export function touchQuoteByRep(quoteId:string,at=nowIso()){
  return run('UPDATE quotes SET last_rep_touch_at=? WHERE id=?',at,quoteId).changes===1;
}

/** When the owning rep last touched the quote and the customer last viewed a sent revision; undefined for an unknown quote. */
export function quoteTouchClocks(quoteId:string){
  return one<{last_rep_touch_at:string|null;customer_viewed_at:string|null}>('SELECT last_rep_touch_at,customer_viewed_at FROM quotes WHERE id=?',quoteId);
}

// ---- Revisions, activity and notes ----

type RevisionRow=Omit<QuoteRevision,'attach_pdf'|'snapshot'>&{attach_pdf:number;snapshot:string};
const REVISION='SELECT id,quote_id,revision,sent_at,sent_by,message,attach_pdf,total,snapshot FROM quote_revisions';
const toRevision=(row:RevisionRow):QuoteRevision=>({...row,attach_pdf:bool(row.attach_pdf),snapshot:JSON.parse(row.snapshot) as QuoteSnapshot});

/**
 * Stores the frozen copy of a sent quote. Revisions are immutable: there is no update or delete,
 * and storing the same revision number twice throws.
 */
export function addQuoteRevision(quoteId:string,revision:NewQuoteRevision):QuoteRevision{
  run('INSERT INTO quote_revisions(id,quote_id,revision,sent_at,sent_by,message,attach_pdf,total,snapshot) VALUES(?,?,?,?,?,?,?,?,?)',
    `${quoteId}-r${revision.revision}`,quoteId,revision.revision,revision.sentAt??nowIso(),revision.sentBy,revision.message??null,flag(revision.attachPdf??true),revision.total,JSON.stringify(revision.snapshot));
  return quoteRevision(quoteId,revision.revision)!;
}
export function quoteRevisions(quoteId:string){return all<RevisionRow>(`${REVISION} WHERE quote_id=? ORDER BY revision`,quoteId).map(toRevision);}
export function quoteRevision(quoteId:string,revision:number){const row=one<RevisionRow>(`${REVISION} WHERE quote_id=? AND revision=?`,quoteId,revision);return row&&toRevision(row);}

const ACTIVITY='SELECT id,quote_id,at,actor,actor_id,kind,message FROM quote_activity';
/** Appends to the quote's Activity log. */
export function addQuoteActivity(quoteId:string,entry:{actor:ActivityActor;actorId?:string|null;kind:string;message:string;at?:string}){
  const {lastInsertRowid}=run('INSERT INTO quote_activity(quote_id,at,actor,actor_id,kind,message) VALUES(?,?,?,?,?,?)',quoteId,entry.at??nowIso(),entry.actor,entry.actorId??null,entry.kind,entry.message);
  return one<QuoteActivity>(`${ACTIVITY} WHERE id=?`,lastInsertRowid)!;
}
export function quoteActivity(quoteId:string){return all<QuoteActivity>(`${ACTIVITY} WHERE quote_id=? ORDER BY at,id`,quoteId);}

const NOTE='SELECT n.id,n.quote_id,n.rep_id,r.name rep_name,n.body,n.created_at FROM quote_notes n JOIN reps r ON r.id=n.rep_id';
/** Internal notes on a quote (never shown to the customer). */
export function addQuoteNote(quoteId:string,repId:string,body:string,at=nowIso()){
  const {lastInsertRowid}=run('INSERT INTO quote_notes(quote_id,rep_id,body,created_at) VALUES(?,?,?,?)',quoteId,repId,body,at);
  return one<QuoteNote>(`${NOTE} WHERE n.id=?`,lastInsertRowid)!;
}
export function quoteNotes(quoteId:string){return all<QuoteNote>(`${NOTE} WHERE n.quote_id=? ORDER BY n.created_at,n.id`,quoteId);}

/** "Reset sample quote": rebuilds Q-24817 exactly as seeded, discarding what the demo did to it. */
export function resetSampleQuote(){
  seedSampleQuote(db(),seedAnchor());
  return quote(SAMPLE_QUOTE.id)!;
}

// ---- Customer-safe reads ----

type SummaryRow=Omit<CustomerQuoteSummary,'unread'>&{unread:number};
const CUSTOMER_QUOTE=`SELECT q.id,q.quote_number,q.status,q.revision,q.requested_at,q.sent_at,q.valid_until,${LATEST_SENT_TOTAL} total,q.unread_for_customer unread FROM quotes q`;
const toSummary=(row:SummaryRow):CustomerQuoteSummary=>({...row,unread:bool(row.unread)});

/** Customer-safe: the customer's quotes, newest first. The total is the last sent one, so draft prices never show. */
export function customerQuotes(customerId:string){
  return all<SummaryRow>(`${CUSTOMER_QUOTE} WHERE q.customer_id=? ORDER BY q.requested_at DESC,q.quote_number DESC`,customerId).map(toSummary);
}

/** Copies only the fields a customer may see from a stored snapshot, whatever else it holds. */
function customerSnapshot(s:QuoteSnapshot):QuoteSnapshot{
  return {quote_number:s.quote_number,revision:s.revision,customer:{name:s.customer.name,account_number:s.customer.account_number},contact:s.contact??null,rep:s.rep,
    fulfillment:s.fulfillment,branch:s.branch,valid_until:s.valid_until??null,subtotal:s.subtotal,freight:s.freight,total:s.total,
    sent_at:s.sent_at,valid_days:s.valid_days,customer_po:s.customer_po,customer_note:s.customer_note,ship_to:s.ship_to,freight_miles:s.freight_miles,
    // What the customer PDF prints around the quote (task 4.1): customer-visible, field by field.
    terms:s.terms,
    rep_contact:s.rep_contact&&{name:s.rep_contact.name,title:s.rep_contact.title,phone:s.rep_contact.phone,email:s.rep_contact.email},
    letterhead:s.letterhead&&{supplier:s.letterhead.supplier,website:s.letterhead.website,branch:s.letterhead.branch,address:s.letterhead.address,
      city:s.letterhead.city,state:s.letterhead.state,zip:s.letterhead.zip,phone:s.letterhead.phone},
    lines:s.lines.map(l=>({sku:l.sku,description:l.description,pack:l.pack,qty:l.qty,unit_price:l.unit_price,total:l.total}))};
}

/** Customer-safe: one of the customer's quotes (by id or number) with the last revision the rep sent. */
export function customerQuote(customerId:string,quoteIdOrNumber:string):CustomerQuoteView|undefined{
  const row=one<SummaryRow&{fulfillment_time:string|null;customer_po:string|null;change_request_note:string|null}>(
    `SELECT s.*,q.fulfillment_time,q.customer_po,q.change_request_note FROM (${CUSTOMER_QUOTE} WHERE q.customer_id=? AND (q.id=? OR upper(q.quote_number)=upper(?))) s JOIN quotes q ON q.id=s.id`,
    customerId,quoteIdOrNumber,quoteIdOrNumber);
  if(!row)return undefined;
  const last=one<RevisionRow>(`${REVISION} WHERE quote_id=? ORDER BY revision DESC LIMIT 1`,row.id);
  const sent=last?{revision:last.revision,sent_at:last.sent_at,message:last.message,attach_pdf:bool(last.attach_pdf),snapshot:customerSnapshot(JSON.parse(last.snapshot) as QuoteSnapshot)}:null;
  return {...toSummary(row),fulfillment_time:row.fulfillment_time,customer_po:row.customer_po,change_request_note:row.change_request_note,sent};
}

/**
 * Customer-safe: the customer opened the PDF preview of a sent revision of one of their quotes (by id
 * or number): stamps customer_viewed_at and clears their unread flag, leaving updated_at alone.
 * False, changing nothing, for a quote never sent, another customer's quote or an unknown one.
 */
export function markCustomerViewed(customerId:string,quoteIdOrNumber:string,at=nowIso()){
  return run('UPDATE quotes SET customer_viewed_at=?,unread_for_customer=0 WHERE customer_id=? AND (id=? OR upper(quote_number)=upper(?)) AND revision>0',
    at,customerId,quoteIdOrNumber,quoteIdOrNumber).changes===1;
}

/**
 * Customer-safe: one revision the rep sent on one of the customer's quotes (by id or number), the
 * latest when `revision` is omitted, with the quote's own rep (quotes are never reassigned). This
 * is what the customer PDF prints (task 4.1) and the preview modal shows, with whether the rep left
 * Attach PDF on for it (task 5.1). Undefined for another customer's quote, an unknown
 * one, or a revision that was never sent, so a draft's unreviewed prices never reach the customer.
 */
export function customerQuoteRevision(customerId:string,quoteIdOrNumber:string,revision?:number):CustomerQuoteRevision|undefined{
  const q=one<{id:string;rep_id:string}>('SELECT id,rep_id FROM quotes WHERE customer_id=? AND (id=? OR upper(quote_number)=upper(?))',customerId,quoteIdOrNumber,quoteIdOrNumber);
  if(!q)return undefined;
  const row=revision===undefined
    ?one<RevisionRow>(`${REVISION} WHERE quote_id=? ORDER BY revision DESC LIMIT 1`,q.id)
    :one<RevisionRow>(`${REVISION} WHERE quote_id=? AND revision=?`,q.id,revision);
  if(!row)return undefined;
  const rep=one<Rep>('SELECT id,name,initials,title,phone,email FROM reps WHERE id=?',q.rep_id)??null;
  return {quote_id:q.id,revision:row.revision,sent_at:row.sent_at,attach_pdf:bool(row.attach_pdf),snapshot:customerSnapshot(JSON.parse(row.snapshot) as QuoteSnapshot),rep};
}
