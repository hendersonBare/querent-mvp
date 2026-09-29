import type {DeliveryRates} from '@/domain';

// The limits on the delivery rates a rep can set on Settings > Pricing & delivery (spec §5.3).
// Pure, so the form and the server check the same rules.

export type DeliveryRateKey=keyof DeliveryRates;

export interface DeliveryRateLimit {label:string;min:number;max:number;decimals:number;unit:'$'|'mi'|'x'}

/** Each rate's name on the form, its range and how many decimals it keeps. */
export const DELIVERY_RATE_LIMITS:Record<DeliveryRateKey,DeliveryRateLimit>={
  base_fee:{label:'Base fee',min:0,max:10_000,decimals:2,unit:'$'},
  per_mile:{label:'Per road mile',min:0,max:1_000,decimals:2,unit:'$'},
  min_charge:{label:'Minimum charge',min:0,max:10_000,decimals:2,unit:'$'},
  free_threshold:{label:'Free delivery at items total of',min:0,max:1_000_000,decimals:2,unit:'$'},
  max_radius_miles:{label:'Delivery radius',min:1,max:1_000,decimals:1,unit:'mi'},
  road_factor:{label:'Road miles per straight-line mile',min:1,max:3,decimals:2,unit:'x'},
};
export const DELIVERY_RATE_KEYS=Object.keys(DELIVERY_RATE_LIMITS) as DeliveryRateKey[];

/**
 * The rates as they would be stored (rounded to each one's decimals), or the first problem: a
 * missing or non-numeric rate, or one outside its range.
 */
export function checkDeliveryRates(input:unknown):{rates:DeliveryRates;problem:null}|{rates:null;problem:string}{
  if(typeof input!=='object'||input===null||Array.isArray(input))return {rates:null,problem:'Send every delivery rate.'};
  const values=input as Record<string,unknown>;
  const unknown=Object.keys(values).find(key=>!(key in DELIVERY_RATE_LIMITS));
  if(unknown)return {rates:null,problem:`Unknown delivery rate: ${unknown}.`};
  const rates={} as DeliveryRates;
  for(const key of DELIVERY_RATE_KEYS){
    const {label,min,max,decimals}=DELIVERY_RATE_LIMITS[key];
    const value=values[key];
    if(typeof value!=='number'||!Number.isFinite(value))return {rates:null,problem:`${label}: enter a number.`};
    // Through toPrecision first, so binary floating point doesn't round x.xx5 down (1.005*100 is 100.49999999999999).
    const scale=10**decimals,rounded=Math.round(Number((value*scale).toPrecision(12)))/scale;
    if(rounded<min||rounded>max)return {rates:null,problem:`${label} must be from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}.`};
    rates[key]=rounded;
  }
  return {rates,problem:null};
}
