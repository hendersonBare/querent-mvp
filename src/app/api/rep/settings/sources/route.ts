import {ensureHeartbeat} from '@/server/heartbeat';
import {managerRoute,repJson} from '@/server/rep/http';
import {dataSources} from '@/server/rep/settings';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/settings/sources: the demo database's organization-wide counts and the last sync events.
 * No page uses it since Data sources left the UI (plan U8); the manager only (403 for a rep, OA-69).
 */
export const GET=managerRoute(()=>{
  ensureHeartbeat();
  return repJson(dataSources());
});
