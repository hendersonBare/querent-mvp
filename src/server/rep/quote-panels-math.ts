import type {DeliveryRates} from '@/domain';
import {CALL_FOR_FREIGHT,formatUsd,priceDelivery,type FreightOverride,type FreightQuote,type QuoteFreight} from '@/server/freight/engine';
import {creditUse,type CreditUse} from '@/server/pdf/worksheet';

// The quote detail's side panels (spec §4, §5.3; task 3.4): the credit bar's numbers and the
// freight as the Pickup or delivery panel shows it. Pure and client-safe, like ./quote-math: the
// page re-runs them as the rep types, on the same figures the totals and the summary card show.

// ---- Credit ----

// One formula for credit use, shared with the internal worksheet's credit block (task 4.2), so
// the screen and the PDF always agree: open ÷ limit, and (open + this quote) ÷ limit, where this
// quote is the total the summary card shows (items + freight), or the items alone while freight
// is still call for freight. Null without a positive credit limit; a missing open balance is $0.
export {creditUse,type CreditUse} from '@/server/pdf/worksheet';

/** Credit use in whole percent, as the worksheet prints it: "39%". */
export const creditPercent=(fraction:number)=>`${Math.round(fraction*100)}%`;

export interface CreditBar extends CreditUse {
  /** The Querent-green segment: the open balance, in percent of the bar (0-100). */
  open:number;
  /** The grey segment, starting where the green ends: this quote, in percent of the bar. It stops at 100%. */
  quote:number;
  /** Open balance + this quote is over the limit: the bar's end turns red. A warning only. */
  over:boolean;
  /** "Credit used, with this quote: 39%" */
  label:string;
  /** "Over limit by $1,234.50", or null. */
  overLabel:string|null;
}

const barPercent=(fraction:number)=>Math.round(Math.max(0,Math.min(1,fraction))*10000)/100;

/** The credit bar (spec §4): green for the open balance, grey for this quote, red end and "Over limit by $X" past the limit. */
export function creditBar(limit:number|null,openBalance:number|null,quoteTotal:number):CreditBar|null{
  const use=creditUse(limit,openBalance,quoteTotal);
  if(!use)return null;
  const open=barPercent(use.used);
  const quote=Math.max(0,Math.round((barPercent(use.withQuote)-open)*100)/100);
  const over=use.overBy>0;
  return {...use,open,quote,over,label:`Credit used, with this quote: ${creditPercent(use.withQuote)}`,overLabel:over?`Over limit by ${formatUsd(use.overBy)}`:null};
}

// ---- Freight ----

/**
 * The distance-priced freight re-run on the live items subtotal, as ./quote-math's liveFreight
 * prices the totals: crossing the free-delivery threshold shows at once, before the next save.
 * Will call, no ship-to and an unmeasured ship-to stay as the server priced them.
 */
export function liveFreightQuote(freight:QuoteFreight,subtotal:number,rates:DeliveryRates,origin:string):FreightQuote{
  const {computed}=freight;
  if(computed.miles!==null&&(computed.rule==='distance'||computed.rule==='min_charge'||computed.rule==='free_threshold'))
    return priceDelivery({origin,miles:computed.miles,subtotal,rates});
  return computed;
}

export interface FreightDisplay {
  /** What the quote charges: the override, else the computed freight; null while it is call for freight. */
  amount:number|null;
  callForFreight:boolean;
  source:'computed'|'override';
  /** The rep's override (amount and reason), or null. */
  override:FreightOverride|null;
  /** The engine's freight for the live subtotal: rule, road miles, formula and its one-sentence explanation. */
  computed:FreightQuote;
  /** The computed amount for the line under an override ("Distance-based: $62.50"), or null when it is call for freight. */
  computedAmount:number|null;
}

/** Freight as the Pickup or delivery panel shows it, on the same live subtotal as the totals (spec §5.3). */
export function freightDisplay(freight:QuoteFreight,subtotal:number,rates:DeliveryRates,origin:string):FreightDisplay{
  const computed=liveFreightQuote(freight,subtotal,rates,origin);
  const computedAmount=computed.amount===CALL_FOR_FREIGHT?null:computed.amount;
  if(freight.override)return {amount:freight.override.amount,callForFreight:false,source:'override',override:freight.override,computed,computedAmount};
  return {amount:computedAmount,callForFreight:computedAmount===null,source:'computed',override:null,computed,computedAmount};
}
