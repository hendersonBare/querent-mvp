import type {QuoteStatus} from '@/domain';
import type {AgingLevel} from '@/server/quotes';
import {AGING_PARAM,STATUS_PARAM} from '../quotes/labels';
import type {Breakdown} from '@/server/team/metrics';
import {CUSTOMER_PARAM,FROM_PARAM,REP_PARAM,TO_PARAM} from '../scope';

// The Analytics window and links (plan U6; first the Team dashboard's: v3 spec §6 Team, §7; decisions
// 10, 23; OA-19; task D3). Pure. Days are the browser's: a window runs from local midnight to local midnight, and the
// API gets the two instants (it does no time-zone math). The presets count today: "7 days" is today
// and the six days before it.

export type TeamWindow={from:string;to:string};

/** The presets (decision 23). */
export const PRESET_DAYS=[7,30,90] as const;
export type PresetDays=typeof PRESET_DAYS[number];
/** The longest custom range the dashboard offers (the API allows a little more). */
export const MAX_CUSTOM_DAYS=366;

const DAY=/^(\d{4})-(\d{2})-(\d{2})$/;
/** Local midnight `days` after the local day of `date`. */
const midnight=(date:Date,days=0)=>new Date(date.getFullYear(),date.getMonth(),date.getDate()+days);

/** The last `days` days, today included: local midnight `days - 1` days ago to local midnight tonight. */
export function presetWindow(days:number,now=new Date()):TeamWindow{
  return {from:midnight(now,1-days).toISOString(),to:midnight(now,1).toISOString()};
}

/** A YYYY-MM-DD date input's local day, or null. */
function localDay(value:string){
  const m=DAY.exec(value);
  if(!m)return null;
  const date=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
  return date.getDate()===Number(m[3])?date:null;
}

/** A custom range, both days included: local midnight of `start` to local midnight after `end`; or why not. */
export function customWindow(start:string,end:string):{ok:true;window:TeamWindow}|{ok:false;problem:string}{
  const first=localDay(start),last=localDay(end);
  if(!first||!last)return {ok:false,problem:'Pick a start and an end date.'};
  if(last<first)return {ok:false,problem:'The end date must be on or after the start date.'};
  const days=Math.round((midnight(last,1).getTime()-first.getTime())/86_400_000);
  if(days>MAX_CUSTOM_DAYS)return {ok:false,problem:`Pick at most ${MAX_CUSTOM_DAYS} days.`};
  return {ok:true,window:{from:first.toISOString(),to:midnight(last,1).toISOString()}};
}

/** A local day as a date input's value (YYYY-MM-DD). */
export const dayInput=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

/** Where a count drills to: the Quotes list (every rep's for the manager, task U1) for these reps and the window, narrowed to a status, an aging level or a customer. */
export function drillHref(window:TeamWindow,repIds:readonly string[],{status,aging,customer}:{status?:QuoteStatus;aging?:AgingLevel;customer?:string|null}={}){
  const params=new URLSearchParams();
  if(repIds.length)params.set(REP_PARAM,repIds.join(','));
  params.set(FROM_PARAM,window.from);params.set(TO_PARAM,window.to);
  if(status)params.set(STATUS_PARAM,status);
  if(aging)params.set(AGING_PARAM,aging);
  if(customer)params.set(CUSTOMER_PARAM,customer);
  return `/rep/quotes?${params}`;
}

/** The Analytics filter (C_AN4, C_RAN2): reps and teams picked, a customer and the breakdown. */
export interface AnalyticsFilter {reps:string[];teams:string[];customer:string|null;breakdown:Breakdown}
export const NO_FILTER:AnalyticsFilter={reps:[],teams:[],customer:null,breakdown:'org'};

/** The query for GET /api/rep/analytics(/csv): the window, then only what is picked. */
export function analyticsQuery(filter:AnalyticsFilter,window:TeamWindow){
  const params=new URLSearchParams({from:window.from,to:window.to});
  if(filter.reps.length)params.set('reps',filter.reps.join(','));
  if(filter.teams.length)params.set('teams',filter.teams.join(','));
  if(filter.customer)params.set(CUSTOMER_PARAM,filter.customer);
  if(filter.breakdown!=='org')params.set('breakdown',filter.breakdown);
  return params.toString();
}

const LONG_DAY=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'});
/** "Sep 12, 2026 to Oct 11, 2026": the window's first and last local day (its end is the next midnight). */
export const windowLabel=(window:TeamWindow)=>`${LONG_DAY.format(new Date(window.from))} to ${LONG_DAY.format(new Date(Date.parse(window.to)-1))}`;
