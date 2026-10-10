import 'server-only';
import type {DistanceProvider} from '@/server/freight/distance';
import {expireOverdueQuotes,sendCheck} from '@/server/quotes/service';
import {managerListOptions,type ManagerListOptions} from '@/server/rep/quotes';
import {agingThresholds,teamQuoteFacts,teamStatusEvents} from '@/server/repository';
import {teamMetricsCsv} from './csv';
import {teamMetricRows,type TeamMetricRows} from './metrics';
import {parseTeamQuery} from './query';

// The Team dashboard's data (v3 spec §5, §7; decisions 23–25; task D3), for the manager only
// (GET /api/rep/team/metrics and .csv, both behind managerRoute). Every call reads the quotes live
// (src/server/repository/team) and aggregates them (./metrics); nothing is stored.

const clock=()=>new Date().toISOString();

/** A refused query (400): a bad window, an unknown rep or team label. */
export class TeamQueryError extends Error {}

/** What the dashboard shows. */
export interface TeamMetrics extends TeamMetricRows {
  /** Statuses and aging are as of this instant. */
  as_of:string;
  window:{from:string;to:string};
  /** The reps the rows cover (after the team filter), and the team label applied. */
  selected:{rep_ids:string[];team:string|null};
  /** Every rep (inactive ones too, for history) and team label, for the filters. */
  options:ManagerListOptions;
}

export interface TeamMetricsOptions {
  /** For tests. */
  now?:string;
  /** Freight's distance provider for the live draft totals; haversine by default. */
  provider?:DistanceProvider;
}

/**
 * The metrics for the query string's window, reps and team. Expiry is lazy (task 1.5), so this first
 * stores the expiry of every sent quote past valid_until (dated when it happened), as the Quotes
 * list and Analytics do; statuses are read through effectiveStatus as well. Throws TeamQueryError.
 */
export async function teamMetrics(params:{get(name:string):string|null},{now=clock(),provider}:TeamMetricsOptions={}):Promise<TeamMetrics>{
  const options=managerListOptions();
  const parsed=parseTeamQuery(params,options.reps);
  if(!parsed.ok)throw new TeamQueryError(parsed.detail);
  const {from,to,repIds,team}=parsed.query;
  expireOverdueQuotes({now});
  const cohort={from,to,repIds};
  const facts=[];
  for(const fact of teamQuoteFacts(cohort)){
    // Never sent: what the Quotes list shows for the draft, priced lines plus freight (items only while freight is call for freight).
    let draft_total:number|null=null;
    if(fact.sent_total===null){const check=await sendCheck(fact.id,{provider,now});draft_total=check.total??check.subtotal;}
    facts.push({...fact,draft_total});
  }
  const reps=options.reps.filter(r=>repIds.includes(r.id));
  return {as_of:now,window:{from,to},selected:{rep_ids:reps.map(r=>r.id),team},
    ...teamMetricRows(reps,facts,teamStatusEvents(cohort),{now,thresholds:agingThresholds()}),options};
}

/** The same rows as CSV (Export CSV). */
export async function teamMetricsCsvFor(params:{get(name:string):string|null},options:TeamMetricsOptions={}){
  return teamMetricsCsv(await teamMetrics(params,options));
}
