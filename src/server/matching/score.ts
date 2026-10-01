import {differingKeys,parseItem,parseQuery,type ItemParts,type MatchableItem,type Measure,type Attr,type QueryParts} from './text';

// SKU match scoring and the confidence rule (spec §3, task 1.4). A line is confident only with one
// clear winner. Pure, with no server imports: the chat tools pass in the catalog and the customer's
// order history (src/server/chat/tools.ts).
//
// score = how much of what the customer said the item matches (0 to 1):
//   - each attribute (thread 1/2-13, Grade 8, Type 27, 30 ft, size L, ...) weighs 2, each word 1;
//   - an attribute the item contradicts (Grade 5 for "grade 8") subtracts its weight, one it lacks adds nothing;
//   - the item's keywords count as its words, so "bolts" finds hex cap screws;
//   - words the catalog doesn't know still count, so "stainless hex bolts" is never a confident match;
//   - an item whose product noun the line doesn't name is scaled by 0.6 (a nut for "bolts", an edge
//     protector for "ratchet straps");
//   - a SKU typed in the line wins outright.
// Then order history, among the contenders (the items within 0.15 of the best text score):
//   - "the usual ..." blends in how often each contender was ordered, weight 0.3;
//   - otherwise, when the contenders differ in one size only (length, width, diameter, thread, glove
//     size, or a box's bundle/pallet tier), history fills it in with weight 0.2: Dana's "1/2 in grade 8 hex bolts" are the 2 in
//     ones she always buys. A missing type, grade, grit, color or other spec is always asked.

/** A line is confident when the top score is at least minScore and at least minLead ahead of the next. */
export const CONFIDENCE={minScore:0.75,minLead:0.15} as const;
export interface ConfidenceRule {minScore:number;minLead:number}
/** What each thing the customer said is worth. */
export const WEIGHTS={attribute:2,word:1} as const;
/** The factor for an item whose product noun the line doesn't name. */
export const OFF_NOUN=0.6;
/** How much order history counts: when the line says "the usual", and when it fills in one missing size. */
export const HISTORY={usual:0.3,fill:0.2} as const;
/** Items within this of the best text score are the ones the words alone can't separate. */
export const CONTENDER_MARGIN=CONFIDENCE.minLead;
/** When the line has a SKU in it, every other item's score is multiplied by this. */
const BESIDE_TYPED_SKU=0.5;

/** Product nouns a line can name besides the catalog's own ("bolt" for hex cap screws). */
const COMMON_NOUNS=['bolt','screw','nut','washer','anchor','rivet','pin','wheel','disc','blade','brush','glove','glass','goggle','vest','hat',
  'strap','chain','binder','sling','rope','tape','bag','liner','towel','rag','marker','knife','bit','socket','wrench'];

/** The customer's order count per SKU (the purchasedItems repository row fits). */
export interface Purchase {sku:string;order_count:number;last_order_date?:string;last_qty?:number}
export interface ScoredItem<T> {item:T;score:number}

/** n in hundredths, without float noise: 0.95 - 0.8 is 15, not 14.999... */
export const hundredths=(n:number)=>Math.round(Number((n*100).toPrecision(12)));
const round2=(n:number)=>hundredths(n)/100;
const sameNumber=(a:number,b:number)=>Math.abs(a-b)<1e-9;
const FILLABLE=(key:string)=>key==='thread'||key==='size'||key==='tier'||key.includes('#');

/** +1 when the item has the attribute, -1 when it has a different value for it, 0 when it has none. */
function attrFit({key,value}:Attr,item:ItemParts){
  const have=item.attrs.filter(a=>a.key===key);
  return have.some(a=>a.value===value)?1:have.length?-1:0;
}

/**
 * The same for a measure. A number with no unit matches any unit. A thread's diameter matches but never contradicts.
 * Each of the item's measures matches once (`used`), so "12x9x9" is not a 12x9x6 box.
 */
function measureFit(m:Measure,item:ItemParts,used:Set<number>){
  const comparable=item.measures.map((x,i)=>({x,i})).filter(({x})=>!m.unit||!x.unit||x.unit===m.unit);
  const hit=comparable.find(({x,i})=>!used.has(i)&&sameNumber(x.value,m.value));
  if(hit){used.add(hit.i);return 1;}
  return comparable.some(({x})=>!x.implied&&(!m.unit||x.unit===m.unit))?-1:0;
}

function textScore(query:QueryParts,item:ItemParts,nouns:ReadonlySet<string>){
  let total=0,got=0;
  const add=(weight:number,fit:number)=>{total+=weight;got+=weight*fit;};
  for(const attr of query.attrs)add(WEIGHTS.attribute,attrFit(attr,item));
  const used=new Set<number>();
  for(const measure of query.measures)add(WEIGHTS.attribute,measureFit(measure,item,used));
  for(const word of query.words)add(WEIGHTS.word,item.words.has(word)?1:0);
  if(!total)return 0;
  const score=Math.max(0,got)/total;
  const named=query.words.filter(w=>nouns.has(w));
  const offNoun=named.length>0&&!named.some(w=>w===item.head||item.keywords.has(w));
  return offNoun?score*OFF_NOUN:score;
}

interface Scored<T> {item:T;parts:ItemParts;index:number;text:number;orders:number}

/** Text scores for every item, before order history. */
function scoreText<T extends MatchableItem>(query:string,catalog:readonly T[],purchases:readonly Purchase[]=[]){
  const parts=catalog.map(parseItem);
  const q=parseQuery(query,catalog.map(i=>i.sku));
  const nouns=new Set([...COMMON_NOUNS,...parts.map(p=>p.head)]);
  const orders=new Map(purchases.map(p=>[p.sku.toUpperCase(),p.order_count]));
  const typed=new Set(q.skus);
  const scored=catalog.map((item,index):Scored<T>=>{
    const text=textScore(q,parts[index],nouns);
    return {item,parts:parts[index],index,orders:orders.get(item.sku.toUpperCase())??0,
      text:typed.size?(typed.has(item.sku)?1:text*BESIDE_TYPED_SKU):text};
  });
  return {q,scored};
}

/** The items the words can't separate: within CONTENDER_MARGIN of the best score. */
function contendersOf<T>(scored:readonly Scored<T>[],score:(s:Scored<T>)=>number){
  const best=Math.max(0,...scored.map(score));
  return best>0?scored.filter(s=>hundredths(score(s))>=hundredths(best)-hundredths(CONTENDER_MARGIN)):[];
}

/** How much history counts for this line: "the usual", one missing size, or not at all. */
function historyWeight(q:QueryParts,contenders:readonly Scored<unknown>[]){
  if(!contenders.some(c=>c.orders>0))return 0;
  if(q.usual)return HISTORY.usual;
  if(contenders.length<2)return 0;
  const differ=differingKeys(contenders.map(c=>c.parts));
  return differ.length===1&&FILLABLE(differ[0])?HISTORY.fill:0;
}

const byScore=<T>(score:(s:Scored<T>)=>number)=>(a:Scored<T>,b:Scored<T>)=>score(b)-score(a)||b.orders-a.orders||a.index-b.index;

/**
 * Every catalog item that matches `query` at all, best first, scored 0 to 1 (hundredths). Pass the
 * customer's `purchases` to let order history resolve "the usual" and fill in a missing size.
 * Ties go to what the customer orders most, then catalog order.
 */
export function scoreItems<T extends MatchableItem>(query:string,catalog:readonly T[],{purchases=[]}:{purchases?:readonly Purchase[]}={}):ScoredItem<T>[]{
  const {q,scored}=scoreText(query,catalog,purchases);
  const contenders=contendersOf(scored,s=>s.text);
  const weight=historyWeight(q,contenders);
  const most=Math.max(0,...contenders.map(c=>c.orders));
  const final=new Map(scored.map(s=>[s,round2(s.text*(1-weight)+(weight&&contenders.includes(s)?weight*s.orders/most:0))]));
  const score=(s:Scored<T>)=>final.get(s)!;
  return scored.filter(s=>score(s)>0).sort(byScore(score)).map(s=>({item:s.item,score:score(s)}));
}

/** The contenders on text alone, most ordered first: what "the usual" means for this line (usual.ts). */
export function textContenders<T extends MatchableItem>(query:string,catalog:readonly T[],purchases:readonly Purchase[]){
  const {scored}=scoreText(query,catalog,purchases);
  return contendersOf(scored,s=>s.text).sort(byScore(s=>s.text)).map(({item,orders})=>({item,orders}));
}

/**
 * The confidence rule: one clear winner. The top score must be at least `rule.minScore` and at least
 * `rule.minLead` ahead of the next (a lone candidate leads by its whole score). Compared in hundredths,
 * the precision scores are shown in. The candidates need not be sorted.
 */
export function isConfident(candidates:readonly {score:number}[],rule:ConfidenceRule=CONFIDENCE){
  if(!candidates.length)return false;
  const [top,next=0]=candidates.map(c=>hundredths(c.score)).sort((a,b)=>b-a);
  return top>=hundredths(rule.minScore)&&top-next>=hundredths(rule.minLead);
}
