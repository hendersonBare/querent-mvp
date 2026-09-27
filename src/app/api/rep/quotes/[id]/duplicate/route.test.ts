import {NextRequest} from 'next/server';
import {expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// POST /api/rep/quotes/<id or number>/duplicate (task 3.5): the ⋯ menu's Duplicate quote.
// Rep-only (401 / 403 like 3.2's routes), the rep's own quote only (404), and one copy per
// Idempotency-Key, so a double click makes one duplicate.
useSeededDatabase();

const post=async(id:string,{persona='supplier',key}:{persona?:string|null;key?:string}={})=>{
  const {POST}=await import('./route');
  const headers:Record<string,string>={};
  if(persona)headers.cookie=`querent-persona=${persona}`;
  if(key!==undefined)headers['idempotency-key']=key;
  return POST(new NextRequest(`http://127.0.0.1/api/rep/quotes/${id}/duplicate`,{method:'POST',headers}),{params:Promise.resolve({id})});
};
const count=async()=>(await import('@/server/repository')).quotes({}).length;

it('refuses visitors (401) and customers (403), creating nothing',async()=>{
  const before=await count();
  expect((await post('Q-24817',{persona:null})).status).toBe(401);
  const customer=await post('Q-24817',{persona:'customer'});
  expect(customer.status).toBe(403);
  expect(await customer.json()).toEqual({detail:'Supplier access required.'});
  expect(await count()).toBe(before);
});

it('creates a ready_for_review copy of the rep’s quote (201), never cached',async()=>{
  const {quote}=await import('@/server/repository');
  const response=await post('Q-24817',{key:'route-key-1'});
  expect(response.status).toBe(201);
  expect(response.headers.get('cache-control')).toMatch(/no-store/);
  const body=await response.json();
  expect(body).toMatchObject({quote_number:expect.stringMatching(/^Q-\d+$/),duplicated_from:{id:'q-24817',quote_number:'Q-24817'},replayed:false});
  expect(quote(body.id)).toMatchObject({status:'ready_for_review',duplicated_from:'q-24817',unread_for_rep:false});
});

it('answers a repeated Idempotency-Key with the same copy, and makes no second one',async()=>{
  const before=await count();
  const first=await (await post('Q-24816',{key:'double-click'})).json();
  const again=await post('Q-24816',{key:'double-click'});
  expect(again.status).toBe(201);
  expect(await again.json()).toEqual({...first,replayed:true});
  expect(await count()).toBe(before+1);
});

it('refuses a malformed Idempotency-Key (400) before copying',async()=>{
  const before=await count();
  const response=await post('Q-24817',{key:'not a key'});
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({code:'invalid_input'});
  expect(await count()).toBe(before);
});

it('answers 404 for another rep’s quote and an unknown one',async()=>{
  const {createQuote}=await import('@/server/repository');
  const other=createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'GLV-N8-L-1000',qty:1,unitPrice:82}]});
  const before=await count();
  const response=await post(other.quote_number);
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({detail:`No quote ${other.quote_number}.`,code:'not_found'});
  expect((await post('Q-99999')).status).toBe(404);
  expect(await count()).toBe(before);
});

it('answers 409 when the customer is now another rep’s',async()=>{
  const {setAssignedRep}=await import('@/server/repository');
  setAssignedRep('wasatch','mara');
  try{
    const response=await post('Q-24817');
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({code:'conflict'});
  }finally{setAssignedRep('wasatch','brandi');}
});
