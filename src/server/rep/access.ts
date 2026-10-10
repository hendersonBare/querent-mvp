import 'server-only';
import type {Principal} from '@/lib/contracts';
import {repStanding} from '@/server/repository';

// Who the rep portal serves (v3 spec §5, §8; decisions 20, 21; OA-12; task D1). The demo cookie
// names a persona (src/server/session.ts); the rep it names must also exist and be active in the
// database, so a rep marked inactive loses access at once, cookie or not. Manager features need
// the persona's rep_role and the stored reps.role to both say manager.

/** The signed-in rep, or why not: 401 without a session, 403 for a customer or an inactive rep. */
export type RepAccess={ok:true;repId:string;manager:boolean}|{ok:false;status:401|403;detail:string};

export function repAccess(user:Principal|null):RepAccess{
  if(!user)return {ok:false,status:401,detail:'Choose a demo workspace.'};
  if(user.role!=='supplier_admin'||!user.rep_id)return {ok:false,status:403,detail:'Supplier access required.'};
  const standing=repStanding(user.rep_id);
  if(!standing)return {ok:false,status:403,detail:'Supplier access required.'};
  if(!standing.active)return {ok:false,status:403,detail:'This rep account is inactive.'};
  return {ok:true,repId:user.rep_id,manager:user.rep_role==='manager'&&standing.role==='manager'};
}
