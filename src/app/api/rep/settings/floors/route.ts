import {updateMyFloor} from '@/server/rep/settings';
import {settingsWrite} from '@/server/rep/settings-http';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * PUT /api/rep/settings/floors {rep_id?, category_id, floor_pct}: one of the signed-in rep's own
 * margin floors, 0% to 99.9% in tenths of a point. Another rep's floors are refused (403).
 */
export const PUT=settingsWrite((repId,body)=>updateMyFloor(repId,body));
