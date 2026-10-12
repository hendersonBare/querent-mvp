import {managerRoute,repJson} from '@/server/rep/http';
import {accessFilter,accessTable,SettingsError,updateAccess} from '@/server/rep/settings';
import {managerWrite} from '@/server/rep/settings-http';
export const runtime='nodejs';export const dynamic='force-dynamic';

// Settings > Customer access (spec §2, §6.3; plan U8, C_S1 to C_S1b), the manager only (403 for a rep).
// The chat tools enforce what is set here on every question.

/**
 * GET /api/rep/settings/access?q=&items_stock=&pricing=&orders_quotes=&account=: the customers whose name or
 * account number contains q and whose data types are in the states given (any, answers, not_shared), with
 * one switch per type, and how many customers there are in all: {q, customers, total}.
 */
export const GET=managerRoute((_repId,request)=>{
  try{return repJson(accessTable(accessFilter(request.nextUrl.searchParams)));}
  catch(error){if(error instanceof SettingsError)return repJson({detail:error.message},error.status);throw error;}
});

/** PUT /api/rep/settings/access {customer_id, category, enabled}: one customer's switch, or with customer_id null every customer's. */
export const PUT=managerWrite((_repId,body)=>updateAccess(body));
