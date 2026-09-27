import 'server-only';
import {z} from 'zod';
import {QuoteActionError,canEditDraft,effectiveStatus} from '@/server/quotes';
import {HISTORY_MONTHS,wordUpsells,type Upsell,type UpsellWording,type UpsellWriter} from '@/server/upsells';
import {quoteUpsells} from '@/server/upsells/service';
import {upsellWriter} from '@/server/upsells-writer/claude';
import type {ChipFacts,ChipWriter} from '@/server/upsells-writer/facts';
import {pricingDay,type QuoteDetail,type QuoteDetailOptions} from './quote-detail';
import {addRepQuoteLine,editRepQuoteLine,editableQuote} from './quote-edits';
import {repQuote} from './quotes';

// "Suggested by Querent" on the rep's quote detail (spec §4, §5.5; task 3.6). The chips are task
// 1.6's (quoteUpsells: matching fasteners, full cases, bought together), priced by the engine on
// the same pricing day as the detail. In live mode Claude writes their wording; it is handed
// only cost-free facts (chipFacts): no unit cost, price, price basis, margin or GP ever reaches
// the model, and the writer refuses anything that looks like them. In scripted mode, or when
// Claude fails or is slow, every chip keeps its deterministic template wording (wordUpsells).
//
// Taking a chip goes through the line-edit service (task 3.3), so it acts only on the rep's own
// quote, only while the quote is editable (canEditDraft: 409 on sent, accepted and expired),
// writes Activity, and returns the fresh detail the page autosaves with (Undo takes it back
// like any other add or qty change). The chip is found again on the quote as it is now and
// applied only if it is still what the rep was shown (its fingerprint): a suggestion that no
// longer applies, or that now means something else (another tab changed its line), is refused
// (409). The server never applies a qty or price the client sends.

const clock=()=>new Date().toISOString();

/**
 * What a chip shows the rep, as one string: its id, what it changes (add N, or line from -> to)
 * and Querent's price. Taking a chip sends back the fingerprint it was shown with; the server
 * recomputes the chip and applies it only if the fingerprints match.
 */
export function upsellFingerprint({id,action,unit_price}:Pick<Upsell,'id'|'action'|'unit_price'>){
  const change=action.type==='add_line'?`add ${action.qty}`:`${action.line_id} ${action.from_qty}->${action.to_qty}`;
  return `${id}|${change}|${unit_price.toFixed(2)}`;
}

/** A chip as the rep portal gets it: who wrote its words, and its fingerprint. Internal: it carries unit cost and GP. */
export type RepUpsell=Upsell&{wording_source:'claude'|'template';fingerprint:string};

export interface RepUpsells {
  quote_id:string;
  /** The rep can take suggestions (the quote is editable). None are offered otherwise. */
  editable:boolean;
  /** Best GP gain first (task 1.6). */
  upsells:RepUpsell[];
}

/**
 * What Claude may read about a chip: names, the relation, counts and quantities, and the template
 * wording. The chip's unit cost, Querent's price and its basis, and the GP gain are left out.
 */
export function chipFacts(upsell:Upsell):ChipFacts{
  const {id,item,qty,anchor,wording}=upsell;
  const base={id,item:{sku:item.sku,description:item.description,pack:item.pack},qty,anchor:{sku:anchor.sku,description:anchor.description},
    history_months:HISTORY_MONTHS,template:{title:wording.title,reason:wording.reason}};
  switch(upsell.kind){
    case 'matching_fastener':{
      const {part,bolt,bolt_pieces,pack_pieces,history}=upsell.evidence;
      return {...base,kind:'matching_fastener',part,bolt:{diameter:bolt.diameter,thread:bolt.thread,grade:bolt.grade},bolt_pieces,pack_pieces,
        history:history&&{orders_together:history.orders_together,anchor_orders:history.anchor_orders}};
    }
    case 'full_case':{
      const {case_qty,from_qty,to_qty,cases}=upsell.evidence;
      return {...base,kind:'full_case',case_qty,from_qty,to_qty,cases};
    }
    case 'bought_together':{
      const {orders_together,anchor_orders}=upsell.evidence;
      return {...base,kind:'bought_together',orders_together,anchor_orders};
    }
  }
}

/** The upsell wording hook (wordUpsells) over a writer that only ever sees chipFacts. */
export const costFreeWriter=(writer:ChipWriter):UpsellWriter=>upsells=>writer(upsells.map(chipFacts));

const sameWording=(a:UpsellWording,b:UpsellWording)=>a.title===b.title&&a.reason===b.reason;

export interface RepUpsellOptions {
  now?:string;
  /** Who words the chips: Claude in live mode by default (upsellWriter), none (the templates) in scripted mode. */
  writer?:ChipWriter;
}

/**
 * GET /api/rep/quotes/<id>/upsells: the chips for one of the rep's quotes, worded, or no chips
 * when the quote can't be edited. undefined when the quote isn't the rep's.
 */
export async function repQuoteUpsells(repId:string,quoteIdOrNumber:string,options:RepUpsellOptions={}):Promise<RepUpsells|undefined>{
  const {now=clock()}=options;
  const q=repQuote(repId,quoteIdOrNumber);
  if(!q)return undefined;
  if(!canEditDraft(effectiveStatus(q,now)))return {quote_id:q.id,editable:false,upsells:[]};
  const chips=quoteUpsells(q,{on:pricingDay(now)})??[];
  const writer='writer' in options?options.writer:upsellWriter();
  const worded=await wordUpsells(chips,writer&&costFreeWriter(writer));
  return {quote_id:q.id,editable:true,upsells:worded.map((u,i)=>({...u,wording_source:sameWording(u.wording,chips[i].wording)?'template':'claude',fingerprint:upsellFingerprint(u)}))};
}

/**
 * POST /api/rep/quotes/<id>/upsells: the chip to take, by id ("matching_fastener:HN-12-13-G8"),
 * and the fingerprint it was shown with. Nothing else: the qty and price come from the server.
 */
export const TakeUpsellBody=z.strictObject({
  upsellId:z.string({error:'Choose a suggestion.'}).trim().min(1,{error:'Choose a suggestion.'}).max(120,{error:'Choose a suggestion.'}),
  fingerprint:z.string({error:'Send the suggestion as it was shown.'}).min(1,{error:'Send the suggestion as it was shown.'}).max(200,{error:'Send the suggestion as it was shown.'}),
});

export interface TakenUpsell {
  detail:QuoteDetail;
  upsell_id:string;
  /** The line added, or the line whose qty was bumped. */
  line_id:string;
}

/**
 * Takes one of Querent's suggestions on the rep's quote: adds its line (added by 'upsell', priced
 * by the engine at its qty) or bumps the line to the full case. Refuses another rep's quote
 * (404), a quote that can't be edited (409), a chip that no longer applies (409), and a chip that
 * isn't what the rep was shown any more: a different qty, line or price (409).
 */
export async function takeRepQuoteUpsell(repId:string,quoteIdOrNumber:string,body:unknown,{now=clock(),provider}:QuoteDetailOptions={}):Promise<TakenUpsell>{
  const parsed=TakeUpsellBody.safeParse(body);
  if(!parsed.success)throw new QuoteActionError('invalid_input',parsed.error.issues[0]?.message??'Choose a suggestion.');
  const {upsellId,fingerprint}=parsed.data;
  // Found and applied with no await in between: the chip is checked against the quote it changes.
  const q=editableQuote(repId,quoteIdOrNumber,now);
  const chip=quoteUpsells(q,{on:pricingDay(now)})?.find(u=>u.id===upsellId);
  if(!chip)throw new QuoteActionError('conflict',`That suggestion no longer applies to ${q.quote_number}.`);
  if(upsellFingerprint(chip)!==fingerprint)throw new QuoteActionError('conflict','That suggestion changed since it was shown. Check the updated suggestions and try again.');
  const {action}=chip;
  if(action.type==='add_line'){
    const added=await addRepQuoteLine(repId,q.id,{itemId:action.item_id,qty:action.qty},{now,provider,source:'upsell'});
    return {detail:added.detail,upsell_id:chip.id,line_id:added.line_id};
  }
  const detail=await editRepQuoteLine(repId,q.id,action.line_id,{qty:action.to_qty},{now,provider});
  return {detail,upsell_id:chip.id,line_id:action.line_id};
}
