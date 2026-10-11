import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

// The Orders sheet's list (plan U10; C_CVL2; new-ui-implementation-prompt Appendix D "GET
// /api/query/customer/orders (own previous orders)"): order number, date, fulfillment and branch,
// status, total and the quote it came from. Customer-facing: no cost, no margin, no lines.

const FORBIDDEN=/cost|margin|floor|internal|subtotal|freight|tax/i;
const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];

describe('customerOrderList',()=>{
  it("lists the customer's own orders newest first, with what the sheet shows and nothing more",async()=>{
    const {customerOrderList}=await import('./orders');
    const list=customerOrderList('wasatch');
    expect(list.length).toBeGreaterThan(5);
    expect(list[0]).toEqual({id:'so-51223',order_number:'SO-51223',order_date:'2026-09-09',status:'shipped',fulfillment:'delivery',branch_code:'SLC',total:698.22,quote_number:'Q-24816'});
    expect(list[1]).toMatchObject({order_number:'SO-51222',status:'closed',branch_code:'Provo',quote_number:'Q-24814'});
    expect(list.find(o=>o.quote_number===null)).toBeDefined();
    const dates=list.map(o=>o.order_date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(keys(list).filter(k=>FORBIDDEN.test(k))).toEqual([]);
  });

  it("never lists another customer's orders",async()=>{
    const {customerOrderList}=await import('./orders');
    const {allOrders}=await import('@/server/repository');
    const wasatch=new Set(customerOrderList('wasatch').map(o=>o.id));
    const others=allOrders().filter(o=>o.customer_id!=='wasatch');
    expect(others.length).toBeGreaterThan(0);
    expect(others.filter(o=>wasatch.has(o.id))).toEqual([]);
    expect(customerOrderList('nobody')).toEqual([]);
  });
});
