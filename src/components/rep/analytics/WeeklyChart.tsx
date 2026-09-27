'use client';
import {useId,useState,type KeyboardEvent} from 'react';
import type {WeekPoint} from '@/server/analytics';
import {formatWeek,niceTicks,plural} from './format';
import {InfoTip} from './InfoTip';
import s from './Analytics.module.css';

// Weekly quotes and wins (spec §4): one stacked column per week, the quotes requested that week
// split into those since won (Querent green) and the rest, lost or still open (gray). Hover or
// arrow keys read a week out; "Show table" gives every value without the chart (dataviz: the
// gray is under 3:1 on white, so the table is its relief channel).

/** A week label under every 4th column, counting back from this week. */
const LABEL_EVERY=4;

export function WeeklyChart({weeks}:{weeks:WeekPoint[]}){
  const [active,setActive]=useState<number|null>(null);
  const [table,setTable]=useState(false);
  const headingId=useId();
  const n=weeks.length;
  const total=weeks.reduce((sum,w)=>sum+w.quotes,0),won=weeks.reduce((sum,w)=>sum+w.won,0);
  const ticks=niceTicks(Math.max(0,...weeks.map(w=>w.quotes)));
  const top=ticks.at(-1)!;
  const pct=(count:number)=>`${(count/top)*100}%`;

  function onKeyDown(event:KeyboardEvent){
    const moves:Record<string,(i:number)=>number>={ArrowLeft:i=>Math.max(0,i-1),ArrowRight:i=>Math.min(n-1,i+1),Home:()=>0,End:()=>n-1};
    const move=moves[event.key];
    if(!move)return;
    event.preventDefault();
    setActive(i=>move(i??n-1));
  }

  const week=active===null?null:weeks[active];
  return <section className={s.panel} aria-labelledby={headingId}>
    <div className={s.panelHead}>
      <div className={s.titleRow}>
        <h2 id={headingId} className={s.panelTitle}>Quotes and wins by week</h2>
        <InfoTip topic="the weekly trend">Each column is one week, Monday to Sunday, and counts the quotes customers requested that week. The green part is the ones they have since accepted; the gray part was lost or is still open. The last {n} weeks, ending this week.</InfoTip>
      </div>
      {total>0&&<div className={s.chartTools}>
        <ul className={s.legend} aria-label="Legend">
          <li><span className={s.keyWon} aria-hidden="true"/>Won</li>
          <li><span className={s.keyOther} aria-hidden="true"/>Lost or still open</li>
        </ul>
        <button type="button" className={s.toggle} aria-pressed={table} onClick={()=>setTable(t=>!t)}>Show table</button>
      </div>}
    </div>
    <p className={s.panelSummary}>{total?`${plural(total,'quote')} requested in the last ${n} weeks, ${won} won so far.`:`No quotes requested in the last ${n} weeks.`}</p>

    {total===0?<p className={s.emptyNote}>Quotes appear here as customers request them in Querent chat.</p>
      :table?<div className={s.tableScroll}>
        <table className={s.table}>
          <caption className={s.srOnly}>Quotes and wins by week, newest first</caption>
          <thead><tr><th scope="col">Week of</th><th scope="col">Requested</th><th scope="col">Won</th><th scope="col">Lost</th><th scope="col">Open</th></tr></thead>
          <tbody>{[...weeks].reverse().map(w=><tr key={w.week_start}><th scope="row">{formatWeek(w.week_start)}</th><td>{w.quotes}</td><td>{w.won}</td><td>{w.lost}</td><td>{w.open}</td></tr>)}</tbody>
        </table>
      </div>
      :<div className={s.plot}>
        <div className={s.yAxis} aria-hidden="true">{ticks.map(t=><span key={t} style={{bottom:pct(t)}}>{t}</span>)}</div>
        <div className={s.plotArea} tabIndex={0} role="group" aria-label="Weekly columns. Use the left and right arrow keys to read each week."
          onKeyDown={onKeyDown} onFocus={()=>setActive(i=>i??n-1)} onBlur={()=>setActive(null)} onPointerLeave={()=>setActive(null)}>
          {ticks.map(t=><span key={t} className={s.gridline} style={{bottom:pct(t)}} aria-hidden="true"/>)}
          <div className={s.columns} style={{gridTemplateColumns:`repeat(${n},minmax(0,1fr))`}} aria-hidden="true">
            {weeks.map((w,i)=><div key={w.week_start} className={s.column} data-active={i===active||undefined} onPointerEnter={()=>setActive(i)}>
              {w.quotes>0&&<span className={s.stack} style={{height:pct(w.quotes)}}>
                {w.quotes>w.won&&<span className={s.segOther} style={{flexGrow:w.quotes-w.won}}/>}
                {w.won>0&&<span className={s.segWon} style={{flexGrow:w.won}}/>}
              </span>}
            </div>)}
          </div>
          {/* Beside the column, never over it: right of it in the first half, left of it in the second. */}
          {week&&<div className={s.chartTip} role="status" data-side={active!<n/2?'right':'left'}
            style={active!<n/2?{left:`${((active!+1)/n)*100}%`}:{right:`${((n-active!)/n)*100}%`}}>
            <strong>{plural(week.quotes,'quote')}</strong>
            <span>{week.won} won, {week.lost} lost, {week.open} open</span>
            <span className={s.chartTipWeek}>Week of {formatWeek(week.week_start)}</span>
          </div>}
        </div>
        <div className={s.xAxis} style={{gridTemplateColumns:`repeat(${n},minmax(0,1fr))`}} aria-hidden="true">
          {weeks.map((w,i)=>{
            const step=n-1-i;
            return <span key={w.week_start} data-minor={step%(LABEL_EVERY*2)!==0||undefined}>{step%LABEL_EVERY===0?formatWeek(w.week_start):''}</span>;
          })}
        </div>
      </div>}
  </section>;
}
