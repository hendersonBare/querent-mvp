import {repJson,repRoute} from '@/server/rep/http';
import {repQuoteDetail} from '@/server/rep/quote-detail';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/quotes/<id or number>: the quote detail (spec §4, task 3.3) with every line's
 * pricing facts, floors, freight and the send check. Rep-only: it carries cost and margin.
 * Another rep's quote answers 404, like an unknown one, except to the manager, who reads any quote
 * read-only (`read_only`, task D2). The owner's open touches the quote (last_rep_touch_at, v3 spec
 * §3) and reprices its draft; the manager's read-only open does neither.
 */
export const GET=repRoute<{params:Promise<{id:string}>}>(async(repId,_request,{params},session)=>{
  const {id}=await params;
  const detail=await repQuoteDetail(repId,id,{touch:true,manager:session.manager});
  return detail?repJson(detail):repJson({detail:`No quote ${id}.`},404);
});
