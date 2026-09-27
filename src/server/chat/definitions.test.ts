import {afterEach,describe,expect,it} from 'vitest';
import type {Category} from '@/lib/contracts';
import {useSeededDatabase} from '../repository/test-db';

useSeededDatabase();

const ctx={customerId:'wasatch',today:'2026-09-23'};
const definitions=()=>import('./definitions');
const setAccess=async(category:Category,enabled:boolean)=>(await import('../repository')).setAccess('wasatch',category,enabled);
afterEach(async()=>{for(const c of ['items_stock','pricing','orders_quotes','account'] as const)await setAccess(c,true);});

/** A valid input for every tool. */
const INPUT={
  search_items:{query:'hex bolts'},
  get_stock:{skus:['HCS-12-13-2G8']},
  get_price:{skus:['HCS-12-13-2G8']},
  get_order_history:{skus:['CW-45-045-T1']},
  get_order_status:{reference:'SO-51223'},
  get_account_summary:{},
  propose_cart:{lines:[{sku:'HCS-12-13-2G8',qty:10}]},
};

describe('the tool definitions Claude sees',()=>{
  it('lists the seven tools in a fixed order, each with a description and an object schema',async()=>{
    const {TOOL_DEFINITIONS}=await definitions();
    expect(TOOL_DEFINITIONS.map(t=>t.name)).toEqual(['search_items','get_stock','get_price','get_order_history','get_order_status','get_account_summary','propose_cart']);
    for(const tool of TOOL_DEFINITIONS){
      expect(tool.description!.length).toBeGreaterThan(60);
      expect(tool.input_schema.type).toBe('object');
      expect(tool.input_schema).not.toHaveProperty('$schema');
    }
  });

  it('gives each schema its required fields and limits',async()=>{
    const {TOOL_DEFINITIONS}=await definitions();
    const schema=(name:string)=>TOOL_DEFINITIONS.find(t=>t.name===name)!.input_schema as {required?:string[];properties:Record<string,{maxItems?:number;enum?:string[];items?:{properties:Record<string,{minimum?:number;maximum?:number}>}}>};
    expect(schema('search_items').required).toEqual(['query']);
    // Task 2.2: Claude marks the searches that belong to a quote request; the clarification loop tracks those.
    expect(schema('search_items').properties.quote_request).toMatchObject({type:'boolean'});
    expect(schema('get_stock')).toMatchObject({required:['skus'],properties:{skus:{maxItems:20}}});
    expect(schema('get_order_history').required??[]).toEqual([]);
    expect(schema('get_account_summary').properties).toEqual({});
    expect(schema('propose_cart')).toMatchObject({required:['lines'],properties:{fulfillment:{enum:['will_call','delivery']},lines:{items:{properties:{qty:{minimum:1,maximum:9999}}}}}});
  });
});

describe('runTool',()=>{
  it.each(Object.entries(INPUT))('runs %s and counts its rows',async(name,input)=>{
    const {runTool}=await definitions();
    const run=runTool(ctx,name,input);
    expect(run).toMatchObject({name,result:{ok:true}});
    expect(run.rows).toBeGreaterThan(0);
  });

  it('counts rows per tool: candidates, items, lines, one order or account',async()=>{
    const {runTool}=await definitions();
    expect(runTool(ctx,'get_stock',{skus:['HCS-12-13-2G8','CW-45-045-T1','NOPE']}).rows).toBe(2);
    expect(runTool(ctx,'get_order_status',{reference:'SO-00000'}).rows).toBe(0);
    expect(runTool(ctx,'get_account_summary',{}).rows).toBe(1);
    expect(runTool(ctx,'propose_cart',INPUT.propose_cart).rows).toBe(1);
  });

  it('tags a call with its category, and order history with Pricing when it shows prices',async()=>{
    const {runTool}=await definitions();
    expect(runTool(ctx,'get_stock',INPUT.get_stock).categories).toEqual(['items_stock']);
    expect(runTool(ctx,'get_order_history',INPUT.get_order_history).categories).toEqual(['orders_quotes','pricing']);
    await setAccess('pricing',false);
    expect(runTool(ctx,'get_order_history',INPUT.get_order_history).categories).toEqual(['orders_quotes']);
  });

  it('validates input with the schema Claude was given',async()=>{
    const {runTool}=await definitions();
    const message=(name:string,input:unknown)=>{const r=runTool(ctx,name,input).result;return r.ok?'ok':r.reason==='invalid'?r.message:r.reason;};
    expect(message('get_stock',{skus:'HCS-12-13-2G8'})).toMatch(/^Invalid input for get_stock/);
    expect(message('get_stock',{skus:Array(21).fill('HCS-12-13-2G8')})).toMatch(/^Invalid input for get_stock/);
    expect(message('propose_cart',{lines:[{sku:'HCS-12-13-2G8',qty:2.5}]})).toMatch(/^Invalid input for propose_cart/);
    expect(message('get_order_history',{since:'yesterday'})).toMatch(/^Invalid input for get_order_history/);
    expect(message('search_items',null)).toMatch(/^Invalid input for search_items/);
    expect(message('get_account_summary',undefined)).toBe('ok');
    expect(runTool(ctx,'drop_tables',{})).toEqual({name:null,categories:[],rows:0,result:{ok:false,reason:'invalid',message:'There is no tool called drop_tables.'}});
  });

  it.each(Object.keys(INPUT))('checks access before input for %s: a turned-off category is always "restricted"',async name=>{
    const {runTool}=await definitions();
    const {TOOL_CATEGORY}=await import('./tools');
    const category=TOOL_CATEGORY[name as keyof typeof TOOL_CATEGORY];
    await setAccess(category,false);
    for(const input of [INPUT[name as keyof typeof INPUT],{nonsense:true}])
      expect(runTool(ctx,name,input)).toEqual({name,categories:[category],rows:0,result:{ok:false,reason:'restricted',category}});
  });

  it('returns no cost-like key from any tool',async()=>{
    const {runTool}=await definitions();
    const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];
    for(const [name,input] of Object.entries(INPUT))expect(keys(runTool(ctx,name,input).result).filter(k=>/cost|margin|floor|suggest|explanation|internal/i.test(k))).toEqual([]);
  });
});
