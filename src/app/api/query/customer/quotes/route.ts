import {customerGet} from '@/server/customer/http';
import {customerQuoteList} from '@/server/customer/sidebar';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/query/customer/quotes: the customer's own quotes newest first, with the status to show now (spec §3).
 * The right-hand quotes list it fed was removed with the three-pane layout (plan U10); the route stays for the API.
 */
export const GET=customerGet(customerId=>customerQuoteList(customerId));
