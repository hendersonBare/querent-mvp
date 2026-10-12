import type {Metadata} from 'next';
import {OrdersList} from '@/components/rep/orders/OrdersList';
import {orderList,pickedCustomer} from '@/server/rep/reference';
import {signedInRep} from '@/server/rep/session';

export const metadata:Metadata={title:'Orders'};

type SearchParams=Promise<Record<string,string|string[]|undefined>>;

/**
 * Orders (spec §4, task 3.8): newest first, read-only. A rep sees their own customers' orders, the
 * manager every order (task U1); the page's own ?customer= narrows it to one customer.
 */
export default async function OrdersPage({searchParams}:{searchParams:SearchParams}){
  const reader=await signedInRep();
  const viewing=pickedCustomer(await searchParams,reader);
  return <OrdersList rows={orderList(reader,viewing.customerId)} viewing={viewing}/>;
}
