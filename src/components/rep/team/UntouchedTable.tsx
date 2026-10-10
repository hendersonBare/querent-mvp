'use client';
import {useId} from 'react';
import {UNTOUCHED_REASONS,type TeamRow} from '@/server/team/metrics';
import type {TeamMetrics} from '@/server/team/service';
import s from './Team.module.css';

// Why quotes went untouched (v3 spec §7.3; decision 25; OA-15; task D3): counts per reason per rep,
// inferred from the quote's events and clocks, never typed by a rep. Reasons 1–5 count open quotes
// that are aging or overdue; the last counts every expired quote.

export function UntouchedTable({data}:{data:TeamMetrics}){
  const id=useId();
  const line=(row:TeamRow)=><tr key={row.rep_id??'total'} data-totals={row.rep_id===null||undefined}>
    <th scope="row">{row.name}</th>
    {UNTOUCHED_REASONS.map(r=><td key={r.id} data-zero={row.untouched[r.id]===0||undefined}>{row.untouched[r.id]}</td>)}
  </tr>;
  return <section className={s.panel} aria-labelledby={id}>
    <div className={s.panelHead}>
      <h2 id={id} className={s.panelTitle}>Why quotes went untouched</h2>
      <p className={s.panelSummary}>Read from what happened to each quote, never typed by a rep. Open quotes count once they are aging or overdue.</p>
    </div>
    <div className={s.tableScroll}>
      <table className={s.table}>
        <caption className={s.srOnly}>Why quotes went untouched, per rep</caption>
        <thead><tr><th scope="col">Rep</th>{UNTOUCHED_REASONS.map(r=><th key={r.id} scope="col">{r.label}</th>)}</tr></thead>
        <tbody>{data.rows.map(line)}{line(data.totals)}</tbody>
      </table>
    </div>
  </section>;
}
