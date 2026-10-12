import {describe,expect,it} from 'vitest';
import {
  NO_CUSTOMER_FILTERS,NO_ORDER_FILTERS,NO_STOCK_FILTERS,customerChips,customerRepOptions,customerTermsOptions,filterCustomers,filterItems,filterOrders,
  isLowStock,orderStatusOptions,parseMoney,searchCustomers,searchItems,stockSummary,
} from './filters';
import {BOLTS,DIRECTORY,ORDERS,STRAPS} from './test-fixtures';

// The Customers, Orders and Stock filters (plan U5; C_CU1, C_CU2, C_RCU1, C_OR1, C_ST1): pure, so the
// lists and their tests share them. Each Only show rule and range is tested on its own.

const ids=(rows:{id:string}[])=>rows.map(r=>r.id);

describe('customer filters (C_CU1, C_RCU1)',()=>{
  it('offers each rep with their customer count, by name, and the terms on file plus Not on file',()=>{
    expect(customerRepOptions(DIRECTORY)).toEqual([{id:'brandi',name:'Brandi Gallegos',count:2},{id:'mara',name:'Mara Jensen',count:1}]);
    expect(customerTermsOptions(DIRECTORY)).toEqual(['Net 30','Not on file']);
  });

  it('filters by rep, by terms (Not on file is a customer with no terms and no credit on file) and by open balance range',()=>{
    expect(ids(filterCustomers(DIRECTORY,{...NO_CUSTOMER_FILTERS,reps:['mara']}))).toEqual(['canyon-ridge']);
    expect(ids(filterCustomers(DIRECTORY,{...NO_CUSTOMER_FILTERS,terms:['Not on file']}))).toEqual(['canyon-ridge','great-basin']);
    expect(ids(filterCustomers(DIRECTORY,{...NO_CUSTOMER_FILTERS,terms:['Net 30']}))).toEqual(['wasatch']);
    expect(ids(filterCustomers(DIRECTORY,{...NO_CUSTOMER_FILTERS,balanceFrom:'10000'}))).toEqual(['wasatch']);
    expect(ids(filterCustomers(DIRECTORY,{...NO_CUSTOMER_FILTERS,balanceTo:'$10,000.00'}))).toEqual([]);
    expect(ids(filterCustomers(DIRECTORY,{...NO_CUSTOMER_FILTERS,balanceFrom:'0',balanceTo:'20000'}))).toEqual(['wasatch']);
    // Nothing picked keeps everyone.
    expect(ids(filterCustomers(DIRECTORY,NO_CUSTOMER_FILTERS))).toEqual(['canyon-ridge','great-basin','wasatch']);
  });

  it('Only show: Has open quotes, Over 80% of credit limit, Never ordered, each on its own and together',()=>{
    const rows=[...DIRECTORY,{...DIRECTORY[2],id:'stretched',name:'Stretched Supply',open_balance:41000,open_quote_count:0,order_count:0,last_order_date:null}];
    expect(ids(filterCustomers(rows,{...NO_CUSTOMER_FILTERS,only:['open_quotes']}))).toEqual(['wasatch']);
    expect(ids(filterCustomers(rows,{...NO_CUSTOMER_FILTERS,only:['over_credit']}))).toEqual(['stretched']);
    expect(ids(filterCustomers(rows,{...NO_CUSTOMER_FILTERS,only:['never_ordered']}))).toEqual(['canyon-ridge','great-basin','stretched']);
    expect(ids(filterCustomers(rows,{...NO_CUSTOMER_FILTERS,only:['over_credit','never_ordered']}))).toEqual(['stretched']);
    // Exactly 80% is not over it.
    expect(ids(filterCustomers([{...rows[3],open_balance:40000}],{...NO_CUSTOMER_FILTERS,only:['over_credit']}))).toEqual([]);
  });

  it('searches by name or account number, ignoring case',()=>{
    expect(ids(searchCustomers(DIRECTORY,'basin'))).toEqual(['great-basin']);
    expect(ids(searchCustomers(DIRECTORY,'was-11'))).toEqual(['wasatch']);
    expect(ids(searchCustomers(DIRECTORY,'  '))).toEqual(ids(DIRECTORY));
  });

  it('names each applied group as a chip (C_CU2 "Rep: Brandi Gallegos, Eli Porter"), so the badge counts groups',()=>{
    const reps=[{id:'brandi',name:'Brandi Gallegos',count:2},{id:'eli',name:'Eli Porter',count:2}];
    expect(customerChips({...NO_CUSTOMER_FILTERS,reps:['brandi','eli']},reps)).toEqual([{group:'reps',label:'Rep: Brandi Gallegos, Eli Porter'}]);
    expect(customerChips({reps:[],terms:['Net 30','Not on file'],balanceFrom:'1000',balanceTo:'',only:['open_quotes','never_ordered']},reps).map(c=>c.label)).toEqual([
      'Terms: Net 30, Not on file','Open balance: from $1,000.00','Only show: Has open quotes, Never ordered',
    ]);
    expect(customerChips({...NO_CUSTOMER_FILTERS,balanceTo:'5000'},reps).map(c=>c.label)).toEqual(['Open balance: up to $5,000.00']);
    expect(customerChips({...NO_CUSTOMER_FILTERS,balanceFrom:'0',balanceTo:'5000'},reps).map(c=>c.label)).toEqual(['Open balance: $0.00 to $5,000.00']);
    expect(customerChips(NO_CUSTOMER_FILTERS,reps)).toEqual([]);
  });

  it('reads money as typed, with or without $ and commas',()=>{
    expect(parseMoney('$50,000.00')).toBe(50000);
    expect(parseMoney(' 1250.5 ')).toBe(1250.5);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('lots')).toBeNull();
  });
});

describe('order filters (C_OR1)',()=>{
  const rows=[...ORDERS,{...ORDERS[1],id:'so-1',order_number:'SO-1',rep_id:'eli',rep_name:'Eli Porter',branch_id:'ogden',branch_code:'Ogden',order_date:'2025-12-03'}];
  it('offers the statuses the orders have, in the frame\'s order (the reps are the reader\'s customers\' reps, customerRepOptions)',()=>{
    expect(orderStatusOptions(rows)).toEqual(['shipped','closed']);
  });
  it('filters by rep, status, fulfillment, branch and the ordered date range (inclusive)',()=>{
    expect(ids(filterOrders(rows,{...NO_ORDER_FILTERS,reps:['eli']}))).toEqual(['so-1']);
    expect(ids(filterOrders(rows,{...NO_ORDER_FILTERS,statuses:['shipped']}))).toEqual(['so-51223']);
    expect(ids(filterOrders(rows,{...NO_ORDER_FILTERS,fulfillment:['will_call']}))).toEqual(['so-51222','so-1']);
    expect(ids(filterOrders(rows,{...NO_ORDER_FILTERS,branches:['slc']}))).toEqual(['so-51223']);
    expect(ids(filterOrders(rows,{...NO_ORDER_FILTERS,from:'2026-08-26'}))).toEqual(['so-51223','so-51222']);
    expect(ids(filterOrders(rows,{...NO_ORDER_FILTERS,to:'2026-08-26'}))).toEqual(['so-51222','so-1']);
    expect(ids(filterOrders(rows,NO_ORDER_FILTERS))).toEqual(ids(rows));
  });
});

describe('stock filters (C_ST1)',()=>{
  const items=[BOLTS,STRAPS];
  it('says how many items across how many categories',()=>{
    expect(stockSummary(62,6)).toBe('62 items across 6 categories.');
    expect(stockSummary(1,1)).toBe('1 item across 1 category.');
  });
  it('low stock is less than one full case at some branch (open assumption, docs/plans/status.md)',()=>{
    expect(isLowStock(BOLTS)).toBe(true); // 8 at Provo, 10 to a case
    expect(isLowStock({...BOLTS,stock:BOLTS.stock.map(s=>({...s,available:10}))})).toBe(false);
  });
  it('filters by category, in stock at a branch, low stock, on order and the list price range',()=>{
    const ok={...BOLTS,id:'ok',stock:BOLTS.stock.map(s=>({...s,available:50}))};
    expect(ids(filterItems([...items,ok],{...NO_STOCK_FILTERS,categories:['material-handling']}))).toEqual(['RS-2-27-JH']);
    expect(ids(filterItems([...items,ok],{...NO_STOCK_FILTERS,branches:['provo']}))).toEqual(['HCS-12-13-2G8','ok']);
    expect(ids(filterItems([...items,ok],{...NO_STOCK_FILTERS,only:['low_stock']}))).toEqual(['HCS-12-13-2G8','RS-2-27-JH']);
    expect(ids(filterItems([...items,ok],{...NO_STOCK_FILTERS,only:['on_order']}))).toEqual(['RS-2-27-JH']);
    expect(ids(filterItems([...items,ok],{...NO_STOCK_FILTERS,priceFrom:'30'}))).toEqual(['HCS-12-13-2G8','ok']);
    expect(ids(filterItems([...items,ok],{...NO_STOCK_FILTERS,priceTo:'$30.00'}))).toEqual(['RS-2-27-JH']);
  });
  it('searches by SKU or item name',()=>{
    expect(ids(searchItems(items,'rs-2'))).toEqual(['RS-2-27-JH']);
    expect(ids(searchItems(items,'HEX CAP'))).toEqual(['HCS-12-13-2G8']);
  });
});
