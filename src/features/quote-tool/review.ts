import type {StrictnessLevel} from '@/features/settings/strictness';
import {readPrice,readQuantity} from '@/features/quotes/limits';
import type {LineReason,MatchRun,ResultItem,SaveLine,SaveQuoteRequest,ScoredItem} from './types';
import {convertQuantity,type QuantityNote} from './units';

// The review dialog's state and rules, kept out of the component so they can be tested without a DOM:
// what the rep typed (prices and quantities as text), how a line totals in cents (as the database's
// quote_summaries view does: round(quantity × unit price, 2) per line), why Save is blocked, and the
// body Save posts to /api/quotes. Client-safe.
//
// One unit per line (./units.ts): a matched line's quantity and unit price are both in its item's
// pricing unit (`unit`), converted from the customer's quantity only when exact and never without a
// note. The customer's own quantity and unit stay on the line, so Swap and "Use this item" convert
// again from them for the new item.

/** One line in the dialog. `key` is its index in the run, so it stays stable as lines move between sections. */
export interface ReviewLine {
  key:number;
  /** matched: in the quote with an item; unmatched: saved flagged, without an item; removed: left out (Undo brings it back). */
  status:'matched'|'unmatched'|'removed';
  /** The section a removed line goes back to on Undo. */
  restoreTo:'matched'|'unmatched';
  /** Why the pipeline did not match the line (null for a matched line). */
  reason:LineReason|null;
  /** The matcher's Strict blockers for the line (empty when none were reported). */
  blockers:string[];
  rawText:string;
  /** As typed; for a matched line, in `unit`. */
  quantity:string;
  /** A matched line: its item's pricing unit ("each", "case"), or null when the item has none. Unmatched: the customer's unit. */
  unit:string|null;
  quantityUnclear:boolean;
  /** The quantity and unit the customer wrote (as parsed), kept for converting again after Swap or "Use this item". */
  customerQuantity:number|null;
  customerUnit:string|null;
  /** How the customer's quantity became `quantity`: converted exactly, or kept and to be checked (null: same unit, or no quantity). */
  quantityNote:QuantityNote|null;
  /** The rep has edited the quantity since the line got its item (a "check" flag then turns into an aside). */
  quantityChecked:boolean;
  /** As typed; never prefilled. */
  price:string;
  item:ResultItem|null;
  matchedBy:'auto'|'rep'|null;
  score:number|null;
  candidates:ScoredItem[];
  nearMisses:ScoredItem[];
}

export function initialReview(run:MatchRun):ReviewLine[]{
  return run.lines.map(line=>{
    const matched=line.outcome==='matched'&&line.item!==undefined;
    const base:ReviewLine={
      key:line.index,status:'unmatched',restoreTo:'unmatched',reason:matched?null:line.reason,blockers:[...line.eligibility?.blockers??[]],
      rawText:line.rawText,quantity:line.quantity===null?'':String(line.quantity),unit:line.unit,quantityUnclear:line.quantityUnclear,
      customerQuantity:line.quantity,customerUnit:line.unit,quantityNote:null,quantityChecked:false,
      price:'',item:null,matchedBy:null,score:null,candidates:line.candidates,nearMisses:line.nearMisses,
    };
    return matched?{...withItem(base,{...line.item!,score:line.score},'auto'),price:''}:base;
  });
}

/**
 * The line with `choice` as its item (Swap, "Use this item", or the pipeline's match): matched, its unit
 * the item's pricing unit, its quantity converted again from the customer's (any edit is replaced),
 * and the price cleared when the line was not matched before or the unit changed.
 */
export function withItem(line:ReviewLine,choice:ScoredItem,matchedBy:'auto'|'rep'):ReviewLine{
  const {score,...item}=choice;
  const unit=item.pricing?.unit??null;
  const {quantity,note}=convertQuantity(line.customerQuantity,line.customerUnit,item.pricing);
  const keepPrice=line.status==='matched'&&line.item!==null&&line.unit===unit;
  return {
    ...line,status:'matched',restoreTo:'matched',item:item as ResultItem,matchedBy,score,
    quantity:quantity===null?'':String(quantity),unit,quantityNote:note,quantityChecked:false,
    price:keepPrice?line.price:'',
  };
}

/** The line after the rep typed `value` into its quantity. */
export const editQuantity=(line:ReviewLine,value:string):ReviewLine=>({...line,quantity:value,quantityChecked:true});

/**
 * The flag under a matched line's quantity, or null: the customer's quantity that could not be
 * converted ("Check quantity (customer wrote: 10 pallets)") until the rep edits it; "Check quantity"
 * while there is no valid quantity, or the parser marked it unclear and the rep has not edited it.
 */
export function quantityFlag(line:ReviewLine):string|null{
  if(!line.quantityChecked&&line.quantityNote?.kind==='check')return line.quantityNote.text;
  if(parseQuantity(line.quantity)===null||(line.quantityUnclear&&!line.quantityChecked))return 'Check quantity';
  return null;
}

/** Matched lines whose quantity still has a flag (a valid quantity not yet checked); lines without one already block Save. */
export const quantityChecks=(lines:ReviewLine[])=>lines.filter(l=>l.status==='matched'&&parseQuantity(l.quantity)!==null&&quantityFlag(l)!==null).length;

/** The reminder under Save: "2 lines have a quantity to check." (Save stays allowed: the rep decides.) */
export const quantityChecksMessage=(n:number)=>n===0?null:n===1?'1 line has a quantity to check.':`${n} lines have a quantity to check.`;

/** The muted note under a matched line's quantity: the conversion ("Customer asked for 10 bundles = 250 each"), or what the customer wrote once a flagged quantity was edited. */
export function quantityAside(line:ReviewLine):string|null{
  const note=line.quantityNote;
  if(!note)return null;
  if(note.kind==='converted')return note.text;
  return line.quantityChecked?`Customer wrote: ${note.wrote}`:null;
}

// Prices and quantities are read with the quotes module's shared limits (src/features/quotes/limits.ts),
// so the dialog accepts exactly what the database stores and POST /api/quotes accepts.

/** A unit price as typed ("$1,250.50" is 1250.5): at least 0, up to 4 decimals; else null. */
export function parsePrice(input:string):number|null{
  const read=readPrice(input);
  return 'value' in read?read.value:null;
}

/** A quantity as typed: more than 0, up to 3 decimals; else null. */
export function parseQuantity(input:string):number|null{
  const read=readQuantity(input);
  return 'value' in read?read.value:null;
}

/** Why a typed value cannot be saved (the shared field message), or null when it can or the field is empty. */
export function priceError(input:string):string|null{
  if(!input.trim())return null;
  const read=readPrice(input);
  return 'error' in read?read.error:null;
}
export function quantityError(input:string):string|null{
  if(!input.trim())return null;
  const read=readQuantity(input);
  return 'error' in read?read.error:null;
}

/** quantity × unit price in cents, rounded half up (the database's round(…, 2) for positive amounts). */
export const lineCents=(quantity:number,price:number)=>Math.round(Number((quantity*price*100).toPrecision(12)));

const DOLLARS=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
export const formatMoney=(cents:number)=>DOLLARS.format(cents/100);

/**
 * A short hint for why a line is No match, by reason. Keys may run ahead of the matcher's type (a reason
 * it adds later); a reason not listed gets no hint, only "Could not detect a match".
 */
const REASON_HINTS:Readonly<Record<string,string>>={
  below_threshold:'No catalog item fits everything this line states.',
  low_lead:'More than one catalog item fits about as well.',
  no_product_type:'The line does not name a product type the catalog item confirms.',
  not_accounted:'Part of the line is not accounted for by the closest item.',
  judge_none:'Claude did not confirm the closest item is the same product.',
  judge_disagrees:'Claude did not confirm the closest item is the same product.',
  judge_error:'The check with Claude did not finish.',
  no_candidates:'Nothing in the catalog is close.',
};

export function reasonHint(reason:string):string|null{
  return Object.hasOwn(REASON_HINTS,reason)?REASON_HINTS[reason]:null;
}

/** Reasons the matcher's Strict blockers explain (the line itself was the problem, not the judge or a close rival). */
const BLOCKER_REASONS=new Set(['not_accounted','no_product_type','no_candidates']);
const MAX_HINT=160;

/** One blocker in the rep's words (the matcher's are already short phrases; a few get a plainer start). */
function humanBlocker(blocker:string):string{
  const contradiction=/^contradicts:\s*([a-z][a-z ]*):\s*(.+)$/i.exec(blocker);
  if(contradiction)return `the closest item differs in ${contradiction[1]}: ${contradiction[2]}`;
  if(/^two sizes:/i.test(blocker))return `the line names ${blocker}`;
  return blocker;
}

/**
 * The muted hint under "Could not detect a match": the matcher's blockers ("Not matched automatically:
 * the line names two sizes: …") when they explain the reason, else the reason's hint, else null.
 */
export function lineHint(reason:string,blockers:readonly string[]=[]):string|null{
  if(BLOCKER_REASONS.has(reason)&&blockers.length>0){
    const text=`Not matched automatically: ${blockers.slice(0,2).map(humanBlocker).join('; ')}`;
    return text.length+1>MAX_HINT?`${text.slice(0,MAX_HINT-1).trimEnd()}…`:`${text}.`;
  }
  return reasonHint(reason);
}

/** "Web list: $0.84/each": the catalog's public price as a reference label (never a price to use), or null. */
export function listPriceLabel(item:Pick<ResultItem,'listPrice'|'listPriceUnit'>):string|null{
  if(item.listPrice===null)return null;
  return `Web list: ${DOLLARS.format(item.listPrice)}${item.listPriceUnit?`/${item.listPriceUnit}`:''}`;
}

/** A line's total in cents, or null until it has a valid quantity and price. */
export function reviewLineCents(line:ReviewLine):number|null{
  const quantity=parseQuantity(line.quantity),price=parsePrice(line.price);
  return quantity===null||price===null?null:lineCents(quantity,price);
}

export const totalCents=(lines:ReviewLine[])=>lines.reduce((sum,l)=>l.status==='matched'?sum+(reviewLineCents(l)??0):sum,0);

export interface SaveBlockers {missingPrice:number;badQuantity:number;empty:boolean}

export function saveBlockers(lines:ReviewLine[]):SaveBlockers{
  const matched=lines.filter(l=>l.status==='matched');
  return {
    missingPrice:matched.filter(l=>parsePrice(l.price)===null).length,
    badQuantity:matched.filter(l=>parseQuantity(l.quantity)===null).length,
    empty:!lines.some(l=>l.status!=='removed'),
  };
}

const count=(n:number,one:string)=>`${n} ${one}${n===1?'':'s'}`;

/** Why Save is disabled, in one sentence; null when it is not. */
export function blockersMessage({missingPrice,badQuantity,empty}:SaveBlockers):string|null{
  if(empty)return 'There is nothing to save.';
  const parts=[
    missingPrice?`a price to ${count(missingPrice,'line')}`:null,
    badQuantity?`a quantity to ${count(badQuantity,'line')}`:null,
  ].filter(Boolean);
  return parts.length?`Add ${parts.join(' and ')}.`:null;
}

/** The body for POST /api/quotes (call only when saveBlockers says nothing blocks). */
export function toSaveRequest(lines:ReviewLine[],{customerName,reference,level}:{customerName:string;reference:string;level:StrictnessLevel}):SaveQuoteRequest{
  const out:SaveLine[]=lines.flatMap((l):SaveLine[]=>{
    if(l.status==='removed')return [];
    if(l.status==='matched'&&l.item)return [{
      unmatched:false,sku:l.item.sku,matchedBy:l.matchedBy??'rep',originalText:l.rawText,
      quantity:parseQuantity(l.quantity)!,unit:l.unit,quantityUnclear:l.quantityUnclear||l.quantityNote?.kind==='check',
      customerQuantity:l.quantityNote?.wrote??null,unitPrice:parsePrice(l.price)!,matchScore:l.score,
    }];
    return [{
      unmatched:true,originalText:l.rawText,quantity:l.customerQuantity,unit:l.customerUnit,quantityUnclear:l.quantityUnclear,
      nearMisses:l.nearMisses.map(n=>({sku:n.sku,score:n.score})),
    }];
  });
  return {customerName:customerName.trim(),reference:reference.trim(),matchStrictness:level,lines:out};
}
