import 'server-only';
import type {DeliveryRates,Quote,QuoteHeader,QuoteLine} from '@/domain';
import {roundDollars,toCents} from '@/lib/money';
import {canEditDraft,effectiveStatus} from '@/server/quotes/lifecycle';
import {
  addQuoteActivity,branch,cachedPoolRate,deliveryRates,freeDeliverySettings,freightCostSettings,freightRateSettings,inTransaction,quote,saveQuoteRecovery,setFreightOverride,
} from '@/server/repository';
import {modelFuelPriceCents,modelledDeliveryCost} from './cost-model';
import {HaversineRoadFactorProvider,type DistanceProvider} from './distance';
import {CALL_FOR_FREIGHT,computeFreight,formatUsd,freightWithMiles,needsMiles,resolveFreight,type FreightInput,type FreightOverride,type QuoteFreight} from './engine';
import {rampStep,rateInForce} from './pool';
import {allocateRecovery,carriesRecovery} from './recovery';

// Freight on a quote (spec §4 side panel, §5.3): the seam the rep portal, the send checks and the
// exports use. Reads go through the repository; the rules live in ./engine.
//
// Free delivery pricing on a quote (spec §4.4, §4.5; decisions 31–35). applyQuoteRecovery decides
// and stores a draft's frozen state from the quote as it stands:
//   - it carries recovery (carriesRecovery: toggle on, delivery, no override, goods at or over the
//     free threshold, not call for freight) or not;
//   - carrying, it keeps its frozen rate, or freezes the rate in force now (cachedPoolRate, the
//     starting rate, the cap and the ramp step) when it has none: at creation, when the toggle was
//     turned on since, or when an override is cleared (OA-22). Not carrying, the rate is cleared
//     (the quote leaves the pool) and every line's recovery is 0;
//   - recovery is allocated at the frozen rate (./recovery), with the per-line cap in force;
//   - the modelled delivery cost is measured at creation and whenever the route changes (remodel),
//     or when a carrying quote has none yet; it is null for will call and call for freight.
// repriceQuoteRecovery runs it on a draft after every edit and on every rep open, so a draft whose
// frozen state disagrees with the toggle reprices on its next open or edit. Sent and final quotes
// never change: their customer price is frozen in the snapshot.

const clock=()=>new Date().toISOString();

/** The rep's override stored on the quote, or null when freight is computed. */
export function freightOverrideOf(q:Pick<QuoteHeader,'freight_override'|'freight_override_reason'>):FreightOverride|null{
  return q.freight_override===null?null:{amount:q.freight_override,reason:q.freight_override_reason??''};
}

/** Items subtotal for freight: priced lines only (a line with no price yet adds nothing), to the cent, before any freight recovery. */
export function pricedSubtotal(lines:readonly Pick<QuoteLine,'qty'|'unit_price'>[]){
  return roundDollars(lines.reduce((sum,l)=>sum+(l.unit_price===null?0:l.qty*l.unit_price),0));
}

/** Where a delivery goes: the quote's fulfillment, branch (the origin) and ship-to. */
export type QuoteRoute=Pick<Quote,'fulfillment'|'branch_id'|'ship_to_address'|'ship_to_lat'|'ship_to_lng'>;

/** The engine's input for the route minus the subtotal: will call, the origin branch and the ship-to. */
function placesOf(q:QuoteRoute):Pick<FreightInput,'willCall'|'branch'|'shipTo'>{
  const origin=branch(q.branch_id);
  if(!origin)throw new Error(`Unknown branch ${q.branch_id} on a quote.`);
  const noShipTo=q.ship_to_address===null&&q.ship_to_lat===null&&q.ship_to_lng===null;
  return {willCall:q.fulfillment==='will_call',branch:origin,shipTo:noShipTo?null:{address:q.ship_to_address,lat:q.ship_to_lat,lng:q.ship_to_lng}};
}

/** What the engine prices a quote's freight from: its branch (the origin), ship-to, subtotal, the rates and the free delivery pricing toggle. */
function freightInputOf(q:Quote,rates:DeliveryRates,subtotal=pricedSubtotal(q.lines)):FreightInput{
  return {...placesOf(q),subtotal,rates,freeDeliveryPricing:freeDeliverySettings().enabled};
}

const providerFor=(rates:DeliveryRates,provider?:DistanceProvider)=>provider??new HaversineRoadFactorProvider(rates.road_factor);

/**
 * The quote's freight: computed from its branch (the origin), ship-to and subtotal with the
 * delivery rates from Settings (road miles by their road factor unless a provider is given), then
 * the rep's override, which always wins. Pass `subtotal` to price freight for edits that aren't
 * saved yet.
 */
export async function freightForQuote(q:Quote,{provider,subtotal=pricedSubtotal(q.lines)}:{provider?:DistanceProvider;subtotal?:number}={}):Promise<QuoteFreight>{
  const rates=deliveryRates();
  const computed=await computeFreight(freightInputOf(q,rates,subtotal),providerFor(rates,provider));
  return resolveFreight(computed,freightOverrideOf(q));
}

/**
 * Sets the rep's freight override (amount and a required reason), or clears it with null, and
 * logs it in the quote's Activity, all in one transaction (spec §5.3). Throws, writing nothing,
 * on a blank reason or a negative amount. Returns false if the quote doesn't exist. The draft's
 * recovery follows on its reprice (repriceQuoteRecovery): an override drops it, clearing re-freezes it.
 */
export function overrideFreight(quoteId:string,repId:string,override:FreightOverride|null,at=new Date().toISOString()){
  return inTransaction(()=>{
    if(!setFreightOverride(quoteId,override,at))return false;
    const message=override?`Freight set to ${formatUsd(override.amount)}: ${override.reason.trim()}`:'Freight override removed: back to distance-based freight.';
    addQuoteActivity(quoteId,{actor:'rep',actorId:repId,kind:'freight_override',message,at});
    return true;
  });
}

// ---- Free delivery pricing ----

/** The rate a quote freezes at `now` (spec §4.4): the cached pool or starting rate, capped, at today's ramp step. */
export function rateInForceNow(now:string){
  const settings=freightRateSettings(),{enabledAt}=freeDeliverySettings(),pool=cachedPoolRate(now);
  const step=rampStep({enabledAt,now,steps:settings.rampSteps,days:settings.rampDays});
  return {rateBp:rateInForce({poolBp:pool.rateBp,count:pool.count,startingBp:settings.startingRateBp,capBp:settings.rateCapBp,step,steps:settings.rampSteps}),step,steps:settings.rampSteps};
}

/** The modelled cost of one delivery `miles` road miles away, in cents (spec §4.2). Fuel: the manual price only; C3 adds the stored state price. */
export function modelledFreightCents(miles:number){
  const s=freightCostSettings();
  const fuelPriceCents=modelFuelPriceCents({fuelType:s.fuelType,manualCents:s.fuelManualCents,gasolineCents:null});
  return modelledDeliveryCost({miles,mpg:s.mpg,fuelPriceCents,wearCentsPerMile:s.wearCentsPerMile,depreciationCentsPerMile:s.depreciationCentsPerMile,
    driverCentsPerHour:s.driverCentsPerHour,avgSpeedMph:s.avgSpeedMph,stopMinutes:s.stopMinutes}).cents;
}

/** Road miles for a delivery on `route`, or null for will call, no ship-to, or a ship-to the provider can't locate. */
export async function quoteRoadMiles(route:QuoteRoute,provider?:DistanceProvider):Promise<number|null>{
  const places=placesOf(route);
  return needsMiles(places)?await providerFor(deliveryRates(),provider).roadMiles(places.branch,places.shipTo!):null;
}

/** What the miles were measured for: if any of it changes, they must be measured again. */
const routeOf=(q:QuoteRoute)=>JSON.stringify([q.fulfillment,q.branch_id,q.ship_to_address,q.ship_to_lat,q.ship_to_lng]);

export interface ApplyRecoveryOptions {now:string;
  /** Measure the modelled cost again: at creation and when the fulfillment, branch or ship-to changed. */
  remodel?:boolean}

/**
 * Decides and stores the quote's free delivery pricing state (see the header), given its road miles
 * as quoteRoadMiles measured them. Synchronous, to run in the transaction that read `q`. Writes only
 * what changed; returns whether anything did.
 */
export function applyQuoteRecovery(q:Quote,miles:number|null,{now,remodel=false}:ApplyRecoveryOptions):boolean{
  const rates=deliveryRates(),input=freightInputOf(q,rates);
  const computed=freightWithMiles(input,miles);
  const callForFreight=computed.amount===CALL_FOR_FREIGHT;
  const carries=carriesRecovery({enabled:input.freeDeliveryPricing===true,fulfillment:q.fulfillment,overridden:q.freight_override!==null,subtotal:input.subtotal,
    freeThreshold:rates.free_threshold,callForFreight});
  const rate=!carries?{rateBp:null,step:null,steps:null}
    :q.freight_rate_bp===null?rateInForceNow(now):{rateBp:q.freight_rate_bp,step:q.freight_ramp_step,steps:q.freight_ramp_steps};
  const measured=q.fulfillment==='delivery'&&!callForFreight&&computed.miles!==null?computed.miles:null;
  const modelledCents=measured===null?null:remodel||(carries&&q.modelled_freight_cents===null)?modelledFreightCents(measured):q.modelled_freight_cents;
  const allocated=rate.rateBp===null?null:allocateRecovery({rateBp:rate.rateBp,lineCapBp:freightRateSettings().lineCapBp,lines:q.lines.map(l=>({
    line_no:l.line_no,qty:l.qty,unitPriceCents:l.unit_price===null?null:toCents(l.unit_price),unitCostCents:toCents(l.unit_cost),basis:l.price_basis}))});
  const lines=q.lines.map((l,i)=>({lineId:l.id,freightRecovery:allocated?.[i].freight_recovery??0}));
  const same=rate.rateBp===q.freight_rate_bp&&rate.step===q.freight_ramp_step&&rate.steps===q.freight_ramp_steps&&modelledCents===q.modelled_freight_cents
    &&lines.every((l,i)=>l.freightRecovery===q.lines[i].freight_recovery);
  if(same)return false;
  return saveQuoteRecovery(q.id,{rateBp:rate.rateBp,rampStep:rate.step,rampSteps:rate.steps,modelledCents,lines});
}

/**
 * Reprices a draft's free delivery pricing state (applyQuoteRecovery) after an edit or on the rep's
 * open. Only ready_for_review and changes_requested quotes change; sent and final ones are left as
 * they are. The miles are measured first (the provider is async), then the quote is re-read in one
 * transaction; if its route moved meanwhile, they are measured again. Returns whether anything changed.
 */
export async function repriceQuoteRecovery(quoteId:string,{now=clock(),provider,remodel=false}:{now?:string;provider?:DistanceProvider;remodel?:boolean}={}):Promise<boolean>{
  for(let attempt=0;attempt<3;attempt++){
    const q=quote(quoteId);
    if(!q||!canEditDraft(effectiveStatus(q,now)))return false;
    const miles=await quoteRoadMiles(q,provider);
    const result=inTransaction(()=>{
      const current=quote(quoteId);
      if(!current||!canEditDraft(effectiveStatus(current,now)))return false;
      if(routeOf(current)!==routeOf(q))return null;
      return applyQuoteRecovery(current,miles,{now,remodel});
    });
    if(result!==null)return result;
  }
  throw new Error(`Quote ${quoteId} kept changing its delivery route while freight recovery was priced.`);
}
