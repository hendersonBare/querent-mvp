import type {Metadata} from 'next';
import {QuotesList} from '@/components/rep/quotes/QuotesList';
import {AGING_PARAM,ATTENTION_PARAM,SORT_PARAM,STATUS_PARAM,isAttention} from '@/components/rep/quotes/labels';
import {ALL_CUSTOMERS,CUSTOMER_PARAM,FROM_PARAM,REP_PARAM,TEAM_PARAM,TO_PARAM} from '@/components/rep/scope';
import {parseAttentionSort,parseStatus,repQuoteList} from '@/server/rep/quotes';
import {signedInRep} from '@/server/rep/session';

export const metadata:Metadata={title:'Quotes'};

type SearchParams=Promise<Record<string,string|string[]|undefined>>;
const single=(value:string|string[]|undefined)=>typeof value==='string'?value:null;

/**
 * Quotes (spec §4, task 3.2): the page's own customer filter (?customer=) and the status filter
 * (?status=), or the Needs attention view (?attention=1&sort=oldest, task A2). Rendered here with
 * the data, then kept fresh by the list itself. Scope is role based (task U1): a rep's own quotes,
 * or every rep's for the manager, who also filters by ?rep=&team= (task D2); ?scope=all is ignored.
 * The Team dashboard drills in with &rep=a,b, &from=&to= and &aging= (task D3).
 */
export default async function QuotesPage({searchParams}:{searchParams:SearchParams}){
  const {repId,manager}=await signedInRep();
  const params=await searchParams;
  const customer=single(params[CUSTOMER_PARAM]);
  const filters={rep:single(params[REP_PARAM]),team:single(params[TEAM_PARAM]),from:single(params[FROM_PARAM]),to:single(params[TO_PARAM]),aging:single(params[AGING_PARAM])};
  const list=await repQuoteList(repId,{customerId:customer===ALL_CUSTOMERS?null:customer,status:parseStatus(single(params[STATUS_PARAM])),
    attention:isAttention(single(params[ATTENTION_PARAM])),sort:parseAttentionSort(single(params[SORT_PARAM])),manager,filters});
  // A new filter is a new list: remount it, so it polls for what it now shows.
  const filter=list.attention?`attention-${list.sort}`:list.aging_filter?`aging-${list.aging_filter}`:list.status??'all';
  const reps=list.scope==='all'?`all:${list.rep_filter??''}:${list.team_filter??''}:${list.window?`${list.window.from}-${list.window.to}`:''}`:'mine';
  return <QuotesList key={`${list.customer?.id??ALL_CUSTOMERS}:${filter}:${reps}`} initial={list}/>;
}
