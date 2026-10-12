import {customerGet} from '@/server/customer/http';
import {customerOrderList} from '@/server/customer/orders';
export const runtime='nodejs';export const dynamic='force-dynamic';

/** The Orders sheet (plan U10, C_CVL2): the customer's own previous orders, newest first. No cost or margin. */
export const GET=customerGet(customerId=>customerOrderList(customerId));
