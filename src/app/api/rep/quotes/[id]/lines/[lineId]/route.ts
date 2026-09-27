import {jsonBody,repError,repJson,repRoute} from '@/server/rep/http';
import {editRepQuoteLine,removeRepQuoteLine} from '@/server/rep/quote-edits';
export const runtime='nodejs';export const dynamic='force-dynamic';

type Context={params:Promise<{id:string;lineId:string}>};

/**
 * PATCH /api/rep/quotes/<id or number>/lines/<lineId> {qty?, basis?, unitPrice?}: the rep's edit
 * to one line, autosaved from the quote detail (task 3.3). Answers the fresh detail. Refuses a
 * quote whose status doesn't allow edits (409: sent, accepted, expired), bad input (400), and
 * another rep's quote or an unknown line (404).
 */
export const PATCH=repRoute<Context>(async(repId,request,{params})=>{
  const {id,lineId}=await params;
  try{return repJson(await editRepQuoteLine(repId,id,lineId,await jsonBody(request)));}catch(error){return repError(error);}
});

/** DELETE /api/rep/quotes/<id or number>/lines/<lineId>: removes the line. Answers the fresh detail; same refusals as PATCH. */
export const DELETE=repRoute<Context>(async(repId,_request,{params})=>{
  const {id,lineId}=await params;
  try{return repJson(await removeRepQuoteLine(repId,id,lineId));}catch(error){return repError(error);}
});
