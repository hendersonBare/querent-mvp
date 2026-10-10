import {describe,expect,it} from 'vitest';
import {deliveryRates,floorFor,freeDeliverySettings,freightCostSettings,freightRateSettings,pricingSettings,repFloors,setScarcityUplift,updateOwnFloor} from './settings';
import {setSettingFixture,useSeededDatabase} from './test-db';

useSeededDatabase();

describe('pricing settings and delivery rates',()=>{
  it('has scarcity uplift off by default and toggles it',()=>{
    expect(pricingSettings()).toEqual({scarcity_uplift_enabled:false});
    setScarcityUplift(true);
    expect(pricingSettings()).toEqual({scarcity_uplift_enabled:true});
    setScarcityUplift(false);
    expect(pricingSettings()).toEqual({scarcity_uplift_enabled:false});
  });

  it('returns the seed delivery rates (spec §5.3)',()=>{
    expect(deliveryRates()).toEqual({base_fee:25,per_mile:2.5,min_charge:35,free_threshold:1500,max_radius_miles:75,road_factor:1.25});
  });
});

describe('margin floors (rep x category)',()=>{
  it('lists a rep\'s floor for every category in display order',()=>{
    const floors=repFloors('brandi');
    expect(floors.map(f=>[f.category_name,f.margin_floor])).toEqual([['Fasteners',0.2],['Abrasives & Cutting',0.25],['Safety & PPE',0.3],['Material Handling & Tie-downs',0.2],['Tools',0.18],['Janitorial/MRO',0.2]]);
    expect(floors[0]).toMatchObject({rep_id:'brandi',category_id:'fasteners'});
    expect(repFloors('mara').every(f=>f.margin_floor===0.2)).toBe(true);
    expect(repFloors('nobody')).toEqual([]);
  });

  it('returns one floor, or undefined when there is none',()=>{
    expect(floorFor('brandi','safety')).toBe(0.3);
    expect(floorFor('eli','safety')).toBe(0.2);
    expect(floorFor('brandi','nothing')).toBeUndefined();
  });

  it('updates only the acting rep\'s own floor and stamps the time',()=>{
    const updated=updateOwnFloor('brandi','fasteners',0.22,'2026-09-26T17:00:00.000Z');
    expect(updated).toEqual({rep_id:'brandi',category_id:'fasteners',category_name:'Fasteners',margin_floor:0.22,updated_at:'2026-09-26T17:00:00.000Z'});
    expect(floorFor('brandi','fasteners')).toBe(0.22);
    expect(floorFor('mara','fasteners')).toBe(0.2);
    expect(updateOwnFloor('brandi','nothing',0.2)).toBeUndefined();
  });

  it('rejects a floor outside 0 to under 100%',()=>{
    expect(()=>updateOwnFloor('brandi','fasteners',1)).toThrow(RangeError);
    expect(()=>updateOwnFloor('brandi','fasteners',-0.01)).toThrow(RangeError);
    expect(()=>updateOwnFloor('brandi','fasteners',Number.NaN)).toThrow(RangeError);
    expect(floorFor('brandi','fasteners')).toBe(0.22);
  });
});

describe('free delivery pricing and freight settings (spec §1.3, OA-4)',()=>{
  it('fall back to the code defaults when no key is stored',()=>{
    expect(freeDeliverySettings()).toEqual({enabled:false,enabledAt:null});
    expect(freightCostSettings()).toEqual({mpg:10,fuelType:'gasoline',wearCentsPerMile:20,depreciationCentsPerMile:15,driverCentsPerHour:2500,avgSpeedMph:35,stopMinutes:0,fuelManualCents:null});
    expect(freightRateSettings()).toEqual({startingRateBp:300,rateCapBp:800,lineCapBp:800,rampSteps:3,rampDays:90});
  });

  it('read stored values',async()=>{
    const stored:[string,string][]=[['free_delivery_pricing','true'],['free_delivery_enabled_at','2026-09-01T15:00:00.000Z'],
      ['freight_vehicle_mpg','12.5'],['freight_fuel_type','diesel'],['freight_wear_cents_per_mile','22'],['freight_depreciation_cents_per_mile','16.5'],['freight_driver_cents_per_hour','2800'],
      ['freight_avg_speed_mph','40'],['freight_stop_minutes','15'],['freight_fuel_manual_cents','415'],
      ['freight_starting_rate_bp','350'],['freight_rate_cap_bp','1000'],['freight_line_cap_bp','600'],['freight_ramp_steps','4'],['freight_ramp_days','120']];
    for(const [key,value] of stored)await setSettingFixture(key,value);
    expect(freeDeliverySettings()).toEqual({enabled:true,enabledAt:'2026-09-01T15:00:00.000Z'});
    expect(freightCostSettings()).toEqual({mpg:12.5,fuelType:'diesel',wearCentsPerMile:22,depreciationCentsPerMile:16.5,driverCentsPerHour:2800,avgSpeedMph:40,stopMinutes:15,fuelManualCents:415});
    expect(freightRateSettings()).toEqual({startingRateBp:350,rateCapBp:1000,lineCapBp:600,rampSteps:4,rampDays:120});
    expect(pricingSettings()).toEqual({scarcity_uplift_enabled:false});
  });

  it('treat a manual fuel price of 0 as set (it wins), and fall back to the default on an unreadable value',async()=>{
    await setSettingFixture('freight_fuel_manual_cents','0');
    expect(freightCostSettings().fuelManualCents).toBe(0);
    await setSettingFixture('freight_fuel_manual_cents','');
    await setSettingFixture('freight_vehicle_mpg','ten');
    await setSettingFixture('freight_fuel_type','kerosene');
    await setSettingFixture('free_delivery_pricing','yes');
    await setSettingFixture('free_delivery_enabled_at',null);
    expect(freightCostSettings()).toMatchObject({fuelManualCents:null,mpg:10,fuelType:'gasoline'});
    expect(freeDeliverySettings()).toEqual({enabled:false,enabledAt:null});
  });
});
