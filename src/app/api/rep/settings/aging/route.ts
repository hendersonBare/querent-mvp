import {managerRoute,repJson} from '@/server/rep/http';
import {managerWrite} from '@/server/rep/settings-http';
import {agingSettings,updateAgingSettings} from '@/server/rep/team';
export const runtime='nodejs';export const dynamic='force-dynamic';

// The aging thresholds (v3 spec §1.3, §3, §5; decision 16; task D1): supplier settings, manager only.

/** GET /api/rep/settings/aging: {rfrAmberH, rfrRedH, crAmberH, crRedH, sentAmberH, sentRedH} in hours. */
export const GET=managerRoute(()=>repJson(agingSettings()));

/** PUT /api/rep/settings/aging: all six, whole hours from 1 to 2160, amber before red for each status. */
export const PUT=managerWrite((_repId,body)=>updateAgingSettings(body));
