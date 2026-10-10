import {NextResponse,type NextRequest} from 'next/server';
import {customerSession} from '@/server/customer/http';
import {declineCustomerQuote,parseIdempotencyKey} from '@/server/customer-response/service';
import {QuoteActionError} from '@/server/quotes';
export const runtime='nodejs';export const dynamic='force-dynamic';

const noStore={'cache-control':'private, no-store'};

/**
 * POST /api/query/customer/quotes/<id or number>/decline (v3 spec §2.1, §5; task A1): the preview
 * modal's Decline, from its reasons dialog. Body: {revision?, reason?, note?} and nothing else; with
 * no reason the decline is still recorded, and the note counts only with reason 'other'. The
 * customer comes from the session. Send an Idempotency-Key header: a repeat answers the same decline
 * (replayed: true). 200 {quote, replayed} with the customer-safe preview, which never echoes the
 * reason or the note (rep-only); 404 for another customer's or an unknown quote; 400 for a bad body,
 * reason or an overlong note; 409 when the quote is expired, already answered or not the latest revision.
 */
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {session,refusal}=customerSession(request);
  if(refusal)return refusal;
  const idempotencyKey=parseIdempotencyKey(request.headers.get('idempotency-key'));
  if(idempotencyKey===undefined)return NextResponse.json({detail:'Idempotency-Key must be 1 to 128 letters, digits, "-", "_", ":" or ".".',code:'invalid_input'},{status:400,headers:noStore});
  const body=await request.json().catch(()=>undefined);
  try{
    return NextResponse.json(declineCustomerQuote(session,(await params).id,body,{idempotencyKey}),{headers:noStore});
  }catch(error){
    if(error instanceof QuoteActionError)return NextResponse.json({detail:error.message,code:error.code},{status:error.httpStatus,headers:noStore});
    throw error;
  }
}
