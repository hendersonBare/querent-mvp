import {normalize,stem} from './text';

// Packaging-aware parsing (BOXT task B3). Takes a customer's line (usually another supplier's
// catalog line, such as `12 x 10 x 8" Corrugated Boxes 200 lb test 25/bundle`, with the supplier's
// SKU already removed by the parser) or a BOXT catalog row apart into what can be compared:
//   - dims: the "a x b x c" group (also "a*b*c", "a-b-c", "a by b"), in the order given (12x10x8 is
//     not 12x8x10), or in L, W, H/D order when every member is labelled (dimRanks keeps the labels,
//     so the scorer can put them in the catalog's order for the item's category: bags are W x L);
//   - measures: every other number with an explicit unit (a 1/2" bubble, 600 lb strapping, 50 lb paper);
//   - strays: a number with no unit outside a tuple. It is never a size;
//   - strength (ECT, or a burst rating "200 lb test" / "200#"), mil, gauge, a "#2" size number, a core;
//   - exclusive choices: wall, closure, adhesive, print method, film type, hand/machine, paper grade,
//     condition (new, used, recycled);
//   - features that make a different kind of item (bubble, padded, insulated, heavy duty, ...);
//   - colours (brown and natural are kraft) and materials (poly, paper, corrugated, foam);
//   - negated things: "no zipper", "w/o bubble", "without X", "not X", "non-X", "X-free";
//   - the stated pack quantity ("25/bundle", "1000/case", "case of 500");
//   - the words that are left, stemmed.
// Pure, with no server imports. Each rule's match is removed from the text before the next runs.
//
// Total accounting (B3b): nothing is dropped or merged. Every rule keeps every value it reads (a
// second size, mil, ECT, closure ... is kept, not overwritten), and whatever no rule reads is either a
// word the item must confirm, or one of a tiny closed list of empty filler words (FILLER), or a
// blocker. `blockers` lists what makes the line unfit for Strict whatever the item: two values of one
// field, a range, a joining word or symbol ("for", "or", "+", "/"), a number, letter or unit nothing
// read, a labelled size outside the tuple. The scorer adds the item-dependent ones (score-packaging.ts).

/** A number with its unit (in, ft, yd, mm, cm, m, lb, oz, cuft; null when the text gave none). */
export interface Size {unit:string|null;value:number;label:string;
  /** A size outside the tuple with a label ("12\" deep"): its place in L, W, H/D order (0, 1, 2). */
  rank?:number}
/** A pack quantity: `outer` is the count per case, bundle or carton; `roll` the count per roll. */
export interface Pack {outer?:number;roll?:number}
export type ChoiceKey='wall'|'flute'|'closure'|'adhesive'|'print'|'film'|'length'|'paper'|'condition';
/** What the line says the item must NOT have: "no zipper", "w/o bubble", "non-printed". */
export interface Negated {choices:Partial<Record<ChoiceKey,string>>;features:string[];colors:string[];words:string[]}

/** What a line (or a catalog row) says about the item. */
export interface Spec {
  dims:Size[]|null;
  /** The labels of the dims members (0 = L, 1 = W, 2 = H/D), aligned with dims; null when none is labelled, null entries where only some are. */
  dimRanks:(number|null)[]|null;
  /** Every further tuple the line states ("12x10x8 or 12x10x10"): never Strict-eligible, and each must also fit. */
  otherDims:Size[][];
  /** The dims with the single length just before them in front ("1/2" Bubble 12"x250'" also reads 1/2 x 12 x 250). */
  altDims:Size[]|null;
  /** Numbers with an explicit unit, outside the dims tuple (a catalog row also keeps its unitless ones here). */
  measures:Size[];
  /** A line's numbers with no unit outside a tuple: unclassified, never confirmed. */
  strays:Size[];
  ect:number|null;
  burst:number|null;
  mil:number|null;
  gauge:number|null;
  /** The size number of a mailer ("#2" is "2"; "#000" stays "000"). */
  number:string|null;
  /** A strapping core ("8x8\" Core" is "8x8"). */
  core:string|null;
  /** Every value the line states for each scalar field, in order (the fields above keep the first). */
  values:{ect:number[];burst:number[];mil:number[];gauge:number[];number:string[];core:string[]};
  /** Every value stated per exclusive choice (choices keeps the first). */
  choiceValues:Partial<Record<ChoiceKey,string[]>>;
  /** Every pack count stated (pack keeps the first). */
  packValues:{outer:number[];roll:number[]};
  colors:string[];
  materials:string[];
  choices:Partial<Record<ChoiceKey,string>>;
  features:string[];
  pack:Pack;
  negated:Negated;
  words:string[];
  /** Why the line can never be Strict-eligible, whatever the item (empty when nothing is in the way). */
  blockers:string[];
}

/** A catalog row, taken apart. */
export interface ItemSpec extends Spec {
  /** The product name: "corrugated boxes", "kraft bubble mailers". */
  name:string;
  /** The words of the description alone (no keywords): the product noun must be one of them at Strict. */
  descWords:string[];
  /** The catalog's order for the item's sizes: L x W x H (boxes, pallets), W x L (bags, mailers, rolls, sheets, labels), or null (unknown). */
  dimOrder:DimOrder;
  /** The colours the description states; `colors` adds the implied ones (kraft for plain corrugated). */
  statedColors:string[];
}

export type DimOrder='lwh'|'wl'|null;

export interface PackagingItem {sku:string;description:string;keywords?:string|null;pack?:string|null;caseQty?:number|null;category?:string|null}

// ---- Normalizing --------------------------------------------------------------------------------

/** normalize() plus the packaging spellings: 70MMx450' and 1075'x1075' split into "a x b", cubic feet as cuft. */
function prepare(text:string){
  return normalize(text)
    .replace(/\bw\/o\b/g,' without ').replace(/\bw\//g,' with ')
    // "No. 2" is a size number, not a negation.
    .replace(/\bno\.\s*#?(?=\d)/g,'#')
    // "12*8*10" and "12-8-10" are tuples; a two-part hyphen ("4-6") is not, and mixed numbers (12-1/4) are left alone.
    .replace(/(\d)\s*\*\s*(?=[\d.])/g,'$1 x ')
    .replace(/(?<![\d.\/-])(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(?![\d\/.-])/g,'$1 x $2 x $3')
    .replace(/(\d(?:mm|cm|yds?|ft|in|m)?|['"])\s*x\s*(?=[\d.])/g,'$1 x ')
    .replace(/\bcu(?:bic)?\.?\s*(?:feet|foot|ft)\.?/g,'cuft')
    .replace(/\s+/g,' ').trim();
}

/** The catalog's pricing tier ("…, bundle pricing" / "…, pallet pricing") says nothing about the item. */
const TIER=/,?\s*\b(?:bundle|pallet)\s+pricing\b/gi;
/** Kraft paper's "50 lb./Bundle" is the bundle's weight, not the paper's. */
const BUNDLE_WEIGHT=/\d+(?:\.\d+)?\s*lbs?\.?\s*\/\s*bundle\b/g;

// ---- Pack quantities --------------------------------------------------------------------------------

const COUNT=String.raw`(\d{1,3}(?:,\d{3})+|\d+)`;
/** What a case holds, between the count and the slash: "500 bags/case", "36 rolls/case". */
const CONTENTS=String.raw`(?:\s*(?:pcs?|pieces?|ct|count|ea|each|bags?|mailers?|labels?|sheets?|boxes|rolls?|rls?|units?|envelopes?|pouches?|cartons?|pads?))?`;
const OUTER=String.raw`(?:cases?|cs|cartons?|ctns?|bundles?|bdls?|bndls?|boxe?s?|bx|packs?|pks?|pkgs?|packages?|sleeves?)\b`;
const ROLL=String.raw`(?:rolls?|rls?)\b`;
const PACK_RULES:{re:RegExp;unit:(m:RegExpExecArray)=>'outer'|'roll';count:(m:RegExpExecArray)=>string}[]=[
  // "25/bundle", "1,000/cs", "500 bags per case", "500 labels/roll"
  {re:new RegExp(String.raw`(?<![\w.,])${COUNT}${CONTENTS}\s*(?:\/|\bper\b|\ba\b)\s*(${OUTER}|${ROLL})`,'g'),unit:m=>/^r/.test(m[2])?'roll':'outer',count:m=>m[1]},
  // "case of 500", "bundle of 25", "roll of 250"
  {re:new RegExp(String.raw`\b(${OUTER}|${ROLL})\s*(?:of|qty\.?:?)\s*${COUNT}\b`,'g'),unit:m=>/^r/.test(m[1])?'roll':'outer',count:m=>m[2]},
  // "1000 ct", "500 count", "10 pk", "10-pack", "500 pcs"
  {re:new RegExp(String.raw`(?<![\w.,])${COUNT}\s*-?\s*(?:ct|count|pks?|packs?|pkgs?|pcs|pieces)\b`,'g'),unit:()=>'outer',count:m=>m[1]},
];
const toCount=(raw:string)=>Number(raw.replace(/,/g,''));

/** Takes the stated pack quantities out of the text: `pack` holds the first per key, `values` every distinct one. */
function takePack(text:string){
  const pack:Pack={};
  const values:{outer:number[];roll:number[]}={outer:[],roll:[]};
  for(const {re,unit,count} of PACK_RULES){
    text=text.replace(re,(...args)=>{
      const m=args.slice(0,-2) as unknown as RegExpExecArray;
      const key=unit(m);
      const n=toCount(count(m));
      pack[key]??=n;
      if(!values[key].includes(n))values[key].push(n);
      return ' ';
    });
  }
  return {pack,values,text};
}

/**
 * What a catalog row is sold in. "Case of 1,000" is 1000 per case; "Roll of 250" is 250 per roll;
 * "Each" with a case quantity of 25 is a bundle of 25 (a box sold by the bundle); "Each" with 1, a
 * "Roll" or a "Coil" is one; a count the description states ("3/Case") comes next; a bare "Case"
 * says nothing (no evidence either way).
 */
export function itemPack<T extends Pick<PackagingItem,'description'|'pack'|'caseQty'>>(item:T):Pack{
  const pack=(item.pack??'').trim().toLowerCase();
  const of=/^(case|bundle|box|pack|carton|roll)\s+of\s+([\d,]+)$/.exec(pack);
  if(of)return of[1]==='roll'?{roll:toCount(of[2])}:{outer:toCount(of[2])};
  const stated=takePack(prepare(item.description)).pack;
  if(stated.outer||stated.roll)return stated;
  if(pack==='each')return {outer:Math.max(1,item.caseQty??1)};
  if(pack==='roll'||pack==='coil')return {outer:1};
  return {};
}

/** The pack as the judge and the rep see it: "Each" sold by the bundle is "Bundle of 25". */
export function packLabel<T extends Pick<PackagingItem,'pack'|'caseQty'>>(item:T):string|null{
  if(item.pack==='Each'&&(item.caseQty??1)>1)return `Bundle of ${item.caseQty}`;
  return item.pack??null;
}

// ---- Strength, film and size numbers ---------------------------------------------------------------

const ECT=/\b(\d{2})\s*-?\s*ect\b|\bect\s*-?\s*(\d{2})\b/g;
const BURST=/\b(\d{3})\s*(?:#|lbs?\.?)\s*-?\s*(?:test|burst)\b|\b(?:mullen|burst)(?:\s*test)?\s*:?\s*(\d{3})\b/g;
/** A bare "200#": a burst rating on a box line, a weight anywhere else ("50# kraft paper"). */
const BARE_POUNDS=/\b(\d{2,4})\s*#(?!\s*\d)(\s*-?\s*test\b)?/g;
/** A strapping core: "8x8\" Core", "9 x 8 core". */
const CORE=/\b(\d+)\s*x\s*(\d+)\s*(?:"|''|in\b\.?|inch(?:es)?\b)?\s*core\b/g;
const BOX_LINE=/\b(?:box(?:es)?|cartons?|corrugated|cardboard|gaylords?|rsc)\b/;
const MIL=/(?<![\w.])(\d*\.?\d+)\s*-?\s*mils?\b/g;
/** Film thickness in microns, read as mil (1 mil = 25.4 µm). */
const MICRON=/(?<![\w.])(\d*\.?\d+)\s*-?\s*(?:microns?|µm|μm|um|mic)(?![\w])/g;
/** A legend after a tuple, "(L x W x H)" or "W x L x D": the members' labels, in order. */
const LEGEND=/\(?\b([lwhd])\s*x\s*([lwhd])(?:\s*x\s*([lwhd]))?\b\)?/g;
const GAUGE=/\b(\d+)\s*-?\s*(?:gauge|gage|ga)\b/g;
const NUMBER=/(?<![\w#])#\s*(\d+[a-z]?)\b/g;

/** The first capture group that matched, of a replace() callback's arguments. */
const firstGroup=(args:unknown[])=>(args.slice(1,-2) as (string|undefined)[]).find(g=>g!==undefined);

/** Every distinct value a rule reads, in text order (`value` is the first). A second value is never dropped. */
function takeValues<V extends number|string>(text:string,re:RegExp,read:(raw:string)=>V){
  const values:V[]=[];
  text=text.replace(re,(...args)=>{
    const raw=firstGroup(args);
    if(raw!==undefined){
      const v=read(raw);
      if(!values.some(x=>typeof x==='number'&&typeof v==='number'?Math.abs(x-v)<1e-9:x===v))values.push(v);
    }
    return ' ';
  });
  return {value:values[0]??null,values,text};
}

// ---- Choices, features, colours, materials -----------------------------------------------------------

/** Exclusive choices: a line saying one and an item saying another contradict each other. */
const CHOICES:{key:ChoiceKey;values:[string,RegExp][]}[]=[
  {key:'wall',values:[
    ['triple',/\btriple[\s-]*wall\b/g],
    ['double',/\bdouble[\s-]*wall\b|\bdbl\.?[\s-]*wall\b|\bd\/w\b|\bdw\b/g],
    ['single',/\bsingle[\s-]*wall\b|\bs\/w\b/g],
  ]},
  // The board's flute (BC and EB are double wall; see parseSpec).
  {key:'flute',values:[['bc',/\bbc[\s-]*flute\b/g],['eb',/\beb[\s-]*flute\b/g],
    ...['a','b','c','e','f'].map((letter):[string,RegExp]=>[letter,new RegExp(String.raw`\b${letter}[\s-]*flute\b`,'g')])]},
  // Distinct closures: a slider is not a press-to-close zipper, and neither is a self-seal strip.
  {key:'closure',values:[
    ['slider',/\bslider(?:[\s-]*(?:zip(?:per)?|lock|seal|top))?\b|\bslide[\s-]*(?:lock|seal|zip(?:per)?)\b/g],
    ['reclosable',/\bre-?closable\b|\bre-?sealable\b|\bpress[\s-]*(?:to|n|&|and)[\s-]*(?:close|seal)\b|\bzip[\s-]*(?:lock|top|seal|close)\b|\bziploc?k?\b|\bzipper\b|\bzip\b/g],
    ['self-seal',/\bself[\s-]*seal(?:ing)?\b|\bpeel[\s-]*(?:and|&|n)[\s-]*seal\b/g],
    ['tuck',/\btuck[\s-]*(?:top|flap|end|front)\b/g],
    ['string-button',/\bstring[\s-]*(?:and|&|n)[\s-]*button\b/g],
    ['open',/\bopen[\s-]*(?:top|end(?:ed)?|mouth)\b|\bflush[\s-]*cut\b/g],
  ]},
  {key:'adhesive',values:[
    ['hot melt',/\bhot[\s-]*melt\b/g],
    ['acrylic',/\bacrylic\b/g],
    ['rubber',/\b(?:natural[\s-]*)?rubber\b/g],
    ['water activated',/\bwater[\s-]*activated\b|\bgummed\b|\bwat\b/g],
  ]},
  {key:'print',values:[
    ['direct thermal',/\bdirect[\s-]*thermal\b/g],
    ['thermal transfer',/\bthermal[\s-]*transfer\b/g],
  ]},
  {key:'film',values:[['cast',/\bcast\b/g],['blown',/\bblown\b/g]]},
  {key:'condition',values:[
    ['new',/\b(?:brand[\s-]*)?new\b/g],
    ['used',/\bused\b|\brefurbished\b|\brecondition(?:ed)?\b|\breclaimed\b/g],
    ['recycled',/\brecycled\b/g],
  ]},
  {key:'length',values:[
    ['hand',/\bhand[\s-]*(?:length|grade)\b|\bhand(?=[\s-]+(?:stretch|pallet|wrap|film|strapping)\b)|(?<=\b(?:stretch|wrap|film|strapping),?[\s-]+)hand\b/g],
    ['machine',/\bmachine[\s-]*(?:length|grade)\b|\bmachine(?=[\s-]+(?:stretch|pallet|wrap|film|strapping)\b)|(?<=\b(?:stretch|wrap|film|strapping),?[\s-]+)machine\b/g],
  ]},
];
/**
 * The choices that make an item a different kind when the line doesn't say them. Single wall and
 * new are the defaults; kraft paper is also its colour, which is charged as a colour.
 */
export const DEFINING_CHOICE=(key:ChoiceKey,value:string)=>key==='closure'||(key==='wall'&&value!=='single')||(key==='paper'&&value!=='kraft')||(key==='condition'&&value!=='new');

/** The paper grade, read without removing the words: newsprint, tissue and kraft paper are different papers. */
const PAPER_GRADES:[string,RegExp][]=[['newsprint',/\bnewsprint\b/],['tissue',/\btissue\b/],['crinkle',/\bcrinkle\b/],['honeycomb',/\bhoneycomb\b/]];

/** Features that make a different kind of item; an item's feature the line doesn't state is unconfirmed. */
const FEATURES:[string,RegExp][]=[
  ['clear face',/\bclear[\s-]*face\b/g],
  ['insulated',/\binsulated\b|\bthermal(?=[\s-]+(?:bubble[\s-]+)?(?:mailers?|bags?|envelopes?|liners?|box(?:es)?|pouch(?:es)?)\b)/g],
  ['glamour',/\bglamou?r\b|\bmetallic\b/g],
  ['bubble',/\bbubble\b/g],
  ['padded',/\bpadded\b/g],
  ['anti-static',/\banti[\s-]*static\b/g],
  ['warning',/\bsuffocation(?:[\s-]*warning)?\b|\bwarning\b/g],
  ['bin',/\bbins?\b/g],
  ['heavy duty',/\bheavy[\s-]*duty\b|\bheavyweight\b/g],
  ['colored',/\bcolou?red\b/g],
  ['literature',/\bliterature\b/g],
];

/** Compound colours first, so "matte black" is not "black". Brown and natural are kraft. */
const COLORS:[string,RegExp][]=[
  ['matte black',/\bmatte[\s-]*black\b/g],
  ['pastel blue',/\bpastel[\s-]*blue\b/g],
  ['steel blue',/\bsteel[\s-]*blue\b/g],
  ['pastel pink',/\bpastel[\s-]*pink\b/g],
  ['sherbet orange',/\bsherbet[\s-]*orange\b/g],
  ['lavender',/\b(?:deep[\s-]*)?lavender\b/g],
  ['kraft',/\bkraft\b|\bbrown\b|\bnatural\b/g],
  ['white',/\bwhite\b/g],
  ['clear',/\bclear\b|\btransparent\b/g],
  ['black',/\bblack\b/g],
  ['blue',/\bblue\b/g],
  ['red',/\bred\b/g],
  ['green',/\bgreen\b/g],
  ['yellow',/\byellow\b/g],
  ['orange',/\borange\b/g],
  ['purple',/\bpurple\b/g],
  ['pink',/\bpink\b/g],
  ['gold',/\bgold\b/g],
  ['silver',/\bsilver\b/g],
  ['teal',/\bteal\b/g],
  ['gray',/\bgr[ae]y\b/g],
  ['tan',/\btan\b|\bbuff\b/g],
];

/** Materials are read but their words stay (they also count as words). Kraft is paper unless another material is named or the line is about boxes. */
const MATERIALS:[string,RegExp][]=[
  ['poly',/\bpoly(?:ethylene|propylene)?\b|\bplastic\b|\b[lh]dpe\b/],
  ['paper',/\bpaper(?:board)?\b|\bnewsprint\b|\btissue\b|\bchipboard\b/],
  ['corrugated',/\bcorrugated\b|\bcardboard\b/],
  ['foam',/\bfoam\b/],
  ['vinyl',/\bvinyl\b/],
  ['tyvek',/\btyvek\b/],
];

function takeAll(text:string,table:[string,RegExp][]){
  const found:string[]=[];
  for(const [value,re] of table){
    text=text.replace(re,()=>{if(!found.includes(value))found.push(value);return ' ';});
  }
  return {found,text};
}

/** The exclusive choices: `choices` holds the first value per key, `values` every distinct one ("reclosable ... open top" is two closures). */
function takeChoices(text:string){
  const choices:Partial<Record<ChoiceKey,string>>={};
  const all:Partial<Record<ChoiceKey,string[]>>={};
  // In text order, so the first value said is the one kept in `choices`.
  const found:{at:number;key:ChoiceKey;value:string}[]=[];
  for(const {key,values} of CHOICES){
    for(const [value,re] of values){
      text=text.replace(re,(match:string,...rest:unknown[])=>{
        found.push({at:rest[rest.length-2] as number,key,value});
        return ' '.repeat(match.length);
      });
    }
  }
  for(const {key,value} of found.sort((a,b)=>a.at-b.at)){
    choices[key]??=value;
    const list=all[key]??=[];
    if(!list.includes(value))list.push(value);
  }
  return {choices,values:all,text};
}

// ---- Sizes ------------------------------------------------------------------------------------------

const UNIT_OF:Record<string,string>={'"':'in',"''":'in',in:'in',inch:'in',inches:'in',"'":'ft',ft:'ft',feet:'ft',foot:'ft',
  yd:'yd',yds:'yd',yard:'yd',yards:'yd',mm:'mm',cm:'cm',m:'m',meter:'m',meters:'m',lb:'lb',lbs:'lb',pound:'lb',pounds:'lb',oz:'oz',cuft:'cuft',gal:'gal',gallon:'gal',gallons:'gal'};
const NUM=String.raw`(\d+[\s-]\d+\/\d+|\d+\/\d+|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d*\.\d+|\d+)`;
const UNIT=String.raw`(?:\s*-?\s*(inch(?:es)?\b|in\b\.?|"|''|feet\b|foot\b|ft\b\.?|'|yards?\b|yds?\b|mm\b|cm\b|meters?\b|m\b|pounds?\b|lbs?\b\.?|oz\b|cuft\b|gallons?\b|gal\b))?`;
/** A dimension label before ("L 12") or after ("12 in. L", "12\" long") a number. */
const LABEL_BEFORE=String.raw`(?:\b([lwhd])\s*[:=]?\s*(?=\d)|(?<![\w.\/#,]))`;
const LABEL_AFTER=String.raw`(?:\s*\b(l|w|h|d|length|width|height|depth|long|wide|high|tall|deep)\b\.?)?`;
const SIZE=new RegExp(String.raw`${LABEL_BEFORE}${NUM}(?![\d\/])${UNIT}${LABEL_AFTER}`,'g');
/** A label's place in the catalog's order: length, width, then height or depth. */
const LABEL_RANK:Record<string,number>={l:0,length:0,long:0,w:1,width:1,wide:1,h:2,height:2,high:2,tall:2,d:2,depth:2,deep:2};
/** Lengths, in inches; weights in pounds. A size compares only with one of the same family. */
const TO_BASE:Record<string,[string,number]>={in:['length',1],ft:['length',12],yd:['length',36],mm:['length',1/25.4],cm:['length',1/2.54],m:['length',39.3701],
  lb:['weight',1],oz:['weight',1/16],cuft:['volume',1],gal:['volume',0.133681]};
export const familyOf=(unit:string|null)=>unit?TO_BASE[unit]?.[0]??unit:null;

function toNumber(raw:string){
  const mixed=/^(\d+)[\s-](\d+)\/(\d+)$/.exec(raw);
  if(mixed)return Number(mixed[1])+Number(mixed[2])/Number(mixed[3]);
  const frac=/^(\d+)\/(\d+)$/.exec(raw);
  if(frac)return Number(frac[1])/Number(frac[2]);
  return Number(raw.replace(/,/g,''));
}

/**
 * The sizes in text order. Numbers joined by "x" (or "by") form a group and share a unit that
 * follows them (12 x 10 x 8" is three inch sizes); the first group of two or more lengths is the
 * dims tuple, every further group of two or more is kept in otherDims, and every other number is a
 * measure. A weight never joins a group. When every member of a group is labelled once, the group is
 * put in L, W, H/D order and dimRanks keeps the labels. The tuple's joiners ("x", "by") are read too.
 */
function takeSizes(text:string){
  const found:(Size&{start:number;end:number;rank?:number})[]=[];
  for(const m of text.matchAll(SIZE)){
    const value=toNumber(m[2]);
    if(!Number.isFinite(value))continue;
    const unit=m[3]?UNIT_OF[m[3].replace(/\.$/,'')]??null:null;
    const label=m[1]??m[4];
    found.push({unit,value,label:m[2],start:m.index,end:m.index+m[0].length,rank:label?LABEL_RANK[label]:undefined});
  }
  const isLength=(s:Size)=>s.unit===null||familyOf(s.unit)==='length';
  const joined=(i:number)=>i+1<found.length&&/^\s*(?:x|by)\s*$/.test(text.slice(found[i].end,found[i+1].start))&&isLength(found[i])&&isLength(found[i+1]);
  const groups:(typeof found)[]=[];
  for(let i=0;i<found.length;i++){
    if(i>0&&joined(i-1))groups.at(-1)!.push(found[i]);else groups.push([found[i]]);
  }
  const blockers:string[]=[];
  const ranksOf=new Map<(typeof found),(number|null)[]|null>();
  for(const group of groups){
    let carry:string|null=null;
    for(let i=group.length-1;i>=0;i--){
      if(group[i].unit)carry=group[i].unit;else if(group.length>1)group[i].unit=carry;
    }
    if(group.length<2)continue;
    const ranks=group.map(g=>g.rank);
    const labelled=ranks.filter(r=>r!==undefined).length;
    // Every member labelled, each label once: put them in L, W, H/D order.
    if(labelled===group.length&&new Set(ranks).size===ranks.length){
      group.sort((a,b)=>a.rank!-b.rank!);
      ranksOf.set(group,group.map(g=>g.rank!));
    }else if(labelled){
      ranksOf.set(group,ranks.map(r=>r??null));
      blockers.push(labelled<group.length?'a size with labels on only some of its numbers':'a size with one label used twice');
    }else ranksOf.set(group,null);
  }
  const strip=({unit,value,label,rank}:Size):Size=>({unit,value,label:unit?`${label} ${unit}`:label,...(rank!==undefined?{rank}:{})});
  const tuples=groups.filter(g=>g.length>1);
  const tuple=tuples[0]??null;
  const at=tuple?groups.indexOf(tuple):-1;
  const before=at>0&&groups[at-1].length===1&&isLength(groups[at-1][0])&&groups[at-1][0].rank===undefined?groups[at-1][0]:null;
  if(tuples.length>1)blockers.push(`two sizes: ${tuples.map(t=>t.map(m=>m.value).join('x')).join(' and ')}`);
  const singles=groups.filter(g=>g.length===1).flat();
  for(const m of singles)if(m.rank!==undefined)blockers.push(`a size outside the dimensions: ${text.slice(m.start,m.end).trim()}`);
  let rest=text;
  for(const group of [...groups].reverse())rest=`${rest.slice(0,Math.min(...group.map(g=>g.start)))} ${rest.slice(Math.max(...group.map(g=>g.end)))}`;
  return {
    dims:tuple?tuple.map(strip):null,
    dimRanks:tuple?ranksOf.get(tuple)??null:null,
    otherDims:tuples.slice(1).map(t=>t.map(strip)),
    altDims:tuple&&before?[before,...tuple].map(strip):null,
    measures:singles.map(strip),
    blockers,
    text:rest,
  };
}

/** How close two sizes in different units must be after conversion: 914 mm is 36", 457 m is 1500'. */
const UNIT_TOLERANCE=0.005;
/**
 * Two sizes are the same when equal after converting to a shared unit family (within
 * UNIT_TOLERANCE). Without a unit on either side they compare by number alone, which only tuple
 * members do (the scorer never compares a stray or a unitless measure this way).
 */
export function sameSize(a:Size,b:Size){
  if(a.unit&&b.unit){
    const [fa,ka]=TO_BASE[a.unit]??[a.unit,1],[fb,kb]=TO_BASE[b.unit]??[b.unit,1];
    if(fa!==fb)return false;
    const x=a.value*ka,y=b.value*kb;
    return Math.abs(x-y)<=Math.max(1e-6,UNIT_TOLERANCE*Math.max(x,y));
  }
  return Math.abs(a.value-b.value)<1e-6;
}

// ---- Words ------------------------------------------------------------------------------------------

/**
 * Total accounting of what no rule read. Each leftover token is either FILLER (skipped), or a word the
 * item must confirm (scorer: UNCONFIRMED); and some words are also blockers, because no item can
 * confirm what they say about the line:
 *   - FILLER, the only words that say nothing about the item: "an", "the", "of", "with", polite and
 *     order words (please, our, we, need, qty, quantity), "size"/"sz"/"thickness" (the numbers carry
 *     the meaning; "thick" right after a size too), and the other supplier's own name ("uline",
 *     "brand"). "a" is NOT filler: it is a grade, a style or a flute letter as often as an article.
 *   - JOINING words relate the item to something else or join two things ("for", "to", "fit",
 *     "item", "style", "or", "and", "approx", "each", "inside", "assorted", "per", ...): a blocker;
 *   - a unit or pack word whose number nothing read ("inch" in "half inch", "case", "x"): a blocker;
 *   - a number word, a number, or a single letter nothing read: a blocker;
 *   - a symbol that joins or relates two things ("+", "&", "/", "~", "#", "%", "$", ...), and any
 *     character outside plain text (a letter with an accent): a blocker. Separators are not.
 */
const FILLER=new Set('an the of with please pls our we need qty quantity size sz thickness uline brand'.split(' '));
const JOINING=new Set(`a and or nor to for fit fits fitting item style approx approximately about around roughly each also plus either
  vs versus thru through between from assorted assortment mixed various variety combo kit set similar equivalent equiv like comparable
  compatible alternative alt substitute inside outside interior exterior id od dim dims dimension min max minimum maximum up per
  total other any misc etc in on at by than over under less more only`.split(/\s+/));
const UNIT_WORDS=new Set(`x inch ft feet foot yd yds yard mm cm meter lb lbs pound oz ozs mil ga gauge gage ect test burst mullen
  micron um cuft cu gal gallon ct cts count pk pks pkg pc pcs piece ea case cs bundle bdl ctn`.split(/\s+/));
const NUMBER_WORDS=new Set('half quarter third dozen pair one two three four five six seven eight nine ten eleven twelve twenty fifty hundred thousand'.split(' '));
/** What may separate tokens without meaning anything: space, comma, full stop, semicolon, colon, brackets, quotes, ! ? and a hyphen. */
const SEPARATOR=/[\s,.;:()'"!?-]/;
/** ".160" thick": "thick" right after a size says nothing more. (Long, wide, high, deep and tall there are L/W/H labels.) Elsewhere ("long boxes") they count. */
const SIZE_ADJECTIVE=/(\d(?:"|''|'|\s*(?:in|inch|inches|ft|feet|foot|mm|cm)\b\.?)?)\s*thick\b/g;

/** The words of a text: every token but FILLER and bare numbers, stemmed, once each. */
function wordsOf(text:string){
  const words:string[]=[];
  for(const raw of text.split(/[^a-z0-9]+/)){
    if(!raw||/^\d+$/.test(raw)||FILLER.has(raw))continue;
    const word=stem(raw);
    if(!words.includes(word))words.push(word);
  }
  return words;
}

/** The leftover of a line: its words (to be confirmed by the item) and what in it blocks Strict. */
function readLeftover(text:string){
  const blockers:string[]=[];
  for(const c of new Set([...text].filter(c=>!/[a-z0-9]/.test(c)&&!SEPARATOR.test(c))))blockers.push(`"${c}" in the line`);
  for(const raw of text.split(/[^a-z0-9]+/)){
    if(!raw||FILLER.has(raw))continue;
    const word=stem(raw);
    if(JOINING.has(raw)||JOINING.has(word))blockers.push(`the line says "${word}"`);
    else if(/^\d+$/.test(raw)||NUMBER_WORDS.has(raw))blockers.push(`a number nothing reads: "${raw}"`);
    else if(UNIT_WORDS.has(raw)||UNIT_WORDS.has(word))blockers.push(`a unit with no number: "${raw}"`);
    else if(raw.length===1)blockers.push(`a letter nothing reads: "${raw}"`);
  }
  return {words:wordsOf(text),blockers:[...new Set(blockers)]};
}

// ---- Negation ---------------------------------------------------------------------------------------

/** "no X", "without X", "not X", "non-X" (w/o is spelled out by prepare), and "X-free". */
const NEGATION=/\b(?:no|without|not|non)[\s-]+([a-z]+)(?:[\s-]+([a-z]+))?|\b([a-z]+)[\s-]+free\b/g;

/** The typed things a short phrase names, and the words left over. */
function thingsOf(phrase:string){
  const choices=takeChoices(phrase);
  const features=takeAll(choices.text,FEATURES);
  const colors=takeAll(features.text,COLORS);
  return {choices:choices.choices,features:features.found,colors:colors.found,rest:wordsOf(colors.text)};
}
const countOf=(t:ReturnType<typeof thingsOf>)=>Object.keys(t.choices).length+t.features.length+t.colors.length;

/**
 * Takes the negations out of the text. The negated phrase is one word, or two when the two words
 * together name one thing ("no suffocation warning", "without heavy duty"); "no zipper bags" negates
 * the zipper, not the bags. A phrase that names no typed thing negates its word ("non-printed").
 */
function takeNegations(text:string){
  const negated:Negated={choices:{},features:[],colors:[],words:[]};
  text=text.replace(NEGATION,(_match:string,w1:string|undefined,w2:string|undefined,free:string|undefined)=>{
    const first=w1??free!;
    const two=w1&&w2?thingsOf(`${first} ${w2}`):null;
    const one=thingsOf(first);
    const useTwo=!!two&&countOf(two)>0&&two.rest.length===0&&countOf(two)>=countOf(one);
    const things=useTwo?two!:one;
    negated.choices={...things.choices,...negated.choices};
    negated.features.push(...things.features);
    negated.colors.push(...things.colors);
    if(!countOf(things))negated.words.push(...things.rest);
    // Give back what was not negated (the "bags" of "no zipper bags").
    return w1&&w2&&!useTwo?` ${w2} `:' ';
  });
  return {negated,text};
}

// ---- Putting it together ----------------------------------------------------------------------------

/** Burst (Mullen) ratings and the ECT they are sold as equivalent to. */
export const BURST_TO_ECT:Readonly<Record<number,number>>={200:32,275:44,350:55};
/** Two numbers apart from a dash ("4-6", "12" - 14"): a range. Mixed numbers (8-1/2) and three-part chains (12-10-8, read as a tuple) are not. */
const RANGE=/(?<![\d.\/])\d+(?:\.\d+)?\s*(?:"|''|')?\s*[-–—]\s*\d+(?:\.\d+)?(?![\d.]*\/)/;

export interface ParseOptions {
  /** A catalog description: its "50 lb./Bundle" is the bundle's weight, not the paper's, and is dropped. */
  item?:boolean;
}

/** Takes a line (or a catalog description) apart. */
export function parseSpec(raw:string,{item=false}:ParseOptions={}):Spec{
  let text=prepare(raw).replace(TIER,' ');
  if(item)text=text.replace(BUNDLE_WEIGHT,' ');
  const said=text;
  const blockers:string[]=[];
  if(RANGE.test(said))blockers.push('a range');
  const negations=takeNegations(text);text=negations.text;
  const packed=takePack(text);text=packed.text;
  const ect=takeValues(text,ECT,Number);text=ect.text;
  const burst=takeValues(text,BURST,Number);text=burst.text;
  const bursts=[...burst.values];
  text=text.replace(BARE_POUNDS,(_,n:string,test:string|undefined)=>{
    if(BOX_LINE.test(said)&&Number(n)>=100){if(!bursts.includes(Number(n)))bursts.push(Number(n));return ' ';}
    return ` ${n} lb ${test??''}`;
  });
  const micron=takeValues(text,MICRON,raw=>Number(raw)/25.4);text=micron.text;
  const mil=takeValues(text,MIL,Number);text=mil.text;
  const mils=[...mil.values];
  for(const m of micron.values)if(!mils.some(x=>Math.abs(x-m)<=0.005*Math.max(x,m)))mils.push(m);
  const legends:number[][]=[];
  text=text.replace(LEGEND,(_m:string,...labels:(string|undefined)[])=>{
    legends.push(labels.slice(0,3).filter((l):l is string=>!!l).map(l=>LABEL_RANK[l]));
    return ' ';
  });
  const cores:string[]=[];
  text=text.replace(CORE,(_m:string,a:string,b:string)=>{if(!cores.includes(`${a}x${b}`))cores.push(`${a}x${b}`);return ' ';});
  const gauge=takeValues(text,GAUGE,Number);text=gauge.text;
  const number=takeValues(text,NUMBER,String);text=number.text;
  const choices=takeChoices(text);text=choices.text;
  if((choices.choices.flute==='bc'||choices.choices.flute==='eb')&&!choices.choices.wall){
    choices.choices.wall='double';
    choices.values.wall=['double'];
  }
  const features=takeAll(text,FEATURES);text=features.text;
  const kraft=/\bkraft\b/.test(text);
  const colors=takeAll(text,COLORS);text=colors.text;
  const materials=MATERIALS.filter(([,re])=>re.test(text)).map(([value])=>value);
  // Kraft is paper (bubble mailers, tape, tissue), except on a box line, where it is the board's colour.
  if(kraft&&!materials.length&&!BOX_LINE.test(said))materials.push('paper');
  const grade=PAPER_GRADES.find(([,re])=>re.test(text))?.[0]??(kraft&&materials.includes('paper')?'kraft':undefined);
  if(grade){choices.choices.paper=grade;choices.values.paper=[grade];}
  const sizes=takeSizes(text.replace(SIZE_ADJECTIVE,'$1 '));
  blockers.push(...sizes.blockers);
  // A legend labels the tuple's members in order; with each label once, put them in L, W, H/D order.
  if(legends.length>1)blockers.push('two size legends');
  const order=legends[0];
  if(order){
    if(sizes.dims&&order.length===sizes.dims.length&&new Set(order).size===order.length&&!sizes.dimRanks){
      const sorted=sizes.dims.map((d,i)=>({d,rank:order[i]})).sort((a,b)=>a.rank-b.rank);
      sizes.dims=sorted.map(x=>x.d);
      sizes.dimRanks=sorted.map(x=>x.rank);
    }else blockers.push('a size legend that does not fit the size');
  }
  const measures=sizes.measures.filter(m=>m.unit),strays=sizes.measures.filter(m=>!m.unit);
  for(const stray of strays)blockers.push(`a number nothing reads: "${stray.label}"`);
  const leftover=readLeftover(sizes.text);
  blockers.push(...leftover.blockers);

  // One value per field.
  const two=(field:string,values:readonly (string|number)[])=>{if(values.length>1)blockers.push(`two ${field} values: ${values.join(' and ')}`);};
  two('ECT',ect.values);
  two('burst rating',bursts);
  two('mil',mils.map(m=>Number(m.toFixed(2))));
  two('gauge',gauge.values);
  two('mailer number',number.values.map(n=>`#${n}`));
  two('core',cores);
  for(const [key,values] of Object.entries(choices.values))two(key,values);
  two('pack',packed.values.outer);
  two('per-roll pack',packed.values.roll);
  two('colour',colors.found);
  two('material',materials);
  for(const b of bursts)for(const e of ect.values)if(BURST_TO_ECT[b]!==e)blockers.push(`two strength ratings that disagree: ${e} ECT and ${b} lb test`);

  return {
    dims:sizes.dims,dimRanks:sizes.dimRanks,otherDims:sizes.otherDims,altDims:sizes.altDims,measures,strays,
    ect:ect.value,burst:bursts[0]??null,mil:mils[0]??null,gauge:gauge.value,number:number.value,core:cores[0]??null,
    values:{ect:ect.values,burst:bursts,mil:mils,gauge:gauge.values,number:number.values,core:cores},
    colors:colors.found,materials,choices:choices.choices,choiceValues:choices.values,features:features.found,
    pack:packed.pack,packValues:packed.values,negated:negations.negated,
    words:leftover.words,blockers:[...new Set(blockers)],
  };
}

const PARSED=new WeakMap<object,ItemSpec>();
/**
 * Catalog categories whose unitless numbers are inches: strapping widths ("Poly Strapping, Hand
 * Length, 0.5 600 lbs") and edge protector thickness ("2x2x48\" .160"). Elsewhere a unitless catalog
 * number has no unit, and a line's explicit-unit measure cannot be confirmed by it.
 */
const UNITLESS_INCH_CATEGORIES=new Set(['tape','storage']);
/** Categories whose sizes the catalog lists width first (W x L): bags, mailers, envelopes, labels, and rolls and sheets (width x length). */
const WIDTH_FIRST_CATEGORIES=new Set(['bags','mailers','tape','stretch-wrap','cushioning','paper','labels']);

/**
 * The catalog's order for an item's sizes, which labelled lines are put in: L x W x H for boxes,
 * cartons, corrugated mailers, gaylords and pallets; W x L for bags, mailers, envelopes, labels, rolls
 * and sheets. Unknown (null) for bins (listed 10x12x8), edge protectors, covers and gusseted bags,
 * so a labelled line can't be Strict-eligible against them.
 */
function dimOrderOf(item:PackagingItem,name:string):DimOrder{
  if(/\b(?:bins?|edge|protectors?|covers?|gusset(?:ed)?)\b/.test(name))return null;
  const category=item.category??'';
  if(category==='boxes')return 'lwh';
  if(/\bpallets?\b/.test(name)&&category==='storage')return 'lwh';
  if(WIDTH_FIRST_CATEGORIES.has(category))return 'wl';
  if(/\benvelopes?\b/.test(name))return 'wl';
  return null;
}

/**
 * Takes a catalog row apart (cached per row object). Everything typed comes from the description;
 * the keywords add words only, because they are shared by a whole product family and name its
 * siblings' colours ("kraft tissue paper ... white tissue paper"). Colours a row doesn't state are
 * implied: kraft for plain corrugated, or the one colour its keywords name ("clear poly bags").
 */
export function parseItemSpec(item:PackagingItem):ItemSpec{
  const cached=PARSED.get(item);
  if(cached)return cached;
  const spec=parseSpec(item.description,{item:true});
  const keywordColors=takeAll(takeAll(prepare(item.keywords??''),FEATURES).text,COLORS).found;
  const implied=spec.colors.length?[]:spec.materials.includes('corrugated')?['kraft']:keywordColors.length===1?keywordColors:[];
  const keywordWords=wordsOf(prepare(item.keywords??''));
  const name=item.description.split(',')[0].replace(/^#\s*\S+\s+/,'').replace(/\s+[\d.].*$/,'').trim().toLowerCase();
  const unit=UNITLESS_INCH_CATEGORIES.has(item.category??'')?'in':null;
  const parsed:ItemSpec={
    ...spec,
    measures:[...spec.measures,...spec.strays.map(s=>({...s,unit,label:unit?`${s.label} ${unit}`:s.label}))],strays:[],
    colors:[...spec.colors,...implied],statedColors:spec.colors,
    pack:itemPack(item),
    words:[...new Set([...spec.words,...keywordWords])],
    descWords:spec.words,
    dimOrder:dimOrderOf(item,name),
    name,
  };
  PARSED.set(item,parsed);
  return parsed;
}

/**
 * The product group: the description without its pricing tier, so "…, bundle pricing" and "…,
 * pallet pricing" of one item are one group even where the tiers count differently (a few bundle
 * 10 and palletize 25). The catalog has no other two rows with one description.
 */
export function productGroup<T extends Pick<PackagingItem,'description'>>(item:T){
  return item.description.replace(TIER,'').toLowerCase().replace(/\s+/g,' ').trim();
}
