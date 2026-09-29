import {describe,expect,it,vi} from 'vitest';
import type {NewQuote} from '@/domain';
import {createQuote,deliveryRates,quote,quoteActivity,setDeliveryRates,updateQuoteFulfillment,updateQuoteLine} from '@/server/repository';
import {useSeededDatabase} from '@/server/repository/test-db';
import {CALL_FOR_FREIGHT} from './engine';
import {freightForQuote,freightOverrideOf,overrideFreight,pricedSubtotal} from './quote';

useSeededDatabase();

const T0='2026-09-24T10:00:00.000Z',T1='2026-09-24T11:00:00.000Z',T2='2026-09-24T12:00:00.000Z';
const ST_GEORGE={address:'100 S Main St, St. George, UT 84770',lat:37.0965,lng:-113.5684};
/** A Wasatch delivery quote; ship-to defaults to the Wasatch yard in South Jordan. $315.00 of bolts unless lines are given. */
const deliveryQuote=(input:Partial<NewQuote>={})=>createQuote({customerId:'wasatch',fulfillment:'delivery',branchId:'slc',at:T0,
  lines:[{itemId:'HCS-12-13-2G8',qty:10,unitPrice:31.5,priceBasis:'last_paid'}],...input});

describe('seeded rates',()=>{
  it('are the spec §5.3 seed rates',()=>{
    expect(deliveryRates()).toEqual({base_fee:25,per_mile:2.5,min_charge:35,free_threshold:1500,max_radius_miles:75,road_factor:1.25});
  });
});

describe('freightForQuote',()=>{
  it('is $0 for the sample quote Q-24817, a will call at SLC',async()=>{
    const freight=await freightForQuote(quote('q-24817')!);
    expect(freight).toMatchObject({amount:0,source:'computed',unresolved:false,override:null,computed:{rule:'will_call',miles:null,explanation:'Will call at SLC: no freight.'}});
  });

  it('prices a delivery from SLC to the Wasatch yard as the spec example: 15.0 mi, $62.50',async()=>{
    const freight=await freightForQuote(deliveryQuote());
    expect(freight).toEqual({amount:62.5,source:'computed',unresolved:false,override:null,computed:{
      rule:'distance',amount:62.5,miles:15,formula:'$25.00 + $2.50/mi × 15.0 mi = $62.50',explanation:'15.0 mi from SLC: $25.00 + $2.50/mi × 15.0 mi = $62.50.'}});
  });

  it('uses the rates saved on Settings, road factor included, from the next price on',async()=>{
    const seeded=deliveryRates();
    try{
      setDeliveryRates({base_fee:30,per_mile:3,min_charge:40,free_threshold:1500,max_radius_miles:75,road_factor:1.5});
      // 12.0 straight-line miles x 1.5 = 18.0 road miles: $30 + $3/mi x 18.0 = $84.
      expect((await freightForQuote(deliveryQuote())).computed).toMatchObject({rule:'distance',miles:18,amount:84,formula:'$30.00 + $3.00/mi × 18.0 mi = $84.00'});
    }finally{setDeliveryRates(seeded);}
    expect((await freightForQuote(deliveryQuote())).amount).toBe(62.5);
  });

  it('measures from the branch on the quote',async()=>{
    expect((await freightForQuote(deliveryQuote({branchId:'ogden'}))).computed).toMatchObject({rule:'distance',miles:58,amount:170});
    expect((await freightForQuote(deliveryQuote({branchId:'provo'}))).computed).toMatchObject({rule:'distance',miles:34.3,amount:110.75,
      explanation:'34.3 mi from Provo: $25.00 + $2.50/mi × 34.3 mi = $110.75.'});
  });

  it('follows fulfillment and branch changes on the quote',async()=>{
    const q=deliveryQuote();
    updateQuoteFulfillment(q.id,{fulfillment:'will_call'},T1);
    expect((await freightForQuote(quote(q.id)!)).amount).toBe(0);
    updateQuoteFulfillment(q.id,{fulfillment:'delivery',branchId:'provo'},T2);
    expect((await freightForQuote(quote(q.id)!)).amount).toBe(110.75);
  });

  it('is free once priced lines reach $1,500, and charges again just under',async()=>{
    const q=deliveryQuote({lines:[{itemId:'HCS-12-13-2G8',qty:50,unitPrice:30}]});
    expect(await freightForQuote(q)).toMatchObject({amount:0,computed:{rule:'free_threshold',miles:15}});
    updateQuoteLine(q.id,q.lines[0].id,{unitPrice:29.99},T1);
    expect(await freightForQuote(quote(q.id)!)).toMatchObject({amount:62.5,computed:{rule:'distance'}});
  });

  it('counts only priced lines toward the free threshold',async()=>{
    const q=deliveryQuote({lines:[{itemId:'HCS-12-13-2G8',qty:10,unitPrice:31.5},{itemId:'HCS-12-13-2G8',qty:100,unitPrice:null}]});
    expect(pricedSubtotal(q.lines)).toBe(315);
    expect((await freightForQuote(q)).amount).toBe(62.5);
  });

  it('takes a subtotal from the caller, e.g. live edits not saved yet',async()=>{
    expect((await freightForQuote(deliveryQuote(),{subtotal:1500})).amount).toBe(0);
  });

  it('is call for freight, and unresolved, for a delivery with no ship-to',async()=>{
    const freight=await freightForQuote(deliveryQuote({shipTo:null}));
    expect(freight).toMatchObject({amount:CALL_FOR_FREIGHT,unresolved:true,computed:{rule:'no_ship_to',miles:null}});
  });

  it('is call for freight, and unresolved, beyond the 75 mi radius',async()=>{
    const freight=await freightForQuote(deliveryQuote({shipTo:ST_GEORGE}));
    expect(freight).toMatchObject({amount:CALL_FOR_FREIGHT,unresolved:true,computed:{rule:'beyond_radius',miles:332.1}});
  });

  it('measures with the DistanceProvider it is given (a routing API later)',async()=>{
    const provider={roadMiles:vi.fn(async()=>20)};
    const q=deliveryQuote();
    expect((await freightForQuote(q,{provider})).computed).toMatchObject({miles:20,amount:75});
    expect(provider.roadMiles).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({code:'SLC',lat:40.725,lng:-111.933}),
      {address:'1800 W 10950 S, South Jordan, UT 84095',lat:40.5513,lng:-111.933});
  });
});

describe('the rep freight override',()=>{
  it('wins over computed freight and is logged in Activity',async()=>{
    const q=deliveryQuote();
    expect(overrideFreight(q.id,'brandi',{amount:75,reason:'  Liftgate needed '},T1)).toBe(true);
    const saved=quote(q.id)!;
    expect(freightOverrideOf(saved)).toEqual({amount:75,reason:'Liftgate needed'});
    expect(await freightForQuote(saved)).toMatchObject({amount:75,source:'override',unresolved:false,override:{amount:75,reason:'Liftgate needed'},computed:{rule:'distance',amount:62.5}});
    expect(quoteActivity(q.id)).toMatchObject([{at:T1,actor:'rep',actor_id:'brandi',kind:'freight_override',message:'Freight set to $75.00: Liftgate needed'}]);
    expect(saved.updated_at).toBe(T1);
  });

  it('resolves call for freight',async()=>{
    const q=deliveryQuote({shipTo:ST_GEORGE});
    overrideFreight(q.id,'brandi',{amount:1240,reason:'Quoted by carrier'},T1);
    expect(await freightForQuote(quote(q.id)!)).toMatchObject({amount:1240,source:'override',unresolved:false,computed:{rule:'beyond_radius'}});
    expect(quoteActivity(q.id).at(-1)?.message).toBe('Freight set to $1,240.00: Quoted by carrier');
  });

  it('can waive freight with a $0 override',async()=>{
    const q=deliveryQuote();
    overrideFreight(q.id,'brandi',{amount:0,reason:'Waived: rep on site Friday'},T1);
    expect(await freightForQuote(quote(q.id)!)).toMatchObject({amount:0,source:'override'});
  });

  it('goes back to computed freight when cleared, and logs that too',async()=>{
    const q=deliveryQuote();
    overrideFreight(q.id,'brandi',{amount:75,reason:'Liftgate needed'},T1);
    expect(overrideFreight(q.id,'brandi',null,T2)).toBe(true);
    const saved=quote(q.id)!;
    expect(freightOverrideOf(saved)).toBeNull();
    expect(await freightForQuote(saved)).toMatchObject({amount:62.5,source:'computed',override:null});
    expect(quoteActivity(q.id).map(a=>[a.at,a.kind,a.message])).toEqual([
      [T1,'freight_override','Freight set to $75.00: Liftgate needed'],
      [T2,'freight_override','Freight override removed: back to distance-based freight.'],
    ]);
  });

  it('needs a reason and a non-negative amount, and writes nothing otherwise',()=>{
    const q=deliveryQuote();
    expect(()=>overrideFreight(q.id,'brandi',{amount:75,reason:'   '},T1)).toThrow('needs a reason');
    expect(()=>overrideFreight(q.id,'brandi',{amount:-5,reason:'Credit'},T1)).toThrow(RangeError);
    expect(quote(q.id)).toMatchObject({freight_override:null,freight_override_reason:null,updated_at:T0});
    expect(quoteActivity(q.id)).toEqual([]);
  });

  it('returns false for an unknown quote',()=>{
    expect(overrideFreight('nope','brandi',{amount:75,reason:'Liftgate needed'},T1)).toBe(false);
    expect(quoteActivity('nope')).toEqual([]);
  });
});
