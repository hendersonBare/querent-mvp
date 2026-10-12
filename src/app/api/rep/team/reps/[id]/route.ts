import {managerWrite} from '@/server/rep/settings-http';
import {updateTeamRep} from '@/server/rep/team';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * PUT /api/rep/team/reps/<id> {active}: the rep's active flag (v3 spec §5, §8; decisions 20, 21; tasks D1,
 * U7), saved by Teams and Reps' Save. Manager only. Deactivating a rep who still has customers is 409
 * has_customers; the manager can't deactivate themselves. Teams are set through /api/rep/teams.
 */
export const PUT=managerWrite<{params:Promise<{id:string}>}>(async(repId,body,{params})=>updateTeamRep(repId,(await params).id,body));
