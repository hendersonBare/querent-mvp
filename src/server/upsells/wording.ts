import {itemNoun,pluralize} from '@/server/companions/words';
import type {Upsell,UpsellDraft} from './rules';

// Chip wording (spec §5.5): the rules decide every suggestion; only the words are Claude's. This is
// the deterministic template used in scripted mode and CI (and whenever Claude isn't available),
// built only from the chip's facts. A live writer (Claude) plugs in through wordUpsells.

export interface UpsellWording{
  /** The chip's headline: the item to add, or the bump. */
  title:string;
  /** Why Querent suggests it, in one or two short sentences. */
  reason:string;
}

/**
 * Writes the wording for a batch of chips (e.g. Claude in live mode): one entry per chip, in order.
 * Chips are internal: they carry unit_cost, gp_gain and price basis. A writer must run rep-side
 * (the rep portal, never the customer chat), or strip cost and GP before any of it reaches a
 * model prompt that could be shown to a customer.
 */
export type UpsellWriter=(upsells:readonly Upsell[])=>Promise<readonly (Partial<UpsellWording>|null|undefined)[]>;

/** The window the rules read history over (the same 12 months as "last paid", spec §5.1). */
export const HISTORY_MONTHS=12;

const USD=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
/** "$1,109.50" */
export const formatUsd=(amount:number)=>USD.format(amount);

export {itemNoun,lowerFirst,pluralize} from '@/server/companions/words';

/** The selling unit named by a pack: "Box of 25" -> "box", "4 pack" -> "pack", "Each" -> null. */
export function packUnit(pack:string){
  const named=/^\s*([a-z]+)\s+of\b/i.exec(pack)?.[1]??/\b(box|pack|case|bale|roll|bag|pail|drum|kit|set)\b/i.exec(pack)?.[1];
  return named?named.toLowerCase():null;
}

/** "8 boxes", "1 case", or just "20" for items sold each. */
export function countOf(qty:number,unit:string|null){return unit?`${qty} ${qty===1?unit:pluralize(unit)}`:String(qty);}

function onOrders(together:number,orders:number){
  if(orders===1)return 'on the one order that had them';
  return together>=orders?`on all ${orders} orders that had them`:`on ${together} of the ${orders} orders that had them`;
}
const WINDOW=`in the last ${HISTORY_MONTHS} months`;

/** The template wording for a chip. Deterministic: the same facts always read the same. */
export function templateWording(upsell:UpsellDraft):UpsellWording{
  const {item,qty}=upsell;
  const unit=packUnit(item.pack);
  const addTitle=`${item.description} (${item.pack.toLowerCase()})`;
  switch(upsell.kind){
    case 'matching_fastener':{
      const {bolt,bolt_pieces,pack_pieces,history}=upsell.evidence;
      const bolts=`${bolt.diameter}-${bolt.thread} Grade ${bolt.grade} bolts`;
      const cover=bolt_pieces!==null&&pack_pieces!==null?`: ${countOf(qty,unit)} of ${pack_pieces} ${qty===1?'covers':'cover'} all ${bolt_pieces}.`:' on this quote.';
      const bought=history?` Bought with these bolts ${onOrders(history.orders_together,history.anchor_orders)} ${WINDOW}.`:'';
      return {title:addTitle,reason:`Matches the ${bolts}${cover}${bought}`};
    }
    case 'full_case':{
      const {case_qty,from_qty,to_qty,cases}=upsell.evidence;
      const title=`Bump ${itemNoun(item.description)} to ${countOf(to_qty,unit)} (${cases} full ${cases===1?'case':'cases'})`;
      const reason=from_qty<case_qty?`A full case is ${countOf(case_qty,unit)}; ${from_qty} is a broken case.`
        :`A case holds ${countOf(case_qty,unit)}, so ${from_qty} leaves a broken case.`;
      return {title,reason};
    }
    case 'bought_together':{
      const {orders_together,anchor_orders}=upsell.evidence;
      return {title:addTitle,reason:`Bought with ${itemNoun(upsell.anchor.description)} ${onOrders(orders_together,anchor_orders)} ${WINDOW}.`};
    }
  }
}

/**
 * The chips with a writer's wording (Claude in live mode). Any chip the writer leaves out or
 * blank, or every chip if the writer fails, keeps its template wording, so chips always read.
 */
export async function wordUpsells(upsells:readonly Upsell[],writer?:UpsellWriter):Promise<Upsell[]>{
  if(!writer||!upsells.length)return [...upsells];
  let written:readonly (Partial<UpsellWording>|null|undefined)[]=[];
  try{written=await writer(upsells);}catch{written=[];}
  const pick=(text:unknown,fallback:string)=>typeof text==='string'&&text.trim()?text.trim():fallback;
  return upsells.map((upsell,i)=>{
    const w=written[i];
    return w?{...upsell,wording:{title:pick(w.title,upsell.wording.title),reason:pick(w.reason,upsell.wording.reason)}}:upsell;
  });
}
