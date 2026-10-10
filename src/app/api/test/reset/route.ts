import {NextRequest,NextResponse} from 'next/server';
import {chatMode} from '@/server/chat/mode';
import {resetDemoData} from '@/server/repository';
export const runtime='nodejs';export const dynamic='force-dynamic';

// Test-only hook: the E2E suites reset the demo database before a spec (task 0.4). It exists only
// when the server runs with QUERENT_E2E_RESET=1, which playwright.config.ts sets for the server it
// starts. Body: {seed_date?: "YYYY-MM-DD"}; without it the server's QUERENT_SEED_DATE (or yesterday) is used.
// TODO(R-6): guard /api/test/* more strictly before deployment (an env flag alone keeps them off by default, nothing more).
export async function POST(request:NextRequest){
  if(process.env.QUERENT_E2E_RESET!=='1')return NextResponse.json({detail:'Not found.'},{status:404});
  const body=await request.json().catch(()=>({}));
  const seedDate=body?.seed_date;
  if(seedDate!==undefined&&typeof seedDate!=='string')return NextResponse.json({detail:'seed_date must be a date like 2026-09-23.'},{status:400});
  let anchor:string;
  try{anchor=resetDemoData({seedDate});}
  catch(error){if(error instanceof RangeError)return NextResponse.json({detail:error.message},{status:400});throw error;}
  return NextResponse.json({ok:true,seed_date:anchor,chat_mode:chatMode()});
}
