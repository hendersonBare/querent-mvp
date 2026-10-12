import {CUSTOMER_PARAM} from '@/components/rep/scope';
import {ensureHeartbeat} from '@/server/heartbeat';
import {repJson,repRoute} from '@/server/rep/http';
import {repSettings} from '@/server/rep/settings';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/settings: everything Settings shows for the signed-in rep (spec §4, task 6.1; plan U8). The
 * manager gets her four tabs (Customer access, Margin floors, Pricing and delivery, Aging) and the feature
 * flags; ?customer=<id> opens Customer access searched for that customer. A rep gets only their own margin
 * floors (Appendix B; OA-69). The writes are the PUT routes beside this one.
 */
export const GET=repRoute((repId,request,_context,{manager})=>{
  ensureHeartbeat();
  return repJson(repSettings(repId,{customerId:manager?request.nextUrl.searchParams.get(CUSTOMER_PARAM):null,manager}));
});
