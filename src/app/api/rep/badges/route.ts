import {NextRequest,NextResponse} from 'next/server';
import {REPS_PARAM,isAllReps} from '@/components/rep/scope';
import {repAccess} from '@/server/rep/access';
import {repBadges} from '@/server/rep/badges';
import {principal} from '@/server/session';
export const runtime='nodejs';export const dynamic='force-dynamic';

const NO_STORE={'Cache-Control':'no-store'};

/**
 * GET /api/rep/badges: the signed-in rep's nav badge counts ({quotes, attention}). The rep portal
 * shell polls it. ?scope=all (the manager's All reps scope, task D2): attention counts every rep's
 * red quotes; a rep asking for it gets 403.
 */
export function GET(request:NextRequest){
  // repRoute's checks (an inactive rep is 403 too, task D1).
  const access=repAccess(principal(request));
  if(!access.ok)return NextResponse.json({detail:access.detail},{status:access.status,headers:NO_STORE});
  const allReps=isAllReps(request.nextUrl.searchParams.get(REPS_PARAM));
  if(allReps&&!access.manager)return NextResponse.json({detail:'Manager access required.'},{status:403,headers:NO_STORE});
  return NextResponse.json(repBadges(access.repId,{allReps}),{headers:NO_STORE});
}
