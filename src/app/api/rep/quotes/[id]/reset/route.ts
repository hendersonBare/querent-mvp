import {repError,repJson,repRoute} from '@/server/rep/http';
import {resetRepSampleQuote} from '@/server/rep/quote-actions';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * POST /api/rep/quotes/<id or number>/reset: the ⋯ menu's Reset sample quote (spec §2, §4; task
 * 3.5). Rebuilds the sample quote Q-24817 exactly as seeded and answers its fresh detail. Any
 * other quote answers 409 (only sample data can be reset); another rep's quote answers 404.
 */
export const POST=repRoute<{params:Promise<{id:string}>}>(async(repId,_request,{params})=>{
  const {id}=await params;
  try{return repJson(await resetRepSampleQuote(repId,id));}catch(error){return repError(error);}
});
