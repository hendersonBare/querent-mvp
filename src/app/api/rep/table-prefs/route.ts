import {repJson,repRoute} from '@/server/rep/http';
import {TablePrefsError,readTablePrefs,writeTablePrefs} from '@/server/rep/table-prefs';
export const runtime='nodejs';export const dynamic='force-dynamic';

/** A refused request as 400 {detail}; anything else is rethrown (a 500). */
function refused(error:unknown){
  if(error instanceof TablePrefsError)return repJson({detail:error.message},400);
  throw error;
}

/**
 * GET /api/rep/table-prefs?table=<id>: the signed-in user's column order and hidden columns for that
 * table, {table_id, prefs:{column_order, hidden_columns}|null} (plan U0). Never another user's.
 */
export const GET=repRoute((repId,request)=>{
  try{return repJson(readTablePrefs(repId,request.nextUrl.searchParams.get('table')));}
  catch(error){return refused(error);}
});

/**
 * PUT /api/rep/table-prefs {table_id, column_order, hidden_columns}: saves them for the signed-in user
 * and answers like GET. Any other field (a user_id, for one) is refused with 400.
 */
export const PUT=repRoute(async(repId,request)=>{
  const body=await request.json().catch(()=>undefined);
  try{return repJson(writeTablePrefs(repId,body));}
  catch(error){return refused(error);}
});
