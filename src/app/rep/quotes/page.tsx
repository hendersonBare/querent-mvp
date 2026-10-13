import type {Metadata} from 'next';
import {QuotesList} from '@/components/rep/quotes/QuotesList';
import {BOARD_ID,TABLE_ID,canonicalQuery,parseView} from '@/components/rep/quotes/filters';
import {VIEW_PARAM} from '@/components/rep/quotes/labels';
import {quoteListOptions,repQuoteList} from '@/server/rep/quotes';
import {signedInRep} from '@/server/rep/session';
import {tablePrefs} from '@/server/repository';

export const metadata:Metadata={title:'Quotes'};

type SearchParams=Promise<Record<string,string|string[]|undefined>>;

/**
 * Quotes (plan U3; C_QOBoard, C_QOTable): the board or the table (?view=table), with the filter panel's
 * filters in the query (src/components/rep/quotes/filters.ts). Rendered here with the data and the
 * user's own column and lane order, then kept fresh by the list itself with the same query. Scope is
 * role based (task U1): a rep's own quotes, or every rep's for the manager. The old Needs attention
 * link (?attention=1) and the Analytics drill-down (?rep=a,b&from=&to=&aging=, tasks D3 and U6) still open
 * the list they name.
 */
export default async function QuotesPage({searchParams}:{searchParams:SearchParams}){
  const {repId,manager}=await signedInRep();
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(await searchParams))if(typeof value==='string')params.set(key,value);
  const view=parseView(params.get(VIEW_PARAM));
  const query=canonicalQuery(params);
  const list=await repQuoteList(repId,{...quoteListOptions(new URLSearchParams(query)),manager});
  // A new query is a new list: remount it, so it polls for what it now shows. The view is not part of it.
  return <QuotesList key={query} initial={list} query={query} view={view} prefs={{table:tablePrefs(repId,TABLE_ID),board:tablePrefs(repId,BOARD_ID)}}/>;
}
