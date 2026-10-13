import 'server-only';
import type {FreightCostSettings,FreightRateSettings,FuelStatus} from '@/domain';
import {toCents} from '@/lib/money';
import {checkFreightUpdate,rampSchedule,type RampStepView} from '@/server/freight/controls';
import type {DistanceProvider} from '@/server/freight/distance';
import {fuelPriceStatus,refreshFuelPrice,type FuelPriceSource} from '@/server/freight/fuel-price';
import {freeDeliveryInEffect,freightRatesInEffect,poolInEffect} from '@/server/freight/in-effect';
import {POOL_DEFAULTS,rampStep,rateInForce} from '@/server/freight/pool';
import {impactPreview,type ImpactPreview} from '@/server/freight/preview';
import {wouldCarryRecovery} from '@/server/freight/quote';
import {
  branches,freeDeliverySettings,freightCostSettings,freightPreviewViewedAt,freightRateSettings,inTransaction,poolInputs,poolRecoveredCents,
  previewQuotes,setFreeDeliveryPricing,setFreightCostSettings,setFreightPreviewViewedAt,setFreightRateSettings,
} from '@/server/repository';
import {SettingsError} from './settings';

// Free delivery pricing's manager controls on Settings > Pricing & delivery (v3 spec §1.3, §4.3,
// §4.4, §4.6, §4.7, §5; decisions 28–31, 35, 36; OA-11; task C3). The routes under
// /api/rep/settings/freight serve them to the manager only (managerRoute); a rep never sees them.
//
// - GET: the toggle and its enable time, the cost-model inputs, the rate settings, the pool panel
//   (the cached pool or starting rate with the eligible count, the cap, the ramp step and schedule,
//   and the trailing 90 days' modelled cost and recovered amount, live), and the fuel price in use
//   for each delivering branch's state with its warnings. Loading refreshes each state's fuel price
//   (at most once a day; ./fuel-price).
// - PUT: any of the toggle, cost inputs and rate settings, checked (checkFreightUpdate) before
//   anything is stored, all in one transaction. Turning it on is refused (409 preview_required)
//   unless the impact preview was viewed in the last 24 hours (OA-11), and records the enable time
//   (the ramp restarts). Turning it off clears nothing else: drafts reprice on their next open (C2).
// - Preview: over the delivery quotes created in the last 90 days, those that would carry recovery
//   and the average line price change per category at the step-1 and full rates (./preview).
//   Viewing it records free_delivery_preview_viewed_at.
// No settings history and no what-if simulator (decision log, "Explicitly NOT in scope").
//
// Decision 71 (plan U12): `enabled`, `cost` and `rates` are what is stored (the controls show and edit
// it); the pool panel, the ramp schedule, the fuel price in use and the preview are what is in effect
// (../freight/in-effect): with FEATURE_RECOVERY_POOL off, the code's rates and no computed pool; with
// FEATURE_FREE_DELIVERY_PRICING off, no ramp step and no rate in force. A section renders only while its
// flag is on, and then the two agree.

/** How long a viewed preview unlocks the toggle (OA-11). */
export const PREVIEW_VALID_MS=24*3_600_000;

export interface FreightPoolView {
  /** The cached pool rate (null: nothing to divide) and the eligible quotes it was computed over. */
  computedBp:number|null;count:number;
  /** Quotes needed before the pool rate replaces the starting rate (20), and whether it has. */
  minCount:number;usingPool:boolean;
  startingBp:number;capBp:number;
  /** The pool or starting rate, capped: the full (last-step) rate. */
  baseBp:number;
  /** Today's ramp step (0 while off) of `steps`, and the rate a new quote freezes now. */
  step:number;steps:number;rateInForceBp:number;
  windowDays:number;
  schedule:RampStepView[];
  /** Over the eligible quotes of the trailing 90 days, live: modelled delivery cost and what item prices recovered. */
  modelledCents:number;recoveredCents:number;
}

export interface FreightSettingsView {
  enabled:boolean;enabledAt:string|null;
  /** When the impact preview was last viewed, and whether that still unlocks the toggle (24 h). */
  previewViewedAt:string|null;previewValid:boolean;
  cost:FreightCostSettings;rates:FreightRateSettings;
  pool:FreightPoolView;
  /** The fuel price in use per delivering branch state. */
  fuel:FuelStatus[];
  /** Every fuel warning, once each. */
  warnings:string[];
}

export interface ImpactPreviewView extends ImpactPreview {steps:number;windowDays:number;viewedAt:string}

/** The states the branches deliver from, in branch order, once each. */
const deliveryStates=()=>[...new Set(branches().map(b=>b.state))];

const previewValid=(viewedAt:string|null,now:string)=>viewedAt!==null&&Date.parse(now)-Date.parse(viewedAt)<=PREVIEW_VALID_MS;

/** The full rate (capped pool or starting rate) and the rates at each ramp step, as a quote created now would freeze them (in effect). */
function rates(now:string){
  const settings=freightRatesInEffect(),pool=poolInEffect(now);
  const at=(step:number)=>rateInForce({poolBp:pool.rateBp,count:pool.count,startingBp:settings.startingRateBp,capBp:settings.rateCapBp,step,steps:settings.rampSteps});
  return {settings,pool,at};
}

/** The view, from what is stored and in effect (no fetch). */
function view(now:string):FreightSettingsView{
  const {enabled,enabledAt}=freeDeliverySettings();
  const {settings,pool,at}=rates(now);
  const on=freeDeliveryInEffect().enabled&&enabledAt!==null;
  const step=on?rampStep({enabledAt,now,steps:settings.rampSteps,days:settings.rampDays}):0;
  const baseBp=at(settings.rampSteps);
  const fuel=deliveryStates().map(state=>fuelPriceStatus(state,now));
  const viewedAt=freightPreviewViewedAt();
  return {
    enabled,enabledAt,previewViewedAt:viewedAt,previewValid:previewValid(viewedAt,now),
    cost:freightCostSettings(),rates:freightRateSettings(),
    pool:{computedBp:pool.rateBp,count:pool.count,minCount:POOL_DEFAULTS.minPoolCount,usingPool:pool.count>=POOL_DEFAULTS.minPoolCount&&pool.rateBp!==null,
      startingBp:settings.startingRateBp,capBp:settings.rateCapBp,baseBp,step,steps:settings.rampSteps,rateInForceBp:at(step),windowDays:POOL_DEFAULTS.windowDays,
      schedule:rampSchedule({baseBp,steps:settings.rampSteps,days:settings.rampDays,enabledAt:on?enabledAt:null}),
      modelledCents:poolInputs(now).modelledCents,recoveredCents:poolRecoveredCents(now)},
    fuel,warnings:[...new Set(fuel.flatMap(f=>f.warnings))],
  };
}

/** GET /api/rep/settings/freight: refreshes each delivering state's fuel price (once a day at most), then the view. */
export async function freightSettingsView({now=new Date().toISOString(),source}:{now?:string;source?:FuelPriceSource|null}={}):Promise<FreightSettingsView>{
  for(const state of deliveryStates())await refreshFuelPrice(state,{now,...(source!==undefined?{source}:{})});
  return view(now);
}

/** PUT /api/rep/settings/freight: checks the change, refuses enabling without a recent preview (409 preview_required), stores it all at once, and returns the view. */
export async function updateFreightSettings(input:unknown,{now=new Date().toISOString()}:{now?:string}={}):Promise<FreightSettingsView>{
  const {update,problem}=checkFreightUpdate(input);
  if(!update)throw new SettingsError(problem);
  inTransaction(()=>{
    const turningOn=update.enabled===true&&!freeDeliverySettings().enabled;
    if(turningOn&&!previewValid(freightPreviewViewedAt(),now))
      throw new SettingsError('View the impact preview before turning on free delivery pricing. It counts for 24 hours.',409,'preview_required');
    if(update.cost)setFreightCostSettings(update.cost);
    if(update.rates)setFreightRateSettings(update.rates);
    if(turningOn)setFreeDeliveryPricing(true,now);
    else if(update.enabled===false)setFreeDeliveryPricing(false,now);
  });
  return view(now);
}

/**
 * GET /api/rep/settings/freight/preview: the delivery quotes created in the last 90 days, how many
 * would carry recovery, and the average line price change per category at the step-1 and full
 * rates in force now (./preview). Records the view, which unlocks the toggle for 24 hours.
 */
export async function freightImpactPreview({now=new Date().toISOString(),provider}:{now?:string;provider?:DistanceProvider}={}):Promise<ImpactPreviewView>{
  const {settings,at}=rates(now);
  const quotes=[];
  for(const q of previewQuotes(now)){
    quotes.push({carries:await wouldCarryRecovery(q,provider),lines:q.lines.map(l=>({categoryId:l.category_id,categoryName:l.category_name,categoryOrder:l.category_order,
      line_no:l.line_no,qty:l.qty,unitPriceCents:l.unit_price===null?null:toCents(l.unit_price),unitCostCents:toCents(l.unit_cost),basis:l.price_basis}))});
  }
  const preview=impactPreview({quotes,step1Bp:at(1),fullBp:at(settings.rampSteps),lineCapBp:settings.lineCapBp});
  setFreightPreviewViewedAt(now);
  return {...preview,steps:settings.rampSteps,windowDays:POOL_DEFAULTS.windowDays,viewedAt:now};
}
