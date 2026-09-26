import {describe,expect,it} from 'vitest';
import {addQuoteLine,createQuote,LAST_PAID_WINDOW_MONTHS,quote,updateQuoteLine} from '@/server/repository';
import {useSeededDatabase} from '@/server/repository/test-db';
import {formatUpsellSummary,HISTORY_MONTHS,upsellGpTotal,type Upsell} from './index';
import {pricerFor,quoteUpsells} from './service';

// The adapter over the repository and the real pricing engine (task 1.1), on the seed pinned to
// the mockup's day (QUERENT_SEED_DATE=2026-09-23).
useSeededDatabase();

const ON='2026-09-23';
const AT='2026-09-23T17:00:00.000Z';
const chips=(upsells:Upsell[])=>upsells.map(u=>[u.id,u.qty,u.unit_price,u.price_basis,u.gp_gain]);

/** A fresh Wasatch quote with Dana's four lines, so tests can apply chips without touching Q-24817. */
function danasQuote(branchId='slc'){
  return createQuote({customerId:'wasatch',fulfillment:'will_call',branchId,at:AT,lines:quote('q-24817')!.lines.map(l=>({itemId:l.item_id,qty:l.qty,unitPrice:l.unit_price,priceBasis:l.price_basis}))});
}

describe('quoteUpsells on the seeded sample quote Q-24817',()=>{
  it('suggests the nut and washer for the bolts, flap discs, a full case of wheels and safety glasses',()=>{
    const upsells=quoteUpsells('q-24817',{on:ON})!;
    // Priced by the engine: nuts and washers at 5 boxes are a broken case (list), flap discs are on
    // contract, wheels stay at the $36.00 contract price. Straps would need 20 at SLC, which has 7.
    expect(chips(upsells)).toEqual([
      ['matching_fastener:HN-12-13-G8',5,19.95,'list',50.75],
      ['matching_fastener:FW-12-G8',5,15.75,'list',41.75],
      ['bought_together:FD-45-60Z',3,44.25,'contract',39.75],
      ['full_case:CW-45-045-T1',8,36,'contract',23.8],
      ['bought_together:SG-CLR-AF',2,29.9,'customer',23.4],
    ]);
    expect(formatUpsellSummary(upsells)).toBe('5 ideas · up to +$179.45 gross profit');
    expect(upsellGpTotal(upsells)).toBe(179.45);
  });

  it('reads naturally next to the mockup\'s "Suggested by Querent"',()=>{
    expect(quoteUpsells('q-24817',{on:ON})!.map(u=>u.wording)).toEqual([
      {title:'Hex nut 1/2-13, Grade 8, yellow zinc (box of 100)',reason:'Matches the 1/2-13 Grade 8 bolts: 5 boxes of 100 cover all 500. Bought with these bolts on all 5 orders that had them in the last 12 months.'},
      {title:'Flat washer 1/2 in, Grade 8, yellow zinc (box of 100)',reason:'Matches the 1/2-13 Grade 8 bolts: 5 boxes of 100 cover all 500. Bought with these bolts on 4 of the 5 orders that had them in the last 12 months.'},
      {title:'Flap disc 4.5 in, 60 grit zirconia (box of 10)',reason:'Bought with cut-off wheels on 4 of the 5 orders that had them in the last 12 months.'},
      {title:'Bump cut-off wheels to 8 boxes (2 full cases)',reason:'A case holds 4 boxes, so 6 leaves a broken case.'},
      {title:'Safety glasses, clear anti-fog (box of 12)',reason:'Bought with nitrile disposable gloves on 2 of the 4 orders that had them in the last 12 months.'},
    ]);
  });

  it('carries one-click actions against the quote\'s own lines',()=>{
    const upsells=quoteUpsells('q-24817',{on:ON})!;
    expect(upsells.map(u=>u.action)).toEqual([
      {type:'add_line',item_id:'HN-12-13-G8',qty:5},{type:'add_line',item_id:'FW-12-G8',qty:5},{type:'add_line',item_id:'FD-45-60Z',qty:3},
      {type:'set_qty',line_id:'q-24817-2',item_id:'CW-45-045-T1',from_qty:6,to_qty:8},{type:'add_line',item_id:'SG-CLR-AF',qty:2},
    ]);
    expect(upsells.map(u=>u.anchor.line_id)).toEqual(['q-24817-1','q-24817-1','q-24817-2','q-24817-2','q-24817-3']);
  });

  it('accepts a quote already loaded, and returns undefined for an unknown quote',()=>{
    expect(quoteUpsells(quote('q-24817')!,{on:ON})).toEqual(quoteUpsells('q-24817',{on:ON}));
    expect(quoteUpsells('q-nope',{on:ON})).toBeUndefined();
  });

  it('reads history over the last 12 months, the same window as last paid',()=>{
    expect(HISTORY_MONTHS).toBe(LAST_PAID_WINDOW_MONTHS);
    // A week later the oldest bolt order (Sep 30, 2025) has left the window.
    const later=quoteUpsells('q-24817',{on:'2026-10-01'})!;
    expect(later.filter(u=>u.kind==='matching_fastener').map(u=>u.evidence)).toEqual([
      expect.objectContaining({part:'nut',history:{orders_together:4,anchor_orders:4}}),
      expect.objectContaining({part:'washer',history:{orders_together:3,anchor_orders:4}}),
    ]);
  });

  it('passes options through to the rules',()=>{
    expect(quoteUpsells('q-24817',{on:ON,options:{maxSuggestions:2}})!.map(u=>u.id)).toEqual(['matching_fastener:HN-12-13-G8','matching_fastener:FW-12-G8']);
    expect(quoteUpsells('q-24817',{on:ON,options:{minShare:0.6}})!.map(u=>u.id)).not.toContain('bought_together:SG-CLR-AF');
  });
});

describe('applying a chip',()=>{
  it('removes it: an added item is on the quote, and a bumped line is a full case',()=>{
    const q=danasQuote();
    const [nut,,,wheels]=quoteUpsells(q.id,{on:ON})!;
    expect([nut.id,wheels.id]).toEqual(['matching_fastener:HN-12-13-G8','full_case:CW-45-045-T1']);
    addQuoteLine(q.id,{itemId:nut.item.id,qty:nut.qty,unitPrice:nut.unit_price,priceBasis:nut.price_basis,addedBy:'upsell'},AT);
    const wheelLine=quote(q.id)!.lines.find(l=>l.item_id==='CW-45-045-T1')!;
    if(wheels.action.type!=='set_qty')throw new Error('expected a bump');
    updateQuoteLine(q.id,wheelLine.id,{qty:wheels.action.to_qty},AT);
    const after=quoteUpsells(q.id,{on:ON})!;
    expect(after.map(u=>u.id)).not.toContain('matching_fastener:HN-12-13-G8');
    expect(after.map(u=>u.id)).not.toContain('full_case:CW-45-045-T1');
    // The 5 boxes of nuts are now a broken case on the quote: a full case is 10 at customer price.
    // 10 x (16.50 - 9.80) - 5 x (19.95 - 9.80) = +$16.25.
    expect(chips(after)).toEqual([
      ['matching_fastener:FW-12-G8',5,15.75,'list',41.75],
      ['bought_together:FD-45-60Z',3,44.25,'contract',39.75],
      ['bought_together:SG-CLR-AF',2,29.9,'customer',23.4],
      ['full_case:HN-12-13-G8',10,16.5,'customer',16.25],
    ]);
  });
});

describe('stock at the quote\'s branch',()=>{
  it('bumps the straps to a full case at Ogden, which has 20, but not at SLC, which has 7',()=>{
    expect(quoteUpsells(danasQuote('slc').id,{on:ON})!.map(u=>u.id)).not.toContain('full_case:RS-2-27-JH');
    const ogden=quoteUpsells(danasQuote('ogden').id,{on:ON})!;
    // 20 straps at the $22.95 customer price: 8 more at $8.75 GP each.
    expect(chips(ogden.filter(u=>u.item.sku==='RS-2-27-JH'))).toEqual([['full_case:RS-2-27-JH',20,22.95,'customer',70]]);
  });
});

describe('a customer with no history',()=>{
  it('gets only the catalog rules, priced at list (placeholder customers have no price level)',()=>{
    const q=createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',at:AT,
      lines:[{itemId:'HCS-12-13-2G8',qty:10,unitPrice:null},{itemId:'CW-45-045-T1',qty:6,unitPrice:null},{itemId:'GLV-N8-L-1000',qty:4,unitPrice:null}]});
    // The unpriced wheel line is measured at Querent's price for 6 (list $46.00): 2 more earn 2 x 21.90.
    expect(chips(quoteUpsells(q.id,{on:ON})!)).toEqual([
      ['matching_fastener:HN-12-13-G8',5,19.95,'list',50.75],
      ['full_case:CW-45-045-T1',8,46,'list',43.8],
      ['matching_fastener:FW-12-G8',5,15.75,'list',41.75],
    ]);
  });
});

describe('pricerFor (task 1.1\'s priceLines)',()=>{
  it('returns Querent\'s price and basis per request, in order, and null for an item it can\'t price',()=>{
    const price=pricerFor({customerId:'wasatch',repId:'brandi',branchId:'slc',on:ON});
    expect(price([{itemId:'HN-12-13-G8',qty:5},{itemId:'NOT-A-SKU',qty:1},{itemId:'HN-12-13-G8',qty:10},{itemId:'CW-45-045-T1',qty:8}])).toEqual([
      {price:19.95,basis:'list'},null,{price:16.5,basis:'customer'},{price:36,basis:'contract'},
    ]);
    expect(price([])).toEqual([]);
  });
});
