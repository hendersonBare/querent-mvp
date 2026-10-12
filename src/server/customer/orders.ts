import 'server-only';
import type {CustomerOrderRow} from '@/domain';
import {orders} from '@/server/repository/customer';

// The Orders sheet (plan U10; C_CVL2; new-ui-implementation-prompt Appendix D "GET
// /api/query/customer/orders"): the customer's own previous orders, newest first, with only what the
// sheet shows. Customer-facing, so it reads only the customer-safe repository module.

export function customerOrderList(customerId:string):CustomerOrderRow[]{
  return orders(customerId).map(({id,order_number,order_date,status,fulfillment,branch_code,total,quote_number})=>({id,order_number,order_date,status,fulfillment,branch_code,total,quote_number}));
}
