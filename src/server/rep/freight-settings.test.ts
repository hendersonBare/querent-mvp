// @vitest-environment node
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import type {NewQuoteLine} from '@/domain';
import {clearSeededPool,setSettingFixture,useSeededDatabase} from '@/server/repository/test-db';

// The manager's free delivery pricing controls on Settings > Pricing & delivery (v3 spec §1.3,
// §4.3, §4.4, §4.6, §4.7, §5; decisions 28–31, 35, 36; OA-11): what GET shows (toggle, inputs, the
// pool panel, the fuel price and its warnings), what PUT changes (enable only after a recent impact
// preview), and the preview itself. The clock is passed in; seeded quotes are long out of the
// 90-day windows at NOW, so only this file's quotes count.
useSeededDatabase();
// The demo seed's pilot quotes (task F1) are dated from the real clock: out of the pool, so the starting rate is the one in force at this file's fixed times.
beforeAll(clearSeededPool);

const NOW='2027-06-01T18:00:00.000Z';
const HOUR=3_600_000,DAY=24*HOUR;
const before=(ms:number,from=NOW)=>new Date(Date.parse(from)-ms).toISOString();
const load=async()=>({svc:await import('./freight-settings'),repo:await import('@/server/repository'),settings:await import('./settings')});

const BOLTS=(qty:number,unitPrice=31.5):NewQuoteLine=>({itemId:'HCS-12-13-2G8',qty,unitPrice,priceBasis:'customer'});

async function rejects(promise:Promise<unknown>,status:number,code?:string,detail?:string|RegExp){
  const {settings}=await load();
  const error=await promise.then(()=>null,(e:unknown)=>e);
  expect(error).toBeInstanceOf(settings.SettingsError);
  expect(error).toMatchObject({status,...(code?{code}:{})});
  if(detail)expect((error as Error).message).toMatch(detail);
}

describe('GET: the controls, the pool panel and the fuel price',()=>{
  it('shows the defaults: off, never previewed, the cost model and rates, the starting rate in the pool, and UT fuel from the seed with its age warning',async()=>{
    const {svc}=await load();
    const view=await svc.freightSettingsView({now:NOW,source:null});
    expect(view).toEqual({
      enabled:false,enabledAt:null,previewViewedAt:null,previewValid:false,
      cost:{mpg:10,fuelType:'gasoline',wearCentsPerMile:20,depreciationCentsPerMile:15,driverCentsPerHour:2500,avgSpeedMph:35,stopMinutes:0,fuelManualCents:null},
      rates:{startingRateBp:300,rateCapBp:800,lineCapBp:800,rampSteps:3,rampDays:90},
      pool:{computedBp:null,count:0,minCount:20,usingPool:false,startingBp:300,capBp:800,baseBp:300,step:0,steps:3,rateInForceBp:0,windowDays:90,
        schedule:[{step:1,fromDay:0,rateBp:100,startsAt:null},{step:2,fromDay:30,rateBp:200,startsAt:null},{step:3,fromDay:60,rateBp:300,startsAt:null}],
        modelledCents:0,recoveredCents:0},
      fuel:[{state:'UT',fuelType:'gasoline',cents:340,source:'seed',asOf:'2026-09-23T00:00:00.000Z',ageDays:251,warnings:['Fuel price is 251 days old.']}],
      warnings:['Fuel price is 251 days old.'],
    });
  });

  it('fetches the delivering branches’ fuel price when Pricing & delivery loads, once per day',async()=>{
    const {svc}=await load();
    const calls:string[]=[];
    const source={gasoline:async(state:string)=>{calls.push(state);return {cents:361,asOf:before(2*DAY)};}};
    const view=await svc.freightSettingsView({now:NOW,source});
    expect(view.fuel).toEqual([{state:'UT',fuelType:'gasoline',cents:361,source:'api',asOf:before(2*DAY),ageDays:2,warnings:[]}]);
    expect(view.warnings).toEqual([]);
    await svc.freightSettingsView({now:before(-HOUR),source});
    expect(calls).toEqual(['UT']);
  });

  it('sums the trailing 90 days’ modelled cost and recovered amount over eligible quotes',async()=>{
    const {svc,repo}=await load();
    const at=before(10*DAY),day='2027-05-01T12:00:00.000Z';
    const q=repo.createQuote({customerId:'wasatch',fulfillment:'delivery',branchId:'slc',at,lines:[BOLTS(50)]});
    repo.saveQuoteRecovery(q.id,{rateBp:300,rampStep:3,rampSteps:3,modelledCents:4213,lines:[{lineId:q.lines[0].id,freightRecovery:95}]});
    expect(repo.saveQuoteTransition(q.id,{from:'ready_for_review',to:'accepted',respondedAt:before(5*DAY,day),at:before(5*DAY,day)})).toBe(true);
    const view=await svc.freightSettingsView({now:day,source:null});
    expect(view.pool).toMatchObject({count:1,usingPool:false,baseBp:300,modelledCents:4213,recoveredCents:95*50});
    expect(view.pool.computedBp).toBe(Math.round(4213*10000/157500));
  });
});

describe('PUT: the toggle, the cost inputs and the rates',()=>{
  it('saves cost inputs and rates and returns the new view; a bad value is refused (400) and nothing is saved',async()=>{
    const {svc,repo}=await load();
    const view=await svc.updateFreightSettings({cost:{mpg:12,fuelManualCents:389,stopMinutes:15},rates:{startingRateBp:450,rampSteps:4,rampDays:120}},{now:NOW});
    expect(view.cost).toMatchObject({mpg:12,fuelManualCents:389,stopMinutes:15});
    expect(view.rates).toMatchObject({startingRateBp:450,rampSteps:4,rampDays:120});
    expect(view.fuel[0]).toMatchObject({cents:389,source:'manual'});
    expect(repo.freightCostSettings()).toMatchObject({mpg:12,fuelManualCents:389});
    await rejects(svc.updateFreightSettings({cost:{mpg:0},rates:{startingRateBp:100}},{now:NOW}),400,undefined,'Vehicle MPG must be above 0 and at most 200.');
    expect(repo.freightRateSettings().startingRateBp).toBe(450);
    // Clearing the manual price goes back to the stored one.
    expect((await svc.updateFreightSettings({cost:{fuelManualCents:null},rates:{startingRateBp:300,rampSteps:3,rampDays:90}},{now:NOW})).cost.fuelManualCents).toBeNull();
    await svc.updateFreightSettings({cost:{mpg:10,stopMinutes:0}},{now:NOW});
  });

  it('refuses to turn free delivery pricing on until the impact preview was viewed in the last 24 hours (409 preview_required)',async()=>{
    const {svc,repo}=await load();
    await rejects(svc.updateFreightSettings({enabled:true},{now:NOW}),409,'preview_required','View the impact preview');
    await setSettingFixture('free_delivery_preview_viewed_at',before(25*HOUR));
    await rejects(svc.updateFreightSettings({enabled:true},{now:NOW}),409,'preview_required');
    expect(repo.freeDeliverySettings()).toEqual({enabled:false,enabledAt:null});
    await setSettingFixture('free_delivery_preview_viewed_at',before(23*HOUR));
    const view=await svc.updateFreightSettings({enabled:true},{now:NOW});
    expect(view).toMatchObject({enabled:true,enabledAt:NOW,previewValid:true,pool:{step:1,steps:3,rateInForceBp:100}});
    expect(view.pool.schedule.map(s=>s.startsAt)).toEqual([NOW,before(-30*DAY),before(-60*DAY)]);
  });

  it('saving with the toggle already on keeps the enable time; turning it off clears nothing else; turning it on again restarts the ramp',async()=>{
    const {svc,repo}=await load();
    const later=before(-40*DAY);
    expect((await svc.freightSettingsView({now:later,source:null})).pool).toMatchObject({step:2,rateInForceBp:200});
    expect((await svc.updateFreightSettings({enabled:true,rates:{lineCapBp:700}},{now:later})).enabledAt).toBe(NOW);
    const off=await svc.updateFreightSettings({enabled:false},{now:later});
    expect(off).toMatchObject({enabled:false,enabledAt:NOW,pool:{step:0,rateInForceBp:0},rates:{lineCapBp:700}});
    expect(repo.freeDeliverySettings()).toEqual({enabled:false,enabledAt:NOW});
    // The preview viewed 40 days ago no longer counts.
    await rejects(svc.updateFreightSettings({enabled:true},{now:later}),409,'preview_required');
    await svc.freightImpactPreview({now:later});
    expect(await svc.updateFreightSettings({enabled:true},{now:later})).toMatchObject({enabled:true,enabledAt:later,pool:{step:1}});
    await svc.updateFreightSettings({enabled:false,rates:{lineCapBp:800}},{now:later});
  });

  it('refuses a body that is not an object, or an unknown field (400)',async()=>{
    const {svc}=await load();
    await rejects(svc.updateFreightSettings(undefined,{now:NOW}),400,undefined,'Nothing to change.');
    await rejects(svc.updateFreightSettings({freight_pool_rate_bp:400},{now:NOW}),400,undefined,'Unknown setting: freight_pool_rate_bp.');
  });
});

describe('the impact preview',()=>{
  it('counts the delivery quotes of the last 90 days that would carry recovery and averages the line price change per category; records the view',async()=>{
    const {svc,repo}=await load();
    const now='2028-01-10T18:00:00.000Z';
    const make=(fulfillment:'delivery'|'will_call',lines:NewQuoteLine[],at=before(5*DAY,now))=>repo.createQuote({customerId:'wasatch',fulfillment,branchId:'slc',at,lines});
    make('delivery',[BOLTS(50)]);                       // $1,575.00 delivered 15 mi: carries
    make('delivery',[BOLTS(2)]);                        // under the $1,500 threshold: no recovery
    make('will_call',[BOLTS(50)]);                      // pickup: not a delivery quote
    const overridden=make('delivery',[BOLTS(60)]);      // the rep set freight by hand
    repo.setFreightOverride(overridden.id,{amount:40,reason:'Customer truck'},before(5*DAY,now));
    make('delivery',[BOLTS(50)],before(91*DAY,now));    // out of the window
    const preview=await svc.freightImpactPreview({now});
    // Starting rate 300 bp over 3 steps: 100 bp at step 1, 300 bp at full. 50 boxes at $31.50:
    // full 4,725¢ → 95¢ a box (301.6 bp → 302); step 1 1,575¢ → 32¢ a box (101.6 bp → 102).
    expect(preview).toEqual({deliveryQuotes:3,affected:1,step1Bp:100,fullBp:300,steps:3,windowDays:90,viewedAt:now,
      categories:[{categoryId:'fasteners',categoryName:'Fasteners',lines:1,step1ChangeBp:102,fullChangeBp:302,quotes:1,step1ChangeCents:32,fullChangeCents:95}]});
    expect(repo.freightPreviewViewedAt()).toBe(now);
    expect((await svc.freightSettingsView({now:before(-HOUR,now),source:null})).previewValid).toBe(true);
  });

  it('uses the capped rate in force: a 9.5% starting rate is capped at the 8% cap',async()=>{
    const {svc}=await load();
    await svc.updateFreightSettings({rates:{startingRateBp:950}},{now:NOW});
    const preview=await svc.freightImpactPreview({now:'2028-01-10T19:00:00.000Z'});
    expect([preview.step1Bp,preview.fullBp]).toEqual([267,800]);
    await svc.updateFreightSettings({rates:{startingRateBp:300}},{now:NOW});
  });
});

describe('the modelled cost uses the stored fuel price (C2 wiring)',()=>{
  it('prices fuel from the delivering branch’s state, and from the manual price when one is set',async()=>{
    const {modelledFreightCents}=await import('@/server/freight/quote');
    const {repo}=await load();
    repo.saveFuelPrice({state:'UT',fuel:'gasoline',price_cents:340,as_of:'2027-05-30T00:00:00.000Z',source:'api',fetched_on:'2027-05-30'});
    // Spec §4.2: 15.0 road mi at $3.40/gal = 4,213¢.
    expect(modelledFreightCents(15,'UT')).toBe(4213);
    // No price for NV: fuel 0 (OA-26).
    expect(modelledFreightCents(15,'NV')).toBe(3193);
    await setSettingFixture('freight_fuel_manual_cents','0');
    expect(modelledFreightCents(15,'UT')).toBe(3193);
    await setSettingFixture('freight_fuel_manual_cents',null);
  });
});

// Decision 71 (plan U12): with a flag off, the preview, the pool panel and the modelled cost use what is
// in effect (the code defaults, or free delivery pricing off), never what is stored; vitest.setup.ts turns the flags on.
describe('feature flags off (decision 71)',()=>{
  afterEach(()=>{vi.unstubAllEnvs();});

  it('FEATURE_RECOVERY_POOL off: the preview uses the code starting rate, cap and ramp; on, the stored ones',async()=>{
    const {svc}=await load();
    await svc.updateFreightSettings({rates:{startingRateBp:950,rampSteps:4}},{now:NOW});
    vi.stubEnv('FEATURE_RECOVERY_POOL','');
    const off=await svc.freightImpactPreview({now:'2028-01-10T19:00:00.000Z'});
    expect([off.step1Bp,off.fullBp,off.steps]).toEqual([100,300,3]);
    vi.stubEnv('FEATURE_RECOVERY_POOL','1');
    const on=await svc.freightImpactPreview({now:'2028-01-10T19:00:00.000Z'});
    expect([on.step1Bp,on.fullBp,on.steps]).toEqual([200,800,4]);
    await svc.updateFreightSettings({rates:{startingRateBp:300,rampSteps:3}},{now:NOW});
  });

  it('FEATURE_FREE_DELIVERY_PRICING off: the pool panel shows no ramp step and no rate in force, though the toggle is stored on (and kept)',async()=>{
    const {svc,repo}=await load();
    await setSettingFixture('free_delivery_pricing','true');
    await setSettingFixture('free_delivery_enabled_at',before(35*DAY));
    vi.stubEnv('FEATURE_FREE_DELIVERY_PRICING','');
    const off=await svc.freightSettingsView({now:NOW,source:null});
    expect(off).toMatchObject({enabled:true,enabledAt:before(35*DAY),pool:{step:0,rateInForceBp:0}});
    expect(off.pool.schedule.map(s=>s.startsAt)).toEqual([null,null,null]);
    expect(repo.freeDeliverySettings()).toEqual({enabled:true,enabledAt:before(35*DAY)});
    vi.stubEnv('FEATURE_FREE_DELIVERY_PRICING','1');
    expect((await svc.freightSettingsView({now:NOW,source:null})).pool).toMatchObject({step:2,rateInForceBp:200});
    await setSettingFixture('free_delivery_pricing',null);
    await setSettingFixture('free_delivery_enabled_at',null);
  });

  it('FEATURE_DELIVERY_COST_MODEL off: the modelled cost ignores the stored inputs and manual fuel price',async()=>{
    const {modelledFreightCents}=await import('@/server/freight/quote');
    await setSettingFixture('freight_fuel_manual_cents','0');
    await setSettingFixture('freight_stop_minutes','15');
    vi.stubEnv('FEATURE_DELIVERY_COST_MODEL','');
    // Spec §4.2: 15.0 road mi at the stored UT $3.40/gal, no stop = 4,213¢.
    expect(modelledFreightCents(15,'UT')).toBe(4213);
    vi.stubEnv('FEATURE_DELIVERY_COST_MODEL','1');
    // Fuel at $0 and a 15-minute stop: 600 + 450 + 2,767.86¢ = 3,818¢.
    expect(modelledFreightCents(15,'UT')).toBe(3818);
    await setSettingFixture('freight_fuel_manual_cents',null);
    await setSettingFixture('freight_stop_minutes',null);
  });
});
