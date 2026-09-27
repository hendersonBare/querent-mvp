import {NextRequest,NextResponse} from 'next/server';
import {events} from '@/server/repository';
import {ensureHeartbeat} from '@/server/heartbeat';
import {principal} from '@/server/session';
import {customerRoute} from './customer';
export const runtime='nodejs';export const dynamic='force-dynamic';

// Customer endpoints live in ./customer.ts (customer-safe repository only); this file serves the
// shared ones (me, erp/status). The rep portal's data is served by the rep-only routes under
// /api/rep (quotes, analytics, settings); the old supplier dashboard endpoints are gone.

function fail(detail:string,status=400){return NextResponse.json({detail},{status});}
async function handle(request:NextRequest,segments:string[]){ensureHeartbeat();const user=principal(request);if(!user)return fail('Choose a demo workspace.',401);const path=segments.join('/');
  if(request.method==='GET'&&path==='me')return NextResponse.json(user);
  if(request.method==='GET'&&path==='erp/status')return NextResponse.json(events(user.role==='supplier_admin'));
  if(user.role==='customer_user'&&user.customer_id){const answered=await customerRoute(request,{...user,customer_id:user.customer_id},segments);if(answered)return answered;}
  if(user.role!=='supplier_admin')return fail('Supplier access required.',403);
  return fail('Not found.',404);
}
export async function GET(request:NextRequest,ctx:{params:Promise<{path:string[]}>}){return handle(request,(await ctx.params).path);}
export async function POST(request:NextRequest,ctx:{params:Promise<{path:string[]}>}){return handle(request,(await ctx.params).path);}
export async function PUT(request:NextRequest,ctx:{params:Promise<{path:string[]}>}){return handle(request,(await ctx.params).path);}
