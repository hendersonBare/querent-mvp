import type {QuoteDetail} from '@/server/rep/quote-detail';
import {count,stamp} from './format';
import {Panel} from './Panel';
import p from './Panels.module.css';

/** The Activity log (spec §4, task 3.4; mockup #accLog): everything that happened to the quote, newest first. */
export function ActivityPanel({detail}:{detail:QuoteDetail}){
  const {activity}=detail.panels;
  return <Panel label="Activity" value={count(activity.length,'event')}>
    {activity.length
      ?<ol className={p.log} aria-label="Activity, newest first">
        {[...activity].reverse().map(a=><li key={a.id}><time dateTime={a.at}>{stamp(a.at,detail.as_of)}</time><span>{a.message}</span></li>)}
      </ol>
      :<p className={p.fnote}>Nothing yet.</p>}
  </Panel>;
}
