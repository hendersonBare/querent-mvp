import {jsonBody,repError,repJson,repRoute} from '@/server/rep/http';
import {clearRepQuoteFreight,overrideRepQuoteFreight} from '@/server/rep/quote-panel-edits';
export const runtime='nodejs';export const dynamic='force-dynamic';

type Context={params:Promise<{id:string}>};

/**
 * PUT /api/rep/quotes/<id or number>/freight {amount, reason}: the rep sets freight by hand, with
 * a required reason, logged in Activity (spec §5.3, task 3.4). Answers the fresh detail. Refuses
 * a quote that isn't editable (409), bad input or a blank reason (400), and another rep's quote (404).
 */
export const PUT=repRoute<Context>(async(repId,request,{params})=>{
  const {id}=await params;
  try{return repJson(await overrideRepQuoteFreight(repId,id,await jsonBody(request)));}catch(error){return repError(error);}
});

/** DELETE /api/rep/quotes/<id or number>/freight: back to distance-based freight (logged). Same refusals as PUT. */
export const DELETE=repRoute<Context>(async(repId,_request,{params})=>{
  const {id}=await params;
  try{return repJson(await clearRepQuoteFreight(repId,id));}catch(error){return repError(error);}
});
