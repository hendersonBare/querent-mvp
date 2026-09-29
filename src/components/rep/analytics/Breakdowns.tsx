'use client';
import {useId,type ReactNode} from 'react';
import {AlertTriangle} from 'lucide-react';
import type {RequestedItem} from '@/domain';
import type {MarginVsFloor as MarginData,QuestionsAnswered} from '@/server/analytics';
import {formatFloor,formatMargin,isBelowFloor} from '@/server/floors';
import {formatCount,formatMoney,formatPercent,plural} from './format';
import {InfoTip} from '../InfoTip';
import s from './Analytics.module.css';

// The breakdowns below the trend (spec §4): average margin vs floor, top requested items, and
// questions answered without a rep.

function Panel({title,topic,info,summary,children}:{title:string;topic:string;info:ReactNode;summary?:ReactNode;children:ReactNode}){
  const id=useId();
  return <section className={s.panel} aria-labelledby={id}>
    <div className={s.titleRow}><h2 id={id} className={s.panelTitle}>{title}</h2><InfoTip topic={topic}>{info}</InfoTip></div>
    {summary&&<p className={s.panelSummary}>{summary}</p>}
    {children}
  </section>;
}

/** The bar scale: at least 0 to 50%, in 10-point steps above the largest margin or floor. */
const scaleFor=(values:number[])=>Math.max(0.5,Math.ceil((Math.max(0,...values)+0.05)*10)/10);
const widthOf=(value:number|null,scale:number)=>`${Math.max(0,Math.min(1,(value??0)/scale))*100}%`;

export function MarginVsFloor({margin}:{margin:MarginData}){
  const {overall,categories}=margin;
  const scale=scaleFor(categories.flatMap(c=>[c.margin??0,c.floor??0]));
  return <Panel title="Average margin vs floor" topic="average margin vs floor"
    info={<>Margin is (price minus cost) divided by price, over every priced line on the quotes you sent, weighted by each line’s revenue. The floor is your margin floor for the line’s category (Settings), weighted the same way.{overall.lines?<> {plural(overall.below_floor,'line')} of {overall.lines} {overall.below_floor===1?'was':'were'} under its floor, on {formatMoney(overall.revenue)} of items.</>:null}</>}
    summary={overall.lines?<><strong className={s.inlineFigure}>{formatMargin(overall.margin)}</strong> average margin against a {formatMargin(overall.floor)} average floor. {overall.below_floor?`${plural(overall.below_floor,'line')} of ${overall.lines} under the floor.`:`No lines under the floor.`}</>:null}>
    {!overall.lines?<p className={s.emptyNote}>No quotes sent yet. Margins show here once you send a quote.</p>:<>
      <ul className={s.marginList}>
        {categories.map(c=>{
          const below=c.margin!==null&&c.floor!==null&&isBelowFloor(c.margin,c.floor);
          return <li key={c.category_id} className={s.marginRow}>
            <div className={s.marginLabel}>
              <span>{c.name}</span>
              <span className={s.marginValue}>{formatMargin(c.margin)}<span className={s.floorNote}>floor {formatFloor(c.floor??0)}</span></span>
            </div>
            <div className={s.track} aria-hidden="true">
              <span className={s.fill} data-below={below||undefined} style={{width:widthOf(c.margin,scale)}}/>
              <span className={s.floorMark} style={{left:widthOf(c.floor,scale)}}/>
            </div>
            {c.below_floor>0&&<p className={s.belowNote}><AlertTriangle aria-hidden="true" size={13}/>{below?'Below floor on average. ':''}{plural(c.below_floor,'line')} under the {formatFloor(c.floor??0)} floor</p>}
          </li>;
        })}
      </ul>
      <p className={s.scaleNote}><span className={s.keyFill} aria-hidden="true"/>Average margin <span className={s.keyMark} aria-hidden="true"/>Your floor. Bars run from 0 to {formatPercent(scale)}.</p>
    </>}
  </Panel>;
}

export function TopItems({items}:{items:RequestedItem[]}){
  const most=Math.max(1,...items.map(i=>i.quote_count));
  return <Panel title="Top requested items" topic="top requested items"
    info={<>The items on the most quotes, then the largest total quantity. Every quote counts, sent or not, so it shows what customers ask for.</>}>
    {!items.length?<p className={s.emptyNote}>No items requested yet.</p>:
      <ol className={s.itemList}>
        {items.map(i=><li key={i.item_id} className={s.itemRow}>
          <div className={s.itemName}><span className={s.sku}>{i.sku}</span><span className={s.itemDesc}>{i.description}</span></div>
          <div className={s.itemBar}>
            <span className={s.itemTrack} aria-hidden="true"><span style={{width:`${(i.quote_count/most)*100}%`}}/></span>
            <span className={s.itemValue}>{plural(i.quote_count,'quote')}<span className={s.muted}>, qty {formatCount(i.total_qty)}</span></span>
          </div>
        </li>)}
      </ol>}
  </Panel>;
}

export function QuestionsCard({questions:q}:{questions:QuestionsAnswered}){
  return <Panel title="Questions answered without a rep" topic="questions answered without a rep"
    info={<>Customer questions in Querent chat that Querent answered on its own: with live stock, price, order or account data, or by telling the customer nothing matched (for example, an item you don’t stock). Questions blocked by the customer’s access settings, or that hit an error, went to you. Pressing Request quote isn’t a question and isn’t counted.{q.total?<> {q.answered} of {q.total}.</>:null}</>}>
    {!q.total?<p className={s.emptyNote}>No customer questions yet.</p>:
      <div className={s.questions}>
        <div>
          <p className={s.bigFigure}>{formatCount(q.answered)}<span className={s.kpiUnit}> of {formatCount(q.total)}</span></p>
          <p className={s.kpiContext}>{formatPercent(q.rate)} answered without you</p>
          <span className={s.meter} aria-hidden="true"><span style={{width:`${(q.rate??0)*100}%`}}/></span>
        </div>
        <dl className={s.breakdown}>
          <div><dt>Answered with live data</dt><dd>{formatCount(q.with_data)}</dd></div>
          <div><dt>Answered, nothing matched</dt><dd>{formatCount(q.no_match)}</dd></div>
          <div><dt>Needed you</dt><dd>{formatCount(q.needed_rep)}</dd></div>
        </dl>
      </div>}
  </Panel>;
}
