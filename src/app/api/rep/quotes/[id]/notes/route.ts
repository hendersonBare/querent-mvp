import {jsonBody,repError,repJson,repRoute} from '@/server/rep/http';
import {addRepQuoteNote} from '@/server/rep/quote-panel-edits';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * POST /api/rep/quotes/<id or number>/notes {body}: adds an internal note (team only, task 3.4).
 * Answers the fresh detail with 201. Refuses a quote that isn't editable (409), an empty note
 * (400), and another rep's quote (404). Notes never reach the customer's routes or PDF.
 */
export const POST=repRoute<{params:Promise<{id:string}>}>(async(repId,request,{params})=>{
  const {id}=await params;
  try{return repJson(await addRepQuoteNote(repId,id,await jsonBody(request)),201);}catch(error){return repError(error);}
});
