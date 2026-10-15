import {csvFileResponse} from '@/server/export/http';
import {AnalyticsQueryError,LEADERBOARD_CSV_FILENAME,analyticsCsv} from '@/server/analytics/service';
import {managerRoute,repJson} from '@/server/rep/http';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/analytics/csv?<the same filter as /api/rep/analytics>: Export CSV on the Rep leaderboard
 * (C_AN6; decision 23; plan U6), the leaderboard rows as filtered and broken down, then the totals,
 * through src/server/export/csv.ts. Manager only (the leaderboard tab is hers, and it carries margin):
 * reps and the customer get 403, no session 401. A bad filter is 400.
 */
export const GET=managerRoute(async(repId,request)=>{
  try{return csvFileResponse(await analyticsCsv({repId,manager:true},request.nextUrl.searchParams),LEADERBOARD_CSV_FILENAME);}
  catch(error){if(error instanceof AnalyticsQueryError)return repJson({detail:error.message},400);throw error;}
});
