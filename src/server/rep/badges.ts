import 'server-only';
import {AGING_LABELS} from '@/server/quotes/aging';
import {expireOverdueQuotes} from '@/server/quotes/service';
import {unreadQuoteCount,unreadQuoteEvents,type UnreadQuoteEvent} from '@/server/repository';
import {ownerFilter} from './access';
import {attentionQuotes,redQuoteCount} from './quotes';

// The rep portal's header badges (spec §4; plan U2): counts plus short summaries for the page
// header's two dropdowns, the caution (Needs attention, C_QOB3) and the bell (Notifications, C_QOB4).
//
// "Unread" is the quote's unread_for_rep flag (task 0.2):
//   set    when the customer presses Request quote (a new ready_for_review quote, spec §3),
//          accepts, requests changes (spec §5.4) or declines (decision 15);
//   clear  when the rep sends the quote, or opens it (markQuoteRead(id,'rep'), which the quote
//          detail page calls, task 3.3).
// The bell lists the reader's own unread quotes, one row each for the customer's latest event, and
// `quotes` counts them. Unread stays each owner's flag, for the manager too (task U1).
//
// The caution lists the amber and red open quotes, the same quotes as the Quotes list's Needs
// attention view (decision 18, aging rules unchanged): the rep's own, or every rep's for the manager
// (task U1). `attention` counts the red ones only (decision 18: the header badge counts red).
//
// Notification preferences (Appendix C rep_notification_prefs) come with plan U9: it passes the
// reader's choices as `notify`, which keeps or drops each summary by its kind. Counts ignore it.

/** What a summary is about: the event keys of Appendix C where one exists, plus a new quote request. */
export type NotificationKind='quote_overdue'|'quote_aging'|'quote_requested'|'change_requested'|'quote_accepted'|'quote_declined'|'quote_expired';

/** One row of a header dropdown. Selecting it opens /rep/quotes/<quote_number>. */
export interface BadgeSummary {
  /** The quote's id. */
  id:string;
  quote_number:string;
  kind:NotificationKind;
  /** The row's bold text: "Q-24790" (caution) or "Dana Ortiz replied on Q-24790" (bell). */
  label:string;
  /** The word on the right: "Overdue" or "Aging" (caution); null on the bell. */
  tag:string|null;
  /** The one line under it (caution). Null on the bell, which prints `at` in the browser's time zone. */
  line:string|null;
  /** When the event happened (bell), or when the quote's aging clock started (caution). */
  at:string;
}

export interface RepBadges {
  /** The reader's unread quotes (the bell's rows before preferences). */
  quotes:number;
  /** The red (Overdue) open quotes: the rep's own, or every rep's for the manager (task U1). */
  attention:number;
  /** The caution dropdown: amber and red open quotes, red first, then the longest waiting. */
  caution:BadgeSummary[];
  /** The bell dropdown: the reader's unread customer events, newest first. */
  bell:BadgeSummary[];
}

/**
 * The caution row's one line, from the aging reason (quotes/aging.ts), one short sentence as C_QOB3
 * draws ("Sent Oct 6, no reply yet."): "Sent 4 days ago · Expires today" -> "Sent 4 days ago, expires today."
 */
const sentence=(reason:string)=>`${reason.split(' · ').map((part,i)=>i?part.charAt(0).toLowerCase()+part.slice(1):part).join(', ')}.`;

/**
 * The bell's words for an unread quote, as C_QOB4 words its rows ("Dana Ortiz replied on Q-24790",
 * "Q-24763 accepted by Canyon Ridge", "Q-24815 expired"). Who: the quote's contact, as the frame's
 * first row names Dana Ortiz, else the customer.
 */
function bellSummary(e:UnreadQuoteEvent):BadgeSummary{
  const base={id:e.id,quote_number:e.quote_number,tag:null,line:null};
  const who=e.contact_name??e.customer_name,responded=e.responded_at??e.requested_at;
  switch(e.status){
    case 'changes_requested':return {...base,kind:'change_requested',label:`${who} replied on ${e.quote_number}`,at:responded};
    case 'accepted':return {...base,kind:'quote_accepted',label:`${e.quote_number} accepted by ${who}`,at:responded};
    case 'declined':return {...base,kind:'quote_declined',label:`${e.quote_number} declined by ${who}`,at:responded};
    case 'expired':return {...base,kind:'quote_expired',label:`${e.quote_number} expired`,at:responded};
    default:return {...base,kind:'quote_requested',label:`${e.quote_number} requested by ${who}`,at:e.requested_at};
  }
}

const RANK={red:0,amber:1,ok:2} as const;

/**
 * The header badges for one rep. Expiry is lazy (task 1.5), so this stores the expiry of every sent
 * quote past valid_until first; everything then reads effective statuses. `manager` (repAccess): the
 * caution covers every rep (task U1). `notify`: the reader's notification preferences (plan U9).
 * `now` is for tests.
 */
export function repBadges(repId:string,{now=new Date().toISOString(),manager=false,notify=()=>true}:{now?:string;manager?:boolean;notify?:(kind:NotificationKind)=>boolean}={}):RepBadges{
  expireOverdueQuotes({now});
  const owner=ownerFilter({repId,manager});
  const caution=attentionQuotes(owner,now)
    .sort((a,b)=>RANK[a.aging.level]-RANK[b.aging.level]||Date.parse(a.aging.since)-Date.parse(b.aging.since))
    .map((row):BadgeSummary=>{
      const red=row.aging.level==='red';
      return {id:row.id,quote_number:row.quote_number,kind:red?'quote_overdue':'quote_aging',label:row.quote_number,
        tag:AGING_LABELS[red?'red':'amber'],line:sentence(row.aging.reason),at:row.aging.since};
    });
  const bell=unreadQuoteEvents(repId).map(bellSummary).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  return {quotes:unreadQuoteCount(repId),attention:redQuoteCount(owner,now),
    caution:caution.filter(item=>notify(item.kind)),bell:bell.filter(item=>notify(item.kind))};
}
