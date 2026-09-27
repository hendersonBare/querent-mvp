import {describe,expect,it} from 'vitest';
import {addMessage,appendLog,conversation,conversationMessages,createConversation,history,latestConversation,quoteNotices} from './chat';
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

  it('finds the customer\'s most recently active conversation (task 3.7: where a sent quote goes when its own chat is gone)',()=>{
    expect(latestConversation('uinta-facility')).toBeUndefined();
    createConversation({id:'conv-latest-a',customerId:'uinta-facility',at:'2026-09-20T09:00:00.000Z'});
    createConversation({id:'conv-latest-b',customerId:'uinta-facility',at:'2026-09-21T09:00:00.000Z'});
    // No messages yet: the newest start wins.
    expect(latestConversation('uinta-facility')?.id).toBe('conv-latest-b');
    // A newer message in the older conversation makes it the latest.
    addMessage('uinta-facility','conv-latest-a',{role:'customer',content:'Still there?',at:'2026-09-22T09:00:00.000Z'});
    expect(latestConversation('uinta-facility')).toEqual({id:'conv-latest-a',customer_id:'uinta-facility',contact_id:null,started_at:'2026-09-20T09:00:00.000Z'});
    // Only the customer's own.
    expect(latestConversation('wasatch')?.customer_id).toBe('wasatch');
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

  it('returns each turn with its reply\'s kind and payload, matched in order by the reply\'s text (task 2.2)',()=>{
    createConversation({id:'conv-kinds',customerId:'wasatch'});
    const log=(question:string,answer:string,at:string)=>appendLog({customerId:'wasatch',conversationId:'conv-kinds',question,categories:['items_stock'],handled:['items_stock'],toolCalls:[],rowCount:1,latency:1,outcome:'answered',answer,at});
    const say=(role:'customer'|'assistant',content:string,at:string,kind='text',payload:unknown=null)=>addMessage('wasatch','conv-kinds',{role,content,kind,payload,at});
    const clarify={open:[{requested_text:'wheels',round:1}],cart:{lines:[]},dropped:[],rep:null};
    say('customer','Hi','2026-09-24T10:00:00.000Z');say('assistant','Hello.','2026-09-24T10:00:01.000Z');log('Hi','Hello.','2026-09-24T10:00:01.000Z');
    say('customer','Wheels','2026-09-24T10:01:00.000Z');say('assistant','Which?','2026-09-24T10:01:01.000Z','clarify',clarify);log('Wheels','Which?','2026-09-24T10:01:01.000Z');
    // A reply without a log entry (a system notice) is skipped, and a log entry without a message gets no kind.
    say('assistant','Quote requested.','2026-09-24T10:01:30.000Z','quote_requested',{quote_id:'q-1'});
    log('Which?','Which?','2026-09-24T10:02:00.000Z');
    expect(history('wasatch','conv-kinds').map(t=>[t.question,t.kind,t.payload])).toEqual([['Hi',undefined,undefined],['Wheels','clarify',clarify],['Which?',undefined,undefined]]);
    expect(history('great-basin','conv-kinds')).toEqual([]);
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

describe('quote notices (task 5.1): the quote_ready messages Approve & send posts, for the customer\'s chat',()=>{
  const payload=(quoteId:string,quoteNumber:string,revision=1,extra:Record<string,unknown>={})=>({quote_id:quoteId,quote_number:quoteNumber,revision,total:1122.4,valid_until:'2026-10-07',
    headline:`Quote ${quoteNumber} is ready: $1,122.40, valid until Oct 7`,attach_pdf:true,pdf_url:`/api/quotes/${quoteId}/pdf?variant=customer&rev=${revision}`,...extra});
  const ready=(customerId:string,conversationId:string,id:string,content:string,body:unknown,at:string)=>
    addMessage(customerId,conversationId,{id,role:'system',kind:'quote_ready',content,payload:body,at});

  it('returns the customer\'s quote_ready messages oldest first, in every conversation or in one, with the rep\'s text as stored',()=>{
    createConversation({id:'conv-notice-a',customerId:'wasatch',contactId:'dana',at:'2026-09-24T08:00:00.000Z'});
    createConversation({id:'conv-notice-b',customerId:'wasatch',contactId:'dana',at:'2026-09-24T08:00:00.000Z'});
    ready('wasatch','conv-notice-b','n-2','Second <b>one</b>\n**bold?**',payload('q-24816','Q-24816',2),'2026-09-24T11:00:00.000Z');
    ready('wasatch','conv-notice-a','n-1','',payload('q-24817','Q-24817'),'2026-09-24T10:00:00.000Z');
    addMessage('wasatch','conv-notice-a',{role:'assistant',content:'Not a notice',at:'2026-09-24T10:30:00.000Z'});
    const all=quoteNotices('wasatch').filter(n=>n.id.startsWith('n-'));
    expect(all.map(n=>n.id)).toEqual(['n-1','n-2']);
    expect(all[0]).toEqual({id:'n-1',conversation_id:'conv-notice-a',created_at:'2026-09-24T10:00:00.000Z',text:'',...payload('q-24817','Q-24817')});
    expect(all[1].text).toBe('Second <b>one</b>\n**bold?**');
    expect(quoteNotices('wasatch','conv-notice-b').map(n=>n.id)).toEqual(['n-2']);
    expect(quoteNotices('wasatch','no-such-conversation')).toEqual([]);
  });

  it('rebuilds the payload field by field, and skips a malformed one',()=>{
    createConversation({id:'conv-notice-c',customerId:'wasatch',at:'2026-09-24T08:00:00.000Z'});
    ready('wasatch','conv-notice-c','n-leaky','Hi',payload('q-24816','Q-24816',1,{unit_cost:14.6,margin:0.3,internal_notes:'thin'}),'2026-09-24T12:00:00.000Z');
    ready('wasatch','conv-notice-c','n-bad','Hi',{quote_id:'q-24816',quote_number:'Q-24816',revision:'one'},'2026-09-24T12:01:00.000Z');
    ready('wasatch','conv-notice-c','n-null','Hi',null,'2026-09-24T12:02:00.000Z');
    const notices=quoteNotices('wasatch','conv-notice-c');
    expect(notices.map(n=>n.id)).toEqual(['n-leaky']);
    expect(Object.keys(notices[0]).sort()).toEqual(['attach_pdf','conversation_id','created_at','headline','id','pdf_url','quote_id','quote_number','revision','text','total','valid_until']);
  });

  it('only ever returns the customer\'s own messages about the customer\'s own quotes',async()=>{
    const {createQuote}=await import('./quotes');
    const theirs=createQuote({customerId:'great-basin',fulfillment:'will_call',branchId:'slc',lines:[]});
    createConversation({id:'conv-notice-gb',customerId:'great-basin',at:'2026-09-24T08:00:00.000Z'});
    ready('great-basin','conv-notice-gb','n-gb','Theirs',payload(theirs.id,theirs.quote_number),'2026-09-24T13:00:00.000Z');
    createConversation({id:'conv-notice-d',customerId:'wasatch',at:'2026-09-24T08:00:00.000Z'});
    // A notice in Wasatch's chat naming another customer's quote, or one that doesn't exist, is never shown.
    ready('wasatch','conv-notice-d','n-foreign','Tampered',payload(theirs.id,theirs.quote_number),'2026-09-24T13:01:00.000Z');
    ready('wasatch','conv-notice-d','n-unknown','Tampered',payload('q-nope','Q-00000'),'2026-09-24T13:02:00.000Z');
    expect(quoteNotices('wasatch').map(n=>n.id)).not.toContain('n-gb');
    expect(quoteNotices('wasatch','conv-notice-d')).toEqual([]);
    expect(quoteNotices('wasatch','conv-notice-gb')).toEqual([]);
    expect(quoteNotices('great-basin').map(n=>n.id)).toEqual(['n-gb']);
  });

  it('is not part of history(): notices have no query-log row',()=>{
    expect(history('wasatch','conv-notice-a')).toEqual([]);
  });
});
