import {ATTENTION_PARAM,SORT_PARAM,STATUS_PARAM,isAttention} from '@/components/rep/quotes/labels';
import {REPS_PARAM,REP_PARAM,SCOPE_PARAM,TEAM_PARAM,isAllReps} from '@/components/rep/scope';
import {repJson,repRoute} from '@/server/rep/http';
import {parseAttentionSort,parseStatus,repQuoteList} from '@/server/rep/quotes';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/quotes?customer=<id>&status=<status>: the signed-in rep's Quotes list (spec §4),
 * newest request first, with per-status counts. ?attention=1 is the Needs attention view (v3 spec
 * §3, §5), red then amber then quoted total, or oldest first with &sort=oldest. Every row carries
 * its aging and its rep. The Quotes page polls it. Rep-only.
 *
 * ?scope=all&rep=<id>&team=<label> (v3 spec §5, task D2): the manager's All reps scope, every rep's
 * quotes filtered by rep or team label; a rep asking for it gets 403.
 */
export const GET=repRoute(async(repId,request,_context,session)=>{
  const params=request.nextUrl.searchParams;
  const allReps=isAllReps(params.get(REPS_PARAM));
  if(allReps&&!session.manager)return repJson({detail:'Manager access required.'},403);
  return repJson(await repQuoteList(repId,{customerId:params.get(SCOPE_PARAM),status:parseStatus(params.get(STATUS_PARAM)),
    attention:isAttention(params.get(ATTENTION_PARAM)),sort:parseAttentionSort(params.get(SORT_PARAM)),
    manager:session.manager,allReps:allReps?{rep:params.get(REP_PARAM),team:params.get(TEAM_PARAM)}:null}));
});
