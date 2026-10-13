import type {QuoteStatus} from '@/domain';
import type {RepQuoteRow} from '@/server/rep/quotes';

// Words, formats and query params for the rep's Quotes page (task 3.2, plan U3). Pure, so the page, the
// list, the server (the page, the API route) and the quote page share them.

/** The status filter: ?status=<status> or a list, ?status=sent,accepted (plan U3). */
export const STATUS_PARAM='status';
/** The old Needs attention view (v3 spec §3, task A2): ?attention=1, oldest first with ?sort=oldest. The page reads it as Only show Overdue and Aging. */
export const ATTENTION_PARAM='attention';
export const SORT_PARAM='sort';
/** The Analytics drill-down into one aging level of the open quotes (?aging=ok|amber|red, the manager only, task D3). */
export const AGING_PARAM='aging';
/** The filter panel's Requested from and to (C_QOB2): YYYY-MM-DD, UTC days. */
export const REQUESTED_FROM_PARAM='requested_from';
export const REQUESTED_TO_PARAM='requested_to';
/** The filter panel's "Only show" (C_QOB2): ?only=overdue,aging,below_floor. */
export const ONLY_PARAM='only';
/** Board or Table (C_QOBoard, C_QOTable): ?view=table; the board without it. */
export const VIEW_PARAM='view';
/** ?attention=1 and nothing else turns the old Needs attention view on. */
export const isAttention=(value:string|null|undefined)=>value==='1';

/**
 * The status words (C_QOBoard lanes, C_QOTable status cell). `tone` is the quote page's chip colour
 * (src/components/rep/quote-detail, until plan U4 rebuilds it).
 */
export const REP_STATUS:Readonly<Record<QuoteStatus,{label:string;tone:'draft'|'changes'|'sent'|'accepted'|'expired'|'declined'}>>={
  ready_for_review:{label:'Draft ready',tone:'draft'},
  changes_requested:{label:'Changes requested',tone:'changes'},
  sent:{label:'Sent',tone:'sent'},
  accepted:{label:'Accepted',tone:'accepted'},
  expired:{label:'Expired',tone:'expired'},
  declined:{label:'Declined',tone:'declined'},
};

/** The board's lanes and the filter panel's statuses, in the frames' order: what needs the rep first. */
export const STATUS_FILTERS:readonly QuoteStatus[]=['ready_for_review','changes_requested','sent','accepted','expired','declined'];

const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
/** "$1,122.40", or nothing with no total. */
export const money=(n:number|null)=>n===null?'':usd.format(n);

const dayMonth=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const dayMonthYear=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
/** "Sep 23", or "Sep 30, 2025" outside `now`'s year. Days are UTC, like every date in the list. */
export function listDate(iso:string,now:string){
  const date=new Date(iso);
  return (date.getUTCFullYear()===new Date(now).getUTCFullYear()?dayMonth:dayMonthYear).format(date);
}

/** A filter day (YYYY-MM-DD) as the list prints dates, C_QOB2's "Sep 1". */
export const dayLabel=(day:string,now:string)=>listDate(`${day}T12:00:00.000Z`,now);

/** How many days back the filter panel's Requested from and to offer. */
export const DAY_CHOICES=120;
/**
 * The days Requested from and to offer (no frame: C_QOB2 draws the closed field only): `now`'s UTC day
 * back DAY_CHOICES days, newest first, with a picked day from further back in its place.
 */
export function dayChoices(now:string,picked:readonly (string|null)[]=[]):string[]{
  const today=Date.parse(`${now.slice(0,10)}T00:00:00.000Z`);
  const days=new Set(Array.from({length:DAY_CHOICES+1},(_,i)=>new Date(today-i*86_400_000).toISOString().slice(0,10)));
  for(const day of picked)if(day)days.add(day);
  return [...days].sort().reverse();
}

/** A valid-until day (YYYY-MM-DD) as the list prints dates, or nothing before the first send. */
export const validUntil=(day:string|null,now:string)=>day?listDate(`${day}T12:00:00.000Z`,now):'';

/** "1 line below floor", "3 lines below floor", or null. */
export const belowFloorNote=(count:number)=>count>0?`${count} ${count===1?'line':'lines'} below floor`:null;

/** A margin as the list prints it ("32.2%"), or nothing before anything is priced. */
export const marginText=(row:Pick<RepQuoteRow,'margin'|'margin_label'>)=>row.margin===null?'':row.margin_label;

/**
 * The one red line under a status (C_QOBoard, C_QOTable): the aging word ("Overdue", "Aging") and the
 * lines below the floor, "Overdue. 1 line below floor"; null when nothing is wrong.
 */
export function flagText(row:Pick<RepQuoteRow,'aging'|'below_floor_count'>):string|null{
  const parts=[row.aging?.level==='red'?'Overdue':row.aging?.level==='amber'?'Aging':null,belowFloorNote(row.below_floor_count)].filter(Boolean);
  return parts.length?parts.join('. '):null;
}

/** Who a reply goes to (C_QOB5 "Reply to Dana"): the contact's first name, else the customer. */
export const replyTo=(row:Pick<RepQuoteRow,'change_request'|'customer_name'>)=>row.change_request?.by?.trim().split(/\s+/)[0]||row.customer_name;

const shortDay=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'});
const dayTime=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
/** When the customer wrote the note, in the browser's time zone (decision 10): "Oct 9" (C_QOB5), or with the time "Oct 9, 4:12 PM" (C_QOB6). */
export const noteDay=(iso:string)=>shortDay.format(new Date(iso));
export const noteTime=(iso:string)=>dayTime.format(new Date(iso));

/** The rows a refresh failure leaves on screen, with one plain line (decision 52). */
export const REFRESH_PROBLEM='Unable to refresh quotes. Trying again in a few seconds.';
/** An empty lane (C_QOBoard Declined), and an empty table (no frame: the same words, decision 52). */
export const EMPTY_LANE='No quotes here';
