import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {ItemDetail} from '@/components/rep/stock/ItemDetail';
import {catalogItem} from '@/server/repository';
import {addToQuoteTargets} from '@/server/rep/add-to-quote';
import {detailTitle,itemDetail} from '@/server/rep/reference';
import {signedInRep} from '@/server/rep/session';

type Params=Promise<{id:string}>;

export async function generateMetadata({params}:{params:Params}):Promise<Metadata>{
  const {id}=await params;
  return {title:await detailTitle('Stock',()=>catalogItem(id)?.sku)};
}

/**
 * One item, by SKU (/rep/stock/HCS-12-13-2G8) or id (plan U5; C_ST2): stock per branch, and its recent
 * orders: a rep's own customers' only, every customer's for the manager (task U1). Add to quote offers
 * the signed-in rep's own drafts (C_ST3).
 */
export default async function ItemPage({params}:{params:Params}){
  const reader=await signedInRep();
  const view=itemDetail((await params).id,reader);
  if(!view)notFound();
  return <ItemDetail view={view} allCustomers={reader.manager} targets={await addToQuoteTargets(reader.repId)}/>;
}
