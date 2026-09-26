import {describe,expect,it} from 'vitest';
import {EARTH_RADIUS_MILES,HaversineRoadFactorProvider,ROAD_FACTOR,haversineMiles,haversineRoadFactor,round1} from './distance';

// Seeded coordinates (src/server/db/seed/accounts.ts): Wasatch's main yard is 12 mi straight-line
// from SLC, the spec §5.3 worked example.
const SLC={lat:40.725,lng:-111.933},OGDEN={lat:41.222,lng:-111.979},PROVO={lat:40.215,lng:-111.656};
const WASATCH={lat:40.5513,lng:-111.933};

describe('round1',()=>{
  it('rounds to one decimal, half up',()=>{
    expect(round1(15.0024)).toBe(15);
    expect(round1(14.94)).toBe(14.9);
    expect(round1(14.96)).toBe(15);
    expect(round1(0.05)).toBe(0.1);
    expect(round1(0)).toBe(0);
  });

  it('rounds x.x5 up even when binary floating point stores it just below',()=>{
    // 2.36 straight-line mi x 1.25 is 2.9499999999999997 in floating point, so a plain
    // Math.round(n*10)/10 gives 2.9 instead of 3.0.
    expect(2.36*1.25).toBeLessThan(2.95);
    expect(Math.round(2.36*1.25*10)/10).toBe(2.9);
    expect(round1(2.36*1.25)).toBe(3);
    expect(round1(4.76*1.25)).toBe(6);
    expect(round1(74.95)).toBe(75);
  });
});

describe('haversineMiles',()=>{
  it('is 0 between a point and itself',()=>{
    expect(haversineMiles(SLC,SLC)).toBe(0);
  });

  it('measures one degree of latitude as about 69.1 miles',()=>{
    expect(haversineMiles({lat:40,lng:-111},{lat:41,lng:-111})).toBeCloseTo(EARTH_RADIUS_MILES*Math.PI/180,6);
    expect(haversineMiles({lat:40,lng:-111},{lat:41,lng:-111})).toBeCloseTo(69.09,2);
  });

  it('measures SLC to the Wasatch yard as 12.0 mi straight-line (the spec example)',()=>{
    expect(haversineMiles(SLC,WASATCH)).toBeCloseTo(12.0,1);
  });

  it('is symmetric',()=>{
    expect(haversineMiles(OGDEN,WASATCH)).toBeCloseTo(haversineMiles(WASATCH,OGDEN),10);
  });

  it('measures across longitude too',()=>{
    // Provo to Wasatch: about 26 mi south-east. Hand-computed with the same formula.
    expect(haversineMiles(PROVO,WASATCH)).toBeGreaterThan(24);
    expect(haversineMiles(PROVO,WASATCH)).toBeLessThan(28);
  });
});

describe('HaversineRoadFactorProvider',()=>{
  it('turns straight-line miles into road miles (x 1.25), rounded to 0.1 mi',async()=>{
    expect(ROAD_FACTOR).toBe(1.25);
    expect(await haversineRoadFactor.roadMiles(SLC,WASATCH)).toBe(15);
    const ogden=await haversineRoadFactor.roadMiles(OGDEN,WASATCH);
    expect(ogden).toBe(round1(haversineMiles(OGDEN,WASATCH)*1.25));
    expect(Number.isInteger(ogden!*10)).toBe(true);
  });

  it('returns 0 for the same place',async()=>{
    expect(await haversineRoadFactor.roadMiles(SLC,{...SLC})).toBe(0);
  });

  it('returns null when either end has no coordinates',async()=>{
    expect(await haversineRoadFactor.roadMiles(SLC,{lat:null,lng:null})).toBeNull();
    expect(await haversineRoadFactor.roadMiles(SLC,{lat:40.5,lng:null})).toBeNull();
    expect(await haversineRoadFactor.roadMiles({lat:null,lng:-111.9},WASATCH)).toBeNull();
    expect(await haversineRoadFactor.roadMiles(SLC,{address:'1800 W 10950 S, South Jordan, UT 84095',lat:null,lng:null})).toBeNull();
  });

  it('takes another road factor',async()=>{
    expect(await new HaversineRoadFactorProvider(1).roadMiles(SLC,WASATCH)).toBe(12);
    expect(await new HaversineRoadFactorProvider(1.5).roadMiles(SLC,WASATCH)).toBe(18);
  });
});
