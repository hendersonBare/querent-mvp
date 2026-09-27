import {ensureHeartbeat} from '@/server/heartbeat';
import {repJson,repRoute} from '@/server/rep/http';
import {dataSources} from '@/server/rep/settings';
export const runtime='nodejs';export const dynamic='force-dynamic';

/** GET /api/rep/settings/sources: Settings > Data sources (the demo database, the last sync events). The tab polls it. */
export const GET=repRoute(()=>{
  ensureHeartbeat();
  return repJson(dataSources());
});
