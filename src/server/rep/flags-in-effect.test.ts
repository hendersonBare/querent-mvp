// @vitest-environment node
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import type {NewQuote} from '@/domain';
import {clearSeededPool,setSettingFixture,useSeededDatabase} from '@/server/repository/test-db';

// A feature flag that is off also stops what it governs (decision 71, amending 48; plan U12). With a
// flag off, a draft prices as if its stored settings were off or at their code defaults, whatever is
// stored: FEATURE_FREE_DELIVERY_PRICING gives the normal freight line and no recovery,
// FEATURE_RECOVERY_POOL the starting rate, caps and ramp from code (no computed pool), and
// FEATURE_DELIVERY_COST_MODEL the cost-model inputs from code. Stored settings are never changed and
// apply again once the flag is back on. Drafts reprice on their next open or edit; a rate or modelled
// cost a draft already froze stays frozen, as with any settings change (decisions 31, 35); sent quotes
// keep their snapshot. The math is unchanged. vitest.setup.ts turns the flags on; each test here sets them.
useSeededDatabase();
// The demo seed's pilot quotes (task F1) are dated from the real clock: out of the pool, so the starting rate is the one in force at this file's fixed times.
beforeAll(clearSeededPool);

const NOW='2026-09-25T18:00:00.000Z',LATER='2026-09-25T19:00:00.000Z',SEND='2026-09-25T20:00:00.000Z',NEXT_DAY='2026-09-26T18:00:00.000Z';
const DAY=86_400_000;
const daysBefore=(days:number)=>new Date(Date.parse(NOW)-days*DAY).toISOString();

const FLAG={freeDelivery:'FEATURE_FREE_DELIVERY_PRICING',pool:'FEATURE_RECOVERY_POOL',costModel:'FEATURE_DELIVERY_COST_MODEL'} as const;
const flag=(name:keyof typeof FLAG,on:boolean)=>vi.stubEnv(FLAG[name],on?'1':'');

const STORED=['free_delivery_pricing','free_delivery_enabled_at','freight_fuel_manual_cents','freight_stop_minutes','freight_starting_rate_bp','freight_line_cap_bp',
  'freight_ramp_steps','freight_ramp_days','freight_pool_rate_bp','freight_pool_on','freight_pool_count','freight_pool_computed_on'];
afterEach(async()=>{
  vi.unstubAllEnvs();
  for(const key of STORED)await setSettingFixture(key,null);
});

const load=async()=>({
  repo:await import('@/server/repository'),
  detail:await import('./quote-detail'),
  edits:await import('./quote-edits'),
  panels:await import('./quote-panel-edits'),
  service:await import('@/server/quotes/service'),
});

/** Free delivery pricing stored on, enabled 35 days ago: ramp step 2 of 3, so the 300 bp starting rate is in force at 200 bp. */
async function freeDeliveryStored(){
  await setSettingFixture('free_delivery_pricing','true');
  await setSettingFixture('free_delivery_enabled_at',daysBefore(35));
}
/** Every stored setting a test changed, to prove a flag never writes them. */
const storedSettings=async()=>{
  const {repo}=await load();
  return {freeDelivery:repo.freeDeliverySettings(),rates:repo.freightRateSettings(),cost:repo.freightCostSettings()};
};

/**
 * A Wasatch delivery draft from SLC (15.0 road mi): 50 boxes of bolts at $31.50 (cost $21.40) and
 * 6 boxes of wheels at the $36.00 contract price, $1,791.00 of goods (over the $1,500 threshold).
 */
async function draft(input:Partial<NewQuote>={}){
  const {repo}=await load();
  return repo.createQuote({customerId:'wasatch',fulfillment:'delivery',branchId:'slc',at:NOW,
    lines:[{itemId:'HCS-12-13-2G8',qty:50,unitPrice:31.5,priceBasis:'custom'},{itemId:'CW-45-045-T1',qty:6,unitPrice:36,priceBasis:'contract'}],...input});
}
const open=async(quoteId:string,now=NOW)=>(await (await load()).detail.repQuoteDetail('brandi',quoteId,{now}))!;
const frozen=async(quoteId:string)=>{
  const q=(await load()).repo.quote(quoteId)!;
  return {rate:q.freight_rate_bp,step:q.freight_ramp_step,steps:q.freight_ramp_steps,modelled:q.modelled_freight_cents,recovery:q.lines.map(l=>l.freight_recovery)};
};

describe('FEATURE_FREE_DELIVERY_PRICING off, free delivery pricing stored on',()=>{
  it('prices a draft as with free delivery pricing off: the normal freight line and no recovery; the stored toggle is kept',async()=>{
    const {edits}=await load();
    await freeDeliveryStored();
    flag('freeDelivery',false);
    const before=await storedSettings();
    const q=await draft();
    const detail=await open(q.id);
    expect(await frozen(q.id)).toMatchObject({rate:null,step:null,steps:null,recovery:[0,0]});
    expect(detail.freight.computed).toMatchObject({rule:'free_threshold',amount:0,miles:15});
    expect(detail.send_check).toMatchObject({subtotal:1791,total:1791});
    // Under the threshold the distance charge comes back, as with the toggle off.
    const edited=await edits.editRepQuoteLine('brandi',q.id,`${q.id}-1`,{qty:10},{now:LATER});
    expect(edited.freight.computed).toMatchObject({rule:'distance',amount:62.5});
    expect(edited.send_check).toMatchObject({subtotal:531,total:593.5});
    expect(await storedSettings()).toEqual(before);
    expect(before.freeDelivery).toEqual({enabled:true,enabledAt:daysBefore(35)});
  });

  it('reprices a draft on its next open when the flag goes off, and again when it comes back on (the stored toggle applies again)',async()=>{
    await freeDeliveryStored();
    flag('freeDelivery',true);
    const q=await draft();
    const on=await open(q.id);
    expect(await frozen(q.id)).toMatchObject({rate:200,step:2,steps:3,recovery:[63,0]});
    expect(on.freight.computed.rule).toBe('free_delivery_pricing');
    flag('freeDelivery',false);
    const off=await open(q.id,LATER);
    expect(await frozen(q.id)).toMatchObject({rate:null,step:null,steps:null,recovery:[0,0]});
    expect(off.freight.computed.rule).toBe('free_threshold');
    expect(off.send_check).toMatchObject({subtotal:1791,total:1791});
    flag('freeDelivery',true);
    const back=await open(q.id,LATER);
    expect(await frozen(q.id)).toMatchObject({rate:200,step:2,steps:3,recovery:[63,0]});
    expect(back.freight.computed.rule).toBe('free_delivery_pricing');
    expect(back.send_check).toMatchObject({subtotal:1822.5,total:1822.5});
  });

  it('leaves a quote sent with the flag on as sent: its lines and snapshot stay frozen with the flag off',async()=>{
    const {service,repo}=await load();
    await freeDeliveryStored();
    flag('freeDelivery',true);
    const q=await draft();
    await open(q.id);
    await service.sendQuote(q.id,{repId:'brandi',now:SEND});
    const snapshot=repo.quoteRevision(q.id,1)!.snapshot;
    expect(snapshot).toMatchObject({subtotal:1822.5,freight:0,total:1822.5});
    flag('freeDelivery',false);
    const detail=await open(q.id,NEXT_DAY);
    expect(detail.quote.status).toBe('sent');
    expect(await frozen(q.id)).toMatchObject({rate:200,recovery:[63,0]});
    expect(repo.quoteRevision(q.id,1)!.snapshot).toEqual(snapshot);
  });

  it('leaves a quote sent with the flag off as sent once the flag is back on',async()=>{
    const {service,repo}=await load();
    await freeDeliveryStored();
    flag('freeDelivery',false);
    const q=await draft();
    await open(q.id);
    await service.sendQuote(q.id,{repId:'brandi',now:SEND});
    const snapshot=repo.quoteRevision(q.id,1)!.snapshot;
    expect(snapshot).toMatchObject({subtotal:1791,freight:0,total:1791});
    expect(snapshot.lines[0].unit_price).toBe(31.5);
    flag('freeDelivery',true);
    await open(q.id,NEXT_DAY);
    expect(await frozen(q.id)).toMatchObject({rate:null,recovery:[0,0]});
    expect(repo.quoteRevision(q.id,1)!.snapshot).toEqual(snapshot);
  });
});

describe('FEATURE_RECOVERY_POOL off, pool settings stored',()=>{
  /** Starting rate 6%, per-line cap 1%, 4 ramp steps over 120 days: day 35 is step 2 of 4. */
  async function poolSettingsStored(){
    await setSettingFixture('freight_starting_rate_bp','600');
    await setSettingFixture('freight_line_cap_bp','100');
    await setSettingFixture('freight_ramp_steps','4');
    await setSettingFixture('freight_ramp_days','120');
  }

  it('freezes the starting rate, caps and ramp from code into a repriced draft; with the flag on, the stored ones',async()=>{
    await freeDeliveryStored();
    await poolSettingsStored();
    flag('pool',false);
    const before=await storedSettings();
    const off=await draft();
    await open(off.id);
    // The code's 300 bp at step 2 of 3 = 200 bp: 3,150¢ on the bolts, 63¢ a box under the code's 8% line cap.
    expect(await frozen(off.id)).toMatchObject({rate:200,step:2,steps:3,recovery:[63,0]});
    flag('pool',true);
    const on=await draft();
    await open(on.id);
    // The stored 600 bp at step 2 of 4 = 300 bp: 4,725¢, 94.5 -> 95¢ a box, capped at 1% of 3,150¢ = 31¢.
    expect(await frozen(on.id)).toMatchObject({rate:300,step:2,steps:4,recovery:[31,0]});
    expect(await storedSettings()).toEqual(before);
    expect(before.rates).toEqual({startingRateBp:600,rateCapBp:800,lineCapBp:100,rampSteps:4,rampDays:120});
  });

  it('does not put the computed pool rate in force while off',async()=>{
    await freeDeliveryStored();
    // Today's cached pool: 25 eligible quotes at 6.0%, enough to replace the starting rate.
    for(const [key,value] of [['freight_pool_computed_on','2026-09-25'],['freight_pool_rate_bp','600'],['freight_pool_on','true'],['freight_pool_count','25']])
      await setSettingFixture(key,value);
    flag('pool',false);
    const off=await draft();
    await open(off.id);
    expect(await frozen(off.id)).toMatchObject({rate:200,recovery:[63,0]});
    flag('pool',true);
    const on=await draft();
    await open(on.id);
    // 600 bp at step 2 of 3 = 400 bp: 6,300¢, 126¢ a box.
    expect(await frozen(on.id)).toMatchObject({rate:400,recovery:[126,0]});
  });

  it('leaves a sent quote frozen when the flag goes off',async()=>{
    const {service,repo}=await load();
    await freeDeliveryStored();
    await poolSettingsStored();
    flag('pool',true);
    const q=await draft();
    await open(q.id);
    await service.sendQuote(q.id,{repId:'brandi',now:SEND});
    const snapshot=repo.quoteRevision(q.id,1)!.snapshot;
    flag('pool',false);
    await open(q.id,NEXT_DAY);
    expect(await frozen(q.id)).toMatchObject({rate:300,step:2,steps:4,recovery:[31,0]});
    expect(repo.quoteRevision(q.id,1)!.snapshot).toEqual(snapshot);
  });
});

describe('FEATURE_DELIVERY_COST_MODEL off, cost-model inputs stored',()=>{
  /** A 15-minute stop and a $4.00 manual fuel price. */
  async function costStored(){
    await setSettingFixture('freight_stop_minutes','15');
    await setSettingFixture('freight_fuel_manual_cents','400');
  }

  it('models a repriced draft with the code inputs and the seeded fuel price; with the flag on, the stored inputs',async()=>{
    await freeDeliveryStored();
    await costStored();
    flag('costModel',false);
    const before=await storedSettings();
    const off=await draft();
    await open(off.id);
    // The spec §4.2 worked example: 15.0 mi from SLC at the seeded UT $3.40/gal, no stop = 4,213¢.
    expect((await frozen(off.id)).modelled).toBe(4213);
    flag('costModel',true);
    const on=await draft();
    await open(on.id);
    // At $4.00/gal with a 15-minute stop: 1,200 + 600 + 450 + 2,767.86¢ = 5,018¢.
    expect((await frozen(on.id)).modelled).toBe(5018);
    expect(await storedSettings()).toEqual(before);
    expect(before.cost).toMatchObject({stopMinutes:15,fuelManualCents:400});
  });

  it('measures a draft again with the code inputs when its branch changes while off',async()=>{
    const {panels}=await load();
    await freeDeliveryStored();
    await costStored();
    flag('costModel',true);
    const q=await draft();
    await open(q.id);
    expect((await frozen(q.id)).modelled).toBe(5018);
    flag('costModel',false);
    await panels.editRepQuoteFulfillment('brandi',q.id,{branchId:'provo'},{now:LATER});
    // Provo, 34.3 road mi, with the code inputs at $3.40/gal: 9,633¢ (the quote's rate stays frozen).
    expect(await frozen(q.id)).toMatchObject({rate:200,modelled:9633});
  });

  it('leaves a sent quote frozen when the flag goes off',async()=>{
    const {service,repo}=await load();
    await freeDeliveryStored();
    await costStored();
    flag('costModel',true);
    const q=await draft();
    await open(q.id);
    await service.sendQuote(q.id,{repId:'brandi',now:SEND});
    const snapshot=repo.quoteRevision(q.id,1)!.snapshot;
    flag('costModel',false);
    await open(q.id,NEXT_DAY);
    expect((await frozen(q.id)).modelled).toBe(5018);
    expect(repo.quoteRevision(q.id,1)!.snapshot).toEqual(snapshot);
  });
});
