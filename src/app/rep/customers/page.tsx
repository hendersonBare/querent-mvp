import type {Metadata} from 'next';
import {CustomersList} from '@/components/rep/customers/CustomersList';
import {customerList,pickedCustomer} from '@/server/rep/reference';
import {signedInRep} from '@/server/rep/session';

export const metadata:Metadata={title:'Customers'};

type SearchParams=Promise<Record<string,string|string[]|undefined>>;

/**
 * Customers (spec §4, task 3.8): each account and its assigned rep, read-only. A rep sees their own
 * customers, the manager every customer (task U1); the page's own ?customer= narrows it to one.
 */
export default async function CustomersPage({searchParams}:{searchParams:SearchParams}){
  const reader=await signedInRep();
  const viewing=pickedCustomer(await searchParams,reader);
  return <CustomersList rows={customerList(reader,viewing.customerId)} viewing={viewing} repId={reader.repId}/>;
}
