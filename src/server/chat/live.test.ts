import type Anthropic from '@anthropic-ai/sdk';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {Category} from '@/lib/contracts';
import {useSeededDatabase} from '../repository/test-db';
import type {LiveClient} from './live';

useSeededDatabase();

// Live chat against a mocked Anthropic client (never the real API): each test scripts Claude's
// responses and checks what the loop sends back (tool results) and returns (the ChatReply).

const ctx={customerId:'wasatch'};
const TODAY='2026-09-23';
const setAccess=async(category:Category,enabled:boolean)=>(await import('../repository')).setAccess('wasatch',category,enabled);
afterEach(async()=>{for(const c of ['items_stock','pricing','orders_quotes','account'] as const)await setAccess(c,true);vi.unstubAllEnvs();});

type Block=Anthropic.ContentBlock;
const text=(t:string):Block=>({type:'text',text:t,citations:null});
let ids=0;
const use=(name:string,input:unknown):Block=>({type:'tool_use',id:`toolu_${++ids}`,name,input});
const message=(content:Block[],stop_reason:Anthropic.StopReason=content.some(b=>b.type==='tool_use')?'tool_use':'end_turn'):Anthropic.Message=>({
  id:`msg_${++ids}`,type:'message',role:'assistant',model:'claude-sonnet-5',content,stop_reason,stop_sequence:null,
  usage:{input_tokens:10,output_tokens:10,cache_creation_input_tokens:null,cache_read_input_tokens:null,server_tool_use:null,service_tier:null},
} as Anthropic.Message);

/** A fake client that answers with `turns` in order and records a snapshot of every request. */
function fakeClaude(...turns:Block[][]){
  const requests:Anthropic.MessageCreateParamsNonStreaming[]=[];
  const client:LiveClient={messages:{create:vi.fn(async(body:Anthropic.MessageCreateParamsNonStreaming)=>{
    requests.push(structuredClone(body));
    const next=turns.shift();
    if(!next)throw new Error('Claude was called more times than the test scripted');
    return message(next);
  })}};
  return {client,requests};
}

/** The tool_result blocks of the last message in a request. */
function toolResults(request:Anthropic.MessageCreateParamsNonStreaming){
  const last=request.messages.at(-1)!;
  expect(last.role).toBe('user');
  return (last.content as Anthropic.ToolResultBlockParam[]).map(r=>({...r,data:r.is_error?r.content:JSON.parse(r.content as string)}));
}

async function live(message:string,client:LiveClient,history:{role:'customer'|'assistant'|'system';content:string}[]=[],options:{model?:string}={}){
  const {liveReply}=await import('./live');
  return liveReply(ctx,message,history,{client,today:TODAY,...options});
}

/** Every key in a value, however deep. */
const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];
const FORBIDDEN=/cost|margin|floor|suggest|explanation|internal/i;

describe('the request to Claude',()=>{
  it('uses claude-sonnet-5 by default, all seven tools, and a system prompt with the customer\'s rep and branches',async()=>{
    const {client,requests}=fakeClaude([text('Hello Dana.')]);
    await live('Hi',client);
    const [request]=requests;
    expect(request.model).toBe('claude-sonnet-5');
    expect(request.tools!.map(t=>(t as Anthropic.Tool).name)).toEqual(['search_items','get_stock','get_price','get_order_history','get_order_status','get_account_summary','propose_cart']);
    expect(request.tool_choice).toBeUndefined();
    const system=(request.system as Anthropic.TextBlockParam[])[0];
    expect(system.cache_control).toEqual({type:'ephemeral'});
    expect(system.text).toContain('Wasatch Mechanical Contractors (account WAS-1142)');
    expect(system.text).toContain('Brandi Gallegos');
    expect(system.text).toContain('(801) 111-2222');
    expect(system.text).toMatch(/- slc: SLC branch/);
    expect(system.text).toContain(`Today is ${TODAY}.`);
    // The prompt carries no account balances or toggles: access is enforced by the tools.
    expect(system.text).not.toMatch(/18,?420|50,?000|Net 30/);
    expect(request.messages).toEqual([{role:'user',content:'Hi'}]);
  });

  it('uses ANTHROPIC_MODEL when set',async()=>{
    vi.stubEnv('ANTHROPIC_MODEL','claude-opus-5');
    const {client,requests}=fakeClaude([text('Hi.')]);
    await live('Hi',client);
    expect(requests[0].model).toBe('claude-opus-5');
  });

  it('sends the earlier turns as text, starting with the customer, without system messages',async()=>{
    const {client,requests}=fakeClaude([text('Sure.')]);
    await live('And the nuts?',client,[
      {role:'assistant',content:'Welcome back.'},
      {role:'customer',content:'Do you have hex bolts?'},
      {role:'system',content:'Quote Q-24817 was requested.'},
      {role:'assistant',content:'Yes, 64 at SLC.'},
    ]);
    expect(requests[0].messages).toEqual([
      {role:'user',content:'Do you have hex bolts?'},
      {role:'assistant',content:'Yes, 64 at SLC.'},
      {role:'user',content:'And the nuts?'},
    ]);
  });
});

describe('tool selection handling',()=>{
  it('answers a stock question: search_items, then get_stock, then Claude\'s text',async()=>{
    const {client,requests}=fakeClaude(
      [text('Let me check.'),use('search_items',{query:'1/2 in grade 8 hex bolts'})],
      [use('get_stock',{skus:['HCS-12-13-2G8']})],
      [text('Yes: 64 at SLC, 22 at Ogden and 8 at Provo.')],
    );
    const result=await live('Do you have 1/2 in grade 8 hex bolts in stock?',client);
    expect(requests).toHaveLength(3);
    const [search]=toolResults(requests[1]);
    expect(search.data.lines[0]).toMatchObject({confident:true,question:null});
    expect(search.data.lines[0].candidates[0].sku).toBe('HCS-12-13-2G8');
    const [stock]=toolResults(requests[2]);
    expect(stock.data.items[0].branches.map((b:{branch_code:string;available:number})=>`${b.available} at ${b.branch_code}`)).toEqual(['64 at SLC','22 at Ogden','8 at Provo']);
    // Claude's own turns go back unchanged before the tool results.
    expect(requests[1].messages.at(-2)).toMatchObject({role:'assistant',content:[{type:'text',text:'Let me check.'},{type:'tool_use',name:'search_items'}]});
    expect(result).toEqual({
      kind:'text',payload:null,content:'Yes: 64 at SLC, 22 at Ogden and 8 at Provo.',
      categories:['items_stock'],handled:['items_stock'],toolCalls:['search_items','get_stock'],rowCount:search.data.lines[0].candidates.length+1,outcome:'answered',
    });
  });

  it('runs parallel tool calls and returns every result, in order, in one message',async()=>{
    const {client,requests}=fakeClaude(
      [use('get_stock',{skus:['CW-45-045-T1']}),use('get_price',{skus:['CW-45-045-T1']})],
      [text('140 at SLC; your contract price is $36.00 a box.')],
    );
    const result=await live('Stock and price on CW-45-045-T1?',client);
    const results=toolResults(requests[1]);
    const calls=(requests[1].messages.at(-2)!.content as Anthropic.ToolUseBlock[]);
    expect(results.map(r=>r.tool_use_id)).toEqual(calls.map(c=>c.id));
    expect(results[1].data.items[0]).toMatchObject({sku:'CW-45-045-T1',your_price:36,price_basis:'contract'});
    expect(result).toMatchObject({categories:['items_stock','pricing'],handled:['items_stock','pricing'],toolCalls:['get_stock','get_price'],rowCount:2,outcome:'answered'});
  });

  it('opens the item pop-up when propose_cart succeeds',async()=>{
    const {client}=fakeClaude(
      [use('search_items',{query:'10 boxes 1/2 in grade 8 hex bolts\n6 boxes Type 1 cut-off wheels'})],
      [use('propose_cart',{lines:[{sku:'HCS-12-13-2G8',qty:10},{sku:'CW-45-045-T1',qty:6}],fulfillment:'will_call',branch_id:'slc'})],
      [text('Here is your list. Check it in the pop-up, then press Request quote.')],
    );
    const result=await live('Quote 10 boxes of 1/2 in grade 8 hex bolts and 6 boxes of Type 1 cut-off wheels, pickup SLC',client);
    expect(result).toMatchObject({
      kind:'item_popup',outcome:'answered',categories:['items_stock'],handled:['items_stock'],toolCalls:['search_items','propose_cart'],
      payload:{fulfillment:'will_call',branch_id:'slc',lines:[{sku:'HCS-12-13-2G8',qty:10},{sku:'CW-45-045-T1',qty:6}]},
      content:'Here is your list. Check it in the pop-up, then press Request quote.',
    });
  });

  it('logs Pricing too when order history shows the prices paid',async()=>{
    const {client}=fakeClaude([use('get_order_history',{skus:['CW-45-045-T1'],limit:1})],[text('You paid $36.00 a box.')]);
    expect(await live('What did we pay for the Type 1 wheels last time?',client)).toMatchObject({categories:['orders_quotes','pricing'],handled:['orders_quotes','pricing'],rowCount:1});
  });

  it('reports invalid input and unknown tools to Claude as errors, and keeps going',async()=>{
    const {client,requests}=fakeClaude(
      [use('get_stock',{skus:[]}),use('delete_everything',{})],
      [text('Which item do you mean?')],
    );
    const result=await live('Stock?',client);
    const [bad,unknown]=toolResults(requests[1]);
    expect(bad).toMatchObject({is_error:true,data:expect.stringContaining('Invalid input for get_stock')});
    expect(unknown).toMatchObject({is_error:true,data:'There is no tool called delete_everything.'});
    expect(result).toMatchObject({content:'Which item do you mean?',toolCalls:['get_stock','unknown'],categories:['items_stock'],handled:[],rowCount:0,outcome:'no_rows'});
  });

  it('stops after MAX_TOOL_ROUNDS: the last request allows no tools',async()=>{
    const {MAX_TOOL_ROUNDS}=await import('./live');
    const loop=Array.from({length:MAX_TOOL_ROUNDS+1},()=>[use('get_stock',{skus:['HCS-12-13-2G8']})]);
    const {client,requests}=fakeClaude(...loop);
    const result=await live('Stock?',client);
    expect(requests).toHaveLength(MAX_TOOL_ROUNDS+1);
    expect(requests.slice(0,-1).every(r=>r.tool_choice===undefined)).toBe(true);
    expect(requests.at(-1)!.tool_choice).toEqual({type:'none'});
    expect(result.toolCalls).toHaveLength(MAX_TOOL_ROUNDS);
    expect(result.content).toContain('Brandi Gallegos');
  });

  it('answers a refusal with a pointer to the rep',async()=>{
    const {liveReply}=await import('./live');
    const client:LiveClient={messages:{create:async()=>message([],'refusal')}};
    expect(await liveReply(ctx,'...',[],{client,today:TODAY})).toMatchObject({outcome:'no_rows',content:expect.stringContaining('Brandi Gallegos can help: (801) 111-2222')});
  });
});

describe('access denial',()=>{
  it('refuses a tool whose category is off, tells Claude to point to the rep, and logs the turn as restricted',async()=>{
    await setAccess('pricing',false);
    const {client,requests}=fakeClaude(
      [use('get_price',{skus:['HCS-12-13-2G8']})],
      [text('Pricing isn\'t available in chat for your account. Brandi Gallegos can help: (801) 111-2222.')],
    );
    const result=await live('What\'s my price on HCS-12-13-2G8?',client);
    const [denied]=toolResults(requests[1]);
    expect(denied.is_error).toBeUndefined();
    expect(denied.data).toEqual({restricted:'pricing',message:expect.stringContaining('can\'t get Pricing information in chat')});
    expect(denied.data.message).toContain('Brandi Gallegos can help: (801) 111-2222 or brandi.gallegos@herrickindustrial.com.');
    expect(JSON.stringify(denied.data)).not.toMatch(/30\.95|38\.95/);
    expect(result).toMatchObject({kind:'text',categories:['pricing'],handled:[],toolCalls:['get_price'],rowCount:0,outcome:'restricted'});
  });

  it.each([
    ['items_stock','get_stock',{skus:['HCS-12-13-2G8']}],
    ['items_stock','search_items',{query:'hex bolts'}],
    ['items_stock','propose_cart',{lines:[{sku:'HCS-12-13-2G8',qty:1}]}],
    ['orders_quotes','get_order_history',{}],
    ['orders_quotes','get_order_status',{reference:'SO-51223'}],
    ['account','get_account_summary',{}],
  ] as const)('with %s off, %s is refused',async(category,tool,input)=>{
    await setAccess(category,false);
    const {client,requests}=fakeClaude([use(tool,input)],[text('Not available here.')]);
    const result=await live('?',client);
    expect(toolResults(requests[1])[0].data).toMatchObject({restricted:category});
    expect(result).toMatchObject({kind:'text',payload:null,categories:[category],handled:[],outcome:'restricted'});
  });

  it('still answers the categories that are on in a mixed turn',async()=>{
    await setAccess('pricing',false);
    const {client}=fakeClaude([use('get_stock',{skus:['HCS-12-13-2G8']}),use('get_price',{skus:['HCS-12-13-2G8']})],[text('64 at SLC. Pricing isn\'t available here.')]);
    expect(await live('Stock and price?',client)).toMatchObject({categories:['items_stock','pricing'],handled:['items_stock'],outcome:'answered'});
  });
});

describe('no cost leakage',()=>{
  it('sends Claude no cost-like key and no item cost from any of the seven tools',async()=>{
    const {client,requests}=fakeClaude(
      [
        use('search_items',{query:'hex bolts\ncut-off wheels\nthe usual gloves'}),
        use('get_stock',{skus:['HCS-12-13-2G8','CW-45-045-T1']}),
        use('get_price',{skus:['HCS-12-13-2G8','CW-45-045-T1','GLV-N8-L-1000']}),
        use('get_order_history',{}),
        use('get_order_status',{reference:'Q-24816'}),
        use('get_account_summary',{}),
        use('propose_cart',{lines:[{sku:'HCS-12-13-2G8',qty:10}]}),
      ],
      [text('Done.')],
    );
    await live('Everything, please.',client);
    const results=toolResults(requests[1]);
    expect(results.map(r=>r.is_error)).toEqual(Array(7).fill(undefined));
    expect(keys(results.map(r=>r.data)).filter(k=>FORBIDDEN.test(k))).toEqual([]);
    const {costedItem}=await import('../repository');
    // No price get_price sends is an item's cost.
    const prices=JSON.stringify(results[2].data);
    for(const sku of ['HCS-12-13-2G8','CW-45-045-T1','GLV-N8-L-1000'])expect(prices).not.toMatch(new RegExp(`:${costedItem(sku)!.cost}[,}]`));
  });
});
