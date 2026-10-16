import {quantityProblem} from '@/features/quotes/limits';

// Price units (one unit per quote line). A catalog item's list price is per one unit of its pack: its
// PRICING UNIT. A matched line's quantity and the rep's unit price are both in that unit, so the line
// total (quantity x unit price) and the "Web list: $1.09/each" reference agree. The customer's quantity
// is converted into it only when the conversion is exact, with a note saying so; anything else keeps
// the customer's number and is flagged. Client-safe and pure.
//
// The catalog's pack values (data/boxt-catalog.json, `pack` with `caseQty`; units.test.ts lists every
// shape and fails on a new one):
//   "Each", caseQty > 1   per piece, sold in bundles of caseQty (boxes, mailers)    -> each, bundles of N
//   "Each", caseQty 1     per piece, sold one at a time (gaylords)                  -> each
//   "Case of N"           per case of N pieces (bags; caseQty is 1)                 -> case, N pieces
//   "Case"                per case, pieces not stated                               -> case
//   "Roll" / "Roll of N"  per roll (of N pieces: labels)                            -> roll
//   "Coil"                per coil (strapping)                                      -> coil
// Any other pack is per its first word ("Pack of 12" -> pack, 12 pieces).
//
// Catalog anomalies (the data is not changed; the helper reads around them):
//   - A description that states a case count ("12/Case", "Case of 12") wins over a pack of "Each" or a
//     bare "Case": KN100 "Safety Knives & Box Cutters, 12/Case" is pack "Each" at $57.98, a price per
//     case of 12, so it is priced per case of 12; "Wardrobe Box Combo Pack, 3/Case" is a case of 3.
//
// The customer's units:
//   - each, ea, pc(s), piece(s): pieces. bundle(s), bdl(s), bndl(s): bundles. case(s), cs: cases.
//     carton(s), ctn(s): cases too (scripts/fetch-boxt-catalog.ts reads "per carton" as "Case of N"),
//     never pieces. roll(s), rl(s): rolls. coil(s): coils.
//   - The item's own product noun counts as pieces ("500 boxes" of a box, "4 rolls" of stretch wrap,
//     "2,000 bags"): see productNouns. A box is a piece only of an item priced each; "12 boxes" of an
//     item priced per case may be cases or pieces, so it is flagged.
//   - Any other word ("pallets", "skids", "bx") is kept as written and flagged.
//   - A part of a countable unit (2.5 bundles, 2.5 cases) is flagged, never presented as exact.
//   - A pack size the customer states ("50/bundle", "500/case", "case of 1,000", "500 ct"; statedPack)
//     must be the item's (the same count; a roll is not a case): when it differs from the item's known
//     count, or the item's count is not known, the customer's numbers are kept and flagged ("Check
//     quantity: customer's pack is 50/bundle, this item is a bundle of 25"), never converted. When it is
//     the item's, the quantity converts as above and the note names it ("2 bundles (25/bundle) = 50 each").

export interface PricingUnit {
  /** What the list price is per, singular and lowercase: "each", "case", "roll", "coil". */
  unit:string;
  /** Pieces in one unit when the pack (or the description, see the anomalies) states it ("Case of 1,000" -> 1000; each -> 1), else null. */
  contains:number|null;
  /** For an item priced each but sold in bundles: the bundle size (caseQty > 1), else null. */
  bundleOf:number|null;
  /** What one piece is called (productNouns: "box", "roll"); empty when the item was not given. */
  nouns:string[];
}

/** A case count stated in a description: "12/Case", "12 / cs", "Case of 12". */
const STATED_CASE=/\b(\d[\d,]*)\s*\/\s*(?:case|cs)\b|\bcase\s+of\s+(\d[\d,]*)/i;
const count=(text:string|undefined)=>{
  const n=text?Number(text.replace(/,/g,'')):NaN;
  return Number.isInteger(n)&&n>0?n:null;
};

/**
 * The pricing unit of a catalog item from its pack and caseQty (and, when given, its description and
 * category for the piece nouns and a stated case count); null when the pack is missing.
 */
export function pricingUnit(pack:string|null|undefined,caseQty:number|null|undefined,item?:{description?:string|null;category?:string|null}):PricingUnit|null{
  const match=/^\s*([a-z]+)(?:\s+of\s+([\d,]+))?/i.exec(pack??'');
  if(!match)return null;
  const unit=match[1].toLowerCase();
  const nouns=item?productNouns(item.description??'',item.category??null):[];
  const statedCase=item?.description?STATED_CASE.exec(item.description):null;
  const caseCount=statedCase?count(statedCase[1]??statedCase[2]):null;
  if((unit==='each'||(unit==='case'&&!match[2]))&&caseCount!==null)return {unit:'case',contains:caseCount,bundleOf:null,nouns};
  if(unit==='each'){
    const bundle=caseQty!=null&&Number.isInteger(caseQty)&&caseQty>1?caseQty:null;
    return {unit:'each',contains:1,bundleOf:bundle,nouns};
  }
  return {unit,contains:count(match[2]),bundleOf:null,nouns};
}

// ---- Words -------------------------------------------------------------------------------------------

type Measure='each'|'bundle'|'case'|'roll'|'coil';

/** The customer's unit words this module converts: written (lowercase) -> the unit it measures and how the note names it. */
const UNIT_WORDS:Readonly<Record<string,{unit:Measure;word:string}>>={};
const addWords=(unit:Measure,word:string,forms:string[])=>{for(const f of forms)(UNIT_WORDS as Record<string,{unit:Measure;word:string}>)[f]={unit,word};};
addWords('each','each',['each','ea','pc','pcs','piece','pieces']);
addWords('bundle','bundle',['bundle','bundles','bdl','bdls','bndl','bndls']);
addWords('case','case',['case','cases','cs']);
addWords('case','carton',['carton','cartons','ctn','ctns']);
addWords('roll','roll',['roll','rolls','rl','rls']);
addWords('coil','coil',['coil','coils']);

/** The product nouns, singular -> its group: box, bag (bag, pouch), mailer (mailer, envelope), roll, sheet, label, coil. */
const NOUNS:Readonly<Record<string,string>>={
  box:'box',bag:'bag',pouch:'bag',mailer:'mailer',envelope:'mailer',roll:'roll',sheet:'sheet',label:'label',coil:'coil',
};
/** Only categories whose every item is that thing (the bags category also holds pallet covers and sheeting; mailers, dispenser packs). */
const CATEGORY_NOUNS:Readonly<Record<string,string>>={boxes:'box',labels:'label'};
const ROLL_GOODS=/\bstretch\s+(?:wrap|film)\b|\btape\b(?!\s+dispensers?\b)/i;
/** Words after a noun that keep it the head ("Bags on a Roll", "Mailers for …"); any other word makes it a modifier ("Box Cutters"). */
const CONNECTORS=new Set(['on','for','with','in','of','and','or','per','to','by','from','w']);

/** Unit words a quantity may be followed by, singular -> plural; any other word is echoed as written. */
const PLURALS:Readonly<Record<string,string>>={
  each:'each',piece:'pieces',bundle:'bundles',case:'cases',carton:'cartons',roll:'rolls',coil:'coils',pack:'packs',
  box:'boxes',bag:'bags',pouch:'pouches',mailer:'mailers',envelope:'envelopes',sheet:'sheets',label:'labels',
  pallet:'pallets',skid:'skids',set:'sets',kit:'kits',tube:'tubes',spool:'spools',ream:'reams',unit:'units',
};
const SINGULARS:Readonly<Record<string,string>>=Object.fromEntries(Object.entries(PLURALS).map(([one,many])=>[many,one]));

const lower=(written:string|null|undefined)=>(written??'').trim().toLowerCase().replace(/\.$/,'');

/** The customer's unit as one this module can convert ("cartons" -> case), or null (missing, or a word it does not convert). */
export function customerUnit(written:string|null|undefined):Measure|null{
  const key=lower(written);
  return Object.hasOwn(UNIT_WORDS,key)?UNIT_WORDS[key].unit:null;
}

/** A written product noun ("Boxes", "pouches") as its singular and group, or null. */
function pieceNoun(written:string|null|undefined):{singular:string;group:string}|null{
  const word=lower(written);
  const singular=Object.hasOwn(SINGULARS,word)?SINGULARS[word]:word;
  return Object.hasOwn(NOUNS,singular)?{singular,group:NOUNS[singular]}:null;
}

/**
 * What one piece of an item is called: the description's head noun (the first listed noun that is not a
 * modifier of the next word: "Box Cutters" is not a box), else its category's noun (boxes, labels), else roll for stretch wrap and tape (not tape dispensers), which the catalog sells
 * by the roll without saying so.
 */
export function productNouns(description:string,category:string|null):string[]{
  for(const match of description.matchAll(/[a-z]+/gi)){
    const noun=pieceNoun(match[0]);
    if(!noun)continue;
    const next=/^\s+([a-z]+)/i.exec(description.slice(match.index+match[0].length))?.[1]?.toLowerCase();
    if(next&&!CONNECTORS.has(next))continue;
    return [noun.group];
  }
  const key=category?.toLowerCase()??'';
  if(Object.hasOwn(CATEGORY_NOUNS,key))return [CATEGORY_NOUNS[key]];
  return ROLL_GOODS.test(description)?['roll']:[];
}

/** A unit after a quantity: "4 rolls", "1 case", "3 each", "2 boxes"; a word it does not know is echoed as written ("10 bx"). */
export function unitLabel(quantity:number|null,unit:string|null):string|null{
  if(!unit)return null;
  const key=unit.trim().toLowerCase();
  if(Object.hasOwn(PLURALS,key))return quantity===1?key:PLURALS[key];
  if(Object.hasOwn(SINGULARS,key))return quantity===1?SINGULARS[key]:key;
  return unit.trim();
}

/** "per each", "per case": what a unit price is per; null without a unit. */
export const perUnitLabel=(unit:string|null)=>unit?`per ${unit}`:null;

const NUMBER=new Intl.NumberFormat('en-US',{maximumFractionDigits:3});
const amount=(quantity:number,unit:string|null)=>unit?`${NUMBER.format(quantity)} ${unitLabel(quantity,unit)}`:NUMBER.format(quantity);

// ---- The customer's stated pack ----------------------------------------------------------------------

/** A pack size the customer states: the count, what it is per (bundle, case, roll, box; null for a bare count: "500 ct", "pack of 100"), and how to say it. */
export interface StatedPack {count:number;per:'bundle'|'case'|'roll'|'box'|null;text:string}

/** Words a stated pack is per; a carton is a case (as for quantities), a pack is a bare count. */
const CONTAINERS:Readonly<Record<string,StatedPack['per']>>={
  bundle:'bundle',bundles:'bundle',bdl:'bundle',bdls:'bundle',bndl:'bundle',bndls:'bundle',
  case:'case',cases:'case',cs:'case',carton:'case',cartons:'case',ctn:'case',ctns:'case',
  box:'box',boxes:'box',bx:'box',roll:'roll',rolls:'roll',rl:'roll',rls:'roll',
  pack:null,packs:null,pk:null,pks:null,
};
const CONTAINER=`(${Object.keys(CONTAINERS).sort((a,b)=>b.length-a.length).join('|')})`;
/** A whole count, with or without thousands separators: 50, 1000, 1,000, 12,500. */
const PACK_COUNT=String.raw`(\d{1,3}(?:,\d{3})+|\d+)`;
const NOT_PART_OF_A_NUMBER=String.raw`(?<![\w.,#/])`;
interface PackPattern {re:RegExp;count:number;per:number|null}
/** Phrases that can only be a pack size, wherever they stand in the line. */
const PACK_PHRASES:PackPattern[]=[
  // "50/bundle", "1,000 / cs", "100 per carton", "36 rolls per case", "500 bags/case", "500 a case"
  {re:new RegExp(String.raw`${NOT_PART_OF_A_NUMBER}${PACK_COUNT}\s*(?:[a-z]+\s*)?(?:\/|\bper\b|\ba\b)\s*${CONTAINER}\b`,'i'),count:1,per:2},
  // "case of 1,000", "bundle of 25", "roll of 250", "pack of 100", "2 cases of 500"
  {re:new RegExp(String.raw`\b${CONTAINER}\s+of\s+${PACK_COUNT}\b`,'i'),count:2,per:1},
];
/**
 * A bare count ("500 ct", "100 count", "12 pk", "12-pack"): a pack size only in the description, since
 * "3 pk" in the whole line may be the quantity. Singular words only: "3 packs" is a quantity.
 */
const BARE_COUNT:PackPattern={re:new RegExp(String.raw`${NOT_PART_OF_A_NUMBER}${PACK_COUNT}\s*-?\s*(?:ct|cnt|count|pk|pack)\b`,'i'),count:1,per:null};

function readPack(text:string,patterns:PackPattern[]):StatedPack|null{
  for(const {re,count,per} of patterns){
    const match=re.exec(text);
    if(!match)continue;
    const n=Number(match[count].replace(/,/g,''));
    if(!Number.isSafeInteger(n)||n<1)continue;
    const container=per===null?null:CONTAINERS[match[per].toLowerCase()];
    return {count:n,per:container,text:container?`${NUMBER.format(n)}/${container}`:`${NUMBER.format(n)} ct`};
  }
  return null;
}

/**
 * The pack size the customer states in a line, or null: from its description (the parser keeps "500/case"
 * there), else from the whole line as written, where only a phrase that cannot be the quantity counts
 * ("50/bundle", "case of 500"; not "3 pk").
 */
export function statedPack(description:string|null|undefined,rawText?:string|null):StatedPack|null{
  return readPack(description??'',[...PACK_PHRASES,BARE_COUNT])??readPack(rawText??'',PACK_PHRASES);
}

/** What a pack holds pieces of: a roll's labels, or an outer pack's (case, bundle, box) pieces; null: any. */
const packLevel=(per:string|null)=>per===null||per==='each'?null:per==='roll'?'roll':'outer';

/** The item's own pack: a bundle of N of an item priced each, one piece, or its pricing unit of N; null when the count is not known. */
function itemPack(pricing:PricingUnit):{count:number;per:string}|null{
  if(pricing.unit==='each')return pricing.bundleOf?{count:pricing.bundleOf,per:'bundle'}:{count:1,per:'each'};
  return pricing.contains?{count:pricing.contains,per:pricing.unit}:null;
}

/**
 * Why the customer's stated pack is not the item's, or null when it is: the same count, and (when the
 * customer names it) the same kind of pack (a roll is not a case; a case, bundle or box are alike).
 */
function packMismatch(pack:StatedPack,pricing:PricingUnit):string|null{
  const own=itemPack(pricing);
  if(!own)return 'this item\'s pack count is not known';
  const level=packLevel(pack.per),ownLevel=packLevel(own.per);
  if(own.count===pack.count&&(level===null||ownLevel===null||level===ownLevel))return null;
  return own.per==='each'?'this item is sold one at a time':`this item is a ${own.per} of ${NUMBER.format(own.count)}`;
}

// ---- Converting -------------------------------------------------------------------------------------

/**
 * converted: the customer's quantity was changed into the pricing unit exactly ("Customer asked for
 * 10 bundles = 250 each"). check: it could not be, so the line keeps the customer's number and asks the
 * rep to check it ("Check quantity (customer wrote: 10 pallets)"). `wrote` is the customer's quantity
 * in words ("10 bundles", "10, no unit").
 */
export interface QuantityNote {kind:'converted'|'check';wrote:string;text:string}

export interface ConvertedQuantity {quantity:number|null;note:QuantityNote|null}

/**
 * The customer's quantity in the item's pricing unit. Exact conversions only, of whole quantities:
 *   - the same unit (cases of an item priced per case, each of an item priced each): the same number;
 *     the item's own product noun counts as each ("500 boxes" of a box priced each: 500); cartons are
 *     cases, said so in a note ("Customer asked for 2 cartons = 2 cases");
 *   - bundles of an item priced each and sold in bundles of N: quantity x N each;
 *   - pieces (each, ea, pcs, or the item's own noun: "4 rolls", "2,000 bags") of an item priced per
 *     case (or roll) of N: quantity / N, when that is whole.
 * Anything else (an unknown or missing unit, an item without a pricing unit, pieces that do not divide,
 * a part of a unit, a stated pack size that is not the item's: see statedPack) keeps the customer's
 * number with a "check" note. Never changes a number without a note.
 */
export function convertQuantity(quantity:number|null,unit:string|null,pricing:PricingUnit|null,pack:StatedPack|null=null):ConvertedQuantity{
  if(quantity===null)return {quantity:null,note:null};
  const key=lower(unit);
  const known=Object.hasOwn(UNIT_WORDS,key)?UNIT_WORDS[key]:null;
  const noun=pieceNoun(unit);
  const word=known?.word??noun?.singular??(unit?unit.trim():null);
  const wrote=`${unit?amount(quantity,word):`${NUMBER.format(quantity)}, no unit`}${pack?` (${pack.text})`:''}`;
  const check:ConvertedQuantity={quantity,note:{kind:'check',wrote,text:`Check quantity (customer wrote: ${wrote})`}};
  if(!pricing)return check;
  // The customer's own pack size must be the item's, or nothing is converted.
  const mismatch=pack?packMismatch(pack,pricing):null;
  if(pack&&mismatch)return {quantity,note:{kind:'check',wrote,text:`Check quantity: customer's pack is ${pack.text}, ${mismatch}`}};
  if(!Number.isInteger(quantity)||quantityProblem(quantity)!==null)return check;

  let said:Measure|null=known?.unit??null;
  // The item's own product noun is a piece ("500 boxes" of a box, "4 rolls" of stretch wrap); a box only
  // of an item priced each, since a box of an item priced per case may be the case itself.
  if(said!==pricing.unit&&noun&&pricing.nouns.includes(noun.group)&&(noun.group!=='box'||pricing.unit==='each'))said='each';
  if(!said)return check;
  const converted=(n:number):ConvertedQuantity=>quantityProblem(n)!==null?check
    :{quantity:n,note:{kind:'converted',wrote,text:`Customer asked for ${wrote} = ${amount(n,pricing.unit)}`}};
  if(said===pricing.unit)return known?.word==='carton'?converted(quantity):{quantity,note:null};

  if(said==='bundle'&&pricing.unit==='each'&&pricing.bundleOf)return converted(quantity*pricing.bundleOf);
  if(said==='each'&&pricing.contains&&quantity%pricing.contains===0)return converted(quantity/pricing.contains);
  return check;
}
