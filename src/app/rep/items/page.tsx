import type {Metadata} from 'next';
import {CATEGORY_PARAM,ItemsList} from '@/components/rep/items/ItemsList';
import {itemList,pickedCustomer} from '@/server/rep/reference';
import {signedInRepId} from '@/server/rep/session';

export const metadata:Metadata={title:'Items'};

type SearchParams=Promise<Record<string,string|string[]|undefined>>;

/** Items (spec §4, task 3.8): the catalog with list price, category and stock per branch, read-only, by category (?category=). */
export default async function ItemsPage({searchParams}:{searchParams:SearchParams}){
  await signedInRepId();
  const params=await searchParams;
  const category=params[CATEGORY_PARAM];
  return <ItemsList list={itemList({category:typeof category==='string'?category:null})} viewing={pickedCustomer(params)}/>;
}
