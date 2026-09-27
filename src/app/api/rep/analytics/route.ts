import {scopeFrom} from '@/components/rep/scope';
import {repAnalytics} from '@/server/analytics/service';
import {repJson,repRoute} from '@/server/rep/http';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/analytics?customer=<id>: the Analytics page (spec §4) for the signed-in rep's
 * customers, narrowed by the "Viewing" picker (see repAnalytics). Rep-only: it carries margin and
 * GP, so it answers 401 without a session and 403 to a customer, like /api/rep/badges.
 */
export const GET=repRoute((repId,request)=>repJson(repAnalytics(repId,{customerId:scopeFrom(request.nextUrl.searchParams)})));
