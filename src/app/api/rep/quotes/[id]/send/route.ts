import {jsonBody,repError,repJson,repRoute} from '@/server/rep/http';
import {parseIdempotencyKey} from '@/server/rep/idempotency';
import {sendRepQuote} from '@/server/rep/quote-send';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * POST /api/rep/quotes/<id or number>/send: Approve & send's Confirm send (spec §4, §5.4; task
 * 3.7). Body: {message, attach_pdf, revision, total}, the last two as Confirm send showed them.
 * Sends the rep's quote to the customer's Querent chat and answers 200 {detail, sent, replayed}.
 * Send an Idempotency-Key header: a repeat answers the same send (replayed: true) instead of
 * sending again. 404 for another rep's quote; 400 for a bad body or key; 409 when it can't be
 * sent or changed since Confirm send; 422 with `blockers` when it is unfinished.
 */
export const POST=repRoute<{params:Promise<{id:string}>}>(async(repId,request,{params})=>{
  const {id}=await params;
  const idempotencyKey=parseIdempotencyKey(request.headers.get('idempotency-key'));
  if(idempotencyKey===undefined)return repJson({detail:'Idempotency-Key must be 1 to 128 letters, digits, "-", "_", ":" or ".".',code:'invalid_input'},400);
  try{
    const {value,replayed}=await sendRepQuote(repId,id,await jsonBody(request),{idempotencyKey});
    return repJson({...value,replayed});
  }catch(error){return repError(error);}
});
