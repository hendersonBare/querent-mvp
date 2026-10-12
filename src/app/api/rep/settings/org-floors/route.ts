import {managerRoute,repJson} from '@/server/rep/http';
import {orgFloors,updateOrgFloors} from '@/server/rep/settings';
import {managerWrite} from '@/server/rep/settings-http';
export const runtime='nodejs';export const dynamic='force-dynamic';

// Organization margin floors (plan U8, C_S2; new-ui-implementation-prompt Appendix C, D): the hard stop per
// product category that reps cannot go below. The manager only (403 for a rep).

/** GET /api/rep/settings/org-floors: [{category_id, category_name, floor, label}] in display order. */
export const GET=managerRoute(()=>repJson(orgFloors()));

/** PUT /api/rep/settings/org-floors {floors:[{category_id, floor_pct}]}: percents from 0 to 99.9, stored together; answers every floor. */
export const PUT=managerWrite((_repId,body)=>updateOrgFloors(body));
