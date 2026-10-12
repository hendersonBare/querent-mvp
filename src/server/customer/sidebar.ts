import 'server-only';
import type {CustomerQuoteSummary,CustomerRepContact} from '@/domain';
import {effectiveStatus} from '@/server/quotes';
import {assignedRep,customerQuotes} from '@/server/repository/customer';

// The customer's rep and quote list (spec §3, task 2.4; plan U10). Customer-facing, so it reads only
// the customer-safe repository module: no cost, no draft prices (a quote has no total until the rep's first send).

/**
 * The My rep sheet (plan U10, C_CVL3): the assigned rep only. The departments and will-call branches
 * stay available to the chat's answers (new-ui-implementation-prompt Appendix D).
 */
export function customerRepContact(customerId:string):CustomerRepContact{
  return {rep:assignedRep(customerId)??null};
}

/**
 * The customer's quotes, newest first, each with the status to show now. A sent
 * quote past valid_until reads as expired before the expiry sweep stores it (effectiveStatus), so
 * listing never writes.
 */
export function customerQuoteList(customerId:string,now=new Date().toISOString()):CustomerQuoteSummary[]{
  return customerQuotes(customerId).map(q=>({...q,status:effectiveStatus(q,now)}));
}
