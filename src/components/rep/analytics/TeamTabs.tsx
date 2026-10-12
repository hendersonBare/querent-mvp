'use client';
import type {CSSProperties,ReactNode} from 'react';
import Link from 'next/link';
import type {QuoteStatus} from '@/domain';
import {formatMargin} from '@/server/floors';
import {DECLINE_REASON_LABELS,type AgingLevel} from '@/server/quotes';
import {DECLINE_BUCKETS,UNTOUCHED_REASONS,type DeclineBucket,type GroupMetricRows,type GroupRow,type TeamRow} from '@/server/team/metrics';
import type {TablePrefs} from '@/components/ui/table-prefs';
import {formatDuration,formatMoneyFigure,formatPercent,formatShortDays,plural} from './format';
import {GridTable,columnId,type GridColumn} from './GridTable';
import {BarSegments,Card,Count} from './parts';
import {drillHref,windowLabel,type TeamWindow} from './window';
import s from './Analytics.module.css';

// The old Team dashboard (v3 spec §7; decisions 23 to 25), moved into Analytics tabs (plan U6): the Rep
// leaderboard (C_AN6), Decline reasons (C_AN7, C_RAN3) and Untouched quotes (C_AN8, C_RAN4). One row per
// rep, team or customer (the filter's breakdown) and the totals, over the quotes created in the window.
// The metric definitions are the server's (src/server/team/metrics.ts), unchanged.

/** A row of the table: a group, or the totals (its key is "total"). */
type Line=TeamRow&{key:string;rep_ids:string[];customer_id:string|null};
const NAME={rep:'Rep',team:'Team',customer:'Customer'} as const;

/** The rows and the totals row, each with the reps and customer its counts drill into. */
function lines(groups:GroupMetricRows):{rows:Line[];total:Line}{
  const reps=[...new Set(groups.rows.flatMap(r=>r.rep_ids))];
  const customer=groups.rows.length===1?groups.rows[0].customer_id:null;
  return {rows:groups.rows,total:{...groups.totals,key:'total',rep_ids:reps,customer_id:groups.dimension==='customer'?customer:null}};
}

const hours=(h:number|null)=>formatDuration(h===null?null:h*60);
const figure=(text:ReactNode)=><span className={s.figure}>{text}</span>;

// ---- Rep leaderboard (C_AN6) ----

export type PeriodChoice='7'|'30'|'90'|'custom';
export const PERIOD_OPTIONS:readonly {value:PeriodChoice;label:string}[]=[{value:'7',label:'7 days'},{value:'30',label:'30 days'},{value:'90',label:'90 days'},{value:'custom',label:'Custom'}];

const STATUS_WORDS:Record<QuoteStatus,string>={ready_for_review:'draft ready',changes_requested:'changes requested',sent:'sent',accepted:'accepted',declined:'declined',expired:'expired'};

function boardColumns(name:string,window:TeamWindow):GridColumn<Line>[]{
  const link=(row:Line,more:{status?:QuoteStatus;aging?:AgingLevel}={})=>drillHref(window,row.rep_ids,{...more,customer:row.customer_id});
  const count=(id:string,label:string,track:string,n:(r:Line)=>number,word:string,more:{status?:QuoteStatus;aging?:AgingLevel}={},red=false):GridColumn<Line>=>
    ({id,label,track,align:'right',render:r=><Count n={n(r)} word={word} href={link(r,more)} red={red}/>});
  return [
    {id:'name',label:name,track:'170px',align:'left',header:true,alwaysShown:true,render:r=><span className={s.strong}>{r.name}</span>},
    count('created','Created','80px',r=>r.created,'created'),
    count('ok','Ok','56px',r=>r.open.ok,'on time',{aging:'ok'}),
    count('aging','Aging','64px',r=>r.open.amber,'aging',{aging:'amber'}),
    count('overdue','Overdue','78px',r=>r.open.red,'overdue',{aging:'red'},true),
    ...(['ready_for_review','changes_requested','sent','accepted','declined','expired'] as const).map((status,i)=>
      count(status.replace(/_/g,'-'),['Draft ready','Changes req.','Sent','Accepted','Declined','Expired'][i],['100px','110px','70px','100px','90px','90px'][i],r=>r.statuses[status],STATUS_WORDS[status],{status})),
    {id:'quote-to-order',label:'Quote-to-order',track:'130px',align:'right',render:r=>figure(formatPercent(r.rates.quote_to_order))},
    {id:'unaccepted',label:'Unaccepted',track:'110px',align:'right',render:r=>figure(formatPercent(r.rates.unaccepted))},
    {id:'decided-win',label:'Decided win rate',track:'150px',align:'right',render:r=>figure(formatPercent(r.rates.decided_win))},
    {id:'to-send',label:'Time to send',track:'130px',align:'right',render:r=>figure(hours(r.hours.to_send))},
    {id:'response',label:'Customer response',track:'160px',align:'right',render:r=>figure(hours(r.hours.customer_response))},
    {id:'in-draft',label:'In draft ready',track:'130px',align:'right',render:r=>figure(hours(r.hours.ready_for_review))},
    {id:'in-sent',label:'In sent',track:'90px',align:'right',render:r=>figure(formatShortDays(r.hours.sent===null?null:r.hours.sent*60))},
    // The rest of the old dashboard's columns (decision 24), in the columns picker: C_AN6 draws the ones above.
    {id:'in-changes',label:'In changes req.',track:'130px',align:'right',hiddenByDefault:true,render:r=>figure(hours(r.hours.changes_requested))},
    {id:'quoted',label:'Quoted value',track:'120px',align:'right',hiddenByDefault:true,render:r=>figure(formatMoneyFigure(r.value.quoted_cents/100))},
    {id:'accepted-value',label:'Accepted value',track:'130px',align:'right',hiddenByDefault:true,render:r=>figure(formatMoneyFigure(r.value.accepted_cents/100))},
    {id:'margin',label:'Avg quoted margin',track:'150px',align:'right',hiddenByDefault:true,render:r=>figure(formatMargin(r.avg_margin))},
    {id:'freight',label:'Freight recovered',track:'190px',align:'right',hiddenByDefault:true,render:r=>figure(`${formatMoneyFigure(r.freight.recovered_cents/100)} of ${formatMoneyFigure(r.freight.modelled_cents/100)}`)},
    {id:'suggestions',label:'Suggestions taken',track:'150px',align:'right',hiddenByDefault:true,render:r=>figure(formatPercent(r.upsell.suggestion_rate))},
    {id:'upsells',label:'Rep upsell lines',track:'140px',align:'right',hiddenByDefault:true,render:r=>figure(r.upsell.rep_upsell_lines)},
  ];
}
const OPEN_IDS=['ok','aging','overdue'];

export function Leaderboard({groups,window,period,onPeriod,custom,prefs}:{
  groups:GroupMetricRows;window:TeamWindow;period:PeriodChoice;onPeriod:(choice:PeriodChoice)=>void;
  /** The custom range's two days (no frame), shown while Custom is picked. */
  custom?:ReactNode;prefs?:TablePrefs|null;
}){
  const {rows,total}=lines(groups);
  // "Open" over Ok, Aging and Overdue (C_AN6), while those three stand together.
  const above=(grid:CSSProperties,visible:string[])=>{
    const at=visible.indexOf('ok');
    const together=at>=0&&OPEN_IDS.every((id,i)=>visible[at+i]===id);
    return <div className={s.groupHead} style={grid} aria-hidden="true">{together&&<div className={s.groupLabel} style={{gridColumn:`${at+1} / span 3`}}>Open</div>}</div>;
  };
  return <Card title="Leaderboard" note={<span className={s.barNote}>Quotes created {windowLabel(window)}, counted under the rep who owns them now</span>}
    right={<span className={s.barRight}><BarSegments label="Created" options={PERIOD_OPTIONS} value={period} onChange={onPeriod}/></span>}>
    <div className={s.boardNote}>Rates use the quotes created in the window. Open quotes are shown on their own. Pick a count to see its quotes.</div>
    {custom}
    <GridTable tableId="analytics-leaderboard" label="Leaderboard" columns={boardColumns(NAME[groups.dimension],window)} rows={rows} rowKey={r=>r.key} gap={16} picker
      wrapClass={s.scrollX} style={{minWidth:2280}} headClass={s.boardHead} above={above} rowClass={()=>`${s.centered} ${s.boardRow}`}
      after={[total]} afterClass={()=>`${s.centered} ${s.totalRow}`} initialPrefs={prefs}/>
  </Card>;
}

// ---- Decline reasons (C_AN7, C_RAN3) ----

const DECLINE_LABELS:Record<DeclineBucket,string>={...DECLINE_REASON_LABELS,none:'No reason given'};
const noteDay=(iso:string|null)=>iso?new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'';

/** A row of the decline table: a reason, its count, and each group's count. */
interface ReasonRow {bucket:DeclineBucket;total:number;byGroup:Record<string,number>}

export function DeclineReasons({groups,window,manager,prefs}:{groups:GroupMetricRows;window:TeamWindow;manager:boolean;prefs?:TablePrefs|null}){
  const {rows,total}=lines(groups);
  const declined=total.statuses.declined;
  const reasons:ReasonRow[]=DECLINE_BUCKETS.map(bucket=>({bucket,total:total.declines[bucket],byGroup:Object.fromEntries(rows.map(r=>[r.key,r.declines[bucket]]))}));
  // A column per rep, team or customer for the manager (C_AN7); a rep's own table has none (C_RAN3).
  const columns:GridColumn<ReasonRow>[]=[
    {id:'reason',label:'Reason',track:'2fr',header:true,alwaysShown:true,cellClass:s.bold,render:r=>DECLINE_LABELS[r.bucket]},
    {id:'quotes',label:'Quotes',track:'0.8fr',align:'right',render:r=><Count n={r.total}/>},
    {id:'share',label:'Share',track:'0.8fr',align:'right',render:r=>formatPercent(declined?r.total/declined:null)},
    ...(manager?rows.map((g,i):GridColumn<ReasonRow>=>({id:columnId(g.key),label:g.name,track:i===0?'1.1fr':'1fr',align:'right',render:r=><Count n={r.byGroup[g.key]}/>})):[]),
  ];
  const count=plural(declined,'declined quote');
  return <Card title="Decline reasons" note={<span className={s.barNote}>
    {declined?<Link className={s.barStrong} href={drillHref(window,total.rep_ids,{status:'declined',customer:total.customer_id})} prefetch={false}>{count}</Link>:<span className={s.barStrong}>{count}</span>} in the window. Expired quotes are counted apart.
  </span>}>
    <div className={s.declineBody}>
      <GridTable tableId="analytics-declines" label="Decline reasons" columns={columns} rows={reasons} rowKey={r=>r.bucket} gap={14} wrapClass={s.declineTable} className={s.boxed} initialPrefs={prefs}/>
      <div className={s.notes}>
        <div id="decline-notes" className={s.strong}>Other, in the customer&apos;s words</div>
        {groups.other_notes.length?<ul className={s.noteList} aria-labelledby="decline-notes">
          {groups.other_notes.map(n=><li key={n.quote_id} className={s.note}>
            <div className={s.noteText}>&quot;{n.note}&quot;</div>
            <div className={s.noteMeta}><Link className={s.quoteLink} href={`/rep/quotes/${encodeURIComponent(n.quote_number)}`} prefetch={false}>{n.quote_number}</Link>, {manager?n.rep_name:n.customer_name}{n.declined_at?`, ${noteDay(n.declined_at)}`:''}</div>
          </li>)}
        </ul>:<div className={s.noteMeta}>No customer chose Other.</div>}
      </div>
    </div>
  </Card>;
}

// ---- Untouched quotes (C_AN8, C_RAN4) ----

const UNTOUCHED_TRACKS=['1fr','1.2fr','1.4fr','1.1fr','1.3fr','1.2fr'];

export function UntouchedTable({groups,manager,prefs}:{groups:GroupMetricRows;manager:boolean;prefs?:TablePrefs|null}){
  const {rows,total}=lines(groups);
  const columns:GridColumn<Line>[]=[
    {id:'name',label:manager?NAME[groups.dimension]:'Whose quotes',track:'1.4fr',align:'left',header:true,alwaysShown:true,cellClass:s.strong,render:r=>manager?r.name:'Your quotes'},
    ...UNTOUCHED_REASONS.map(({id,label},i):GridColumn<Line>=>({id:id.replace(/_/g,'-'),label,track:UNTOUCHED_TRACKS[i],align:'right',render:r=><Count n={r.untouched[id]}/>})),
  ];
  // C_AN8's totals row is plain text, its first cell not aligned.
  const totals:GridColumn<Line>[]=[{...columns[0],align:undefined,cellClass:undefined,render:r=>r.name},...UNTOUCHED_REASONS.map(({id}):GridColumn<Line>=>({...columns.find(c=>c.id===id.replace(/_/g,'-'))!,render:r=>r.untouched[id]}))];
  return <Card title="Why quotes went untouched">
    <div className={s.untouchedBody}>
      <div className={s.lede}>Read from what happened to each quote, never typed by a rep. Open quotes count once they are aging or overdue.</div>
      <GridTable tableId="analytics-untouched" label="Why quotes went untouched" columns={columns} rows={rows} rowKey={r=>r.key} gap={14} className={`${s.boxed} ${s.untouchedBox}`}
        after={manager?[total]:[]} afterClass={()=>`${s.totalRow} ${s.totalPad}`} afterColumns={totals} initialPrefs={prefs}/>
    </div>
  </Card>;
}

export type {GroupRow};
