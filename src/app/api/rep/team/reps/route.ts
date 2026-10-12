import {managerRoute,repJson} from '@/server/rep/http';
import {teamSettings} from '@/server/rep/team';
export const runtime='nodejs';export const dynamic='force-dynamic';

/** GET /api/rep/team/reps: every rep with role, team, active flag and customer count (v3 spec §5, §8; tasks D1, U7). Manager only. */
export const GET=managerRoute(()=>repJson(teamSettings()));
