import {featureOff} from '@/server/flags';
import {managerRoute,repJson} from '@/server/rep/http';
import {freightImpactPreview} from '@/server/rep/freight-settings';
import {settingsError} from '@/server/rep/settings-http';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/settings/freight/preview (v3 spec §4.7, decision 35; task C3), manager only: over the
 * delivery quotes of the last 90 days, how many would carry freight recovery and the average line
 * price change per category at the step-1 and full rates. Viewing it unlocks the toggle for 24 hours.
 * Part of the Free delivery pricing section, so refused while FEATURE_FREE_DELIVERY_PRICING is off
 * (403 feature_off, decision 48).
 */
export const GET=managerRoute(async()=>{
  const off=featureOff('freeDeliveryPricing');
  if(off)return settingsError(off);
  return repJson(await freightImpactPreview());
});
