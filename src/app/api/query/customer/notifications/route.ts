import {customerGet} from '@/server/customer/http';
import {customerNotifications} from '@/server/customer/notifications';
export const runtime='nodejs';export const dynamic='force-dynamic';

/** The bell (plan U10, C_CVL4): the newest notifications and the unread count. The page polls it like the rep badges. */
export const GET=customerGet(customerId=>customerNotifications(customerId));
