'use client';
import {useCallback,useEffect,useState} from 'react';
import type {RepAnalytics} from '@/server/analytics';
import {usePoll} from '@/lib/use-poll';
import {useSearchParams} from 'next/navigation';
import {useRepPortal} from '../context';
import {RepPageHeader} from '../RepPage';
import {customerFilter,withCustomer} from '../scope';
import {MarginVsFloor,QuestionsCard,TopItems} from './Breakdowns';
import {QueryAnalytics} from './QueryAnalytics';
import {StatCards} from './StatCards';
import {WeeklyChart} from './WeeklyChart';
import s from './Analytics.module.css';

// Analytics (spec §4, task 6.2): five stat cards, the weekly trend, margin vs floor, top items,
// questions answered without a rep, then the old query analytics. It covers the signed-in rep's
// customers, or every customer for the manager (task U1), and the page's own ?customer= filter
// (GET /api/rep/analytics?customer=; the server ignores a customer the rep can't read).

/** How often the numbers are re-read, so a quote sent or accepted elsewhere shows up without a reload. */
export const ANALYTICS_POLL_MS=15_000;

const leave=()=>window.location.assign('/');

async function loadAnalytics(customerId:string|null):Promise<RepAnalytics>{
  const response=await fetch(withCustomer('/api/rep/analytics',customerId),{cache:'no-store'});
  if(response.status===401||response.status===403){leave();throw new Error('Choose a demo workspace.');}
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(typeof body?.detail==='string'?body.detail:'Unable to load analytics. Try again in a moment.');
  return body as RepAnalytics;
}

/** The analytics for the filtered customer. While another customer's numbers load, the last ones stay up, dimmed. */
function useRepAnalytics(customerId:string|null){
  const load=useCallback(()=>loadAnalytics(customerId),[customerId]);
  const {data,error}=usePoll(load,ANALYTICS_POLL_MS);
  const [shown,setShown]=useState<RepAnalytics|null>(null);
  useEffect(()=>{if(data)setShown(data);},[data]);
  return {data:data??shown,stale:!data&&shown!==null,error};
}

export function AnalyticsPage(){
  const {rep}=useRepPortal();
  const customerId=customerFilter(useSearchParams());
  const {data,stale,error}=useRepAnalytics(customerId);
  const customer=data?.scope.customer??null;
  const who=customer?customer.name:rep.manager?'all customers':'all your customers';
  return <>
    <RepPageHeader spaced title={rep.manager?'Analytics':'My Analytics'} description={`Quotes and customer questions for ${who}`}/>
    {error&&<p className="error" role="alert">{error}</p>}
    {!data?(error?null:<div className={s.loading} role="status">Loading analytics…</div>):
      <div className={s.body} data-stale={stale||undefined} aria-busy={stale}>
        <StatCards data={data}/>
        <WeeklyChart weeks={data.weekly}/>
        <div className={s.pair}>
          <MarginVsFloor margin={data.margin}/>
          <TopItems items={data.top_items}/>
        </div>
        <QuestionsCard questions={data.questions}/>
        <QueryAnalytics queries={data.queries} access={data.access} manageHref={withCustomer('/rep/settings?tab=access',customer?.id??null)}/>
      </div>}
  </>;
}
