'use client';
import {useId} from 'react';
import type {TeamRepOption} from './TeamDashboard';
import {PRESET_DAYS,dayInput,presetWindow,type PresetDays} from '../analytics/window';
import s from './Team.module.css';

// The Team dashboard's filters (v3 spec §6 Team; decision 23; task D3): tick any set of reps (to
// compare or group them), narrow to a team label, and pick 7 / 30 / 90 days or a custom range of
// days in the browser's time zone.

/** The window as picked: a preset, or a custom range of local days (YYYY-MM-DD, both included). */
export type RangeChoice={kind:'preset';days:PresetDays}|{kind:'custom';start:string;end:string};

export interface TeamFiltersProps {
  /** The reps to tick (the team's, when a team is picked). */
  reps:TeamRepOption[];teams:string[];
  picked:ReadonlySet<string>;onPick:(picked:ReadonlySet<string>)=>void;
  team:string|null;onTeam:(team:string|null)=>void;
  range:RangeChoice;onRange:(range:RangeChoice)=>void;
  /** The browser's today (null before mount): a custom range starts from the preset's days. */
  today:Date|null;
  /** Why the custom range can't be used, or ''. */
  problem:string;
  /** Ticks every active rep. */
  allActive:()=>void;
}

export function TeamFilters({reps,teams,picked,onPick,team,onTeam,range,onRange,today,problem,allActive}:TeamFiltersProps){
  const repsId=useId(),rangeId=useId(),problemId=useId();
  const toggle=(id:string)=>{const next=new Set(picked);if(!next.delete(id))next.add(id);onPick(next);};
  function custom(){
    if(range.kind==='custom')return;
    const now=today??new Date(),window=presetWindow(range.days,now);
    onRange({kind:'custom',start:dayInput(new Date(window.from)),end:dayInput(now)});
  }
  return <section className={s.filters} aria-label="Filters">
    <fieldset className={s.reps} aria-labelledby={repsId}>
      <div className={s.filterHead}>
        <span id={repsId} className={s.filterLabel}>Reps</span>
        <button type="button" className={s.linkButton} onClick={allActive}>All active reps</button>
        <button type="button" className={s.linkButton} onClick={()=>onPick(new Set())}>Clear reps</button>
      </div>
      <div className={s.repChips}>
        {reps.map(r=><label key={r.id} className={s.repChip} data-inactive={!r.active||undefined}>
          <input type="checkbox" checked={picked.has(r.id)} onChange={()=>toggle(r.id)}/>
          <span>{r.name}{!r.active&&<span className={s.inactive}> (inactive)</span>}</span>
        </label>)}
      </div>
    </fieldset>
    <div className={s.filterRow}>
      {teams.length>0&&<label className={s.select}>
        <span className={s.filterLabel}>Team</span>
        <select value={team??''} onChange={event=>onTeam(event.target.value||null)}>
          <option value="">All teams</option>
          {teams.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
      </label>}
      <div className={s.range} role="group" aria-labelledby={rangeId}>
        <span id={rangeId} className={s.filterLabel}>Created</span>
        <div className={s.segments}>
          {PRESET_DAYS.map(days=><button key={days} type="button" aria-pressed={range.kind==='preset'&&range.days===days} onClick={()=>onRange({kind:'preset',days})}>{days} days</button>)}
          <button type="button" aria-pressed={range.kind==='custom'} onClick={custom}>Custom</button>
        </div>
        {range.kind==='custom'&&<div className={s.dates}>
          <label>From<input type="date" value={range.start} aria-describedby={problem?problemId:undefined} onChange={event=>onRange({...range,start:event.target.value})}/></label>
          <label>To<input type="date" value={range.end} aria-describedby={problem?problemId:undefined} onChange={event=>onRange({...range,end:event.target.value})}/></label>
        </div>}
      </div>
    </div>
    {problem&&<p id={problemId} className={s.problem} role="alert">{problem}</p>}
  </section>;
}
