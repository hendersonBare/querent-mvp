'use client';
import {useId,type ReactNode} from 'react';
import type {RepAnalytics} from '@/server/analytics';
import {formatCount,formatDuration,formatGpAmount,formatHours,formatMoney,formatMoneyFigure,formatPercent,plural} from './format';
import {InfoTip} from './InfoTip';
import s from './Analytics.module.css';

// The five large stat cards (spec §4), in the spec's order. Each number has an "i" that says how
// it is calculated, with this view's own figures in the explanation.

function StatCard({label,topic,info,value,unit,tone,children}:{
  label:string;topic:string;info:ReactNode;value:string;unit?:string;
  /** 'gain': the value is money Querent found, shown in Querent green. */
  tone?:'gain';
  children?:ReactNode;
}){
  const id=useId();
  return <section className={s.kpi} aria-labelledby={id}>
    <div className={s.kpiHead}><h2 id={id} className={s.kpiLabel}>{label}</h2><InfoTip topic={topic}>{info}</InfoTip></div>
    <p className={s.kpiValue} data-tone={tone}>{value}{unit&&<span className={s.kpiUnit}> {unit}</span>}</p>
    {children}
  </section>;
}

export function StatCards({data}:{data:RepAnalytics}){
  const {turnaround:t,win_rate:w,quoted:q,hours_saved:h,extra_gp:gp}=data;
  const decided=w.won+w.lost;
  return <div className={s.kpis}>
    <StatCard label="Median time to send" topic="median time to send" value={formatDuration(t.median_minutes)}
      info={t.quotes?<>The middle of the times from each customer request to the first time you sent the quote, over {plural(t.quotes,'sent quote')}: half went out faster. Fastest {formatDuration(t.fastest_minutes)}, slowest {formatDuration(t.slowest_minutes)}. Revisions after a change request don’t count.</>
        :<>The middle of the times from each customer request to the first time you sent the quote. No quote has been sent yet.</>}>
      <p className={s.kpiContext}>{t.quotes?`From request to first send, ${plural(t.quotes,'quote')}`:'No quotes sent yet'}</p>
    </StatCard>

    <StatCard label="Win rate" topic="win rate" value={formatPercent(w.rate)}
      info={<>Accepted quotes divided by decided quotes{decided?<>: {w.won} of {decided}</>:null}. A quote is decided when the customer accepts it or it expires unanswered, and a sent quote past its valid-until date counts as lost. {w.open?<>{plural(w.open,'quote')} still waiting on you or the customer {w.open===1?'doesn’t':'don’t'} count yet.</>:null}</>}>
      <p className={s.kpiContext}>{decided?`${w.won} won, ${w.lost} lost${w.open?`, ${w.open} open`:''}`:w.open?`${plural(w.open,'quote')} open, none decided yet`:'No quotes decided yet'}</p>
    </StatCard>

    <StatCard label="Quoted vs accepted" topic="dollars quoted and accepted" value={formatMoneyFigure(q.quoted)} unit="quoted"
      info={<>Quoted: the total of the last revision sent (items and freight, before tax) for each of {plural(q.quoted_count,'sent quote')}, {formatMoney(q.quoted)}. Accepted: the same total for the {plural(q.accepted_count,'quote')} customers accepted, {formatMoney(q.accepted)}{q.share!==null?<>, {formatPercent(q.share)} of the dollars quoted</>:null}.</>}>
      <p className={s.kpiContext}>{q.quoted_count?`${formatMoneyFigure(q.accepted)} accepted, ${formatPercent(q.share)}`:'No quotes sent yet'}</p>
      {q.share!==null&&<span className={s.meter} aria-hidden="true"><span style={{width:`${Math.min(100,q.share*100)}%`}}/></span>}
    </StatCard>

    <StatCard label="Hours saved" topic="hours saved" value={formatHours(h.hours)} unit={h.hours===1?'hour':'hours'}
      info={<>A fixed {h.minutes_per_quote} minutes of rep time for each quote sent (matching items, checking stock, pricing and writing it up), times {plural(h.quotes_sent,'quote')} sent: {formatCount(h.minutes)} minutes. Each quote counts once, however many revisions it took.</>}>
      <p className={s.kpiContext}>{h.quotes_sent?`${h.minutes_per_quote} min for each of ${plural(h.quotes_sent,'quote')} sent`:'No quotes sent yet'}</p>
    </StatCard>

    <StatCard label="Extra GP Querent found" topic="extra GP Querent found" value={formatGpAmount(gp.amount)} tone={gp.amount>0?'gain':undefined}
      info={<>On accepted quotes, the lines where Querent suggested more than the customer price because of a fact (a higher last-paid price, a broken case or low stock) and you kept that price: quantity times (final price minus customer price). Contract lines, and prices you set yourself, don’t count.{gp.accepted_quotes?<> Found on {plural(gp.lines,'line')} across {gp.quotes} of {plural(gp.accepted_quotes,'accepted quote')}.</>:null}</>}>
      <p className={s.kpiContext}>{gp.accepted_quotes?`${plural(gp.lines,'line')} you kept, on ${plural(gp.quotes,'accepted quote')}`:'No accepted quotes yet'}</p>
    </StatCard>
  </div>;
}
