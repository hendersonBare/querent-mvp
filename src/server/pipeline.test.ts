import {afterEach,describe,expect,it,vi} from 'vitest';
import {useSeededDatabase} from './repository/test-db';

useSeededDatabase();

// Lets a test make the scripted engine fail once; otherwise the real module runs.
const failure=vi.hoisted(()=>({next:false}));
vi.mock('./chat/scripted',async importOriginal=>{
  const actual=await importOriginal<typeof import('./chat/scripted')>();
  return {...actual,scriptedReply:(...args:Parameters<typeof actual.scriptedReply>)=>{
    if(failure.next){failure.next=false;throw new Error('boom');}
    return actual.scriptedReply(...args);
  }};
});

// The Anthropic SDK, mocked: Claude answers with the turns a test queues, or is unreachable when none are left.
const claude=vi.hoisted(()=>({turns:[] as ({type:string}&Record<string,unknown>)[][],requests:[] as {messages:unknown[]}[]}));
vi.mock('@anthropic-ai/sdk',()=>({default:class{
  messages={create:async(body:{model:string;messages:unknown[]})=>{
    claude.requests.push(structuredClone(body));
    const content=claude.turns.shift();
    if(!content)throw new Error('Claude is unreachable');
    return {id:'msg',type:'message',role:'assistant',model:body.model,content,stop_reason:content.some(b=>b.type==='tool_use')?'tool_use':'end_turn',stop_sequence:null,usage:{input_tokens:1,output_tokens:1}};
  }};
}}));

const env={key:process.env.ANTHROPIC_API_KEY,scripted:process.env.QUERENT_SCRIPTED};
afterEach(()=>{
  if(env.key===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=env.key;
  if(env.scripted===undefined)delete process.env.QUERENT_SCRIPTED;else process.env.QUERENT_SCRIPTED=env.scripted;
});
const scriptedEnv=()=>{delete process.env.ANTHROPIC_API_KEY;delete process.env.QUERENT_SCRIPTED;};

const STOCK='Do you have 1/2 in grade 8 hex bolts in stock?';
const REQUEST='Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels. We\'ll pick up at SLC.';

describe('scripted mode (no API key, or QUERENT_SCRIPTED=1)',()=>{
  it('runs the Dana conversation and stores every turn with its kind and payload',async()=>{
    scriptedEnv();
    const {ask}=await import('./pipeline');
    const {conversation,conversationMessages,history}=await import('./repository/customer');
    const stock=await ask('wasatch','conv-scripted',STOCK,{contactId:'dana'});
    expect(stock).toMatchObject({sql:null,categories:['items_stock'],outcome:'answered',row_count:1,kind:'text',payload:null});
    expect(stock.answer).toContain('64 at SLC, 22 at Ogden and 8 at Provo');
    const clarify=await ask('wasatch','conv-scripted',REQUEST,{contactId:'dana'});
    expect(clarify).toMatchObject({kind:'clarify',outcome:'answered',payload:{question:'Type 1 or Type 27 cut-off wheels?',round:1}});
    const popup=await ask('wasatch','conv-scripted','Type 1',{contactId:'dana'});
    expect(popup).toMatchObject({kind:'item_popup',payload:{fulfillment:'will_call',branch_id:'slc',lines:[{sku:'HCS-12-13-2G8',qty:10},{sku:'CW-45-045-T1',qty:6}]}});

    expect(conversation('wasatch','conv-scripted')).toMatchObject({customer_id:'wasatch',contact_id:'dana'});
    const messages=conversationMessages('wasatch','conv-scripted');
    expect(messages.map(m=>[m.role,m.kind])).toEqual([['customer','text'],['assistant','text'],['customer','text'],['assistant','clarify'],['customer','text'],['assistant','item_popup']]);
    expect(messages.map(m=>m.content)).toEqual([STOCK,stock.answer,REQUEST,clarify.answer,'Type 1',popup.answer]);
    expect(messages[5].payload).toEqual(popup.payload);
    expect(history('wasatch','conv-scripted').map(t=>[t.question,t.outcome,t.categories])).toEqual([[STOCK,'answered',['items_stock']],[REQUEST,'answered',['items_stock']],['Type 1','answered',['items_stock']]]);
  });

  it('is used even with an API key when QUERENT_SCRIPTED=1',async()=>{
    process.env.ANTHROPIC_API_KEY='sk-test-not-used';process.env.QUERENT_SCRIPTED='1';
    const {ask}=await import('./pipeline');
    expect((await ask('wasatch','conv-forced',STOCK)).answer).toContain('HCS-12-13-2G8');
  });

  it('keeps each customer to their own conversations',async()=>{
    scriptedEnv();
    const {ask,ConversationNotFoundError}=await import('./pipeline');
    const {conversationMessages}=await import('./repository/customer');
    await expect(ask('great-basin','conv-q-24817',STOCK)).rejects.toBeInstanceOf(ConversationNotFoundError);
    expect(conversationMessages('wasatch','conv-q-24817')).toHaveLength(5);
  });
});

describe('live mode (API key set, QUERENT_SCRIPTED unset)',()=>{
  // The Anthropic SDK is mocked (above): no test calls the real API.
  it('answers through Claude\'s tool calls, stores the turn and logs its categories and tools',async()=>{
    process.env.ANTHROPIC_API_KEY='sk-test-not-used';delete process.env.QUERENT_SCRIPTED;
    const {ask}=await import('./pipeline');
    const {conversationMessages,history}=await import('./repository/customer');
    claude.turns.push([{type:'text',text:'Hello again.'}]);
    await ask('wasatch','conv-live','Hi',{contactId:'dana'});
    claude.turns.push(
      [{type:'tool_use',id:'toolu_1',name:'get_stock',input:{skus:['HCS-12-13-2G8']}}],
      [{type:'text',text:'Yes. HCS-12-13-2G8 is in stock: 64 at SLC, 22 at Ogden and 8 at Provo.'}],
    );
    const result=await ask('wasatch','conv-live',STOCK);
    expect(result).toMatchObject({sql:null,categories:['items_stock'],outcome:'answered',row_count:1,kind:'text',payload:null,
      answer:'Yes. HCS-12-13-2G8 is in stock: 64 at SLC, 22 at Ogden and 8 at Provo.'});
    expect(claude.requests.at(-2)!.messages.slice(0,3)).toEqual([{role:'user',content:'Hi'},{role:'assistant',content:'Hello again.'},{role:'user',content:STOCK}]);
    expect(history('wasatch','conv-live').map(t=>[t.question,t.outcome,t.categories])).toEqual([['Hi','answered',[]],[STOCK,'answered',['items_stock']]]);
    expect(conversationMessages('wasatch','conv-live').map(m=>m.role)).toEqual(['customer','assistant','customer','assistant']);
  });

  it('logs an error outcome when Claude can\'t be reached',async()=>{
    process.env.ANTHROPIC_API_KEY='sk-test-not-used';delete process.env.QUERENT_SCRIPTED;
    const errors=vi.spyOn(console,'error').mockImplementation(()=>{});
    try{
      const {ask}=await import('./pipeline');
      const {history}=await import('./repository/customer');
      const result=await ask('wasatch','conv-live-down',STOCK);
      expect(result).toMatchObject({outcome:'error',answer:'We couldn’t complete that lookup. Please try again.'});
      expect(history('wasatch','conv-live-down')).toEqual([expect.objectContaining({outcome:'error'})]);
    }finally{errors.mockRestore();}
  });
});

describe('failures',()=>{
  it('answer with an apology and log an error outcome',async()=>{
    scriptedEnv();
    failure.next=true;
    const errors=vi.spyOn(console,'error').mockImplementation(()=>{});
    try{
      const {ask}=await import('./pipeline');
      const {conversationMessages,history}=await import('./repository/customer');
      const result=await ask('wasatch','conv-error',STOCK);
      expect(result).toMatchObject({outcome:'error',kind:'text',payload:null,categories:[],row_count:0});
      expect(result.answer).toBe('We couldn’t complete that lookup. Please try again.');
      expect(history('wasatch','conv-error')).toEqual([expect.objectContaining({outcome:'error'})]);
      expect(conversationMessages('wasatch','conv-error').map(m=>m.content)).toEqual([STOCK,result.answer]);
      expect(errors).toHaveBeenCalledWith('Chat pipeline failed',expect.any(Error));
    }finally{errors.mockRestore();}
  });
});
