import type {CoPurchase,CostedItem,PriceBasis,PurchasedItem,QuoteLine} from '@/domain';
import {fastenerSpec,matchesBolt,piecesPerPack,sameSize,type FastenerSpec} from './fasteners';
import {formatUsd,templateWording,type UpsellWording} from './wording';

// Upsell rules (spec §5.5, task 1.6). Deterministic: the same facts always give the same chips in
// the same order. Claude only writes the wording (./wording has the template used in scripted mode
// and CI). Three rules:
//   matching_fastener: a graded bolt on the quote -> the nut and the washer of its size and grade.
//   full_case:         a qty that isn't a whole number of cases -> bump it up to the next full case.
//   bought_together:   items the customer often buys on the same orders as a quote item (history).
// Each chip is priced through the pricing engine (task 1.1, injected as `price`) and carries its
// estimated GP gain. Pure, with no server imports; the database adapter is ./service.

export type UpsellKind='matching_fastener'|'full_case'|'bought_together';
/** Rule priority: when two rules suggest the same item, the earlier kind wins. */
export const UPSELL_KINDS:readonly UpsellKind[]=['matching_fastener','full_case','bought_together'];

export interface UpsellOptions{
  /** bought_together: at least this many orders had both items... */
  minOrdersTogether:number;
  /** ...and at least this share of the orders with the quote item (0.5 = half). */
  minShare:number;
  /** At most this many chips; the smallest GP gains are dropped. */
  maxSuggestions:number;
}
export const DEFAULT_UPSELL_OPTIONS:UpsellOptions={minOrdersTogether:2,minShare:0.5,maxSuggestions:6};

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
  purchased:readonly Pick<PurchasedItem,'item_id'|'order_count'|'last_qty'>[];
  /** Items bought on the same orders as each quote item, keyed by the quote item (repository coPurchases, same window). */
  coPurchases:Readonly<Record<string,readonly Pick<CoPurchase,'item_id'|'orders_together'>[]>>;
  /** Units available at the quote's branch, by item. An item left out is not checked. */
  available?:Readonly<Record<string,number>>;
  price:UpsellPricer;
  options?:Partial<UpsellOptions>;
}

/** Add a new line, or change the qty of a line already on the quote. */
export type UpsellAction=
  |{type:'add_line';item_id:string;qty:number}
  |{type:'set_qty';line_id:string;item_id:string;from_qty:number;to_qty:number};

/** The quote line that led to the chip (for full_case, the line being bumped). */
export interface UpsellAnchor{line_id:string;item_id:string;sku:string;description:string}

/** How often the chip's item was bought with the anchor item: on `orders_together` of the `anchor_orders` orders that had the anchor. */
export interface CoPurchaseEvidence{orders_together:number;anchor_orders:number}
export interface FastenerEvidence{
  part:'nut'|'washer';
  bolt:{diameter:string;thread:string;grade:string};
  /** Bolts on the quote the part covers (pieces), and pieces per pack of the part; null when a pack doesn't say. */
  bolt_pieces:number|null;pack_pieces:number|null;
  /** History for the same pair, when it clears the bought_together thresholds. */
  history:CoPurchaseEvidence|null;
}
export interface FullCaseEvidence{case_qty:number;from_qty:number;to_qty:number;cases:number}

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
/** An idea before pricing: everything but price, GP and wording. */
type Candidate=OmitEach<Upsell,'unit_price'|'price_basis'|'unit_cost'|'gp_gain'|'wording'>&{anchorIndex:number};

const cents=(amount:number)=>Math.round(amount*100);
const priority=(kind:UpsellKind)=>UPSELL_KINDS.indexOf(kind);
const itemFacts=({id,sku,description,pack,case_qty}:UpsellItem)=>({id,sku,description,pack,case_qty});
const anchorOf=(line:UpsellLine,item:UpsellItem):UpsellAnchor=>({line_id:line.id,item_id:line.item_id,sku:item.sku,description:item.description});
/** a/b >= share, compared without float noise (2 of 4 is exactly 50%). */
const clearsShare=(together:number,orders:number,share:number)=>orders>0&&together*1e6>=Math.round(share*1e6)*orders;

/**
 * The upsell chips for a quote (spec §5.5), best GP gain first. Never suggests an item already on
 * the quote, and never two chips for one item. A chip is dropped when it can't be priced, adds no
 * GP, or the quote branch can't fill it.
 */
export function suggestUpsells(facts:UpsellFacts):Upsell[]{
  const options={...DEFAULT_UPSELL_OPTIONS,...facts.options};
  const catalog=new Map(facts.catalog.map(item=>[item.id,item]));
  // Anchors: lines with a known item and something to order. Every line counts as "on the quote".
  const onQuote=new Set(facts.lines.map(l=>l.item_id));
  const anchors=facts.lines.flatMap((line,index)=>{const item=catalog.get(line.item_id);return item&&line.qty>0?[{line,item,index}]:[];});
  const purchasedById=new Map(facts.purchased.map(p=>[p.item_id,p]));

  const history=(anchorItemId:string,itemId:string):CoPurchaseEvidence|null=>{
    const anchorOrders=purchasedById.get(anchorItemId)?.order_count??0;
    const together=facts.coPurchases[anchorItemId]?.find(c=>c.item_id===itemId)?.orders_together??0;
    return together>=options.minOrdersTogether&&clearsShare(together,anchorOrders,options.minShare)?{orders_together:together,anchor_orders:anchorOrders}:null;
  };

  const candidates=[
    ...matchingFasteners(anchors,facts.catalog,onQuote,history),
    ...fullCases(anchors),
    ...boughtTogether(anchors,catalog,onQuote,facts.coPurchases,history,purchasedById),
  ];
  // One chip per item: the first rule in UPSELL_KINDS wins (each rule already keeps one per item).
  const byItem=new Map<string,Candidate>();
  for(const c of candidates){const held=byItem.get(c.item.id);if(!held||priority(c.kind)<priority(held.kind))byItem.set(c.item.id,c);}

  // Price every idea in one call: the new qty, and the current qty of an unpriced line being bumped.
  const requests:UpsellPriceRequest[]=[];
  const slot=new Map<string,number>();
  const ask=(itemId:string,qty:number)=>{const key=`${itemId}\u0000${qty}`;if(!slot.has(key)){slot.set(key,requests.length);requests.push({itemId,qty});}return key;};
  const lineOf=new Map(facts.lines.map(l=>[l.id,l]));
  const asks=[...byItem.values()].map(c=>{
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

  const ranked=priced.sort((a,b)=>cents(b.gp_gain)-cents(a.gp_gain)||a.anchorIndex-b.anchorIndex||priority(a.kind)-priority(b.kind)||(a.item.sku<b.item.sku?-1:a.item.sku>b.item.sku?1:0));
  return ranked.slice(0,Math.max(0,Math.floor(options.maxSuggestions))).map(({anchorIndex:_,...upsell})=>upsell as Upsell);
}

type Anchor={line:UpsellLine;item:UpsellItem;index:number};
type History=(anchorItemId:string,itemId:string)=>CoPurchaseEvidence|null;

/** matching_fastener: for each graded bolt, the nut and washer of its size and grade (one each, flat washers and then SKU first). */
function matchingFasteners(anchors:readonly Anchor[],catalog:readonly UpsellItem[],onQuote:ReadonlySet<string>,history:History):Candidate[]{
  const specs=new Map<string,FastenerSpec>();
  for(const item of catalog){const spec=fastenerSpec(item.description);if(spec)specs.set(item.id,spec);}
  const quoteParts=[...onQuote].flatMap(id=>{const s=specs.get(id);return s&&s.kind!=='bolt'?[s]:[];});
  const parts=catalog.filter(item=>specs.get(item.id)?.kind!=='bolt'&&specs.has(item.id))
    .sort((a,b)=>Number(specs.get(b.id)!.flat)-Number(specs.get(a.id)!.flat)||(a.sku<b.sku?-1:a.sku>b.sku?1:0));

  // Several bolt lines can share a nut: its qty covers all of them, anchored on the first.
  const found=new Map<string,{part:UpsellItem;spec:FastenerSpec;bolt:FastenerSpec;first:Anchor;pieces:number|null;packs:number}>();
  for(const anchor of anchors){
    const bolt=specs.get(anchor.item.id);
    if(!bolt||bolt.kind!=='bolt'||bolt.grade===null)continue;
    const boltPieces=piecesPerPack(anchor.item.pack);
    for(const kind of ['nut','washer'] as const){
      const part=parts.find(p=>specs.get(p.id)!.kind===kind&&matchesBolt(bolt,specs.get(p.id)!));
      if(!part||onQuote.has(part.id))continue;
      const spec=specs.get(part.id)!;
      // The customer already has this kind of part in this size on the quote (another grade or style): don't add a second.
      if(quoteParts.some(q=>sameSize(q,spec)))continue;
      const held=found.get(part.id);
      const pieces=boltPieces===null?null:anchor.line.qty*boltPieces;
      if(held){held.pieces=held.pieces===null||pieces===null?null:held.pieces+pieces;held.packs+=anchor.line.qty;}
      else found.set(part.id,{part,spec,bolt,first:anchor,pieces,packs:anchor.line.qty});
    }
  }
  return [...found.values()].map(({part,spec,bolt,first,pieces,packs})=>{
    const packPieces=piecesPerPack(part.pack);
    const qty=pieces!==null&&packPieces!==null?Math.ceil(pieces/packPieces):packs;
    return {id:`matching_fastener:${part.sku}`,kind:'matching_fastener',action:{type:'add_line',item_id:part.id,qty},item:itemFacts(part),qty,
      anchor:anchorOf(first.line,first.item),anchorIndex:first.index,
      evidence:{part:spec.kind as 'nut'|'washer',bolt:{diameter:bolt.diameter,thread:bolt.thread!,grade:bolt.grade!},
        bolt_pieces:packPieces===null?null:pieces,pack_pieces:pieces===null?null:packPieces,history:history(first.item.id,part.id)}};
  });
}

/** full_case: a line whose qty isn't a whole number of cases, bumped up to the next full case. Skips an item on two lines (which to bump is unclear). */
function fullCases(anchors:readonly Anchor[]):Candidate[]{
  const lines=new Map<string,number>();
  for(const {line} of anchors)lines.set(line.item_id,(lines.get(line.item_id)??0)+1);
  return anchors.flatMap(({line,item,index}):Candidate[]=>{
    const caseQty=item.case_qty;
    if(!Number.isInteger(caseQty)||caseQty<=1||lines.get(item.id)!==1||line.qty%caseQty===0)return [];
    const to=Math.ceil(line.qty/caseQty)*caseQty;
    return [{id:`full_case:${item.sku}`,kind:'full_case',action:{type:'set_qty',line_id:line.id,item_id:item.id,from_qty:line.qty,to_qty:to},item:itemFacts(item),qty:to,
      anchor:anchorOf(line,item),anchorIndex:index,evidence:{case_qty:caseQty,from_qty:line.qty,to_qty:to,cases:to/caseQty}}];
  });
}

/**
 * bought_together: items bought on at least minOrdersTogether of the orders that had a quote item,
 * and on at least minShare of them. The qty is what the customer bought last time. When several
 * quote items point at one item, the strongest evidence wins (most orders together, then the
 * higher share, then the earlier line).
 */
function boughtTogether(anchors:readonly Anchor[],catalog:ReadonlyMap<string,UpsellItem>,onQuote:ReadonlySet<string>,
  coPurchases:UpsellFacts['coPurchases'],history:History,purchased:ReadonlyMap<string,Pick<PurchasedItem,'last_qty'>>):Candidate[]{
  const best=new Map<string,Candidate&{kind:'bought_together'}>();
  const seen=new Set<string>();
  for(const anchor of anchors){
    if(seen.has(anchor.item.id))continue;
    seen.add(anchor.item.id);
    for(const {item_id} of coPurchases[anchor.item.id]??[]){
      const item=catalog.get(item_id);
      const evidence=item&&!onQuote.has(item_id)?history(anchor.item.id,item_id):null;
      if(!item||!evidence)continue;
      const held=best.get(item_id);
      if(held&&!stronger(evidence,held.evidence))continue;
      const last=purchased.get(item_id)?.last_qty;
      const qty=Number.isInteger(last)&&last!>0?last!:1;
      best.set(item_id,{id:`bought_together:${item.sku}`,kind:'bought_together',action:{type:'add_line',item_id,qty},item:itemFacts(item),qty,
        anchor:anchorOf(anchor.line,anchor.item),anchorIndex:anchor.index,evidence});
    }
  }
  return [...best.values()];
}

/** More orders together wins; then the higher share. A tie keeps the earlier line. */
function stronger(a:CoPurchaseEvidence,b:CoPurchaseEvidence){
  if(a.orders_together!==b.orders_together)return a.orders_together>b.orders_together;
  return a.orders_together*b.anchor_orders>b.orders_together*a.anchor_orders;
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
