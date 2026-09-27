import type {Metadata} from 'next';
import {QuotesList} from '@/components/rep/quotes/QuotesList';
import {STATUS_PARAM} from '@/components/rep/quotes/labels';
import {ALL_CUSTOMERS,SCOPE_PARAM} from '@/components/rep/scope';
import {parseStatus,repQuoteList} from '@/server/rep/quotes';
import {signedInRepId} from '@/server/rep/session';

export const metadata:Metadata={title:'Quotes'};

type SearchParams=Promise<Record<string,string|string[]|undefined>>;
const single=(value:string|string[]|undefined)=>typeof value==='string'?value:null;

/**
 * Quotes (spec §4, task 3.2): the signed-in rep's queue for the "Viewing" picker (?customer=) and
 * the status filter (?status=). Rendered here with the data, then kept fresh by the list itself.
 */
export default async function QuotesPage({searchParams}:{searchParams:SearchParams}){
  const repId=await signedInRepId();
  const params=await searchParams;
  const customer=single(params[SCOPE_PARAM]);
  const list=await repQuoteList(repId,{customerId:customer===ALL_CUSTOMERS?null:customer,status:parseStatus(single(params[STATUS_PARAM]))});
  // A new scope or filter is a new list: remount it, so it polls for what it now shows.
  return <QuotesList key={`${list.customer?.id??ALL_CUSTOMERS}:${list.status??'all'}`} initial={list}/>;
}
