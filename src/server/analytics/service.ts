import 'server-only';
import type {CustomerListItem} from '@/domain';
import {expireOverdueQuotes} from '@/server/quotes/service';
import {customerFilterFor,ownerFilter,readableCustomers,type RepReader} from '@/server/rep/access';
import {aggregateAccess,analytics,customers,productCategories,questionOutcomes,quoteFacts,quoteLineFacts,sentLineFacts,topRequestedItems,type QuoteScope} from '@/server/repository';
import {
  TOP_ITEMS,extraGp,hoursSaved,marginVsFloor,questionsAnswered,quotedVsAccepted,turnaround,weeklyTrend,winRateCard,type RepAnalytics,
} from './metrics';

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
  /** For tests. */
  now?:string;
}

/**
 * Whose numbers: the quotes' owner (the rep, or null for every rep), and the customers whose chat
 * questions count (the reader's, every customer for the manager), or the one filtered customer
 * they may read.
 */
export function analyticsScope(reader:RepReader,customerId:string|null,everyone:readonly CustomerListItem[]=customers()):RepAnalytics['scope']{
  const picked=customerFilterFor(reader,customerId,everyone);
  return {customer:picked,customer_ids:picked?[picked.id]:readableCustomers(reader,everyone).map(c=>c.id),rep_id:ownerFilter(reader)};
}

/**
 * The five stat cards, the trends and the old query analytics for the rep's own quotes and
 * customers. Expiry is lazy (task 1.5), so this first stores the expiry of every sent quote past
 * valid_until; the win rate also reads effective statuses, so the two agree either way.
 */
export function repAnalytics(repId:string,{manager=false,customerId=null,now=clock()}:RepAnalyticsOptions={}):RepAnalytics{
  expireOverdueQuotes({now});
  const scope=analyticsScope({repId,manager},customerId);
  const ids=scope.customer_ids;
  // The owner's quotes for any customer, or for the filtered one.
  const owned:QuoteScope={customers:scope.customer?scope.customer.id:null,repId:scope.rep_id};
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
