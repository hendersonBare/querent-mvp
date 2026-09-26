import {expect,it} from 'vitest';
import {priceSources} from './pricing';
import {useSeededDatabase} from './test-db';

// The last-paid window across Feb 29 (spec §5.1: "the last 12 months"). Seeding on 2027-04-12
// puts Wasatch's latest bolt order (SO-51221, 42 days before the anchor) on 2027-03-01, and
// 2028-03-01 is exactly 12 calendar months later but 366 days, so a 365-day window would miss it.
useSeededDatabase('2027-04-12');

it('keeps a purchase exactly 12 calendar months back across Feb 29, and drops it a day later',()=>{
  expect(priceSources('wasatch',['HCS-12-13-2G8'],'2028-03-01')[0].last_paid).toEqual({unit_price:31.5,qty:10,order_date:'2027-03-01',order_number:'SO-51221'});
  expect(priceSources('wasatch',['HCS-12-13-2G8'],'2028-03-02')[0].last_paid).toBeNull();
});
