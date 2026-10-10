import 'server-only';
import type {NextRequest} from 'next/server';
import type {Principal} from '@/lib/contracts';
export const COOKIE='querent-persona';
// Demo personas (spec §2; v3 spec §8, OA-12, OA-18): Brandi Gallegos, the Herrick manager, who keeps
// her own book; Mara Jensen and Eli Porter, Herrick reps; and Dana Ortiz, Purchasing at Wasatch. The
// cookie holds the persona id ("supplier" is Brandi). Mara and Eli get chooser buttons in F1.
// rep_role is what the persona claims; reps.role in the database must agree (src/server/rep/access.ts).
// TODO(R-4): replace the demo cookie auth with a third-party auth service.
const herrick={role:'supplier_admin',customer_id:null,name:'Herrick Industrial Supply',contact_id:null} as const;
export const personas={
  supplier:{user_id:'brandi',...herrick,user_name:'Brandi Gallegos',rep_id:'brandi',rep_role:'manager'},
  mara:{user_id:'mara',...herrick,user_name:'Mara Jensen',rep_id:'mara',rep_role:'rep'},
  eli:{user_id:'eli',...herrick,user_name:'Eli Porter',rep_id:'eli',rep_role:'rep'},
  customer:{user_id:'dana',role:'customer_user',customer_id:'wasatch',name:'Wasatch Mechanical Contractors',user_name:'Dana Ortiz',rep_id:null,rep_role:null,contact_id:'dana'},
} satisfies Record<string,Principal>;
export type PersonaId=keyof typeof personas;
export function principal(request:NextRequest):Principal|null{return principalFromCookie(request.cookies.get(COOKIE)?.value);}
/** The persona named by the COOKIE value, for Server Components that read cookies() themselves (the rep portal layout). */
export function principalFromCookie(value:string|undefined):Principal|null{return value&&Object.hasOwn(personas,value)?personas[value as PersonaId]:null;}
