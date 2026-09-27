import 'server-only';
import type {CustomerContacts,CustomerQuoteSummary} from '@/domain';
import {effectiveStatus} from '@/server/quotes';
import {assignedRep,branches,customerQuotes,departments,supplier} from '@/server/repository/customer';

// The customer's sidebars (spec §3, task 2.4). Customer-facing, so it reads only the customer-safe
// repository module: no cost, no draft prices (a quote has no total until the rep's first send).

/** Left sidebar: the assigned rep, then the departments, then will-call per branch. */
export function customerContacts(customerId:string):CustomerContacts{
  const byId=new Map(branches().map(b=>[b.id,b]));
  const all=departments();
  return {
    supplier:supplier().name,
    rep:assignedRep(customerId)??null,
    departments:all.filter(d=>d.branch_id===null),
    willCall:all.flatMap(d=>{
      const branch=d.branch_id===null?undefined:byId.get(d.branch_id);
      return branch?[{id:d.id,branch_id:branch.id,code:branch.code,name:branch.name,phone:d.phone,email:d.email,hours:d.hours}]:[];
    }),
  };
}

/**
 * Right sidebar: the customer's quotes, newest first, each with the status to show now. A sent
 * quote past valid_until reads as expired before the expiry sweep stores it (effectiveStatus), so
 * listing never writes.
 */
export function customerQuoteList(customerId:string,now=new Date().toISOString()):CustomerQuoteSummary[]{
  return customerQuotes(customerId).map(q=>({...q,status:effectiveStatus(q,now)}));
}
