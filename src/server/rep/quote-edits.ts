import 'server-only';
import {z} from 'zod';
import {PRICE_BASES,type PriceBasis,type Quote,type QuoteStatus} from '@/domain';
import {BASIS_LABELS,draftLineFields,formatMoney} from '@/server/pricing';
import {priceLines} from '@/server/pricing/service';
import {QuoteActionError,canEditDraft,effectiveStatus} from '@/server/quotes';
import {
  addQuoteActivity,addQuoteLine,catalogItem,inTransaction,quote,removeQuoteLine,restoreQuoteLine,searchItems,stockForItems,updateQuoteLine,
} from '@/server/repository';
import {detailLines,pricingDay,quoteDetailOf,type QuoteDetail,type QuoteDetailOptions} from './quote-detail';
import {MAX_PRICE,MAX_QTY,applyPatch,shortName,withBasis,type DetailLine,type LinePatch} from './quote-math';
import {repQuote} from './quotes';

// The rep's edits to a quote draft (spec §4, §5.4; task 3.3): change a line's qty, price basis
// or price, add an item, remove a line and put it back (Undo). The detail page autosaves every
// edit through these, and each one:
//   - acts only on the signed-in rep's own quote (another rep's reads as not found, as in 3.2);
//   - refuses a quote whose status doesn't allow edits (canEditDraft on the effective status:
//     sent, accepted and expired are read-only; changes_requested is editable, spec §5.4), since
//     the repository itself doesn't check status;
//   - validates what the rep typed server-side (a price is at least $0 and in whole cents);
//   - writes the line and an Activity entry in one transaction, then returns the fresh detail.
// Prices come only from here and the pricing engine: the customer's routes never set one.

const clock=()=>new Date().toISOString();
const firstName=(name:string)=>name.trim().split(/\s+/)[0];

const NOT_EDITABLE:Partial<Record<QuoteStatus,(n:string)=>string>>={
  sent:n=>`${n} was sent to the customer. It can't be edited unless they ask for changes.`,
  accepted:n=>`${n} was accepted, so it can't be edited. Duplicate it to quote again.`,
  expired:n=>`${n} expired, so it can't be edited. Duplicate it to quote again.`,
};

/** The rep's quote, if its status allows edits right now; throws not_found or illegal_transition (409). */
function editableQuote(repId:string,quoteIdOrNumber:string,now:string):Quote{
  const q=repQuote(repId,quoteIdOrNumber);
  if(!q)throw new QuoteActionError('not_found',`No quote ${quoteIdOrNumber}.`);
  const status=effectiveStatus(q,now);
  if(!canEditDraft(status))throw new QuoteActionError('illegal_transition',(NOT_EDITABLE[status]??(n=>`${n} can't be edited.`))(q.quote_number));
  return q;
}

// ---- Validation ----

/** Whole cents, allowing for float noise (31.95 * 100 = 3194.9999999999995). */
const inCents=(value:number)=>Math.abs(value*100-Math.round(value*100))<1e-6;
const Money=z.number({error:'Enter a price in dollars and cents, like 31.95.'})
  .min(0,{error:'A price can’t be below $0.'}).max(MAX_PRICE,{error:`A price can’t be over ${formatMoney(MAX_PRICE)}.`})
  .refine(inCents,{error:'Enter a price in dollars and cents, like 31.95.'});
const Qty=z.number({error:'Enter a whole quantity.'}).int({error:'Enter a whole quantity.'})
  .min(0,{error:'A quantity can’t be below 0.'}).max(MAX_QTY,{error:`A quantity can’t be over ${MAX_QTY.toLocaleString('en-US')}.`});
const Basis=z.enum(PRICE_BASES,{error:`Choose a price basis: ${PRICE_BASES.join(', ')}.`});

/** PATCH a line: any of a new qty, a price basis, a typed price (null clears it). A price alone is Custom. */
export const LinePatchBody:z.ZodType<LinePatch>=z.strictObject({qty:Qty.optional(),basis:Basis.optional(),unitPrice:Money.nullable().optional()})
  .refine(b=>b.qty!==undefined||b.basis!==undefined||b.unitPrice!==undefined,{error:'Nothing to change: send qty, basis or unitPrice.'});

/** POST a line: an item by id or SKU at a qty (1 by default). `restore` puts a removed line back (Undo). */
export const NewLineBody=z.strictObject({
  itemId:z.string({error:'Choose an item.'}).trim().min(1,{error:'Choose an item.'}).max(80),
  qty:Qty.default(1),
  restore:z.strictObject({
    lineNo:z.number().int().positive(),
    unitPrice:Money.nullable(),
    basis:Basis.nullable(),
    requestedText:z.string().max(1000).nullable().optional(),
    matchScore:z.number().min(0).max(1).nullable().optional(),
    addedBy:z.enum(['querent','rep','upsell']).optional(),
  }).optional(),
});
export type NewLine=z.infer<typeof NewLineBody>;

function parse<T>(schema:z.ZodType<T>,body:unknown):T{
  const result=schema.safeParse(body);
  if(!result.success)throw new QuoteActionError('invalid_input',result.error.issues[0]?.message??'Check the request.');
  return result.data;
}

// ---- Applying an edit ----

/** `line` after the patch (applyPatch); a basis with no price for the line is bad input. */
function patchedLine(line:DetailLine,patch:LinePatch):DetailLine{
  const next=applyPatch(line,patch);
  if(!next)throw new QuoteActionError('invalid_input',`${BASIS_LABELS[patch.basis!]} has no price for ${line.sku}.`);
  return next;
}

const priceText=(line:Pick<DetailLine,'unit_price'|'price_basis'>)=>line.unit_price===null?'no price':`${line.price_basis?BASIS_LABELS[line.price_basis]:'Custom'} ${formatMoney(line.unit_price)}`;
const named=(line:Pick<DetailLine,'description'|'sku'>)=>`${shortName(line.description)} (${line.sku})`;

/** "Brandi changed Hex cap screw 1/2-13 x 2 in (HCS-12-13-2G8): qty 10 to 5, price List $38.95", or null when nothing changed. */
export function changeMessage(repName:string,before:DetailLine,after:DetailLine):string|null{
  const parts:string[]=[];
  if(after.qty!==before.qty)parts.push(`qty ${before.qty} to ${after.qty}`);
  if(after.unit_price!==before.unit_price||after.price_basis!==before.price_basis)parts.push(`price ${priceText(after)}`);
  return parts.length?`${firstName(repName)} changed ${named(after)}: ${parts.join(', ')}`:null;
}

function saveLine(q:Quote,line:DetailLine,at:string){
  updateQuoteLine(q.id,line.id,{qty:line.qty,unitPrice:line.unit_price,priceBasis:line.price_basis,suggestedPrice:line.suggested_price,suggestedBasis:line.suggested_basis,
    customerPrice:line.customer_price,explanation:line.explanation},at);
}

const freshDetail=(quoteId:string,options:QuoteDetailOptions)=>quoteDetailOf(quote(quoteId)!,options);

/** PATCH /api/rep/quotes/<id>/lines/<lineId>: qty, price basis or a typed price. Returns the fresh detail. */
export async function editRepQuoteLine(repId:string,quoteIdOrNumber:string,lineId:string,body:unknown,{now=clock(),provider}:QuoteDetailOptions={}):Promise<QuoteDetail>{
  const patch=parse(LinePatchBody,body);
  const quoteId=inTransaction(()=>{
    const q=editableQuote(repId,quoteIdOrNumber,now);
    const before=detailLines(q,now).find(l=>l.id===lineId);
    if(!before)throw new QuoteActionError('not_found',`No line ${lineId} on ${q.quote_number}.`);
    const after=patchedLine(before,patch);
    saveLine(q,after,now);
    const message=changeMessage(q.rep_name,before,after);
    if(message)addQuoteActivity(q.id,{actor:'rep',actorId:repId,kind:'line_changed',at:now,message});
    return q.id;
  });
  return freshDetail(quoteId,{now,provider});
}

/**
 * POST /api/rep/quotes/<id>/lines: adds an item (by id or SKU) at the end, priced by the engine
 * at its qty (Querent's pick is the starting price, as for a drafted line). With `restore`, puts
 * a removed line back under its old number with its price, basis and what the customer asked for.
 */
export async function addRepQuoteLine(repId:string,quoteIdOrNumber:string,body:unknown,{now=clock(),provider}:QuoteDetailOptions={}):Promise<{detail:QuoteDetail;line_id:string}>{
  const input=parse(NewLineBody,body);
  const {quoteId,lineId}=inTransaction(()=>{
    const q=editableQuote(repId,quoteIdOrNumber,now);
    const item=catalogItem(input.itemId);
    if(!item)throw new QuoteActionError('invalid_input',`No item ${input.itemId} in the catalog.`);
    const [priced]=priceLines({customerId:q.customer_id,repId:q.rep_id,branchId:q.branch_id,lines:[{itemId:item.id,qty:input.qty}],on:pricingDay(now)});
    const {restore}=input;
    const fields={itemId:item.id,qty:input.qty,...(priced?draftLineFields(priced):{}),
      requestedText:restore?.requestedText??null,matchScore:restore?.matchScore??null,addedBy:restore?.addedBy??'rep' as const};
    const stored=restore?restoreQuoteLine(q.id,restore.lineNo,fields,now):addQuoteLine(q.id,fields,now);
    if(!stored)throw new QuoteActionError('not_found',`No quote ${quoteIdOrNumber}.`);
    if(restore){
      const line=detailLines(quote(q.id)!,now).find(l=>l.id===stored.id)!;
      saveLine(q,restoredPrice(line,restore.basis,restore.unitPrice),now);
    }
    const who=firstName(q.rep_name);
    addQuoteActivity(q.id,{actor:'rep',actorId:repId,kind:restore?'line_restored':'line_added',at:now,
      message:restore?`${who} put back ${named(stored)}`:`${who} added ${named(stored)}, qty ${stored.qty}`});
    return {quoteId:q.id,lineId:stored.id};
  });
  return {detail:await freshDetail(quoteId,{now,provider}),line_id:lineId};
}

/** The price a restored line had: its basis's price now, or the price it was removed with (as Custom if that basis has none now). */
function restoredPrice(line:DetailLine,basis:PriceBasis|null,unitPrice:number|null):DetailLine{
  if(basis&&basis!=='custom'){
    const onBasis=withBasis(line,basis);
    if(onBasis)return onBasis;
  }
  return unitPrice===null?{...line,unit_price:null,price_basis:null}:{...line,unit_price:unitPrice,price_basis:'custom'};
}

/** DELETE /api/rep/quotes/<id>/lines/<lineId>: removes the line (the page keeps it for Undo). Returns the fresh detail. */
export async function removeRepQuoteLine(repId:string,quoteIdOrNumber:string,lineId:string,{now=clock(),provider}:QuoteDetailOptions={}):Promise<QuoteDetail>{
  const quoteId=inTransaction(()=>{
    const q=editableQuote(repId,quoteIdOrNumber,now);
    const line=q.lines.find(l=>l.id===lineId);
    if(!line)throw new QuoteActionError('not_found',`No line ${lineId} on ${q.quote_number}.`);
    removeQuoteLine(q.id,lineId,now);
    addQuoteActivity(q.id,{actor:'rep',actorId:repId,kind:'line_removed',at:now,message:`${firstName(q.rep_name)} removed ${named(line)}`});
    return q.id;
  });
  return freshDetail(quoteId,{now,provider});
}

// ---- Add item by SKU or name ----

export interface QuoteItemMatch {
  id:string;sku:string;description:string;pack:string;category_name:string;
  /** Querent's price for this customer at qty 1 (what adding it would start at), or null with none on file. */
  price:number|null;basis:PriceBasis|null;
  /** On hand at the quote's branch. */
  available:number;branch_code:string;
  /** Already a line on this quote. */
  on_quote:boolean;
}

/** The longest query the item search reads. */
export const MAX_SEARCH=80;

/**
 * GET /api/rep/quotes/<id>/items?q=: catalog items whose SKU, name or keywords contain every word
 * (an exact SKU first), up to 8, with the price adding one would start at and stock at the quote's
 * branch. undefined if the quote isn't the rep's.
 */
export function searchRepQuoteItems(repId:string,quoteIdOrNumber:string,text:string,{now=clock()}:{now?:string}={}):QuoteItemMatch[]|undefined{
  const q=repQuote(repId,quoteIdOrNumber);
  if(!q)return undefined;
  const query=text.trim().slice(0,MAX_SEARCH);
  if(!query)return [];
  const exact=catalogItem(query);
  const found=[...(exact?[exact]:[]),...searchItems(query,{limit:8}).filter(i=>i.id!==exact?.id)].slice(0,8);
  if(!found.length)return [];
  const ids=found.map(i=>i.id);
  const priced=new Map(priceLines({customerId:q.customer_id,repId:q.rep_id,branchId:q.branch_id,lines:ids.map(itemId=>({itemId,qty:1})),on:pricingDay(now)}).map(p=>[p.itemId,p]));
  const stock=new Map(stockForItems(ids).map(s=>[s.item_id,s]));
  const onQuote=new Set(q.lines.map(l=>l.item_id));
  return found.map(i=>({id:i.id,sku:i.sku,description:i.description,pack:i.pack,category_name:i.category_name,
    price:priced.get(i.id)?.suggestion.price??null,basis:priced.get(i.id)?.suggestion.basis??null,
    available:stock.get(i.id)?.branches.find(b=>b.branch_id===q.branch_id)?.available??0,branch_code:q.branch_code,on_quote:onQuote.has(i.id)}));
}
