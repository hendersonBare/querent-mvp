import {NextRequest,NextResponse} from 'next/server';
import {scopeFrom} from '@/components/rep/scope';
import {repAnalytics} from '@/server/analytics/service';
import {principal} from '@/server/session';
export const runtime='nodejs';export const dynamic='force-dynamic';

const NO_STORE={'Cache-Control':'no-store'};

/**
 * GET /api/rep/analytics?customer=<id>: the Analytics page (spec §4) for the signed-in rep's
 * customers, narrowed by the "Viewing" picker (see repAnalytics). Rep-only: it carries margin and
 * cost-derived GP, so it answers 401 without a session and 403 to a customer, like /api/rep/badges.
 */
export function GET(request:NextRequest){
  const user=principal(request);
  if(!user)return NextResponse.json({detail:'Choose a demo workspace.'},{status:401,headers:NO_STORE});
  if(user.role!=='supplier_admin'||!user.rep_id)return NextResponse.json({detail:'Supplier access required.'},{status:403,headers:NO_STORE});
  return NextResponse.json(repAnalytics(user.rep_id,{customerId:scopeFrom(request.nextUrl.searchParams)}),{headers:NO_STORE});
}
