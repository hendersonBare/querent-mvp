import {NextRequest} from 'next/server';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

// The customer API through the real route (task 2.1): served from ./customer.ts on the
// customer-safe repository, scoped to the signed-in customer. Chat runs scripted here.

const env={scripted:process.env.QUERENT_SCRIPTED};
beforeEach(()=>{process.env.QUERENT_SCRIPTED='1';});
afterEach(()=>{if(env.scripted===undefined)delete process.env.QUERENT_SCRIPTED;else process.env.QUERENT_SCRIPTED=env.scripted;});

async function call(method:'GET'|'POST',path:string,{persona='customer',body}:{persona?:string;body?:unknown}={}){
  const route=await import('./route');
  const request=new NextRequest(`http://127.0.0.1/api/query/${path}`,{method,headers:{'Content-Type':'application/json',cookie:`querent-persona=${persona}`},body:body===undefined?undefined:JSON.stringify(body)});
  const response=await route[method](request,{params:Promise.resolve({path:path.split('/')})});
  return {status:response.status,json:await response.json()};
}

it('gives Dana her enabled categories with Brandi as the contact',async()=>{
  const {status,json}=await call('GET','customer/panel');
  expect(status).toBe(200);
  expect(json.map((r:{category:string})=>r.category)).toEqual(['items_stock','pricing','orders_quotes','account']);
  expect(json[0]).toMatchObject({enabled:true,rep_name:'Brandi Gallegos'});
});

it('answers a chat question and serves it back in that conversation\'s history',async()=>{
  const asked=await call('POST','customer/chat',{body:{question:'Do you have 1/2 in grade 8 hex bolts in stock?',conversation_id:'conv-route'}});
  expect(asked.status).toBe(200);
  expect(asked.json).toMatchObject({categories:['items_stock'],outcome:'answered',kind:'text'});
  expect(asked.json.answer).toContain('64 at SLC, 22 at Ogden and 8 at Provo');
  const history=await call('GET','customer/history/conv-route');
  expect(history.json).toEqual([expect.objectContaining({question:'Do you have 1/2 in grade 8 hex bolts in stock?',categories:['items_stock']})]);
});

it('rejects a bad question, and another customer\'s conversation',async()=>{
  expect((await call('POST','customer/chat',{body:{question:'  ',conversation_id:'conv-route'}})).status).toBe(422);
  expect((await call('POST','customer/chat',{body:{question:'Hi',conversation_id:'x'.repeat(101)}})).status).toBe(422);
  const {createConversation,history}=await import('@/server/repository');
  createConversation({id:'conv-great-basin',customerId:'great-basin'});
  const theirs=await call('POST','customer/chat',{body:{question:'Hi',conversation_id:'conv-great-basin'}});
  expect(theirs).toEqual({status:404,json:{detail:'Conversation not found.'}});
  expect(history('great-basin','conv-great-basin')).toEqual([]);
  expect((await call('GET','customer/history/conv-great-basin')).json).toEqual([]);
});

it('serves the "quote is ready" messages for the chat on screen (task 5.1), never another customer\'s',async()=>{
  const {createConversation,createQuote}=await import('@/server/repository');
  const {sendQuote}=await import('@/server/quotes/service');
  const asked=await call('POST','customer/chat',{body:{question:'Hi',conversation_id:'conv-notices-route'}});
  expect(asked.status).toBe(200);
  const mine=createQuote({customerId:'wasatch',contactId:'dana',conversationId:'conv-notices-route',fulfillment:'will_call',branchId:'slc',at:'2026-09-23T16:00:00.000Z',
    lines:[{itemId:'HCS-12-13-2G8',qty:10,unitPrice:31.5}]});
  await sendQuote(mine.id,{repId:'brandi',message:'<script>alert(1)</script> **Hi**',now:'2026-09-23T17:00:00.000Z'});
  createConversation({id:'conv-gb-route',customerId:'great-basin',at:'2026-09-23T16:00:00.000Z'});
  const theirs=createQuote({customerId:'great-basin',conversationId:'conv-gb-route',fulfillment:'will_call',branchId:'slc',at:'2026-09-23T16:00:00.000Z',lines:[{itemId:'HCS-12-13-2G8',qty:1,unitPrice:40}]});
  await sendQuote(theirs.id,{repId:'brandi',message:'Not for Dana',now:'2026-09-23T17:00:00.000Z'});

  const notices=await call('GET','customer/notices/conv-notices-route');
  expect(notices.status).toBe(200);
  const own=notices.json.filter((n:{conversation_id:string})=>n.conversation_id==='conv-notices-route');
  expect(own).toEqual([expect.objectContaining({quote_id:mine.id,revision:1,text:'<script>alert(1)</script> **Hi**',headline:expect.stringMatching(new RegExp(`^Quote ${mine.quote_number} is ready: `))})]);
  // The history still pairs Dana's question with its reply; the notice is not a turn.
  expect((await call('GET','customer/history/conv-notices-route')).json.map((t:{question:string})=>t.question)).toEqual(['Hi']);
  // Tampered: Great Basin's conversation id gets Dana nothing of theirs.
  const tampered=await call('GET','customer/notices/conv-gb-route');
  expect(tampered.status).toBe(200);
  expect(JSON.stringify(tampered.json)).not.toContain('Not for Dana');
  expect(tampered.json.some((n:{quote_id:string})=>n.quote_id===theirs.id)).toBe(false);
  expect((await call('GET','customer/notices/conv-notices-route',{persona:'supplier'})).status).toBe(404);
  expect((await call('GET','customer/notices/conv-notices-route',{persona:'nobody'})).status).toBe(401);
});

it('keeps customers out of supplier routes, and suppliers out of customer routes',async()=>{
  expect((await call('GET','supplier/customers')).status).toBe(403);
  expect((await call('GET','customer/nothing-here')).status).toBe(403);
  expect((await call('GET','customer/panel',{persona:'supplier'})).status).toBe(404);
  expect((await call('GET','customer/panel',{persona:'nobody'})).status).toBe(401);
});
