import {repJson,repRoute} from '@/server/rep/http';
import {openRepQuote} from '@/server/rep/quotes';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * POST /api/rep/quotes/<id or number>/read: the rep opened the quote, so its unread flag (and the
 * Quotes badge) clears. The quote page calls it once it is on screen, never on a link prefetch.
 * Another rep's quote answers 404, like an unknown one.
 */
export const POST=repRoute<{params:Promise<{id:string}>}>(async(repId,_request,{params})=>{
  const {id}=await params;
  const opened=openRepQuote(repId,id);
  return opened?repJson({...opened,unread:false}):repJson({detail:`No quote ${id}.`},404);
});
