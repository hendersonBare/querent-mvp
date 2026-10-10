import type {Branch,DeliveryRates} from '@/domain';
import {roundDollars} from '@/lib/money';
import {haversineRoadFactor,round1,type DistanceProvider,type Place} from './distance';

// Freight by distance (spec §5.3). Pure: no server-only imports and no I/O beyond the
// DistanceProvider, so the rules can also run wherever the miles are already known.
//
//   willCall                     ? 0
//   : miles > MAX_RADIUS         ? CALL_FOR_FREIGHT   (the rep must price it before sending)
//   : free delivery pricing      ? 0                  (spec §4.1: freight is recovered in item prices)
//   : subtotal >= FREE_THRESHOLD ? 0
//   : max(MIN_CHARGE, BASE_FEE + PER_MILE * miles)
//
// Free delivery pricing (decision 27) only changes a delivery the engine can price: beyond the
// radius, no ship-to and no distance are still call for freight (OA-7). free_threshold and
// min_charge are ignored while it is on, but stay stored. Off (the default), nothing changes.

/** Freight the engine can't price: the rep must set it by hand, and send stays blocked until then (spec §4). */
export const CALL_FOR_FREIGHT='call_for_freight';
export type CallForFreight=typeof CALL_FOR_FREIGHT;

/**
 * Which rule priced the freight. Only `beyond_radius`, `no_ship_to` and `no_distance` give
 * CALL_FOR_FREIGHT; `no_distance` means the ship-to exists but the provider couldn't locate it.
 */
export type FreightRule='will_call'|'no_ship_to'|'no_distance'|'beyond_radius'|'free_delivery_pricing'|'free_threshold'|'min_charge'|'distance';

/** The rep-facing note on a delivery priced under free delivery pricing (spec §4.1). */
export const FREE_DELIVERY_PRICING_EXPLANATION='Free delivery pricing: freight is recovered in item prices.';

export interface FreightQuote {
  rule:FreightRule;
  /** Dollars, or CALL_FOR_FREIGHT. */
  amount:number|CallForFreight;
  /** Road miles from the quote's branch, to 0.1 mi. Null for will call or when they can't be measured. */
  miles:number|null;
  /** The distance formula, e.g. "$25.00 + $2.50/mi × 15.0 mi = $62.50", when it set the price (rules distance and min_charge). */
  formula:string|null;
  /** One sentence for the quote: the miles, the formula or rule, and what the rep must do, if anything. */
  explanation:string;
}

export interface FreightInput {
  willCall:boolean;
  /** The quote's branch: the freight origin. */
  branch:Pick<Branch,'code'|'lat'|'lng'>;
  shipTo:Place|null;
  /** Items subtotal before freight and tax. */
  subtotal:number;
  rates:DeliveryRates;
  /** The free delivery pricing toggle (spec §4.1); off when omitted. */
  freeDeliveryPricing?:boolean;
}

const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const perMile=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:4});
/** "$1,240.00": how freight dollars read on the quote and in Activity. */
export const formatUsd=(n:number)=>usd.format(n);
const miles1=(n:number)=>n.toFixed(1);

const hasShipTo=(shipTo:Place|null):shipTo is Place=>!!shipTo&&(!!shipTo.address?.trim()||(shipTo.lat!==null&&shipTo.lng!==null));

/**
 * Prices a delivery once the road miles are known: the radius, free delivery pricing,
 * free-threshold and distance rules of spec §5.3 and §4.1, in that order. Miles are rounded to 0.1 mi first.
 */
export function priceDelivery({origin,miles:rawMiles,subtotal,rates,freeDeliveryPricing=false}:{origin:string;miles:number;subtotal:number;rates:DeliveryRates;freeDeliveryPricing?:boolean}):FreightQuote{
  const miles=round1(rawMiles),from=`${miles1(miles)} mi from ${origin}`;
  if(miles>rates.max_radius_miles)return {rule:'beyond_radius',amount:CALL_FOR_FREIGHT,miles,formula:null,
    explanation:`${from} is beyond the ${round1(rates.max_radius_miles)} mi delivery radius. Call for freight: set it by hand before sending.`};
  if(freeDeliveryPricing)return {rule:'free_delivery_pricing',amount:0,miles,formula:null,explanation:FREE_DELIVERY_PRICING_EXPLANATION};
  if(roundDollars(subtotal)>=rates.free_threshold)return {rule:'free_threshold',amount:0,miles,formula:null,
    explanation:`Free delivery: items total ${formatUsd(roundDollars(subtotal))}, at or over the ${formatUsd(rates.free_threshold)} threshold. ${from}.`};
  const byDistance=roundDollars(rates.base_fee+rates.per_mile*miles);
  const formula=`${formatUsd(rates.base_fee)} + ${perMile.format(rates.per_mile)}/mi × ${miles1(miles)} mi = ${formatUsd(byDistance)}`;
  if(byDistance<rates.min_charge)return {rule:'min_charge',amount:roundDollars(rates.min_charge),miles,formula,
    explanation:`${from}: ${formula}, below the ${formatUsd(rates.min_charge)} minimum charge.`};
  return {rule:'distance',amount:byDistance,miles,formula,explanation:`${from}: ${formula}.`};
}

/** Whether freight for `input` needs road miles: a delivery with a ship-to. */
export const needsMiles=(input:Pick<FreightInput,'willCall'|'shipTo'>)=>!input.willCall&&hasShipTo(input.shipTo);

/**
 * Freight for a quote once its road miles are measured (null: not measured or not locatable),
 * synchronously: will call is $0; a delivery with no ship-to, or one with no miles, is
 * CALL_FOR_FREIGHT; otherwise priceDelivery.
 */
export function freightWithMiles(input:FreightInput,miles:number|null):FreightQuote{
  const origin=input.branch.code;
  if(input.willCall)return {rule:'will_call',amount:0,miles:null,formula:null,explanation:`Will call at ${origin}: no freight.`};
  if(!hasShipTo(input.shipTo))return {rule:'no_ship_to',amount:CALL_FOR_FREIGHT,miles:null,formula:null,
    explanation:'Delivery has no ship-to address, so freight can\'t be priced by distance. Add a ship-to, or set freight by hand.'};
  if(miles===null||!Number.isFinite(miles))return {rule:'no_distance',amount:CALL_FOR_FREIGHT,miles:null,formula:null,
    explanation:`Can't measure the distance from ${origin} to the ship-to. Set freight by hand.`};
  return priceDelivery({origin,miles,subtotal:input.subtotal,rates:input.rates,freeDeliveryPricing:input.freeDeliveryPricing});
}

/**
 * Freight for a quote (spec §5.3): will call is $0; a delivery is measured from the quote's
 * branch to the ship-to with `provider` and priced by priceDelivery. A delivery with no
 * ship-to, or one the provider can't locate, is CALL_FOR_FREIGHT.
 */
export async function computeFreight(input:FreightInput,provider:DistanceProvider=haversineRoadFactor):Promise<FreightQuote>{
  return freightWithMiles(input,needsMiles(input)?await provider.roadMiles(input.branch,input.shipTo!):null);
}

/** The rep's manual freight (spec §5.3): an amount and a required reason, logged in Activity. */
export interface FreightOverride {amount:number;reason:string}

/** The freight a quote charges: the rep's override when there is one, otherwise the computed freight. */
export interface QuoteFreight {
  computed:FreightQuote;
  override:FreightOverride|null;
  amount:number|CallForFreight;
  source:'computed'|'override';
  /** Still call for freight with no override. Blocks send (spec §4). */
  unresolved:boolean;
}

/** Applies the rep's override, which always wins, even over will call or a $0 computed freight. */
export function resolveFreight(computed:FreightQuote,override:FreightOverride|null):QuoteFreight{
  if(override)return {computed,override,amount:override.amount,source:'override',unresolved:false};
  return {computed,override:null,amount:computed.amount,source:'computed',unresolved:computed.amount===CALL_FOR_FREIGHT};
}
