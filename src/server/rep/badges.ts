import 'server-only';
import {expireOverdueQuotes} from '@/server/quotes/service';
import {unreadQuoteCount} from '@/server/repository';

// The rep portal's nav badges (spec §4: "Unread badges on Quotes").
//
// "Unread" is the quote's unread_for_rep flag (task 0.2). The spec doesn't define it further, so
// task 3.1 keeps the flag's existing meaning:
//   set    when the customer presses Request quote (a new ready_for_review quote, spec §3),
//          accepts, or requests changes (spec §5.4: "badge + activity for the rep");
//   clear  when the rep sends the quote, or opens it (markQuoteRead(id,'rep'), which the quote
//          detail page calls, task 3.3).
// The badge counts the signed-in rep's unread quotes across all their customers. It does not
// follow the "Viewing" picker, so a request from another customer is never hidden.

export interface RepBadges {
  /** The rep's unread quotes. */
  quotes:number;
}

/**
 * The badge counts for one rep. Expiry is lazy (task 1.5), so this stores the expiry of every
 * sent quote past valid_until first; counts then read effective statuses. `now` is for tests.
 */
export function repBadges(repId:string,{now}:{now?:string}={}):RepBadges{
  expireOverdueQuotes(now===undefined?{}:{now});
  return {quotes:unreadQuoteCount(repId)};
}
