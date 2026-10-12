import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {ItemDetail} from '@/components/rep/items/ItemDetail';
import {catalogItem} from '@/server/repository';
import {detailTitle,itemDetail} from '@/server/rep/reference';
import {signedInRep} from '@/server/rep/session';

type Params=Promise<{id:string}>;

export async function generateMetadata({params}:{params:Params}):Promise<Metadata>{
  const {id}=await params;
  return {title:await detailTitle('Items',()=>catalogItem(id)?.sku)};
}

/**
 * One item, by SKU (/rep/items/HCS-12-13-2G8) or id (spec §4, task 3.8): stock per branch, and its
 * recent orders: a rep's own customers' only, every customer's for the manager (task U1).
 */
export default async function ItemPage({params}:{params:Params}){
  const reader=await signedInRep();
  const view=itemDetail((await params).id,reader);
  if(!view)notFound();
  return <ItemDetail view={view} allCustomers={reader.manager}/>;
}
