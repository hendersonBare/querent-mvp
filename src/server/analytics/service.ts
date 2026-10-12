import 'server-only';
import type {CustomerListItem} from '@/domain';
import type {DistanceProvider} from '@/server/freight/distance';
import {expireOverdueQuotes} from '@/server/quotes/service';
import {customerFilterFor,ownerFilter,readableCustomers,type RepReader} from '@/server/rep/access';
import {managerListOptions} from '@/server/rep/quotes';
import {aggregateAccess,agingThresholds,analytics,customers,productCategories,questionOutcomes,quoteFacts,quoteLineFacts,sentLineFacts,teamList,teamMemberships,teamStatusEvents,topRequestedItems,type QuoteScope} from '@/server/repository';
import {teamMetricsCsv} from '@/server/team/csv';
import {groupMetricRows,metricGroups,type MetricsTeam} from '@/server/team/metrics';
import {cohortFacts} from '@/server/team/service';
import {countedReps,treeOrder} from '@/server/teams/tree';
import {
  TOP_ITEMS,extraGp,hoursSaved,marginVsFloor,questionsAnswered,quotedVsAccepted,turnaround,weeklyTrend,winRateCard,type AnalyticsPage,type RepAnalytics,
} from './metrics';
import {parseAnalyticsQuery} from './query';

// The Analytics page's data (spec §4, task 6.2) for the signed-in rep.
//
// Whose numbers (Appendix B "own data"; task U1; OA-67), narrowed by the page's own ?customer=:
//   quotes     a rep's own quotes (quotes.rep_id, the current owner), the same quotes as their
//              Quotes list, whichever customer they are for; every rep's for the manager. Everything
//              read off quotes follows: turnaround, win rate, $ quoted vs accepted, hours saved, GP
//              Querent found, the weekly trend, margin vs floor and top requested items.
//   questions  chat questions (and the old query analytics and Customer access) have no rep, so
//              they follow the customer: a rep's own customers (customer_rep), every customer for
//              the manager.
// The filter names only a customer the reader may read: another rep's customer is ignored like an
// unknown one, so nothing about it leaks, and a rep's quote for another rep's customer counts only
// under All customers (as in the Quotes list).

const clock=()=>new Date().toISOString();

export interface RepAnalyticsOptions {
  /** The signed-in rep is the manager (repAccess): the numbers cover every customer (task U1). */
  manager?:boolean;
  /** The page's own ?customer=. An unknown id, or one the rep can't read, reads as All customers. */
  customerId?:string|null;
  /** The manager's rep and team filter (plan U6): only these reps' quotes, and their customers' questions. Null for every rep. */
  repIds?:readonly string[]|null;
  /** For tests. */
  now?:string;
}

/**
 * Whose numbers: the quotes' owner (the rep, or null for every rep), and the customers whose chat
 * questions count (the reader's, every customer for the manager), or the one filtered customer
 * they may read.
 */
export function analyticsScope(reader:RepReader,customerId:string|null,everyone:readonly CustomerListItem[]=customers(),repIds:readonly string[]|null=null):RepAnalytics['scope']{
  const picked=customerFilterFor(reader,customerId,everyone);
  const readable=readableCustomers(reader,everyone).filter(c=>!repIds||(c.rep_id!==null&&repIds.includes(c.rep_id)));
  return {customer:picked,customer_ids:picked?[picked.id]:readable.map(c=>c.id),rep_id:ownerFilter(reader)};
}

/**
 * The five stat cards, the trends and the old query analytics for the rep's own quotes and
 * customers. Expiry is lazy (task 1.5), so this first stores the expiry of every sent quote past
 * valid_until; the win rate also reads effective statuses, so the two agree either way.
 */
export function repAnalytics(repId:string,{manager=false,customerId=null,repIds=null,now=clock()}:RepAnalyticsOptions={}):RepAnalytics{
  expireOverdueQuotes({now});
  const scope=analyticsScope({repId,manager},customerId,customers(),repIds);
  const ids=scope.customer_ids;
  // The owner's quotes for any customer, or for the filtered one; for the manager, the picked reps' only.
  const owned:QuoteScope={customers:scope.customer?scope.customer.id:null,repId:scope.rep_id,repIds};
  const quotes=quoteFacts(owned),lines=quoteLineFacts(owned);
  return {
    as_of:now,scope,
    turnaround:turnaround(quotes),
    win_rate:winRateCard(quotes,now),
    quoted:quotedVsAccepted(quotes),
    hours_saved:hoursSaved(quotes),
    extra_gp:extraGp(quotes,lines),
    weekly:weeklyTrend(quotes,now),
    margin:marginVsFloor(sentLineFacts(owned),productCategories()),
    top_items:topRequestedItems(owned,TOP_ITEMS),
    questions:questionsAnswered(questionOutcomes(ids)),
    queries:analytics(ids),
    access:ids.length?aggregateAccess(ids):[],
  };
}

// ---- The whole page, with its filter (plan U6; Part 1 section 6; Appendix D) ----
//
// GET /api/rep/analytics takes reps, teams, customer, breakdown and period (./query) and answers the
// Overview above plus what the old Team dashboard served (GET /api/rep/team/metrics): the leaderboard
// rows grouped by the breakdown, the decline reasons with the Other notes, and the untouched quotes,
// all over the cohort of quotes created in the window. A rep only ever gets their own data.

/** A refused filter (400): an unknown rep, team or breakdown, or a bad window. */
export class AnalyticsQueryError extends Error {}

export interface AnalyticsPageOptions {now?:string;provider?:DistanceProvider}

/** The page for the reader and the query string. Throws AnalyticsQueryError. */
export async function analyticsPage(reader:RepReader,params:{get(name:string):string|null},{now=clock(),provider}:AnalyticsPageOptions={}):Promise<AnalyticsPage>{
  const listed=managerListOptions();
  const teams=metricsTeams();
  const parsed=parseAnalyticsQuery(params,{reader,reps:listed.reps,teams,now});
  if(!parsed.ok)throw new AnalyticsQueryError(parsed.detail);
  const query=parsed.query;
  const everyone=customers();
  const readable=readableCustomers(reader,everyone);
  const picked=customerFilterFor(reader,query.customerId,everyone);
  const overview=repAnalytics(reader.repId,{manager:reader.manager,customerId:picked?.id??null,repIds:query.repIds,now});
  // The cohort: the quotes created in the window, owned now by a cohort rep, for the picked customer or any.
  const cohort={...query.window,repIds:query.cohortRepIds,customerIds:picked?[picked.id]:null};
  const reps=listed.reps.filter(r=>query.cohortRepIds.includes(r.id));
  const groups=groupMetricRows(metricGroups(query.breakdown,reps,picked?[picked]:readable,teams),await cohortFacts(cohort,{now,provider}),teamStatusEvents(cohort),{now,thresholds:agingThresholds()});
  return {...overview,
    filter:{rep_ids:query.repIds===null?[]:query.reps,teams:query.teams,customer_id:picked?.id??null,breakdown:query.breakdown,window:query.window},
    groups,
    options:reader.manager?{reps:listed.reps,teams:teams.map(t=>t.name),customers:readable}:{reps:[],teams:[],customers:readable}};
}

/**
 * The team entities (plan U7) in the Teams card's order, each with every rep it counts: its own members and
 * those of the teams inside it (decision 47: grouping and filters only).
 */
function metricsTeams():MetricsTeam[]{
  const nodes=teamList(),counted=countedReps(nodes,teamMemberships());
  return treeOrder(nodes).map(({team})=>({name:team.name,rep_ids:counted.get(team.id)??[]}));
}

/** The CSV file name for Export CSV on the Rep leaderboard. */
export const LEADERBOARD_CSV_FILENAME='rep-leaderboard.csv';
const FIRST_COLUMN={rep:'Rep',team:'Team',customer:'Customer'} as const;

/** Export CSV: the leaderboard rows as the manager filtered them, then the totals (src/server/team/csv). */
export async function analyticsCsv(reader:RepReader,params:{get(name:string):string|null},options:AnalyticsPageOptions={}){
  const {groups}=await analyticsPage(reader,params,options);
  return teamMetricsCsv(groups,{first:FIRST_COLUMN[groups.dimension]});
}
