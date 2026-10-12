'use client';
import Link from 'next/link';
import type {AccessRule,Analytics,Category} from '@/lib/contracts';
import type {QuestionsAnswered} from '@/server/analytics';
import {Icon} from '@/components/ui/Icon';
import type {TablePrefs} from '@/components/ui/table-prefs';
import {formatCount,formatPercent} from './format';
import {GridTable,type GridColumn} from './GridTable';
import {Card,InfoDot} from './parts';
import s from './Analytics.module.css';

// The Customer questions tab (C_AN2, C_AN5 scrolled; C_RAN5 for a rep): questions answered without a
// rep, then the original query analytics (questions by information category, the time they saved, and
// the access card). A rep's has no Assigned rep column and no "Manage customer access" (Part 1 section 6).

/** The information categories as the frames word them. */
const CATEGORY_LABELS:Record<Category,string>={items_stock:'Items and stock',pricing:'Pricing',orders_quotes:'Orders and quotes',account:'Account'};

export function QuestionsCard({questions:q}:{questions:QuestionsAnswered}){
  // With no questions yet the card still reads "0 of 0", its pattern (C_AN2) filled with zeros.
  return <Card title="Questions answered without a rep">
      <div className={s.questions}>
        <div>
          <div className={s.bigRow}><span className={s.big}>{formatCount(q.answered)}</span><span className={s.unit}>{`of ${formatCount(q.total)}`}</span></div>
          <div className={s.muted}>{`${formatPercent(q.rate??0)} answered without a rep`}</div>
          <div className={s.answerBar}><div className={s.answerFill} style={{width:`${(q.rate??0)*100}%`}}/></div>
        </div>
        <div>
          {([['Answered with live data',q.with_data],['Answered, nothing matched',q.no_match],['Needed a rep',q.needed_rep]] as const).map(([label,n])=>
            <div key={label} className={s.breakdownRow}><span>{label}</span><span className={s.strong}>{formatCount(n)}</span></div>)}
        </div>
      </div>
  </Card>;
}

type CategoryRow=Analytics['categories'][number];

export function QueryAnalytics({queries,access,manager,manageHref,prefs}:{queries:Analytics;access:AccessRule[];manager:boolean;manageHref:string;prefs?:TablePrefs|null}){
  const enabled=access.filter(r=>r.enabled===true).length;
  const columns:GridColumn<CategoryRow>[]=[
    {id:'category',label:'Category',track:'1.6fr',header:true,alwaysShown:true,cellClass:s.semibold,render:c=>CATEGORY_LABELS[c.category]},
    {id:'questions',label:'Questions',track:'0.8fr',render:c=><span className={s.countPill}>{formatCount(c.count)}</span>},
    ...(manager?[{id:'rep',label:'Assigned rep',track:'1.4fr',cellClass:s.repName,render:(c:CategoryRow)=>c.rep_name}]:[]),
  ];
  return <section aria-labelledby="query-analytics" style={{display:'contents'}}>
    <div className={s.sectionHead}>
      <div id="query-analytics" role="heading" aria-level={2} className={s.sectionTitle}>Query analytics</div>
      <div className={s.sectionNote}>Customer questions Querent answered in chat, by information category.</div>
    </div>
    <div className={s.pair}>
      <div className={s.queryMain}>
        <div className={s.metrics}>
          <div className={s.metric}>
            <div className={s.metricHead}><Icon name="message" size={18} strokeWidth={1.8}/>Total queries
              <InfoDot topic="total queries" side="left">Every question customers asked in Querent chat, answered or not. A question about two categories counts once here.</InfoDot></div>
            <div className={s.metricValueRow}><span className={s.metricValue}>{formatCount(queries.total_queries)}</span><span className={s.metricUnit}/></div>
            <div className={s.metricContext}>Customer questions, all time</div>
          </div>
          <div className={s.metric}>
            <div className={s.metricHead}><Icon name="clock" size={18} strokeWidth={1.8}/>Estimated time saved
              <InfoDot topic="estimated time saved" side="left">For each question Querent answered, the minutes the lookup would take someone by hand: stock 8, pricing 10, orders and quotes 7, account 5 (the largest when a question covers several). {formatCount(queries.minutes_saved)} minutes in all. Quote writing time is in Hours saved on the Overview.</InfoDot></div>
            <div className={s.metricValueRow}><span className={s.metricValue} data-tone="gain">{queries.hours_saved}</span><span className={s.metricUnit} data-tone="gain">hrs</span></div>
            <div className={s.metricContext}>Based on typical lookup times</div>
          </div>
        </div>
        <Card title="Queries by category" note={<span className={s.barNote}>Where customers find their answers.</span>} right={<span className={s.allTime}>ALL TIME</span>}>
          <GridTable tableId="analytics-queries" label="Queries by category" columns={columns} rows={queries.categories} rowKey={c=>c.category} gap={16} rowClass={()=>s.centered}
            foot={<div className={s.tableNote}>Combined questions count in each relevant category and once in the total.</div>} initialPrefs={prefs}/>
        </Card>
      </div>
      <div className={s.insight}>
        <div className={s.insightTitle}>Answers for customers.<br/>Time for your team.</div>
        <div className={s.insightText}>Let customers find the information they need, while your team focuses on the work that needs a person.</div>
        {access.length>0&&<div className={s.insightStat}>
          <span className={s.insightFigure}>{`${enabled} of ${access.length}`}</span>
          <div className={s.insightNote}>categories fully enabled</div>
        </div>}
        {manager&&<Link className={s.manage} href={manageHref} prefetch={false}>Manage customer access</Link>}
      </div>
    </div>
  </section>;
}

export function CustomerQuestions({questions,queries,access,manager,manageHref,prefs}:{questions:QuestionsAnswered;queries:Analytics;access:AccessRule[];manager:boolean;manageHref:string;prefs?:TablePrefs|null}){
  return <>
    <QuestionsCard questions={questions}/>
    <QueryAnalytics queries={queries} access={access} manager={manager} manageHref={manageHref} prefs={prefs}/>
  </>;
}
