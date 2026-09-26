import 'server-only';
import {NextResponse,type NextRequest} from 'next/server';
import {principal} from '@/server/session';

/**
 * A GET handler for the signed-in customer only, answering with the same errors as the
 * /api/query catch-all: 401 without a session (the app then returns to the workspace picker),
 * 403 for the supplier. `load` gets the customer's id, never one from the request.
 */
export function customerGet<T>(load:(customerId:string)=>T){
  return async function GET(request:NextRequest){
    const user=principal(request);
    if(!user)return NextResponse.json({detail:'Choose a demo workspace.'},{status:401});
    if(user.role!=='customer_user'||!user.customer_id)return NextResponse.json({detail:'Customer access required.'},{status:403});
    return NextResponse.json(load(user.customer_id));
  };
}
