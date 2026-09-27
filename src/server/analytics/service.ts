import 'server-only';
import type {CustomerListItem} from '@/domain';
import {expireOverdueQuotes} from '@/server/quotes/service';
import {aggregateAccess,analytics,customers,productCategories,questionOutcomes,quoteFacts,quoteLineFacts,sentLineFacts,topRequestedItems} from '@/server/repository';
import {
  TOP_ITEMS,extraGp,hoursSaved,marginVsFloor,questionsAnswered,quotedVsAccepted,turnaround,weeklyTrend,winRateCard,type RepAnalytics,
} from './metrics';

// The Analytics page's data (spec §4, task 6.2) for the signed-in rep.
//
// Whose numbers: the rep's own customers (customer_rep), narrowed by the "Viewing" picker. A
// quote's rep is the customer's assigned rep when it was requested and quotes are never
// reassigned (spec §5.2), so this is the same set of quotes as the rep's Quotes list (task 3.2,
// quotes.rep_id) unless a customer has since been reassigned in Settings. Chat questions have no
// rep, so going by customer keeps the quote and question numbers on one footing. Picking another
// rep's customer shows empty numbers (other_rep), as the Quotes list does. This is task 6.2's
// default, flagged for review: the spec doesn't say whether a rep sees colleagues' analytics.

const clock=()=>new Date().toISOString();

export interface RepAnalyticsOptions {
  /** The "Viewing" picker (?customer=). An unknown id reads as All customers, as the picker does. */
  customerId?:string|null;
  /** For tests. */
  now?:string;
}

/** Which customers the numbers cover. */
export function analyticsScope(repId:string,customerId:string|null,everyone:readonly CustomerListItem[]=customers()):RepAnalytics['scope']{
  const picked=customerId?everyone.find(c=>c.id===customerId)??null:null;
  if(!picked)return {customer:null,customer_ids:everyone.filter(c=>c.rep_id===repId).map(c=>c.id),other_rep:false};
  const mine=picked.rep_id===repId;
  return {customer:picked,customer_ids:mine?[picked.id]:[],other_rep:!mine};
}

/**
 * The five stat cards, the trends and the old query analytics for the rep's customers. Expiry is
 * lazy (task 1.5), so this first stores the expiry of every sent quote past valid_until; the win
 * rate also reads effective statuses, so the two agree either way.
 */
export function repAnalytics(repId:string,{customerId=null,now=clock()}:RepAnalyticsOptions={}):RepAnalytics{
  expireOverdueQuotes({now});
  const scope=analyticsScope(repId,customerId);
  const ids=scope.customer_ids;
  const quotes=quoteFacts(ids),lines=quoteLineFacts(ids);
  return {
    as_of:now,scope,
    turnaround:turnaround(quotes),
    win_rate:winRateCard(quotes,now),
    quoted:quotedVsAccepted(quotes),
    hours_saved:hoursSaved(quotes),
    extra_gp:extraGp(quotes,lines),
    weekly:weeklyTrend(quotes,now),
    margin:marginVsFloor(sentLineFacts(ids),productCategories()),
    top_items:topRequestedItems(ids,TOP_ITEMS),
    questions:questionsAnswered(questionOutcomes(ids)),
    queries:analytics(ids),
    access:ids.length?aggregateAccess(ids):[],
  };
}
