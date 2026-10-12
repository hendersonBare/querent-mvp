import type {Metadata} from 'next';
import {CATEGORY_PARAM,ItemsList} from '@/components/rep/items/ItemsList';
import {itemList} from '@/server/rep/reference';
import {signedInRepId} from '@/server/rep/session';

export const metadata:Metadata={title:'Stock'};

type SearchParams=Promise<Record<string,string|string[]|undefined>>;

/** Stock (/rep/stock, decision 46; spec §4, task 3.8): the catalog with list price, category and stock per branch, read-only, by category (?category=). The same for every rep. */
export default async function ItemsPage({searchParams}:{searchParams:SearchParams}){
  await signedInRepId();
  const category=(await searchParams)[CATEGORY_PARAM];
  return <ItemsList list={itemList({category:typeof category==='string'?category:null})}/>;
}
