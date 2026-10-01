// SKU matching, the text side (spec §3, task 1.4). Turns a customer's line ("½-13 grade 8 hex cap
// screws 2 in") and a catalog item into parts that can be compared: words, typed attributes
// (thread, grade, type, grit, size, color, hooks, ...) and measures with units. Pure, with no
// server imports.

/** A typed attribute: key "grade", value "8", label "Grade 8" (the label is what a question shows). */
export interface Attr {key:string;value:string;label:string}
/** A number with its unit (in, ft, lb, ...; null when the text gave none). `implied` marks a thread's diameter. */
export interface Measure {unit:string|null;value:number;label:string;implied?:boolean}
/** An item's dimension by position, e.g. "in#1" is its second inch dimension (.045 in on a 4.5 x .045 x 7/8 in wheel). */
export interface Slot {key:string;value:number;label:string}

/** What a customer's line asks for. */
export interface QueryParts {
  /** Catalog SKUs typed in the line. */
  skus:string[];
  /** The line asks for "the usual" (or "same as last time", ...). */
  usual:boolean;
  words:string[];
  attrs:Attr[];
  measures:Measure[];
}

/** A catalog item, taken apart. */
export interface ItemParts {
  sku:string;
  /** The product name: "hex cap screw", "cut-off wheel", "nitrile disposable gloves". */
  name:string;
  /** The name for a question: "hex cap screws", "duct tape". */
  noun:string;
  /** The product noun, stemmed: "screw", "wheel", "glove". */
  head:string;
  /** Every word of the description and keywords, stemmed. */
  words:Set<string>;
  /** The keyword words alone (the catalog's synonyms: "bolt" for a hex cap screw). */
  keywords:Set<string>;
  attrs:Attr[];
  measures:Measure[];
  slots:Slot[];
  attr(key:string):string|undefined;
  label(key:string):string|undefined;
}

export interface MatchableItem {sku:string;description:string;keywords?:string}

// ---- Normalizing ------------------------------------------------------------------------------

const FRACTIONS:Record<string,string>={'½':'1/2','¼':'1/4','¾':'3/4','⅛':'1/8','⅜':'3/8','⅝':'5/8','⅞':'7/8','⅓':'1/3','⅔':'2/3'};

/** Lower case, fractions and quote marks spelled out, and a few spellings unified (cut off = cutoff). */
export function normalize(text:string){
  return text.toLowerCase()
    .replace(/[⁄∕]/g,'/')
    .replace(/(\d)\s*([½¼¾⅛⅜⅝⅞⅓⅔])/g,(_,d:string,f:string)=>`${d}-${FRACTIONS[f]}`)
    .replace(/[½¼¾⅛⅜⅝⅞⅓⅔]/g,f=>FRACTIONS[f])
    .replace(/[“”″]/g,'"').replace(/[‘’′]/g,"'").replace(/×/g,' x ')
    .replace(/(\d|")\s*x\s*(?=[\d.])/g,'$1 x ')
    .replace(/\bcut[\s-]*off(s?)\b/g,'cutoff$1')
    .replace(/\b(dis)k(s?)\b/g,'$1c$2')
    .replace(/\b(?:hi|high)[\s-]*vis(?:ibility)?\b/g,'hivis')
    .replace(/\btie[\s-]*downs?\b/g,'tiedown')
    .replace(/\bhcs\b/g,'hex cap screw')
    .replace(/\s+/g,' ').trim();
}

/** Plural to singular, the same way for the customer's words and the catalog's: gloves -> glove, glasses -> glass. */
export function stem(word:string){
  if(word.length<=3)return word;
  if(word.endsWith('ies'))return `${word.slice(0,-3)}y`;
  if(/(?:ss|sh|ch|x)es$/.test(word))return word.slice(0,-2);
  if(/(?:ss|us|is)$/.test(word))return word;
  return word.endsWith('s')?word.slice(0,-1):word;
}

/** Chat filler that says nothing about the item. Any other word the customer uses counts. */
const STOP=new Set(`a an the and or of for with without to in on at by per from x some any few couple more please pls thanks thank
  need want would could can get got send order quote also maybe about around approx approximately roughly
  usual usually regular normal same like last time before again always as our my we us i me you your those these them that this
  one ones kind sort stuff thing box case pack each ea qty quantity unit lot bunch just only too so if is are be do does have has had
  it its there here what which how when where yes no not hi hello hey`.split(/\s+/));

const USUAL=/\busual(?:ly)?\b|\bsame\s+(?:ones?\s+|kind\s+)?(?:as\s+)?(?:last\s+time|before|always|usual)\b|\blike\s+(?:last\s+time|always|before)\b|\b(?:our|my|the)\s+(?:regular|normal)\b|\bas\s+always\b/i;
/** The line asks for what the customer usually buys: "the usual gloves", "same as last time". */
export const saysUsual=(text:string)=>USUAL.test(text);

// ---- Attributes -------------------------------------------------------------------------------

type Found={value:string;label:string;implied?:Measure};
interface Rule {key:string;re:RegExp;read:(m:RegExpExecArray)=>Found|undefined}

const fraction=(raw:string)=>{const [n,d]=raw.split('/').map(Number);return n/d;};
const ROMAN:Record<string,string>={i:'1',ii:'2',iii:'3',iv:'4',v:'5'};
const HOOKS:Record<string,string>={j:'J-hooks',s:'S-hooks',flat:'flat hooks',clevis:'clevis hooks',snap:'snap hooks',grab:'grab hooks',slip:'slip hooks'};
const SIZE=(value:string):Found=>({value,label:`size ${value}`});
const same=(label:(v:string)=>string)=>(v:string|undefined):Found|undefined=>v===undefined?undefined:{value:v,label:label(v)};

/** In order: a rule's match is removed from the text before the next rule runs. */
const RULES:Rule[]=[
  {key:'thread',re:/(?<![\w.\/#])(\d+\/\d+|#\d+)"?\s*-\s*(\d{1,2})(?![\d\/.])/g,read:m=>({value:`${m[1]}-${m[2]}`,label:`${m[1]}-${m[2]}`,
    implied:m[1].startsWith('#')?undefined:{unit:'in',value:fraction(m[1]),label:`${m[1]} in`,implied:true}})},
  {key:'grade',re:/\b(?:grade|gr)\.?\s*-?\s*(\d+)\b|\bg(\d{1,2})\b/g,read:m=>same(v=>`Grade ${v}`)(m[1]??m[2])},
  {key:'type',re:/\btype\s*-?\s*(\d+|iv|v|i{1,3})\b|\bt-?(\d{1,2})\b/g,read:m=>same(v=>`Type ${v}`)(m[1]?ROMAN[m[1]]??m[1]:m[2])},
  {key:'class',re:/\bclass\s*-?\s*([a-z]|\d+)\b/g,read:m=>same(v=>`Class ${v.toUpperCase()}`)(m[1])},
  {key:'grit',re:/\b(\d+)\s*-?\s*grit\b|\bgrit\s*(\d+)\b/g,read:m=>same(v=>`${v} grit`)(m[1]??m[2])},
  {key:'mil',re:/(?<![\w.])(\d+(?:\.\d+)?)\s*-?\s*mils?\b/g,read:m=>same(v=>`${v} mil`)(String(Number(m[1])))},
  {key:'gauge',re:/#\s*(\d+)\b|\b(\d+)\s*-?\s*(?:gauge|ga)\b/g,read:m=>m[1]?{value:m[1],label:`#${m[1]}`}:same(v=>`${v} gauge`)(m[2])},
  {key:'tpi',re:/\b(\d+(?:\/\d+)?)\s*tpi\b/g,read:m=>same(v=>`${v} TPI`)(m[1])},
  {key:'size',re:/\bsize\s*-?\s*(xxl|xl|l|m|s)\b/g,read:m=>SIZE(m[1].toUpperCase())},
  {key:'size',re:/\b(?:2xl|xxl|xx-?large|2x-?large)\b/g,read:()=>SIZE('XXL')},
  {key:'size',re:/\b(?:xl|x-?large|extra[\s-]+large)\b/g,read:()=>SIZE('XL')},
  {key:'size',re:/\b(?:large|lg)\b/g,read:()=>SIZE('L')},
  {key:'size',re:/\b(?:medium|med)\b/g,read:()=>SIZE('M')},
  {key:'size',re:/\b(?:small|sm)\b/g,read:()=>SIZE('S')},
  {key:'hook',re:/\b(j|s|flat|clevis|snap|grab|slip)[\s-]?hooks?\b/g,read:m=>({value:m[1],label:HOOKS[m[1]]})},
  {key:'finish',re:/\byellow[\s-]+zinc\b|\bzinc(?:[\s-]+plated)?\b|\bgalvanized\b|\bblack[\s-]+oxide\b/g,read:m=>{
    const value=m[0].startsWith('yellow')?'yellow zinc':m[0].startsWith('zinc')?'zinc':m[0].replace(/[\s-]+/,' ');
    return {value,label:value==='zinc'?'zinc plated':value};
  }},
  {key:'film',re:/\b(cast|blown)\b/g,read:m=>same(v=>v)(m[1])},
  // Price tier of a box sold by the bundle or by the pallet; not "pallet wrap", "pallet covers" or "pallets".
  {key:'tier',re:/\b(bundle|pallet)(?![\s-]*(?:wrap|film|covers?|top|sheet|sheeting|rack|racking|s\b|ized\b))\b/g,read:m=>same(v=>v)(m[1])},
  {key:'color',re:/\b(black|blue|silver|white|clear|smoke|lime|yellow|red|orange|green|gr[ae]y)\b/g,read:m=>same(v=>v)(m[1]==='grey'?'gray':m[1])},
];

/** Pulls the typed attributes out of normalized text; returns them and the text that is left. */
function takeAttributes(text:string){
  const attrs:Attr[]=[],implied:Measure[]=[];
  for(const {key,re,read} of RULES){
    text=text.replace(re,(...args)=>{
      const m=Object.assign(args.slice(0,-2),{index:args.at(-2),input:args.at(-1)}) as unknown as RegExpExecArray;
      const found=read(m);
      if(!found)return args[0];
      if(!attrs.some(a=>a.key===key&&a.value===found.value))attrs.push({key,value:found.value,label:found.label});
      if(found.implied)implied.push(found.implied);
      return ' ';
    });
  }
  return {attrs,implied,text};
}

// ---- Measures ---------------------------------------------------------------------------------

const UNIT_OF:Record<string,string>={inch:'in',inches:'in',in:'in','"':'in',"''":'in',feet:'ft',foot:'ft',ft:'ft',"'":'ft',yard:'yd',yards:'yd',yd:'yd',yds:'yd',
  gallon:'gal',gallons:'gal',gal:'gal',pound:'lb',pounds:'lb',lb:'lb',lbs:'lb',piece:'pc',pieces:'pc',pc:'pc',pcs:'pc',ply:'ply',oz:'oz',mm:'mm',cm:'cm'};
const NUMBER=String.raw`(\d+[\s-]\d+\/\d+|\d+\/\d+|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d*\.\d+|\d+)`;
const UNIT=String.raw`(?:\s*-?\s*(inch(?:es)?|in\b|"|''|feet\b|foot\b|ft\b|'|yards?\b|yds?\b|gallons?\b|gal\b|pounds?\b|lbs?\b|pieces?\b|pcs?\b|ply\b|oz\b|mm\b|cm\b))?`;
const MEASURE=new RegExp(String.raw`(?<![\w.\/#,])${NUMBER}(?![\d\/])${UNIT}`,'g');
const unitWord=Object.keys(UNIT_OF).filter(u=>/^\w+$/.test(u)).join('|');
/** A bare count at the start of a line ("6 cut-off wheels"), unless a unit follows ("25 ft tape measure"). */
const LEADING_COUNT=new RegExp(String.raw`^\s*\d+\s+(?!(?:x|by|${unitWord})\b)(?=[a-z])`);
/** Quantities, which are never sizes: "10 boxes", "maybe 12", "qty 4". Not the last dimension of "12 x 9 x 6 boxes". */
const QUANTITY=/(?<!\bx\s*)\b\d+\s*(?:boxes|box|bx|cases?|cs|packs?|pks?|pkgs?|packages?|each|ea|rolls?|pairs?|prs?|units?|bags?|cartons?|ctns?|bundles?|dozen|doz)\b|\b(?:maybe|about|around|approx(?:imately)?|roughly|qty|quantity)\s*:?\s*\d+\b/g;

function toNumber(raw:string){
  const mixed=/^(\d+)[\s-](\d+)\/(\d+)$/.exec(raw);
  if(mixed)return Number(mixed[1])+Number(mixed[2])/Number(mixed[3]);
  if(raw.includes('/'))return fraction(raw);
  return Number(raw.replace(/,/g,''));
}

/** Measures in text order. Numbers joined by "x" share the unit that follows them: 4.5 x .045 x 7/8 in. */
function takeMeasures(text:string){
  const measures:(Measure&{start:number;end:number})[]=[];
  for(const m of text.matchAll(MEASURE)){
    const value=toNumber(m[1]);
    if(!Number.isFinite(value))continue;
    measures.push({unit:m[2]?UNIT_OF[m[2]]:null,value,label:m[1],start:m.index,end:m.index+m[0].length});
  }
  // Walk back through each "a x b x c" group, handing the unit on to the numbers before it.
  let carry:string|null=null;
  for(let i=measures.length-1;i>=0;i--){
    const next=measures[i+1];
    const grouped=next&&/^\s*(?:x|by)\s*$/.test(text.slice(measures[i].end,next.start));
    if(!grouped)carry=null;
    if(measures[i].unit)carry=measures[i].unit;
    else measures[i].unit=carry;
  }
  let rest=text;
  for(const {start,end} of [...measures].reverse())rest=`${rest.slice(0,start)} ${rest.slice(end)}`;
  return {measures:measures.map(({unit,value,label}):Measure=>({unit,value,label:unit?`${label} ${unit}`:label})),text:rest};
}

// ---- Words ------------------------------------------------------------------------------------

function wordsOf(text:string,{stop}:{stop:boolean}){
  const words:string[]=[];
  for(const raw of text.split(/[^a-z0-9]+/)){
    if(raw.length<2||/^\d+$/.test(raw))continue;
    const word=stem(raw);
    if(stop&&(STOP.has(raw)||STOP.has(word)))continue;
    if(!words.includes(word))words.push(word);
  }
  return words;
}

const compact=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');

/** Takes a customer's line apart. `skus` are the catalog's SKUs, so a typed SKU is found in any case or punctuation. */
export function parseQuery(text:string,skus:readonly string[]=[]):QueryParts{
  const bySku=new Map(skus.map(s=>[compact(s),s]));
  const found:string[]=[];
  const rest=text.split(/(\s+|[,;])/).map(token=>{
    const key=compact(token);
    const sku=key.length>=4?bySku.get(key):undefined;
    if(!sku)return token;
    if(!found.includes(sku))found.push(sku);
    return ' ';
  }).join('');
  const {attrs,text:afterAttrs}=takeAttributes(normalize(rest).replace(QUANTITY,' '));
  const {measures,text:left}=takeMeasures(afterAttrs.replace(LEADING_COUNT,' '));
  return {skus:found,usual:saysUsual(text),words:wordsOf(left,{stop:true}),attrs,measures};
}

// ---- Items ------------------------------------------------------------------------------------

/** Nouns that don't take an "s": "duct tape", "stretch wrap". */
const MASS=new Set(['tape','wrap','film','degreaser','cleaner','solvent']);
function plural(name:string){
  const last=name.split(' ').at(-1)!;
  if(last.endsWith('s')||MASS.has(last))return name;
  if(/(?:ch|sh|x|z)$/.test(last))return `${name}es`;
  if(/[^aeiou]y$/.test(last))return `${name.slice(0,-1)}ies`;
  return `${name}s`;
}

/** An item's value for "name", an attribute key ("grade") or a slot key ("in#0"); undefined when it has none. */
export function valueOf(item:ItemParts,key:string){
  if(key==='name')return item.name;
  const slot=item.slots.find(s=>s.key===key);
  if(slot)return String(slot.value);
  const values=item.attrs.filter(a=>a.key===key).map(a=>a.value).sort();
  return values.length?values.join(' + '):undefined;
}

/** The keys (name, attributes, slots) whose values differ between the items, in first-seen order. */
export function differingKeys(items:readonly ItemParts[]){
  const keys=new Set<string>(['name']);
  for(const item of items){for(const a of item.attrs)keys.add(a.key);for(const s of item.slots)keys.add(s.key);}
  return [...keys].filter(key=>new Set(items.map(item=>valueOf(item,key)??'')).size>1);
}

/** Takes a catalog item apart. Measures and slots come from the description; attributes and words from it and the keywords. */
export function parseItem(item:MatchableItem):ItemParts{
  const description=takeAttributes(normalize(item.description));
  const keywords=takeAttributes(normalize(item.keywords??''));
  const attrs=[...description.attrs,...keywords.attrs.filter(k=>!description.attrs.some(d=>d.key===k.key&&d.value===k.value))];
  const {measures,text}=takeMeasures(description.text);
  const counts=new Map<string,number>();
  const slots=measures.map(m=>{const unit=m.unit??'n';const i=counts.get(unit)??0;counts.set(unit,i+1);return {key:`${unit}#${i}`,value:m.value,label:m.label};});
  const name=item.description.split(',')[0].replace(/\s+[#.\d].*$/,'').trim().toLowerCase();
  const keywordWords=wordsOf(keywords.text,{stop:false});
  return {
    sku:item.sku,name,noun:plural(name),head:wordsOf(normalize(name),{stop:false}).at(-1)??'',
    words:new Set([...wordsOf(text,{stop:false}),...keywordWords]),keywords:new Set(keywordWords),
    attrs,measures:[...description.implied,...measures],slots,
    attr:key=>attrs.find(a=>a.key===key)?.value,
    label:key=>attrs.find(a=>a.key===key)?.label,
  };
}
