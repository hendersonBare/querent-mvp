import {NextRequest,NextResponse} from 'next/server';
import {repAccess} from '@/server/rep/access';
import {repBadges} from '@/server/rep/badges';
import {principal} from '@/server/session';
export const runtime='nodejs';export const dynamic='force-dynamic';

const NO_STORE={'Cache-Control':'no-store'};

/**
 * GET /api/rep/badges: the signed-in rep's nav badge counts ({quotes, attention}). The rep portal
 * shell polls it. Scope is role based (task U1): attention counts the rep's own red quotes, or every
 * rep's for the manager. No query parameter changes it (the old ?scope=all is ignored).
 */
export function GET(request:NextRequest){
  // repRoute's checks (an inactive rep is 403 too, task D1).
  const access=repAccess(principal(request));
  if(!access.ok)return NextResponse.json({detail:access.detail},{status:access.status,headers:NO_STORE});
  return NextResponse.json(repBadges(access.repId,{manager:access.manager}),{headers:NO_STORE});
}
