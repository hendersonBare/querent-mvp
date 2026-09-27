import {NextResponse,type NextRequest} from 'next/server';
import {customerSession} from '@/server/customer/http';
import {parseIdempotencyKey,requestCustomerChanges} from '@/server/customer-response/service';
import {QuoteActionError} from '@/server/quotes';
export const runtime='nodejs';export const dynamic='force-dynamic';

const noStore={'cache-control':'private, no-store'};

/**
 * POST /api/query/customer/quotes/<id or number>/request-changes (spec §3, task 5.2): the preview
 * modal's Request changes, after its Confirm dialog. Body: {revision, note} and nothing else. The
 * customer comes from the session. Send an Idempotency-Key header: a repeat answers the same request
 * (replayed: true). 200 {quote, replayed} with the customer-safe preview; 404 for another customer's
 * or an unknown quote; 400 for a bad body or a missing note; 409 when the quote is expired, already
 * answered or not the latest revision.
 */
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {session,refusal}=customerSession(request);
  if(refusal)return refusal;
  const idempotencyKey=parseIdempotencyKey(request.headers.get('idempotency-key'));
  if(idempotencyKey===undefined)return NextResponse.json({detail:'Idempotency-Key must be 1 to 128 letters, digits, "-", "_", ":" or ".".',code:'invalid_input'},{status:400,headers:noStore});
  const body=await request.json().catch(()=>undefined);
  try{
    return NextResponse.json(requestCustomerChanges(session,(await params).id,body,{idempotencyKey}),{headers:noStore});
  }catch(error){
    if(error instanceof QuoteActionError)return NextResponse.json({detail:error.message,code:error.code},{status:error.httpStatus,headers:noStore});
    throw error;
  }
}
