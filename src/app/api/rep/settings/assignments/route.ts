import {assignRep} from '@/server/rep/settings';
import {settingsWrite} from '@/server/rep/settings-http';
export const runtime='nodejs';export const dynamic='force-dynamic';

/** PUT /api/rep/settings/assignments {customer_id, rep_id}: the customer's one rep. Existing quotes keep theirs. */
export const PUT=settingsWrite((_repId,body)=>assignRep(body));
