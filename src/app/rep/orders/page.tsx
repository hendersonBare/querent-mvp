import type {Metadata} from 'next';
import {OrdersList} from '@/components/rep/orders/OrdersList';
import {allOrders} from '@/server/repository';
import {pickedCustomer} from '@/server/rep/reference';
import {signedInRepId} from '@/server/rep/session';

export const metadata:Metadata={title:'Orders'};

type SearchParams=Promise<Record<string,string|string[]|undefined>>;

/** Orders (spec §4, task 3.8): every order newest first, read-only, for the "Viewing" picker's customer. */
export default async function OrdersPage({searchParams}:{searchParams:SearchParams}){
  await signedInRepId();
  const viewing=pickedCustomer(await searchParams);
  return <OrdersList rows={allOrders({customerId:viewing.customerId})} viewing={viewing}/>;
}
