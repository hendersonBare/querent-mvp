'use client';
import {useId} from 'react';
import Link from 'next/link';
import {DECLINE_REASON_LABELS} from '@/server/quotes';
import {DECLINE_BUCKETS,type DeclineBucket} from '@/server/team/metrics';
import type {TeamMetrics} from '@/server/team/service';
import {formatPercent} from '../analytics/format';
import {drillHref} from './window';
import s from './Team.module.css';

// Decline reasons (v3 spec §6 Team, §7; decisions 14, 24; task D3): how many declined quotes gave
// each reason (no reason counted apart), with each rep's share, and the Other notes in the
// customer's words, each linked to its quote. Rep-only: never shown to a customer.

const LABELS:Record<DeclineBucket,string>={...DECLINE_REASON_LABELS,none:'No reason given'};
const noteDay=(iso:string|null)=>iso?new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'';

export function DeclineReasons({data}:{data:TeamMetrics}){
  const id=useId();
  const {totals,rows,window,selected,other_notes:notes}=data;
  const declined=totals.statuses.declined;
  return <section className={s.panel} aria-labelledby={id}>
    <div className={s.panelHead}>
      <h2 id={id} className={s.panelTitle}>Decline reasons</h2>
      <p className={s.panelSummary}>{declined?<><Link href={drillHref(window,selected.rep_ids,{status:'declined'})} prefetch={false}>{declined} declined {declined===1?'quote':'quotes'}</Link> in the window. Expired quotes are counted apart.</>:'No quotes declined in the window.'}</p>
    </div>
    {declined>0&&<div className={s.declineGrid}>
      <div className={s.tableScroll}>
        <table className={s.table}>
          <caption className={s.srOnly}>Declined quotes per reason and rep</caption>
          <thead><tr><th scope="col">Reason</th><th scope="col">Quotes</th><th scope="col">Share</th>{rows.length>1&&rows.map(r=><th key={r.rep_id} scope="col">{r.name}</th>)}</tr></thead>
          <tbody>
            {DECLINE_BUCKETS.map(b=><tr key={b} data-empty={totals.declines[b]===0||undefined}>
              <th scope="row">{LABELS[b]}</th>
              <td>{totals.declines[b]}</td>
              <td>{formatPercent(totals.declines[b]/declined)}</td>
              {rows.length>1&&rows.map(r=><td key={r.rep_id}>{r.declines[b]}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className={s.notes}>
        <h3 className={s.notesTitle}>Other, in the customer’s words</h3>
        {notes.length?<ul className={s.noteList} aria-label="Other reasons in their words">
          {notes.map(n=><li key={n.quote_id}>
            <q className={s.noteText}>{n.note}</q>
            <span className={s.noteMeta}><Link href={`/rep/quotes/${encodeURIComponent(n.quote_number)}`} prefetch={false}>{n.quote_number}</Link>, {n.rep_name}{n.declined_at&&<>, {noteDay(n.declined_at)}</>}</span>
          </li>)}
        </ul>:<p className={s.emptyNote}>No customer chose Other.</p>}
      </div>
    </div>}
  </section>;
}
