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

export interface PricingUnit {
  /** What the list price is per, singular and lowercase: "each", "case", "roll", "coil". */
  unit:string;
  /** Pieces in one unit when the pack states it ("Case of 1,000" -> 1000; each -> 1), else null. */
  contains:number|null;
  /** For an item priced each but sold in bundles: the bundle size (caseQty > 1), else null. */
  bundleOf:number|null;
}

/** The pricing unit of a catalog item from its pack and caseQty; null when the pack is missing. */
export function pricingUnit(pack:string|null|undefined,caseQty:number|null|undefined):PricingUnit|null{
  const match=/^\s*([a-z]+)(?:\s+of\s+([\d,]+))?/i.exec(pack??'');
  if(!match)return null;
  const unit=match[1].toLowerCase();
  if(unit==='each'){
    const bundle=caseQty!=null&&Number.isInteger(caseQty)&&caseQty>1?caseQty:null;
    return {unit:'each',contains:1,bundleOf:bundle};
  }
  const stated=match[2]?Number(match[2].replace(/,/g,'')):null;
  return {unit,contains:stated!==null&&Number.isInteger(stated)&&stated>0?stated:null,bundleOf:null};
}

export type CustomerUnit='each'|'bundle'|'case'|'roll'|'coil';

const CUSTOMER_UNITS:Readonly<Record<string,CustomerUnit>>={
  each:'each',ea:'each',pc:'each',pcs:'each',piece:'each',pieces:'each',
  bundle:'bundle',bundles:'bundle',bdl:'bundle',bdls:'bundle',bndl:'bundle',bndls:'bundle',
  case:'case',cases:'case',cs:'case',
  roll:'roll',rolls:'roll',rl:'roll',rls:'roll',
  coil:'coil',coils:'coil',
};

/** The customer's unit as one this module can convert, or null (missing, or a unit it does not convert: pallet, carton, box, pack). */
export function customerUnit(written:string|null|undefined):CustomerUnit|null{
  const key=(written??'').trim().toLowerCase().replace(/\.$/,'');
  return Object.hasOwn(CUSTOMER_UNITS,key)?CUSTOMER_UNITS[key]:null;
}

/** A unit after a quantity: "4 rolls", "1 case", "3 each", "2 boxes" (null quantity reads as many). */
export function unitLabel(quantity:number|null,unit:string|null):string|null{
  if(!unit)return null;
  if(quantity===1||unit==='each'||/s$/.test(unit))return unit;
  return /(x|ch|sh)$/.test(unit)?`${unit}es`:`${unit}s`;
}

/** "per each", "per case": what a unit price is per; null without a unit. */
export const perUnitLabel=(unit:string|null)=>unit?`per ${unit}`:null;

const NUMBER=new Intl.NumberFormat('en-US',{maximumFractionDigits:3});
const amount=(quantity:number,unit:string|null)=>unit?`${NUMBER.format(quantity)} ${unitLabel(quantity,unit)}`:NUMBER.format(quantity);

/**
 * converted: the customer's quantity was changed into the pricing unit exactly ("Customer asked for
 * 10 bundles = 250 each"). check: it could not be, so the line keeps the customer's number and asks the
 * rep to check it ("Check quantity (customer wrote: 10 pallets)"). `wrote` is the customer's quantity
 * in words ("10 bundles", "10, no unit").
 */
export interface QuantityNote {kind:'converted'|'check';wrote:string;text:string}

export interface ConvertedQuantity {quantity:number|null;note:QuantityNote|null}

/** Rounds away floating-point noise (2.5 x 25), to the 3 decimals a line keeps. */
const clean=(n:number)=>Math.round(n*1000)/1000;

/**
 * The customer's quantity in the item's pricing unit. Exact conversions only:
 *   - the same unit (cases of an item priced per case, each of an item priced each): the same number;
 *   - bundles of an item priced each and sold in bundles of N: quantity x N each;
 *   - pieces (each, ea, pcs) of an item priced per case (or roll) of N: quantity / N, when that is whole.
 * Anything else (an unknown or missing unit, an item without a pricing unit, pieces that do not divide)
 * keeps the customer's number with a "check" note. Never changes a number without a note.
 */
export function convertQuantity(quantity:number|null,unit:string|null,pricing:PricingUnit|null):ConvertedQuantity{
  if(quantity===null)return {quantity:null,note:null};
  const said=customerUnit(unit);
  const wrote=unit?amount(quantity,said==='each'?'each':said??unit.trim()):`${NUMBER.format(quantity)}, no unit`;
  const check:ConvertedQuantity={quantity,note:{kind:'check',wrote,text:`Check quantity (customer wrote: ${wrote})`}};
  if(!pricing||!said)return check;
  if(said===pricing.unit)return {quantity,note:null};

  let converted:number|null=null;
  if(said==='bundle'&&pricing.unit==='each'&&pricing.bundleOf)converted=clean(quantity*pricing.bundleOf);
  else if(said==='each'&&pricing.contains){
    const cases=quantity/pricing.contains;
    if(Math.abs(cases-Math.round(cases))<1e-9&&Math.round(cases)>0)converted=Math.round(cases);
  }
  if(converted===null||quantityProblem(converted)!==null||quantityProblem(quantity)!==null)return check;
  return {quantity:converted,note:{kind:'converted',wrote,text:`Customer asked for ${wrote} = ${amount(converted,pricing.unit)}`}};
}
