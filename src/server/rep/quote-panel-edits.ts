import 'server-only';
import {z} from 'zod';
import {FULFILLMENTS,type QuoteFulfillmentPatch,type QuoteTermsPatch} from '@/domain';
import {formatUsd} from '@/server/freight/engine';
import {overrideFreight} from '@/server/freight/quote';
import {QuoteActionError} from '@/server/quotes';
import {addQuoteActivity,addQuoteNote,branch,inTransaction,quote,updateQuoteFulfillment,updateQuoteTerms} from '@/server/repository';
import {quoteDetailOf,type QuoteDetail,type QuoteDetailOptions} from './quote-detail';
import {editableQuote} from './quote-edits';

// The rep's edits from the quote detail's side panels (spec §4, §5.3, §5.4; task 3.4): pickup or
// delivery and the branch, the freight override (with its required reason), the quote terms
// (valid for 7/14/30 days, customer PO, the note printed on the quote) and internal notes. Like
// the line edits (./quote-edits), each one:
//   - acts only on the signed-in rep's own quote (another rep's reads as not found);
//   - refuses a quote whose effective status doesn't allow edits (canEditDraft: sent, accepted
//     and expired are read-only, 409; changes_requested is editable);
//   - validates its input server-side (400);
//   - writes and logs Activity in one transaction, then answers the fresh detail, so the totals,
//     freight and "things to check" (sendCheck) follow at once.
// A freight override never clears the "delivery needs a ship-to" blocker: sendBlockers checks the
// ship-to on its own (task 1.5). Internal notes are team-only: they live in quote_notes, which no
// customer read, snapshot or customer PDF touches.

const clock=()=>new Date().toISOString();
const firstName=(name:string)=>name.trim().split(/\s+/)[0];

/** The largest freight the rep can set by hand, in dollars. */
export const MAX_FREIGHT=100_000;
/** Longest inputs, in characters. */
export const MAX_LENGTH={po:40,customerNote:1000,reason:300,note:2000} as const;

function parse<T>(schema:z.ZodType<T>,body:unknown):T{
  const result=schema.safeParse(body);
  if(!result.success)throw new QuoteActionError('invalid_input',result.error.issues[0]?.message??'Check the request.');
  return result.data;
}

const inCents=(value:number)=>Math.abs(value*100-Math.round(value*100))<1e-6;
const tooLong=(what:string,max:number)=>({error:`${what} can’t be over ${max.toLocaleString('en-US')} characters.`});
/** Optional text: trimmed, and '' clears it (null). */
const OptionalText=(what:string,max:number)=>z.string({error:`${what} must be text.`}).trim().max(max,tooLong(what,max)).nullable()
  .transform(value=>value?value:null);

const refresh=(quoteId:string,options:QuoteDetailOptions)=>quoteDetailOf(quote(quoteId)!,options);

// ---- Pickup or delivery ----

/** PATCH body: will call or delivery, and/or the branch (the freight origin and the stock shown). */
export const FulfillmentBody=z.strictObject({
  fulfillment:z.enum(FULFILLMENTS,{error:'Choose will call or delivery.'}).optional(),
  branchId:z.string({error:'Choose a branch.'}).trim().min(1,{error:'Choose a branch.'}).max(40,{error:'Choose a branch.'}).optional(),
}).refine(b=>b.fulfillment!==undefined||b.branchId!==undefined,{error:'Nothing to change: send fulfillment or branchId.'});

/** PATCH /api/rep/quotes/<id>/fulfillment: switches will call / delivery or the branch. Returns the fresh detail. */
export async function editRepQuoteFulfillment(repId:string,quoteIdOrNumber:string,body:unknown,{now=clock(),provider}:QuoteDetailOptions={}):Promise<QuoteDetail>{
  const input=parse(FulfillmentBody,body);
  const quoteId=inTransaction(()=>{
    const q=editableQuote(repId,quoteIdOrNumber,now);
    const to=input.branchId===undefined?undefined:branch(input.branchId);
    if(input.branchId!==undefined&&!to)throw new QuoteActionError('invalid_input',`No branch ${input.branchId}.`);
    const patch:QuoteFulfillmentPatch={};
    if(input.fulfillment!==undefined&&input.fulfillment!==q.fulfillment)patch.fulfillment=input.fulfillment;
    if(to&&to.id!==q.branch_id)patch.branchId=to.id;
    if(patch.fulfillment===undefined&&patch.branchId===undefined)return q.id;
    updateQuoteFulfillment(q.id,patch,now);
    const who=firstName(q.rep_name),code=to?.code??q.branch_code;
    const log=(kind:string,message:string)=>addQuoteActivity(q.id,{actor:'rep',actorId:repId,kind,at:now,message});
    if(patch.fulfillment)log('fulfillment_changed',patch.fulfillment==='delivery'?`${who} switched to delivery from ${code}`:`${who} switched to will call at ${code}`);
    if(patch.branchId)log('branch_changed',`${who} changed the branch from ${q.branch_code} to ${code}`);
    return q.id;
  });
  return refresh(quoteId,{now,provider});
}

// ---- Freight override ----

/** PUT body: the freight the rep sets by hand and why (spec §5.3: the reason is required). */
export const FreightOverrideBody=z.strictObject({
  amount:z.number({error:'Enter freight in dollars and cents, like 80.00.'}).min(0,{error:'Freight can’t be below $0.'})
    .max(MAX_FREIGHT,{error:`Freight can’t be over ${formatUsd(MAX_FREIGHT)}.`}).refine(inCents,{error:'Enter freight in dollars and cents, like 80.00.'}),
  reason:z.string({error:'Say why freight is set by hand.'}).trim().min(1,{error:'Say why freight is set by hand.'}).max(MAX_LENGTH.reason,tooLong('The reason',MAX_LENGTH.reason)),
});

/**
 * PUT /api/rep/quotes/<id>/freight {amount, reason}: the rep's freight override (task 1.3's
 * overrideFreight, which logs "Freight set to $X: reason" in Activity). It resolves call for
 * freight, but a delivery with no ship-to still can't be sent. Returns the fresh detail.
 */
export async function overrideRepQuoteFreight(repId:string,quoteIdOrNumber:string,body:unknown,{now=clock(),provider}:QuoteDetailOptions={}):Promise<QuoteDetail>{
  const input=parse(FreightOverrideBody,body);
  const quoteId=inTransaction(()=>{
    const q=editableQuote(repId,quoteIdOrNumber,now);
    const same=q.freight_override===input.amount&&q.freight_override_reason===input.reason;
    if(!same)overrideFreight(q.id,repId,{amount:input.amount,reason:input.reason},now);
    return q.id;
  });
  return refresh(quoteId,{now,provider});
}

/** DELETE /api/rep/quotes/<id>/freight: back to distance-based freight (logged). Returns the fresh detail. */
export async function clearRepQuoteFreight(repId:string,quoteIdOrNumber:string,{now=clock(),provider}:QuoteDetailOptions={}):Promise<QuoteDetail>{
  const quoteId=inTransaction(()=>{
    const q=editableQuote(repId,quoteIdOrNumber,now);
    if(q.freight_override!==null)overrideFreight(q.id,repId,null,now);
    return q.id;
  });
  return refresh(quoteId,{now,provider});
}

// ---- Quote terms ----

/** PATCH body: valid for 7, 14 or 30 days, the customer's PO and the note printed on the quote ('' or null clears either). */
export const TermsBody=z.strictObject({
  validDays:z.union([z.literal(7),z.literal(14),z.literal(30)],{error:'Choose 7, 14 or 30 days.'}).optional(),
  customerPo:OptionalText('The customer PO',MAX_LENGTH.po).optional(),
  customerNote:OptionalText('The note printed on the quote',MAX_LENGTH.customerNote).optional(),
}).refine(b=>b.validDays!==undefined||b.customerPo!==undefined||b.customerNote!==undefined,{error:'Nothing to change: send validDays, customerPo or customerNote.'});

/** PATCH /api/rep/quotes/<id>/terms: the quote terms, each change logged. Returns the fresh detail. */
export async function editRepQuoteTerms(repId:string,quoteIdOrNumber:string,body:unknown,{now=clock(),provider}:QuoteDetailOptions={}):Promise<QuoteDetail>{
  const input=parse(TermsBody,body);
  const quoteId=inTransaction(()=>{
    const q=editableQuote(repId,quoteIdOrNumber,now);
    const patch:QuoteTermsPatch={};
    if(input.validDays!==undefined&&input.validDays!==q.valid_days)patch.validDays=input.validDays;
    if(input.customerPo!==undefined&&input.customerPo!==q.customer_po)patch.customerPo=input.customerPo;
    if(input.customerNote!==undefined&&input.customerNote!==q.customer_note)patch.customerNote=input.customerNote;
    if(!Object.keys(patch).length)return q.id;
    updateQuoteTerms(q.id,patch,now);
    const who=firstName(q.rep_name);
    const log=(kind:string,message:string)=>addQuoteActivity(q.id,{actor:'rep',actorId:repId,kind,at:now,message});
    if(patch.validDays)log('terms_changed',`${who} made the quote valid for ${patch.validDays} days`);
    if(patch.customerPo!==undefined)log('terms_changed',patch.customerPo===null?`${who} removed the customer PO`
      :q.customer_po===null?`${who} added customer PO ${patch.customerPo}`:`${who} changed the customer PO to ${patch.customerPo}`);
    if(patch.customerNote!==undefined)log('terms_changed',patch.customerNote===null?`${who} removed the note printed on the quote`:`${who} updated the note printed on the quote`);
    return q.id;
  });
  return refresh(quoteId,{now,provider});
}

// ---- Internal notes ----

/** POST body: one internal note (team only). */
export const NoteBody=z.strictObject({
  body:z.string({error:'Write a note first.'}).trim().min(1,{error:'Write a note first.'}).max(MAX_LENGTH.note,tooLong('A note',MAX_LENGTH.note)),
});

/**
 * POST /api/rep/quotes/<id>/notes {body}: adds an internal note, seen only by Herrick's team.
 * Activity says a note was added, not what it says. Returns the fresh detail.
 */
export async function addRepQuoteNote(repId:string,quoteIdOrNumber:string,body:unknown,{now=clock(),provider}:QuoteDetailOptions={}):Promise<QuoteDetail>{
  const input=parse(NoteBody,body);
  const quoteId=inTransaction(()=>{
    const q=editableQuote(repId,quoteIdOrNumber,now);
    addQuoteNote(q.id,repId,input.body,now);
    addQuoteActivity(q.id,{actor:'rep',actorId:repId,kind:'note_added',at:now,message:`${firstName(q.rep_name)} added an internal note`});
    return q.id;
  });
  return refresh(quoteId,{now,provider});
}
