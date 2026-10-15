import type {StrictnessLevel} from '@/features/settings/strictness';
import type {MatchRun,ResultItem,SaveLine,SaveQuoteRequest,ScoredItem} from './types';

// The review dialog's state and rules, kept out of the component so they can be tested without a DOM:
// what the rep typed (prices and quantities as text), how a line totals in cents (as the database's
// quote_summaries view does: round(quantity × unit price, 2) per line), why Save is blocked, and the
// body Save posts to /api/quotes. Client-safe.

/** One line in the dialog. `key` is its index in the run, so it stays stable as lines move between sections. */
export interface ReviewLine {
  key:number;
  /** matched: in the quote with an item; unmatched: saved flagged, without an item; removed: left out (Undo brings it back). */
  status:'matched'|'unmatched'|'removed';
  /** The section a removed line goes back to on Undo. */
  restoreTo:'matched'|'unmatched';
  rawText:string;
  /** As typed. */
  quantity:string;
  unit:string|null;
  quantityUnclear:boolean;
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
    return {
      key:line.index,status:matched?'matched':'unmatched',restoreTo:matched?'matched':'unmatched',
      rawText:line.rawText,quantity:line.quantity===null?'':String(line.quantity),unit:line.unit,quantityUnclear:line.quantityUnclear,
      price:'',item:matched?line.item!:null,matchedBy:matched?'auto':null,score:matched?line.score:null,
      candidates:line.candidates,nearMisses:line.nearMisses,
    };
  });
}

const PRICE=/^(?:\d+(?:\.\d{0,4})?|\.\d{1,4})$/;
const QUANTITY=/^(?:\d+(?:\.\d{0,3})?|\.\d{1,3})$/;

/** A unit price as typed ("$1,250.50" is 1250.5): at least 0, up to 4 decimals; else null. */
export function parsePrice(input:string):number|null{
  const text=input.trim().replace(/^\$\s*/,'').replace(/,/g,'');
  return PRICE.test(text)?Number(text):null;
}

/** A quantity as typed: more than 0, up to 3 decimals; else null. */
export function parseQuantity(input:string):number|null{
  const text=input.trim().replace(/,/g,'');
  if(!QUANTITY.test(text))return null;
  const value=Number(text);
  return value>0?value:null;
}

/** quantity × unit price in cents, rounded half up (the database's round(…, 2) for positive amounts). */
export const lineCents=(quantity:number,price:number)=>Math.round(Number((quantity*price*100).toPrecision(12)));

const DOLLARS=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
export const formatMoney=(cents:number)=>DOLLARS.format(cents/100);

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
      quantity:parseQuantity(l.quantity)!,unit:l.unit,quantityUnclear:l.quantityUnclear,unitPrice:parsePrice(l.price)!,matchScore:l.score,
    }];
    return [{
      unmatched:true,originalText:l.rawText,quantity:parseQuantity(l.quantity),unit:l.unit,quantityUnclear:l.quantityUnclear,
      nearMisses:l.nearMisses.map(n=>({sku:n.sku,score:n.score})),
    }];
  });
  return {customerName:customerName.trim(),reference:reference.trim(),matchStrictness:level,lines:out};
}
