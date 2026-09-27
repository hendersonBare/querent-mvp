'use client';
import {useCallback,useEffect,useState} from 'react';
import type {RepAnalytics} from '@/server/analytics';
import {usePoll} from '@/lib/use-poll';
import {useRepScope} from '../context';
import {RepPageHeader} from '../RepPage';
import {scopedHref} from '../scope';
import {MarginVsFloor,QuestionsCard,TopItems} from './Breakdowns';
import {QueryAnalytics} from './QueryAnalytics';
import {StatCards} from './StatCards';
import {WeeklyChart} from './WeeklyChart';
import s from './Analytics.module.css';

// Analytics (spec §4, task 6.2): five stat cards, the weekly trend, margin vs floor, top items,
// questions answered without a rep, then the old query analytics. It covers the signed-in rep's
// customers and follows the "Viewing" picker (GET /api/rep/analytics?customer=).

/** How often the numbers are re-read, so a quote sent or accepted elsewhere shows up without a reload. */
export const ANALYTICS_POLL_MS=15_000;

const leave=()=>window.location.assign('/');

async function loadAnalytics(customerId:string|null):Promise<RepAnalytics>{
  const response=await fetch(scopedHref('/api/rep/analytics',customerId),{cache:'no-store'});
  if(response.status===401||response.status===403){leave();throw new Error('Choose a demo workspace.');}
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(typeof body?.detail==='string'?body.detail:'Unable to load analytics. Try again in a moment.');
  return body as RepAnalytics;
}

/** The analytics for the picked customer. While another customer's numbers load, the last ones stay up, dimmed. */
function useRepAnalytics(customerId:string|null){
  const load=useCallback(()=>loadAnalytics(customerId),[customerId]);
  const {data,error}=usePoll(load,ANALYTICS_POLL_MS);
  const [shown,setShown]=useState<RepAnalytics|null>(null);
  useEffect(()=>{if(data)setShown(data);},[data]);
  return {data:data??shown,stale:!data&&shown!==null,error};
}

export function AnalyticsPage(){
  const scope=useRepScope();
  const {data,stale,error}=useRepAnalytics(scope.customerId);
  const who=scope.customer?scope.customer.name:'all your customers';
  return <>
    <RepPageHeader title="Analytics" description={`Quotes and customer questions for ${who}`}/>
    {error&&<p className="error" role="alert">{error}</p>}
    {!data?(error?null:<div className={s.loading} role="status">Loading analytics…</div>):
      <div className={s.body} data-stale={stale||undefined} aria-busy={stale}>
        {data.scope.other_rep&&data.scope.customer&&<p className={s.notice} role="note">
          {data.scope.customer.name} is {data.scope.customer.rep_name??'another rep'}’s customer. Analytics covers your own customers, so there’s nothing to count here.
        </p>}
        <StatCards data={data}/>
        <WeeklyChart weeks={data.weekly}/>
        <div className={s.pair}>
          <MarginVsFloor margin={data.margin}/>
          <TopItems items={data.top_items}/>
        </div>
        <QuestionsCard questions={data.questions}/>
        <QueryAnalytics queries={data.queries} access={data.access} manageHref={scope.href('/rep/settings?tab=access')}/>
      </div>}
  </>;
}
