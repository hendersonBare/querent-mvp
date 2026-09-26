import {NextRequest,NextResponse} from 'next/server';
import {repBadges} from '@/server/rep/badges';
import {principal} from '@/server/session';
export const runtime='nodejs';export const dynamic='force-dynamic';

const NO_STORE={'Cache-Control':'no-store'};

/** GET /api/rep/badges: the signed-in rep's nav badge counts ({quotes}). The rep portal shell polls it. */
export function GET(request:NextRequest){
  const user=principal(request);
  if(!user)return NextResponse.json({detail:'Choose a demo workspace.'},{status:401,headers:NO_STORE});
  if(user.role!=='supplier_admin'||!user.rep_id)return NextResponse.json({detail:'Supplier access required.'},{status:403,headers:NO_STORE});
  return NextResponse.json(repBadges(user.rep_id),{headers:NO_STORE});
}
