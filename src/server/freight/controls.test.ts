import {describe,expect,it} from 'vitest';
import {checkFreightUpdate,rampSchedule} from './controls';

// The manager's free delivery pricing controls (v3 spec §1.3, §4.4, §5 "GET/PUT
// /api/rep/settings/freight"; decisions 28, 29, 31, 35; OA-41): what a PUT may change, checked as
// the manager types and again on save, and the ramp schedule Pricing & delivery shows.

const ok=(input:unknown)=>{const r=checkFreightUpdate(input);expect(r.problem).toBeNull();return r.update;};
const problem=(input:unknown)=>checkFreightUpdate(input).problem;

describe('checkFreightUpdate',()=>{
  it('takes the toggle, any cost inputs and any rate settings, alone or together',()=>{
    expect(ok({enabled:true})).toEqual({enabled:true});
    expect(ok({cost:{mpg:12.5,fuelType:'diesel',wearCentsPerMile:22,depreciationCentsPerMile:16.5,driverCentsPerHour:2800,avgSpeedMph:40,stopMinutes:15,fuelManualCents:415}}))
      .toEqual({cost:{mpg:12.5,fuelType:'diesel',wearCentsPerMile:22,depreciationCentsPerMile:16.5,driverCentsPerHour:2800,avgSpeedMph:40,stopMinutes:15,fuelManualCents:415}});
    expect(ok({rates:{startingRateBp:250,rateCapBp:900,lineCapBp:1000,rampSteps:4,rampDays:120}})).toEqual({rates:{startingRateBp:250,rateCapBp:900,lineCapBp:1000,rampSteps:4,rampDays:120}});
    expect(ok({enabled:false,cost:{stopMinutes:0},rates:{rampSteps:1}})).toEqual({enabled:false,cost:{stopMinutes:0},rates:{rampSteps:1}});
  });

  it('clears the manual fuel price with null, and keeps a manual $0',()=>{
    expect(ok({cost:{fuelManualCents:null}})).toEqual({cost:{fuelManualCents:null}});
    expect(ok({cost:{fuelManualCents:0}})).toEqual({cost:{fuelManualCents:0}});
  });

  it('accepts the edges: caps at 0% and 50%, 1 to 12 steps, 1 to 730 days',()=>{
    ok({rates:{startingRateBp:0,rateCapBp:5000,lineCapBp:0,rampSteps:12,rampDays:730}});
    ok({rates:{rampSteps:1,rampDays:1}});
  });

  it('refuses MPG or speed at or below 0, negative money, and out-of-range values, naming the field in the units the manager types',()=>{
    expect(problem({cost:{mpg:0}})).toBe('Vehicle MPG must be above 0 and at most 200.');
    expect(problem({cost:{avgSpeedMph:-5}})).toBe('Average speed must be above 0 and at most 100 mph.');
    expect(problem({cost:{wearCentsPerMile:-1}})).toBe('Wear per mile must be from $0.00 to $10.00.');
    expect(problem({cost:{depreciationCentsPerMile:1001}})).toBe('Depreciation per mile must be from $0.00 to $10.00.');
    expect(problem({cost:{driverCentsPerHour:-0.01}})).toBe('Driver pay per hour must be from $0.00 to $500.00.');
    expect(problem({cost:{stopMinutes:481}})).toBe('Stop time must be from 0 to 480 minutes.');
    expect(problem({cost:{fuelManualCents:-1}})).toBe('Manual fuel price must be from $0.00 to $20.00.');
    expect(problem({cost:{fuelType:'kerosene'}})).toBe('Choose gasoline or diesel.');
    expect(problem({rates:{rateCapBp:5001}})).toBe('Rate cap must be from 0% to 50%.');
    expect(problem({rates:{lineCapBp:-1}})).toBe('Per-line cap must be from 0% to 50%.');
    expect(problem({rates:{startingRateBp:12.5}})).toBe('Starting rate must be from 0% to 50%, in hundredths of a percent.');
    expect(problem({rates:{rampSteps:0}})).toBe('Ramp steps must be a whole number from 1 to 12.');
    expect(problem({rates:{rampSteps:13}})).toBe('Ramp steps must be a whole number from 1 to 12.');
    expect(problem({rates:{rampDays:731}})).toBe('Ramp days must be a whole number from 1 to 730.');
    expect(problem({rates:{rampDays:1.5}})).toBe('Ramp days must be a whole number from 1 to 730.');
  });

  it('refuses non-numbers, unknown fields, a non-boolean toggle, an empty change and a body that is not an object',()=>{
    expect(problem({cost:{mpg:'10'}})).toBe('Vehicle MPG must be above 0 and at most 200.');
    expect(problem({cost:{mpg:Number.NaN}})).toBe('Vehicle MPG must be above 0 and at most 200.');
    expect(problem({cost:{mpg:null}})).toBe('Vehicle MPG must be above 0 and at most 200.');
    expect(problem({enabled:'yes'})).toBe('Turn free delivery pricing on or off.');
    expect(problem({cost:{fuelPrice:3}})).toBe('Unknown setting: cost.fuelPrice.');
    expect(problem({rates:{poolRateBp:400}})).toBe('Unknown setting: rates.poolRateBp.');
    expect(problem({free_delivery_enabled_at:'2026-01-01'})).toBe('Unknown setting: free_delivery_enabled_at.');
    expect(problem({cost:[]})).toBe('Send the cost inputs as an object.');
    expect(problem({})).toBe('Nothing to change.');
    expect(problem({cost:{}})).toBe('Nothing to change.');
    for(const body of [undefined,null,'x',[],3])expect(problem(body)).toBe('Nothing to change.');
  });
});

describe('rampSchedule: when each step starts and the rate it applies',()=>{
  it('splits 90 days into 3 steps (days 0, 30, 60) at a third, two thirds and all of the rate, dated from the enable time',()=>{
    expect(rampSchedule({baseBp:300,steps:3,days:90,enabledAt:'2026-09-01T15:00:00.000Z'})).toEqual([
      {step:1,fromDay:0,rateBp:100,startsAt:'2026-09-01T15:00:00.000Z'},
      {step:2,fromDay:30,rateBp:200,startsAt:'2026-10-01T15:00:00.000Z'},
      {step:3,fromDay:60,rateBp:300,startsAt:'2026-10-31T15:00:00.000Z'},
    ]);
  });

  it('rounds uneven steps up to the first whole day of the step, and has no dates before enabling',()=>{
    expect(rampSchedule({baseBp:400,steps:4,days:90,enabledAt:null})).toEqual([
      {step:1,fromDay:0,rateBp:100,startsAt:null},
      {step:2,fromDay:23,rateBp:200,startsAt:null},
      {step:3,fromDay:45,rateBp:300,startsAt:null},
      {step:4,fromDay:68,rateBp:400,startsAt:null},
    ]);
    expect(rampSchedule({baseBp:267,steps:1,days:1,enabledAt:null})).toEqual([{step:1,fromDay:0,rateBp:267,startsAt:null}]);
  });
});
