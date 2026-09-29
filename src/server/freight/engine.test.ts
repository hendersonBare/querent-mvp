import {describe,expect,it,vi} from 'vitest';
import type {DeliveryRates} from '@/domain';
import type {DistanceProvider,Place} from './distance';
import {CALL_FOR_FREIGHT,computeFreight,priceDelivery,resolveFreight,type FreightInput,type FreightQuote} from './engine';

// Spec §5.3 seed rates.
const RATES:DeliveryRates={base_fee:25,per_mile:2.5,min_charge:35,free_threshold:1500,max_radius_miles:75,road_factor:1.25};
const SLC={code:'SLC',lat:40.725,lng:-111.933};
const WASATCH:Place={address:'1800 W 10950 S, South Jordan, UT 84095',lat:40.5513,lng:-111.933};

/** A stand-in routing API that always answers `miles`. */
const fixedMiles=(miles:number|null)=>({roadMiles:vi.fn<DistanceProvider['roadMiles']>(async()=>miles)});
const delivery=(overrides:Partial<FreightInput>={}):FreightInput=>({willCall:false,branch:SLC,shipTo:WASATCH,subtotal:500,rates:RATES,...overrides});
const at=(miles:number,overrides:Partial<FreightInput>={})=>computeFreight(delivery(overrides),fixedMiles(miles));

describe('the spec §5.3 worked example',()=>{
  it('prices SLC to the Wasatch yard: 12 mi straight-line -> 15.0 road mi -> $25 + $37.50 = $62.50',async()=>{
    expect(await computeFreight(delivery())).toEqual({
      rule:'distance',amount:62.5,miles:15,
      formula:'$25.00 + $2.50/mi × 15.0 mi = $62.50',
      explanation:'15.0 mi from SLC: $25.00 + $2.50/mi × 15.0 mi = $62.50.',
    });
  });
});

describe('will call',()=>{
  it('is $0 and measures nothing',async()=>{
    const provider=fixedMiles(15);
    expect(await computeFreight(delivery({willCall:true}),provider)).toEqual({rule:'will_call',amount:0,miles:null,formula:null,explanation:'Will call at SLC: no freight.'});
    expect(provider.roadMiles).not.toHaveBeenCalled();
  });

  it('is $0 even with no ship-to, a tiny subtotal, or a ship-to far beyond the radius',async()=>{
    for(const input of [{shipTo:null},{subtotal:1},{subtotal:0}])expect((await computeFreight(delivery({willCall:true,...input}),fixedMiles(15))).amount).toBe(0);
    expect(await at(500,{willCall:true})).toMatchObject({rule:'will_call',amount:0});
  });
});

describe('max radius',()=>{
  it('prices a delivery exactly at MAX_RADIUS (75.0 mi)',async()=>{
    expect(await at(75)).toMatchObject({rule:'distance',amount:212.5,miles:75});
  });

  it('is call for freight just over MAX_RADIUS (75.1 mi), for the rep to price by hand',async()=>{
    expect(await at(75.1)).toEqual({
      rule:'beyond_radius',amount:CALL_FOR_FREIGHT,miles:75.1,formula:null,
      explanation:'75.1 mi from SLC is beyond the 75 mi delivery radius. Call for freight: set it by hand before sending.',
    });
  });

  it('compares the rounded miles: 75.04 rounds to 75.0 (priced), 75.05 to 75.1 (call for freight)',async()=>{
    expect(await at(75.04)).toMatchObject({rule:'distance',miles:75});
    expect(await at(75.05)).toMatchObject({rule:'beyond_radius',miles:75.1});
  });

  it('wins over the free threshold: a big order beyond the radius is still call for freight',async()=>{
    expect(await at(80,{subtotal:5000})).toMatchObject({rule:'beyond_radius',amount:CALL_FOR_FREIGHT,miles:80});
  });
});

describe('free threshold',()=>{
  it('is $0 at exactly FREE_THRESHOLD ($1,500.00), still showing the miles',async()=>{
    expect(await at(15,{subtotal:1500})).toEqual({
      rule:'free_threshold',amount:0,miles:15,formula:null,
      explanation:'Free delivery: items total $1,500.00, at or over the $1,500.00 threshold. 15.0 mi from SLC.',
    });
  });

  it('charges by distance just under it ($1,499.99)',async()=>{
    expect(await at(15,{subtotal:1499.99})).toMatchObject({rule:'distance',amount:62.5});
  });

  it('is $0 above it',async()=>{
    expect(await at(15,{subtotal:4200.5})).toMatchObject({rule:'free_threshold',amount:0});
  });

  it('treats floating-point noise on $1,500 as $1,500',async()=>{
    // Lines of 6 x $170.70 and 1 x $475.80 add up to $1,500.00, but to 1499.9999999999998 in floating point.
    const subtotal=6*170.7+475.8;
    expect(subtotal).toBeLessThan(1500);
    expect(await at(15,{subtotal})).toMatchObject({rule:'free_threshold',amount:0});
  });
});

describe('minimum charge',()=>{
  it('kicks in for short distances: 3.0 mi is $32.50 by formula, so $35.00',async()=>{
    expect(await at(3)).toEqual({
      rule:'min_charge',amount:35,miles:3,
      formula:'$25.00 + $2.50/mi × 3.0 mi = $32.50',
      explanation:'3.0 mi from SLC: $25.00 + $2.50/mi × 3.0 mi = $32.50, below the $35.00 minimum charge.',
    });
  });

  it('applies right up to the break-even distance (3.9 mi = $34.75)',async()=>{
    expect(await at(3.9)).toMatchObject({rule:'min_charge',amount:35});
  });

  it('stops applying where the formula reaches it: 4.0 mi is exactly $35.00 by distance',async()=>{
    expect(await at(4)).toMatchObject({rule:'distance',amount:35,formula:'$25.00 + $2.50/mi × 4.0 mi = $35.00'});
    expect(await at(4.1)).toMatchObject({rule:'distance',amount:35.25});
  });

  it('covers a ship-to at the branch itself (0.0 mi)',async()=>{
    expect(await computeFreight(delivery({shipTo:{lat:SLC.lat,lng:SLC.lng}}))).toMatchObject({rule:'min_charge',amount:35,miles:0});
  });
});

describe('rounding',()=>{
  it('rounds road miles to one decimal before pricing',async()=>{
    expect(await at(14.96)).toMatchObject({miles:15,amount:62.5});
    expect(await at(14.94)).toMatchObject({miles:14.9,amount:62.25});
    // 2.36 mi straight-line x 1.25 = 2.9499999999999997 in floating point: still 3.0 mi.
    expect(await at(2.36*1.25)).toMatchObject({miles:3});
  });

  it('rounds dollars to cents, showing a sub-cent per-mile rate in full so the formula adds up',async()=>{
    const rates={...RATES,base_fee:19.99,per_mile:2.333};
    // 19.99 + 2.333 x 15.1 = 55.2183
    expect(await at(15.1,{rates})).toMatchObject({rule:'distance',amount:55.22,formula:'$19.99 + $2.333/mi × 15.1 mi = $55.22'});
  });

  it('formats large amounts with thousands separators',async()=>{
    const rates={...RATES,base_fee:1000,max_radius_miles:500};
    expect((await at(200,{rates})).formula).toBe('$1,000.00 + $2.50/mi × 200.0 mi = $1,500.00');
  });
});

describe('missing ship-to on a delivery',()=>{
  it('is call for freight with no miles when there is no ship-to, and measures nothing',async()=>{
    const provider=fixedMiles(15);
    expect(await computeFreight(delivery({shipTo:null}),provider)).toEqual({
      rule:'no_ship_to',amount:CALL_FOR_FREIGHT,miles:null,formula:null,
      explanation:'Delivery has no ship-to address, so freight can\'t be priced by distance. Add a ship-to, or set freight by hand.',
    });
    expect(provider.roadMiles).not.toHaveBeenCalled();
  });

  it('treats a ship-to with a blank address and no coordinates as missing',async()=>{
    expect(await computeFreight(delivery({shipTo:{address:'  ',lat:null,lng:null}}))).toMatchObject({rule:'no_ship_to',amount:CALL_FOR_FREIGHT});
    expect(await computeFreight(delivery({shipTo:{lat:null,lng:null}}))).toMatchObject({rule:'no_ship_to'});
  });

  it('is call for freight when the ship-to has an address but the provider can\'t locate it',async()=>{
    expect(await computeFreight(delivery({shipTo:{address:'1800 W 10950 S, South Jordan, UT 84095',lat:null,lng:null}}))).toEqual({
      rule:'no_distance',amount:CALL_FOR_FREIGHT,miles:null,formula:null,
      explanation:'Can\'t measure the distance from SLC to the ship-to. Set freight by hand.',
    });
    expect(await at(Number.NaN)).toMatchObject({rule:'no_distance',miles:null});
  });
});

describe('the DistanceProvider seam',()=>{
  it('measures from the quote branch to the ship-to with whatever provider it is given',async()=>{
    const provider=fixedMiles(20);
    const branch={code:'Provo',lat:40.215,lng:-111.656};
    expect(await computeFreight(delivery({branch}),provider)).toMatchObject({rule:'distance',amount:75,miles:20,explanation:'20.0 mi from Provo: $25.00 + $2.50/mi × 20.0 mi = $75.00.'});
    expect(provider.roadMiles).toHaveBeenCalledExactlyOnceWith(branch,WASATCH);
  });

  it('uses the rates it is given',async()=>{
    const rates={base_fee:10,per_mile:1,min_charge:0,free_threshold:100,max_radius_miles:10,road_factor:1.25};
    expect(await at(10,{rates,subtotal:99.99})).toMatchObject({rule:'distance',amount:20});
    expect(await at(10.1,{rates,subtotal:99.99})).toMatchObject({rule:'beyond_radius'});
    expect(await at(10,{rates,subtotal:100})).toMatchObject({rule:'free_threshold',amount:0});
  });
});

describe('priceDelivery (the rules once miles are known)',()=>{
  it('applies the same rules synchronously, for callers that already have the miles',()=>{
    expect(priceDelivery({origin:'SLC',miles:15,subtotal:500,rates:RATES})).toMatchObject({rule:'distance',amount:62.5});
    expect(priceDelivery({origin:'SLC',miles:15,subtotal:1500,rates:RATES})).toMatchObject({rule:'free_threshold',amount:0});
    expect(priceDelivery({origin:'SLC',miles:2,subtotal:500,rates:RATES})).toMatchObject({rule:'min_charge',amount:35});
    expect(priceDelivery({origin:'Ogden',miles:90,subtotal:500,rates:RATES})).toMatchObject({rule:'beyond_radius',amount:CALL_FOR_FREIGHT});
  });
});

describe('resolveFreight (the rep override)',()=>{
  const priced:FreightQuote={rule:'distance',amount:62.5,miles:15,formula:'$25.00 + $2.50/mi × 15.0 mi = $62.50',explanation:'15.0 mi from SLC: $25.00 + $2.50/mi × 15.0 mi = $62.50.'};
  const callForFreight:FreightQuote={rule:'beyond_radius',amount:CALL_FOR_FREIGHT,miles:80,formula:null,explanation:'80.0 mi from SLC is beyond the 75 mi delivery radius. Call for freight: set it by hand before sending.'};

  it('uses the computed freight when there is no override',()=>{
    expect(resolveFreight(priced,null)).toEqual({computed:priced,override:null,amount:62.5,source:'computed',unresolved:false});
  });

  it('lets the override win over computed freight, keeping the computed figure for reference',()=>{
    const override={amount:75,reason:'Liftgate needed'};
    expect(resolveFreight(priced,override)).toEqual({computed:priced,override,amount:75,source:'override',unresolved:false});
  });

  it('resolves call for freight once the rep sets an amount',()=>{
    expect(resolveFreight(callForFreight,null)).toMatchObject({amount:CALL_FOR_FREIGHT,source:'computed',unresolved:true});
    expect(resolveFreight(callForFreight,{amount:140,reason:'Quoted by carrier'})).toMatchObject({amount:140,source:'override',unresolved:false});
  });

  it('keeps a $0 override (the rep waiving freight)',()=>{
    expect(resolveFreight(priced,{amount:0,reason:'Waived for this job'})).toMatchObject({amount:0,source:'override'});
  });

  it('wins over will-call $0 as well',()=>{
    const willCall:FreightQuote={rule:'will_call',amount:0,miles:null,formula:null,explanation:'Will call at SLC: no freight.'};
    expect(resolveFreight(willCall,{amount:15,reason:'Hot-shot to job site'})).toMatchObject({amount:15,source:'override'});
  });

  it('marks a missing ship-to unresolved until overridden',()=>{
    const noShipTo:FreightQuote={rule:'no_ship_to',amount:CALL_FOR_FREIGHT,miles:null,formula:null,explanation:''};
    expect(resolveFreight(noShipTo,null).unresolved).toBe(true);
    expect(resolveFreight(noShipTo,{amount:50,reason:'Customer will confirm site'}).unresolved).toBe(false);
  });
});
