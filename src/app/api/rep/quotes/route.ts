import {AGING_PARAM,ATTENTION_PARAM,SORT_PARAM,STATUS_PARAM,isAttention} from '@/components/rep/quotes/labels';
import {CUSTOMER_PARAM,FROM_PARAM,REP_PARAM,TEAM_PARAM,TO_PARAM} from '@/components/rep/scope';
import {repJson,repRoute} from '@/server/rep/http';
import {parseAttentionSort,parseStatus,repQuoteList} from '@/server/rep/quotes';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/quotes?customer=<id>&status=<status>: the Quotes list (spec §4), newest request
 * first, with per-status counts. ?attention=1 is the Needs attention view (v3 spec §3, §5), red then
 * amber then quoted total, or oldest first with &sort=oldest. Every row carries its aging and its
 * rep. The Quotes page polls it. Rep-only.
 *
 * Scope is role based (Appendix B; decisions 20, 22; task U1): a rep's own quotes, or every rep's for
 * the manager; the old ?scope=all is ignored. ?customer= is the page's own filter (a customer the rep
 * can't read is ignored). The manager also filters by &rep=<id>&team=<label>; the Team dashboard's
 * drill-down (task D3) adds &rep=a,b, &from=&to= (created in [from, to)) and &aging=ok|amber|red.
 */
export const GET=repRoute(async(repId,request,_context,session)=>{
  const params=request.nextUrl.searchParams;
  return repJson(await repQuoteList(repId,{customerId:params.get(CUSTOMER_PARAM),status:parseStatus(params.get(STATUS_PARAM)),
    attention:isAttention(params.get(ATTENTION_PARAM)),sort:parseAttentionSort(params.get(SORT_PARAM)),
    manager:session.manager,filters:{rep:params.get(REP_PARAM),team:params.get(TEAM_PARAM),from:params.get(FROM_PARAM),to:params.get(TO_PARAM),aging:params.get(AGING_PARAM)}}));
});
