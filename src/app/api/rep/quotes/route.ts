import {SCOPE_PARAM} from '@/components/rep/scope';
import {repJson,repRoute} from '@/server/rep/http';
import {parseStatus,repQuoteList} from '@/server/rep/quotes';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/quotes?customer=<id>&status=<status>: the signed-in rep's Quotes list (spec §4),
 * newest request first, with per-status counts. The Quotes page polls it. Rep-only.
 */
export const GET=repRoute(async(repId,request)=>{
  const params=request.nextUrl.searchParams;
  return repJson(await repQuoteList(repId,{customerId:params.get(SCOPE_PARAM),status:parseStatus(params.get('status'))}));
});
