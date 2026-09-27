import 'server-only';
import {NextResponse,type NextRequest} from 'next/server';
import {principal} from '@/server/session';

/** The signed-in customer contact, from the session only (never from the request). */
export interface CustomerSession {customerId:string;contactId:string|null}

/**
 * The signed-in customer, or the refusal to answer with: the same errors as the /api/query
 * catch-all, 401 without a session (the app then returns to the workspace picker) and 403 for the
 * supplier.
 */
export function customerSession(request:NextRequest):{session:CustomerSession;refusal?:undefined}|{session?:undefined;refusal:NextResponse}{
  const user=principal(request);
  if(!user)return {refusal:NextResponse.json({detail:'Choose a demo workspace.'},{status:401})};
  if(user.role!=='customer_user'||!user.customer_id)return {refusal:NextResponse.json({detail:'Customer access required.'},{status:403})};
  return {session:{customerId:user.customer_id,contactId:user.contact_id}};
}

/**
 * A GET handler for the signed-in customer only (see customerSession for the errors). `load` gets
 * the customer's id, never one from the request, and the request for its query string.
 */
export function customerGet<T>(load:(customerId:string,request:NextRequest)=>T){
  return async function GET(request:NextRequest){
    const {session,refusal}=customerSession(request);
    if(refusal)return refusal;
    return NextResponse.json(load(session.customerId,request));
  };
}
