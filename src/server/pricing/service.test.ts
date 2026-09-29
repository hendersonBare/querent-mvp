import {afterEach,describe,expect,it} from 'vitest';
import {quoteFloors} from '@/server/floors/service';
import {quote,setScarcityUplift} from '@/server/repository';
import {useSeededDatabase} from '@/server/repository/test-db';
import {draftLineFields,explainQuoteGp,querentFoundGp} from './index';
import {priceLines} from './service';

// The adapter over the repository, on the seed pinned to the mockup's day (2026-09-23).
useSeededDatabase();

const ON='2026-09-23';
const SAMPLE_LINES=[{itemId:'HCS-12-13-2G8',qty:10},{itemId:'CW-45-045-T1',qty:6},{itemId:'GLV-N8-L-1000',qty:4},{itemId:'RS-2-27-JH',qty:12}];
const wasatch=(lines=SAMPLE_LINES,branchId='slc')=>priceLines({customerId:'wasatch',repId:'brandi',branchId,lines,on:ON});

afterEach(()=>setScarcityUplift(false));

describe('priceLines',()=>{
  it('prices Dana\'s request the way the seeded sample quote Q-24817 was drafted',()=>{
    const priced=wasatch();
    expect(priced.map(l=>[l.sku,l.qty,l.suggestion.basis,l.suggestion.price,l.suggestion.gpVsCustomer])).toEqual([
      ['HCS-12-13-2G8',10,'last_paid',31.5,5.5],['CW-45-045-T1',6,'contract',36,-17.7],['GLV-N8-L-1000',4,'last_paid',79,6],['RS-2-27-JH',12,'customer',22.95,0],
    ]);
    const seeded=quote('q-24817')!.lines;
    expect(priced.map(l=>[l.suggestion.price,l.suggestion.basis,l.suggestion.customerPrice,l.explanation]))
      .toEqual(seeded.map(l=>[l.suggested_price,l.suggested_basis,l.customer_price,l.explanation]));
  });

  it('checks each line against Brandi\'s floor for its category',()=>{
    const [bolts,wheels,gloves]=wasatch();
    expect(bolts.suggestion).toMatchObject({floor:0.2,belowFloor:false});
    expect(wheels.suggestion).toMatchObject({floor:0.25,belowFloor:false});
    // Gloves at $79.00 on $58.00 cost are 26.6%, under Brandi's 30% Safety & PPE floor: the best basis anyway, flagged.
    expect(gloves.suggestion).toMatchObject({basis:'last_paid',price:79,floor:0.3,belowFloor:true});
    expect(gloves.suggestion.margin).toBeCloseTo(0.2658,4);
  });

  it('applies the scarcity uplift only when Settings > Pricing turns it on',()=>{
    expect(wasatch()[3].suggestion).toMatchObject({basis:'customer',price:22.95,scarcity:null});
    setScarcityUplift(true);
    const straps=wasatch()[3];
    expect(straps.suggestion).toMatchObject({basis:'custom',price:24.1,reason:'scarcity',scarcity:{kind:'low_stock',branchCode:'SLC',available:7}});
    expect(straps.options.find(o=>o.basis==='custom')).toMatchObject({price:24.1,suggested:true});
    // At Ogden (20 on hand, 1.5 x 12 = 18) stock is fine, but no other branch can fill 12.
    expect(wasatch(SAMPLE_LINES,'ogden')[3].suggestion).toMatchObject({price:24.1,scarcity:{kind:'only_branch',branchCode:'Ogden',available:20}});
    // Plenty of bolts at SLC and elsewhere: last paid still wins.
    expect(wasatch()[0].suggestion).toMatchObject({basis:'last_paid',price:31.5,scarcity:null});
  });

  it('prices each line by its own qty, and skips unknown items',()=>{
    const priced=wasatch([{itemId:'HCS-12-13-2G8',qty:10},{itemId:'NOPE',qty:1},{itemId:'HCS-12-13-2G8',qty:4}]);
    expect(priced.map(l=>[l.itemId,l.qty,l.suggestion.reason,l.suggestion.price])).toEqual([['HCS-12-13-2G8',10,'last_paid',31.5],['HCS-12-13-2G8',4,'broken_case',34.05]]);
    expect(wasatch([])).toEqual([]);
  });

  it('starts from list for a placeholder customer with no price level',()=>{
    const [bolts]=priceLines({customerId:'great-basin',repId:'brandi',branchId:'slc',lines:[{itemId:'HCS-12-13-2G8',qty:10}],on:ON});
    expect(bolts.suggestion).toMatchObject({basis:'list',price:38.95,reason:'no_customer_price',customerPrice:null,gpVsCustomer:null});
    expect(bolts.explanation).toBe('No customer price on file, so Querent starts from list price $38.95.');
  });

  it('uses the 20% default floor for a rep with no floors on file (spec §5.2)',()=>{
    // The same gloves line: 26.6% is under Brandi's 30% Safety & PPE floor, but not under 20%.
    expect(priceLines({customerId:'wasatch',repId:'nobody',branchId:'slc',lines:[{itemId:'GLV-N8-L-1000',qty:4}],on:ON})[0].suggestion).toMatchObject({floor:0.2,belowFloor:false});
  });

  it('flags exactly what the red warning flags on the seeded sample quote',()=>{
    const warnings=quoteFloors('q-24817')!.lines.map(l=>l.belowFloor);
    expect(wasatch().map(l=>l.suggestion.belowFloor)).toEqual(warnings);
    expect(warnings).toEqual([false,false,true,false]);
  });
});

describe('quote-level GP and draft fields',()=>{
  it('finds +$11.50 GP on the seeded sample quote',()=>{
    const lines=quote('q-24817')!.lines;
    expect(querentFoundGp(lines)).toBe(11.5);
    expect(explainQuoteGp(lines)).toBe('Querent found +$11.50 GP');
  });

  it('turns a priced line into the pricing fields of a new quote line',()=>{
    const [bolts]=wasatch();
    expect(draftLineFields(bolts)).toEqual({unitPrice:31.5,priceBasis:'last_paid',suggestedPrice:31.5,suggestedBasis:'last_paid',customerPrice:30.95,explanation:bolts.explanation});
  });
});
