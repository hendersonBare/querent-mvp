import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {ItemDetail} from '@/components/rep/items/ItemDetail';
import {catalogItem} from '@/server/repository';
import {detailTitle,itemDetail,pickedCustomer} from '@/server/rep/reference';
import {signedInRepId} from '@/server/rep/session';

type Params=Promise<{id:string}>;
type SearchParams=Promise<Record<string,string|string[]|undefined>>;

export async function generateMetadata({params}:{params:Params}):Promise<Metadata>{
  const {id}=await params;
  return {title:await detailTitle('Items',()=>catalogItem(id)?.sku)};
}

/** One item, by SKU (/rep/items/HCS-12-13-2G8) or id (spec §4, task 3.8): stock per branch, and recent orders for the "Viewing" picker's customer. */
export default async function ItemPage({params,searchParams}:{params:Params;searchParams:SearchParams}){
  await signedInRepId();
  const viewing=pickedCustomer(await searchParams);
  const view=itemDetail((await params).id,{customerId:viewing.customerId});
  if(!view)notFound();
  return <ItemDetail view={view} viewing={viewing}/>;
}
