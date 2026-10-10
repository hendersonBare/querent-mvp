import {TRANSCRIPT_PAGE} from '@/server/repository';
import {repJson,repRoute} from '@/server/rep/http';
import {repQuoteMessages} from '@/server/rep/quote-chat';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/quotes/<id or number>/messages?before=<message id>&limit=<1-50> (B1; spec §5, §9):
 * {total, messages:[{id,role,kind,content,created_at}], next_before}, the newest page first, oldest
 * first within it; next_before is the cursor for the older page (null when there is none). Never a
 * message payload. Rep-only; another rep's quote answers 404, like an unknown one. A manager reads
 * any quote's chat after D2 (manager scope); until then only the owning rep.
 */
export const GET=repRoute<{params:Promise<{id:string}>}>(async(repId,request,{params})=>{
  const {id}=await params;
  const query=request.nextUrl.searchParams;
  const limitText=query.get('limit');
  const limit=limitText===null?TRANSCRIPT_PAGE:Number(limitText);
  if(!/^\d+$/.test(limitText??'50')||limit<1||limit>TRANSCRIPT_PAGE)return repJson({detail:`limit must be a whole number from 1 to ${TRANSCRIPT_PAGE}.`},400);
  const transcript=repQuoteMessages(repId,id,{before:query.get('before')||null,limit});
  return transcript?repJson(transcript):repJson({detail:`No quote ${id}.`},404);
});
