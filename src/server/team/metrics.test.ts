import {describe,expect,it} from 'vitest';
import type {TeamQuoteFact,TeamStatusEvent} from '@/domain';
import {AGING_DEFAULTS} from '@/server/quotes';
import {UNTOUCHED_REASONS,teamMetricRows,type TeamRep} from './metrics';

// The Team metrics (v3 spec §7, §7.3; decisions 24, 25; OA-13, OA-15; task D3) on a fixed fixture:
// every metric per rep and in the totals row, null denominators, declined and expired kept apart,
// the status timeline (open visits counted to now, an unswept expiry ending at its expiry instant).

const NOW='2026-10-10T12:00:00.000Z';
const REPS:TeamRep[]=[{id:'mara',name:'Mara Jensen',team:'Inside Sales',active:true},{id:'eli',name:'Eli Porter',team:'Outside Sales',active:true}];

const base:Omit<TeamQuoteFact,'id'|'quote_number'|'rep_id'|'status'|'created_at'>={sent_at:null,responded_at:null,valid_until:null,fulfillment:'will_call',
  last_rep_touch_at:null,customer_viewed_at:null,decline_reason:null,decline_note:null,declined_at:null,sent_total:null,draft_total:null,
  priced_subtotal:0,priced_cost:0,recovered_cents:0,modelled_freight_cents:null,suggestion_lines:0,upsell_lines:0,suggestions_offered:0};
const fact=(id:string,rep_id:string,status:TeamQuoteFact['status'],created_at:string,more:Partial<TeamQuoteFact>={}):TeamQuoteFact=>
  ({...base,id,quote_number:`Q-${id}`,rep_id,status,created_at,...more});
const at=(day:string,hour:number)=>`2026-${day}T${String(hour).padStart(2,'0')}:00:00.000Z`;

const FACTS:TeamQuoteFact[]=[
  // Mara: accepted (delivery, recovery, a pop-up suggestion and a rep upsell line)
  fact('m1','mara','accepted',at('10-01',0),{sent_at:at('10-01',4),responded_at:at('10-02',4),valid_until:'2026-10-15',fulfillment:'delivery',sent_total:100,
    priced_subtotal:80,priced_cost:60,recovered_cents:250,modelled_freight_cents:1500,suggestion_lines:1,suggestions_offered:3,upsell_lines:1}),
  // declined with an Other note
  fact('m2','mara','declined',at('10-02',0),{sent_at:at('10-02',2),responded_at:at('10-03',2),declined_at:at('10-03',2),valid_until:'2026-10-16',sent_total:50,
    priced_subtotal:50,priced_cost:40,decline_reason:'other',decline_note:'Went with a local shop',suggestions_offered:2}),
  // sent, past valid_until but not swept yet: effective expired at 2026-10-06T00:00Z
  fact('m3','mara','sent',at('10-01',0),{sent_at:at('10-01',10),valid_until:'2026-10-05',sent_total:30,priced_subtotal:30,priced_cost:30}),
  // a draft nobody opened, 24 h old: red, unpriced
  fact('m4','mara','ready_for_review',at('10-09',12),{draft_total:20}),
  // changes requested 55 h ago: red
  fact('m5','mara','changes_requested',at('10-08',0),{sent_at:at('10-08',1),responded_at:at('10-08',5),valid_until:'2026-10-22',sent_total:70,priced_subtotal:70,priced_cost:49}),
  // Eli: sent 30 h ago (ok)
  fact('e1','eli','sent',at('10-09',0),{sent_at:at('10-09',6),valid_until:'2026-10-23',sent_total:40,priced_subtotal:40,priced_cost:30}),
  // sent 108 h ago (amber), opened by the customer after the send
  fact('e2','eli','sent',at('10-05',0),{sent_at:at('10-06',0),valid_until:'2026-10-20',customer_viewed_at:at('10-07',0),sent_total:60,priced_subtotal:60,priced_cost:45}),
  // a draft opened by the rep, 6 h old: amber
  fact('e3','eli','ready_for_review',at('10-10',6),{last_rep_touch_at:at('10-10',7),draft_total:15,priced_subtotal:15,priced_cost:12}),
  // declined with no reason
  fact('e4','eli','declined',at('10-03',0),{sent_at:at('10-03',12),responded_at:at('10-04',0),declined_at:at('10-04',0),valid_until:'2026-10-17',sent_total:25,priced_subtotal:25,priced_cost:20}),
];
const ev=(quote_id:string,kind:TeamStatusEvent['kind'],when:string):TeamStatusEvent=>({quote_id,kind,at:when});
const EVENTS:TeamStatusEvent[]=[
  ev('m1','sent',at('10-01',4)),ev('m1','accepted',at('10-02',4)),
  ev('m2','sent',at('10-02',2)),ev('m2','declined',at('10-03',2)),
  ev('m3','sent',at('10-01',10)),
  ev('m5','sent',at('10-08',1)),ev('m5','changes_requested',at('10-08',5)),
  ev('e1','sent',at('10-09',6)),
  ev('e2','sent',at('10-06',0)),
  ev('e4','sent',at('10-03',12)),ev('e4','declined',at('10-04',0)),
];

const result=teamMetricRows(REPS,FACTS,EVENTS,{now:NOW,thresholds:AGING_DEFAULTS});
const row=(id:string|null)=>id===null?result.totals:result.rows.find(r=>r.rep_id===id)!;

describe('rows',()=>{
  it('has one row per selected rep, in the order given, and a totals row',()=>{
    expect(result.rows.map(r=>[r.rep_id,r.name,r.team])).toEqual([['mara','Mara Jensen','Inside Sales'],['eli','Eli Porter','Outside Sales']]);
    expect(result.totals).toMatchObject({rep_id:null,name:'Total'});
  });
});

describe('counts per effective status, open split ok / amber / red',()=>{
  it('reads a sent quote past valid_until as expired, and keeps declined and expired apart',()=>{
    expect(row('mara').created).toBe(5);
    expect(row('mara').statuses).toEqual({ready_for_review:1,sent:0,accepted:1,changes_requested:1,expired:1,declined:1});
    expect(row('mara').open).toEqual({total:2,ok:0,amber:0,red:2});
    expect(row('eli').statuses).toEqual({ready_for_review:1,sent:2,accepted:0,changes_requested:0,expired:0,declined:1});
    expect(row('eli').open).toEqual({total:3,ok:1,amber:2,red:0});
    expect(row(null).created).toBe(9);
    expect(row(null).statuses).toEqual({ready_for_review:2,sent:2,accepted:1,changes_requested:1,expired:1,declined:2});
    expect(row(null).open).toEqual({total:5,ok:1,amber:2,red:2});
  });
});

describe('rates (cohort = created in the window)',()=>{
  it('quote-to-order = accepted ÷ created; unaccepted = (declined + expired) ÷ created; decided win = accepted ÷ (accepted + declined + expired)',()=>{
    expect(row('mara').rates).toEqual({quote_to_order:1/5,unaccepted:2/5,decided_win:1/3});
    expect(row('eli').rates).toEqual({quote_to_order:0,unaccepted:1/4,decided_win:0});
    expect(row(null).rates).toEqual({quote_to_order:1/9,unaccepted:3/9,decided_win:1/4});
  });
});

describe('times from the quote_activity timeline (mean hours)',()=>{
  it('time to send: created to the first send, over quotes ever sent',()=>{
    expect(row('mara').hours.to_send).toBeCloseTo(17/4);
    expect(row('eli').hours.to_send).toBeCloseTo(14);
    expect(row(null).hours.to_send).toBeCloseTo(59/7);
  });
  it('customer response: each send to the next accepted, changes_requested or declined',()=>{
    expect(row('mara').hours.customer_response).toBeCloseTo(52/3);
    expect(row('eli').hours.customer_response).toBeCloseTo(12);
    expect(row(null).hours.customer_response).toBeCloseTo(16);
  });
  it('time in each status per visit; open visits count to now; an unswept expiry ends the sent visit at its expiry instant',()=>{
    expect(row('mara').hours.ready_for_review).toBeCloseTo(41/5);
    expect(row('mara').hours.sent).toBeCloseTo(162/4);
    expect(row('mara').hours.changes_requested).toBeCloseTo(55);
    expect(row('eli').hours.ready_for_review).toBeCloseTo(12);
    expect(row('eli').hours.sent).toBeCloseTo(50);
    expect(row('eli').hours.changes_requested).toBeNull();
    expect(row(null).hours.ready_for_review).toBeCloseTo(89/9);
    expect(row(null).hours.sent).toBeCloseTo(312/7);
    expect(row(null).hours.changes_requested).toBeCloseTo(55);
  });
  it('a quote sent twice: the first send for time to send, every send for response time, every visit for time in status',()=>{
    const q=fact('x','mara','accepted',at('10-01',0),{sent_at:at('10-01',7),responded_at:at('10-01',10),sent_total:10});
    const events=[ev('x','sent',at('10-01',1)),ev('x','changes_requested',at('10-01',5)),ev('x','sent',at('10-01',7)),ev('x','accepted',at('10-01',10))];
    const {totals}=teamMetricRows(REPS,[q],events,{now:NOW,thresholds:AGING_DEFAULTS});
    expect(totals.hours).toEqual({to_send:1,customer_response:3.5,ready_for_review:1,sent:3.5,changes_requested:2});
  });
  it('a swept expiry ends the sent visit at its expired event',()=>{
    const q=fact('y','mara','expired',at('10-01',0),{sent_at:at('10-01',2),valid_until:'2026-10-02',sent_total:10});
    const {totals}=teamMetricRows(REPS,[q],[ev('y','sent',at('10-01',2)),ev('y','expired','2026-10-03T00:00:00.000Z')],{now:NOW,thresholds:AGING_DEFAULTS});
    expect(totals.hours).toMatchObject({to_send:2,customer_response:null,ready_for_review:2,sent:46});
  });
});

describe('money and margin',()=>{
  it('total quoted value: the latest sent revision, or the live draft total if never sent; accepted value: accepted quotes only (cents)',()=>{
    expect(row('mara').value).toEqual({quoted_cents:27000,accepted_cents:10000});
    expect(row('eli').value).toEqual({quoted_cents:14000,accepted_cents:0});
    expect(row(null).value).toEqual({quoted_cents:41000,accepted_cents:10000});
  });
  it('average quoted margin: the mean quote margin over priced quotes (unpriced drafts left out)',()=>{
    expect(row('mara').avg_margin).toBeCloseTo(0.1875);
    expect(row('eli').avg_margin).toBeCloseTo(0.225);
    expect(row(null).avg_margin).toBeCloseTo(0.20625);
  });
  it('freight recovered on accepted quotes vs modelled freight cost of accepted delivery quotes (cents)',()=>{
    expect(row('mara').freight).toEqual({recovered_cents:250,modelled_cents:1500});
    expect(row('eli').freight).toEqual({recovered_cents:0,modelled_cents:0});
    expect(row(null).freight).toEqual({recovered_cents:250,modelled_cents:1500});
  });
  it('ignores recovery and modelled cost on quotes that were not accepted',()=>{
    const q=fact('z','mara','declined',at('10-01',0),{fulfillment:'delivery',recovered_cents:900,modelled_freight_cents:4000,sent_total:10});
    expect(teamMetricRows(REPS,[q],[],{now:NOW,thresholds:AGING_DEFAULTS}).totals.freight).toEqual({recovered_cents:0,modelled_cents:0});
  });
});

describe('decline reasons and Other notes',()=>{
  it('counts each reason (no reason counted apart) and lists the Other notes with their quote and rep',()=>{
    expect(row('mara').declines).toEqual({price_too_high:0,found_other_source:0,need_sooner:0,wrong_items:0,other:1,none:0});
    expect(row('eli').declines).toEqual({price_too_high:0,found_other_source:0,need_sooner:0,wrong_items:0,other:0,none:1});
    expect(row(null).declines).toMatchObject({other:1,none:1});
    expect(result.other_notes).toEqual([{quote_id:'m2',quote_number:'Q-m2',rep_id:'mara',rep_name:'Mara Jensen',note:'Went with a local shop',declined_at:at('10-03',2)}]);
  });
});

describe('upsell suggestion acceptance (OA-13)',()=>{
  it('suggestion lines ÷ suggestions offered, with rep upsell lines as a count',()=>{
    expect(row('mara').upsell).toEqual({suggestions_offered:5,suggestions_added:1,suggestion_rate:0.2,rep_upsell_lines:1});
    expect(row('eli').upsell).toEqual({suggestions_offered:0,suggestions_added:0,suggestion_rate:null,rep_upsell_lines:0});
    expect(row(null).upsell).toEqual({suggestions_offered:5,suggestions_added:1,suggestion_rate:0.2,rep_upsell_lines:1});
  });
});

describe('why quotes went untouched (spec §7.3, OA-15)',()=>{
  it('counts per reason per rep: reasons 1–5 only for amber or red quotes, reason 6 for every expired quote',()=>{
    expect(UNTOUCHED_REASONS.map(r=>r.id)).toEqual(['draft_never_opened','draft_opened_not_sent','changes_not_revised','sent_never_opened','sent_opened_no_reply','expired_no_response']);
    expect(row('mara').untouched).toEqual({draft_never_opened:1,draft_opened_not_sent:0,changes_not_revised:1,sent_never_opened:0,sent_opened_no_reply:0,expired_no_response:1});
    expect(row('eli').untouched).toEqual({draft_never_opened:0,draft_opened_not_sent:1,changes_not_revised:0,sent_never_opened:0,sent_opened_no_reply:1,expired_no_response:0});
    expect(row(null).untouched).toEqual({draft_never_opened:1,draft_opened_not_sent:1,changes_not_revised:1,sent_never_opened:0,sent_opened_no_reply:1,expired_no_response:1});
  });
  it('a late sent quote viewed before its latest send, or never, was never opened; a fresh draft is not untouched',()=>{
    const late=(id:string,viewed:string|null)=>fact(id,'eli','sent',at('10-01',0),{sent_at:at('10-05',0),valid_until:'2026-10-30',customer_viewed_at:viewed,sent_total:5});
    const fresh=fact('f','eli','ready_for_review',at('10-10',10));
    const {totals}=teamMetricRows(REPS,[late('a',null),late('b',at('10-04',0)),late('c',at('10-05',0)),fresh],[],{now:NOW,thresholds:AGING_DEFAULTS});
    expect(totals.untouched).toMatchObject({sent_never_opened:2,sent_opened_no_reply:1,draft_never_opened:0});
  });
  it('honours the manager’s aging thresholds',()=>{
    const draft=fact('d','eli','ready_for_review',at('10-10',10));
    expect(teamMetricRows(REPS,[draft],[],{now:NOW,thresholds:{...AGING_DEFAULTS,rfrAmberH:1,rfrRedH:2}}).totals).toMatchObject({open:{red:1},untouched:{draft_never_opened:1}});
  });
});

describe('null denominators',()=>{
  it('a rep with no quotes in the window: zero counts, every rate, time and average null',()=>{
    const {rows,totals}=teamMetricRows(REPS,[],[],{now:NOW,thresholds:AGING_DEFAULTS});
    for(const r of [...rows,totals]){
      expect(r.created).toBe(0);
      expect(r.rates).toEqual({quote_to_order:null,unaccepted:null,decided_win:null});
      expect(r.hours).toEqual({to_send:null,customer_response:null,ready_for_review:null,sent:null,changes_requested:null});
      expect(r.avg_margin).toBeNull();
      expect(r.upsell.suggestion_rate).toBeNull();
      expect(r.value).toEqual({quoted_cents:0,accepted_cents:0});
    }
  });
  it('only open quotes: quote-to-order and unaccepted are 0, decided win rate is null',()=>{
    const {totals}=teamMetricRows(REPS,[fact('o','mara','ready_for_review',at('10-10',11))],[],{now:NOW,thresholds:AGING_DEFAULTS});
    expect(totals.rates).toEqual({quote_to_order:0,unaccepted:0,decided_win:null});
  });
  it('leaves out a quote whose rep is not selected',()=>{
    const {rows,totals}=teamMetricRows([REPS[0]],FACTS,EVENTS,{now:NOW,thresholds:AGING_DEFAULTS});
    expect(rows.map(r=>r.rep_id)).toEqual(['mara']);
    expect(totals.created).toBe(5);
  });
});
