import {describe,expect,it} from 'vitest';
import type {ItemStock,PriceBasis,PriceSources} from '@/domain';
import {formatMargin} from '../floors/rules';
import {gpVsCustomer,priceOptions,querentFoundGp,scarcityAt,suggestPrice,type PricingInput} from './engine';

// Spec §5.1 rules, one describe per rule. Fixtures are the seeded Wasatch facts on the mockup's
// day (2026-09-23), then varied one fact at a time.

const ON='2026-09-23';
const BOLTS:PriceSources={item_id:'HCS-12-13-2G8',sku:'HCS-12-13-2G8',list_price:38.95,customer_price:30.95,contract:null,cost:21.4,case_qty:10,category_id:'fasteners',last_paid:null};
const CONTRACT={contract_id:'wasatch-2026-abrasives',contract_number:'WAS-C-2026-01',contract_name:'Abrasives supply agreement',unit_price:36,starts_on:'2026-01-01',ends_on:'2026-12-31'};
const WHEELS:PriceSources={item_id:'CW-45-045-T1',sku:'CW-45-045-T1',list_price:46,customer_price:38.95,contract:CONTRACT,cost:24.1,case_qty:4,category_id:'abrasives',
  last_paid:{unit_price:36,qty:4,order_date:'2026-09-09',order_number:'SO-51223'}};
const paid=(unit_price:number,order_date='2026-08-12')=>({unit_price,qty:10,order_date,order_number:'SO-51221'});

/** Stock at SLC, Ogden, Provo (branch order). */
function stock(slc:number,ogden:number,provo:number,itemId='HCS-12-13-2G8'):ItemStock{
  const branches=([['slc','SLC',slc],['ogden','Ogden',ogden],['provo','Provo',provo]] as const).map(([branch_id,branch_code,available])=>({branch_id,branch_code,available,on_order:0,next_receipt_on:null}));
  return {item_id:itemId,sku:itemId,total_available:slc+ogden+provo,branches};
}
const PLENTY=stock(64,22,8);

function input({sources={},...rest}:Partial<Omit<PricingInput,'sources'>>&{sources?:Partial<PriceSources>}={}):PricingInput{
  return {sources:{...BOLTS,...sources},qty:10,branchId:'slc',stock:PLENTY,scarcityEnabled:false,floor:0.2,on:ON,...rest};
}
const pick=(i:PricingInput)=>{const s=suggestPrice(i);return [s.basis,s.price,s.reason];};

describe('rule 1: an active contract wins and is binding',()=>{
  it('suggests the contract price even below customer price, with a negative GP vs customer price',()=>{
    const s=suggestPrice(input({sources:WHEELS,qty:6}));
    expect(s).toMatchObject({basis:'contract',price:36,reason:'contract',capped:false,customerPrice:38.95,gpVsCustomer:-17.7});
  });

  it('never raises a contract price: not for last paid, a broken case or scarcity',()=>{
    const s=suggestPrice(input({sources:{...WHEELS,last_paid:paid(40)},qty:2,stock:stock(2,0,0),scarcityEnabled:true}));
    expect(s).toMatchObject({basis:'contract',price:36,reason:'contract',brokenCase:true});
    expect(s.scarcity).not.toBeNull();
  });

  it('is not capped at list, and still applies with no customer price',()=>{
    expect(pick(input({sources:{...WHEELS,contract:{...CONTRACT,unit_price:48}}}))).toEqual(['contract',48,'contract']);
    const s=suggestPrice(input({sources:{...WHEELS,customer_price:null}}));
    expect(s).toMatchObject({basis:'contract',price:36,customerPrice:null,gpVsCustomer:null});
  });
});

describe('rule 2: start at customer price, raise only on a fact, cap at list',()=>{
  it('suggests customer price when no fact supports more',()=>{
    expect(suggestPrice(input())).toMatchObject({basis:'customer',price:30.95,reason:'customer',capped:false,gpVsCustomer:0,brokenCase:false,scarcity:null});
  });

  describe('last paid (last 12 months)',()=>{
    it('suggests last paid when it is above customer price',()=>{
      expect(suggestPrice(input({sources:{last_paid:paid(31.5)}}))).toMatchObject({basis:'last_paid',price:31.5,reason:'last_paid',gpVsCustomer:5.5});
    });
    it('keeps customer price when last paid is equal or lower',()=>{
      expect(pick(input({sources:{last_paid:paid(30.95)}}))).toEqual(['customer',30.95,'customer']);
      expect(pick(input({sources:{last_paid:paid(29.5)}}))).toEqual(['customer',30.95,'customer']);
    });
  });

  describe('broken case (customer price + 10%)',()=>{
    it('adds 10% to customer price when qty is below the case qty',()=>{
      expect(suggestPrice(input({qty:4}))).toMatchObject({basis:'custom',price:34.05,reason:'broken_case',brokenCase:true,capped:false,gpVsCustomer:12.4});
      expect(pick(input({qty:9}))).toEqual(['custom',34.05,'broken_case']);
    });
    it('is not a broken case at or above a full case, with a one-pack case, or with no qty',()=>{
      expect(pick(input({qty:10}))).toEqual(['customer',30.95,'customer']);
      expect(pick(input({qty:25}))).toEqual(['customer',30.95,'customer']);
      expect(pick(input({qty:1,sources:{case_qty:1}}))).toEqual(['customer',30.95,'customer']);
      expect(suggestPrice(input({qty:0})).brokenCase).toBe(false);
    });
    it('beats a lower last paid, and loses to a higher one (which is then capped at list)',()=>{
      expect(pick(input({qty:4,sources:{last_paid:paid(31.5)}}))).toEqual(['custom',34.05,'broken_case']);
      expect(pick(input({qty:4,sources:{last_paid:paid(35)}}))).toEqual(['last_paid',35,'last_paid']);
      expect(suggestPrice(input({qty:4,sources:{last_paid:paid(40)}}))).toMatchObject({basis:'list',price:38.95,reason:'last_paid',capped:true,uncapped:40});
    });
    it('is capped at list when customer price + 10% is above it',()=>{
      expect(suggestPrice(input({qty:4,sources:{customer_price:36}}))).toMatchObject({basis:'list',price:38.95,reason:'broken_case',capped:true,uncapped:39.6});
    });
    it('beats scarcity (+5%) when both apply',()=>{
      expect(pick(input({qty:8,stock:stock(10,4,0),scarcityEnabled:true}))).toEqual(['custom',34.05,'broken_case']);
    });
    it('uses list, as before, when there is no customer price',()=>{
      expect(pick(input({qty:4,sources:{customer_price:null}}))).toEqual(['list',38.95,'no_customer_price']);
    });
  });

  describe('scarcity (+5%, only when the setting is on)',()=>{
    const scarce=stock(12,4,0);
    it('is off by default: scarce stock does not change the price',()=>{
      expect(suggestPrice(input({stock:scarce}))).toMatchObject({basis:'customer',price:30.95,scarcity:null});
    });
    it('adds 5% to customer price when the branch has less than 1.5x the qty',()=>{
      expect(suggestPrice(input({stock:scarce,scarcityEnabled:true}))).toMatchObject({basis:'custom',price:32.5,reason:'scarcity',gpVsCustomer:15.5,
        scarcity:{kind:'low_stock',branchCode:'SLC',available:12}});
    });
    it('adds 5% when the quote branch is the only one that can fill the qty',()=>{
      expect(suggestPrice(input({stock:stock(40,9,9),scarcityEnabled:true}))).toMatchObject({basis:'custom',price:32.5,scarcity:{kind:'only_branch',branchCode:'SLC',available:40}});
    });
    it('does nothing when stock is plentiful, unknown, or there is no qty',()=>{
      expect(pick(input({scarcityEnabled:true}))).toEqual(['customer',30.95,'customer']);
      expect(pick(input({stock:stock(15,10,0),scarcityEnabled:true}))).toEqual(['customer',30.95,'customer']);
      expect(pick(input({stock:null,scarcityEnabled:true}))).toEqual(['customer',30.95,'customer']);
      expect(suggestPrice(input({qty:0,stock:scarce,scarcityEnabled:true})).scarcity).toBeNull();
    });
    it('loses to a higher last paid, and wins ties only after last paid',()=>{
      expect(pick(input({stock:scarce,scarcityEnabled:true,sources:{last_paid:paid(33)}}))).toEqual(['last_paid',33,'last_paid']);
      expect(pick(input({stock:scarce,scarcityEnabled:true,sources:{last_paid:paid(32.5)}}))).toEqual(['last_paid',32.5,'last_paid']);
      expect(pick(input({stock:scarce,scarcityEnabled:true,sources:{last_paid:paid(32)}}))).toEqual(['custom',32.5,'scarcity']);
    });
  });

  describe('the cap at list',()=>{
    it('caps last paid above list',()=>{
      expect(suggestPrice(input({sources:{last_paid:paid(41.25)}}))).toMatchObject({basis:'list',price:38.95,reason:'last_paid',capped:true,uncapped:41.25,gpVsCustomer:80});
    });
    it('caps a scarcity price above list',()=>{
      expect(suggestPrice(input({sources:{customer_price:38},stock:stock(1,0,0),scarcityEnabled:true}))).toMatchObject({basis:'list',price:38.95,reason:'scarcity',capped:true,uncapped:39.9});
    });
    it('caps a customer price that is above list',()=>{
      expect(suggestPrice(input({sources:{customer_price:40}}))).toMatchObject({basis:'list',price:38.95,reason:'customer',capped:true,uncapped:40,gpVsCustomer:-10.5});
    });
    it('lets a price equal to list through uncapped',()=>{
      expect(suggestPrice(input({sources:{last_paid:paid(38.95)}}))).toMatchObject({basis:'last_paid',price:38.95,capped:false,uncapped:null});
    });
  });
});

describe('missing bases',()=>{
  it('starts from list when there is no customer price (placeholder customers), ignoring facts',()=>{
    const s=suggestPrice(input({sources:{customer_price:null,last_paid:paid(41)},qty:4,stock:stock(1,0,0),scarcityEnabled:true}));
    expect(s).toMatchObject({basis:'list',price:38.95,reason:'no_customer_price',capped:false,customerPrice:null,gpVsCustomer:null});
  });

  it('treats a zero price as not on file',()=>{
    expect(pick(input({sources:{customer_price:0}}))).toEqual(['list',38.95,'no_customer_price']);
    expect(pick(input({sources:{contract:{...CONTRACT,unit_price:0}}}))).toEqual(['customer',30.95,'customer']);
    expect(pick(input({sources:{last_paid:paid(0)}}))).toEqual(['customer',30.95,'customer']);
  });

  it('does not cap when there is no list price',()=>{
    expect(pick(input({sources:{list_price:0,last_paid:paid(45)}}))).toEqual(['last_paid',45,'last_paid']);
    expect(pick(input({sources:{list_price:0},qty:4}))).toEqual(['custom',34.05,'broken_case']);
  });
});

describe('cost-only edge cases',()=>{
  it('makes no suggestion when cost is the only fact on file: the rep prices the line',()=>{
    const s=suggestPrice(input({sources:{list_price:0,customer_price:null,last_paid:paid(31.5)}}));
    expect(s).toMatchObject({basis:null,price:null,reason:'no_price',gpVsCustomer:null,margin:null,belowFloor:false});
  });

  it('suggests the best basis anyway when cost is above every price (negative margin, below floor)',()=>{
    const s=suggestPrice(input({sources:{cost:45,last_paid:paid(31.5)}}));
    expect(s).toMatchObject({basis:'last_paid',price:31.5,belowFloor:true});
    expect(s.margin).toBeCloseTo(-0.4286,4);
  });

  it('has a 100% margin at zero cost',()=>{
    expect(suggestPrice(input({sources:{cost:0}}))).toMatchObject({margin:1,belowFloor:false});
  });
});

describe('rule 3: the floor never changes the pick',()=>{
  it('a fact-based price at or above the floor is already the pick',()=>{
    // Customer price 30.95 at cost 26 is 16.0% (below 20%); last paid 32.50 is 20.0%.
    const s=suggestPrice(input({sources:{cost:26,last_paid:paid(32.5)}}));
    expect(s).toMatchObject({basis:'last_paid',price:32.5,floor:0.2,belowFloor:false});
    expect(s.margin).toBeCloseTo(0.2,10);
  });

  it('flags at the precision the red warning uses (tenths of a point), so the two always agree',()=>{
    // $30.00 at $24.01 cost is 19.97%, shown as 20.0%: not below a 20% floor. At $24.02 it is 19.9%.
    const shown=suggestPrice(input({sources:{customer_price:30,cost:24.01}}));
    expect([formatMargin(shown.margin),shown.belowFloor]).toEqual(['20.0%',false]);
    const below=suggestPrice(input({sources:{customer_price:30,cost:24.02}}));
    expect([formatMargin(below.margin),below.belowFloor]).toEqual(['19.9%',true]);
  });

  it('treats a 0% floor as a floor: only a negative margin is below it',()=>{
    expect(suggestPrice(input({floor:0,sources:{cost:30}}))).toMatchObject({floor:0,belowFloor:false});
    expect(suggestPrice(input({floor:0,sources:{cost:31}}))).toMatchObject({floor:0,belowFloor:true});
  });

  it('when nothing clears the floor, suggests the best basis anyway and flags it',()=>{
    const s=suggestPrice(input({sources:{cost:27,last_paid:paid(31.5)}}));
    expect(s).toMatchObject({basis:'last_paid',price:31.5,belowFloor:true,floor:0.2});
    expect(s.margin).toBeCloseTo(0.1429,4);
  });

  it('flags a binding contract below the floor, and skips the check with no floor',()=>{
    expect(suggestPrice(input({sources:WHEELS,floor:0.4}))).toMatchObject({basis:'contract',price:36,belowFloor:true});
    expect(suggestPrice(input({sources:{cost:30},floor:null}))).toMatchObject({floor:null,belowFloor:false});
  });
});

describe('rounding to cents',()=>{
  it('rounds the scarcity price half up to the cent',()=>{
    const scarce={stock:stock(1,0,0),scarcityEnabled:true};
    expect(suggestPrice(input({...scarce})).price).toBe(32.5);                          // 30.95 x 1.05 = 32.4975
    expect(suggestPrice(input({...scarce,sources:{customer_price:22.95}})).price).toBe(24.1); // 24.0975
    expect(suggestPrice(input({...scarce,sources:{customer_price:10.1}})).price).toBe(10.61); // 10.605, half up
    expect(suggestPrice(input({...scarce,sources:{customer_price:0.82}})).price).toBe(0.86);  // 0.861
  });

  it('computes GP vs customer price exactly, without float drift',()=>{
    expect(gpVsCustomer(31.5,30.95,10)).toBe(5.5);   // 5.500000000000007 in floats
    expect(gpVsCustomer(79,77.5,4)).toBe(6);
    expect(gpVsCustomer(0.91,0.82,1000)).toBe(90);
    expect(gpVsCustomer(36,38.95,6)).toBe(-17.7);
    expect(gpVsCustomer(31.5,null,10)).toBeNull();
    expect(gpVsCustomer(null,30.95,10)).toBeNull();
  });
});

describe('scarcityAt',()=>{
  it('treats a branch with no stock row as empty',()=>{
    const noSlc={...PLENTY,branches:PLENTY.branches.filter(b=>b.branch_id!=='slc')};
    expect(scarcityAt(noSlc,'slc',10)).toEqual({kind:'low_stock',branchCode:'slc',available:0});
  });

  it('is scarce when no branch can fill the qty',()=>{
    expect(scarcityAt(stock(5,5,5),'ogden',10)).toEqual({kind:'low_stock',branchCode:'Ogden',available:5});
  });

  it('is not scarce at exactly 1.5x the qty when another branch can fill it',()=>{
    expect(scarcityAt(stock(15,10,0),'slc',10)).toBeNull();
    expect(scarcityAt(stock(14,10,0),'slc',10)).toMatchObject({kind:'low_stock'});
  });
});

describe('priceOptions (the price-basis dropdown)',()=>{
  it('lists every basis with its value, availability and Querent\'s pick',()=>{
    expect(priceOptions(input({sources:WHEELS,qty:6}))).toEqual([
      {basis:'contract',label:'Contract',price:36,available:true,note:'WAS-C-2026-01',suggested:true},
      {basis:'customer',label:'Customer',price:38.95,available:true,note:null,suggested:false},
      {basis:'list',label:'List',price:46,available:true,note:null,suggested:false},
      {basis:'last_paid',label:'Last paid',price:36,available:true,note:'2026-09-09',suggested:false},
      {basis:'custom',label:'Custom',price:null,available:true,note:null,suggested:false},
    ]);
  });

  it('marks missing bases unavailable',()=>{
    const options=priceOptions(input({sources:{customer_price:null}}));
    expect(options.map(o=>[o.basis,o.price,o.available,o.suggested])).toEqual([
      ['contract',null,false,false],['customer',null,false,false],['list',38.95,true,true],['last_paid',null,false,false],['custom',null,true,false],
    ]);
  });

  it('puts a scarcity price on Custom and bolds it',()=>{
    const custom=priceOptions(input({stock:stock(12,4,0),scarcityEnabled:true})).find(o=>o.basis==='custom');
    expect(custom).toEqual({basis:'custom',label:'Custom',price:32.5,available:true,note:null,suggested:true});
  });

  it('bolds nothing when Querent has no suggestion',()=>{
    expect(priceOptions(input({sources:{list_price:0,customer_price:null}})).some(o=>o.suggested)).toBe(false);
  });
});

describe('querentFoundGp ("Querent found +$Y GP")',()=>{
  const line=(qty:number,suggested_price:number|null,suggested_basis:PriceBasis|null,customer_price:number|null)=>({qty,suggested_price,suggested_basis,customer_price});

  it('sums the uplift over customer price on the sample quote, skipping the contract line',()=>{
    expect(querentFoundGp([line(10,31.5,'last_paid',30.95),line(6,36,'contract',38.95),line(4,79,'last_paid',77.5),line(12,22.95,'customer',22.95)])).toBe(11.5);
  });

  it('ignores lines below customer price, lines without prices, and contracts above customer price',()=>{
    expect(querentFoundGp([line(2,38.95,'list',40),line(3,null,null,30),line(3,38.95,'list',null),line(5,40,'contract',38)])).toBe(0);
    expect(querentFoundGp([])).toBe(0);
  });

  it('adds cents exactly',()=>{
    expect(querentFoundGp([line(3,0.1,'custom',0.05),line(3,0.2,'custom',0.1)])).toBe(0.45);
  });
});
