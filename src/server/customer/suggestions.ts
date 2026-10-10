import 'server-only';
import type {ItemPopupPayload,PopupSuggestion} from '@/domain';
import {companionCandidates,kindPriority,type CandidateFacts,type CandidateItem,type CoPurchaseEvidence} from '@/server/companions/candidates';
import {itemNoun} from '@/server/companions/words';
import {catalogItem,catalogItems,coPurchases,enabledCategories,purchasedItems,stockForItems} from '@/server/repository/customer';
import {suggestionPicker} from './suggestion-picker';

// "Frequently bought together" in the item pop-up (decision 37, spec §10, task E1). Customer-facing,
// so it reads only the customer-safe repository and never a price or cost (boundary.test.ts):
// 1. The pool: what the cost-free companion rules (src/server/companions) find for the cart: the
//    nut and washer for a graded bolt, and items the customer buys on the same orders as a cart
//    item. Only catalog items in stock at the pop-up's branch and not already in the cart.
// 2. The picks: in live mode Claude chooses up to 3 from the pool and writes a short reason in the
//    rep chips' style (./suggestion-picker); in scripted mode (no key, QUERENT_SCRIPTED=1: CI, E2E,
//    the demo) the first 3 of the pool with template reasons. Claude's answer is validated here:
//    a SKU not in the pool is dropped, so the model can never introduce an item.
// 3. The payload: identity and reason only, stored on the pop-up message with the offered count
//    (OA-13), which is the Team dashboard's acceptance-rate denominator. Request quote accepts these
//    SKUs and stores them as added_by 'suggestion' (src/server/intake/quote-request.ts).

/** The pop-up shows at most this many (OA-23)... */
export const MAX_SUGGESTIONS=3;
/** ...and at least this many when the pool has them (decision 37); fewer candidates show what exists. */
export const MIN_SUGGESTIONS=2;
export const REASON_MAX=200;
/** History counts cover this many months up to today (the rep chips' window, spec §5.1). */
export const HISTORY_MONTHS=12;

/** One candidate in the pool: identity and cost-free evidence. */
export interface PoolItem{
  item_id:string;sku:string;description:string;pack:string;
  kind:'matching_fastener'|'bought_together';
  /** The cart item that led to it. */
  anchor:{sku:string;description:string};
  /** matching_fastener only: the part and the bolt it fits. */
  part?:'nut'|'washer';bolt?:{diameter:string;thread:string;grade:string};
  /** How many of the customer's orders with the anchor also had this item; null when below the thresholds. */
  history:CoPurchaseEvidence|null;
}

/** What buildPool reads; the adapter (suggestionPool) loads it through the customer-safe repository. */
export interface PoolFacts extends Omit<CandidateFacts,'lines'|'options'>{
  /** The cart, in line order. */
  cart:readonly {item_id:string;qty:number}[];
  /** Units available at the pop-up's branch, by item. An item left out has none. */
  available:Readonly<Record<string,number>>;
}

/** What the live picker is told: the cart and the pool, as plain cost-free facts. */
export interface PickerInput{
  cart:{sku:string;description:string;pack:string;qty:number}[];
  candidates:(Omit<PoolItem,'item_id'|'kind'>&{rule:PoolItem['kind'];history_months:number;template_reason:string})[];
}
/** The model's answer: SKUs from the pool, best first, each with a short reason. Validated by validatePicks. */
export interface SuggestionPick{sku:unknown;reason?:unknown}
export type SuggestionPicker=(input:PickerInput)=>Promise<readonly SuggestionPick[]>;

/**
 * The pool for a cart (pure): companion candidates that add an item (a full-case bump isn't one),
 * from the catalog, in stock at the branch, not in the cart. Ordered by cart line, then rule (the
 * matching fastener first), then the strongest history, so scripted mode's "first N" is stable.
 */
export function buildPool(facts:PoolFacts):PoolItem[]{
  const lines=facts.cart.map((l,i)=>({id:`cart:${i}`,item_id:l.item_id,qty:l.qty}));
  const inCart=new Set(facts.cart.map(l=>l.item_id));
  const inCatalog=new Set(facts.catalog.map(i=>i.id));
  const candidates=companionCandidates({lines,catalog:facts.catalog,purchased:facts.purchased,coPurchases:facts.coPurchases})
    .map((c,order)=>({c,order}))
    .filter(({c})=>c.kind!=='full_case'&&c.action.type==='add_line'&&inCatalog.has(c.item.id)&&!inCart.has(c.item.id)&&(facts.available[c.item.id]??0)>0);
  const strength=(c:typeof candidates[number]['c'])=>c.kind==='bought_together'?c.evidence.orders_together:0;
  candidates.sort((a,b)=>a.c.anchorIndex-b.c.anchorIndex||kindPriority(a.c.kind)-kindPriority(b.c.kind)||strength(b.c)-strength(a.c)||a.order-b.order);
  return candidates.map(({c}):PoolItem=>{
    const base={item_id:c.item.id,sku:c.item.sku,description:c.item.description,pack:c.item.pack,anchor:{sku:c.anchor.sku,description:c.anchor.description}};
    if(c.kind==='matching_fastener')return {...base,kind:'matching_fastener',part:c.evidence.part,bolt:c.evidence.bolt,history:c.evidence.history};
    return {...base,kind:'bought_together',history:c.kind==='bought_together'?c.evidence:null};
  });
}

function onYourOrders({orders_together:together,anchor_orders:orders}:CoPurchaseEvidence){
  if(orders===1)return 'on your one order that had them';
  return together>=orders?`on all ${orders} of your orders that had them`:`on ${together} of your ${orders} orders that had them`;
}

/** The scripted reason for a candidate, in the rep chips' style (src/server/upsells/wording). Deterministic. */
export function templateReason(item:PoolItem):string{
  const window=`in the last ${HISTORY_MONTHS} months`;
  if(item.kind==='matching_fastener'&&item.bolt){
    const {diameter,thread,grade}=item.bolt;
    const bought=item.history?` Bought with these bolts ${onYourOrders(item.history)} ${window}.`:'';
    return `Matches the ${diameter}-${thread} Grade ${grade} bolts on your list.${bought}`;
  }
  return item.history?`Bought with ${itemNoun(item.anchor.description)} ${onYourOrders(item.history)} ${window}.`:`Often bought with ${itemNoun(item.anchor.description)}.`;
}

/** Words a reason may not use: the model never sees a price, cost or margin, so any mention would be made up. */
const MADE_UP=/[$%¢€£]|\b(cost|costs|margin|margins|profit|profits|discount|discounted|price|prices|priced|pricing|cheap|cheaper|savings?|save|deal)\b/i;
const acceptableReason=(reason:unknown):string|null=>{
  if(typeof reason!=='string')return null;
  const text=reason.trim();
  return text.length>=3&&text.length<=REASON_MAX&&!/[\r\n]/.test(text)&&!MADE_UP.test(text)?text:null;
};

const asSuggestion=(item:PoolItem,reason:string):PopupSuggestion=>({item_id:item.item_id,sku:item.sku,description:item.description,pack:item.pack,reason});

/**
 * The pop-up's suggestions from the model's picks: only SKUs in the pool (case-insensitive), each
 * once, in the model's order, at most MAX_SUGGESTIONS. A reason that is missing, too long, more than
 * one line or about money gets the template. When fewer than MIN_SUGGESTIONS survive, the pool tops
 * them up in its order. Anything else the model sent is ignored.
 */
export function validatePicks(pool:readonly PoolItem[],picks:readonly SuggestionPick[]):PopupSuggestion[]{
  const bySku=new Map(pool.map(item=>[item.sku.toUpperCase(),item]));
  const chosen=new Map<string,PopupSuggestion>();
  for(const pick of Array.isArray(picks)?picks:[]){
    if(chosen.size>=MAX_SUGGESTIONS)break;
    const item=typeof pick?.sku==='string'?bySku.get(pick.sku.trim().toUpperCase()):undefined;
    if(!item||chosen.has(item.item_id))continue;
    chosen.set(item.item_id,asSuggestion(item,acceptableReason(pick.reason)??templateReason(item)));
  }
  for(const item of pool){
    if(chosen.size>=Math.min(MIN_SUGGESTIONS,pool.length))break;
    if(!chosen.has(item.item_id))chosen.set(item.item_id,asSuggestion(item,templateReason(item)));
  }
  return [...chosen.values()];
}

/** Scripted mode: the first MAX_SUGGESTIONS of the pool, with template reasons. */
export const scriptedPicks=(pool:readonly PoolItem[]):SuggestionPick[]=>pool.slice(0,MAX_SUGGESTIONS).map(item=>({sku:item.sku,reason:templateReason(item)}));

/** YYYY-MM-DD `months` before `day`, clamped to the month's last day (Mar 31 -> Feb 28). */
function monthsBefore(day:string,months:number){
  const [y,m,d]=day.split('-').map(Number);
  const first=new Date(Date.UTC(y,m-1-months,1));
  const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(d,last))).toISOString().slice(0,10);
}

export interface SuggestionOptions{
  /** The live picker; null or undefined is scripted. Defaults to this server's (suggestionPicker). */
  picker?:SuggestionPicker|null;
  /** Today (YYYY-MM-DD): history is the HISTORY_MONTHS up to and including it. */
  on?:string;
}

/**
 * The pool for a pop-up cart, loaded through the customer-safe repository. Empty without Items &
 * stock (stock decides the pool); without Orders & quotes the customer's order history isn't used,
 * so only the fastener rule applies.
 */
export function suggestionPool(customerId:string,payload:Pick<ItemPopupPayload,'branch_id'|'lines'>,{on=new Date().toISOString().slice(0,10)}:Pick<SuggestionOptions,'on'>={}):PoolItem[]{
  const access=enabledCategories(customerId);
  if(!access.has('items_stock'))return [];
  const cart=payload.lines.flatMap(l=>{const item=catalogItem(l.sku);return item?[{item_id:item.id,qty:l.qty}]:[];});
  if(!cart.length)return [];
  const catalog:CandidateItem[]=catalogItems().map(({id,sku,description,pack,case_qty})=>({id,sku,description,pack,case_qty}));
  const dates={since:monthsBefore(on,HISTORY_MONTHS),until:on};
  const history=access.has('orders_quotes');
  const cartItems=[...new Set(cart.map(l=>l.item_id))];
  const coBought=history?Object.fromEntries(cartItems.map(id=>[id,coPurchases(customerId,id,dates)])):{};
  // Every suggestion is a catalog item (the pool keeps no other), so stock for the catalog covers the pool.
  const available=Object.fromEntries(stockForItems(catalog.map(i=>i.id)).map(s=>[s.item_id,s.branches.find(b=>b.branch_id===payload.branch_id)?.available??0]));
  return buildPool({cart,catalog,available,coPurchases:coBought,
    purchased:history?purchasedItems(customerId,dates).map(({item_id,order_count,last_qty})=>({item_id,order_count,last_qty})):[]});
}

/** The picker's view of a pool: no item ids, the rule's facts, and the template as a starting point. */
function pickerInput(payload:Pick<ItemPopupPayload,'lines'>,pool:readonly PoolItem[]):PickerInput{
  return {
    cart:payload.lines.flatMap(l=>{const item=catalogItem(l.sku);return item?[{sku:item.sku,description:item.description,pack:item.pack,qty:l.qty}]:[];}),
    candidates:pool.map(({item_id:_,kind,...rest})=>({...rest,rule:kind,history_months:HISTORY_MONTHS,template_reason:templateReason({item_id:_,kind,...rest})})),
  };
}

/**
 * The "Frequently bought together" suggestions for a pop-up cart: Claude's picks validated against
 * the pool in live mode, the scripted picks otherwise or whenever Claude fails. [] when the pool is.
 */
export async function popupSuggestions(customerId:string,payload:Pick<ItemPopupPayload,'branch_id'|'lines'>,{picker=suggestionPicker(),on}:SuggestionOptions={}):Promise<PopupSuggestion[]>{
  const pool=suggestionPool(customerId,payload,{on});
  if(!pool.length)return [];
  let picks:readonly SuggestionPick[]=scriptedPicks(pool);
  if(picker){
    try{picks=await picker(pickerInput(payload,pool));}catch{picks=scriptedPicks(pool);}
  }
  return validatePicks(pool,picks);
}

/** The pop-up payload with its suggestions and how many were offered (OA-13), as stored on the item_popup message. */
export async function withSuggestions(customerId:string,payload:ItemPopupPayload,options:SuggestionOptions={}):Promise<ItemPopupPayload>{
  const suggestions=await popupSuggestions(customerId,payload,options);
  return {...payload,suggestions,suggestions_offered:suggestions.length};
}
