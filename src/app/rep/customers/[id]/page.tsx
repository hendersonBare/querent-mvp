import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {CustomerDetail} from '@/components/rep/customers/CustomerDetail';
import {scopedHref} from '@/components/rep/scope';
import {customerAccount} from '@/server/repository';
import {customerDetail,detailTitle,pickedCustomer} from '@/server/rep/reference';
import {signedInRepId} from '@/server/rep/session';

type Params=Promise<{id:string}>;
type SearchParams=Promise<Record<string,string|string[]|undefined>>;

export async function generateMetadata({params}:{params:Params}):Promise<Metadata>{
  const {id}=await params;
  return {title:await detailTitle('Customers',()=>customerAccount(id)?.name)};
}

/**
 * One customer (spec §4, task 3.8): account, terms, rep, contacts, recent orders and quotes. It
 * follows the "Viewing" picker: picking another customer opens that customer's page.
 */
export default async function CustomerPage({params,searchParams}:{params:Params;searchParams:SearchParams}){
  const repId=await signedInRepId();
  const {id}=await params;
  const viewing=pickedCustomer(await searchParams);
  if(viewing.customerId&&viewing.customerId!==id)redirect(scopedHref(`/rep/customers/${encodeURIComponent(viewing.customerId)}`,viewing.customerId));
  const view=customerDetail(id);
  if(!view)notFound();
  return <CustomerDetail view={view} viewing={viewing} repId={repId}/>;
}
