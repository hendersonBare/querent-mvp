import {z} from 'zod';
import {decimalPlaces} from './format';

// What a quote line can hold, in one place for the API and every form that edits a line (the quotes
// page here; the quote creation tool's review dialog, B5). The numbers are the database's:
// quote_lines.quantity numeric(14,3) and unit_price numeric(12,4) (supabase/migrations/*_boxt_schema.sql),
// and the checks in create_quote / update_quote (*_quote_rpcs.sql). Checking them here first means a
// value is refused with a field message instead of being rounded silently by the column (1.2345 would be
// stored as 1.235, and 0.0001 as 0, which the positive-quantity check then refuses).
// Client-safe and pure.

export const QUOTE_LIMITS={
  /** customer_name and reference. */
  textMax:200,
  linesMax:200,
  quantityDecimals:3,
  /** The smallest quantity the column keeps above 0 (10^-3). */
  quantityMin:0.001,
  quantityBelow:100_000_000_000,
  priceDecimals:4,
  priceBelow:100_000_000,
} as const;

export const LIMIT_COPY={
  required:'Required.',
  quantityPositive:'Enter a quantity above 0.',
  quantityMinimum:'Enter a quantity of at least 0.001.',
  quantityDecimals:'Use up to 3 decimals.',
  quantityTooLarge:'Enter a quantity below 100,000,000,000.',
  priceInvalid:'Enter a price of 0 or more, with up to 4 decimals.',
  priceNegative:'Enter a price of 0 or more.',
  priceDecimals:'Use up to 4 decimals.',
  priceTooLarge:'Enter a price below $100,000,000.',
  textTooLong:'Use at most 200 characters.',
} as const;

/** Why `n` cannot be a line's quantity, or null when it can (stored exactly as given). */
export function quantityProblem(n:number):string|null{
  if(Number.isNaN(n)||n<=0)return LIMIT_COPY.quantityPositive;
  if(!Number.isFinite(n)||n>=QUOTE_LIMITS.quantityBelow)return LIMIT_COPY.quantityTooLarge;
  // Below half the smallest step the column would round it to 0.
  if(n<QUOTE_LIMITS.quantityMin/2)return LIMIT_COPY.quantityMinimum;
  if(decimalPlaces(n)>QUOTE_LIMITS.quantityDecimals)return LIMIT_COPY.quantityDecimals;
  return null;
}

/** Why `n` cannot be a line's unit price, or null when it can (stored exactly as given). */
export function priceProblem(n:number):string|null{
  if(Number.isNaN(n))return LIMIT_COPY.priceInvalid;
  if(n<0)return LIMIT_COPY.priceNegative;
  if(!Number.isFinite(n)||n>=QUOTE_LIMITS.priceBelow)return LIMIT_COPY.priceTooLarge;
  if(decimalPlaces(n)>QUOTE_LIMITS.priceDecimals)return LIMIT_COPY.priceDecimals;
  return null;
}

const refined=(problem:(n:number)=>string|null)=>z.number().superRefine((n,ctx)=>{
  const message=problem(n);
  if(message)ctx.addIssue({code:'custom',message});
});

/** A quantity in an API body (a JSON number). */
export const quantitySchema=refined(quantityProblem);
/** A unit price in an API body (a JSON number). */
export const unitPriceSchema=refined(priceProblem);
/** customer_name or reference in an API body. */
export const quoteTextSchema=z.string().max(QUOTE_LIMITS.textMax,LIMIT_COPY.textTooLong);

/** A number typed into a form: digits with an optional decimal part; grouping commas and spaces around are ignored. */
const NUMBER=/^(\d+(\.\d+)?|\.\d+)$/;

/** A quantity typed by the rep ("1,500", "2.5"): its value, or the field message. */
export function readQuantity(text:string):{value:number}|{error:string}{
  const clean=text.trim().replace(/,/g,'');
  if(!clean)return {error:LIMIT_COPY.required};
  if(!NUMBER.test(clean))return {error:LIMIT_COPY.quantityPositive};
  const value=Number(clean);
  const error=quantityProblem(value);
  return error?{error}:{value};
}

/** A unit price typed by the rep ("0.375", "$1.50"): its value, or the field message. */
export function readPrice(text:string):{value:number}|{error:string}{
  const clean=text.trim().replace(/,/g,'').replace(/^\$/,'');
  if(!clean)return {error:LIMIT_COPY.required};
  if(!NUMBER.test(clean))return {error:LIMIT_COPY.priceInvalid};
  const value=Number(clean);
  const error=priceProblem(value);
  return error?{error}:{value};
}
