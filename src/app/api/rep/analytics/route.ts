import {AnalyticsQueryError,analyticsPage} from '@/server/analytics/service';
import {repJson,repRoute} from '@/server/rep/http';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/analytics?customer=&reps=a,b&teams=X,Y&breakdown=org|rep|team|customer&from=&to= (or
 * &period=7|30|90): the Analytics page (spec §4; plan U6; Appendix D). The Overview's stat cards and
 * trends, the customer questions, and the old Team metrics (the leaderboard, decline reasons and
 * untouched quotes) grouped by the breakdown over the quotes created in the window. A rep's own data
 * only, whatever they ask for (their reps, teams and breakdown are ignored, another rep's customer reads
 * as none); the whole organization for the manager (task U1). Rep-only: it carries margin and GP, so it
 * answers 401 without a session and 403 to a customer. A bad filter is 400. Never cached.
 */
export const GET=repRoute(async(repId,request,_context,{manager})=>{
  try{return repJson(await analyticsPage({repId,manager},request.nextUrl.searchParams));}
  catch(error){if(error instanceof AnalyticsQueryError)return repJson({detail:error.message},400);throw error;}
});
