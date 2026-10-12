'use client';
import {useId,useState,type ReactNode} from 'react';
import type {RequestedItem} from '@/domain';
import type {MarginVsFloor as MarginData,RepAnalytics,WeekPoint} from '@/server/analytics';
import {formatFloor,formatMargin} from '@/server/floors';
import type {TablePrefs} from '@/components/ui/table-prefs';
import {formatCount,formatDuration,formatGpAmount,formatHours,formatMoney,formatMoneyFigure,formatPercent,formatWeek,niceTicks,plural} from './format';
import {GridTable,type GridColumn} from './GridTable';
import {Card,InfoDot} from './parts';
import s from './Analytics.module.css';

// The Overview tab (C_ANBase, C_AN1 scrolled, C_AN3 table toggle; C_RAN1 for a rep): five stat cards,
// quotes and wins by week, average margin vs floor and top requested items (spec §4). The numbers are
// real data (Appendix G); the sentences are the frames' patterns, filled in.

function StatCard({label,topic,info,value,unit,tone,context,children}:{
  label:string;topic:string;info:ReactNode;value:string;unit?:string;tone?:'gain';context:string;children?:ReactNode;
}){
  const id=useId();
  return <div className={s.stat} role="region" aria-labelledby={id}>
    <div className={s.statHead}><span id={id} role="heading" aria-level={2} className={s.statLabel}>{label}</span><InfoDot topic={topic}>{info}</InfoDot></div>
    <div className={s.statValueRow}><span className={s.statValue} data-tone={tone}>{value}</span><span className={s.unit}>{unit}</span></div>
    <div className={s.statContext}>{context}</div>
    {children}
  </div>;
}

export function StatCards({data}:{data:RepAnalytics}){
  const {turnaround:t,win_rate:w,quoted:q,hours_saved:h,extra_gp:gp}=data;
  const decided=w.won+w.lost;
  return <section className={s.stats}>
    <StatCard label="Median time to send" topic="median time to send" value={formatDuration(t.median_minutes)}
      context={t.quotes?`From request to first send, ${plural(t.quotes,'quote')}`:'No quotes sent yet'}
      info={t.quotes?<>The middle of the times from each customer request to the first time the quote was sent, over {plural(t.quotes,'sent quote')}: half went out faster. Fastest {formatDuration(t.fastest_minutes)}, slowest {formatDuration(t.slowest_minutes)}. Revisions after a change request don’t count.</>
        :<>The middle of the times from each customer request to the first time the quote was sent. No quote has been sent yet.</>}/>
    <StatCard label="Win rate" topic="win rate" value={formatPercent(w.rate)}
      context={decided+w.open?`${w.won} won, ${w.lost} lost, ${w.open} open`:'No quotes decided yet'}
      info={<>Accepted quotes divided by decided quotes{decided?<>: {w.won} of {decided}</>:null}. A quote is decided when the customer accepts or declines it, or it expires unanswered, and a sent quote past its valid-until date counts as lost. {w.open?<>{plural(w.open,'quote')} still waiting on the rep or the customer {w.open===1?'doesn’t':'don’t'} count yet.</>:null}</>}/>
    <StatCard label="Quoted vs accepted" topic="dollars quoted and accepted" value={formatMoneyFigure(q.quoted)} unit="quoted"
      context={q.quoted_count?`${formatMoneyFigure(q.accepted)} accepted, ${formatPercent(q.share)}`:'No quotes sent yet'}
      info={<>Quoted: the total of the last revision sent (items and freight, before tax) for each of {plural(q.quoted_count,'sent quote')}, {formatMoney(q.quoted)}. Accepted: the same total for the {plural(q.accepted_count,'quote')} customers accepted, {formatMoney(q.accepted)}{q.share!==null?<>, {formatPercent(q.share)} of the dollars quoted</>:null}.</>}>
      {q.share!==null&&<div className={s.meter}><div className={s.meterFill} style={{width:`${Math.min(100,q.share*100)}%`}}/></div>}
    </StatCard>
    <StatCard label="Hours saved" topic="hours saved" value={formatHours(h.hours)} unit={h.hours===1?'hour':'hours'}
      context={h.quotes_sent?`${h.minutes_per_quote} min for each of ${plural(h.quotes_sent,'quote')} sent`:'No quotes sent yet'}
      info={<>A fixed {h.minutes_per_quote} minutes of rep time for each quote sent (matching items, checking stock, pricing and writing it up), times {plural(h.quotes_sent,'quote')} sent: {formatCount(h.minutes)} minutes. Each quote counts once, however many revisions it took.</>}/>
    <StatCard label="Extra GP Querent found" topic="extra GP Querent found" value={formatGpAmount(gp.amount)} tone={gp.amount>0?'gain':undefined}
      context={gp.accepted_quotes?`${plural(gp.lines,'line')} you kept, on ${plural(gp.quotes,'accepted quote')}`:'No accepted quotes yet'}
      info={<>On accepted quotes, the lines where Querent suggested more than the customer price because of a fact (a higher last-paid price, a broken case or low stock) and the rep kept that price: quantity times (final price minus customer price). Contract lines, and prices a rep set by hand, don’t count.{gp.accepted_quotes?<> Found on {plural(gp.lines,'line')} across {gp.quotes} of {plural(gp.accepted_quotes,'accepted quote')}.</>:null}</>}/>
  </section>;
}

// ---- Quotes and wins by week ----

/** A label under every 4th week, from the first (C_ANBase: Apr 20, May 18, ...). */
const LABEL_EVERY=4;
/** The plot (C_ANBase): 255px tall, the axis 24px up; the top tick sits 12px under the top. */
const PLOT_HEIGHT=255,AXIS=24,HEADROOM=12;
/** Weeks in the table before "Show N more weeks" (C_AN3: nine). */
export const WEEK_ROWS=9;

const WEEK_COLUMNS:readonly GridColumn<WeekPoint>[]=[
  {id:'week',label:'Week of',track:'1.4fr',header:true,alwaysShown:true,cellClass:s.strong,render:w=>formatWeek(w.week_start)},
  {id:'requested',label:'Requested',track:'1fr',align:'right',render:w=>w.quotes},
  {id:'won',label:'Won',track:'1fr',align:'right',render:w=>w.won},
  {id:'lost',label:'Lost',track:'1fr',align:'right',render:w=>w.lost},
  {id:'open',label:'Open',track:'1fr',align:'right',render:w=>w.open},
];

export function WeeklyChart({weeks,prefs}:{weeks:WeekPoint[];prefs?:TablePrefs|null}){
  const [table,setTable]=useState(false);
  const n=weeks.length;
  const total=weeks.reduce((sum,w)=>sum+w.quotes,0),won=weeks.reduce((sum,w)=>sum+w.won,0);
  const ticks=niceTicks(Math.max(0,...weeks.map(w=>w.quotes)));
  const unit=(PLOT_HEIGHT-AXIS-HEADROOM)/ticks.at(-1)!;
  const px=(count:number)=>`${Math.round(count*unit*10)/10}px`;
  return <Card title="Quotes and wins by week" right={total>0&&<span className={s.legend}>
    <span className={s.key}><span className={`${s.swatch} ${s.won}`}/>Won</span>
    <span className={s.key}><span className={`${s.swatch} ${s.other}`}/>Lost or still open</span>
    <button type="button" className={s.barButton} onClick={()=>setTable(t=>!t)}>{table?'Show chart':'Show table'}</button>
  </span>}>
    <div className={s.cardBody}>
      <div className={s.muted}>{total?`${plural(total,'quote')} requested in the last ${n} weeks, ${won} won so far.`:`No quotes requested in the last ${n} weeks.`}</div>
      {total>0&&(table
        ?<GridTable tableId="analytics-weeks" label="Quotes and wins by week" columns={WEEK_COLUMNS} rows={[...weeks].reverse()} rowKey={w=>w.week_start} gap={16} picker
          className={`${s.boxed} ${s.weekBox}`} rowClass={()=>s.weekRow} pageSize={WEEK_ROWS} moreLabel={r=>`Show ${r} more weeks`} lessLabel="Show fewer weeks" initialPrefs={prefs}/>
        :<div className={s.chart} role="img" aria-label={`Quotes requested each week for the last ${n} weeks, and how many were won. Show table lists every week.`}>
          {ticks.flatMap(t=>[<div key={`g${t}`} className={s.gridline} style={{bottom:`${AXIS+t*unit}px`}}/>,<div key={`t${t}`} className={s.tick} style={{bottom:`${AXIS+t*unit}px`}}>{t}</div>])}
          <div className={s.columns}>
            {weeks.map(w=><div key={w.week_start} className={s.column}>
              <div className={s.stack}><div className={s.segOther} style={{height:px(w.quotes-w.won)}}/><div className={s.segWon} style={{height:px(w.won)}}/></div>
            </div>)}
          </div>
          <div className={s.labels}>
            {weeks.map((w,i)=><div key={w.week_start} data-testid="week-label" className={s.label}>{i%LABEL_EVERY===0?formatWeek(w.week_start):''}</div>)}
          </div>
        </div>)}
    </div>
  </Card>;
}

// ---- Average margin vs floor, top requested items ----

/** The bar scale: at least 0 to 50%, in 10-point steps above the largest margin or floor. */
const scaleFor=(values:number[])=>Math.max(0.5,Math.ceil((Math.max(0,...values)+0.05)*10)/10);
const widthOf=(value:number|null,scale:number)=>`${(Math.max(0,Math.min(1,(value??0)/scale))*100).toFixed(1)}%`;

export function MarginVsFloor({margin}:{margin:MarginData}){
  const {overall,categories}=margin;
  const scale=scaleFor(categories.flatMap(c=>[c.margin??0,c.floor??0]));
  return <Card title="Average margin vs floor">
    <div className={s.cardBody}>
      {!overall.lines?<div>No quotes sent yet.</div>:<>
        <div><b>{formatMargin(overall.margin)}</b>{` average margin against a ${formatMargin(overall.floor)} average floor. ${plural(overall.below_floor,'line')} of ${overall.lines} under the floor.`}</div>
        <ul className={s.list}>
          {categories.map(c=><li key={c.category_id} className={s.marginRow}>
            <div className={s.marginLabel}>
              <span>{c.name}</span>
              <span><b className={s.tabular}>{formatMargin(c.margin)}</b> <span className={s.floorNote}>{`floor ${formatFloor(c.floor??0)}`}</span></span>
            </div>
            <div className={s.track}><div className={s.fill} style={{width:widthOf(c.margin,scale)}}/><div className={s.floorMark} style={{left:widthOf(c.floor,scale)}}/></div>
            {c.below_floor>0&&<div className={s.belowNote}>{`${plural(c.below_floor,'line')} under the ${formatFloor(c.floor??0)} floor`}</div>}
          </li>)}
        </ul>
        <div className={s.scale}>
          <span className={s.scaleKey}><span className={s.keyFill}/>Average margin</span>
          <span className={s.scaleKey}><span className={s.keyMark}/>{`Your floor. Bars run from 0 to ${formatPercent(scale)}.`}</span>
        </div>
      </>}
    </div>
  </Card>;
}

export function TopItems({items}:{items:RequestedItem[]}){
  // C_ANBase's bars run to the largest quantity.
  const most=Math.max(1,...items.map(i=>i.total_qty));
  return <Card title="Top requested items">
    <div className={s.itemsBody}>
      {!items.length?<div className={s.item}>No items requested yet.</div>:
        <ol className={s.list}>
          {items.map(i=><li key={i.item_id} className={s.item}>
            <div><span className={s.sku}>{i.sku}</span> <span className={s.muted}>{i.description}</span></div>
            <div className={s.itemBar}>
              <div className={s.itemTrack}><div className={s.fill} style={{width:`${((i.total_qty/most)*100).toFixed(1)}%`}}/></div>
              <span className={s.itemValue}><b>{plural(i.quote_count,'quote')}</b>{`, qty ${formatCount(i.total_qty)}`}</span>
            </div>
          </li>)}
        </ol>}
    </div>
  </Card>;
}

export function Overview({data,prefs}:{data:RepAnalytics;prefs:Record<string,TablePrefs|null>}){
  return <>
    <StatCards data={data}/>
    <WeeklyChart weeks={data.weekly} prefs={prefs['analytics-weeks']}/>
    <div className={s.pair}>
      <div className={s.pairMain}><MarginVsFloor margin={data.margin}/></div>
      <div className={s.pairSide}><TopItems items={data.top_items}/></div>
    </div>
  </>;
}
