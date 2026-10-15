import {managerWrite} from '@/server/rep/settings-http';
import {changeTeamMembers} from '@/server/rep/teams';
export const runtime='nodejs';export const dynamic='force-dynamic';

type Context={params:Promise<{id:string}>};

/**
 * PUT /api/rep/teams/<id>/members {add?, remove?}: moves reps into the team (out of their old one: one team
 * per rep) or takes the team's own members out (Appendix D "add or remove members"). Manager only.
 */
export const PUT=managerWrite<Context>(async(repId,body,{params})=>{
  const id=(await params).id;
  return changeTeamMembers(/^\d{1,9}$/.test(id)?Number(id):-1,body,repId);
});
