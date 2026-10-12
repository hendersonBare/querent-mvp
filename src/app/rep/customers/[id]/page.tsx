import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {CustomerDetail} from '@/components/rep/customers/CustomerDetail';
import {customerAccount,supplier} from '@/server/repository';
import {readsCustomer} from '@/server/rep/access';
import {customerDetail,detailTitle} from '@/server/rep/reference';
import {signedInRep} from '@/server/rep/session';

type Params=Promise<{id:string}>;

export async function generateMetadata({params}:{params:Params}):Promise<Metadata>{
  const {id}=await params;
  return {title:await detailTitle('Customers',reader=>readsCustomer(reader,id)?customerAccount(id)?.name:undefined)};
}

/**
 * One customer (plan U5; C_CU3): recent orders and quotes, account, rep and contacts. Another rep's
 * customer is not found for a rep; the manager opens any customer (task U1).
 */
export default async function CustomerPage({params}:{params:Params}){
  const reader=await signedInRep();
  const view=customerDetail((await params).id,reader);
  if(!view)notFound();
  // The supplier's short name, as its people say it ("Herrick").
  return <CustomerDetail view={view} supplierName={supplier().name.split(' ')[0]}/>;
}
