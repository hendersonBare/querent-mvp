import 'server-only';
import type {FreeDeliverySettings,FreightCostSettings,FreightPool,FreightRateSettings} from '@/domain';
import {featureFlags,type FeatureFlags} from '@/server/flags';
import {cachedPoolRate,freeDeliverySettings,freightCostSettings,freightRateSettings,poolWindow} from '@/server/repository';
import {COST_MODEL_DEFAULTS} from './cost-model';
import {POOL_DEFAULTS} from './pool';

// What is in effect for free delivery pricing, the recovery pool and the delivery cost model (decision
// 71, amending 48; plan U12): the one place every reader in pricing, freight, recovery allocation,
// intake rate freezing, draft repricing and the impact preview asks. A feature flag that is off also
// stops what it governs, whatever is stored:
//   - FEATURE_FREE_DELIVERY_PRICING off: free delivery pricing is off (the normal freight line, no
//     recovery). Its enable time is kept, so the ramp carries on from it once the flag is back on.
//   - FEATURE_RECOVERY_POOL off: no computed pool (the starting rate applies), and the starting rate,
//     caps and ramp are the code defaults (POOL_DEFAULTS).
//   - FEATURE_DELIVERY_COST_MODEL off: the cost-model inputs are the code defaults (COST_MODEL_DEFAULTS:
//     gasoline at the state price, no manual fuel price).
// With the flag on, the stored settings apply. Stored settings are never written here (the pool's daily
// cache is not even computed while its flag is off). The math is unchanged: only which settings it
// runs on. Drafts reprice on their next open or edit and keep a rate or modelled cost they already
// froze (decisions 31, 35); sent quotes keep their snapshot. The manager's controls still show and edit
// what is stored (src/server/rep/freight-settings.ts), in sections that render only while their flag is on.
// Flags are read now (featureFlags) unless given.

/** Whether each is in effect: free delivery pricing stored on with its flag on; the pool and the cost model with their flags on. */
export function freightInEffect(flags:FeatureFlags=featureFlags()){
  return {freeDeliveryPricing:flags.freeDeliveryPricing&&freeDeliverySettings().enabled,recoveryPool:flags.recoveryPool,deliveryCostModel:flags.deliveryCostModel};
}

/** The free delivery pricing toggle in effect, with the stored enable time (the ramp's day 0). */
export function freeDeliveryInEffect(flags:FeatureFlags=featureFlags()):FreeDeliverySettings{
  const stored=freeDeliverySettings();
  return {enabled:flags.freeDeliveryPricing&&stored.enabled,enabledAt:stored.enabledAt};
}

/** The recovery rate's starting rate, caps and ramp in effect: stored while the pool is in effect, else the code defaults. */
export function freightRatesInEffect(flags:FeatureFlags=featureFlags()):FreightRateSettings{
  if(flags.recoveryPool)return freightRateSettings();
  const {startingRateBp,rateCapBp,lineCapBp,rampSteps,rampDays}=POOL_DEFAULTS;
  return {startingRateBp,rateCapBp,lineCapBp,rampSteps,rampDays};
}

/** The pool in effect at `now`: the daily cached pool while it is in effect, else none (no rate, no eligible quotes), so the starting rate applies. */
export function poolInEffect(now:string,flags:FeatureFlags=featureFlags()):FreightPool{
  return flags.recoveryPool?cachedPoolRate(now):{rateBp:null,on:false,count:0,computedOn:poolWindow(now).to.slice(0,10)};
}

/** The delivery cost model's inputs in effect: stored while it is in effect, else the code defaults. */
export function freightCostInEffect(flags:FeatureFlags=featureFlags()):FreightCostSettings{
  return flags.deliveryCostModel?freightCostSettings():{...COST_MODEL_DEFAULTS};
}
