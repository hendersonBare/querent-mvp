import {describe,expect,it} from 'vitest';
import type {QuoteStatus} from '@/domain';
import {AGING_DEFAULTS,AGING_LABELS,AGING_LIMITS,aging,checkAgingThresholds,needsAttention,type AgingThresholds} from './aging';

// v3 spec §3 (decision 16, 18): aging is derived on read from the effective status and its clock.

type Q=Parameters<typeof aging>[0];
const H=3_600_000;
const plus=(iso:string,hours:number)=>new Date(Date.parse(iso)+hours*H).toISOString();
const START='2026-10-01T15:00:00.000Z';
const draft=(status:QuoteStatus='ready_for_review',over:Partial<Q>={}):Q=>({status,created_at:START,responded_at:null,sent_at:null,valid_until:null,...over});
const sent=(over:Partial<Q>={}):Q=>({status:'sent',created_at:'2026-09-30T09:00:00.000Z',responded_at:null,sent_at:START,valid_until:'2026-10-30',...over});
const level=(q:Q,now:string,t?:AgingThresholds)=>aging(q,now,t)?.level;

describe('aging: defaults and labels',()=>{
  it('uses the decision 16 thresholds in hours',()=>{
    expect(AGING_DEFAULTS).toEqual({rfrAmberH:4,rfrRedH:24,crAmberH:4,crRedH:24,sentAmberH:72,sentRedH:168});
    expect(AGING_LABELS).toEqual({amber:'Aging',red:'Overdue'});
  });
});

describe('aging: ready_for_review, from created_at (4 h / 24 h)',()=>{
  it.each([
    [0,'ok'],[4-1/3600,'ok'],[4,'amber'],[23.99,'amber'],[24,'red'],[24*30,'red'],
  ] as const)('%s h after creation is %s',(hours,want)=>{
    expect(level(draft(),plus(START,hours))).toBe(want);
  });

  it('starts the clock at created_at and says how long the draft has waited',()=>{
    expect(aging(draft(),plus(START,6))).toEqual({level:'amber',since:START,reason:'Requested 6 hours ago'});
    expect(aging(draft(),plus(START,30))?.reason).toBe('Requested 30 hours ago');
    expect(aging(draft(),plus(START,24*17+5))?.reason).toBe('Requested 17 days ago');
    expect(aging(draft(),plus(START,0.5))?.reason).toBe('Requested less than an hour ago');
    expect(aging(draft(),plus(START,1))?.reason).toBe('Requested 1 hour ago');
  });
});

describe('aging: changes_requested, from responded_at (4 h / 24 h)',()=>{
  const responded='2026-10-05T08:00:00.000Z';
  const cr=draft('changes_requested',{sent_at:START,responded_at:responded,valid_until:'2026-10-15'});
  it.each([
    [3.99,'ok'],[4,'amber'],[23.99,'amber'],[24,'red'],
  ] as const)('%s h after the request is %s',(hours,want)=>{
    expect(level(cr,plus(responded,hours))).toBe(want);
  });

  it('ignores how old the quote itself is, and its old valid_until',()=>{
    expect(aging(cr,plus(responded,1))).toEqual({level:'ok',since:responded,reason:'Changes requested 1 hour ago'});
    // valid_until has passed, but the quote is a draft again: no expiry rule, no expired status.
    expect(level(cr,'2026-10-20T00:00:00.000Z')).toBe('red');
  });

  it('falls back to created_at when responded_at is missing',()=>{
    expect(aging(draft('changes_requested'),plus(START,5))?.since).toBe(START);
  });
});

describe('aging: sent, from sent_at (72 h / 168 h)',()=>{
  // Spec §3 worked example: sent 2026-10-01T15:00Z, valid until 2026-10-15.
  const q=sent({valid_until:'2026-10-15'});
  it.each([
    ['2026-10-04T14:59:59.999Z','ok'],
    ['2026-10-04T15:00:00.000Z','amber'],
    ['2026-10-08T14:59:59.999Z','amber'],
    ['2026-10-08T15:00:00.000Z','red'],
  ] as const)('the worked example at %s is %s',(now,want)=>{
    expect(level(q,now)).toBe(want);
  });

  it('says how long ago it was sent',()=>{
    expect(aging(q,plus(START,24*4+3))).toEqual({level:'amber',since:START,reason:'Sent 4 days ago'});
    expect(aging(q,plus(START,20))?.reason).toBe('Sent 20 hours ago');
  });

  it('uses the latest send: a re-sent quote restarts the clock',()=>{
    const resent=sent({sent_at:'2026-10-06T15:00:00.000Z',valid_until:'2026-10-20'});
    expect(level(resent,'2026-10-08T15:00:00.000Z')).toBe('ok');
  });
});

describe('aging: sent, expiry rule (amber from 00:00Z on valid_until − 1 day, red from 00:00Z on valid_until)',()=>{
  // Spec §3: sent 10-10T09:00Z, valid until 10-14 (expires 10-15T00:00Z).
  const q=sent({sent_at:'2026-10-10T09:00:00.000Z',valid_until:'2026-10-14'});
  it.each([
    ['2026-10-12T23:59:59.999Z','ok'],
    ['2026-10-13T00:00:00.000Z','amber'],
    ['2026-10-13T23:59:59.999Z','amber'],
    ['2026-10-14T00:00:00.000Z','red'],
    ['2026-10-14T23:59:59.999Z','red'],
  ] as const)('at %s it is %s',(now,want)=>{
    expect(level(q,now)).toBe(want);
  });

  it('says when it expires',()=>{
    expect(aging(q,'2026-10-13T08:00:00.000Z')).toEqual({level:'amber',since:'2026-10-10T09:00:00.000Z',reason:'Expires tomorrow'});
    expect(aging(q,'2026-10-14T10:00:00.000Z')).toEqual({level:'red',since:'2026-10-10T09:00:00.000Z',reason:'Expires today'});
  });

  it('is null once the quote has expired (effective status)',()=>{
    expect(aging(q,'2026-10-15T00:00:00.000Z')).toBeNull();
  });
});

describe('aging: the worse level wins',()=>{
  it('red by the clock beats amber by expiry',()=>{
    const q=sent({sent_at:'2026-10-01T15:00:00.000Z',valid_until:'2026-10-09'});
    expect(aging(q,'2026-10-08T16:00:00.000Z')).toEqual({level:'red',since:'2026-10-01T15:00:00.000Z',reason:'Sent 7 days ago'});
  });

  it('red by expiry beats amber by the clock',()=>{
    const q=sent({sent_at:'2026-10-01T15:00:00.000Z',valid_until:'2026-10-05'});
    expect(aging(q,'2026-10-05T01:00:00.000Z')).toEqual({level:'red',since:'2026-10-01T15:00:00.000Z',reason:'Expires today'});
  });

  it('amber by expiry beats ok by the clock',()=>{
    const q=sent({sent_at:'2026-10-03T15:00:00.000Z',valid_until:'2026-10-05'});
    expect(level(q,'2026-10-04T01:00:00.000Z')).toBe('amber');
  });

  it('on a tie both reasons show, the clock first',()=>{
    const q=sent({sent_at:'2026-10-01T15:00:00.000Z',valid_until:'2026-10-06'});
    expect(aging(q,'2026-10-05T01:00:00.000Z')?.reason).toBe('Sent 3 days ago · Expires tomorrow');
  });
});

describe('aging: final statuses',()=>{
  it.each(['accepted','expired','declined'] as const)('%s has no aging',status=>{
    expect(aging(sent({status,responded_at:START}),'2027-01-01T00:00:00.000Z')).toBeNull();
  });
});

describe('aging: threshold overrides (settings, D1 edits them)',()=>{
  const t:AgingThresholds={rfrAmberH:1,rfrRedH:2,crAmberH:10,crRedH:20,sentAmberH:24,sentRedH:48};
  it('honours each status’s own pair',()=>{
    expect(level(draft(),plus(START,1),t)).toBe('amber');
    expect(level(draft(),plus(START,2),t)).toBe('red');
    const cr=draft('changes_requested',{responded_at:START});
    expect(level(cr,plus(START,9.99),t)).toBe('ok');
    expect(level(cr,plus(START,10),t)).toBe('amber');
    expect(level(cr,plus(START,20),t)).toBe('red');
    expect(level(sent(),plus(START,23.99),t)).toBe('ok');
    expect(level(sent(),plus(START,24),t)).toBe('amber');
    expect(level(sent(),plus(START,48),t)).toBe('red');
  });
});

describe('needsAttention',()=>{
  it('is amber or red',()=>{
    expect(needsAttention(null)).toBe(false);
    expect(needsAttention({level:'ok',since:START,reason:''})).toBe(false);
    expect(needsAttention({level:'amber',since:START,reason:''})).toBe(true);
    expect(needsAttention({level:'red',since:START,reason:''})).toBe(true);
  });
});

describe('checkAgingThresholds: what a manager may save (decision 16, task D1)',()=>{
  const ok={rfrAmberH:2,rfrRedH:12,crAmberH:6,crRedH:30,sentAmberH:48,sentRedH:120};

  it('accepts six whole hours with amber before red, within 1 h to 90 days',()=>{
    expect(AGING_LIMITS).toEqual({minH:1,maxH:2160});
    expect(checkAgingThresholds(ok)).toEqual({thresholds:ok,problem:''});
    expect(checkAgingThresholds(AGING_DEFAULTS).thresholds).toEqual(AGING_DEFAULTS);
    expect(checkAgingThresholds({...ok,rfrAmberH:1,sentRedH:2160}).thresholds).toMatchObject({rfrAmberH:1,sentRedH:2160});
    // Only the six keys come back.
    expect(checkAgingThresholds({...ok,extra:1}).thresholds).toEqual(ok);
  });

  it('names the first problem: a missing or non-whole value, out of range, or amber not before red',()=>{
    expect(checkAgingThresholds({...ok,crRedH:undefined})).toEqual({thresholds:null,problem:'Enter whole hours for Changes requested red.'});
    expect(checkAgingThresholds({...ok,rfrAmberH:2.5}).problem).toBe('Enter whole hours for Ready for review amber.');
    expect(checkAgingThresholds({...ok,rfrAmberH:'2'}).problem).toBe('Enter whole hours for Ready for review amber.');
    expect(checkAgingThresholds({...ok,sentAmberH:Number.NaN}).problem).toBe('Enter whole hours for Sent amber.');
    expect(checkAgingThresholds({...ok,rfrAmberH:0}).problem).toBe('Ready for review amber must be from 1 to 2160 hours.');
    expect(checkAgingThresholds({...ok,sentRedH:2161}).problem).toBe('Sent red must be from 1 to 2160 hours.');
    expect(checkAgingThresholds({...ok,crAmberH:30}).problem).toBe('Changes requested: amber must come before red.');
    expect(checkAgingThresholds({...ok,sentAmberH:200}).problem).toBe('Sent: amber must come before red.');
    expect(checkAgingThresholds(null)).toEqual({thresholds:null,problem:'Enter whole hours for Ready for review amber.'});
    expect(checkAgingThresholds([]).thresholds).toBeNull();
  });
});
