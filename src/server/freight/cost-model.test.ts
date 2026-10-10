import {describe,expect,it} from 'vitest';
import {COST_MODEL_DEFAULTS,modelFuelPriceCents,modelledDeliveryCost,type CostModelInput} from './cost-model';

// Modelled delivery cost (spec §4.2, decision 29, OA-4; test plan §12 "Cost model").
const DEFAULTS:CostModelInput={miles:15,mpg:10,fuelPriceCents:340,wearCentsPerMile:20,depreciationCentsPerMile:15,driverCentsPerHour:2500,avgSpeedMph:35,stopMinutes:0};
const cost=(overrides:Partial<CostModelInput>={})=>modelledDeliveryCost({...DEFAULTS,...overrides});

describe('the spec §4.2 worked example (Wasatch ship-to, SLC branch, defaults, gasoline $3.40/gal)',()=>{
  it('15.0 road mi -> 30.0 mi round trip -> 4212.857…¢ -> 4213¢ ($42.13)',()=>{
    const result=cost();
    expect(result.roundTripMiles).toBe(30);
    expect(result.driveHours).toBeCloseTo(30/35,12);
    expect(result.components.fuel).toBe(1020);
    expect(result.components.wear).toBe(600);
    expect(result.components.depreciation).toBe(450);
    expect(result.components.driver).toBeCloseTo(2142.857142857,6);
    expect(result.cents).toBe(4213);
  });

  it('with a 15-minute stop: driver 2767.857…¢, total 4837.857… -> 4838¢ ($48.38)',()=>{
    const result=cost({stopMinutes:15});
    expect(result.components.driver).toBeCloseTo(2767.857142857,6);
    expect(result.driveHours).toBeCloseTo(30/35,12); // drive time only; the stop is billed on top
    expect(result.cents).toBe(4838);
  });

  it('keeps the components unrounded and rounds once at the end',()=>{
    // 0.25 mi -> 0.5 mi round trip: wear 0.5 × 21 = 10.5¢, depreciation 0.5 × 15.4 = 7.7¢ -> 18.2¢ -> 18¢
    // (rounding each component first would give 11 + 8 = 19¢).
    const result=cost({miles:0.25,fuelPriceCents:0,wearCentsPerMile:21,depreciationCentsPerMile:15.4,driverCentsPerHour:0});
    expect(result.components.wear).toBeCloseTo(10.5,10);
    expect(result.components.depreciation).toBeCloseTo(7.7,10);
    expect(result.cents).toBe(18);
  });
});

describe('edge inputs',()=>{
  it('a zero fuel price leaves only wear, depreciation and driver (600 + 450 + 2142.857… = 3193¢)',()=>{
    const result=cost({fuelPriceCents:0});
    expect(result.components.fuel).toBe(0);
    expect(result.cents).toBe(3193);
  });

  it('zero miles costs nothing but the stop time',()=>{
    expect(cost({miles:0})).toEqual({cents:0,components:{fuel:0,wear:0,depreciation:0,driver:0},roundTripMiles:0,driveHours:0});
    expect(cost({miles:0,stopMinutes:15}).cents).toBe(625); // 0.25 h × 2500¢
  });

  it('refuses inputs the formula cannot use, naming the input, instead of returning Infinity or NaN',()=>{
    expect(()=>cost({mpg:0})).toThrow(/MPG/);
    expect(()=>cost({mpg:-5})).toThrow(RangeError);
    expect(()=>cost({avgSpeedMph:0})).toThrow(/speed/i);
    expect(()=>cost({avgSpeedMph:-1})).toThrow(RangeError);
    expect(()=>cost({miles:-1})).toThrow(/miles/i);
    expect(()=>cost({miles:Number.NaN})).toThrow(RangeError);
    expect(()=>cost({fuelPriceCents:-1})).toThrow(/fuel price/i);
    expect(()=>cost({wearCentsPerMile:-1})).toThrow(RangeError);
    expect(()=>cost({depreciationCentsPerMile:Number.POSITIVE_INFINITY})).toThrow(RangeError);
    expect(()=>cost({driverCentsPerHour:-1})).toThrow(RangeError);
    expect(()=>cost({stopMinutes:-1})).toThrow(/stop/i);
  });
});

describe('code defaults (spec §1.3, OA-4)',()=>{
  it('are the demo placeholders',()=>{
    expect(COST_MODEL_DEFAULTS).toEqual({mpg:10,fuelType:'gasoline',wearCentsPerMile:20,depreciationCentsPerMile:15,driverCentsPerHour:2500,avgSpeedMph:35,stopMinutes:0,fuelManualCents:null});
  });
});

describe('the fuel price the model uses (spec §4.3, decision 30)',()=>{
  it('a manual price always wins',()=>{
    expect(modelFuelPriceCents({fuelType:'gasoline',manualCents:399,gasolineCents:340})).toBe(399);
    expect(modelFuelPriceCents({fuelType:'diesel',manualCents:415,gasolineCents:340})).toBe(415);
    expect(modelFuelPriceCents({fuelType:'gasoline',manualCents:0,gasolineCents:340})).toBe(0);
  });

  it('gasoline uses the stored price, or 0 when there is none',()=>{
    expect(modelFuelPriceCents({fuelType:'gasoline',manualCents:null,gasolineCents:340})).toBe(340);
    expect(modelFuelPriceCents({fuelType:'gasoline',manualCents:null,gasolineCents:null})).toBe(0);
  });

  it('diesel uses the manual price, or $0 when none exists (never the gasoline price)',()=>{
    expect(modelFuelPriceCents({fuelType:'diesel',manualCents:null,gasolineCents:340})).toBe(0);
    // Diesel at $4.15 on the worked example: fuel 30 ÷ 10 × 415 = 1245¢ -> 4437.857… -> 4438¢.
    const fuelPriceCents=modelFuelPriceCents({fuelType:'diesel',manualCents:415,gasolineCents:340});
    expect(cost({fuelPriceCents}).cents).toBe(4438);
    expect(cost({fuelPriceCents:modelFuelPriceCents({fuelType:'diesel',manualCents:null,gasolineCents:340})}).cents).toBe(3193);
  });
});
