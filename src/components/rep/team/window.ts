import type {QuoteStatus} from '@/domain';
import type {AgingLevel} from '@/server/quotes';
import {AGING_PARAM,STATUS_PARAM} from '../quotes/labels';
import {ALL_REPS,FROM_PARAM,REPS_PARAM,REP_PARAM,TO_PARAM} from '../scope';

// The Team dashboard's date window and links (v3 spec §6 Team, §7; decisions 10, 23; OA-19; task
// D3). Pure. Days are the browser's: a window runs from local midnight to local midnight, and the
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

/** The query for GET /api/rep/team/metrics(.csv): the window, the ticked reps and the team label. */
export function metricsQuery(window:TeamWindow,repIds:readonly string[],team:string|null){
  const params=new URLSearchParams({from:window.from,to:window.to,reps:repIds.join(',')});
  if(team)params.set('team',team);
  return params.toString();
}

/** Where a count drills to: the All reps Quotes list for these reps and the window, narrowed to a status or an aging level. */
export function drillHref(window:TeamWindow,repIds:readonly string[],{status,aging}:{status?:QuoteStatus;aging?:AgingLevel}={}){
  const params=new URLSearchParams({[REPS_PARAM]:ALL_REPS});
  if(repIds.length)params.set(REP_PARAM,repIds.join(','));
  params.set(FROM_PARAM,window.from);params.set(TO_PARAM,window.to);
  if(status)params.set(STATUS_PARAM,status);
  if(aging)params.set(AGING_PARAM,aging);
  return `/rep/quotes?${params}`;
}
