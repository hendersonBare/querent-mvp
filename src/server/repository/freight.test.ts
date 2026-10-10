import {describe,expect,it} from 'vitest';
import type {NewQuoteLine} from '@/domain';
import {toCents} from '@/lib/money';
import {cachedPoolRate,poolInputs} from './freight';
import {createQuote,saveQuoteTransition} from './quotes';
import {scalar} from './sql';
import {clearSeededPool,setQuoteFreightFixture,useSeededDatabase} from './test-db';

useSeededDatabase();

// Pool inputs and the daily pool cache (spec §4.4, decision 31, OA-16, OA-17; test plan §12 "Pool").
const NOW='2026-09-23T18:00:00.000Z';
const DAY=86_400_000;
const daysBefore=(days:number,extraMs=0)=>new Date(Date.parse(NOW)-days*DAY-extraMs).toISOString();

interface Fixture {fulfillment?:'delivery'|'will_call';status?:'accepted'|'sent'|'changes_requested';respondedAt?:string|null;rateBp?:number|null;modelledCents?:number|null;lines?:NewQuoteLine[]}
const BOLTS:NewQuoteLine={itemId:'HCS-12-13-2G5',qty:10,unitPrice:21.95,priceBasis:'customer'};

/** A quote stored as C2 will store it: created, accepted at `respondedAt`, with its frozen freight columns. */
async function fixture({fulfillment='delivery',status='accepted',respondedAt=daysBefore(5),rateBp=300,modelledCents=4213,lines=[BOLTS]}:Fixture={}){
  const created=createQuote({customerId:'wasatch',fulfillment,branchId:'slc',at:daysBefore(100),lines});
  expect(saveQuoteTransition(created.id,{from:'ready_for_review',to:status,respondedAt,at:respondedAt??undefined})).toBe(true);
  await setQuoteFreightFixture(created.id,{freight_rate_bp:rateBp,modelled_freight_cents:modelledCents,freight_ramp_step:rateBp===null?null:1,freight_ramp_steps:rateBp===null?null:3});
  return created.id;
}

describe('the recovery columns (migration 002)',()=>{
  it('default every Wasatch line to 0¢ recovery and every Wasatch quote to no frozen rate (the demo book\'s pilot quotes carry some, task F1)',()=>{
    expect(scalar<number>("SELECT count(*) FROM quote_lines l JOIN quotes q ON q.id=l.quote_id WHERE q.customer_id='wasatch' AND l.freight_recovery<>0")).toBe(0);
    expect(scalar<number>("SELECT count(*) FROM quotes WHERE customer_id='wasatch' AND (freight_rate_bp IS NOT NULL OR freight_ramp_step IS NOT NULL OR freight_ramp_steps IS NOT NULL OR modelled_freight_cents IS NOT NULL)")).toBe(0);
  });
});

describe('poolInputs: eligible accepted delivery quotes in the trailing 90 days',()=>{
  // The demo seed's pilot quotes are dated from the real clock (src/server/repository/demo-pool.test.ts covers them): take them out, so these fixtures are the whole pool on any day.
  it('is empty once the seed\'s pilot quotes are out of the pool',async()=>{
    await clearSeededPool();
    expect(poolInputs(NOW)).toEqual({modelledCents:0,goodsCents:0,count:0});
  });

  it('sums modelled cost and the goods value of non-contract priced lines, in integer cents, and leaves every ineligible quote out',async()=>{
    // Eligible: priced customer/custom/null-basis lines count; contract and unpriced lines don't (OA-16).
    await fixture({modelledCents:4213,lines:[
      {itemId:'HCS-12-13-2G5',qty:10,unitPrice:21.95,priceBasis:'customer'},
      {itemId:'HCS-12-13-2G8',qty:3,unitPrice:1.005,priceBasis:'custom'}, // toCents(1.005) = 101¢, not 100¢
      {itemId:'RS-2-27-JH',qty:2,unitPrice:22.95,priceBasis:null},
      {itemId:'CW-45-045-T1',qty:6,unitPrice:36,priceBasis:'contract'},
      {itemId:'GLV-N8-L-1000',qty:4,unitPrice:null,priceBasis:null},
      {itemId:'FD-45-60Z',qty:0,unitPrice:9.99,priceBasis:'list'},
    ]});
    // Eligible: accepted exactly 90 days before now (the window's first instant), same bolts price on another quote.
    await fixture({respondedAt:daysBefore(90),modelledCents:4838,lines:[{itemId:'HCS-12-13-2G5',qty:5,unitPrice:21.95,priceBasis:'last_paid'}]});
    // Ineligible: will call, sent and not yet answered, changes requested, no frozen rate (override or toggle off), just outside the window, accepted after now.
    await fixture({fulfillment:'will_call',modelledCents:null});
    await fixture({status:'sent',respondedAt:null});
    // Not accepted although everything else qualifies: the customer responded inside the window by asking for changes.
    await fixture({status:'changes_requested',respondedAt:daysBefore(3),modelledCents:7000,lines:[{itemId:'HCS-12-13-2G5',qty:4,unitPrice:21.95,priceBasis:'customer'}]});
    await fixture({rateBp:null,modelledCents:5000});
    await fixture({respondedAt:daysBefore(90,1)});
    await fixture({respondedAt:new Date(Date.parse(NOW)+1).toISOString()});

    const goods=toCents(21.95)*10+101*3+toCents(22.95)*2+toCents(21.95)*5;
    expect(goods).toBe(21950+303+4590+10975);
    expect(poolInputs(NOW)).toEqual({modelledCents:4213+4838,goodsCents:goods,count:2});
  });

  it('measures the window on the acceptance time, so the same quotes fall out as now moves on (OA-17)',()=>{
    expect(poolInputs(new Date(Date.parse(NOW)+DAY).toISOString()).count).toBe(2); // the after-now quote enters, the 90-day one leaves
    expect(poolInputs(new Date(Date.parse(NOW)+100*DAY).toISOString())).toEqual({modelledCents:0,goodsCents:0,count:0});
  });
});

describe('cachedPoolRate: recomputed at most once per UTC day, kept in freight_pool_* settings',()=>{
  const setting=(key:string)=>scalar<string>('SELECT value FROM settings WHERE key=?',key);

  it('computes on the first call of the day and stores the rate, the 20-quote switch and the count',()=>{
    const inputs=poolInputs(NOW);
    const expected=Math.round(inputs.modelledCents*10000/inputs.goodsCents);
    expect(cachedPoolRate(NOW)).toEqual({rateBp:expected,on:false,count:2,computedOn:'2026-09-23'});
    expect([setting('freight_pool_rate_bp'),setting('freight_pool_on'),setting('freight_pool_count'),setting('freight_pool_computed_on')]).toEqual([String(expected),'false','2','2026-09-23']);
  });

  it('serves the cached value for the rest of the UTC day, even after more quotes become eligible',async()=>{
    const before=cachedPoolRate(NOW);
    for(let i=0;i<18;i++)await fixture({respondedAt:daysBefore(1),modelledCents:5000,lines:[{itemId:'FD-45-60Z',qty:10,unitPrice:10,priceBasis:'list'}]});
    expect(poolInputs(NOW).count).toBe(20);
    expect(cachedPoolRate('2026-09-23T23:59:59.999Z')).toEqual(before);
  });

  it('recomputes on the next UTC day: 20 eligible quotes switch the computed pool on',()=>{
    const next='2026-09-24T00:00:00.000Z';
    const inputs=poolInputs(next);
    expect(inputs.count).toBe(20);
    expect(cachedPoolRate(next)).toEqual({rateBp:Math.round(inputs.modelledCents*10000/inputs.goodsCents),on:true,count:20,computedOn:'2026-09-24'});
    expect(setting('freight_pool_on')).toBe('true');
  });

  it('stores no rate when the window is empty',()=>{
    const later='2027-06-01T12:00:00.000Z';
    expect(cachedPoolRate(later)).toEqual({rateBp:null,on:false,count:0,computedOn:'2027-06-01'});
    expect(setting('freight_pool_rate_bp')).toBeUndefined();
    expect(cachedPoolRate('2027-06-01T20:00:00.000Z')).toEqual({rateBp:null,on:false,count:0,computedOn:'2027-06-01'});
  });
});
