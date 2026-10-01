import {CONTENDER_MARGIN,hundredths,type ScoredItem} from './score';
import {parseItem,valueOf,type ItemParts,type MatchableItem} from './text';

// The clarifying question for a line that isn't a confident match (spec §3, task 1.4): name the
// attribute that separates the top candidates, in the customer's terms. "Type 1 or Type 27
// cut-off wheels?", "Grade 5 or Grade 8 hex cap screws?", "27 ft or 30 ft ratchet straps?".

export const NO_MATCH_QUESTION="I couldn't find that item. Can you describe it another way, or give the SKU?";
/** At most this many contenders are compared. */
const MAX_CONTENDERS=6;
/** The order attributes are asked about. Sizes (the slots, in description order) come after class. */
const FIRST=['name','type','grade','thread','class'];
const LATER=['film','tier','gauge','grit','mil','size','color','finish','hook','tpi'];
const SIZE_ORDER=['XS','S','M','L','XL','XXL'];

const joinOr=(parts:string[])=>parts.length<2?parts.join(''):`${parts.slice(0,-1).join(', ')} or ${parts.at(-1)}`;
const sentence=(text:string)=>text.charAt(0).toUpperCase()+text.slice(1);

/** Candidates within the contender margin of the best, best first. */
function contenders<T extends MatchableItem>(candidates:readonly ScoredItem<T>[]){
  const sorted=[...candidates].sort((a,b)=>b.score-a.score);
  const best=sorted[0]?hundredths(sorted[0].score):0;
  return sorted.filter(c=>hundredths(c.score)>=best-hundredths(CONTENDER_MARGIN)).slice(0,MAX_CONTENDERS);
}

/** The first key, in asking order, with at least two different values: first among keys every contender has. */
function separatingKey(items:readonly ItemParts[]){
  const slots=[...new Set(items.flatMap(i=>i.slots.map(s=>s.key)))];
  const keys=[...FIRST,...slots,...LATER];
  const values=(key:string)=>items.map(i=>valueOf(i,key));
  const distinct=(key:string)=>new Set(values(key).filter(v=>v!==undefined)).size;
  return keys.find(key=>values(key).every(v=>v!==undefined)&&distinct(key)>1)??keys.find(key=>distinct(key)>1);
}

/** The labels of a key's values, one per value: sizes in size order, numbers smallest first, the rest as found. */
function choices(items:readonly ItemParts[],key:string){
  const found=new Map<string,string>();
  for(const item of items){
    const value=valueOf(item,key);
    if(value===undefined||found.has(value))continue;
    const slot=item.slots.find(s=>s.key===key);
    found.set(value,slot?slot.label:item.attrs.filter(a=>a.key===key).map(a=>a.label).join(' / '));
  }
  const entries=[...found];
  if(key==='size')entries.sort(([a],[b])=>SIZE_ORDER.indexOf(a)-SIZE_ORDER.indexOf(b));
  else if(entries.every(([v])=>Number.isFinite(Number(v))))entries.sort(([a],[b])=>Number(a)-Number(b));
  return entries.map(([,label])=>label);
}

/**
 * The question to ask about a line whose candidates (scored, best first) are not a confident
 * match. It compares the contenders (within 0.15 of the best) and asks about the first attribute,
 * in asking order, that tells them apart. A lone contender gets "Did you mean ...?".
 */
export function clarifyingQuestion<T extends MatchableItem>(candidates:readonly ScoredItem<T>[]){
  const top=contenders(candidates);
  if(!top.length)return NO_MATCH_QUESTION;
  if(top.length===1)return `Did you mean ${top[0].item.description} (${top[0].item.sku})?`;
  const items=top.map(c=>parseItem(c.item));
  const key=separatingKey(items);
  if(!key)return `Which one do you mean: ${joinOr(top.map(({item})=>`${item.description} (${item.sku})`))}?`;
  if(key==='name'){
    // The product most of the contenders are comes first: "Nitrile disposable gloves or cut-resistant gloves?"
    const nouns=items.map(i=>i.noun);
    const count=(noun:string)=>nouns.filter(n=>n===noun).length;
    return sentence(`${joinOr([...new Set(nouns)].sort((a,b)=>count(b)-count(a)))}?`);
  }
  return sentence(`${joinOr(choices(items,key))} ${items[0].noun}?`);
}
