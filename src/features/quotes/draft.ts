import type {Quote} from '@/server/repository/types';
import {QUOTE_COPY} from './copy';
import {quoteTotal} from './format';
import {LIMITS,type LinePatch,type QuotePatch} from './patch';

// Edit mode on /quotes/[id] (docs/boxt/plan.md B6). The inputs hold text; checkDraft says what is wrong
// with each field, and Save stays disabled until nothing is: every kept matched line needs a quantity
// above 0 and a unit price of 0 or more with up to 4 decimals, and at least one line must be left.
// Unmatched lines keep their stored quantity and have no price. Client-safe and pure.

export interface LineDraft {
  id:string;
  unmatched:boolean;
  quantity:string;
  unitPrice:string;
}

export interface QuoteDraft {
  customerName:string;
  reference:string;
  /** The lines still on the quote, in order (a removed line is gone from here). */
  lines:LineDraft[];
}

export interface DraftCheck {
  ok:boolean;
  customerName?:string;
  reference?:string;
  /** Per line id: the message for each field that is wrong. */
  lines:Record<string,{quantity?:string;unitPrice?:string}>;
  /** A problem with the quote as a whole (no lines left). */
  form?:string;
}

const QUANTITY=/^(\d+(\.\d+)?|\.\d+)$/;
const PRICE=new RegExp(`^(\\d+(\\.\\d{1,${LIMITS.priceDecimals}})?|\\.\\d{1,${LIMITS.priceDecimals}})$`);
const clean=(text:string)=>text.trim().replace(/,/g,'');

/** A quantity typed by the rep ("1,500", "2.5"), or null when it is not a number above 0. */
export function parseQuantity(text:string):number|null{
  const value=clean(text);
  if(!QUANTITY.test(value))return null;
  const n=Number(value);
  return n>0&&n<LIMITS.quantityBelow?n:null;
}

/** A unit price typed by the rep ("0.375", "$1.50"), or null unless it is 0 or more with up to 4 decimals. */
export function parsePrice(text:string):number|null{
  const value=clean(text).replace(/^\$/,'');
  if(!PRICE.test(value))return null;
  const n=Number(value);
  return n<LIMITS.priceBelow?n:null;
}

const asText=(n:number|null)=>n===null?'':String(n);

export function draftFrom(quote:Quote):QuoteDraft{
  return {
    customerName:quote.customerName,
    reference:quote.reference,
    lines:quote.lines.map(l=>({id:l.id,unmatched:l.unmatched,quantity:asText(l.quantity),unitPrice:asText(l.unitPrice)})),
  };
}

export function checkDraft(draft:QuoteDraft):DraftCheck{
  const check:DraftCheck={ok:true,lines:{}};
  if(draft.customerName.trim().length>LIMITS.text)check.customerName=QUOTE_COPY.textTooLong;
  if(draft.reference.trim().length>LIMITS.text)check.reference=QUOTE_COPY.textTooLong;
  if(draft.lines.length===0)check.form=QUOTE_COPY.needsLine;
  for(const line of draft.lines){
    if(line.unmatched)continue;
    const errors:{quantity?:string;unitPrice?:string}={};
    if(parseQuantity(line.quantity)===null)errors.quantity=line.quantity.trim()?QUOTE_COPY.quantityError:QUOTE_COPY.required;
    if(parsePrice(line.unitPrice)===null)errors.unitPrice=line.unitPrice.trim()?QUOTE_COPY.priceError:QUOTE_COPY.required;
    if(errors.quantity||errors.unitPrice)check.lines[line.id]=errors;
  }
  check.ok=!check.customerName&&!check.reference&&!check.form&&Object.keys(check.lines).length===0;
  return check;
}

/** The PATCH body for a valid draft: the header fields, and the kept lines (an unmatched line by id only). */
export function toPatch(draft:QuoteDraft):QuotePatch{
  return {
    customerName:draft.customerName.trim(),
    reference:draft.reference.trim(),
    lines:draft.lines.map((line):LinePatch=>line.unmatched?{id:line.id}:{id:line.id,quantity:parseQuantity(line.quantity),unitPrice:parsePrice(line.unitPrice)}),
  };
}

/** The total of the draft's matched lines whose quantity and price are valid, as the user types. */
export function draftTotal(draft:QuoteDraft):number{
  return quoteTotal(draft.lines.map(l=>({unmatched:l.unmatched,quantity:parseQuantity(l.quantity),unitPrice:parsePrice(l.unitPrice)})));
}
