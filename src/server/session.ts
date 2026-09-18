import 'server-only';
import type {NextRequest} from 'next/server';
export const COOKIE='querent-persona';
export const personas={supplier:{user_id:'supplier',role:'supplier_admin' as const,customer_id:null,name:'Century Equipment'},wasatch:{user_id:'wasatch',role:'customer_user' as const,customer_id:'wasatch',name:'Wasatch Excavation LLC'},bonneville:{user_id:'bonneville',role:'customer_user' as const,customer_id:'bonneville',name:'Bonneville Grading Co.'}};
export type PersonaId=keyof typeof personas;
export function principal(request:NextRequest){const id=request.cookies.get(COOKIE)?.value as PersonaId|undefined;return id&&id in personas?personas[id]:null;}
