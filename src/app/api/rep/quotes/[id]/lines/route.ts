import {jsonBody,repError,repJson,repRoute} from '@/server/rep/http';
import {addRepQuoteLine} from '@/server/rep/quote-edits';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * POST /api/rep/quotes/<id or number>/lines {itemId, qty?, restore?}: adds an item to the draft,
 * priced by the engine, or puts a removed line back (Undo). Answers {detail, line_id}. Refuses a
 * quote that isn't editable (409), bad input (400), and another rep's quote (404).
 */
export const POST=repRoute<{params:Promise<{id:string}>}>(async(repId,request,{params})=>{
  const {id}=await params;
  try{return repJson(await addRepQuoteLine(repId,id,await jsonBody(request)),201);}catch(error){return repError(error);}
});
