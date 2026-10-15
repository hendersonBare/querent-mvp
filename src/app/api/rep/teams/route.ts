import {managerRoute,repJson} from '@/server/rep/http';
import {managerWrite} from '@/server/rep/settings-http';
import {createTeamFrom,teamsBoard} from '@/server/rep/teams';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/teams: the Teams and Reps board (plan U7): the reps (no managers) with their customers and
 * open quotes, everyone who can own a customer, the teams in list order with their counts, and every
 * customer with its rep. Manager only (a rep 403).
 */
export const GET=managerRoute(repId=>repJson(teamsBoard(repId)));

/** POST /api/rep/teams {name, rep_ids?, parent_team_id?}: creates a team (Appendix D). Answers the board. */
export const POST=managerWrite((repId,body)=>createTeamFrom(body,repId));
