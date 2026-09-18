import {NextRequest,NextResponse} from 'next/server';
import {COOKIE,personas,principal,type PersonaId} from '@/server/session';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:NextRequest){return NextResponse.json(principal(request));}
export async function POST(request:NextRequest){const body=await request.json().catch(()=>({}));const id=body.persona as PersonaId;if(!(id in personas))return NextResponse.json({detail:'Choose a valid demo workspace.'},{status:400});const response=NextResponse.json(personas[id]);response.cookies.set(COOKIE,id,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*24*30});return response;}
export function DELETE(){const response=NextResponse.json({ok:true});response.cookies.set(COOKIE,'',{httpOnly:true,path:'/',maxAge:0});return response;}
