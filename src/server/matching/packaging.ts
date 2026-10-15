import {normalize,stem} from './text';

// Packaging-aware parsing (BOXT task B3). Takes a customer's line (usually another supplier's
// catalog line, such as `12 x 10 x 8" Corrugated Boxes 200 lb test 25/bundle`, with the supplier's
// SKU already removed by the parser) or a BOXT catalog row apart into what can be compared:
//   - dims: the first "a x b x c" group, in the order given (12x10x8 is not 12x8x10);
//   - measures: every other number with its unit (a 1/2" bubble, 600 lb strapping, 50 lb paper);
//   - strength (ECT, or a burst rating "200 lb test" / "200#"), mil, gauge, a "#2" size number;
//   - exclusive choices: wall, closure, adhesive, print method, film type, hand/machine, paper grade;
//   - features that make a different kind of item (bubble, padded, insulated, heavy duty, ...);
//   - colours (brown and natural are kraft) and materials (poly, paper, corrugated, foam);
//   - the stated pack quantity ("25/bundle", "1000/case", "case of 500");
//   - the words that are left, stemmed.
// Pure, with no server imports. Each rule's match is removed from the text before the next runs.

/** A number with its unit (in, ft, yd, mm, cm, m, lb, oz, cuft; null when the text gave none). */
export interface Size {unit:string|null;value:number;label:string}
/** A pack quantity: `outer` is the count per case, bundle or carton; `roll` the count per roll. */
export interface Pack {outer?:number;roll?:number}
export type ChoiceKey='wall'|'closure'|'adhesive'|'print'|'film'|'length'|'paper';

/** What a line (or a catalog row) says about the item. */
export interface Spec {
  dims:Size[]|null;
  /** The dims with the single length just before them in front ("1/2" Bubble 12"x250'" also reads 1/2 x 12 x 250). */
  altDims:Size[]|null;
  measures:Size[];
  ect:number|null;
  burst:number|null;
  mil:number|null;
  gauge:number|null;
  /** The size number of a mailer ("#2" is "2"; "#000" stays "000"). */
  number:string|null;
  colors:string[];
  materials:string[];
  choices:Partial<Record<ChoiceKey,string>>;
  features:string[];
  pack:Pack;
  words:string[];
}

/** A catalog row, taken apart. */
export interface ItemSpec extends Spec {
  /** The product name: "corrugated boxes", "kraft bubble mailers". */
  name:string;
  /** The colours the description states; `colors` adds the implied ones (kraft for plain corrugated). */
  statedColors:string[];
}

export interface PackagingItem {sku:string;description:string;keywords?:string|null;pack?:string|null;caseQty?:number|null}

// ---- Normalizing --------------------------------------------------------------------------------

/** normalize() plus the packaging spellings: 70MMx450' and 1075'x1075' split into "a x b", cubic feet as cuft. */
function prepare(text:string){
  return normalize(text)
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
  // "1000 ct", "500 count"
  {re:new RegExp(String.raw`(?<![\w.,])${COUNT}\s*(?:ct|count)\b`,'g'),unit:()=>'outer',count:m=>m[1]},
];
const toCount=(raw:string)=>Number(raw.replace(/,/g,''));

/** Takes the stated pack quantities out of the text. */
function takePack(text:string){
  const pack:Pack={};
  for(const {re,unit,count} of PACK_RULES){
    text=text.replace(re,(...args)=>{
      const m=args.slice(0,-2) as unknown as RegExpExecArray;
      const key=unit(m);
      pack[key]??=toCount(count(m));
      return ' ';
    });
  }
  return {pack,text};
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
const BARE_POUNDS=/\b(\d{2,4})\s*#(?!\s*\d)/g;
const BOX_LINE=/\b(?:box(?:es)?|cartons?|corrugated|cardboard|gaylords?|rsc)\b/;
const MIL=/(?<![\w.])(\d*\.?\d+)\s*-?\s*mils?\b/g;
const GAUGE=/\b(\d+)\s*-?\s*(?:gauge|gage|ga)\b/g;
const NUMBER=/(?<![\w#])#\s*(\d+[a-z]?)\b/g;

/** The first capture group that matched, of a replace() callback's arguments. */
const firstGroup=(args:unknown[])=>(args.slice(1,-2) as (string|undefined)[]).find(g=>g!==undefined);

function takeFirst(text:string,re:RegExp,read:(raw:string)=>number|string){
  let value:number|string|null=null;
  text=text.replace(re,(...args)=>{
    const raw=firstGroup(args);
    if(raw!==undefined)value??=read(raw);
    return ' ';
  });
  return {value,text};
}

// ---- Choices, features, colours, materials -----------------------------------------------------------

/** Exclusive choices: a line saying one and an item saying another contradict each other. */
const CHOICES:{key:ChoiceKey;values:[string,RegExp][]}[]=[
  {key:'wall',values:[
    ['triple',/\btriple[\s-]*wall\b/g],
    ['double',/\bdouble[\s-]*wall\b|\bdbl\.?[\s-]*wall\b|\bd\/w\b|\bdw\b|\bbc[\s-]*flute\b/g],
    ['single',/\bsingle[\s-]*wall\b|\bs\/w\b/g],
  ]},
  {key:'closure',values:[
    ['reclosable',/\bre-?closable\b|\bre-?sealable\b|\bzip[\s-]*(?:lock|top|seal|close)\b|\bziploc?k?\b|\bzipper\b|\bzip\b|\bslider\b/g],
    ['self-seal',/\bself[\s-]*seal(?:ing)?\b|\bpeel[\s-]*(?:and|&|n)[\s-]*seal\b/g],
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
  {key:'length',values:[
    ['hand',/\bhand[\s-]*(?:length|grade)\b|\bhand(?=[\s-]+(?:stretch|pallet|wrap|film|strapping)\b)|(?<=\b(?:stretch|wrap|film|strapping),?[\s-]+)hand\b/g],
    ['machine',/\bmachine[\s-]*(?:length|grade)\b|\bmachine(?=[\s-]+(?:stretch|pallet|wrap|film|strapping)\b)|(?<=\b(?:stretch|wrap|film|strapping),?[\s-]+)machine\b/g],
  ]},
];
/** The choices that make an item a different kind when the line doesn't say them (single wall is the default; kraft paper is also its colour). */
export const DEFINING_CHOICE=(key:ChoiceKey,value:string)=>key==='closure'||(key==='wall'&&value!=='single')||(key==='paper'&&value!=='kraft');

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

/** Materials are read but their words stay (they also count as words). Kraft is paper unless another material is named. */
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

function takeChoices(text:string){
  const choices:Partial<Record<ChoiceKey,string>>={};
  for(const {key,values} of CHOICES){
    for(const [value,re] of values){
      text=text.replace(re,()=>{choices[key]??=value;return ' ';});
    }
  }
  return {choices,text};
}

// ---- Sizes ------------------------------------------------------------------------------------------

const UNIT_OF:Record<string,string>={'"':'in',"''":'in',in:'in',inch:'in',inches:'in',"'":'ft',ft:'ft',feet:'ft',foot:'ft',
  yd:'yd',yds:'yd',yard:'yd',yards:'yd',mm:'mm',cm:'cm',m:'m',meter:'m',meters:'m',lb:'lb',lbs:'lb',pound:'lb',pounds:'lb',oz:'oz',cuft:'cuft',gal:'gal',gallon:'gal',gallons:'gal'};
const NUM=String.raw`(\d+[\s-]\d+\/\d+|\d+\/\d+|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d*\.\d+|\d+)`;
const UNIT=String.raw`(?:\s*-?\s*(inch(?:es)?\b|in\b\.?|"|''|feet\b|foot\b|ft\b\.?|'|yards?\b|yds?\b|mm\b|cm\b|meters?\b|m\b|pounds?\b|lbs?\b\.?|oz\b|cuft\b|gallons?\b|gal\b))?`;
const SIZE=new RegExp(String.raw`(?<![\w.\/#,])${NUM}(?![\d\/])${UNIT}`,'g');
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
 * dims tuple, every other number a measure. A weight never joins a group.
 */
function takeSizes(text:string){
  const found:(Size&{start:number;end:number})[]=[];
  for(const m of text.matchAll(SIZE)){
    const value=toNumber(m[1]);
    if(!Number.isFinite(value))continue;
    const unit=m[2]?UNIT_OF[m[2].replace(/\.$/,'')]??null:null;
    found.push({unit,value,label:m[1],start:m.index,end:m.index+m[0].length});
  }
  const isLength=(s:Size)=>s.unit===null||familyOf(s.unit)==='length';
  const joined=(i:number)=>i+1<found.length&&/^\s*(?:x|by)\s*$/.test(text.slice(found[i].end,found[i+1].start))&&isLength(found[i])&&isLength(found[i+1]);
  const groups:(typeof found)[]=[];
  for(let i=0;i<found.length;i++){
    if(i>0&&joined(i-1))groups.at(-1)!.push(found[i]);else groups.push([found[i]]);
  }
  for(const group of groups){
    let carry:string|null=null;
    for(let i=group.length-1;i>=0;i--){
      if(group[i].unit)carry=group[i].unit;else if(group.length>1)group[i].unit=carry;
    }
  }
  const strip=({unit,value,label}:Size):Size=>({unit,value,label:unit?`${label} ${unit}`:label});
  const at=groups.findIndex(g=>g.length>1);
  const tuple=at>=0?groups[at]:null;
  const before=at>0&&groups[at-1].length===1&&isLength(groups[at-1][0])?groups[at-1][0]:null;
  const measures=groups.filter(g=>g!==tuple).flat().map(strip);
  let rest=text;
  for(const {start,end} of [...found].reverse())rest=`${rest.slice(0,start)} ${rest.slice(end)}`;
  return {dims:tuple?tuple.map(strip):null,altDims:tuple&&before?[before,...tuple].map(strip):null,measures,text:rest};
}

/** Two sizes are the same when equal in a shared unit family; a size without a unit compares by number alone. */
export function sameSize(a:Size,b:Size){
  if(a.unit&&b.unit){
    const [fa,ka]=TO_BASE[a.unit]??[a.unit,1],[fb,kb]=TO_BASE[b.unit]??[b.unit,1];
    if(fa!==fb)return false;
    const x=a.value*ka,y=b.value*kb;
    return Math.abs(x-y)<=Math.max(1e-6,0.002*Math.max(x,y));
  }
  return Math.abs(a.value-b.value)<1e-6;
}

// ---- Words ------------------------------------------------------------------------------------------

/** Words that say nothing about the item. The supplier's own name is one of them. */
const STOP=new Set(`a an the and or of for with w to in on at by per from x please pls need our we item items qty quantity
  each ea pc pcs piece pieces uline brand size sz approx approximately inch inches ft feet lb lbs mil mils ga gauge ect test
  count ct case cases cs bundle bundles bdl bdls ctn ctns pk pkg pkgs new style no thick thickness wide width long high tall`.split(/\s+/));

function wordsOf(text:string){
  const words:string[]=[];
  for(const raw of text.split(/[^a-z0-9]+/)){
    if(raw.length<2||/^\d+$/.test(raw))continue;
    const word=stem(raw);
    if(STOP.has(raw)||STOP.has(word))continue;
    if(!words.includes(word))words.push(word);
  }
  return words;
}

// ---- Putting it together ----------------------------------------------------------------------------

/** Takes a line (or a catalog description) apart. */
export function parseSpec(raw:string):Spec{
  let text=prepare(raw).replace(TIER,' ').replace(BUNDLE_WEIGHT,' ');
  const said=text;
  const packed=takePack(text);text=packed.text;
  const ect=takeFirst(text,ECT,Number);text=ect.text;
  const burst=takeFirst(text,BURST,Number);text=burst.text;
  let bareBurst:number|null=null;
  text=text.replace(BARE_POUNDS,(_,n:string)=>{
    if(BOX_LINE.test(said)&&Number(n)>=100){bareBurst??=Number(n);return ' ';}
    return `${n} lb`;
  });
  const mil=takeFirst(text,MIL,Number);text=mil.text;
  const gauge=takeFirst(text,GAUGE,Number);text=gauge.text;
  const number=takeFirst(text,NUMBER,String);text=number.text;
  const choices=takeChoices(text);text=choices.text;
  const features=takeAll(text,FEATURES);text=features.text;
  const kraft=/\bkraft\b/.test(text);
  const colors=takeAll(text,COLORS);text=colors.text;
  const materials=MATERIALS.filter(([,re])=>re.test(text)).map(([value])=>value);
  if(kraft&&!materials.length)materials.push('paper');
  const grade=PAPER_GRADES.find(([,re])=>re.test(text))?.[0]??(kraft&&materials.includes('paper')?'kraft':undefined);
  if(grade)choices.choices.paper=grade;
  const sizes=takeSizes(text);
  return {
    dims:sizes.dims,altDims:sizes.altDims,measures:sizes.measures,
    ect:ect.value as number|null,burst:(burst.value as number|null)??bareBurst,
    mil:mil.value as number|null,gauge:gauge.value as number|null,number:number.value as string|null,
    colors:colors.found,materials,choices:choices.choices,features:features.found,pack:packed.pack,
    words:wordsOf(sizes.text),
  };
}

const PARSED=new WeakMap<object,ItemSpec>();

/**
 * Takes a catalog row apart (cached per row object). Everything typed comes from the description;
 * the keywords add words only, because they are shared by a whole product family and name its
 * siblings' colours ("kraft tissue paper ... white tissue paper"). Colours a row doesn't state are
 * implied: kraft for plain corrugated, or the one colour its keywords name ("clear poly bags").
 */
export function parseItemSpec(item:PackagingItem):ItemSpec{
  const cached=PARSED.get(item);
  if(cached)return cached;
  const spec=parseSpec(item.description);
  const keywordColors=takeAll(takeAll(prepare(item.keywords??''),FEATURES).text,COLORS).found;
  const implied=spec.colors.length?[]:spec.materials.includes('corrugated')?['kraft']:keywordColors.length===1?keywordColors:[];
  const keywordWords=wordsOf(prepare(item.keywords??''));
  const name=item.description.split(',')[0].replace(/^#\s*\S+\s+/,'').replace(/\s+[\d.].*$/,'').trim().toLowerCase();
  const parsed:ItemSpec={
    ...spec,
    colors:[...spec.colors,...implied],statedColors:spec.colors,
    pack:itemPack(item),
    words:[...new Set([...spec.words,...keywordWords])],
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
