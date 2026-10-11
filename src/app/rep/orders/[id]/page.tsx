import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {OrderDetail} from '@/components/rep/orders/OrderDetail';
import {detailTitle,orderDetail} from '@/server/rep/reference';
import {signedInRep} from '@/server/rep/session';

type Params=Promise<{id:string}>;

export async function generateMetadata({params}:{params:Params}):Promise<Metadata>{
  const {id}=await params;
  return {title:await detailTitle('Orders',reader=>orderDetail(id,reader)?.order_number)};
}

/**
 * One order, by number (/rep/orders/SO-51223) or id (spec §4, task 3.8): lines at the prices paid,
 * totals and order facts. An order for another rep's customer is not found for a rep; the manager
 * opens any order (task U1).
 */
export default async function OrderPage({params}:{params:Params}){
  const reader=await signedInRep();
  const order=orderDetail((await params).id,reader);
  if(!order)notFound();
  return <OrderDetail order={order}/>;
}
