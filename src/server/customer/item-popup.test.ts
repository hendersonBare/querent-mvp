import {afterEach,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

// The item pop-up's live facts (task 2.3): item identity and stock per branch, read when it renders.

const FORBIDDEN=/cost|margin|floor|suggest|explanation|internal|price/i;
const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];
const setItemsStock=async(enabled:boolean)=>(await import('@/server/repository')).setAccess('wasatch','items_stock',enabled);
afterEach(async()=>{await setItemsStock(true);});

describe('itemPopupContext',()=>{
  it('gives each item its identity and stock at every branch, plus the branches, the ship-to and the rep',async()=>{
    const {itemPopupContext}=await import('./item-popup');
    const context=itemPopupContext('wasatch',['HCS-12-13-2G8','cw-45-045-t1']);
    expect(context.items).toEqual([
      {sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',pack:'Box of 50',
        stock:[{branch_id:'slc',available:64},{branch_id:'ogden',available:22},{branch_id:'provo',available:8}]},
      {sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',
        stock:[{branch_id:'slc',available:140},{branch_id:'ogden',available:60},{branch_id:'provo',available:35}]},
    ]);
    expect(context.branches).toEqual([{id:'slc',code:'SLC',name:'Salt Lake City'},{id:'ogden',code:'Ogden',name:'Ogden'},{id:'provo',code:'Provo',name:'Provo'}]);
    expect(context).toMatchObject({stock_shown:true,ship_to:'1800 W 10950 S, South Jordan, UT 84095',rep_name:'Brandi Gallegos'});
  });

  it('reads stock now, not from a snapshot',async()=>{
    const {itemPopupContext}=await import('./item-popup');
    const {stockForItems}=await import('@/server/repository');
    const now=stockForItems(['HCS-12-13-2G8'])[0].branches.find(b=>b.branch_id==='provo')!.available;
    expect(itemPopupContext('wasatch',['HCS-12-13-2G8']).items[0].stock).toContainEqual({branch_id:'provo',available:now});
  });

  it('lists each SKU once and leaves out SKUs that match nothing',async()=>{
    const {itemPopupContext}=await import('./item-popup');
    expect(itemPopupContext('wasatch',['HCS-12-13-2G8',' hcs-12-13-2g8 ','NOPE-1','']).items.map(i=>i.sku)).toEqual(['HCS-12-13-2G8']);
    expect(itemPopupContext('wasatch',[]).items).toEqual([]);
  });

  it('hides stock when Items & stock is off, and says so',async()=>{
    const {itemPopupContext}=await import('./item-popup');
    await setItemsStock(false);
    const context=itemPopupContext('wasatch',['HCS-12-13-2G8']);
    expect(context.stock_shown).toBe(false);
    expect(context.items).toEqual([{sku:'HCS-12-13-2G8',description:expect.any(String),pack:'Box of 50',stock:null}]);
  });

  it('has no ship-to for a customer without one, and never carries prices or cost',async()=>{
    const {itemPopupContext}=await import('./item-popup');
    expect(itemPopupContext('great-basin',['HCS-12-13-2G8']).ship_to).toBeNull();
    const context=itemPopupContext('wasatch',['HCS-12-13-2G8','CW-45-045-T1']);
    expect(keys(context).filter(k=>FORBIDDEN.test(k))).toEqual([]);
    expect(JSON.stringify(context)).not.toMatch(/\b(?:21\.4|24\.1|38\.95|46)\b/);
  });
});
