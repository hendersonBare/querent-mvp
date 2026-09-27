import {NextResponse,type NextRequest} from 'next/server';
import {customerSession} from '@/server/customer/http';
import {QuoteRequestError,requestQuote} from '@/server/intake/quote-request';
export const runtime='nodejs';export const dynamic='force-dynamic';

const NO_STORE={'Cache-Control':'no-store'};

/**
 * POST /api/query/customer/quote-requests (task 2.3): the item pop-up's Request quote. Body:
 * {conversation_id, fulfillment, branch_id, lines:[{sku, qty}]} and nothing else. The customer and
 * contact come from the session. 201 with the new quote's number and status and the chat turn
 * that confirms it; 200 with the same when this pop-up already made its quote (a double click).
 * The intake prices the draft server-side and answers with customer-safe fields only.
 */
export async function POST(request:NextRequest){
  const {session,refusal}=customerSession(request);
  if(refusal)return refusal;
  const body=await request.json().catch(()=>undefined);
  try{
    const result=requestQuote(session,body);
    return NextResponse.json(result,{status:result.replayed?200:201,headers:NO_STORE});
  }catch(error){
    if(error instanceof QuoteRequestError)return NextResponse.json({detail:error.message},{status:error.status,headers:NO_STORE});
    throw error;
  }
}
