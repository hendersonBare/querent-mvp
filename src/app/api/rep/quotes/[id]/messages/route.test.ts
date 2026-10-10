import {NextRequest} from 'next/server';
import {expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// GET /api/rep/quotes/<id or number>/messages?before=&limit= (B1, spec §5, §9): the quote's whole
// chat for the "View full chat" drawer. The owning rep only (a manager after D2): no session 401, a
// customer 403, another rep's quote 404 like an unknown one. Only id, role, kind, content and
// created_at leave the server: never a payload.
useSeededDatabase();

const request=(path:string,persona:string|null='supplier')=>
  new NextRequest(`http://127.0.0.1${path}`,{headers:persona?{cookie:`querent-persona=${persona}`}:{}});
const messages=async(id:string,query='',persona:string|null='supplier')=>
  (await import('./route')).GET(request(`/api/rep/quotes/${id}/messages${query}`,persona),{params:Promise.resolve({id})});

/** Every key anywhere in a JSON value. */
const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys)
  :value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];

it('answers 401 without a session, 403 for a customer, 404 for an unknown quote or another rep’s',async()=>{
  expect((await messages('Q-24817','',null)).status).toBe(401);
  expect((await messages('Q-24817','','customer')).status).toBe(403);
  expect((await messages('Q-99999')).status).toBe(404);
  const {addMessage,createConversation,createQuote}=await import('@/server/repository');
  createConversation({id:'conv-canyon',customerId:'canyon-ridge',at:'2026-09-23T10:00:00.000Z'});
  addMessage('canyon-ridge','conv-canyon',{role:'customer',content:'Mara’s customer',at:'2026-09-23T10:00:01.000Z'});
  const theirs=createQuote({customerId:'canyon-ridge',conversationId:'conv-canyon',fulfillment:'will_call',branchId:'slc',lines:[]});
  expect(theirs.rep_id).not.toBe('brandi');
  const refused=await messages(theirs.quote_number);
  expect(refused.status).toBe(404);
  expect(JSON.stringify(await refused.json())).not.toMatch(/Mara’s customer/);
  expect((await messages(theirs.id)).status).toBe(404);
});

it('serves the owner the chat by number or id, oldest first, with the total and no payloads',async()=>{
  const {addMessage}=await import('@/server/repository');
  // A notice whose payload carries cost: the payload never leaves the server.
  addMessage('wasatch','conv-q-24817',{role:'system',kind:'quote_ready',content:'Here is your quote.',payload:{quote_id:'q-24817',unit_cost:14.6,margin:0.31},at:'2026-09-23T17:00:00.000Z'});
  const response=await messages('Q-24817');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toMatch(/no-store/);
  const body=await response.json();
  expect(body.total).toBe(6);
  expect(body.next_before).toBeNull();
  expect(body.messages.map((m:{role:string;kind:string})=>`${m.role}:${m.kind}`)).toEqual(['customer:text','assistant:text','customer:text','assistant:item_popup','assistant:quote_requested','system:quote_ready']);
  expect(body.messages[0]).toEqual({id:'conv-q-24817-1',role:'customer',kind:'text',content:expect.stringContaining('grade 8 hex bolts'),created_at:'2026-09-23T16:12:00.000Z'});
  expect(new Set(keys(body))).toEqual(new Set(['total','messages','next_before','id','role','kind','content','created_at']));
  expect(JSON.stringify(body)).not.toMatch(/cost|margin|payload|14\.6/i);
  expect((await (await messages('q-24817')).json()).total).toBe(6);
});

it('pages with before and limit, and refuses a bad limit',async()=>{
  const first=await (await messages('Q-24817','?limit=2')).json();
  expect(first.messages.map((m:{id:string})=>m.id)).toEqual(['conv-q-24817-5',expect.any(String)]);
  expect(first.total).toBe(6);
  const second=await (await messages('Q-24817',`?limit=2&before=${encodeURIComponent(first.next_before)}`)).json();
  expect(second.messages.map((m:{id:string})=>m.id)).toEqual(['conv-q-24817-3','conv-q-24817-4']);
  expect(second.next_before).toBe('conv-q-24817-3');
  const last=await (await messages('Q-24817',`?before=${second.next_before}`)).json();
  expect(last).toMatchObject({total:6,next_before:null});
  expect(last.messages.map((m:{id:string})=>m.id)).toEqual(['conv-q-24817-1','conv-q-24817-2']);
  for(const bad of ['0','51','-1','two','2.5'])expect((await messages('Q-24817',`?limit=${bad}`)).status).toBe(400);
});

it('answers total 0 for a quote with no conversation',async()=>{
  const {createQuote}=await import('@/server/repository');
  const mine=createQuote({customerId:'wasatch',fulfillment:'will_call',branchId:'slc',lines:[]});
  expect(mine.conversation_id).toBeNull();
  const response=await messages(mine.quote_number);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({total:0,messages:[],next_before:null});
});
