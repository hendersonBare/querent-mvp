import {updatePricing} from '@/server/rep/settings';
import {settingsWrite} from '@/server/rep/settings-http';
export const runtime='nodejs';export const dynamic='force-dynamic';

/** PUT /api/rep/settings/pricing {scarcity_uplift_enabled}: Settings > Pricing. Off by default (spec §5.1). */
export const PUT=settingsWrite((_repId,body)=>updatePricing(body));
