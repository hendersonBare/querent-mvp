import {NextRequest,NextResponse} from 'next/server';
import {repAccess} from '@/server/rep/access';
import {repBadges} from '@/server/rep/badges';
import {principal} from '@/server/session';
export const runtime='nodejs';export const dynamic='force-dynamic';

const NO_STORE={'Cache-Control':'no-store'};

/** GET /api/rep/badges: the signed-in rep's nav badge counts ({quotes}). The rep portal shell polls it. */
export function GET(request:NextRequest){
  // repRoute's checks (an inactive rep is 403 too, task D1).
  const access=repAccess(principal(request));
  if(!access.ok)return NextResponse.json({detail:access.detail},{status:access.status,headers:NO_STORE});
  return NextResponse.json(repBadges(access.repId),{headers:NO_STORE});
}
