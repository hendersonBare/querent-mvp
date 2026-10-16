import type {QuoteLine} from '@/server/repository/types';

// How the quotes pages print numbers and dates (docs/boxt/plan.md B6). Client-safe and pure.
//
// Money is computed exactly, as the database computes it: quote_summaries totals
// Σ round(quantity × unit_price, 2) on numeric. JavaScript numbers cannot do that (3 × 0.845 is
// 2.5349999… in floating point), so each number is read as the exact decimal it prints as and the
// arithmetic runs on BigInt, rounding half up to whole cents.

const ZERO=BigInt(0),ONE=BigInt(1),TWO=BigInt(2),TEN=BigInt(10);
const pow10=(n:number)=>TEN**BigInt(n);

/** `n` as an exact decimal: digits × 10^-scale (for the shortest text that reads back as `n`). */
function toDecimal(n:number):{digits:bigint;scale:number}{
  if(!Number.isFinite(n))throw new RangeError('Not a finite number.');
  // String() gives "0.845", or an exponent form such as "1e-7" or "1.5e+21".
  const [mantissa,exp='0']=String(Math.abs(n)).toLowerCase().split('e');
  const [whole,frac='']=mantissa.split('.');
  const sign=n<0?-ONE:ONE;
  const scale=frac.length-Number(exp);
  const digits=BigInt(whole+frac)*sign;
  return scale>=0?{digits,scale}:{digits:digits*pow10(-scale),scale:0};
}

/** How many decimals `n` has (1.5 → 1, 0.375 → 3, 1e-7 → 7). */
export function decimalPlaces(n:number):number{
  const {digits,scale}=toDecimal(n);
  if(digits===ZERO)return 0;
  let s=scale,d=digits<ZERO?-digits:digits;
  while(s>0&&d%TEN===ZERO){d/=TEN;s--;}
  return s;
}

/** digits × 10^-scale rounded half up (for amounts ≥ 0) to whole cents. */
function toCents(digits:bigint,scale:number):bigint{
  if(scale<=2)return digits*pow10(2-scale);
  const divisor=pow10(scale-2);
  const quotient=digits/divisor,remainder=digits%divisor;
  return remainder*TWO>=divisor?quotient+ONE:quotient;
}

const centsOf=(amount:number)=>{const {digits,scale}=toDecimal(amount);return toCents(digits,scale);};

/** `n` rounded half up (away from zero) to `places` decimals, as a numeric(_, places) column stores it. */
function toScale(n:number,places:number):bigint{
  const {digits,scale}=toDecimal(n);
  if(scale<=places)return digits*pow10(places-scale);
  const divisor=pow10(scale-places);
  const negative=digits<ZERO,abs=negative?-digits:digits;
  const quotient=abs/divisor,rounded=(abs%divisor)*TWO>=divisor?quotient+ONE:quotient;
  return negative?-rounded:rounded;
}

/** The scales of quote_lines.quantity numeric(14,3) and unit_price numeric(12,4). */
const QUANTITY_SCALE=3,PRICE_SCALE=4;

/**
 * quantity × unitPrice rounded half up to cents, in cents; null when either is missing. Each factor is
 * first rounded to its column's scale, so a total shown before saving equals the saved one.
 */
function lineCents(quantity:number|null,unitPrice:number|null):bigint|null{
  if(quantity===null||unitPrice===null)return null;
  return toCents(toScale(quantity,QUANTITY_SCALE)*toScale(unitPrice,PRICE_SCALE),QUANTITY_SCALE+PRICE_SCALE);
}

/** A line's total, round(quantity × unitPrice, 2), or null when it lacks either. */
export function lineTotal(quantity:number|null,unitPrice:number|null):number|null{
  const cents=lineCents(quantity,unitPrice);
  return cents===null?null:Number(cents)/100;
}

/** The quote's total as the database's quote_summaries view computes it: matched lines with both a quantity and a price. */
export function quoteTotal(lines:readonly Pick<QuoteLine,'unmatched'|'quantity'|'unitPrice'>[]):number{
  let cents=ZERO;
  for(const line of lines){
    if(line.unmatched)continue;
    cents+=lineCents(line.quantity,line.unitPrice)??ZERO;
  }
  return Number(cents)/100;
}

const MONEY=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
const UNIT_PRICE=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:4});
const QUANTITY=new Intl.NumberFormat('en-US',{maximumFractionDigits:6});

/** $1,234.56: rounded half up to cents. */
export const formatMoney=(amount:number)=>MONEY.format(Number(centsOf(amount))/100);

/** A unit price: 2 decimals, or up to 4 when it has them ($0.80, $0.375, $0.1234). */
export const formatUnitPrice=(price:number)=>UNIT_PRICE.format(price);

/** 1,500 or 2.5. */
export const formatQuantity=(quantity:number)=>QUANTITY.format(quantity);

/** A similarity score (0 to 1) as a whole percent ("58%"), as the review dialog and the quote page show it; null without one. */
export const formatSimilarity=(score:number|null)=>score===null?null:`${Math.round(score*100)}%`;

/** Oct 15, 2026, 2:05 PM in `timeZone` (the viewer's, see LocalDateTime). */
export function formatDateTime(iso:string,timeZone?:string):string{
  return new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone}).format(new Date(iso));
}
