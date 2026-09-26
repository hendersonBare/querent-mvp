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
export function principal(request:NextRequest):Principal|null{const id=request.cookies.get(COOKIE)?.value as PersonaId|undefined;return id&&id in personas?personas[id]:null;}
