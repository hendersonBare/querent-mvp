import type {QuoteStatus} from '@/domain';
import type {ReassignResult} from '@/server/rep/reassign';
import type {RepQuoteRow} from '@/server/rep/quotes';

// Words and formats for the rep's Quotes list (task 3.2). Pure, so the list, the quote page and
// the server (the page, the API route) share them.

/** The Quotes list's status filter lives in ?status= (the picker's customer in ?customer=). */
export const STATUS_PARAM='status';
/** The Needs attention filter (v3 spec §3, task A2): ?attention=1, sorted oldest first with ?sort=oldest. */
export const ATTENTION_PARAM='attention';
export const SORT_PARAM='sort';
/** The Team dashboard's drill-down into one aging level of the open quotes (?aging=ok|amber|red, All reps only, task D3). */
export const AGING_PARAM='aging';
/** ?attention=1 and nothing else turns the Needs attention view on. */
export const isAttention=(value:string|null|undefined)=>value==='1';

/**
 * The rep's status chips. ready_for_review reads "Draft ready" as in the mockup's quote header
 * (docs/design/screens/03); the others use the spec §3 words (declined: v3 spec §6). `tone` picks the chip colour.
 */
export const REP_STATUS:Readonly<Record<QuoteStatus,{label:string;tone:'draft'|'changes'|'sent'|'accepted'|'expired'|'declined'}>>={
  ready_for_review:{label:'Draft ready',tone:'draft'},
  changes_requested:{label:'Changes requested',tone:'changes'},
  sent:{label:'Sent',tone:'sent'},
  accepted:{label:'Accepted',tone:'accepted'},
  expired:{label:'Expired',tone:'expired'},
  declined:{label:'Declined',tone:'declined'},
};

/** The status filter, in the order the rep works: what needs them first. */
export const STATUS_FILTERS:readonly QuoteStatus[]=['ready_for_review','changes_requested','sent','accepted','expired','declined'];

/** What an empty status filter says: what's missing, and what would put a quote there. */
export const EMPTY_STATUS:Readonly<Record<QuoteStatus,{heading:string;body:string}>>={
  ready_for_review:{heading:'No drafts waiting for review',body:'When a customer presses Request quote in Querent chat, the draft lands here for you to price and send.'},
  changes_requested:{heading:'No change requests',body:'When a customer asks for changes to a quote you sent, it shows here with their note.'},
  sent:{heading:'No quotes waiting on the customer',body:'Quotes you send stay here until the customer accepts, asks for changes, declines, or the quote expires.'},
  accepted:{heading:'No accepted quotes',body:'Quotes your customers accept show here.'},
  expired:{heading:'No expired quotes',body:'Sent quotes that pass their valid-until date without an answer show here.'},
  declined:{heading:'No declined quotes',body:'When a customer declines a quote you sent, it shows here with their reason.'},
};

const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
/** "$1,122.40", or "—" with no total. */
export const money=(n:number|null)=>n===null?'—':usd.format(n);

const dayMonth=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const dayMonthYear=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
/** "Sep 23", or "Sep 30, 2025" outside `now`'s year. Days are UTC, like every date in the app. */
export function listDate(iso:string,now:string){
  const date=new Date(iso);
  return (date.getUTCFullYear()===new Date(now).getUTCFullYear()?dayMonth:dayMonthYear).format(date);
}

/** "rev 2", or "Not sent" before the first send. */
export const revisionLabel=(revision:number)=>revision>0?`rev ${revision}`:'Not sent';

/** The note under a total: a draft's prices aren't sent yet (and its freight may not be priced). */
export function totalNote(row:Pick<RepQuoteRow,'total_basis'|'freight_pending'>){
  if(row.total_basis==='sent')return null;
  return row.freight_pending?'Draft, before freight':'Draft';
}

/** "1 line below floor", "3 lines below floor", or null. */
export const belowFloorNote=(count:number)=>count>0?`${count} ${count===1?'line':'lines'} below floor`:null;

/** What the Needs attention view says when nothing is amber or red. */
export const EMPTY_ATTENTION={heading:'Nothing needs attention',
  body:'A quote shows here when it waits too long: a draft or a change request for 4 hours (Aging) or 24 hours (Overdue), a sent quote for 3 or 7 days, or one about to expire.'};

/** "1 overdue quote", "2 overdue quotes". */
export const overdueLabel=(count:number)=>`${count} overdue ${count===1?'quote':'quotes'}`;

/** "1 unread quote", "2 unread quotes". */
export const unreadLabel=(count:number)=>`${count} unread ${count===1?'quote':'quotes'}`;

const quotesCount=(count:number)=>`${count} ${count===1?'quote':'quotes'}`;
/** What a reassignment did (task D2): "Reassigned 2 quotes to Eli Porter.", and any the rep already had. */
export function reassignedLabel({to,moved,skipped}:Pick<ReassignResult,'to'|'moved'|'skipped'>){
  const already=skipped.length?` ${quotesCount(skipped.length)} ${skipped.length===1?'was':'were'} already ${to.name}’s.`:'';
  return moved.length?`Reassigned ${quotesCount(moved.length)} to ${to.name}.${already}`:`Nothing moved.${already}`;
}
