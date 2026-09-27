import {repError,repJson,repRoute} from '@/server/rep/http';
import {parseIdempotencyKey} from '@/server/rep/idempotency';
import {duplicateRepQuote} from '@/server/rep/quote-actions';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * POST /api/rep/quotes/<id or number>/duplicate: the ⋯ menu's Duplicate quote (spec §4, §5.4;
 * task 3.5). Copies the rep's quote, in any status, as a new ready_for_review draft and answers
 * 201 {id, quote_number, duplicated_from, replayed}. Send an Idempotency-Key header: a repeat
 * answers the same copy (replayed: true) instead of making another. 404 for another rep's quote,
 * 409 if the customer is now another rep's, 400 for a malformed key.
 */
export const POST=repRoute<{params:Promise<{id:string}>}>(async(repId,request,{params})=>{
  const {id}=await params;
  const idempotencyKey=parseIdempotencyKey(request.headers.get('idempotency-key'));
  if(idempotencyKey===undefined)return repJson({detail:'Idempotency-Key must be 1 to 128 letters, digits, "-", "_", ":" or ".".',code:'invalid_input'},400);
  try{
    const {value,replayed}=duplicateRepQuote(repId,id,{idempotencyKey});
    return repJson({...value,replayed},201);
  }catch(error){return repError(error);}
});
