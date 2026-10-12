import type {Metadata} from 'next';
import {CUSTOMERS_TABLE,CustomersList} from '@/components/rep/customers/CustomersList';
import {tablePrefs} from '@/server/repository';
import {customerList,pickedCustomer} from '@/server/rep/reference';
import {signedInRep} from '@/server/rep/session';

export const metadata:Metadata={title:'Customers'};

type SearchParams=Promise<Record<string,string|string[]|undefined>>;

/**
 * Customers (plan U5; C_CUBase, C_RCUBase): each account the signed-in rep may read, with its rep, read-only.
 * A rep sees their own customers, the manager every customer (task U1); the page's own ?customer=
 * narrows it to one. Search and Filter work on the page; column order and visibility are the user's own.
 */
export default async function CustomersPage({searchParams}:{searchParams:SearchParams}){
  const reader=await signedInRep();
  const viewing=pickedCustomer(await searchParams,reader);
  return <CustomersList rows={customerList(reader,viewing.customerId)} manager={reader.manager} initialPrefs={tablePrefs(reader.repId,CUSTOMERS_TABLE)}/>;
}
