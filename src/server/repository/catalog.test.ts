import {describe,expect,it} from 'vitest';
import {branch,branches,catalogItem,catalogItems,costedItem,costedItems,productCategories,searchItems,stockForItems} from './catalog';
import {useSeededDatabase} from './test-db';

useSeededDatabase();

describe('branches and categories',()=>{
  it('lists SLC, Ogden and Provo in seed order with will-call details',()=>{
    expect(branches().map(b=>b.code)).toEqual(['SLC','Ogden','Provo']);
    expect(branch('ogden')).toMatchObject({code:'Ogden',city:'Ogden',will_call_phone:'(801) 555-0130',lat:41.222,lng:-111.979});
    expect(branch('nowhere')).toBeUndefined();
  });

  it('lists the six product categories in display order',()=>{
    expect(productCategories().map(c=>c.name)).toEqual(['Fasteners','Abrasives & Cutting','Safety & PPE','Material Handling & Tie-downs','Tools','Janitorial/MRO']);
  });
});

describe('catalog items',()=>{
  it('returns the whole catalog without cost, grouped by category',()=>{
    const items=catalogItems();
    expect(items).toHaveLength(62);
    expect(items[0]).toMatchObject({category_name:'Fasteners'});
    expect(items.at(-1)).toMatchObject({category_name:'Janitorial/MRO'});
    for(const item of items)expect(item).not.toHaveProperty('cost');
  });

  it('finds one item by id or by SKU in any case',()=>{
    expect(catalogItem('HCS-12-13-2G8')).toEqual({id:'HCS-12-13-2G8',sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',category_id:'fasteners',category_name:'Fasteners',pack:'Box of 50',case_qty:10,list_price:38.95,keywords:'bolt hex bolt'});
    expect(catalogItem('cw-45-045-t1')?.sku).toBe('CW-45-045-T1');
    expect(catalogItem('NOPE')).toBeUndefined();
  });

  it('gives reps the item with its cost',()=>{
    expect(costedItem('GLV-N8-L-1000')).toMatchObject({sku:'GLV-N8-L-1000',cost:58,list_price:94});
    expect(costedItems()).toHaveLength(62);
    expect(costedItems().every(i=>typeof i.cost==='number')).toBe(true);
    expect(costedItem('NOPE')).toBeUndefined();
  });
});

describe('searchItems',()=>{
  it('matches every word against SKU, description, keywords and category',()=>{
    expect(searchItems('grade 8 hex bolt 1/2-13').map(i=>i.sku)).toEqual(['HCS-12-13-112G8','HCS-12-13-2G8','HCS-12-13-3G8']);
    expect(searchItems('type 27 cut-off').map(i=>i.sku)).toEqual(['CW-45-045-T27','CW-45-090-T27']);
  });

  it('treats plurals, case and punctuation loosely',()=>{
    expect(searchItems('ratchet straps').map(i=>i.sku)).toEqual(['EDG-2-4PK','RS-112-20-SH','RS-2-27-JH','RS-2-30-FH','RS-4-30-FH']);
    expect(searchItems('Straps, J-hooks').map(i=>i.sku)).toEqual(['RS-2-27-JH']);
    expect(searchItems('Nitrile GLOVES large').map(i=>i.sku)).toEqual(['GLV-N6-L-1000','GLV-N8-L-1000','GLV-N8-XL-1000']);
  });

  it('treats % and _ as literal characters',()=>{
    expect(searchItems('%')).toEqual([]);
    expect(searchItems('_')).toEqual([]);
  });

  it('returns nothing for an empty query and respects the limit (at most 50)',()=>{
    expect(searchItems('  ')).toEqual([]);
    expect(searchItems('tape')).toHaveLength(4);
    expect(searchItems('tape',{limit:2})).toHaveLength(2);
    expect(searchItems('e',{limit:500})).toHaveLength(50);
    expect(searchItems('tape',{limit:0})).toHaveLength(1);
    expect(searchItems('e',{limit:Number.NaN})).toHaveLength(10);
  });

  it('never returns cost',()=>{
    for(const item of searchItems('glove'))expect(item).not.toHaveProperty('cost');
  });
});

describe('stockForItems',()=>{
  it('returns stock by branch for each item, in the order asked',()=>{
    const [straps,bolts]=stockForItems(['RS-2-27-JH','HCS-12-13-2G8']);
    expect(straps).toMatchObject({item_id:'RS-2-27-JH',sku:'RS-2-27-JH',total_available:27});
    expect(straps.branches).toEqual([
      {branch_id:'slc',branch_code:'SLC',available:7,on_order:24,next_receipt_on:'2026-09-26'},
      {branch_id:'ogden',branch_code:'Ogden',available:20,on_order:0,next_receipt_on:null},
      {branch_id:'provo',branch_code:'Provo',available:0,on_order:0,next_receipt_on:null},
    ]);
    expect(bolts.branches.map(b=>b.available)).toEqual([64,22,8]);
  });

  it('skips unknown items and handles an empty list',()=>{
    expect(stockForItems(['NOPE','DT-2-60']).map(s=>s.sku)).toEqual(['DT-2-60']);
    expect(stockForItems([])).toEqual([]);
  });
});
