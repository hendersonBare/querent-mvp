import type {CustomerQuoteSummary,QuoteStatus} from '@/domain';
import {STATUS_LABELS} from '@/server/quotes/lifecycle';

// The customer's quote buttons (spec §3): "Quote · date · $total" with a status chip.

/**
 * Shown in place of the total before the rep's first send: the customer-safe API has no total
 * until then, so unreviewed prices never reach the customer (task 0.3). Spec §3 labels every
 * button with a total; this default is flagged for Henderson's Phase 2 review.
 */
export const NO_TOTAL_LABEL='Awaiting rep';

const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const dayMonth=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const dayMonthYear=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});

/** "Sep 9", or "Sep 30, 2025" outside `now`'s year. Days are UTC, like every date in the app. */
export function quoteDate(iso:string,now:string){
  const date=new Date(iso);
  return (date.getUTCFullYear()===new Date(now).getUTCFullYear()?dayMonth:dayMonthYear).format(date);
}

/**
 * The button label. The date and total are the last send's (the version the customer opens);
 * before the first send, the request date and "Awaiting rep".
 */
export function quoteButtonLabel(q:Pick<CustomerQuoteSummary,'requested_at'|'sent_at'|'total'>,now:string){
  return `Quote · ${quoteDate(q.sent_at??q.requested_at,now)} · ${q.total===null?NO_TOTAL_LABEL:usd.format(q.total)}`;
}

/** Chip label and colour per status. `tone` picks the colour in customer.css. */
export const STATUS_CHIPS:Readonly<Record<QuoteStatus,{label:string;tone:'waiting'|'action'|'done'|'changes'|'closed'}>>={
  ready_for_review:{label:STATUS_LABELS.ready_for_review,tone:'waiting'},
  sent:{label:STATUS_LABELS.sent,tone:'action'},
  accepted:{label:STATUS_LABELS.accepted,tone:'done'},
  changes_requested:{label:STATUS_LABELS.changes_requested,tone:'changes'},
  expired:{label:STATUS_LABELS.expired,tone:'closed'},
  declined:{label:STATUS_LABELS.declined,tone:'closed'},
};
