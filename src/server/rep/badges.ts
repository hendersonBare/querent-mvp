import 'server-only';
import {expireOverdueQuotes} from '@/server/quotes/service';
import {unreadQuoteCount} from '@/server/repository';
import {ownerFilter} from './access';
import {redQuoteCount} from './quotes';

// The rep portal's nav badges (spec §4: "Unread badges on Quotes").
//
// "Unread" is the quote's unread_for_rep flag (task 0.2). The spec doesn't define it further, so
// task 3.1 keeps the flag's existing meaning:
//   set    when the customer presses Request quote (a new ready_for_review quote, spec §3),
//          accepts, or requests changes (spec §5.4: "badge + activity for the rep");
//   clear  when the rep sends the quote, or opens it (markQuoteRead(id,'rep'), which the quote
//          detail page calls, task 3.3).
// The badge counts the signed-in rep's unread quotes across all their customers. It follows no
// page filter, so a request from another customer is never hidden.
//
// Beside it (OA-8), the red "Needs attention" badge counts red quotes (v3 spec §3, decision 18)
// over the same quotes as the Quotes list: the rep's own, or every rep's for the manager, who reads
// the whole organization (task U1). Amber quotes show only in the Quotes list's Needs attention
// filter. The unread badge stays each rep's own (it is each owner's flag).

export interface RepBadges {
  /** The rep's unread quotes. */
  quotes:number;
  /** The red (Overdue) open quotes: the rep's own, or every rep's for the manager (task U1). */
  attention:number;
}

/**
 * The badge counts for one rep. Expiry is lazy (task 1.5), so this stores the expiry of every
 * sent quote past valid_until first; counts then read effective statuses. `manager` (repAccess):
 * the red count covers every rep (task U1). `now` is for tests.
 */
export function repBadges(repId:string,{now=new Date().toISOString(),manager=false}:{now?:string;manager?:boolean}={}):RepBadges{
  expireOverdueQuotes({now});
  return {quotes:unreadQuoteCount(repId),attention:redQuoteCount(ownerFilter({repId,manager}),now)};
}
