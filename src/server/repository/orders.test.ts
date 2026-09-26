import {describe,expect,it} from 'vitest';
import {coPurchases,order,orderHistory,orders,orderStatus,purchasedItems} from './orders';
import {useSeededDatabase} from './test-db';

useSeededDatabase();

describe('orders',()=>{
  it('lists the customer\'s orders newest first',()=>{
    const list=orders('wasatch');
    expect(list).toHaveLength(23);
    expect(list[0]).toEqual({id:'so-51223',order_number:'SO-51223',po_number:'7777',order_date:'2026-09-09',status:'shipped',fulfillment:'delivery',branch_id:'slc',branch_code:'SLC',
      shipped_on:'2026-09-10',tracking_number:null,subtotal:592.75,freight:62.5,tax:42.97,total:698.22,quote_number:'Q-24816'});
    expect(list.at(-1)?.order_number).toBe('SO-51201');
    expect(orders('wasatch',{limit:2})).toHaveLength(2);
    expect(orders('great-basin')).toEqual([]);
  });

  it('returns one order with its lines, only for its own customer',()=>{
    const found=order('wasatch','so-51223');
    expect(found?.lines).toEqual([
      {line_no:1,item_id:'CW-45-045-T1',sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',qty:4,unit_price:36},
      {line_no:2,item_id:'GLV-N8-L-1000',sku:'GLV-N8-L-1000',description:'Nitrile disposable gloves, 8 mil, black, size L',pack:'Case of 1,000',qty:4,unit_price:79},
      {line_no:3,item_id:'FD-45-60Z',sku:'FD-45-60Z',description:'Flap disc 4.5 in, 60 grit zirconia',pack:'Box of 10',qty:3,unit_price:44.25},
    ]);
    expect(order('wasatch','so-51223')).toEqual(order('wasatch','SO-51223'));
    expect(order('great-basin','SO-51223')).toBeUndefined();
  });

  it('finds order status by order number or PO, or the latest order',()=>{
    expect(orderStatus('wasatch')?.order_number).toBe('SO-51223');
    expect(orderStatus('wasatch',' 7777 ')?.order_number).toBe('SO-51223');
    expect(orderStatus('wasatch','so-51201')).toMatchObject({order_number:'SO-51201',status:'closed',po_number:'7755'});
    expect(orderStatus('wasatch','nothing')).toBeUndefined();
    expect(orderStatus('great-basin')).toBeUndefined();
  });
});

describe('order history',()=>{
  it('lists purchased lines newest first, filtered by item and date',()=>{
    const bolts=orderHistory('wasatch',{itemIds:['HCS-12-13-2G8']});
    expect(bolts.map(l=>[l.order_date,l.qty,l.unit_price])).toEqual([['2026-08-12',10,31.5],['2026-04-21',12,30.4],['2026-02-03',8,29.8],['2025-11-17',10,29.5],['2025-09-30',10,29.5]]);
    expect(bolts[0]).toEqual({order_number:'SO-51221',order_date:'2026-08-12',po_number:'7775',item_id:'HCS-12-13-2G8',sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',pack:'Box of 50',qty:10,unit_price:31.5});
    expect(orderHistory('wasatch',{itemIds:['HCS-12-13-2G8'],since:'2026-04-21'})).toHaveLength(2);
    expect(orderHistory('wasatch').length).toBeGreaterThan(50);
    expect(orderHistory('wasatch',{limit:3}).map(l=>l.order_number)).toEqual(['SO-51223','SO-51223','SO-51223']);
    expect(orderHistory('wasatch',{itemIds:[]})).toEqual([]);
    expect(orderHistory('great-basin')).toEqual([]);
  });

  it('summarises what the customer buys, most often first',()=>{
    const items=purchasedItems('wasatch');
    expect(items.slice(0,3).map(i=>i.sku)).toEqual(['CW-45-045-T1','HCS-12-13-2G8','HN-12-13-G8']);
    expect(items[0]).toEqual({item_id:'CW-45-045-T1',sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',order_count:5,total_qty:38,last_order_date:'2026-09-09',last_qty:4,last_unit_price:36});
    expect(items.find(i=>i.sku==='RS-2-27-JH')).toBeUndefined();
    expect(purchasedItems('wasatch',{since:'2026-09-01'}).map(i=>i.sku)).toEqual(['CW-45-045-T1','FD-45-60Z','GLV-N8-L-1000']);
    expect(purchasedItems('great-basin')).toEqual([]);
  });

  it('bounds the summary at `until` (inclusive), so later orders don\'t count and "last" is the latest in the window',()=>{
    // The flap discs' latest order is SO-51223 on 2026-09-09 (3 boxes); before it, SO-51218 on 2026-06-18 (4 boxes).
    const discs=(until?:string)=>purchasedItems('wasatch',{until}).find(i=>i.sku==='FD-45-60Z');
    expect(discs()).toMatchObject({order_count:4,last_order_date:'2026-09-09',last_qty:3});
    expect(discs('2026-09-09')).toMatchObject({order_count:4,last_order_date:'2026-09-09',last_qty:3});
    expect(discs('2026-09-08')).toMatchObject({order_count:3,last_order_date:'2026-06-18',last_qty:4,last_unit_price:44.25});
    expect(purchasedItems('wasatch',{since:'2026-09-01',until:'2026-09-08'})).toEqual([]);
    expect(purchasedItems('wasatch',{until:'2025-09-01'})).toEqual([]);
  });

  it('finds items bought together with an item',()=>{
    expect(coPurchases('wasatch','HCS-12-13-2G8').map(c=>[c.sku,c.orders_together])).toEqual([['HN-12-13-G8',5],['FW-12-G8',4],['ANC-12-414-W',1]]);
    expect(coPurchases('wasatch','CW-45-045-T1').map(c=>[c.sku,c.orders_together])).toEqual([['FD-45-60Z',4],['GLV-N8-L-1000',1],['SD-5-80-HL',1],['WB-4-CS',1]]);
    expect(coPurchases('wasatch','RS-2-27-JH')).toEqual([]);
  });

  it('bounds items bought together at `until` (inclusive)',()=>{
    expect(coPurchases('wasatch','CW-45-045-T1',{until:'2026-09-09'}).map(c=>[c.sku,c.orders_together])).toEqual([['FD-45-60Z',4],['GLV-N8-L-1000',1],['SD-5-80-HL',1],['WB-4-CS',1]]);
    // Before SO-51223 (2026-09-09) the wheels were bought with flap discs 3 times and never with gloves.
    expect(coPurchases('wasatch','CW-45-045-T1',{until:'2026-09-08'}).map(c=>[c.sku,c.orders_together])).toEqual([['FD-45-60Z',3],['SD-5-80-HL',1],['WB-4-CS',1]]);
    expect(coPurchases('wasatch','HCS-12-13-2G8',{since:'2025-12-01',until:'2026-06-01'}).map(c=>[c.sku,c.orders_together])).toEqual([['HN-12-13-G8',2],['FW-12-G8',1]]);
  });
});
