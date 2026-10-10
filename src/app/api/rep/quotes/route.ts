import {ATTENTION_PARAM,SORT_PARAM,STATUS_PARAM,isAttention} from '@/components/rep/quotes/labels';
import {SCOPE_PARAM} from '@/components/rep/scope';
import {repJson,repRoute} from '@/server/rep/http';
import {parseAttentionSort,parseStatus,repQuoteList} from '@/server/rep/quotes';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/quotes?customer=<id>&status=<status>: the signed-in rep's Quotes list (spec §4),
 * newest request first, with per-status counts. ?attention=1 is the Needs attention view (v3 spec
 * §3, §5), red then amber then quoted total, or oldest first with &sort=oldest. Every row carries
 * its aging. The Quotes page polls it. Rep-only.
 */
export const GET=repRoute(async(repId,request)=>{
  const params=request.nextUrl.searchParams;
  return repJson(await repQuoteList(repId,{customerId:params.get(SCOPE_PARAM),status:parseStatus(params.get(STATUS_PARAM)),
    attention:isAttention(params.get(ATTENTION_PARAM)),sort:parseAttentionSort(params.get(SORT_PARAM))}));
});
