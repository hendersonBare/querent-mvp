import type {ActivityActor,QuoteHeader,QuoteStatus} from '@/domain';
import {QuoteActionError} from './errors';

// The quote lifecycle (spec §5.4). This module is the one place that decides which status
// moves are legal. It is pure, with no server imports, so the rep portal and the customer's
// PDF modal can use it to enable buttons:
//
//   ready_for_review  --send (rep: Approve & send + Confirm)-->            sent (rev n)
//   sent              --accept (customer: time + PO + Confirm)-->          accepted
//   sent              --request_changes (customer: note + Confirm)-->      changes_requested
//   changes_requested --send (rep edits the draft, Approve & send)-->      sent (rev n+1)
//   sent              --expire (system: now > valid_until)-->              expired
//
// Every other status/event pair is illegal, including a double send (sent --send-->). Accepted
// and expired are final; the rep can only Duplicate them. There is no rep-side "changes
// requested" state: the rep edits the draft directly while it is ready_for_review or
// changes_requested.
//
// There is no "lost" status either: a quote the customer never accepted ends as `expired`, and
// the seed stores its 7 lost historical quotes that way (task 0.2). quoteOutcome() and winRate()
// therefore count expired as lost, and so does a sent quote already past valid_until.

export const QUOTE_EVENTS=['send','accept','request_changes','expire'] as const;
export type QuoteEvent=typeof QUOTE_EVENTS[number];

export interface TransitionRule {from:readonly QuoteStatus[];to:QuoteStatus;actor:Extract<ActivityActor,'rep'|'customer'|'system'>}

export const TRANSITIONS:Readonly<Record<QuoteEvent,TransitionRule>>={
  send:{from:['ready_for_review','changes_requested'],to:'sent',actor:'rep'},
  accept:{from:['sent'],to:'accepted',actor:'customer'},
  request_changes:{from:['sent'],to:'changes_requested',actor:'customer'},
  expire:{from:['sent'],to:'expired',actor:'system'},
};

/** Status chip labels (spec §3). */
export const STATUS_LABELS:Readonly<Record<QuoteStatus,string>>={
  ready_for_review:'Awaiting rep',sent:'Sent',accepted:'Accepted',changes_requested:'Changes requested',expired:'Expired',
};

const VERBS:Record<QuoteEvent,string>={send:'send',accept:'accept',request_changes:'request changes to',expire:'expire'};

/** The status `event` moves `from` to, or null when the move is illegal. */
export function nextStatus(from:QuoteStatus,event:QuoteEvent):QuoteStatus|null{
  const rule=TRANSITIONS[event];
  return rule.from.includes(from)?rule.to:null;
}

/** The events a quote in `status` allows, in QUOTE_EVENTS order. Empty for the final statuses. */
export const eventsFrom=(status:QuoteStatus)=>QUOTE_EVENTS.filter(event=>nextStatus(status,event)!==null);

/** Whether any event moves `from` to `to`. */
export const canTransition=(from:QuoteStatus,to:QuoteStatus)=>QUOTE_EVENTS.some(event=>nextStatus(from,event)===to);

/** The rep edits the draft directly, and only while it can be sent (spec §5.4). */
export const canEditDraft=(status:QuoteStatus)=>nextStatus(status,'send')!==null;

/** The status `event` leads to. Throws QuoteActionError('illegal_transition') when the quote's status doesn't allow it. */
export function assertEvent(q:Pick<QuoteHeader,'status'|'quote_number'>,event:QuoteEvent):QuoteStatus{
  const to=nextStatus(q.status,event);
  if(to===null)throw new QuoteActionError('illegal_transition',`Can't ${VERBS[event]} ${q.quote_number}: it is ${STATUS_LABELS[q.status]}.`);
  return to;
}

// ---- Expiry ----
// valid_until is a day (YYYY-MM-DD). The quote is valid through that whole day and expires at
// the first instant after it. Days are UTC, like every other date in the app (seed anchor,
// today()); moving the cutoff to the branch's local midnight means changing only this block.

const DAY=/^\d{4}-\d{2}-\d{2}$/;
const DAY_MS=86_400_000;

function parseDay(day:string){
  const ms=DAY.test(day)?Date.parse(`${day}T00:00:00.000Z`):NaN;
  if(Number.isNaN(ms)||new Date(ms).toISOString().slice(0,10)!==day)throw new RangeError(`Expected a day like 2026-10-07 (got "${day}").`);
  return ms;
}
function parseInstant(iso:string){
  const ms=Date.parse(iso);
  if(Number.isNaN(ms))throw new RangeError(`Expected an ISO timestamp (got "${iso}").`);
  return ms;
}

/** valid_until for a quote sent at `sentAt`: the send's UTC day plus valid_days (sent Sep 23, 14 days: Oct 7). */
export function validUntilFor(sentAt:string,validDays:number){
  const day=new Date(parseInstant(sentAt)).toISOString().slice(0,10);
  return new Date(parseDay(day)+validDays*DAY_MS).toISOString().slice(0,10);
}

/**
 * valid_until for a quote sent at `sentAt`: the expiration date the rep picked, or the send's UTC
 * day plus valid_days when they didn't.
 */
export function validUntilOnSend(q:{expires_on:string|null;valid_days:number},sentAt:string){
  return q.expires_on??validUntilFor(sentAt,q.valid_days);
}

/** The latest expiration date a rep can pick: this many days after today. */
export const MAX_EXPIRATION_DAYS=365;

/** `days` after the UTC day of `from`, as YYYY-MM-DD. */
export const dayAfter=(from:string,days:number)=>validUntilFor(from,days);

/**
 * Why `day` can't be the expiration date the rep picks on `now` (it must be a real date, after
 * today and within MAX_EXPIRATION_DAYS), or null when it can.
 */
export function expirationProblem(day:string,now:string):string|null{
  try{parseDay(day);}catch{return 'Pick a real date, like 2026-10-30.';}
  const days=daysUntil(now,day);
  if(days<1)return 'Pick an expiration date after today.';
  if(days>MAX_EXPIRATION_DAYS)return `Pick an expiration date within ${MAX_EXPIRATION_DAYS} days.`;
  return null;
}

/** The UTC day (YYYY-MM-DD) of an ISO timestamp. */
export const utcDay=(at:string)=>new Date(parseInstant(at)).toISOString().slice(0,10);

/** Whole days from the UTC day of `from` to the day `until` (YYYY-MM-DD). */
export function daysUntil(from:string,until:string){
  return Math.round((parseDay(until)-parseDay(utcDay(from)))/DAY_MS);
}

/** The instant a quote valid until `validUntil` expires: 00:00Z on the day after. */
export const expiresAt=(validUntil:string)=>new Date(parseDay(validUntil)+DAY_MS).toISOString();

/** now > valid_until, where valid_until covers its whole day. A quote with no valid_until (never sent) never expires. */
export function isExpired(validUntil:string|null,now:string){
  if(validUntil===null)return false;
  return parseInstant(now)>=parseDay(validUntil)+DAY_MS;
}

type Expirable=Pick<QuoteHeader,'status'|'valid_until'>;

/** The status to show now: a sent quote past valid_until reads as expired before the sweep stores it. */
export const effectiveStatus=(q:Expirable,now:string):QuoteStatus=>q.status==='sent'&&isExpired(q.valid_until,now)?'expired':q.status;

/** Whether the customer's Accept / Request changes bar is enabled (spec §3): the quote is sent and not expired. */
export const customerCanRespond=(q:Expirable,now:string)=>effectiveStatus(q,now)==='sent';

// ---- Win/loss ----

export type QuoteOutcome='won'|'lost'|'open';

/** accepted = won; expired (the seed's lost quotes, and any sent quote past valid_until) = lost; anything still in play = open. */
export function quoteOutcome(q:Expirable,now:string):QuoteOutcome{
  const status=effectiveStatus(q,now);
  return status==='accepted'?'won':status==='expired'?'lost':'open';
}

/** Quote win rate = won / (won + lost), or null when nothing is decided yet. Open quotes don't count. */
export function winRate(quotes:readonly Expirable[],now:string){
  const counts={won:0,lost:0,open:0};
  for(const q of quotes)counts[quoteOutcome(q,now)]++;
  const decided=counts.won+counts.lost;
  return {...counts,rate:decided?counts.won/decided:null};
}
