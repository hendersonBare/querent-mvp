import {customerFilter} from '@/components/rep/scope';
import {repAnalytics} from '@/server/analytics/service';
import {repJson,repRoute} from '@/server/rep/http';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/analytics?customer=<id>: the Analytics page (spec §4): a rep's own customers, or the
 * whole organization for the manager (task U1), narrowed by the page's own customer filter (see
 * repAnalytics). Rep-only: it carries margin and GP, so it answers 401 without a session and 403 to
 * a customer, like /api/rep/badges.
 */
export const GET=repRoute((repId,request,_context,{manager})=>repJson(repAnalytics(repId,{manager,customerId:customerFilter(request.nextUrl.searchParams)})));
