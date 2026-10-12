import {Fragment} from 'react';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import {count,stamp} from './format';
import {Panel,Row} from './Panel';
import p from './Panels.module.css';

/**
 * Quote details, Activity (plan U4, C_QE4; spec §4, task 3.4): everything that happened to the quote,
 * newest first, each as when it happened and what happened under it. What the customer said lives here
 * too: a change request's note, a decline's reason and Other note, an accept's PO and pickup time.
 */
export function ActivityPanel({detail}:{detail:QuoteDetail}){
  const {activity}=detail.panels;
  return <Panel label="Activity" value={count(activity.length,'event')}>
    {activity.length
      ?[...activity].reverse().map(a=><Fragment key={a.id}>
        <Row label={stamp(a.at,detail.as_of)}/>
        <div className={p.message} data-ui="activity-message">{a.message}</div>
      </Fragment>)
      :<div className={p.line}>Nothing yet.</div>}
  </Panel>;
}
