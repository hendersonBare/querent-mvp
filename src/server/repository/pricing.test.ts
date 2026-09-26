import {describe,expect,it} from 'vitest';
import {contracts,customerPrices,lastPaid,priceSources} from './pricing';
import {useSeededDatabase} from './test-db';

useSeededDatabase();
const ON='2026-09-23';
const ABRASIVES={contract_id:'wasatch-2026-abrasives',contract_number:'WAS-C-2026-01',contract_name:'Abrasives supply agreement',starts_on:'2026-01-01',ends_on:'2026-12-31'};

describe('contracts',()=>{
  it('lists the customer\'s contracts with lines and whether each is active',()=>{
    const [abrasives,ppe]=contracts('wasatch',ON);
    expect(abrasives).toMatchObject({contract_number:'WAS-C-2026-01',active:true,starts_on:'2026-01-01',ends_on:'2026-12-31'});
    expect(abrasives.lines.map(l=>[l.sku,l.unit_price])).toEqual([['CW-45-045-T1',36],['CW-45-045-T27',37.4],['CW-6-045-T1',48.5],['FD-45-60Z',44.25],['FD-45-80Z',44.25]]);
    expect(ppe).toMatchObject({contract_number:'WAS-C-2025-02',active:false});
    expect(contracts('wasatch','2027-01-01').every(c=>!c.active)).toBe(true);
    expect(contracts('great-basin',ON)).toEqual([]);
  });
});

describe('customerPrices (customer-visible)',()=>{
  it('returns list, customer and active contract prices in the order asked',()=>{
    expect(customerPrices('wasatch',['CW-45-045-T1','HCS-12-13-2G8','NOPE'],ON)).toEqual([
      {item_id:'CW-45-045-T1',sku:'CW-45-045-T1',list_price:46,customer_price:38.95,contract:{...ABRASIVES,unit_price:36}},
      {item_id:'HCS-12-13-2G8',sku:'HCS-12-13-2G8',list_price:38.95,customer_price:30.95,contract:null},
    ]);
  });

  it('ignores expired and not-yet-started contracts',()=>{
    expect(customerPrices('wasatch',['GLV-N8-L-1000'],ON)[0].contract).toBeNull();
    expect(customerPrices('wasatch',['CW-45-045-T1'],'2025-12-31')[0].contract).toBeNull();
    expect(customerPrices('wasatch',['CW-45-045-T1'],'2026-12-31')[0].contract?.unit_price).toBe(36);
  });

  it('has no customer price for a placeholder customer, and never includes cost',()=>{
    const [price]=customerPrices('great-basin',['HCS-12-13-2G8'],ON);
    expect(price).toEqual({item_id:'HCS-12-13-2G8',sku:'HCS-12-13-2G8',list_price:38.95,customer_price:null,contract:null});
    expect(customerPrices('wasatch',[],ON)).toEqual([]);
  });
});

describe('lastPaid',()=>{
  it('returns the most recent paid price in the window',()=>{
    expect(lastPaid('wasatch','HCS-12-13-2G8',{since:'2025-09-23',until:ON})).toEqual({unit_price:31.5,qty:10,order_date:'2026-08-12',order_number:'SO-51221'});
    expect(lastPaid('wasatch','HCS-12-13-2G8',{since:'2025-09-23',until:'2026-08-11'})).toEqual({unit_price:30.4,qty:12,order_date:'2026-04-21',order_number:'SO-51213'});
    expect(lastPaid('wasatch','HCS-12-13-2G8',{since:'2026-08-13',until:ON})).toBeUndefined();
    expect(lastPaid('wasatch','RS-2-27-JH',{since:'2025-01-01'})).toBeUndefined();
  });
});

describe('priceSources (internal)',()=>{
  it('adds cost, case qty, category and last paid in the last 12 months',()=>{
    const [bolts,wheels,straps]=priceSources('wasatch',['HCS-12-13-2G8','CW-45-045-T1','RS-2-27-JH'],ON);
    expect(bolts).toEqual({item_id:'HCS-12-13-2G8',sku:'HCS-12-13-2G8',list_price:38.95,customer_price:30.95,contract:null,cost:21.4,case_qty:10,category_id:'fasteners',
      last_paid:{unit_price:31.5,qty:10,order_date:'2026-08-12',order_number:'SO-51221'}});
    expect(wheels).toMatchObject({cost:24.1,contract:{unit_price:36},last_paid:{unit_price:36,order_date:'2026-09-09',order_number:'SO-51223'}});
    expect(straps).toMatchObject({customer_price:22.95,last_paid:null});
  });

  it('includes a purchase exactly 12 months back and drops one a day older',()=>{
    expect(priceSources('wasatch',['HCS-12-13-2G8'],'2027-08-12')[0].last_paid?.order_date).toBe('2026-08-12');
    expect(priceSources('wasatch',['HCS-12-13-2G8'],'2027-08-13')[0].last_paid).toBeNull();
  });

  it('skips unknown items',()=>{
    expect(priceSources('wasatch',['NOPE'],ON)).toEqual([]);
    expect(priceSources('wasatch',[],ON)).toEqual([]);
  });
});
