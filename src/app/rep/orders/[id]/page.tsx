import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {OrderDetail} from '@/components/rep/orders/OrderDetail';
import {scopedHref} from '@/components/rep/scope';
import {findOrder} from '@/server/repository';
import {detailTitle,pickedCustomer} from '@/server/rep/reference';
import {signedInRepId} from '@/server/rep/session';

type Params=Promise<{id:string}>;
type SearchParams=Promise<Record<string,string|string[]|undefined>>;

export async function generateMetadata({params}:{params:Params}):Promise<Metadata>{
  const {id}=await params;
  return {title:await detailTitle('Orders',()=>findOrder(id)?.order_number)};
}

/**
 * One order, by number (/rep/orders/SO-51223) or id (spec §4, task 3.8): lines at the prices paid,
 * totals and order facts. It follows the "Viewing" picker: picking a customer the order isn't for
 * goes to that customer's orders.
 */
export default async function OrderPage({params,searchParams}:{params:Params;searchParams:SearchParams}){
  await signedInRepId();
  const order=findOrder((await params).id);
  const viewing=pickedCustomer(await searchParams);
  if(order&&viewing.customerId&&viewing.customerId!==order.customer_id)redirect(scopedHref('/rep/orders',viewing.customerId));
  if(!order)notFound();
  return <OrderDetail order={order} viewing={viewing}/>;
}
