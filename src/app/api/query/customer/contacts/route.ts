import {customerGet} from '@/server/customer/http';
import {customerRepContact} from '@/server/customer/sidebar';
export const runtime='nodejs';export const dynamic='force-dynamic';

/** The My rep sheet (plan U10, C_CVL3): the customer's assigned rep only (new-ui-implementation-prompt Appendix D). */
export const GET=customerGet(customerId=>customerRepContact(customerId));
