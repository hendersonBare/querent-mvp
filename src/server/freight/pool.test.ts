import {describe,expect,it} from 'vitest';
import {POOL_DEFAULTS,poolRate,rampStep,rateInForce,type RateInForceInput} from './pool';

// Percentage pool and ramp (spec §4.4, decisions 31 and 35, OA-21; test plan §12 "Pool").
const DAY=86_400_000;
const ENABLED='2026-01-01T00:00:00.000Z';
const after=(days:number,extraMs=0)=>new Date(Date.parse(ENABLED)+days*DAY+extraMs).toISOString();
const step=(days:number,extraMs=0,options:{steps?:number;days?:number}={})=>rampStep({enabledAt:ENABLED,now:after(days,extraMs),steps:options.steps??3,days:options.days??90});
const inForce=(overrides:Partial<RateInForceInput>)=>rateInForce({poolBp:400,count:24,startingBp:300,capBp:800,step:3,steps:3,...overrides});

describe('pool rate = Σ modelled cost ÷ Σ goods, in whole bp',()=>{
  it('reproduces the spec worked example: 101,040¢ ÷ 2,526,000¢ = 4.0% (400 bp)',()=>{
    expect(poolRate({modelledCents:101_040,goodsCents:2_526_000,count:24})).toBe(400);
  });

  it('rounds to whole bp, half away from zero',()=>{
    expect(poolRate({modelledCents:1_000,goodsCents:30_000,count:3})).toBe(333); // 333.33…
    expect(poolRate({modelledCents:2_000,goodsCents:30_000,count:3})).toBe(667); // 666.67…
    expect(poolRate({modelledCents:1,goodsCents:20_000,count:1})).toBe(1); // 0.5 bp -> 1
  });

  it('is null when there is nothing to divide by (no eligible quotes, or no goods value)',()=>{
    expect(poolRate({modelledCents:0,goodsCents:0,count:0})).toBeNull();
    expect(poolRate({modelledCents:500,goodsCents:0,count:2})).toBeNull();
  });
});

describe('rate in force = round(min(base, cap) × step ÷ steps)',()=>{
  it('reproduces the spec worked example: pool 400 bp, 24 quotes, step 2 of 3 -> 267 bp',()=>{
    expect(inForce({step:2})).toBe(267);
  });

  it('cold start: fewer than 20 eligible quotes use the starting rate (12 quotes, step 2 of 3 -> 200 bp)',()=>{
    expect(inForce({count:12,step:2})).toBe(200);
    expect(inForce({count:19})).toBe(300);
    expect(inForce({count:20})).toBe(400);
    expect(inForce({count:0,poolBp:null})).toBe(300);
  });

  it('falls back to the starting rate when the pool has no rate even with 20+ quotes',()=>{
    expect(inForce({poolBp:null,count:25})).toBe(300);
  });

  it('caps the rate: a computed pool of 9.5% applies as 800 bp, and the cap applies to the starting rate too',()=>{
    expect(inForce({poolBp:950})).toBe(800);
    expect(inForce({poolBp:950,step:1})).toBe(267); // 800 × 1 ÷ 3 = 266.67
    expect(inForce({count:3,startingBp:900,capBp:500})).toBe(500);
  });

  it('rounds to whole bp at the end, half away from zero',()=>{
    expect(inForce({poolBp:401,step:1})).toBe(134); // 133.67
    expect(inForce({poolBp:301,step:1,steps:2})).toBe(151); // 150.5
    expect(inForce({poolBp:400,step:1})).toBe(133); // 133.33
  });

  it('is 0 before the ramp starts (step 0: free delivery pricing is not on)',()=>{
    expect(inForce({step:0})).toBe(0);
  });

  it('refuses a step outside 0…steps or a non-whole step count',()=>{
    expect(()=>inForce({step:4})).toThrow(RangeError);
    expect(()=>inForce({step:-1})).toThrow(RangeError);
    expect(()=>inForce({step:1.5})).toThrow(RangeError);
    expect(()=>inForce({steps:0,step:0})).toThrow(RangeError);
  });
});

describe('ramp step = min(steps, floor(days_since_enabled ÷ (ramp_days ÷ steps)) + 1)',()=>{
  it('defaults (3 steps over 90 days): step 1 on days 0–29, step 2 on days 30–59, step 3 from day 60',()=>{
    expect(step(0)).toBe(1);
    expect(step(29)).toBe(1);
    expect(step(29,DAY-1)).toBe(1); // the last millisecond of day 29
    expect(step(30)).toBe(2);
    expect(step(35)).toBe(2);
    expect(step(59)).toBe(2);
    expect(step(60)).toBe(3);
    expect(step(200)).toBe(3);
  });

  it('one step applies the full rate from day 0',()=>{
    expect(step(0,0,{steps:1})).toBe(1);
    expect(step(200,0,{steps:1})).toBe(1);
  });

  it('handles step lengths that are not whole days (3 steps over 100 days: 33.3 days each)',()=>{
    expect(step(33,0,{days:100})).toBe(1);
    expect(step(34,0,{days:100})).toBe(2);
    expect(step(66,0,{days:100})).toBe(2);
    expect(step(67,0,{days:100})).toBe(3);
  });

  it('is step 0 when free delivery pricing was never enabled, and step 1 if the clock reads before the enable time',()=>{
    expect(rampStep({enabledAt:null,now:after(10),steps:3,days:90})).toBe(0);
    expect(rampStep({enabledAt:ENABLED,now:after(-1),steps:3,days:90})).toBe(1);
  });

  it('refuses a ramp it cannot divide into steps',()=>{
    expect(()=>step(0,0,{steps:0})).toThrow(RangeError);
    expect(()=>step(0,0,{steps:2.5})).toThrow(RangeError);
    expect(()=>step(0,0,{days:0})).toThrow(RangeError);
    expect(()=>rampStep({enabledAt:'not a date',now:after(1),steps:3,days:90})).toThrow(RangeError);
  });
});

describe('code defaults (spec §1.3, decision 31)',()=>{
  it('start at 3.0%, cap the rate and each line at 8%, ramp in 3 steps over 90 days, and need 20 quotes in 90 days',()=>{
    expect(POOL_DEFAULTS).toEqual({startingRateBp:300,rateCapBp:800,lineCapBp:800,rampSteps:3,rampDays:90,minPoolCount:20,windowDays:90});
  });
});
