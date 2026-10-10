import type {CostedItem,PriceBasis,QuoteLine} from '@/domain';
import {companionCandidates,DEFAULT_CANDIDATE_OPTIONS,kindPriority,type Candidate,type CandidateFacts,type CandidateOptions,type CoPurchaseEvidence,
  type FastenerEvidence,type FullCaseEvidence,type UpsellAction,type UpsellAnchor} from '@/server/companions/candidates';
import {formatUsd,templateWording,type UpsellWording} from './wording';

// Upsell rules (spec §5.5, task 1.6). Deterministic: the same facts always give the same chips in
// the same order. Claude only writes the wording (./wording has the template used in scripted mode
// and CI). The ideas come from the cost-free companion rules (src/server/companions/candidates:
// matching_fastener, full_case, bought_together), shared with the customer pop-up's suggestions.
// Each chip is priced through the pricing engine (task 1.1, injected as `price`) and carries its
// estimated GP gain. Pure, with no server imports; the database adapter is ./service.
// Chips are internal (rep portal only): they carry unit cost and GP. Never send one to a customer.

export {UPSELL_KINDS} from '@/server/companions/candidates';
export type {CoPurchaseEvidence,FastenerEvidence,FullCaseEvidence,UpsellAction,UpsellAnchor,UpsellKind} from '@/server/companions/candidates';

export interface UpsellOptions extends CandidateOptions{
  /** At most this many chips; the smallest GP gains are dropped. */
  maxSuggestions:number;
}
export const DEFAULT_UPSELL_OPTIONS:UpsellOptions={...DEFAULT_CANDIDATE_OPTIONS,maxSuggestions:6};

/** What the rules read from a quote line (QuoteLine has all of it). */
export type UpsellLine=Pick<QuoteLine,'id'|'item_id'|'qty'|'unit_price'|'unit_cost'>;
/** What the rules read from the costed catalog (CostedItem has all of it). */
export type UpsellItem=Pick<CostedItem,'id'|'sku'|'description'|'pack'|'case_qty'|'cost'>;

export interface UpsellPriceRequest{itemId:string;qty:number}
/** Querent's suggested price for a line (task 1.1). */
export interface UpsellPrice{price:number;basis:PriceBasis|null}
/**
 * Prices prospective lines with the pricing engine: one result per request, in order, null when
 * the line can't be priced. The server wires it to task 1.1's priceLines (./service, pricerFor).
 */
export type UpsellPricer=(lines:readonly UpsellPriceRequest[])=>readonly (UpsellPrice|null)[];

export interface UpsellFacts{
  /** The quote's lines, in line order. */
  lines:readonly UpsellLine[];
  /** The costed catalog: nuts and washers are found here, and each chip's item and unit cost. */
  catalog:readonly UpsellItem[];
  /** The customer's purchase summary over the history window (repository purchasedItems): order counts and last qty. */
  purchased:CandidateFacts['purchased'];
  /** Items bought on the same orders as each quote item, keyed by the quote item (repository coPurchases, same window). */
  coPurchases:CandidateFacts['coPurchases'];
  /** Units available at the quote's branch, by item. An item left out is not checked. */
  available?:Readonly<Record<string,number>>;
  price:UpsellPricer;
  options?:Partial<UpsellOptions>;
}

interface UpsellBase{
  /** Stable key: `${kind}:${sku}`. There is at most one chip per item. */
  id:string;
  action:UpsellAction;
  item:Pick<UpsellItem,'id'|'sku'|'description'|'pack'|'case_qty'>;
  /** The qty the chip adds (add_line) or the line's new qty (set_qty). */
  qty:number;
  /** Querent's price at that qty (task 1.1) and its basis. */
  unit_price:number;price_basis:PriceBasis|null;unit_cost:number;
  /** "+$X GP": the gross profit the chip adds to the quote, to the cent. Always above zero. */
  gp_gain:number;
  anchor:UpsellAnchor;
  /** Template wording; Claude may rewrite it (./wording, wordUpsells). */
  wording:UpsellWording;
}
export type Upsell=UpsellBase&(
  |{kind:'matching_fastener';evidence:FastenerEvidence}
  |{kind:'full_case';evidence:FullCaseEvidence}
  |{kind:'bought_together';evidence:CoPurchaseEvidence});

/** Omit that keeps a union's kinds apart (a plain Omit would merge their evidence types). */
type OmitEach<T,K extends PropertyKey>=T extends unknown?Omit<T,K>:never;
/** A chip before its wording is written (what templateWording reads). */
export type UpsellDraft=OmitEach<Upsell,'wording'>;

const cents=(amount:number)=>Math.round(amount*100);

/**
 * The upsell chips for a quote (spec §5.5), best GP gain first. Never suggests an item already on
 * the quote, and never two chips for one item. A chip is dropped when it can't be priced, adds no
 * GP, or the quote branch can't fill it.
 */
export function suggestUpsells(facts:UpsellFacts):Upsell[]{
  const options={...DEFAULT_UPSELL_OPTIONS,...facts.options};
  const catalog=new Map(facts.catalog.map(item=>[item.id,item]));
  const byItem=new Map(companionCandidates({lines:facts.lines,catalog:facts.catalog,purchased:facts.purchased,coPurchases:facts.coPurchases,options}).map(c=>[c.item.id,c]));

  // Price every idea in one call: the new qty, and the current qty of an unpriced line being bumped.
  const requests:UpsellPriceRequest[]=[];
  const slot=new Map<string,number>();
  const ask=(itemId:string,qty:number)=>{const key=`${itemId}\u0000${qty}`;if(!slot.has(key)){slot.set(key,requests.length);requests.push({itemId,qty});}return key;};
  const lineOf=new Map(facts.lines.map(l=>[l.id,l]));
  const asks=[...byItem.values()].map((c:Candidate)=>{
    const next=ask(c.item.id,c.qty);
    const line=c.action.type==='set_qty'?lineOf.get(c.action.line_id)!:null;
    const now=line&&line.unit_price===null?ask(c.item.id,line.qty):null;
    return {c,next,now,line};
  });
  const prices=requests.length?facts.price(requests):[];
  const priceOf=(key:string)=>{const p=prices[slot.get(key)!];return p&&Number.isFinite(p.price)&&p.price>0?p:null;};

  const priced=asks.flatMap(({c,next,now,line}):(Upsell&{anchorIndex:number})[]=>{
    const p=priceOf(next);
    if(!p)return [];
    const available=facts.available?.[c.item.id];
    if(available!==undefined&&available<c.qty)return [];
    let unitCost:number,gainCents:number;
    if(line){
      // A bump: GP at the new qty and Querent's price, less the line's GP as it stands (at Querent's price if it has none yet).
      const current=line.unit_price??(now?priceOf(now)?.price:null)??null;
      if(current===null)return [];
      unitCost=line.unit_cost;
      gainCents=(cents(p.price)-cents(unitCost))*c.qty-(cents(current)-cents(unitCost))*line.qty;
    }else{
      unitCost=catalog.get(c.item.id)!.cost;
      gainCents=(cents(p.price)-cents(unitCost))*c.qty;
    }
    if(gainCents<=0)return [];
    const upsell={...c,unit_price:p.price,price_basis:p.basis,unit_cost:unitCost,gp_gain:gainCents/100} as Upsell&{anchorIndex:number};
    return [{...upsell,wording:templateWording(upsell)}];
  });

  const ranked=priced.sort((a,b)=>cents(b.gp_gain)-cents(a.gp_gain)||a.anchorIndex-b.anchorIndex||kindPriority(a.kind)-kindPriority(b.kind)||(a.item.sku<b.item.sku?-1:a.item.sku>b.item.sku?1:0));
  return ranked.slice(0,Math.max(0,Math.floor(options.maxSuggestions))).map(({anchorIndex:_,...upsell})=>upsell as Upsell);
}

/** "Up to +$X gross profit": the GP of every chip, to the cent. */
export function upsellGpTotal(upsells:readonly Pick<Upsell,'gp_gain'>[]){
  return upsells.reduce((total,u)=>total+cents(u.gp_gain),0)/100;
}

/** The "Suggested by Querent" header meta (mockup): "4 ideas · up to +$164.10 gross profit". */
export function formatUpsellSummary(upsells:readonly Pick<Upsell,'gp_gain'>[]){
  const count=upsells.length;
  return count?`${count} ${count===1?'idea':'ideas'} · up to +${formatUsd(upsellGpTotal(upsells))} gross profit`:'No ideas for this quote';
}
