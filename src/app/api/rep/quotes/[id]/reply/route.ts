import {jsonBody,repError,repJson,repRoute} from '@/server/rep/http';
import {replyToChangeRequest} from '@/server/rep/quote-reply';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * POST /api/rep/quotes/<id or number>/reply {body} (plan U3; C_QOB6 "Send reply"): the owning rep's
 * reply to the customer's change request note, posted into the customer's Querent conversation and recorded on the quote's Activity (decision 63).
 * 201 with the Activity row; 400 for an empty or overlong reply; 409 for a quote with no change
 * request; 404 for another rep's quote or an unknown one.
 */
export const POST=repRoute<{params:Promise<{id:string}>}>(async(repId,request,{params})=>{
  const {id}=await params;
  try{return repJson(replyToChangeRequest(repId,id,await jsonBody(request)),201);}catch(error){return repError(error);}
});
