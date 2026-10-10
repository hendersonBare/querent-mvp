import {describe,expect,it} from 'vitest';
import type {Quote,QuoteLine} from '@/domain';
import {buildSnapshot,cents,letterheadOf,repContactOf} from './snapshot';

const line=(n:number,qty:number,unit_price:number|null,extra:Partial<QuoteLine>={}):QuoteLine=>({id:`q-1-${n}`,quote_id:'q-1',line_no:n,item_id:`SKU-${n}`,sku:`SKU-${n}`,
  description:`Item ${n}`,pack:'Each',case_qty:1,category_id:'fasteners',category_name:'Fasteners',list_price:99,qty,unit_price,price_basis:'custom',suggested_price:1,
  suggested_basis:'customer',customer_price:1,unit_cost:0.5,freight_recovery:0,explanation:'Internal: margin is thin',requested_text:'bolts',match_score:0.9,added_by:'querent',...extra});

const QUOTE:Quote={id:'q-1',quote_number:'Q-1',customer_id:'wasatch',customer_name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',contact_id:'dana',contact_name:'Dana Ortiz',
  rep_id:'brandi',rep_name:'Brandi Gallegos',status:'ready_for_review',revision:0,conversation_id:null,request_text:null,requested_at:'2026-09-23T16:14:00.000Z',created_at:'2026-09-23T16:15:00.000Z',
  updated_at:'2026-09-23T16:15:00.000Z',sent_at:null,responded_at:null,fulfillment:'delivery',branch_id:'slc',branch_code:'SLC',requested_date:'2026-09-24',fulfillment_time:null,
  ship_to_address:'1800 W 10950 S, South Jordan, UT 84095',ship_to_lat:40.55,ship_to_lng:-111.93,freight_override:null,freight_override_reason:null,freight_rate_bp:null,freight_ramp_step:null,freight_ramp_steps:null,modelled_freight_cents:null,valid_days:14,expires_on:null,valid_until:null,
  customer_po:'7781',customer_note:'Prices include cutting to length.',change_request_note:null,declined_at:null,decline_reason:null,decline_note:null,unread_for_rep:true,unread_for_customer:false,is_sample:false,duplicated_from:null,
  lines:[line(1,10,31.5,{sku:'HCS-12-13-2G8',description:'Hex cap screw',pack:'Box of 50'}),line(2,3,0.1),line(3,7,12.345)]};

describe('buildSnapshot',()=>{
  const snap=buildSnapshot(QUOTE,{revision:2,sentAt:'2026-09-24T15:00:00.000Z',validUntil:'2026-10-08',freight:62.5});

  it('freezes lines, prices, freight, totals and terms for "Q-1 rev 2"',()=>{
    expect(snap).toEqual({
      quote_number:'Q-1',revision:2,sent_at:'2026-09-24T15:00:00.000Z',customer:{name:'Wasatch Mechanical Contractors',account_number:'WAS-1142'},contact:'Dana Ortiz',rep:'Brandi Gallegos',
      fulfillment:'delivery',branch:'SLC',ship_to:'1800 W 10950 S, South Jordan, UT 84095',valid_days:14,valid_until:'2026-10-08',customer_po:'7781',customer_note:'Prices include cutting to length.',
      subtotal:401.72,freight:62.5,total:464.22,
      lines:[
        {sku:'HCS-12-13-2G8',description:'Hex cap screw',pack:'Box of 50',qty:10,unit_price:31.5,total:315},
        {sku:'SKU-2',description:'Item 2',pack:'Each',qty:3,unit_price:0.1,total:0.3},
        {sku:'SKU-3',description:'Item 3',pack:'Each',qty:7,unit_price:12.345,total:86.42},
      ],
    });
  });

  it('totals line by line in cents, so the subtotal is the sum of the line totals shown',()=>{
    expect(snap.subtotal).toBe(cents(snap.lines.reduce((sum,l)=>sum+l.total,0)));
    expect(cents(0.1*3)).toBe(0.3);
    expect(cents(1.005)).toBe(1.01);
  });

  it('never carries cost, margin, suggestions or internal notes',()=>{
    const text=JSON.stringify(snap);
    for(const leak of ['unit_cost','cost','margin','suggested','explanation','Internal','customer_price','match_score','requested_text'])expect(text).not.toContain(leak);
  });

  it('keeps the freight miles when given (the customer PDF prints them), and adds no key otherwise',()=>{
    expect(buildSnapshot(QUOTE,{revision:1,sentAt:'2026-09-24T15:00:00.000Z',validUntil:'2026-10-08',freight:62.5,freightMiles:15})).toMatchObject({freight:62.5,freight_miles:15});
    expect(buildSnapshot({...QUOTE,fulfillment:'will_call'},{revision:1,sentAt:'2026-09-24T15:00:00.000Z',validUntil:'2026-10-08',freight:0,freightMiles:null})).toHaveProperty('freight_miles',null);
    expect(snap).not.toHaveProperty('freight_miles');
  });

  it('freezes the terms, rep contact and letterhead the customer PDF prints, copying named fields only (task 4.1)',()=>{
    const rep={id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi@example.com'};
    const branch={id:'slc',code:'SLC',name:'Salt Lake City',address:'1480 W 2100 S',city:'Salt Lake City',state:'UT',zip:'84119',lat:40.7,lng:-111.9,will_call_phone:'(801) 555-0120',will_call_hours:'Mon–Fri'};
    const supplier={id:'herrick',name:'Herrick Industrial Supply',address:'1480 W 2100 S',city:'Salt Lake City',state:'UT',zip:'84119',phone:'(801) 555-0100',email:'sales@example.com',website:'herrickindustrial.com'};
    const frozen=buildSnapshot(QUOTE,{revision:1,sentAt:'2026-09-24T15:00:00.000Z',validUntil:'2026-10-08',freight:0,terms:'Net 30',
      repContact:{...repContactOf(rep),margin_floor:0.2} as ReturnType<typeof repContactOf>,letterhead:{...letterheadOf(supplier,branch),internal:'x'} as ReturnType<typeof letterheadOf>});
    expect(frozen).toMatchObject({terms:'Net 30',
      rep_contact:{name:'Brandi Gallegos',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi@example.com'},
      letterhead:{supplier:'Herrick Industrial Supply',website:'herrickindustrial.com',branch:'Salt Lake City',address:'1480 W 2100 S',city:'Salt Lake City',state:'UT',zip:'84119',phone:'(801) 555-0120'}});
    expect(JSON.stringify(frozen)).not.toMatch(/margin_floor|"internal"|initials|"lat"|will_call_hours/);
    expect(snap).not.toHaveProperty('terms');
    expect(snap).not.toHaveProperty('rep_contact');
    expect(snap).not.toHaveProperty('letterhead');
  });

  it('freezes the customer-facing unit price: unit price + freight recovery, with no recovery field (spec §4.5)',()=>{
    const recovered={...QUOTE,lines:[line(1,10,31.5,{sku:'HCS-12-13-2G8',freight_recovery:63}),line(2,3,0.1),line(3,7,12.345,{freight_recovery:2})]};
    const frozen=buildSnapshot(recovered,{revision:1,sentAt:'2026-09-24T15:00:00.000Z',validUntil:'2026-10-08',freight:0});
    expect(frozen.lines.map(l=>[l.unit_price,l.total])).toEqual([[32.13,321.3],[0.1,0.3],[12.365,86.56]]);
    expect(frozen).toMatchObject({subtotal:408.16,freight:0,total:408.16});
    expect(JSON.stringify(frozen)).not.toMatch(/recover|rate_bp|ramp|modelled/i);
  });

  it('has no ship-to on will call',()=>{
    expect(buildSnapshot({...QUOTE,fulfillment:'will_call'},{revision:1,sentAt:'2026-09-24T15:00:00.000Z',validUntil:'2026-10-08',freight:0})).toMatchObject({fulfillment:'will_call',ship_to:null,freight:0,total:401.72});
  });

  it('is a copy: later edits to the draft don\'t reach it',()=>{
    const draft=structuredClone(QUOTE);
    const frozen=buildSnapshot(draft,{revision:1,sentAt:'2026-09-24T15:00:00.000Z',validUntil:'2026-10-08',freight:0});
    const before=structuredClone(frozen);
    draft.lines[0].unit_price=1;draft.lines[0].qty=1;draft.customer_note='changed';
    expect(frozen).toEqual(before);
  });

  it('refuses an unpriced line or unpriced freight: send checks come first',()=>{
    expect(()=>buildSnapshot({...QUOTE,lines:[line(1,1,null)]},{revision:1,sentAt:'2026-09-24T15:00:00.000Z',validUntil:'2026-10-08',freight:0})).toThrow(RangeError);
    expect(()=>buildSnapshot(QUOTE,{revision:1,sentAt:'2026-09-24T15:00:00.000Z',validUntil:'2026-10-08',freight:Number.NaN})).toThrow(RangeError);
  });
});
