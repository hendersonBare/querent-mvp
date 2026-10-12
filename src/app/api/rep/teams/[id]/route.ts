import {managerWrite} from '@/server/rep/settings-http';
import {deleteTeamById,updateTeamById} from '@/server/rep/teams';
export const runtime='nodejs';export const dynamic='force-dynamic';

type Context={params:Promise<{id:string}>};
/** The team id in the path: a whole number, or -1 (no such team, 404). */
const teamId=async({params}:Context)=>{const id=(await params).id;return /^\d{1,9}$/.test(id)?Number(id):-1;};

/**
 * PATCH /api/rep/teams/<id> {name?, parent_team_id?}: renames the team and/or puts it inside another team
 * (null: on its own), never inside itself or a team inside it (decision 47; Appendix D). Manager only.
 */
export const PATCH=managerWrite<Context>(async(repId,body,context)=>updateTeamById(await teamId(context),body,repId));

/** DELETE /api/rep/teams/<id>: its reps have no team, the teams inside it stand on their own. Manager only. */
export const DELETE=managerWrite<Context>(async(repId,_body,context)=>deleteTeamById(await teamId(context),repId));
