import {managerRoute,repJson} from '@/server/rep/http';
import {TeamQueryError,teamMetrics} from '@/server/team/service';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/team/metrics?from=&to=&reps=a,b&team=<label> (v3 spec §5, §7; decisions 23–25; task
 * D3): the Team dashboard's leaderboard, one row per selected rep plus the totals, the decline
 * reasons with the Other notes, and the untouched reasons. `from`/`to` are ISO instants the browser
 * computed at its local midnights (OA-19); the cohort is the quotes created in [from, to). Manager
 * only: reps and the customer get 403, no session 401. A bad window, rep or team is 400. Never cached.
 */
export const GET=managerRoute(async(_repId,request)=>{
  try{return repJson(await teamMetrics(request.nextUrl.searchParams));}
  catch(error){if(error instanceof TeamQueryError)return repJson({detail:error.message},400);throw error;}
});
