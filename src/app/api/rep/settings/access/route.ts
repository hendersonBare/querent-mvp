import {updateAccess} from '@/server/rep/settings';
import {settingsWrite} from '@/server/rep/settings-http';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * PUT /api/rep/settings/access {customer_id, category, enabled}: what one customer (or, with
 * customer_id null, every customer) can ask about in chat. The chat tools enforce it (spec §6.3).
 */
export const PUT=settingsWrite((_repId,body)=>updateAccess(body));
