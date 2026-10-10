import {managerWrite} from '@/server/rep/settings-http';
import {updateTeamRep} from '@/server/rep/team';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * PUT /api/rep/team/reps/<id> {team?, active?}: the rep's team label (trimmed, up to 40 characters,
 * null or blank clears it) and active flag (v3 spec §5, §8; decisions 20, 21; task D1). Manager only.
 * Deactivating a rep who still has customers is 409 has_customers; the manager can't deactivate themselves.
 */
export const PUT=managerWrite<{params:Promise<{id:string}>}>(async(repId,body,{params})=>updateTeamRep(repId,(await params).id,body));
