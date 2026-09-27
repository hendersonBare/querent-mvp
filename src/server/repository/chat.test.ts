import {describe,expect,it} from 'vitest';
import {addMessage,appendLog,conversation,conversationMessages,createConversation,history} from './chat';
import {useSeededDatabase} from './test-db';

useSeededDatabase();

describe('conversations and messages',()=>{
  it('reads the sample conversation in order, with parsed payloads',()=>{
    const messages=conversationMessages('wasatch','conv-q-24817');
    expect(messages.map(m=>[m.role,m.kind])).toEqual([['customer','text'],['assistant','text'],['customer','text'],['assistant','item_popup'],['assistant','quote_requested']]);
    expect(messages[0]).toMatchObject({id:'conv-q-24817-1',conversation_id:'conv-q-24817',payload:null,created_at:'2026-09-23T16:12:00.000Z'});
    expect(messages[3].payload).toEqual({fulfillment:'will_call',branch_id:'slc',lines:[{sku:'HCS-12-13-2G8',qty:10},{sku:'CW-45-045-T1',qty:6},{sku:'GLV-N8-L-1000',qty:4},{sku:'RS-2-27-JH',qty:12}]});
    expect(messages[4].payload).toEqual({quote_id:'q-24817'});
  });

  it('never returns another customer\'s conversation',()=>{
    expect(conversation('wasatch','conv-q-24817')).toEqual({id:'conv-q-24817',customer_id:'wasatch',contact_id:'dana',started_at:'2026-09-23T16:12:00.000Z'});
    expect(conversation('great-basin','conv-q-24817')).toBeUndefined();
    expect(conversationMessages('great-basin','conv-q-24817')).toEqual([]);
  });

  it('creates a conversation and appends messages in order',()=>{
    const created=createConversation({customerId:'wasatch',contactId:'dana',at:'2026-09-24T09:00:00.000Z'});
    expect(created).toMatchObject({customer_id:'wasatch',contact_id:'dana',started_at:'2026-09-24T09:00:00.000Z'});
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(createConversation({id:'conv-test',customerId:'great-basin'})).toMatchObject({id:'conv-test',contact_id:null});
    const first=addMessage('wasatch',created.id,{role:'customer',content:'Need straps',at:'2026-09-24T09:00:01.000Z'})!;
    expect(first).toMatchObject({conversation_id:created.id,role:'customer',kind:'text',content:'Need straps',payload:null});
    addMessage('wasatch',created.id,{id:'m-2',role:'assistant',kind:'item_popup',content:'Here is your list.',payload:{lines:[{sku:'RS-2-27-JH',qty:12}]},at:'2026-09-24T09:00:02.000Z'});
    expect(conversationMessages('wasatch',created.id).map(m=>[m.id,m.payload])).toEqual([[first.id,null],['m-2',{lines:[{sku:'RS-2-27-JH',qty:12}]}]]);
  });

  it('writes nothing to a conversation that isn\'t the customer\'s',()=>{
    expect(addMessage('great-basin','conv-q-24817',{role:'customer',content:'Not mine'})).toBeUndefined();
    expect(addMessage('wasatch','no-such-conversation',{role:'customer',content:'x'})).toBeUndefined();
    expect(conversationMessages('wasatch','conv-q-24817').map(m=>m.content)).not.toContain('Not mine');
  });
});

describe('query log',()=>{
  it('returns a seeded conversation\'s questions oldest first',()=>{
    const turns=history('wasatch','history-1');
    expect(turns.map(t=>t.question)).toEqual(['Has our last order shipped?','What did we pay for the Type 1 cut-off wheels last time?','Do you have 1/2-13 grade 8 hex nuts at Ogden?']);
    expect(turns[0]).toMatchObject({categories:['orders_quotes'],outcome:'answered',sql:null});
  });

  it('logs a chat question and returns it in that conversation\'s history',()=>{
    createConversation({id:'conv-log',customerId:'wasatch'});
    expect(appendLog({customerId:'wasatch',conversationId:'conv-log',question:'Q?',categories:['items_stock'],handled:['items_stock'],toolCalls:['search_items'],rowCount:1,latency:12,outcome:'answered',answer:'A.',at:'2026-09-24T10:00:00.000Z'})).toBe(true);
    expect(history('wasatch','conv-log')).toEqual([{id:expect.any(String),question:'Q?',answer:'A.',categories:['items_stock'],outcome:'answered',row_count:1,timestamp:'2026-09-24T10:00:00.000Z',sql:null}]);
    expect(history('great-basin','conv-log')).toEqual([]);
  });

  it('writes nothing to a conversation that isn\'t the customer\'s (task 0.3 carry-forward)',()=>{
    const entry={question:'Not mine',categories:[],handled:[],toolCalls:[],rowCount:0,latency:1,outcome:'answered',answer:'x'};
    // conv-test is great-basin's (created above); wasatch may not log against it, nor against a conversation that doesn't exist.
    expect(appendLog({...entry,customerId:'wasatch',conversationId:'conv-test'})).toBe(false);
    expect(appendLog({...entry,customerId:'wasatch',conversationId:'no-such-conversation'})).toBe(false);
    expect(history('great-basin','conv-test')).toEqual([]);
    expect(history('wasatch','conv-test')).toEqual([]);
  });
});
