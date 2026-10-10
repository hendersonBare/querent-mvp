import {NextRequest,NextResponse} from 'next/server';
import {repAccess} from '@/server/rep/access';
import {COOKIE,personas,principal,type PersonaId} from '@/server/session';
import type {Principal} from '@/lib/contracts';
export const runtime='nodejs';export const dynamic='force-dynamic';
// A rep persona whose rep is inactive (v3 spec §8, OA-27; task D1) can't start a session, and an existing one reads as signed out.
const inactiveRep=(user:Principal)=>user.role==='supplier_admin'&&!repAccess(user).ok;
export function GET(request:NextRequest){const user=principal(request);return NextResponse.json(user&&inactiveRep(user)?null:user);}
export async function POST(request:NextRequest){const body=await request.json().catch(()=>({}));const id=body.persona as PersonaId;if(!(id in personas))return NextResponse.json({detail:'Choose a valid demo workspace.'},{status:400});if(inactiveRep(personas[id]))return NextResponse.json({detail:'This rep account is inactive.'},{status:403});const response=NextResponse.json(personas[id]);response.cookies.set(COOKIE,id,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*24*30});return response;}
export function DELETE(){const response=NextResponse.json({ok:true});response.cookies.set(COOKIE,'',{httpOnly:true,path:'/',maxAge:0});return response;}
