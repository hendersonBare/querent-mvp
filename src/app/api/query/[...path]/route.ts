import {NextRequest,NextResponse} from 'next/server';
import type {Category} from '@/lib/contracts';
import {ask} from '@/server/pipeline';
import {aggregateAccess,analytics,browse,customerIds,customers,events,isCategory,reps,setAccess} from '@/server/repository';
import {ensureHeartbeat} from '@/server/heartbeat';
import {principal} from '@/server/session';
export const runtime='nodejs';export const dynamic='force-dynamic';

function fail(detail:string,status=400){return NextResponse.json({detail},{status});}
function scope(value:string){return value==='all'?null:customerIds().includes(value)?value:undefined;}
async function handle(request:NextRequest,segments:string[]){ensureHeartbeat();const user=principal(request);if(!user)return fail('Choose a demo workspace.',401);const path=segments.join('/');
  if(request.method==='GET'&&path==='me')return NextResponse.json(user);
  if(request.method==='GET'&&path==='erp/status')return NextResponse.json(events(user.role==='supplier_admin'));
  if(user.role==='customer_user'&&user.customer_id){
    if(request.method==='GET'&&path==='customer/panel')return NextResponse.json(aggregateAccess([user.customer_id]).filter(x=>x.enabled));
    if(request.method==='GET'&&segments[0]==='customer'&&segments[1]==='history'&&segments[2]){const {history}=await import('@/server/repository');return NextResponse.json(history(user.customer_id,segments[2]));}
    if(request.method==='POST'&&path==='customer/chat'){const body=await request.json().catch(()=>({}));if(typeof body.question!=='string'||!body.question.trim()||body.question.length>4000||typeof body.conversation_id!=='string')return fail('Enter a valid question.',422);return NextResponse.json(await ask(user.customer_id,body.conversation_id,body.question.trim()));}
  }
  if(user.role!=='supplier_admin')return fail('Supplier access required.',403);
  if(request.method==='GET'&&path==='supplier/customers')return NextResponse.json(customers());
  if(request.method==='GET'&&path==='supplier/reps')return NextResponse.json(reps());
  if(segments[0]==='supplier'&&segments[1]==='dashboard'&&segments[2]&&request.method==='GET'){const selected=scope(segments[2]);if(selected===undefined)return fail('Customer not found.',404);const ids=selected?[selected]:customerIds();return NextResponse.json({access:aggregateAccess(ids),analytics:analytics(selected)});}
  if(segments[0]==='supplier'&&segments[1]==='access'&&segments[2]&&segments[3]&&request.method==='PUT'){const selected=scope(segments[2]);if(selected===undefined||!isCategory(segments[3]))return fail('Invalid setting.');const body=await request.json().catch(()=>({}));if(typeof body.enabled!=='boolean')return fail('Invalid setting.');setAccess(selected,segments[3],body.enabled);return NextResponse.json({ok:true});}
  if(segments[0]==='supplier'&&segments[1]==='data'&&segments[2]&&segments[3]&&request.method==='GET'){const selected=scope(segments[2]);if(selected===undefined||!isCategory(segments[3]))return fail('Invalid data request.');const page=Math.max(1,Number(request.nextUrl.searchParams.get('page')||1));const size=Math.min(100,Math.max(1,Number(request.nextUrl.searchParams.get('size')||10)));return NextResponse.json(browse(selected,segments[3] as Category,page,size));}
  return fail('Not found.',404);
}
export async function GET(request:NextRequest,ctx:{params:Promise<{path:string[]}>}){return handle(request,(await ctx.params).path);}
export async function POST(request:NextRequest,ctx:{params:Promise<{path:string[]}>}){return handle(request,(await ctx.params).path);}
export async function PUT(request:NextRequest,ctx:{params:Promise<{path:string[]}>}){return handle(request,(await ctx.params).path);}
