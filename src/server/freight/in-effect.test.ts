// @vitest-environment node
import {readFileSync,readdirSync,statSync} from 'node:fs';
import path from 'node:path';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {clearSeededPool,setSettingFixture,useSeededDatabase} from '@/server/repository/test-db';

// What is in effect for free delivery pricing, the recovery pool and the delivery cost model
// (decision 71, amending 48; plan U12): the stored settings while their feature flag is on, else
// their off behaviour (free delivery pricing off; the pool's and the cost model's code defaults, and
// no computed pool). One place answers it; every reader in pricing, freight, recovery, intake, draft
// repricing and the impact preview goes through it. Stored settings are never written.
useSeededDatabase();
beforeAll(clearSeededPool);

const NOW='2026-09-25T18:00:00.000Z';
const ALL_ON={freeDeliveryPricing:true,recoveryPool:true,deliveryCostModel:true};
const ALL_OFF={freeDeliveryPricing:false,recoveryPool:false,deliveryCostModel:false};
const STORED=['free_delivery_pricing','free_delivery_enabled_at','freight_starting_rate_bp','freight_rate_cap_bp','freight_line_cap_bp','freight_ramp_steps','freight_ramp_days',
  'freight_vehicle_mpg','freight_fuel_type','freight_stop_minutes','freight_fuel_manual_cents','freight_pool_rate_bp','freight_pool_on','freight_pool_count','freight_pool_computed_on'];
afterEach(async()=>{vi.unstubAllEnvs();for(const key of STORED)await setSettingFixture(key,null);});

async function storeEverything(){
  for(const [key,value] of [['free_delivery_pricing','true'],['free_delivery_enabled_at','2026-08-21T18:00:00.000Z'],['freight_starting_rate_bp','600'],['freight_rate_cap_bp','700'],
    ['freight_line_cap_bp','100'],['freight_ramp_steps','4'],['freight_ramp_days','120'],['freight_vehicle_mpg','8'],['freight_fuel_type','diesel'],['freight_stop_minutes','15'],
    ['freight_fuel_manual_cents','400'],['freight_pool_computed_on','2026-09-25'],['freight_pool_rate_bp','450'],['freight_pool_on','true'],['freight_pool_count','25']])
    await setSettingFixture(key,value);
}

describe('freightInEffect and the settings in effect',()=>{
  it('with every flag on, is what is stored',async()=>{
    const fx=await import('./in-effect');
    await storeEverything();
    expect(fx.freightInEffect(ALL_ON)).toEqual({freeDeliveryPricing:true,recoveryPool:true,deliveryCostModel:true});
    expect(fx.freeDeliveryInEffect(ALL_ON)).toEqual({enabled:true,enabledAt:'2026-08-21T18:00:00.000Z'});
    expect(fx.freightRatesInEffect(ALL_ON)).toEqual({startingRateBp:600,rateCapBp:700,lineCapBp:100,rampSteps:4,rampDays:120});
    expect(fx.poolInEffect(NOW,ALL_ON)).toEqual({rateBp:450,on:true,count:25,computedOn:'2026-09-25'});
    expect(fx.freightCostInEffect(ALL_ON)).toEqual({mpg:8,fuelType:'diesel',wearCentsPerMile:20,depreciationCentsPerMile:15,driverCentsPerHour:2500,avgSpeedMph:35,stopMinutes:15,fuelManualCents:400});
  });

  it('with every flag off, is the off behaviour whatever is stored, and stores nothing',async()=>{
    const fx=await import('./in-effect');
    const repo=await import('@/server/repository');
    await storeEverything();
    const stored={freeDelivery:repo.freeDeliverySettings(),rates:repo.freightRateSettings(),cost:repo.freightCostSettings()};
    expect(fx.freightInEffect(ALL_OFF)).toEqual({freeDeliveryPricing:false,recoveryPool:false,deliveryCostModel:false});
    // The enable time is kept, so the ramp carries on from it once the flag is back on.
    expect(fx.freeDeliveryInEffect(ALL_OFF)).toEqual({enabled:false,enabledAt:'2026-08-21T18:00:00.000Z'});
    expect(fx.freightRatesInEffect(ALL_OFF)).toEqual({startingRateBp:300,rateCapBp:800,lineCapBp:800,rampSteps:3,rampDays:90});
    expect(fx.poolInEffect(NOW,ALL_OFF)).toEqual({rateBp:null,on:false,count:0,computedOn:'2026-09-25'});
    expect(fx.freightCostInEffect(ALL_OFF)).toEqual({mpg:10,fuelType:'gasoline',wearCentsPerMile:20,depreciationCentsPerMile:15,driverCentsPerHour:2500,avgSpeedMph:35,stopMinutes:0,fuelManualCents:null});
    expect({freeDelivery:repo.freeDeliverySettings(),rates:repo.freightRateSettings(),cost:repo.freightCostSettings()}).toEqual(stored);
  });

  it('free delivery pricing is in effect only when it is stored on and its flag is on',async()=>{
    const fx=await import('./in-effect');
    expect(fx.freightInEffect(ALL_ON).freeDeliveryPricing).toBe(false);
    await setSettingFixture('free_delivery_pricing','true');
    expect(fx.freightInEffect(ALL_ON).freeDeliveryPricing).toBe(true);
    expect(fx.freightInEffect({...ALL_ON,freeDeliveryPricing:false}).freeDeliveryPricing).toBe(false);
  });

  it('reads the flags from the environment on every call by default',async()=>{
    const fx=await import('./in-effect');
    await setSettingFixture('free_delivery_pricing','true');
    await setSettingFixture('freight_starting_rate_bp','600');
    vi.stubEnv('FEATURE_FREE_DELIVERY_PRICING','');
    vi.stubEnv('FEATURE_RECOVERY_POOL','');
    expect(fx.freeDeliveryInEffect().enabled).toBe(false);
    expect(fx.freightRatesInEffect().startingRateBp).toBe(300);
    vi.stubEnv('FEATURE_FREE_DELIVERY_PRICING','1');
    vi.stubEnv('FEATURE_RECOVERY_POOL','1');
    expect(fx.freeDeliveryInEffect().enabled).toBe(true);
    expect(fx.freightRatesInEffect().startingRateBp).toBe(600);
  });
});

describe('every reader goes through it',()=>{
  // The stored getters, read directly only by in-effect.ts and by the manager's controls, which show and
  // edit what is stored (src/server/rep/freight-settings.ts: the toggle, the cost inputs and the rates).
  const GETTERS=/\b(freeDeliverySettings|freightRateSettings|freightCostSettings|cachedPoolRate)\(/;
  const ALLOWED=new Set(['src/server/freight/in-effect.ts','src/server/rep/freight-settings.ts']);
  const files=(dir:string):string[]=>readdirSync(dir).flatMap(name=>{
    const full=path.join(dir,name);
    return statSync(full).isDirectory()?files(full):/\.tsx?$/.test(name)&&!/\.test\.tsx?$/.test(name)?[full]:[];
  });

  it('no other module outside the repository reads the stored free delivery, pool or cost-model settings',()=>{
    const root=path.resolve(__dirname,'../../..');
    const readers=files(path.join(root,'src')).map(f=>path.relative(root,f).split(path.sep).join('/'))
      .filter(f=>!f.startsWith('src/server/repository/')&&!ALLOWED.has(f)&&GETTERS.test(readFileSync(path.join(root,f),'utf8')));
    expect(readers).toEqual([]);
  });
});
