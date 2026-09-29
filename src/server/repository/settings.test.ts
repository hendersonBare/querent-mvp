import {describe,expect,it} from 'vitest';
import {deliveryRates,floorFor,pricingSettings,repFloors,setScarcityUplift,updateOwnFloor} from './settings';
import {useSeededDatabase} from './test-db';

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
