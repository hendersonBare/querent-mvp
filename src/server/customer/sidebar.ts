import 'server-only';
import type {CustomerQuoteSummary,CustomerRepContact} from '@/domain';
import {effectiveStatus} from '@/server/quotes';
import {assignedRepPicture,assignedRepProfile,customerQuotes} from '@/server/repository/customer';

// The customer's rep and quote list (spec §3, task 2.4; plan U10). Customer-facing, so it reads only
// the customer-safe repository module: no cost, no draft prices (a quote has no total until the rep's first send).

/**
 * The My rep sheet (plan U10, C_CVL3): the assigned rep only. The departments and will-call branches
 * stay available to the chat's answers (new-ui-implementation-prompt Appendix D). Plan U9: the name, phone,
 * email and picture the rep set on Settings > Profile, their title, and nothing else of the rep (no id).
 */
export function customerRepContact(customerId:string):CustomerRepContact{
  const rep=assignedRepProfile(customerId);
  if(!rep)return {rep:null};
  const {name,initials,title,phone,email,picture_updated_at}=rep;
  return {rep:{name,initials,title,phone,email,picture_url:picture_updated_at?`/api/query/customer/contacts/picture?v=${Date.parse(picture_updated_at)}`:null}};
}

/** GET /api/query/customer/contacts/picture: the picture of the customer's own rep, or undefined. */
export function customerRepPicture(customerId:string){return assignedRepPicture(customerId);}

/**
 * The customer's quotes, newest first, each with the status to show now. A sent
 * quote past valid_until reads as expired before the expiry sweep stores it (effectiveStatus), so
 * listing never writes.
 */
export function customerQuoteList(customerId:string,now=new Date().toISOString()):CustomerQuoteSummary[]{
  return customerQuotes(customerId).map(q=>({...q,status:effectiveStatus(q,now)}));
}
