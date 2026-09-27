import {afterEach,describe,expect,it} from 'vitest';
import type {Category} from '@/lib/contracts';
import {useSeededDatabase} from '../repository/test-db';

useSeededDatabase();

const ctx={customerId:'wasatch',today:'2026-09-23'};
const tools=()=>import('./tools');
const setAccess=async(category:Category,enabled:boolean)=>(await import('../repository')).setAccess('wasatch',category,enabled);
afterEach(async()=>{for(const c of ['items_stock','pricing','orders_quotes','account'] as const)await setAccess(c,true);});

/** A search_items verdict for its first line, with just the best candidate. */
const verdict=(r:{ok:boolean;data?:unknown})=>{
  const line=(r as {data:{lines:{confident:boolean;question:string|null;candidates:{sku:string;score:number}[]}[]}}).data.lines[0];
  return {confident:line.confident,question:line.question,top:line.candidates[0]};
};

/** Every key in a tool result, however deep. */
const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];

describe('search_items (Items & stock)',()=>{
  it('scores catalog candidates with identity only (no cost, prices or stock) and asks about a near-duplicate',async()=>{
    const {searchItemsTool}=await tools();
    const result=searchItemsTool(ctx,{query:'4.5 cut-off wheel .045'});
    expect(result).toEqual({ok:true,data:{lines:[{
      requested_text:'4.5 cut-off wheel .045',qty:null,
      candidates:[
        {sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',category_name:'Abrasives & Cutting',score:1},
        {sku:'CW-45-045-T27',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 27',pack:'Box of 25',category_name:'Abrasives & Cutting',score:1},
      ],
      confident:false,
      question:'Type 1 or Type 27 cut-off wheels?',
    }]}});
    expect(keys(searchItemsTool(ctx,{query:'hex'}))).not.toContainEqual(expect.stringMatching(/cost|price|stock|available/i));
  });

  it('says when one candidate is a confident match, and asks nothing',async()=>{
    const {searchItemsTool}=await tools();
    expect(verdict(searchItemsTool(ctx,{query:'½-13 grade 8 hex cap screws 2 in'}))).toMatchObject({confident:true,question:null,top:{sku:'HCS-12-13-2G8',score:1}});
  });

  it('splits a multi-line request and takes each line\'s qty out before scoring (task 1.4 carry-forward)',async()=>{
    const {searchItemsTool}=await tools();
    const result=searchItemsTool(ctx,{query:'Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels'});
    if(!result.ok)throw new Error(result.reason);
    expect(result.data.lines.map(l=>({said:l.requested_text,qty:l.qty,confident:l.confident,question:l.question,top:l.candidates[0]?.sku}))).toEqual([
      {said:'Please quote 10 boxes of the 1/2 in grade 8 hex bolts',qty:10,confident:true,question:null,top:'HCS-12-13-2G8'},
      {said:'6 boxes of cut-off wheels',qty:6,confident:false,question:'Type 1 or Type 27 cut-off wheels?',top:'CW-45-045-T1'},
    ]);
    // Scored whole, the same request gives one verdict for the bolts, and the wheels' question is lost.
    const {matchLine}=await import('@/server/matching');
    const {catalogItems,purchasedItems}=await import('../repository/customer');
    const whole=matchLine('Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels',catalogItems(),{purchases:purchasedItems('wasatch')});
    expect(whole.question).not.toBe('Type 1 or Type 27 cut-off wheels?');
  });

  it('resolves "the usual" from order history, but only when the customer has Orders & quotes on',async()=>{
    const {searchItemsTool}=await tools();
    expect(verdict(searchItemsTool(ctx,{query:'the usual gloves'}))).toMatchObject({confident:true,top:{sku:'GLV-N8-L-1000',score:1}});
    expect(verdict(searchItemsTool(ctx,{query:'1/2 in grade 8 hex bolts'}))).toMatchObject({confident:true,top:{sku:'HCS-12-13-2G8'}});
    await setAccess('orders_quotes',false);
    expect(verdict(searchItemsTool(ctx,{query:'the usual gloves'}))).toMatchObject({confident:false,question:'Nitrile disposable gloves or cut-resistant gloves?'});
    expect(verdict(searchItemsTool(ctx,{query:'1/2 in grade 8 hex bolts'}))).toMatchObject({confident:false,question:'1-1/2 in, 2 in or 3 in hex cap screws?'});
  });

  it('caps the candidate count',async()=>{
    const {searchItemsTool}=await tools();
    const result=searchItemsTool(ctx,{query:'cut-off wheel',limit:2});
    expect(result.ok&&result.data.lines[0].candidates.map(c=>c.sku)).toEqual(['CW-45-045-T1','CW-45-045-T27']);
  });

  it('asks for another description when nothing matches',async()=>{
    const {searchItemsTool}=await tools();
    expect(searchItemsTool(ctx,{query:'xyzzy'})).toEqual({ok:true,data:{lines:[{requested_text:'xyzzy',qty:null,candidates:[],confident:false,question:"I couldn't find that item. Can you describe it another way, or give the SKU?"}]}});
  });

  it('rejects an empty query, or one with only a count',async()=>{
    const {searchItemsTool}=await tools();
    expect(searchItemsTool(ctx,{query:'  '})).toEqual({ok:false,reason:'invalid',message:'Give search_items some words to search for.'});
    expect(searchItemsTool(ctx,{query:'10 boxes'})).toMatchObject({ok:false,reason:'invalid'});
  });
});

describe('get_stock (Items & stock)',()=>{
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

  it('answers each SKU once, however it is typed',async()=>{
    const {getStockTool}=await tools();
    const result=getStockTool(ctx,{skus:['HCS-12-13-2G8','hcs-12-13-2g8']});
    expect(result.ok&&result.data.items.map(i=>i.sku)).toEqual(['HCS-12-13-2G8']);
  });

  it('rejects an empty SKU list',async()=>{
    const {getStockTool}=await tools();
    expect(getStockTool(ctx,{skus:[]})).toMatchObject({ok:false,reason:'invalid'});
  });
});

describe('get_price (Pricing): customer-visible prices only',()=>{
  it('gives list, price-level and active contract prices, and what the customer pays',async()=>{
    const {getPriceTool}=await tools();
    expect(getPriceTool(ctx,{skus:['HCS-12-13-2G8','CW-45-045-T1','NOPE-1']})).toEqual({ok:true,data:{unknown:['NOPE-1'],items:[
      {sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',pack:'Box of 50',list_price:38.95,customer_price:30.95,contract:null,your_price:30.95,price_basis:'customer'},
      {sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',list_price:46,customer_price:38.95,
        contract:{contract_number:'WAS-C-2026-01',contract_name:'Abrasives supply agreement',unit_price:36,ends_on:'2026-12-31'},your_price:36,price_basis:'contract'},
    ]}});
  });

  it('ignores an expired contract, and falls back to list for a customer without a price level',async()=>{
    const {getPriceTool}=await tools();
    expect(getPriceTool(ctx,{skus:['GLV-N8-L-1000']})).toMatchObject({ok:true,data:{items:[{contract:null,price_basis:'customer'}]}});
    expect(getPriceTool({customerId:'great-basin',today:ctx.today},{skus:['HCS-12-13-2G8']})).toMatchObject({ok:true,data:{items:[{customer_price:null,your_price:38.95,price_basis:'list'}]}});
  });

  it('never returns cost: not as a key, and not as a value',async()=>{
    const {getPriceTool}=await tools();
    const {costedItem}=await import('../repository');
    const result=getPriceTool(ctx,{skus:['HCS-12-13-2G8','CW-45-045-T1']});
    expect(keys(result)).not.toContainEqual(expect.stringMatching(/cost|margin|floor|suggest|explanation|internal/i));
    const json=JSON.stringify(result);
    for(const sku of ['HCS-12-13-2G8','CW-45-045-T1'])expect(json).not.toContain(`:${costedItem(sku)!.cost},`);
  });
});

describe('get_order_history (Orders & quotes)',()=>{
  it('lists purchased lines newest first, for some SKUs, since a day',async()=>{
    const {getOrderHistoryTool}=await tools();
    const result=getOrderHistoryTool(ctx,{skus:['CW-45-045-T1','NOPE-1'],limit:2});
    if(!result.ok)throw new Error(result.reason);
    expect(result.data.unknown).toEqual(['NOPE-1']);
    expect(result.data.prices_shown).toBe(true);
    expect(result.data.lines).toHaveLength(2);
    expect(result.data.lines[0]).toEqual({order_number:expect.stringMatching(/^SO-/),order_date:expect.any(String),po_number:expect.any(String),sku:'CW-45-045-T1',
      description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',qty:expect.any(Number),unit_price:expect.any(Number)});
    expect(result.data.lines[0].order_date>=result.data.lines[1].order_date).toBe(true);
    const since=getOrderHistoryTool(ctx,{since:'2026-09-01'});
    expect(since.ok&&since.data.lines.every(l=>l.order_date>='2026-09-01')).toBe(true);
    expect(since.ok&&since.data.lines.length).toBeGreaterThan(0);
  });

  it('shows the unit prices paid only when Pricing is on too',async()=>{
    const {getOrderHistoryTool}=await tools();
    await setAccess('pricing',false);
    const result=getOrderHistoryTool(ctx,{skus:['CW-45-045-T1']});
    expect(result.ok&&result.data.prices_shown).toBe(false);
    expect(keys(result)).not.toContain('unit_price');
  });

  it('returns nothing for SKUs that are all unknown, and rejects a bad day',async()=>{
    const {getOrderHistoryTool}=await tools();
    expect(getOrderHistoryTool(ctx,{skus:['NOPE-1']})).toEqual({ok:true,data:{lines:[],unknown:['NOPE-1'],prices_shown:true}});
    expect(getOrderHistoryTool(ctx,{since:'last week'})).toMatchObject({ok:false,reason:'invalid'});
  });
});

describe('get_order_status (Orders & quotes)',()=>{
  it('finds an order by order number or PO, or gives the latest order',async()=>{
    const {getOrderStatusTool}=await tools();
    const latest=getOrderStatusTool(ctx,{});
    expect(latest).toMatchObject({ok:true,data:{reference:null,quote:null,order:{order_number:'SO-51223',po_number:'7777',status:'shipped',branch_code:expect.any(String)}}});
    expect(getOrderStatusTool(ctx,{reference:'so-51222'})).toMatchObject({ok:true,data:{order:{order_number:'SO-51222',status:'closed'}}});
    expect(getOrderStatusTool(ctx,{reference:'7775'})).toMatchObject({ok:true,data:{order:{order_number:'SO-51221'}}});
    expect(keys(latest)).not.toContain('id');
  });

  it('gives a quote\'s status by quote number, with the last sent total only',async()=>{
    const {getOrderStatusTool}=await tools();
    expect(getOrderStatusTool(ctx,{reference:'Q-24817'})).toEqual({ok:true,data:{reference:'Q-24817',order:null,quote:{
      quote_number:'Q-24817',status:'ready_for_review',revision:0,requested_at:expect.any(String),sent_at:null,valid_until:null,total:null,
    }}});
    expect(getOrderStatusTool(ctx,{reference:'q24816'})).toMatchObject({ok:true,data:{quote:{quote_number:'Q-24816',status:'accepted',total:expect.any(Number)}}});
  });

  it('finds nothing for a reference that isn\'t the customer\'s',async()=>{
    const {getOrderStatusTool}=await tools();
    expect(getOrderStatusTool(ctx,{reference:'SO-00000'})).toEqual({ok:true,data:{reference:'SO-00000',order:null,quote:null}});
    expect(getOrderStatusTool({customerId:'great-basin'},{reference:'Q-24817'})).toEqual({ok:true,data:{reference:'Q-24817',order:null,quote:null}});
    expect(getOrderStatusTool({customerId:'great-basin'},{reference:'SO-51223'})).toMatchObject({ok:true,data:{order:null}});
  });
});

describe('get_account_summary (Account)',()=>{
  it('gives terms, credit, balances, tax status and the rep',async()=>{
    const {getAccountSummaryTool}=await tools();
    expect(getAccountSummaryTool(ctx,{})).toEqual({ok:true,data:{
      account_number:'WAS-1142',name:'Wasatch Mechanical Contractors',terms:'Net 30',credit_limit:50000,open_balance:18420,past_due_balance:0,available_credit:31580,tax_status:'taxable',
      rep:{name:'Brandi Gallegos',title:expect.any(String),phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'},
    }});
  });
});

describe('propose_cart (Items & stock)',()=>{
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

describe('access toggles (spec §6.3: each tool checks the customer\'s toggles)',()=>{
  /** One valid call per tool, so a refusal can only come from the toggle. */
  const CALLS={
    search_items:async()=>(await tools()).searchItemsTool(ctx,{query:'hex bolts'}),
    get_stock:async()=>(await tools()).getStockTool(ctx,{skus:['HCS-12-13-2G8']}),
    propose_cart:async()=>(await tools()).proposeCartTool(ctx,{lines:[{sku:'HCS-12-13-2G8',qty:1}]}),
    get_price:async()=>(await tools()).getPriceTool(ctx,{skus:['HCS-12-13-2G8']}),
    get_order_history:async()=>(await tools()).getOrderHistoryTool(ctx,{}),
    get_order_status:async()=>(await tools()).getOrderStatusTool(ctx,{}),
    get_account_summary:async()=>(await tools()).getAccountSummaryTool(ctx,{}),
  };

  it('covers every tool, and maps each to one information category',async()=>{
    const {TOOL_NAMES,TOOL_CATEGORY}=await tools();
    expect(Object.keys(CALLS).sort()).toEqual([...TOOL_NAMES].sort());
    expect(TOOL_CATEGORY).toEqual({search_items:'items_stock',get_stock:'items_stock',propose_cart:'items_stock',get_price:'pricing',get_order_history:'orders_quotes',get_order_status:'orders_quotes',get_account_summary:'account'});
  });

  it.each(Object.keys(CALLS) as (keyof typeof CALLS)[])('%s answers with its category on, and is refused with it off',async name=>{
    const {TOOL_CATEGORY}=await tools();
    const category=TOOL_CATEGORY[name];
    expect(await CALLS[name]()).toMatchObject({ok:true});
    await setAccess(category,false);
    expect(await CALLS[name]()).toEqual({ok:false,reason:'restricted',category});
    // Turning off the other categories alone never refuses it.
    await setAccess(category,true);
    for(const other of ['items_stock','pricing','orders_quotes','account'] as const)if(other!==category)await setAccess(other,false);
    expect(await CALLS[name]()).toMatchObject({ok:true});
  });

  it('never returns a cost-like key from any tool (deep scan, as customer.test.ts)',async()=>{
    const FORBIDDEN=/cost|margin|floor|suggest|explanation|internal/i;
    for(const call of Object.values(CALLS))expect(keys(await call()).filter(k=>FORBIDDEN.test(k))).toEqual([]);
  });
});
