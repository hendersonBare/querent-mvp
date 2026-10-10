'use client';
import type {ReactNode} from 'react';
import Link from 'next/link';
import {Clock,TriangleAlert} from 'lucide-react';
import type {QuoteStatus} from '@/domain';
import {formatMargin} from '@/server/floors';
import type {AgingLevel} from '@/server/quotes';
import type {TeamRow} from '@/server/team/metrics';
import type {TeamMetrics} from '@/server/team/service';
import {formatDuration,formatMoneyFigure,formatPercent} from '../analytics/format';
import {drillHref,type TeamWindow} from './window';
import s from './Team.module.css';

// The leaderboard (v3 spec §6 Team, §7; decisions 23, 24; task D3): one row per selected rep plus
// a totals row, a column per metric. Each count links to the All reps Quotes list filtered to
// exactly those quotes (the rep or the group, the window, the status or aging level); each rep's
// name opens all their cohort quotes. The table scrolls inside its own box on a narrow screen.

const hours=(h:number|null)=>formatDuration(h===null?null:h*60);
const money=(cents:number)=>formatMoneyFigure(cents/100);

/** A count with its word for screen readers ("2 created"), linked to its quotes when there are any. */
function Count({n,word,href}:{n:number;word:string;href:string}){
  const text=<>{n}<span className={s.srOnly}> {word}</span></>;
  return n>0?<Link href={href} prefetch={false}>{text}</Link>:<span className={s.zero}>{text}</span>;
}

const COLUMNS:{key:string;label:ReactNode;title?:string}[]=[
  {key:'created',label:'Created'},
  {key:'open',label:'Open',title:'Open quotes by aging: on time, aging (amber), overdue (red)'},
  {key:'ready_for_review',label:'Draft ready'},{key:'changes_requested',label:'Changes req.'},{key:'sent',label:'Sent'},
  {key:'accepted',label:'Accepted'},{key:'declined',label:'Declined'},{key:'expired',label:'Expired'},
  {key:'q2o',label:'Quote-to-order',title:'Accepted ÷ created (until accepted quotes create orders)'},
  {key:'unaccepted',label:'Unaccepted',title:'(Declined + expired) ÷ created'},
  {key:'win',label:'Decided win rate',title:'Accepted ÷ (accepted + declined + expired)'},
  {key:'to_send',label:'Time to send',title:'Mean time from creation to the first send'},
  {key:'response',label:'Customer response',title:'Mean time from each send to the customer’s answer'},
  {key:'in_draft',label:'In draft ready',title:'Mean time per visit'},{key:'in_sent',label:'In sent',title:'Mean time per visit'},
  {key:'in_changes',label:'In changes req.',title:'Mean time per visit'},
  {key:'quoted',label:'Quoted value'},{key:'accepted_value',label:'Accepted value'},
  {key:'margin',label:'Avg quoted margin',title:'Mean margin of the priced quotes, before freight recovery'},
  {key:'freight',label:'Freight recovered',title:'Recovered on accepted quotes, of the modelled cost of accepted deliveries'},
  {key:'suggestions',label:'Suggestions taken',title:'Pop-up suggestions the customer added ÷ suggestions offered'},
  {key:'upsells',label:'Rep upsell lines'},
];

const STATUS_WORDS:Record<QuoteStatus,string>={ready_for_review:'draft ready',changes_requested:'changes requested',sent:'sent',accepted:'accepted',declined:'declined',expired:'expired'};
const STATUS_COLUMNS:QuoteStatus[]=['ready_for_review','changes_requested','sent','accepted','declined','expired'];

function OpenSplit({row,link}:{row:TeamRow;link:(more?:{aging?:AgingLevel})=>string}){
  return <span className={s.split}>
    <span className={s.splitItem}><Count n={row.open.ok} word="on time" href={link({aging:'ok'})}/><span className={s.splitWord} aria-hidden="true">ok</span></span>
    <span className={s.splitItem} data-level="amber"><Clock aria-hidden="true" size={12} strokeWidth={2.2}/><Count n={row.open.amber} word="aging" href={link({aging:'amber'})}/></span>
    <span className={s.splitItem} data-level="red"><TriangleAlert aria-hidden="true" size={12} strokeWidth={2.2}/><Count n={row.open.red} word="overdue" href={link({aging:'red'})}/></span>
  </span>;
}

function Row({row,window,repIds}:{row:TeamRow;window:TeamWindow;repIds:string[]}){
  const ids=row.rep_id?[row.rep_id]:repIds;
  const link=(more:{status?:QuoteStatus;aging?:AgingLevel}={})=>drillHref(window,ids,more);
  const {suggestions_added:added,suggestions_offered:offered}=row.upsell;
  return <tr role="row" data-totals={row.rep_id===null||undefined}>
    <th role="rowheader" scope="row"><Link href={link()} prefetch={false}>{row.name}</Link></th>
    <td role="cell"><Count n={row.created} word="created" href={link()}/></td>
    <td role="cell" className={s.openCell}><OpenSplit row={row} link={link}/></td>
    {STATUS_COLUMNS.map(status=><td key={status} role="cell"><Count n={row.statuses[status]} word={STATUS_WORDS[status]} href={link({status})}/></td>)}
    <td role="cell">{formatPercent(row.rates.quote_to_order)}</td>
    <td role="cell">{formatPercent(row.rates.unaccepted)}</td>
    <td role="cell">{formatPercent(row.rates.decided_win)}</td>
    <td role="cell">{hours(row.hours.to_send)}</td>
    <td role="cell">{hours(row.hours.customer_response)}</td>
    <td role="cell">{hours(row.hours.ready_for_review)}</td>
    <td role="cell">{hours(row.hours.sent)}</td>
    <td role="cell">{hours(row.hours.changes_requested)}</td>
    <td role="cell">{money(row.value.quoted_cents)}</td>
    <td role="cell">{money(row.value.accepted_cents)}</td>
    <td role="cell">{formatMargin(row.avg_margin)}</td>
    <td role="cell">{money(row.freight.recovered_cents)}<span className={s.sub}> of {money(row.freight.modelled_cents)}</span></td>
    <td role="cell">{formatPercent(row.upsell.suggestion_rate)}{offered>0&&<span className={s.sub}> {added} of {offered}</span>}</td>
    <td role="cell">{row.upsell.rep_upsell_lines}</td>
  </tr>;
}

export function Leaderboard({data}:{data:TeamMetrics}){
  return <div className={s.panel}>
    <div className={s.panelHead}>
      <h2 className={s.panelTitle}>Leaderboard</h2>
      <p className={s.panelSummary}>Rates use the quotes created in the window. Open quotes are shown on their own. Pick a count to see its quotes.</p>
    </div>
    <div className={s.tableScroll} role="region" aria-label="Leaderboard" tabIndex={0}>
      <table className={s.table} role="table">
        <caption className={s.srOnly}>Leaderboard: one row per selected rep, then the totals</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader" scope="col">Rep</th>
            {COLUMNS.map(c=><th key={c.key} role="columnheader" scope="col" title={c.title} className={c.key==='open'?s.openCell:undefined}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {data.rows.map(row=><Row key={row.rep_id} row={row} window={data.window} repIds={data.selected.rep_ids}/>)}
          <Row row={data.totals} window={data.window} repIds={data.selected.rep_ids}/>
        </tbody>
      </table>
    </div>
  </div>;
}
