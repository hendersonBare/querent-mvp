import {describe,expect,it} from 'vitest';
import type {DeliveryRates} from '@/domain';
import {CALL_FOR_FREIGHT,priceDelivery,resolveFreight,type FreightOverride,type FreightQuote} from '@/server/freight/engine';
import {creditBar,creditPercent,creditUse,freightDisplay,liveFreightQuote} from './quote-panels-math';
import {liveFreight} from './quote-math';

// The side panels' math (task 3.4; spec §4, §5.3): the credit bar and the freight the Pickup or
// delivery panel shows. Wasatch (seed): limit $50,000.00, open balance $18,420.00.

const RATES:DeliveryRates={base_fee:25,per_mile:2.5,min_charge:35,free_threshold:1500,max_radius_miles:75};

describe('creditUse (the worksheet formula, task 4.2)',()=>{
  it('is open / limit without the quote and (open + total) / limit with it: the sample is 37% and 39%',()=>{
    const use=creditUse(50000,18420,1122.4)!;
    expect(use).toEqual({used:0.3684,withQuote:expect.closeTo(0.390848,9),overBy:0});
    expect([creditPercent(use.used),creditPercent(use.withQuote)]).toEqual(['37%','39%']);
  });

  it('is null without a positive limit, and counts a missing open balance as $0',()=>{
    expect(creditUse(null,18420,100)).toBeNull();
    expect(creditUse(0,18420,100)).toBeNull();
    expect(creditUse(-5,18420,100)).toBeNull();
    expect(creditUse(Number.NaN,18420,100)).toBeNull();
    expect(creditUse(1000,null,250)).toEqual({used:0,withQuote:0.25,overBy:0});
  });

  it('measures the overage to the cent, and nothing at exactly the limit',()=>{
    expect(creditUse(20000,18420,1856.75)!.overBy).toBe(276.75);
    expect(creditUse(20000,18877.6,1122.4)).toEqual({used:expect.closeTo(0.94388,9),withQuote:1,overBy:0});
    expect(creditUse(20000,18877.6,1122.41)!.overBy).toBe(0.01);
  });
});

describe('creditBar',()=>{
  it('draws the open balance in green and this quote in grey from where the green ends',()=>{
    expect(creditBar(50000,18420,1122.4)).toEqual({used:0.3684,withQuote:expect.closeTo(0.390848,9),overBy:0,open:36.84,quote:2.24,over:false,
      label:'Credit used, with this quote: 39%',overLabel:null});
  });

  it('follows the quote total live: more quote, a longer grey segment',()=>{
    const small=creditBar(50000,18420,592.75)!,big=creditBar(50000,18420,5000)!;
    expect(small.open).toBe(big.open);
    expect(small.quote).toBe(1.19);
    expect(big.quote).toBe(10);
    expect(big.label).toBe('Credit used, with this quote: 47%');
    expect(creditBar(50000,18420,0)).toMatchObject({quote:0,label:'Credit used, with this quote: 37%'});
  });

  it('over the limit: the grey stops at 100%, the end turns red and it says by how much (a warning only)',()=>{
    const bar=creditBar(20000,18420,1856.75)!;
    expect(bar).toMatchObject({open:92.1,quote:7.9,over:true,label:'Credit used, with this quote: 101%',overLabel:'Over limit by $276.75'});
    expect(bar.open+bar.quote).toBe(100);
  });

  it('when the open balance alone is over the limit, green fills the bar and the quote adds to the overage',()=>{
    expect(creditBar(10000,18420,100)).toMatchObject({open:100,quote:0,over:true,overBy:8520,overLabel:'Over limit by $8,520.00',label:'Credit used, with this quote: 185%'});
  });

  it('exactly at the limit is full but not over',()=>{
    expect(creditBar(20000,18877.6,1122.4)).toMatchObject({open:94.39,quote:5.61,over:false,overLabel:null,label:'Credit used, with this quote: 100%'});
  });

  it('is null for an account with no credit limit (the placeholder customers)',()=>{
    expect(creditBar(null,null,500)).toBeNull();
  });
});

describe('freightDisplay (Pickup or delivery panel)',()=>{
  const distance=(miles:number,subtotal:number):FreightQuote=>priceDelivery({origin:'SLC',miles,subtotal,rates:RATES});
  const willCall:FreightQuote={rule:'will_call',amount:0,miles:null,formula:null,explanation:'Will call at SLC: no freight.'};
  const noShipTo:FreightQuote={rule:'no_ship_to',amount:CALL_FOR_FREIGHT,miles:null,formula:null,explanation:'Delivery has no ship-to address.'};
  const cases:[string,FreightQuote,FreightOverride|null,number][]=[
    ['will call',willCall,null,1122.4],
    ['distance',distance(15,592.75),null,592.75],
    ['distance, now over the free threshold',distance(15,592.75),null,1600],
    ['free, now under the threshold again',distance(15,1600),null,900],
    ['minimum charge',distance(3,200),null,250],
    ['beyond the radius',distance(80,200),null,200],
    ['no ship-to',noShipTo,null,200],
    ['override on distance',distance(15,592.75),{amount:80,reason:'Liftgate'},592.75],
    ['override on call for freight',noShipTo,{amount:95,reason:'Quoted by the carrier'},200],
    ['override on will call',willCall,{amount:10,reason:'Handling'},1122.4],
  ];

  it.each(cases)('charges exactly what the totals charge: %s',(_name,computed,override,subtotal)=>{
    const freight=resolveFreight(computed,override);
    const shown=freightDisplay(freight,subtotal,RATES,'SLC');
    const totals=liveFreight(freight,subtotal,RATES,'SLC');
    expect(shown.amount).toBe(totals===CALL_FOR_FREIGHT?null:totals);
    expect(shown.callForFreight).toBe(totals===CALL_FOR_FREIGHT);
  });

  it('shows the miles and the formula for the live subtotal',()=>{
    const shown=freightDisplay(resolveFreight(distance(15,592.75),null),592.75,RATES,'SLC');
    expect(shown).toMatchObject({amount:62.5,source:'computed',override:null,computedAmount:62.5,
      computed:{rule:'distance',miles:15,formula:'$25.00 + $2.50/mi × 15.0 mi = $62.50',explanation:'15.0 mi from SLC: $25.00 + $2.50/mi × 15.0 mi = $62.50.'}});
    const free=freightDisplay(resolveFreight(distance(15,592.75),null),1600,RATES,'SLC');
    expect(free).toMatchObject({amount:0,computed:{rule:'free_threshold',miles:15,formula:null}});
    expect(free.computed.explanation).toMatch(/^Free delivery: items total \$1,600\.00, at or over the \$1,500\.00 threshold\. 15\.0 mi from SLC\.$/);
  });

  it('under an override, keeps the computed freight beside it and the reason',()=>{
    const shown=freightDisplay(resolveFreight(distance(15,592.75),{amount:80,reason:'Liftgate'}),592.75,RATES,'SLC');
    expect(shown).toMatchObject({amount:80,source:'override',override:{amount:80,reason:'Liftgate'},computedAmount:62.5,callForFreight:false});
    expect(freightDisplay(resolveFreight(noShipTo,{amount:95,reason:'Carrier'}),200,RATES,'SLC')).toMatchObject({amount:95,computedAmount:null,callForFreight:false});
  });

  it('leaves will call and call for freight as the server priced them',()=>{
    expect(liveFreightQuote(resolveFreight(willCall,null),5000,RATES,'SLC')).toBe(willCall);
    expect(liveFreightQuote(resolveFreight(noShipTo,null),5000,RATES,'SLC')).toBe(noShipTo);
    expect(freightDisplay(resolveFreight(noShipTo,null),200,RATES,'SLC')).toMatchObject({amount:null,callForFreight:true,computedAmount:null});
  });
});
