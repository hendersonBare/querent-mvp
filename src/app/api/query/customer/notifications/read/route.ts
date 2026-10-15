import {NextResponse,type NextRequest} from 'next/server';
import {customerSession} from '@/server/customer/http';
import {markNotificationsRead} from '@/server/customer/notifications';
export const runtime='nodejs';export const dynamic='force-dynamic';

const MAX_IDS=100;
const noStore={'cache-control':'private, no-store'};

/** {ids:[...]} (1 to 100 notification ids) or {all:true}; anything else is refused. */
function parse(body:unknown):{ids:string[]}|{all:true}|null{
  if(!body||typeof body!=='object'||Array.isArray(body))return null;
  const {ids,all}=body as {ids?:unknown;all?:unknown};
  if(all===true&&ids===undefined)return {all:true};
  if(all===undefined&&Array.isArray(ids)&&ids.length>0&&ids.length<=MAX_IDS&&ids.every(id=>typeof id==='string'&&id.length<=200))return {ids:ids as string[]};
  return null;
}

/**
 * POST /api/query/customer/notifications/read (plan U10, C_CVL4): marks the bell's notifications read
 * for the session customer, the named ones or all shown (Mark all read). Ids that are not the
 * customer's notifications are ignored. 200 with the bell as it now reads; 400 for a bad body.
 */
export async function POST(request:NextRequest){
  const {session,refusal}=customerSession(request);
  if(refusal)return refusal;
  const which=parse(await request.json().catch(()=>undefined));
  if(!which)return NextResponse.json({detail:'Send {"ids": [...]} with 1 to 100 notification ids, or {"all": true}.',code:'invalid_input'},{status:400,headers:noStore});
  return NextResponse.json(markNotificationsRead(session.customerId,which),{headers:noStore});
}
