import {jsonBody,repError,repJson,repRoute} from '@/server/rep/http';
import {repQuoteUpsells,takeRepQuoteUpsell} from '@/server/rep/quote-upsells';
export const runtime='nodejs';export const dynamic='force-dynamic';

type Context={params:Promise<{id:string}>};

/**
 * GET /api/rep/quotes/<id or number>/upsells: "Suggested by Querent" (task 3.6), the quote's
 * upsell chips with Claude's wording in live mode (the template in scripted mode). Rep-only:
 * chips carry unit cost and GP. No chips on a quote that can't be edited; another rep's quote
 * answers 404.
 */
export const GET=repRoute<Context>(async(repId,_request,{params})=>{
  const {id}=await params;
  const upsells=await repQuoteUpsells(repId,id);
  return upsells?repJson(upsells):repJson({detail:`No quote ${id}.`},404);
});

/**
 * POST /api/rep/quotes/<id or number>/upsells {upsellId}: takes one chip, through the line
 * edits (task 3.3): adds its line or bumps a qty, and answers {detail, upsell_id, line_id}.
 * Refuses a quote that can't be edited or a chip that no longer applies (409), bad input (400),
 * and another rep's quote (404).
 */
export const POST=repRoute<Context>(async(repId,request,{params})=>{
  const {id}=await params;
  try{return repJson(await takeRepQuoteUpsell(repId,id,await jsonBody(request)));}catch(error){return repError(error);}
});
