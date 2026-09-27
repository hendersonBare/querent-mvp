import {jsonBody,repError,repJson,repRoute} from '@/server/rep/http';
import {editRepQuoteFulfillment} from '@/server/rep/quote-panel-edits';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * PATCH /api/rep/quotes/<id or number>/fulfillment {fulfillment?, branchId?}: the Pickup or
 * delivery panel (task 3.4). Answers the fresh detail (freight, totals and send checks follow).
 * Refuses a quote that isn't editable (409), bad input (400), and another rep's quote (404).
 */
export const PATCH=repRoute<{params:Promise<{id:string}>}>(async(repId,request,{params})=>{
  const {id}=await params;
  try{return repJson(await editRepQuoteFulfillment(repId,id,await jsonBody(request)));}catch(error){return repError(error);}
});
