import 'server-only';
import type {CustomerListItem} from '@/domain';
import {expireOverdueQuotes} from '@/server/quotes/service';
import {customerFilterFor,readableCustomers,type RepReader} from '@/server/rep/access';
import {aggregateAccess,analytics,customers,productCategories,questionOutcomes,quoteFacts,quoteLineFacts,sentLineFacts,topRequestedItems} from '@/server/repository';
import {
  TOP_ITEMS,extraGp,hoursSaved,marginVsFloor,questionsAnswered,quotedVsAccepted,turnaround,weeklyTrend,winRateCard,type RepAnalytics,
} from './metrics';

// The Analytics page's data (spec §4, task 6.2) for the signed-in rep.
//
// Whose numbers (Appendix B; task U1): a rep's own customers (customer_rep), the whole organization
// for the manager, narrowed by the page's own ?customer=. A customer the rep can't read (another
// rep's) is ignored like an unknown one, so nothing about it leaks. Chat questions have no rep, so
// going by customer keeps the quote and question numbers on one footing.

const clock=()=>new Date().toISOString();

export interface RepAnalyticsOptions {
  /** The signed-in rep is the manager (repAccess): the numbers cover every customer (task U1). */
  manager?:boolean;
  /** The page's own ?customer=. An unknown id, or one the rep can't read, reads as All customers. */
  customerId?:string|null;
  /** For tests. */
  now?:string;
}

/** Which customers the numbers cover: the reader's (every customer for the manager), or the one filtered customer they may read. */
export function analyticsScope(reader:RepReader,customerId:string|null,everyone:readonly CustomerListItem[]=customers()):RepAnalytics['scope']{
  const picked=customerFilterFor(reader,customerId,everyone);
  return {customer:picked,customer_ids:picked?[picked.id]:readableCustomers(reader,everyone).map(c=>c.id)};
}

/**
 * The five stat cards, the trends and the old query analytics for the rep's customers. Expiry is
 * lazy (task 1.5), so this first stores the expiry of every sent quote past valid_until; the win
 * rate also reads effective statuses, so the two agree either way.
 */
export function repAnalytics(repId:string,{manager=false,customerId=null,now=clock()}:RepAnalyticsOptions={}):RepAnalytics{
  expireOverdueQuotes({now});
  const scope=analyticsScope({repId,manager},customerId);
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
