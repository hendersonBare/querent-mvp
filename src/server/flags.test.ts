import {afterEach,describe,expect,it,vi} from 'vitest';
import {FLAG_ENV,FeatureOffError,featureFlags,flagOn,freightWriteRefusal} from './flags';

// Feature flags (decision 48; plan U8): FEATURE_FREE_DELIVERY_PRICING, FEATURE_RECOVERY_POOL and
// FEATURE_DELIVERY_COST_MODEL, environment variables read on the server, default off. No flags table.

afterEach(()=>vi.unstubAllEnvs());

describe('feature flags',()=>{
  it('names the three environment variables of decision 48',()=>{
    expect(FLAG_ENV).toEqual({freeDeliveryPricing:'FEATURE_FREE_DELIVERY_PRICING',recoveryPool:'FEATURE_RECOVERY_POOL',deliveryCostModel:'FEATURE_DELIVERY_COST_MODEL'});
  });

  it('are off by default: unset, empty, 0, false or anything else',()=>{
    for(const name of Object.values(FLAG_ENV))vi.stubEnv(name,'');
    expect(featureFlags()).toEqual({freeDeliveryPricing:false,recoveryPool:false,deliveryCostModel:false});
    for(const value of ['0','false','off','no','maybe',' '])expect(flagOn('recoveryPool',{FEATURE_RECOVERY_POOL:value})).toBe(false);
    expect(flagOn('recoveryPool',{})).toBe(false);
  });

  it('turn on with 1, true, on or yes (any case, spaces trimmed), each on its own',()=>{
    for(const value of ['1','true','TRUE',' on ','Yes'])expect(flagOn('deliveryCostModel',{FEATURE_DELIVERY_COST_MODEL:value})).toBe(true);
    vi.stubEnv('FEATURE_FREE_DELIVERY_PRICING','1');
    vi.stubEnv('FEATURE_RECOVERY_POOL','');
    vi.stubEnv('FEATURE_DELIVERY_COST_MODEL','');
    expect(featureFlags()).toEqual({freeDeliveryPricing:true,recoveryPool:false,deliveryCostModel:false});
  });

  it('are read on every call, not once at start',()=>{
    vi.stubEnv('FEATURE_RECOVERY_POOL','');
    expect(featureFlags().recoveryPool).toBe(false);
    vi.stubEnv('FEATURE_RECOVERY_POOL','1');
    expect(featureFlags().recoveryPool).toBe(true);
  });
});

describe('freightWriteRefusal: PUT /api/rep/settings/freight while a flag is off',()=>{
  const OFF={freeDeliveryPricing:false,recoveryPool:false,deliveryCostModel:false};
  const ON={freeDeliveryPricing:true,recoveryPool:true,deliveryCostModel:true};

  it('refuses each part whose section is off: enabled (free delivery pricing), rates (recovery pool), cost (delivery cost model)',()=>{
    expect(freightWriteRefusal({enabled:true},OFF)).toBeInstanceOf(FeatureOffError);
    expect(freightWriteRefusal({enabled:false},OFF)?.message).toBe('Free delivery pricing is turned off.');
    expect(freightWriteRefusal({rates:{rampSteps:3}},{...ON,recoveryPool:false})?.message).toBe('The recovery pool is turned off.');
    expect(freightWriteRefusal({cost:{mpg:10}},{...ON,deliveryCostModel:false})?.message).toBe('The delivery cost model is turned off.');
    expect(freightWriteRefusal({enabled:true,cost:{mpg:10}},{...ON,deliveryCostModel:false})).toBeInstanceOf(FeatureOffError);
  });

  it('lets a part through when its own flag is on, whatever the others',()=>{
    expect(freightWriteRefusal({enabled:true},{...OFF,freeDeliveryPricing:true})).toBeNull();
    expect(freightWriteRefusal({rates:{rampSteps:3}},{...OFF,recoveryPool:true})).toBeNull();
    expect(freightWriteRefusal({cost:{mpg:10}},{...OFF,deliveryCostModel:true})).toBeNull();
    expect(freightWriteRefusal({enabled:true,rates:{},cost:{}},ON)).toBeNull();
  });

  it('leaves a body that is not an object to the route checks (nothing to refuse)',()=>{
    expect(freightWriteRefusal(undefined,OFF)).toBeNull();
    expect(freightWriteRefusal([1],OFF)).toBeNull();
  });
});
