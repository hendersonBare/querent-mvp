import {describe,expect,it} from 'vitest';
import {resolveUsual} from './usual';

const CATALOG=[
  {sku:'W-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',keywords:'cutoff disc'},
  {sku:'W-T27',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 27',keywords:'cutoff disc'},
  {sku:'G-L',description:'Nitrile disposable gloves, 8 mil, black, size L',keywords:'gloves nitrile large'},
  {sku:'G-M',description:'Nitrile disposable gloves, 8 mil, black, size M',keywords:'gloves nitrile medium'},
  {sku:'FD-60',description:'Flap disc 4.5 in, 60 grit zirconia',keywords:'flap wheel sanding'},
];
const PURCHASES=[
  {sku:'W-T1',order_count:6,last_order_date:'2026-09-09',last_qty:4},
  {sku:'G-L',order_count:4,last_order_date:'2026-09-09',last_qty:4},
  {sku:'G-M',order_count:1,last_order_date:'2026-05-01',last_qty:2},
  {sku:'FD-60',order_count:4,last_order_date:'2026-09-09',last_qty:3},
];

describe('resolveUsual',()=>{
  it('resolves "the usual X" to the matching item the customer orders most, with the last qty',()=>{
    expect(resolveUsual('the usual cut-off wheels',CATALOG,PURCHASES)).toEqual({item:CATALOG[0],order_count:6,last_order_date:'2026-09-09',last_qty:4});
    expect(resolveUsual('the usual gloves',CATALOG,PURCHASES)?.item.sku).toBe('G-L');
  });

  it('only looks at items that match the words, however often other items are ordered',()=>{
    // Flap discs are "wheels" by keyword, but "cut-off wheels" matches the cut-off wheels better.
    expect(resolveUsual('cut-off wheels',CATALOG,PURCHASES)?.item.sku).toBe('W-T1');
    expect(resolveUsual('the usual medium gloves',CATALOG,PURCHASES)?.item.sku).toBe('G-M');
  });

  it('breaks a tie in order count with the most recent order',()=>{
    const tied=[{sku:'G-L',order_count:3,last_order_date:'2026-01-10'},{sku:'G-M',order_count:3,last_order_date:'2026-08-01'}];
    expect(resolveUsual('the usual gloves',CATALOG,tied)?.item.sku).toBe('G-M');
  });

  it('returns nothing when the customer never ordered a match, or the line names no item',()=>{
    expect(resolveUsual('the usual cut-off wheels',CATALOG,[{sku:'G-L',order_count:4}])).toBeUndefined();
    expect(resolveUsual('the usual',CATALOG,PURCHASES)).toBeUndefined();
    expect(resolveUsual('the usual ratchet straps',CATALOG,PURCHASES)).toBeUndefined();
    expect(resolveUsual('the usual gloves',CATALOG,[])).toBeUndefined();
  });
});
