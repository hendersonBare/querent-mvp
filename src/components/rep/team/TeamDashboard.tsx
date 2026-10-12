'use client';
import {useEffect,useMemo,useState} from 'react';
import {Download} from 'lucide-react';
import type {TeamMetrics} from '@/server/team/service';
import {RepPageHeader} from '../RepPage';
import {DeclineReasons} from './DeclineReasons';
import {Leaderboard} from './Leaderboard';
import {TeamFilters,type RangeChoice} from './TeamFilters';
import {UntouchedTable} from './UntouchedTable';
import {customWindow,metricsQuery,presetWindow,type TeamWindow} from './window';
import s from './Team.module.css';

// The Team dashboard (v3 spec §6 Team, §7; decisions 23–25; task D3), the manager's alone: pick
// reps (any set, to compare or group them), a team label and a window (7 / 30 / 90 days or a custom
// range, in the browser's time zone), then read the leaderboard with its totals row, the decline
// reasons with the Other text, and why quotes went untouched. Every count drills into the manager's
// Quotes list. Export CSV downloads the same rows. Not in the mockup: built like Analytics.

export interface TeamRepOption {id:string;name:string;team:string|null;active:boolean}

const leave=()=>window.location.assign('/');

async function loadMetrics(query:string,signal:AbortSignal):Promise<TeamMetrics>{
  const response=await fetch(`/api/rep/team/metrics?${query}`,{cache:'no-store',signal});
  if(response.status===401||response.status===403){leave();throw new Error('Choose a demo workspace.');}
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(typeof body?.detail==='string'?body.detail:'Unable to load the team’s numbers. Try again in a moment.');
  return body as TeamMetrics;
}

const longDay=(iso:string,dayBefore=false)=>new Date(Date.parse(iso)-(dayBefore?1:0)).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});

/** The dashboard. `reps` is every rep by name (inactive ones too, for history); `teams` the labels in use. */
export function TeamDashboard({reps,teams}:{reps:TeamRepOption[];teams:string[]}){
  const [picked,setPicked]=useState<ReadonlySet<string>>(()=>new Set(reps.filter(r=>r.active).map(r=>r.id)));
  const [team,setTeam]=useState<string|null>(null);
  const [range,setRange]=useState<RangeChoice>({kind:'preset',days:30});
  // Today is the browser's: read after mount, so the server's clock and time zone never pick the window.
  const [today,setToday]=useState<Date|null>(null);
  useEffect(()=>{setToday(new Date());},[]);

  const shownReps=useMemo(()=>reps.filter(r=>!team||r.team===team),[reps,team]);
  const repIds=useMemo(()=>shownReps.filter(r=>picked.has(r.id)).map(r=>r.id),[shownReps,picked]);
  const windowChoice=useMemo(():{window:TeamWindow|null;problem:string}=>{
    if(!today)return {window:null,problem:''};
    if(range.kind==='preset')return {window:presetWindow(range.days,today),problem:''};
    const custom=customWindow(range.start,range.end);
    return custom.ok?{window:custom.window,problem:''}:{window:null,problem:custom.problem};
  },[today,range]);
  const query=windowChoice.window&&repIds.length?metricsQuery(windowChoice.window,repIds,team):null;

  const [data,setData]=useState<TeamMetrics|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  useEffect(()=>{
    if(!query)return;
    const controller=new AbortController();
    setLoading(true);
    loadMetrics(query,controller.signal).then(body=>{setData(body);setError('');},(e:unknown)=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:String(e));})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[query]);

  const shown=query?data:null;
  const window=shown?.window??null;
  return <>
    <RepPageHeader spaced title="Teams and Reps"
      description={window?<>Quotes created {longDay(window.from)} to {longDay(window.to,true)}, counted under the rep who owns them now</>:'Quotes created in the window, counted under the rep who owns them now'}
      actions={query&&<a className={s.export} href={`/api/rep/team/metrics.csv?${query}`} download><Download aria-hidden="true" size={15} strokeWidth={1.8}/>Export CSV</a>}/>
    <TeamFilters reps={shownReps} teams={teams} picked={picked} onPick={setPicked} team={team} onTeam={setTeam}
      range={range} onRange={setRange} today={today} problem={windowChoice.problem} allActive={()=>setPicked(new Set(reps.filter(r=>r.active).map(r=>r.id)))}/>
    {!repIds.length&&<p className={s.notice} role="status">Tick at least one rep to compare.</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    {query&&!shown&&!error&&<div className={s.loading} role="status">Loading the team’s numbers…</div>}
    {shown&&<div className={s.body} data-stale={loading||undefined} aria-busy={loading}>
      <Leaderboard data={shown}/>
      <DeclineReasons data={shown}/>
      <UntouchedTable data={shown}/>
    </div>}
  </>;
}
