import {afterEach,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '../repository/test-db';

useSeededDatabase();

const ctx={customerId:'wasatch'};
const tools=()=>import('./tools');
const setItemsStock=async(enabled:boolean)=>(await import('../repository')).setAccess('wasatch','items_stock',enabled);
afterEach(async()=>{await setItemsStock(true);});

/** Every key in a tool result, however deep: the chat tools must never carry cost or prices. */
const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];

describe('search_items',()=>{
  it('finds catalog candidates with identity only: no cost, prices or stock',async()=>{
    const {searchItemsTool}=await tools();
    const result=searchItemsTool(ctx,{query:'4.5 cut-off wheel .045'});
    expect(result).toEqual({ok:true,data:[
      {sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',category_name:'Abrasives & Cutting'},
      {sku:'CW-45-045-T27',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 27',pack:'Box of 25',category_name:'Abrasives & Cutting'},
    ]});
    expect(keys(searchItemsTool(ctx,{query:'hex'}))).not.toContainEqual(expect.stringMatching(/cost|price|stock|available/i));
  });

  it('caps the candidate count, and still works with Items & stock turned off',async()=>{
    const {searchItemsTool}=await tools();
    await setItemsStock(false);
    const result=searchItemsTool(ctx,{query:'cut-off wheel',limit:2});
    expect(result.ok&&result.data.map(c=>c.sku)).toEqual(['CW-45-045-T1','CW-45-045-T27']);
  });

  it('rejects an empty query',async()=>{
    const {searchItemsTool}=await tools();
    expect(searchItemsTool(ctx,{query:'  '})).toEqual({ok:false,reason:'invalid',message:'Give search_items some words to search for.'});
  });
});

describe('get_stock',()=>{
  it('returns stock at every branch, in branch order, for the SKUs asked',async()=>{
    const {getStockTool}=await tools();
    const result=getStockTool(ctx,{skus:['hcs-12-13-2g8','NOPE-1']});
    expect(result).toEqual({ok:true,data:{unknown:['NOPE-1'],items:[{
      sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',pack:'Box of 50',total_available:94,
      branches:[
        {branch_id:'slc',branch_code:'SLC',available:64,on_order:expect.any(Number),next_receipt_on:null},
        {branch_id:'ogden',branch_code:'Ogden',available:22,on_order:expect.any(Number),next_receipt_on:null},
        {branch_id:'provo',branch_code:'Provo',available:8,on_order:expect.any(Number),next_receipt_on:null},
      ],
    }]}});
    expect(keys(result)).not.toContainEqual(expect.stringMatching(/cost|price/i));
  });

  it('is restricted when the customer has Items & stock turned off',async()=>{
    const {getStockTool}=await tools();
    await setItemsStock(false);
    expect(getStockTool(ctx,{skus:['HCS-12-13-2G8']})).toEqual({ok:false,reason:'restricted',category:'items_stock'});
  });

  it('rejects an empty SKU list',async()=>{
    const {getStockTool}=await tools();
    expect(getStockTool(ctx,{skus:[]})).toMatchObject({ok:false,reason:'invalid'});
  });
});

describe('propose_cart',()=>{
  it('builds the item pop-up payload once every line has a SKU: pickup at SLC unless told otherwise',async()=>{
    const {proposeCartTool}=await tools();
    expect(proposeCartTool(ctx,{lines:[{sku:'hcs-12-13-2g8',qty:10,requested_text:'10 boxes of the bolts'},{sku:'CW-45-045-T1',qty:6}]})).toEqual({ok:true,data:{
      fulfillment:'will_call',branch_id:'slc',
      lines:[{sku:'HCS-12-13-2G8',qty:10,requested_text:'10 boxes of the bolts'},{sku:'CW-45-045-T1',qty:6}],
    }});
    expect(proposeCartTool(ctx,{lines:[{sku:'CW-45-045-T1',qty:1}],fulfillment:'delivery',branch_id:'provo'})).toMatchObject({ok:true,data:{fulfillment:'delivery',branch_id:'provo'}});
  });

  it('merges repeated SKUs into one line',async()=>{
    const {proposeCartTool}=await tools();
    const result=proposeCartTool(ctx,{lines:[{sku:'CW-45-045-T1',qty:2,requested_text:'2 wheels'},{sku:'cw-45-045-t1',qty:4}]});
    expect(result).toMatchObject({ok:true,data:{lines:[{sku:'CW-45-045-T1',qty:6,requested_text:'2 wheels'}]}});
  });

  it('refuses a cart that is empty, has an unmatched SKU, a bad qty, branch or fulfillment',async()=>{
    const {proposeCartTool}=await tools();
    const invalid=(input:Parameters<typeof proposeCartTool>[1])=>{const r=proposeCartTool(ctx,input);return r.ok?'ok':r.reason==='invalid'?r.message:r.reason;};
    expect(invalid({lines:[]})).toBe('A cart needs at least one line.');
    expect(invalid({lines:[{sku:'NOPE-1',qty:1}]})).toBe('No catalog item has SKU NOPE-1.');
    expect(invalid({lines:[{sku:'CW-45-045-T1',qty:0}]})).toBe('Qty for CW-45-045-T1 must be a whole number from 1 to 9999.');
    expect(invalid({lines:[{sku:'CW-45-045-T1',qty:1.5}]})).toBe('Qty for CW-45-045-T1 must be a whole number from 1 to 9999.');
    expect(invalid({lines:[{sku:'CW-45-045-T1',qty:10000}]})).toBe('Qty for CW-45-045-T1 must be a whole number from 1 to 9999.');
    expect(invalid({lines:[{sku:'CW-45-045-T1',qty:1}],branch_id:'moab'})).toBe('No branch has id moab.');
    expect(invalid({lines:[{sku:'CW-45-045-T1',qty:1}],fulfillment:'drone' as never})).toBe('Fulfillment must be will_call or delivery.');
  });
});
