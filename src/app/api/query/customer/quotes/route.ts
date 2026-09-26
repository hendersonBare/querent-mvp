import {customerGet} from '@/server/customer/http';
import {customerQuoteList} from '@/server/customer/sidebar';
export const runtime='nodejs';export const dynamic='force-dynamic';

/** The customer's right sidebar (spec §3): quote buttons newest first, with the status to show now. */
export const GET=customerGet(customerId=>customerQuoteList(customerId));
