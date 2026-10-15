import type {QuoteStatus} from '@/domain';
import {STATUS_LABELS} from '@/server/quotes/lifecycle';

// The customer's quote status words and dates (spec §3; plan U10: the quote preview's status, C_CVL5).

const dayMonth=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const dayMonthYear=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});

/** "Sep 9", or "Sep 30, 2025" outside `now`'s year. Days are UTC, like every date in the app. */
export function quoteDate(iso:string,now:string){
  const date=new Date(iso);
  return (date.getUTCFullYear()===new Date(now).getUTCFullYear()?dayMonth:dayMonthYear).format(date);
}

/** The status word per status, plain text (C_CVL5 "Sent"). `tone` picks the colour in customer.css: action (Sent) is the accent, the rest secondary text. */
export const STATUS_CHIPS:Readonly<Record<QuoteStatus,{label:string;tone:'waiting'|'action'|'done'|'changes'|'closed'}>>={
  ready_for_review:{label:STATUS_LABELS.ready_for_review,tone:'waiting'},
  sent:{label:STATUS_LABELS.sent,tone:'action'},
  accepted:{label:STATUS_LABELS.accepted,tone:'done'},
  changes_requested:{label:STATUS_LABELS.changes_requested,tone:'changes'},
  expired:{label:STATUS_LABELS.expired,tone:'closed'},
  declined:{label:STATUS_LABELS.declined,tone:'closed'},
};
