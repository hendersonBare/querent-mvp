import {updateDelivery} from '@/server/rep/settings';
import {settingsWrite} from '@/server/rep/settings-http';
export const runtime='nodejs';export const dynamic='force-dynamic';

/** PUT /api/rep/settings/delivery {base_fee, per_mile, min_charge, free_threshold, max_radius_miles, road_factor}: Settings > Pricing & delivery (spec §5.3). */
export const PUT=settingsWrite((_repId,body)=>updateDelivery(body));
