import {repJson,repRoute} from '@/server/rep/http';
import {repQuoteDetail} from '@/server/rep/quote-detail';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/quotes/<id or number>: the quote detail (spec §4, task 3.3) with every line's
 * pricing facts, floors, freight and the send check. Rep-only: it carries cost and margin.
 * Another rep's quote answers 404, like an unknown one.
 */
export const GET=repRoute<{params:Promise<{id:string}>}>(async(repId,_request,{params})=>{
  const {id}=await params;
  const detail=await repQuoteDetail(repId,id);
  return detail?repJson(detail):repJson({detail:`No quote ${id}.`},404);
});
