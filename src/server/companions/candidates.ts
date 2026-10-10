import type {CatalogItem,CoPurchase,PurchasedItem} from '@/domain';
import {fastenerSpec,matchesBolt,piecesPerPack,sameSize,type FastenerSpec} from './fasteners';

// Companion items: what goes with the items on a list (spec §5.5, §10). The rules that find them,
// with no price, cost or GP anywhere: the rep's "Suggested by Querent" chips price these ideas
// (src/server/upsells/rules.ts), and the customer pop-up's "Frequently bought together" picks from
// them (src/server/customer/suggestions.ts, task E1), which may not import anything that reads cost.
// Deterministic and pure, with no server imports. Three rules:
//   matching_fastener: a graded bolt on the list -> the nut and the washer of its size and grade.
//   full_case:         a qty that isn't a whole number of cases -> bump it up to the next full case.
//   bought_together:   items the customer often buys on the same orders as a list item (history).

export type UpsellKind='matching_fastener'|'full_case'|'bought_together';
/** Rule priority: when two rules suggest the same item, the earlier kind wins. */
export const UPSELL_KINDS:readonly UpsellKind[]=['matching_fastener','full_case','bought_together'];

export interface CandidateOptions{
  /** bought_together: at least this many orders had both items... */
  minOrdersTogether:number;
  /** ...and at least this share of the orders with the list item (0.5 = half). */
  minShare:number;
}
export const DEFAULT_CANDIDATE_OPTIONS:CandidateOptions={minOrdersTogether:2,minShare:0.5};

/** What the rules read from a list line (a quote line or a pop-up cart line). */
export interface CandidateLine{id:string;item_id:string;qty:number}
/** What the rules read from the catalog. */
export type CandidateItem=Pick<CatalogItem,'id'|'sku'|'description'|'pack'|'case_qty'>;

export interface CandidateFacts{
  /** The list's lines, in line order. Every line counts as "on the list". */
  lines:readonly CandidateLine[];
  /** The catalog: nuts and washers are found here, and each idea's item. */
  catalog:readonly CandidateItem[];
  /** The customer's purchase summary over the history window: order counts and last qty. */
  purchased:readonly Pick<PurchasedItem,'item_id'|'order_count'|'last_qty'>[];
  /** Items bought on the same orders as each list item, keyed by the list item (same window). */
  coPurchases:Readonly<Record<string,readonly Pick<CoPurchase,'item_id'|'orders_together'>[]>>;
  options?:Partial<CandidateOptions>;
}

/** Add a new line, or change the qty of a line already on the list. */
export type UpsellAction=
  |{type:'add_line';item_id:string;qty:number}
  |{type:'set_qty';line_id:string;item_id:string;from_qty:number;to_qty:number};

/** The list line that led to the idea (for full_case, the line being bumped). */
export interface UpsellAnchor{line_id:string;item_id:string;sku:string;description:string}

/** How often the idea's item was bought with the anchor item: on `orders_together` of the `anchor_orders` orders that had the anchor. */
export interface CoPurchaseEvidence{orders_together:number;anchor_orders:number}
export interface FastenerEvidence{
  part:'nut'|'washer';
  bolt:{diameter:string;thread:string;grade:string};
  /** Bolts on the list the part covers (pieces), and pieces per pack of the part; null when a pack doesn't say. */
  bolt_pieces:number|null;pack_pieces:number|null;
  /** History for the same pair, when it clears the bought_together thresholds. */
  history:CoPurchaseEvidence|null;
}
export interface FullCaseEvidence{case_qty:number;from_qty:number;to_qty:number;cases:number}

interface CandidateBase{
  /** Stable key: `${kind}:${sku}`. There is at most one idea per item. */
  id:string;
  action:UpsellAction;
  item:CandidateItem;
  /** The qty the idea adds (add_line) or the line's new qty (set_qty). */
  qty:number;
  anchor:UpsellAnchor;
  /** The anchor line's position on the list (ties rank by it). */
  anchorIndex:number;
}
/** An idea before any pricing: no price, cost or GP. */
export type Candidate=CandidateBase&(
  |{kind:'matching_fastener';evidence:FastenerEvidence}
  |{kind:'full_case';evidence:FullCaseEvidence}
  |{kind:'bought_together';evidence:CoPurchaseEvidence});

export const kindPriority=(kind:UpsellKind)=>UPSELL_KINDS.indexOf(kind);
const itemFacts=({id,sku,description,pack,case_qty}:CandidateItem)=>({id,sku,description,pack,case_qty});
const anchorOf=(line:CandidateLine,item:CandidateItem):UpsellAnchor=>({line_id:line.id,item_id:line.item_id,sku:item.sku,description:item.description});
/** a/b >= share, compared without float noise (2 of 4 is exactly 50%). */
const clearsShare=(together:number,orders:number,share:number)=>orders>0&&together*1e6>=Math.round(share*1e6)*orders;

/**
 * Every idea for a list, one per item (the first rule in UPSELL_KINDS wins), in rule order. Never
 * an item already on the list. Not ranked: the rep chips rank by GP gain, the pop-up by evidence.
 */
export function companionCandidates(facts:CandidateFacts):Candidate[]{
  const options={...DEFAULT_CANDIDATE_OPTIONS,...facts.options};
  const catalog=new Map(facts.catalog.map(item=>[item.id,item]));
  // Anchors: lines with a known item and something to order. Every line counts as "on the list".
  const onList=new Set(facts.lines.map(l=>l.item_id));
  const anchors=facts.lines.flatMap((line,index)=>{const item=catalog.get(line.item_id);return item&&line.qty>0?[{line,item,index}]:[];});
  const purchasedById=new Map(facts.purchased.map(p=>[p.item_id,p]));

  const history=(anchorItemId:string,itemId:string):CoPurchaseEvidence|null=>{
    const anchorOrders=purchasedById.get(anchorItemId)?.order_count??0;
    const together=facts.coPurchases[anchorItemId]?.find(c=>c.item_id===itemId)?.orders_together??0;
    return together>=options.minOrdersTogether&&clearsShare(together,anchorOrders,options.minShare)?{orders_together:together,anchor_orders:anchorOrders}:null;
  };

  const candidates=[
    ...matchingFasteners(anchors,facts.catalog,onList,history),
    ...fullCases(anchors),
    ...boughtTogether(anchors,catalog,onList,facts.coPurchases,history,purchasedById),
  ];
  // One idea per item: the first rule in UPSELL_KINDS wins (each rule already keeps one per item).
  const byItem=new Map<string,Candidate>();
  for(const c of candidates){const held=byItem.get(c.item.id);if(!held||kindPriority(c.kind)<kindPriority(held.kind))byItem.set(c.item.id,c);}
  return [...byItem.values()];
}

type Anchor={line:CandidateLine;item:CandidateItem;index:number};
type History=(anchorItemId:string,itemId:string)=>CoPurchaseEvidence|null;

/** matching_fastener: for each graded bolt, the nut and washer of its size and grade (one each, flat washers and then SKU first). */
function matchingFasteners(anchors:readonly Anchor[],catalog:readonly CandidateItem[],onList:ReadonlySet<string>,history:History):Candidate[]{
  const specs=new Map<string,FastenerSpec>();
  for(const item of catalog){const spec=fastenerSpec(item.description);if(spec)specs.set(item.id,spec);}
  const listParts=[...onList].flatMap(id=>{const s=specs.get(id);return s&&s.kind!=='bolt'?[s]:[];});
  const parts=catalog.filter(item=>specs.get(item.id)?.kind!=='bolt'&&specs.has(item.id))
    .sort((a,b)=>Number(specs.get(b.id)!.flat)-Number(specs.get(a.id)!.flat)||(a.sku<b.sku?-1:a.sku>b.sku?1:0));

  // Several bolt lines can share a nut: its qty covers all of them, anchored on the first.
  const found=new Map<string,{part:CandidateItem;spec:FastenerSpec;bolt:FastenerSpec;first:Anchor;pieces:number|null;packs:number}>();
  for(const anchor of anchors){
    const bolt=specs.get(anchor.item.id);
    if(!bolt||bolt.kind!=='bolt'||bolt.grade===null)continue;
    const boltPieces=piecesPerPack(anchor.item.pack);
    for(const kind of ['nut','washer'] as const){
      const part=parts.find(p=>specs.get(p.id)!.kind===kind&&matchesBolt(bolt,specs.get(p.id)!));
      if(!part||onList.has(part.id))continue;
      const spec=specs.get(part.id)!;
      // The customer already has this kind of part in this size on the list (another grade or style): don't add a second.
      if(listParts.some(q=>sameSize(q,spec)))continue;
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
 * bought_together: items bought on at least minOrdersTogether of the orders that had a list item,
 * and on at least minShare of them. The qty is what the customer bought last time. When several
 * list items point at one item, the strongest evidence wins (most orders together, then the
 * higher share, then the earlier line).
 */
function boughtTogether(anchors:readonly Anchor[],catalog:ReadonlyMap<string,CandidateItem>,onList:ReadonlySet<string>,
  coPurchases:CandidateFacts['coPurchases'],history:History,purchased:ReadonlyMap<string,Pick<PurchasedItem,'last_qty'>>):Candidate[]{
  const best=new Map<string,Candidate&{kind:'bought_together'}>();
  const seen=new Set<string>();
  for(const anchor of anchors){
    if(seen.has(anchor.item.id))continue;
    seen.add(anchor.item.id);
    for(const {item_id} of coPurchases[anchor.item.id]??[]){
      const item=catalog.get(item_id);
      const evidence=item&&!onList.has(item_id)?history(anchor.item.id,item_id):null;
      if(!item||!evidence)continue;
      const held=best.get(item_id);
      if(held&&!strongerEvidence(evidence,held.evidence))continue;
      const last=purchased.get(item_id)?.last_qty;
      const qty=Number.isInteger(last)&&last!>0?last!:1;
      best.set(item_id,{id:`bought_together:${item.sku}`,kind:'bought_together',action:{type:'add_line',item_id,qty},item:itemFacts(item),qty,
        anchor:anchorOf(anchor.line,anchor.item),anchorIndex:anchor.index,evidence});
    }
  }
  return [...best.values()];
}

/** More orders together wins; then the higher share. A tie keeps the earlier line. */
export function strongerEvidence(a:CoPurchaseEvidence,b:CoPurchaseEvidence){
  if(a.orders_together!==b.orders_together)return a.orders_together>b.orders_together;
  return a.orders_together*b.anchor_orders>b.orders_together*a.anchor_orders;
}
