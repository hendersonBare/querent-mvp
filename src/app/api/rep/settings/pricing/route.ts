import {updatePricing} from '@/server/rep/settings';
import {managerWrite} from '@/server/rep/settings-http';
export const runtime='nodejs';export const dynamic='force-dynamic';

/** PUT /api/rep/settings/pricing {scarcity_uplift_enabled}: Settings > Pricing and delivery, the manager only (plan U8). Off by default (spec §5.1). */
export const PUT=managerWrite((_repId,body)=>updatePricing(body));
