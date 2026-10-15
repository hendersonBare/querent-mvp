import {updateMyFloor} from '@/server/rep/settings';
import {settingsWrite} from '@/server/rep/settings-http';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * PUT /api/rep/settings/floors {rep_id?, category_id, floor_pct} or {rep_id?, floors:[{category_id, floor_pct}]}:
 * the signed-in rep's own margins (Settings > Margins, plan U9), 0% to 99.9% in tenths of a point, several
 * stored together or none. Another rep's are refused (403); a margin below its organization floor is refused
 * with a field-level error (400 below_org_floor, `fields`).
 */
export const PUT=settingsWrite((repId,body)=>updateMyFloor(repId,body));
