import {describe,expect,it} from 'vitest';
import {QUOTE_STATUSES,type QuoteStatus} from '@/domain';
import {QuoteActionError} from './errors';
import {
  QUOTE_EVENTS,STATUS_LABELS,TRANSITIONS,assertEvent,canEditDraft,canTransition,customerCanRespond,effectiveStatus,eventsFrom,expiresAt,isExpired,
  nextStatus,quoteOutcome,validUntilFor,winRate,type QuoteEvent,
} from './lifecycle';

// Spec §5.4 (and §7.2: every illegal transition, double send, the expiry boundary).

/** The six legal edges of §5.4 and v3 spec §2 (decline), as [from, event, to]. Everything else is illegal. */
const LEGAL:[QuoteStatus,QuoteEvent,QuoteStatus][]=[
  ['ready_for_review','send','sent'],
  ['changes_requested','send','sent'],
  ['sent','accept','accepted'],
  ['sent','request_changes','changes_requested'],
  ['sent','expire','expired'],
  ['sent','decline','declined'],
];
const pairs=QUOTE_STATUSES.flatMap(from=>QUOTE_EVENTS.map(event=>[from,event] as const));
const illegal=pairs.filter(([from,event])=>!LEGAL.some(([f,e])=>f===from&&e===event));

describe('transition table',()=>{
  it('has exactly the six edges of spec §5.4 and v3 §2',()=>{
    expect(pairs).toHaveLength(36);
    expect(pairs.filter(([from,event])=>nextStatus(from,event)!==null).map(([from,event])=>[from,event,nextStatus(from,event)])).toEqual(expect.arrayContaining(LEGAL));
    expect(pairs.filter(([from,event])=>nextStatus(from,event)!==null)).toHaveLength(LEGAL.length);
  });

  it.each(LEGAL)('allows %s --%s--> %s',(from,event,to)=>{
    expect(nextStatus(from,event)).toBe(to);
    expect(assertEvent({status:from,quote_number:'Q-1'},event)).toBe(to);
    expect(canTransition(from,to)).toBe(true);
  });

  it.each(illegal)('rejects %s --%s-->',(from,event)=>{
    expect(nextStatus(from,event)).toBeNull();
    let error:unknown;
    try{assertEvent({status:from,quote_number:'Q-24817'},event);}catch(e){error=e;}
    expect(error).toBeInstanceOf(QuoteActionError);
    expect(error).toMatchObject({code:'illegal_transition',httpStatus:409});
    expect((error as Error).message).toContain('Q-24817');
    expect((error as Error).message).toContain(STATUS_LABELS[from]);
  });

  it('allows no status-to-status move outside the six edges (36 pairs)',()=>{
    const moves=QUOTE_STATUSES.flatMap(from=>QUOTE_STATUSES.map(to=>[from,to] as const));
    expect(moves).toHaveLength(36);
    const legal=moves.filter(([from,to])=>canTransition(from,to));
    expect(legal).toEqual(expect.arrayContaining(LEGAL.map(([from,,to])=>[from,to])));
    expect(legal).toHaveLength(6);
  });

  it('rejects a double send: sent --send--> is illegal',()=>{
    expect(nextStatus('sent','send')).toBeNull();
    expect(canTransition('sent','sent')).toBe(false);
    expect(()=>assertEvent({status:'sent',quote_number:'Q-24817'},'send')).toThrow('Can\'t send Q-24817: it is Sent.');
  });

  it('has no rep-side changes-requested move: the rep never enters changes_requested',()=>{
    expect(QUOTE_STATUSES.filter(from=>canTransition(from,'changes_requested'))).toEqual(['sent']);
    expect(TRANSITIONS.request_changes.actor).toBe('customer');
  });

  it('lists the events each status allows; accepted, expired and declined are final',()=>{
    expect(Object.fromEntries(QUOTE_STATUSES.map(s=>[s,eventsFrom(s)]))).toEqual({
      ready_for_review:['send'],sent:['accept','request_changes','expire','decline'],accepted:[],changes_requested:['send'],expired:[],declined:[],
    });
  });

  it('lets only the customer decline, and only a sent quote (v3 spec §2, decision 13)',()=>{
    expect(TRANSITIONS.decline).toEqual({from:['sent'],to:'declined',actor:'customer'});
    expect(QUOTE_STATUSES.filter(from=>canTransition(from,'declined'))).toEqual(['sent']);
    expect(()=>assertEvent({status:'declined',quote_number:'Q-24817'},'accept')).toThrow('Can\'t accept Q-24817: it is Declined.');
    expect(()=>assertEvent({status:'expired',quote_number:'Q-24817'},'decline')).toThrow('Can\'t decline Q-24817: it is Expired.');
  });

  it('lets the rep edit the draft only while it can be sent',()=>{
    expect(QUOTE_STATUSES.filter(canEditDraft)).toEqual(['ready_for_review','changes_requested']);
  });

  it('labels statuses like the customer\'s status chips (spec §3)',()=>{
    expect(STATUS_LABELS).toEqual({ready_for_review:'Awaiting rep',sent:'Sent',accepted:'Accepted',changes_requested:'Changes requested',expired:'Expired',declined:'Declined'});
  });
});

describe('valid until',()=>{
  it('is the UTC day of the send plus valid_days (mockup: sent Sep 23, valid until Oct 7)',()=>{
    expect(validUntilFor('2026-09-23T16:30:00.000Z',14)).toBe('2026-10-07');
    expect(validUntilFor('2026-09-23T23:59:59.999Z',7)).toBe('2026-09-30');
    expect(validUntilFor('2026-09-24T00:00:00.000Z',30)).toBe('2026-10-24');
    // An offset timestamp is read in UTC: 20:00 at UTC-6 is 02:00Z the next day.
    expect(validUntilFor('2026-09-23T20:00:00-06:00',14)).toBe('2026-10-08');
  });

  it('rejects a malformed send time',()=>{
    expect(()=>validUntilFor('yesterday',14)).toThrow(RangeError);
  });
});

describe('expiry: sent --(now > valid_until)--> expired',()=>{
  const V='2026-10-07';
  it('keeps the quote valid through the whole valid_until day (UTC)',()=>{
    expect(expiresAt(V)).toBe('2026-10-08T00:00:00.000Z');
    expect(isExpired(V,'2026-09-23T16:30:00.000Z')).toBe(false);
    expect(isExpired(V,'2026-10-06T23:59:59.999Z')).toBe(false);
  });

  it('is not expired exactly at valid_until, nor at its last millisecond',()=>{
    expect(isExpired(V,'2026-10-07T00:00:00.000Z')).toBe(false);
    expect(isExpired(V,'2026-10-07T23:59:59.999Z')).toBe(false);
  });

  it('is expired from the first instant after the valid_until day',()=>{
    expect(isExpired(V,'2026-10-08T00:00:00.000Z')).toBe(true);
    expect(isExpired(V,'2026-11-01T12:00:00.000Z')).toBe(true);
  });

  it('never expires a quote with no valid_until (never sent)',()=>{
    expect(isExpired(null,'2099-01-01T00:00:00.000Z')).toBe(false);
  });

  it('rejects malformed dates instead of guessing',()=>{
    expect(()=>isExpired('Oct 7',V)).toThrow(RangeError);
    expect(()=>isExpired('2026-02-30','2026-03-01T00:00:00.000Z')).toThrow(RangeError);
    expect(()=>isExpired(V,'soon')).toThrow(RangeError);
  });

  it('shows a sent quote past valid_until as expired before the sweep stores it; other statuses are as stored',()=>{
    const after='2026-10-08T00:00:00.000Z';
    expect(effectiveStatus({status:'sent',valid_until:V},after)).toBe('expired');
    expect(effectiveStatus({status:'sent',valid_until:V},'2026-10-07T23:59:59.999Z')).toBe('sent');
    // Only `sent` expires: a changes request waits for the rep however old its valid_until is.
    for(const status of ['ready_for_review','accepted','changes_requested','expired','declined'] as const)expect(effectiveStatus({status,valid_until:V},after)).toBe(status);
  });

  it('disables the customer\'s action bar unless the quote is sent and not expired',()=>{
    expect(customerCanRespond({status:'sent',valid_until:V},'2026-10-07T23:59:59.999Z')).toBe(true);
    expect(customerCanRespond({status:'sent',valid_until:V},'2026-10-08T00:00:00.000Z')).toBe(false);
    for(const status of ['ready_for_review','accepted','changes_requested','expired','declined'] as const)expect(customerCanRespond({status,valid_until:V},'2026-09-24T00:00:00.000Z')).toBe(false);
  });
});

describe('win/loss (lost quotes are stored as expired, task 0.2)',()=>{
  const now='2026-09-24T00:00:00.000Z';
  it('counts accepted as won, expired as lost, and everything still in play as open',()=>{
    expect(quoteOutcome({status:'accepted',valid_until:'2026-09-01'},now)).toBe('won');
    expect(quoteOutcome({status:'expired',valid_until:'2026-09-01'},now)).toBe('lost');
    expect(quoteOutcome({status:'declined',valid_until:'2026-10-07'},now)).toBe('lost');
    expect(quoteOutcome({status:'sent',valid_until:'2026-10-07'},now)).toBe('open');
    expect(quoteOutcome({status:'ready_for_review',valid_until:null},now)).toBe('open');
    expect(quoteOutcome({status:'changes_requested',valid_until:'2026-09-01'},now)).toBe('open');
  });

  it('counts a sent quote past valid_until as lost even before the sweep stores it',()=>{
    expect(quoteOutcome({status:'sent',valid_until:'2026-09-22'},now)).toBe('lost');
  });

  it('computes the win rate over decided quotes only, or null with none decided',()=>{
    const decided=(status:QuoteStatus,n:number)=>Array.from({length:n},()=>({status,valid_until:'2026-09-01' as string|null}));
    const list=[...decided('accepted',17),...decided('expired',5),...decided('declined',2),{status:'ready_for_review' as const,valid_until:null},{status:'sent' as const,valid_until:'2026-10-07'}];
    const rate=winRate(list,now);
    expect(rate).toMatchObject({won:17,lost:7,open:2});
    expect(rate.rate).toBeCloseTo(17/24,10);
    expect(Math.round(rate.rate!*100)).toBe(71);
    expect(winRate([{status:'sent',valid_until:'2026-10-07'}],now)).toEqual({won:0,lost:0,open:1,rate:null});
  });
});
