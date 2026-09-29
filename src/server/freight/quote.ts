import 'server-only';
import type {Quote,QuoteHeader,QuoteLine} from '@/domain';
import {addQuoteActivity,branch,deliveryRates,inTransaction,setFreightOverride} from '@/server/repository';
import {HaversineRoadFactorProvider,type DistanceProvider} from './distance';
import {computeFreight,formatUsd,resolveFreight,type FreightOverride,type QuoteFreight} from './engine';

// Freight on a quote (spec §4 side panel, §5.3): the seam the rep portal, the send checks and the
// exports use. Reads go through the repository; the rules live in ./engine.

/** The rep's override stored on the quote, or null when freight is computed. */
export function freightOverrideOf(q:Pick<QuoteHeader,'freight_override'|'freight_override_reason'>):FreightOverride|null{
  return q.freight_override===null?null:{amount:q.freight_override,reason:q.freight_override_reason??''};
}

/** Items subtotal for freight: priced lines only (a line with no price yet adds nothing), to the cent. */
export function pricedSubtotal(lines:readonly Pick<QuoteLine,'qty'|'unit_price'>[]){
  return Math.round(lines.reduce((sum,l)=>sum+(l.unit_price===null?0:l.qty*l.unit_price),0)*100)/100;
}

/**
 * The quote's freight: computed from its branch (the origin), ship-to and subtotal with the
 * delivery rates from Settings (road miles by their road factor unless a provider is given), then
 * the rep's override, which always wins. Pass `subtotal` to price freight for edits that aren't
 * saved yet.
 */
export async function freightForQuote(q:Quote,{provider,subtotal=pricedSubtotal(q.lines)}:{provider?:DistanceProvider;subtotal?:number}={}):Promise<QuoteFreight>{
  const rates=deliveryRates();
  const origin=branch(q.branch_id);
  if(!origin)throw new Error(`Quote ${q.quote_number} has unknown branch ${q.branch_id}.`);
  const noShipTo=q.ship_to_address===null&&q.ship_to_lat===null&&q.ship_to_lng===null;
  const shipTo=noShipTo?null:{address:q.ship_to_address,lat:q.ship_to_lat,lng:q.ship_to_lng};
  const computed=await computeFreight({willCall:q.fulfillment==='will_call',branch:origin,shipTo,subtotal,rates},provider??new HaversineRoadFactorProvider(rates.road_factor));
  return resolveFreight(computed,freightOverrideOf(q));
}

/**
 * Sets the rep's freight override (amount and a required reason), or clears it with null, and
 * logs it in the quote's Activity, all in one transaction (spec §5.3). Throws, writing nothing,
 * on a blank reason or a negative amount. Returns false if the quote doesn't exist.
 */
export function overrideFreight(quoteId:string,repId:string,override:FreightOverride|null,at=new Date().toISOString()){
  return inTransaction(()=>{
    if(!setFreightOverride(quoteId,override,at))return false;
    const message=override?`Freight set to ${formatUsd(override.amount)}: ${override.reason.trim()}`:'Freight override removed: back to distance-based freight.';
    addQuoteActivity(quoteId,{actor:'rep',actorId:repId,kind:'freight_override',message,at});
    return true;
  });
}
