import 'server-only';
import type {Branch,Quote,QuoteActivity,QuoteNote} from '@/domain';
import {winRate} from '@/server/quotes';
import {branches,contact,contacts,customerAccount,customerStats,quoteActivity,quoteNotes,quotes} from '@/server/repository';

// The quote detail's side panels (spec §4, task 3.4): the facts beside the line grid. Part of
// the rep-only QuoteDetail (./quote-detail), so every edit's fresh detail refreshes them with
// the totals and the checks. Internal: internal notes and Activity never reach the customer
// (customer routes read the customer-safe repository module and the frozen snapshot only).

export interface PanelContact {name:string;title:string|null;phone:string|null;email:string|null}

export interface PanelCustomer {
  /** The quote's contact (who asked), else the account's primary contact. */
  contact:PanelContact|null;
  account_number:string;
  /** Payment terms ("Net 30"), or null for a placeholder account. */
  terms:string|null;
  open_balance:number|null;past_due_balance:number|null;credit_limit:number|null;
  tax_status:'taxable'|'exempt'|null;tax_state:string|null;
  last_order:{order_number:string;order_date:string;total:number}|null;
  /** winRate() (task 1.5) over the customer's quotes: accepted = won, expired (or sent past valid_until) = lost. */
  win_rate:{rate:number|null;won:number;lost:number;open:number};
}

export interface QuotePanels {
  customer:PanelCustomer;
  /** Every branch, for the Pickup or delivery panel's branch choice. */
  branches:Pick<Branch,'id'|'code'|'name'>[];
  /** Internal notes, oldest first. Team only. */
  notes:QuoteNote[];
  /** The quote's Activity log, oldest first. */
  activity:QuoteActivity[];
}

function panelContact(q:Quote):PanelContact|null{
  const person=(q.contact_id?contact(q.contact_id):undefined)??contacts(q.customer_id)[0];
  return person?{name:person.name,title:person.title,phone:person.phone,email:person.email}:null;
}

/** The side panels' facts for a quote the rep may see, as of `now` (win rate reads effective statuses). */
export function quotePanels(q:Quote,now:string):QuotePanels{
  const account=customerAccount(q.customer_id);
  const {rate,won,lost,open}=winRate(quotes({customerId:q.customer_id}),now);
  return {
    customer:{
      contact:panelContact(q),account_number:account?.account_number??q.account_number,terms:account?.terms??null,
      open_balance:account?.open_balance??null,past_due_balance:account?.past_due_balance??null,credit_limit:account?.credit_limit??null,
      tax_status:account?.tax_status??null,tax_state:account?.tax_state??null,
      last_order:customerStats(q.customer_id).last_order,win_rate:{rate,won,lost,open},
    },
    branches:branches().map(({id,code,name})=>({id,code,name})),
    notes:quoteNotes(q.id),
    activity:quoteActivity(q.id),
  };
}
