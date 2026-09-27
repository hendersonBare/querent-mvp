import 'server-only';
import type {NextRequest} from 'next/server';
import type {Principal} from '@/lib/contracts';
export const COOKIE='querent-persona';
// Demo personas (spec §2): Brandi Gallegos, a Herrick rep, and Dana Ortiz, Purchasing at Wasatch.
export const personas={
  supplier:{user_id:'brandi',role:'supplier_admin',customer_id:null,name:'Herrick Industrial Supply',user_name:'Brandi Gallegos',rep_id:'brandi',contact_id:null},
  customer:{user_id:'dana',role:'customer_user',customer_id:'wasatch',name:'Wasatch Mechanical Contractors',user_name:'Dana Ortiz',rep_id:null,contact_id:'dana'},
} satisfies Record<string,Principal>;
export type PersonaId=keyof typeof personas;
export function principal(request:NextRequest):Principal|null{return principalFromCookie(request.cookies.get(COOKIE)?.value);}
/** The persona named by the COOKIE value, for Server Components that read cookies() themselves (the rep portal layout). */
export function principalFromCookie(value:string|undefined):Principal|null{return value&&Object.hasOwn(personas,value)?personas[value as PersonaId]:null;}
