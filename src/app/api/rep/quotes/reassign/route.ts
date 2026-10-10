import {jsonBody,managerRoute,repError,repJson} from '@/server/rep/http';
import {parseIdempotencyKey} from '@/server/rep/idempotency';
import {reassignRepQuotes} from '@/server/rep/reassign';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * POST /api/rep/quotes/reassign {quoteIds:string[], toRepId} (v3 spec §5, §8; decision 21; task
 * D2): moves 1 to 200 quotes (ids or numbers, open or closed) to an active rep, each with a
 * quote_activity row; quotes the rep already owns are skipped. Answers {to, moved, skipped,
 * replayed}. The manager only (managerRoute: a rep 403). A repeated Idempotency-Key gets the first
 * answer back; a malformed one is 400. A bad request or target is 400, an unknown quote 404, and
 * then nothing moves.
 */
export const POST=managerRoute(async(repId,request)=>{
  const idempotencyKey=parseIdempotencyKey(request.headers.get('idempotency-key'));
  if(idempotencyKey===undefined)return repJson({detail:'Idempotency-Key must be 1 to 128 letters, digits, "-", "_", ":" or ".".',code:'invalid_input'},400);
  try{
    const {value,replayed}=reassignRepQuotes(repId,await jsonBody(request),{idempotencyKey});
    return repJson({...value,replayed});
  }catch(error){return repError(error);}
});
