'use client';
import Link from 'next/link';
import {ArrowUpRight,Clock3,MessageSquare} from 'lucide-react';
import {labels,type AccessRule,type Analytics} from '@/lib/contracts';
import {repPageStyles as rs} from '../RepPage';
import {InfoTip} from './InfoTip';
import s from './Analytics.module.css';

// The original query analytics (the old supplier Overview, kept under the new cards by spec §4):
// chat questions by information category and the lookup time they saved, with the access card.
// It keeps its original look (the global .metric / .card styles); each number gained an "i".

export function QueryAnalytics({queries,access,manageHref}:{queries:Analytics;access:AccessRule[];manageHref:string}){
  const enabled=access.filter(r=>r.enabled===true).length;
  return <section className={s.legacy} aria-labelledby="query-analytics-heading">
    <div className={s.legacyHead}>
      <h2 id="query-analytics-heading" className={s.sectionTitle}>Query analytics</h2>
      <p className={s.muted}>Customer questions Querent answered in chat, by information category.</p>
    </div>
    <div className="overview-grid">
      <div className={rs.shrink}>
        <div className="metric-grid">
          <section className="card metric">
            <span className="metric-label"><MessageSquare size={18}/>Total queries
              <InfoTip topic="total queries">Every question customers asked in Querent chat, answered or not. A question about two categories counts once here.</InfoTip></span>
            <strong>{queries.total_queries.toLocaleString()}</strong><p>Customer questions, all time</p>
          </section>
          <section className="card metric">
            <span className="metric-label"><Clock3 size={18}/>Estimated time saved
              <InfoTip topic="estimated time saved">For each question Querent answered, the minutes the lookup would take someone by hand: stock 8, pricing 10, orders and quotes 7, account 5 (the largest when a question covers several). {queries.minutes_saved.toLocaleString()} minutes in all. Quote writing time is in Hours saved above.</InfoTip></span>
            <strong className="teal">{queries.hours_saved}<span> hrs</span></strong><p>Based on typical lookup times</p>
          </section>
        </div>
        <section className="card">
          <div className="section-heading">
            <div>
              <div className={s.titleRow}><h2>Queries by category</h2>
                <InfoTip topic="queries by category">Questions per information category. A question about two categories counts in each, so the rows can add up to more than the total.</InfoTip></div>
              <p>Where customers find their answers.</p>
            </div>
            <span className="badge">ALL TIME</span>
          </div>
          <div className="table-scroll"><table><thead><tr><th>Category</th><th>Questions</th><th>Assigned rep</th></tr></thead>
            <tbody>{queries.categories.map(c=><tr key={c.category}><td>{labels[c.category]}</td><td><span className="count-badge">{c.count}</span></td><td className="muted">{c.rep_name}</td></tr>)}</tbody></table></div>
          <p className="table-note">Combined questions count in each relevant category and once in the total.</p>
        </section>
      </div>
      <div className={`overview-aside ${rs.shrink}`}>
        <section className="card insight-card">
          <span className="insight-icon"><ArrowUpRight size={24}/></span>
          <h2>Answers for customers.<br/>Time for your team.</h2>
          <p>Let customers find the information they need, while your team focuses on the work that needs a person.</p>
          {access.length>0&&<div className="insight-stat">
            <strong>{enabled} of {access.length}</strong>
            <span>categories fully enabled</span>
          </div>}
          <Link className="text-button" href={manageHref}>Manage customer access <ArrowUpRight size={16}/></Link>
        </section>
      </div>
    </div>
  </section>;
}
