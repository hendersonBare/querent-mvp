import {updateDelivery} from '@/server/rep/settings';
import {managerWrite} from '@/server/rep/settings-http';
export const runtime='nodejs';export const dynamic='force-dynamic';

/** PUT /api/rep/settings/delivery {base_fee, per_mile, min_charge, free_threshold, max_radius_miles, road_factor}: Settings > Pricing and delivery (spec §5.3), the manager only (plan U8). */
export const PUT=managerWrite((_repId,body)=>updateDelivery(body));
