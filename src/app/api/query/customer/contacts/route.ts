import {customerGet} from '@/server/customer/http';
import {customerContacts} from '@/server/customer/sidebar';
export const runtime='nodejs';export const dynamic='force-dynamic';

/** The customer's left sidebar (spec §3): assigned rep, departments, will-call per branch. */
export const GET=customerGet(customerContacts);
