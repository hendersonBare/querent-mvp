import type {Metadata} from 'next';
import {ORDERS_TABLE,OrdersList} from '@/components/rep/orders/OrdersList';
import {branches,tablePrefs} from '@/server/repository';
import {readableCustomers} from '@/server/rep/access';
import {orderList,pickedCustomer} from '@/server/rep/reference';
import {signedInRep} from '@/server/rep/session';

export const metadata:Metadata={title:'Orders'};

type SearchParams=Promise<Record<string,string|string[]|undefined>>;

/**
 * Orders (plan U5; C_ORBase): newest first, read-only. A rep sees their own customers' orders, the
 * manager every order (task U1); the page's own ?customer= (its customer picker) narrows it to one customer.
 */
export default async function OrdersPage({searchParams}:{searchParams:SearchParams}){
  const reader=await signedInRep();
  const viewing=pickedCustomer(await searchParams,reader);
  const customers=readableCustomers(reader).map(({id,name,account_number})=>({id,name,account_number}));
  return <OrdersList rows={orderList(reader,viewing.customerId)} customers={customers} customerId={viewing.customerId}
    branches={branches().map(({id,code})=>({id,code}))} manager={reader.manager} initialPrefs={tablePrefs(reader.repId,ORDERS_TABLE)}/>;
}
