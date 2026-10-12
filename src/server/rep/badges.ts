import 'server-only';
import {quoteFloors} from '@/server/floors/service';
import {AGING_LABELS} from '@/server/quotes/aging';
import {expiresAt} from '@/server/quotes/lifecycle';
import {expireOverdueQuotes} from '@/server/quotes/service';
import {quote,unreadQuoteCount,unreadQuoteEvents,type UnreadQuoteEvent} from '@/server/repository';
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
  /**
   * The one line under it: C_QOB3's sentence (caution), or an expired bell row's day ("Sep 18"). Null on
   * the other bell rows, which print `at` in the browser's time zone ("Oct 9, 4:12 PM").
   */
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

const dayMonth=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const dayMonthYear=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
/** "Oct 6", or "Sep 30, 2025" outside `now`'s year. Days are UTC, like every date in the app (the Quotes list's listDate). */
function day(iso:string,now:string){
  const date=new Date(iso);
  return (date.getUTCFullYear()===new Date(now).getUTCFullYear()?dayMonth:dayMonthYear).format(date);
}

/** About one row of the 360px dropdown at 13.5px (326px of text, about 6.4px a character): C_QOB3's lines each fit on one. */
const LINE_MAX=48;
/** A request's polite opening, which "asked to" replaces: "Can you", "Could we", "Please", "We need to". */
const OPENING=/^(?:(?:can|could|would|will) (?:you|we)|(?:i|we)(?: would|'d|’d) like to|(?:i|we) (?:need|want) to|please)\b[\s,]*/i;
/** First words that cannot follow "asked to" (the note is not worded as a request). */
const NOT_A_VERB=new Set(['the','this','that','these','those','it','its',"it's",'we','i','our','my','there','a','an','your','you','they','he','she','is','are']);

/** "Ogden" stays, "Make" -> "make"; a word with another capital ("PO", "I") is kept as written. */
const lowerFirst=(text:string)=>{
  const word=text.split(/\s/)[0]!;
  return word==='I'||/[A-Z]/.test(word.slice(1))?text:text.charAt(0).toLowerCase()+text.slice(1);
};

/** `head` and `clause` as one sentence of at most LINE_MAX characters: whole, cut at the last comma that fits, or cut at a word with an ellipsis. */
function fit(head:string,clause:string){
  const whole=`${head}${clause}.`;
  if(whole.length<=LINE_MAX)return whole;
  const commas=[...clause.matchAll(/[,;]/g)].map(m=>m.index!).filter(i=>head.length+i+1<=LINE_MAX);
  if(commas.length)return `${head}${clause.slice(0,commas.at(-1)).trim()}.`;
  let kept='';
  for(const word of clause.split(/\s+/)){
    const next=kept?`${kept} ${word}`:word;
    if(head.length+next.replace(/[,;:]+$/,'').length+1>LINE_MAX)break;
    kept=next;
  }
  return `${head}${kept.replace(/[,;:]+$/,'')}…`;
}

/**
 * A change request as C_QOB3's one line, "Dana Ortiz asked to move pickup to Ogden.", from the
 * customer's note: its first line and sentence, without the polite opening or the closing mark,
 * trimmed to one row. No frame (docs/plans/status.md): a note that is not worded as a request reads
 * "Dana Ortiz asked for changes: the anchors are the wrong size.", and an empty one "… asked for changes."
 */
export function askedLine(who:string,note:string){
  const first=note.split(/\r?\n/).map(line=>line.trim()).find(Boolean)??'';
  let rest=(first.split(/(?<=[.?!])\s+/)[0]??'').replace(/[.?!…]+$/,'').trim(),asked=false;
  for(let m=rest.match(OPENING);m&&m[0];m=rest.match(OPENING)){rest=rest.slice(m[0].length).trim();asked=true;}
  if(!rest)return `${who} asked for changes.`;
  const verb=asked||!NOT_A_VERB.has(rest.split(/\s/)[0]!.toLowerCase());
  return fit(verb?`${who} asked to `:`${who} asked for changes: `,lowerFirst(rest));
}

/** The customer as C_QOB4 names it, "Q-24763 accepted by Canyon Ridge": the first two words of its name. */
export const customerShortName=(name:string)=>name.split(',')[0]!.trim().split(/\s+/).slice(0,2).join(' ');

type CautionRow=ReturnType<typeof attentionQuotes>[number];

/**
 * The caution row's one line, in C_QOB3's sentence for the quote's status:
 *   changes_requested  "Dana Ortiz asked to move pickup to Ogden."  (askedLine)
 *   ready_for_review   "Draft has 1 line below the margin floor."
 *   sent               "Sent Oct 6, no reply yet."  (also when the expiry rule made it amber or red)
 * No frame (docs/plans/status.md): a draft with no line below the floor reads "Requested Sep 23, not sent yet.",
 * after the sent pattern.
 */
function cautionLine(row:CautionRow,now:string){
  switch(row.status){
    case 'changes_requested':{
      const who=quote(row.id)?.contact_name??customerShortName(row.customer_name);
      return askedLine(who,row.change_request_note??'');
    }
    case 'ready_for_review':{
      const below=quoteFloors(row.id)?.belowFloorCount??0;
      return below>0?`Draft has ${below} ${below===1?'line':'lines'} below the margin floor.`:`Requested ${day(row.requested_at,now)}, not sent yet.`;
    }
    default:return `Sent ${day(row.sent_at??row.aging.since,now)}, no reply yet.`;
  }
}

/**
 * The bell's words for an unread quote, as C_QOB4 words its rows: "Dana Ortiz replied on Q-24790"
 * (the contact, as the frame names a person), "Q-24763 accepted by Canyon Ridge" (the customer),
 * "Q-24815 expired" over its day only ("Sep 18"). Events the frame does not sample name the contact
 * (decision 58): "Q-24818 requested by Dana Ortiz", "Q-24791 declined by Dana Ortiz".
 */
function bellSummary(e:UnreadQuoteEvent,now:string):BadgeSummary{
  const base={id:e.id,quote_number:e.quote_number,tag:null,line:null};
  const contact=e.contact_name??customerShortName(e.customer_name),responded=e.responded_at??e.requested_at;
  switch(e.status){
    case 'changes_requested':return {...base,kind:'change_requested',label:`${contact} replied on ${e.quote_number}`,at:responded};
    case 'accepted':return {...base,kind:'quote_accepted',label:`${e.quote_number} accepted by ${customerShortName(e.customer_name)}`,at:responded};
    case 'declined':return {...base,kind:'quote_declined',label:`${e.quote_number} declined by ${contact}`,at:responded};
    case 'expired':{
      // When it expired: as its valid_until day ended (lifecycle expiresAt).
      const at=e.valid_until?expiresAt(e.valid_until):responded;
      return {...base,kind:'quote_expired',label:`${e.quote_number} expired`,line:day(at,now),at};
    }
    default:return {...base,kind:'quote_requested',label:`${e.quote_number} requested by ${contact}`,at:e.requested_at};
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
        tag:AGING_LABELS[red?'red':'amber'],line:cautionLine(row,now),at:row.aging.since};
    });
  const bell=unreadQuoteEvents(repId).map(e=>bellSummary(e,now)).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  return {quotes:unreadQuoteCount(repId),attention:redQuoteCount(owner,now),
    caution:caution.filter(item=>notify(item.kind)),bell:bell.filter(item=>notify(item.kind))};
}
