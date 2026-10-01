import 'server-only';
import type {NextRequest} from 'next/server';
import type {Principal} from '@/lib/contracts';
export const COOKIE='querent-persona';
// Demo personas (spec §2): Landon Richards, a BOXT Packaging rep, and Megan Hale, Purchasing at Timpanogos Fulfillment.
export const personas={
  supplier:{user_id:'landon',role:'supplier_admin',customer_id:null,name:'BOXT Packaging',user_name:'Landon Richards',rep_id:'landon',contact_id:null},
  customer:{user_id:'megan',role:'customer_user',customer_id:'timpanogos',name:'Timpanogos Fulfillment Co.',user_name:'Megan Hale',rep_id:null,contact_id:'megan'},
} satisfies Record<string,Principal>;
export type PersonaId=keyof typeof personas;
export function principal(request:NextRequest):Principal|null{return principalFromCookie(request.cookies.get(COOKIE)?.value);}
/** The persona named by the COOKIE value, for Server Components that read cookies() themselves (the rep portal layout). */
export function principalFromCookie(value:string|undefined):Principal|null{return value&&Object.hasOwn(personas,value)?personas[value as PersonaId]:null;}
