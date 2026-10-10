import {assignRep} from '@/server/rep/settings';
import {managerWrite} from '@/server/rep/settings-http';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * PUT /api/rep/settings/assignments {customer_id, rep_id, moveOpenQuotes?}: the customer's one rep
 * (decision 21, OA-55; task D2). The manager only (a rep 403). Existing quotes keep their rep unless
 * moveOpenQuotes is true ("Also move this customer's open quotes"): then the open ones move too,
 * each with an activity row. Answers {assignments, moved}.
 */
export const PUT=managerWrite((repId,body)=>assignRep(repId,body));
