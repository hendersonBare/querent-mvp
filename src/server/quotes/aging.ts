import type {QuoteHeader} from '@/domain';
import {effectiveStatus,expiresAt} from './lifecycle';

// Aging (v3 spec §3, decisions 12, 16, 18): how long a quote has waited on the rep or the
// customer, derived on read from its effective status and that status's clock, never stored.
// Pure, with no server imports (like ./lifecycle), so the Quotes list, the header badge and the
// quote page share one rule:
//
//   ready_for_review   clock from created_at     amber at 4 h,  red at 24 h
//   changes_requested  clock from responded_at   amber at 4 h,  red at 24 h
//   sent               clock from sent_at        amber at 72 h, red at 168 h (the latest send)
//   sent, also         amber from 00:00Z on valid_until - 1 day, red from 00:00Z on valid_until
//
// Wall-clock hours (no business hours: out of scope). A level starts at its threshold instant, and
// the worse of the two sent rules wins. Final statuses (accepted, expired, declined) have no aging.
// The thresholds are supplier settings (repository/settings agingThresholds, edited by managers in D1).
//
// Aging only marks quotes; nothing here sends anything.
// TODO(R-7): email and SMS reminders, a scheduler, Apollo and Twilio integrations (deferred, decision 19).
// TODO(R-8): reminder ladders, digests, snooze, auto-reassignment and auto-drafted follow-ups built on these levels.
// TODO(R-3): when demo outreach is built, add idempotency and scheduling (send once at quote creation).

export type AgingLevel='ok'|'amber'|'red';

/** Hours to amber and to red per status clock (spec §1.3 aging_* settings). */
export interface AgingThresholds {rfrAmberH:number;rfrRedH:number;crAmberH:number;crRedH:number;sentAmberH:number;sentRedH:number}

/** Decision 16: 4 h / 24 h for drafts and change requests, 3 / 7 days for sent quotes. */
export const AGING_DEFAULTS:Readonly<AgingThresholds>={rfrAmberH:4,rfrRedH:24,crAmberH:4,crRedH:24,sentAmberH:72,sentRedH:168};

export interface Aging {
  level:AgingLevel;
  /** When the status's clock started (created_at, responded_at or sent_at): "oldest first" sorts on it. */
  since:string;
  /** Why, for the marker's tooltip: "Sent 4 days ago", "Expires tomorrow". */
  reason:string;
}

/** The marker's text label (decision 18: a word and an icon besides the colour). */
export const AGING_LABELS:Readonly<Record<Exclude<AgingLevel,'ok'>,string>>={amber:'Aging',red:'Overdue'};

export type Ageable=Pick<QuoteHeader,'status'|'created_at'|'responded_at'|'sent_at'|'valid_until'>;

const H=3_600_000,DAY=86_400_000;
const RANK:Record<AgingLevel,number>={ok:0,amber:1,red:2};

/** "less than an hour", "1 hour", "30 hours" (under two days), then whole days: "4 days". */
function elapsed(ms:number){
  const hours=Math.floor(ms/H);
  if(hours<1)return 'less than an hour';
  if(hours<48)return `${hours} ${hours===1?'hour':'hours'}`;
  const days=Math.floor(ms/DAY);
  return `${days} days`;
}

const byClock=(ageMs:number,amberH:number,redH:number):AgingLevel=>ageMs>=redH*H?'red':ageMs>=amberH*H?'amber':'ok';

/** A sent quote's expiry rule: red on its last day, amber the day before (both from 00:00Z). */
function byExpiry(validUntil:string|null,nowMs:number):AgingLevel{
  if(!validUntil)return 'ok';
  const expires=Date.parse(expiresAt(validUntil));
  return nowMs>=expires-DAY?'red':nowMs>=expires-2*DAY?'amber':'ok';
}

/**
 * The quote's aging at `now`, or null for a final status. `thresholds` defaults to decision 16;
 * pass the supplier's settings to honour a manager's overrides.
 */
export function aging(q:Ageable,now:string,thresholds:AgingThresholds=AGING_DEFAULTS):Aging|null{
  const status=effectiveStatus(q,now),nowMs=Date.parse(now);
  const clock=(since:string,amberH:number,redH:number,words:string)=>{
    const age=nowMs-Date.parse(since);
    return {level:byClock(age,amberH,redH),since,reason:`${words} ${elapsed(Math.max(0,age))} ago`};
  };
  switch(status){
    case 'ready_for_review':return clock(q.created_at,thresholds.rfrAmberH,thresholds.rfrRedH,'Requested');
    case 'changes_requested':return clock(q.responded_at??q.created_at,thresholds.crAmberH,thresholds.crRedH,'Changes requested');
    case 'sent':{
      const sent=clock(q.sent_at??q.created_at,thresholds.sentAmberH,thresholds.sentRedH,'Sent');
      const expiry=byExpiry(q.valid_until,nowMs);
      if(RANK[expiry]===0||RANK[expiry]<RANK[sent.level])return sent;
      const expiryReason=expiry==='red'?'Expires today':'Expires tomorrow';
      return {level:expiry,since:sent.since,reason:expiry===sent.level?`${sent.reason} · ${expiryReason}`:expiryReason};
    }
    default:return null;
  }
}

/** Amber or red: the quote belongs in the Needs attention filter. */
export const needsAttention=(a:Aging|null)=>a!==null&&a.level!=='ok';
