import type {CatalogItem,PurchasedItem} from '@/domain';

export const CONFIDENCE_FLOOR=.75;
export const CONFIDENCE_LEAD=.15;
const LEXICAL_WEIGHT=.82;
const HISTORY_WEIGHT=.18;

export interface ScoredCandidate extends CatalogItem {
  score:number;
  lexicalScore:number;
  historyBoost:number;
}

const REQUEST_WORDS=new Set([
  'a','also','and','box','boxes','case','cases','can','each','for','get','i','me','need','of','pack','packs','please','quote','some','ten','the','us','usual','want','we','with',
]);

/** Canonicalize the handful of industrial terms customers and the catalog phrase differently. */
function canonical(text:string){
  return text.normalize('NFKC').toLowerCase()
    .replaceAll('½','1/2')
    .replace(/\b(?:one\s+)?half[ -]inch\b/g,'1/2 in')
    .replace(/\bextra[ -]large\b/g,'xl')
    .replace(/\bsize\s+large\b/g,'size l')
    .replace(/\bsize\s+medium\b/g,'size m')
    .replace(/\bhex(?:agonal)?\s+bolts?\b/g,'hex cap screw')
    .replace(/\bcut[ -]?off\s+(?:discs?|wheels?)\b/g,'cutoff wheel')
    .replace(/\bflap\s+wheels?\b/g,'flap disc')
    .replace(/\bj[ -]?hooks?\b/g,'jhook')
    .replace(/\bflat[ -]?hooks?\b/g,'flathook')
    .replace(/\b(\d+)\s+(boxes|cases|packs|pieces|pcs|units)\b/g,' ');
}

function concepts(text:string){
  const found=canonical(text).match(/\d+-\d+\/\d+|\d+\/\d+(?:-\d+)?|\.\d+|\d+(?:\.\d+)?|[a-z]+/g)??[];
  const tokens=new Set<string>();
  for(let token of found){
    if(token.length>3&&token.endsWith('s')&&!token.endsWith('ss'))token=token.slice(0,-1);
    if(REQUEST_WORDS.has(token))continue;
    tokens.add(token);
    const thread=/^(\d+\/\d+)-(\d+)$/.exec(token);
    if(thread){tokens.add(thread[1]);tokens.add(thread[2]);}
  }
  return tokens;
}

const round3=(value:number)=>Math.round((value+Number.EPSILON)*1000)/1000;

function lexicalScore(query:Set<string>,item:CatalogItem){
  const searchable=concepts(`${item.sku} ${item.description} ${item.keywords} ${item.category_name}`);
  let matched=0;
  for(const token of query)if(searchable.has(token))matched++;
  let score=matched/query.size;
  // An accessory mentioning its parent product is not itself that product.
  if(searchable.has('protector')&&!query.has('protector'))score-=.2;
  return Math.max(0,Math.min(1,score));
}

/**
 * Score the complete catalog. Lexical evidence contributes 82%; the customer's order frequency
 * contributes at most 18%, enough to break a true tie at the confidence boundary without making
 * a weak textual match look strong. Scores and tie-breaking are stable across input order.
 */
export function scoreCatalog(query:string,items:readonly CatalogItem[],history:readonly PurchasedItem[]=[]):ScoredCandidate[]{
  const queryConcepts=concepts(query);
  if(!queryConcepts.size)return [];
  const maxOrders=Math.max(0,...history.map(item=>item.order_count));
  const orderCounts=new Map(history.map(item=>[item.item_id,item.order_count]));
  return items.map(item=>{
    const lexical=lexicalScore(queryConcepts,item);
    const historyRatio=maxOrders?Math.min(1,(orderCounts.get(item.id)??0)/maxOrders):0;
    const lexicalPart=LEXICAL_WEIGHT*lexical;
    const historyBoost=HISTORY_WEIGHT*historyRatio;
    return {...item,lexicalScore:round3(lexicalPart),historyBoost:round3(historyBoost),score:round3(lexicalPart+historyBoost)};
  }).filter(candidate=>candidate.lexicalScore>=.2)
    .sort((a,b)=>b.score-a.score||a.sku.localeCompare(b.sku));
}

/** A clear winner meets both the absolute score and runner-up gap from spec §3. */
export function isConfident(candidates:readonly ScoredCandidate[]){
  const top=candidates[0];
  if(!top||top.score+Number.EPSILON<CONFIDENCE_FLOOR)return false;
  const second=candidates[1];
  return !second||top.score-second.score+Number.EPSILON>=CONFIDENCE_LEAD;
}

const grade=(description:string)=>/\bgrade\s+(\d+)\b/i.exec(description)?.[1];
const type=(description:string)=>/\btype\s+(\d+)\b/i.exec(description)?.[1];
const length=(description:string)=>/\bx\s*(\d+(?:-\d+\/\d+|\/\d+|\.\d+)?)\s*(ft|in)\b/i.exec(description)?.slice(1,3).join(' ');
const distinct=(values:(string|undefined)[])=>values.every(Boolean)&&new Set(values).size>1?values as string[]:undefined;
const natural=(description:string)=>description.replace(/^[^,]+,?\s*/,'').replace(/\.$/,'').toLowerCase();

/** Ask about the first structured attribute that separates the two best candidates. */
export function clarifyingQuestion(candidates:readonly ScoredCandidate[]){
  const choices=candidates.slice(0,2);
  if(!choices.length)return 'Which item do you need?';
  if(choices.length===1)return `Can you share another detail about the ${choices[0].description.toLowerCase()}?`;
  const grades=distinct(choices.map(c=>grade(c.description)));
  if(grades)return `Grade ${grades[0]} or Grade ${grades[1]} hex cap screws?`;
  const lengths=distinct(choices.map(c=>length(c.description)));
  if(lengths)return `Which length do you need: ${lengths[0]} or ${lengths[1]}?`;
  const types=distinct(choices.map(c=>type(c.description)));
  if(types){
    const product=choices.every(c=>/cut-off wheel/i.test(c.description))?'cut-off wheels':'items';
    return `Type ${types[0]} or Type ${types[1]} ${product}?`;
  }
  return `Which one do you need: ${natural(choices[0].description)} or ${natural(choices[1].description)}?`;
}
