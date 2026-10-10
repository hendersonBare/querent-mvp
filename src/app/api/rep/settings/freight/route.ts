import {managerRoute,repJson} from '@/server/rep/http';
import {freightSettingsView,updateFreightSettings} from '@/server/rep/freight-settings';
import {managerWrite} from '@/server/rep/settings-http';
export const runtime='nodejs';export const dynamic='force-dynamic';

// Free delivery pricing's controls (v3 spec §4.3, §4.4, §4.6, §5; decisions 28–31, 35, 36; task C3):
// manager only (403 for a rep). The fuel price is fetched server-side; its key never leaves the server.

/** GET /api/rep/settings/freight: the toggle, cost inputs, rate settings, the pool panel and the fuel price with its warnings. */
export const GET=managerRoute(async()=>repJson(await freightSettingsView()));

/**
 * PUT /api/rep/settings/freight {enabled?, cost?, rates?}: any of them, checked first. Turning it on
 * needs the impact preview viewed in the last 24 hours (409 preview_required, OA-11).
 */
export const PUT=managerWrite((_repId,body)=>updateFreightSettings(body));
