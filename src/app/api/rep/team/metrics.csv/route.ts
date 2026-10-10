import {csvFileResponse} from '@/server/export/http';
import {managerRoute,repJson} from '@/server/rep/http';
import {TEAM_CSV_FILENAME} from '@/server/team/csv';
import {TeamQueryError,teamMetricsCsvFor} from '@/server/team/service';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/team/metrics.csv?from=&to=&reps=&team= (v3 spec §5; decision 23; task D3): Export CSV
 * on the Team dashboard, the same rows as GET /api/rep/team/metrics through src/server/export/csv.ts,
 * one line per rep plus the totals. Manager only (it carries margin); a bad query is 400.
 */
export const GET=managerRoute(async(_repId,request)=>{
  try{return csvFileResponse(await teamMetricsCsvFor(request.nextUrl.searchParams),TEAM_CSV_FILENAME);}
  catch(error){if(error instanceof TeamQueryError)return repJson({detail:error.message},400);throw error;}
});
