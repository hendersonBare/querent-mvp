import {describe,expect,it} from 'vitest';
import type {ItemStock,PriceSources} from '@/domain';
import type {PricingInput} from './engine';
import {explainPrice,explainQuoteGp,formatGp,formatMoney,lastPaidDate,priceReasons} from './explain';
import {priceLine} from './index';

// "Why this price?" (spec §4, §5.1): one sentence naming the fact behind Querent's price, then
// "+$X GP vs customer price". The seeded sample quote Q-24817 is the reference.

const ON='2026-09-23';
const BOLTS:PriceSources={item_id:'HCS-12-13-2G8',sku:'HCS-12-13-2G8',list_price:38.95,customer_price:30.95,contract:null,cost:21.4,case_qty:10,category_id:'fasteners',
  last_paid:{unit_price:31.5,qty:10,order_date:'2026-08-12',order_number:'SO-51221'}};
const WHEELS:PriceSources={item_id:'CW-45-045-T1',sku:'CW-45-045-T1',list_price:46,customer_price:38.95,cost:24.1,case_qty:4,category_id:'abrasives',
  contract:{contract_id:'wasatch-2026-abrasives',contract_number:'WAS-C-2026-01',contract_name:'Abrasives supply agreement',unit_price:36,starts_on:'2026-01-01',ends_on:'2026-12-31'},
  last_paid:{unit_price:36,qty:4,order_date:'2026-09-09',order_number:'SO-51223'}};
const GLOVES:PriceSources={item_id:'GLV-N8-L-1000',sku:'GLV-N8-L-1000',list_price:94,customer_price:77.5,contract:null,cost:58,case_qty:1,category_id:'safety',
  last_paid:{unit_price:79,qty:4,order_date:'2026-09-09',order_number:'SO-51223'}};
const STRAPS:PriceSources={item_id:'RS-2-27-JH',sku:'RS-2-27-JH',list_price:28.5,customer_price:22.95,contract:null,cost:14.2,case_qty:10,category_id:'material-handling',last_paid:null};
const STRAP_STOCK:ItemStock={item_id:'RS-2-27-JH',sku:'RS-2-27-JH',total_available:27,branches:[
  {branch_id:'slc',branch_code:'SLC',available:7,on_order:24,next_receipt_on:'2026-09-26'},{branch_id:'ogden',branch_code:'Ogden',available:20,on_order:0,next_receipt_on:null},
  {branch_id:'provo',branch_code:'Provo',available:0,on_order:0,next_receipt_on:null}]};

function input(sources:PriceSources,qty:number,rest:Partial<PricingInput>={}):PricingInput{
  return {sources,qty,branchId:'slc',stock:null,scarcityEnabled:false,floor:null,on:ON,...rest};
}
const why=(sources:PriceSources,qty:number,rest:Partial<PricingInput>={})=>explainPrice(input(sources,qty,rest));

describe('explainPrice: the sample quote Q-24817 as Querent drafts it',()=>{
  it('names last paid when it is above customer price',()=>{
    expect(why(BOLTS,10)).toBe('Last paid $31.50 on Aug 12, above customer price $30.95. +$5.50 GP vs customer price.');
    expect(why(GLOVES,4)).toBe('Last paid $79.00 on Sep 9, above customer price $77.50. +$6.00 GP vs customer price.');
  });

  it('says a contract is binding and shows its GP vs customer price, even when negative',()=>{
    expect(why(WHEELS,6)).toBe('Contract price under WAS-C-2026-01, good through Dec 31, 2026. Contract prices are binding, so Querent doesn\'t raise them. -$17.70 GP vs customer price.');
  });

  it('explains a plain customer price',()=>{
    expect(why(STRAPS,12)).toBe('Customer price. No active contract and no purchases in the last 12 months. +$0.00 GP vs customer price.');
  });
});

describe('explainPrice: every other reason',()=>{
  it('customer price when last paid was not higher',()=>{
    expect(why({...BOLTS,last_paid:{...BOLTS.last_paid!,unit_price:29.5}},10)).toBe('Customer price. Last paid $29.50 on Aug 12 was not higher. +$0.00 GP vs customer price.');
  });

  it('broken case',()=>{
    expect(why(BOLTS,4)).toBe('Broken-case quantity: 4 is less than a full case of 10, so customer price $30.95 + 10%. +$12.40 GP vs customer price.');
    expect(why({...BOLTS,customer_price:36},4)).toBe('Broken-case quantity: 4 is less than a full case of 10, so customer price $36.00 + 10%, capped at list $38.95. +$11.80 GP vs customer price.');
  });

  it('scarcity, for low stock and for the only branch that can fill the qty',()=>{
    expect(why(STRAPS,12,{stock:STRAP_STOCK,scarcityEnabled:true}))
      .toBe('Scarce at SLC: 7 on hand, less than 1.5 times the 12 requested, so customer price $22.95 + 5%. +$13.80 GP vs customer price.');
    const onlySlc:ItemStock={...STRAP_STOCK,branches:STRAP_STOCK.branches.map(b=>({...b,available:b.branch_id==='slc'?40:3}))};
    expect(why(STRAPS,12,{stock:onlySlc,scarcityEnabled:true}))
      .toBe('Scarce at SLC: the only branch that can fill 12, so customer price $22.95 + 5%. +$13.80 GP vs customer price.');
  });

  it('the cap at list',()=>{
    expect(why({...BOLTS,last_paid:{...BOLTS.last_paid!,unit_price:41.25}},10))
      .toBe('Last paid $41.25 on Aug 12, above customer price $30.95, capped at list $38.95. +$80.00 GP vs customer price.');
    expect(why({...STRAPS,customer_price:27.5},12,{stock:STRAP_STOCK,scarcityEnabled:true}))
      .toBe('Scarce at SLC: 7 on hand, less than 1.5 times the 12 requested, so customer price $27.50 + 5%, capped at list $28.50. +$12.00 GP vs customer price.');
    expect(why({...STRAPS,customer_price:30},12)).toBe('Customer price $30.00 is above list, so Querent caps it at list $28.50. -$18.00 GP vs customer price.');
  });

  it('no customer price: starts from list, with no GP comparison',()=>{
    expect(why({...BOLTS,customer_price:null},10)).toBe('No customer price on file, so Querent starts from list price $38.95.');
    expect(why({...WHEELS,customer_price:null},6)).toBe('Contract price under WAS-C-2026-01, good through Dec 31, 2026. Contract prices are binding, so Querent doesn\'t raise them.');
  });

  it('nothing on file: the rep prices the line',()=>{
    expect(why({...BOLTS,customer_price:null,list_price:0},10)).toBe('No contract, customer or list price on file. Price this line by hand.');
  });

  it('adds the year to a last-paid date from another year',()=>{
    expect(why({...BOLTS,last_paid:{...BOLTS.last_paid!,order_date:'2025-10-28'}},10)).toBe('Last paid $31.50 on Oct 28, 2025, above customer price $30.95. +$5.50 GP vs customer price.');
  });
});

describe('formatting',()=>{
  it('formats money and signed GP',()=>{
    expect(formatMoney(1109.5)).toBe('$1,109.50');
    expect(formatGp(5.5)).toBe('+$5.50 GP vs customer price.');
    expect(formatGp(0)).toBe('+$0.00 GP vs customer price.');
    expect(formatGp(-0)).toBe('+$0.00 GP vs customer price.');
    expect(formatGp(-1234.5)).toBe('-$1,234.50 GP vs customer price.');
  });

  it('dates last paid like the mockup',()=>{
    expect(lastPaidDate('2026-08-12',ON)).toBe('Aug 12');
    expect(lastPaidDate('2026-01-01',ON)).toBe('Jan 1');
    expect(lastPaidDate('2025-12-31',ON)).toBe('Dec 31, 2025');
  });
});

describe('explainQuoteGp ("Querent found +$Y GP")',()=>{
  it('sums the sample quote\'s uplift, leaving out the contract line',()=>{
    const lines=[input(BOLTS,10),input(WHEELS,6),input(GLOVES,4),input(STRAPS,12)].map((i)=>{
      const {suggestion}=priceLine(i);
      return {qty:i.qty,suggested_price:suggestion.price,suggested_basis:suggestion.basis,customer_price:suggestion.customerPrice};
    });
    expect(explainQuoteGp(lines)).toBe('Querent found +$11.50 GP');
    expect(explainQuoteGp([])).toBe('Querent found +$0.00 GP');
  });
});

describe('priceLine',()=>{
  it('returns the dropdown, the suggestion and its explanation together',()=>{
    const line=priceLine(input(BOLTS,10,{floor:0.2}));
    expect(line.suggestion).toMatchObject({basis:'last_paid',price:31.5,gpVsCustomer:5.5,belowFloor:false});
    expect(line.options.find(o=>o.suggested)).toMatchObject({basis:'last_paid',price:31.5});
    expect(line.explanation).toBe(why(BOLTS,10));
  });
});

describe('priceReasons: the "?" tip next to Querent\u2019s price',()=>{
  const reasons=(sources:PriceSources,qty:number,rest:Partial<PricingInput>={})=>priceReasons(input(sources,qty,rest));

  it('puts the deciding fact first, then every other fact checked, then the GP',()=>{
    expect(reasons(BOLTS,8)).toEqual([
      'Broken-case quantity: 8 is less than a full case of 10, so customer price $30.95 + 10%.',
      'No active contract for this item.',
      "Last paid $31.50 on Aug 12, below Querent's pick.",
      'Scarcity uplift is off in Settings.',
      'List price $38.95 is the ceiling.',
      '+$24.80 GP vs customer price at a qty of 8.',
    ]);
    expect(reasons(BOLTS,10)).toEqual([
      'Last paid $31.50 on Aug 12, above customer price $30.95.',
      'No active contract for this item.',
      'Not a broken case: 10 covers a full case of 10.',
      'Scarcity uplift is off in Settings.',
      'List price $38.95 is the ceiling.',
      '+$5.50 GP vs customer price at a qty of 10.',
    ]);
  });

  it('says what scarcity came to, and that a one-pack case is never broken',()=>{
    expect(reasons(STRAPS,12,{stock:STRAP_STOCK})).toContain("Scarcity uplift is off in Settings, so low stock at SLC doesn't raise the price.");
    expect(reasons(STRAPS,12,{stock:STRAP_STOCK,scarcityEnabled:true})[0]).toMatch(/^Scarce at SLC/);
    expect(reasons(STRAPS,1,{stock:STRAP_STOCK,scarcityEnabled:true})).toContain('Enough stock to fill 1: no scarcity uplift.');
    expect(reasons(GLOVES,4)).toContain('Sold by the pack, so no broken-case uplift.');
  });

  it('keeps a contract short: nothing else can change it',()=>{
    expect(reasons(WHEELS,6)).toEqual([
      'Contract price under WAS-C-2026-01, good through Dec 31, 2026. Contract prices are binding, so Querent doesn\'t raise them.',
      "Last paid, a broken case and scarcity don't change a contract price.",
      '-$17.70 GP vs customer price at a qty of 6.',
    ]);
  });

  it('explains list with no customer price, and a line with no price at all',()=>{
    expect(reasons({...BOLTS,customer_price:null},10)).toEqual([
      'No customer price on file, so Querent starts from list price $38.95.',
      'No active contract for this item.',
      "Last paid $31.50 on Aug 12 isn't used without a customer price.",
    ]);
    expect(reasons({...STRAPS,customer_price:null,list_price:0},1)).toEqual(['No contract, customer or list price on file. Price this line by hand.']);
  });

  it('rides on priceLine with the explanation',()=>{
    const priced=priceLine(input(BOLTS,8));
    expect(priced.reasons[0]).toBe(explainPrice(input(BOLTS,8)).replace(/ \+\$24\.80 GP vs customer price\.$/,''));
  });
});

