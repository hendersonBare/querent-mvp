import {SCOPE_PARAM} from '@/components/rep/scope';
import {ensureHeartbeat} from '@/server/heartbeat';
import {repJson,repRoute} from '@/server/rep/http';
import {repSettings} from '@/server/rep/settings';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/settings?customer=<id>: everything Settings shows for the signed-in rep (spec §4,
 * task 6.1), with Customer access for the "Viewing" picker. Rep-only; `manager` (the Reps and Aging
 * cards) only for the manager (task D1). The writes are the PUT routes beside this one.
 */
export const GET=repRoute((repId,request,_context,{manager})=>{
  ensureHeartbeat();
  return repJson(repSettings(repId,{customerId:request.nextUrl.searchParams.get(SCOPE_PARAM),manager}));
});
