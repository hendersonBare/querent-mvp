import {NextResponse,type NextRequest} from 'next/server';
import {customerSession} from '@/server/customer/http';
import {openCustomerQuotePreview} from '@/server/customer/quote-preview';
export const runtime='nodejs';export const dynamic='force-dynamic';

// GET /api/query/customer/quotes/:id?rev=n (task 5.1): what the customer's PDF preview modal shows
// for one of their own quotes, by id or number: the status now and the sent revision (the latest,
// or rev n). Another customer's quote, an unknown one and a revision never sent are the same 404,
// so ids can't be probed. The PDF itself is GET /api/quotes/:id/pdf?variant=customer (task 4.1).
// Opening a sent revision stamps customer_viewed_at (v3 spec §3, task A2).

const noStore={'cache-control':'private, no-store'};
const fail=(detail:string,status:number)=>NextResponse.json({detail},{status,headers:noStore});

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {session,refusal}=customerSession(request);
  if(refusal)return refusal;
  const rev=request.nextUrl.searchParams.get('rev');
  if(rev!==null&&!/^[1-9]\d{0,5}$/.test(rev))return fail('rev must be a revision number.',400);
  const preview=openCustomerQuotePreview(session.customerId,(await params).id,rev===null?undefined:Number(rev));
  return preview?NextResponse.json(preview,{headers:noStore}):fail('Quote not found.',404);
}
