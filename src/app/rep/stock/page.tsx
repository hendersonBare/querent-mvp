import type {Metadata} from 'next';
import {CATEGORY_PARAM} from '@/components/rep/stock/params';
import {STOCK_TABLE,StockList} from '@/components/rep/stock/StockList';
import {tablePrefs} from '@/server/repository';
import {addToQuoteTargets} from '@/server/rep/add-to-quote';
import {itemList} from '@/server/rep/reference';
import {signedInRep} from '@/server/rep/session';

export const metadata:Metadata={title:'Stock'};

type SearchParams=Promise<Record<string,string|string[]|undefined>>;

/**
 * Stock (/rep/stock, decision 46; plan U5, C_STBase): the catalog with list price, category and stock per
 * branch, read-only and the same for every rep. ?category= (the old Items links) starts the Filter on
 * that category. Add to quote offers the signed-in rep's own drafts.
 */
export default async function StockPage({searchParams}:{searchParams:SearchParams}){
  const reader=await signedInRep();
  const category=(await searchParams)[CATEGORY_PARAM];
  return <StockList list={itemList()} category={typeof category==='string'?category:null} targets={await addToQuoteTargets(reader.repId)}
    initialPrefs={tablePrefs(reader.repId,STOCK_TABLE)}/>;
}
