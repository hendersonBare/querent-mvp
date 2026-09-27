import type {Metadata} from 'next';
import {CustomersList} from '@/components/rep/customers/CustomersList';
import {customerList,pickedCustomer} from '@/server/rep/reference';
import {signedInRepId} from '@/server/rep/session';

export const metadata:Metadata={title:'Customers'};

type SearchParams=Promise<Record<string,string|string[]|undefined>>;

/** Customers (spec §4, task 3.8): every account and its assigned rep, read-only; the "Viewing" picker narrows it to one. */
export default async function CustomersPage({searchParams}:{searchParams:SearchParams}){
  const repId=await signedInRepId();
  const viewing=pickedCustomer(await searchParams);
  return <CustomersList rows={customerList(viewing.customerId)} viewing={viewing} repId={repId}/>;
}
