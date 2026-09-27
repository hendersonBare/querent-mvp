import {NextRequest} from 'next/server';
import {expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// The quote detail's read routes and Add item (task 3.3): GET /api/rep/quotes/<id>,
// GET /api/rep/quotes/<id>/items?q=, POST /api/rep/quotes/<id>/lines. Rep-only, own quotes only.
useSeededDatabase();

const request=(path:string,{method='GET',persona='supplier',body}:{method?:string;persona?:string|null;body?:unknown}={})=>
  new NextRequest(`http://127.0.0.1${path}`,{method,headers:{'content-type':'application/json',...(persona?{cookie:`querent-persona=${persona}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
const params=(id:string)=>({params:Promise.resolve({id})});

const detail=async(id:string,persona:string|null='supplier')=>(await import('./route')).GET(request(`/api/rep/quotes/${id}`,{persona}),params(id));
const items=async(id:string,q:string,persona:string|null='supplier')=>(await import('./items/route')).GET(request(`/api/rep/quotes/${id}/items?q=${encodeURIComponent(q)}`,{persona}),params(id));
const add=async(id:string,body:unknown,persona:string|null='supplier')=>(await import('./lines/route')).POST(request(`/api/rep/quotes/${id}/lines`,{method:'POST',persona,body}),params(id));

it('serves the detail to the rep only: 401, 403, 404 for another rep’s quote',async()=>{
  expect((await detail('Q-24817',null)).status).toBe(401);
  expect((await detail('Q-24817','customer')).status).toBe(403);
  expect((await detail('Q-99999')).status).toBe(404);
  const response=await detail('Q-24817');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toMatch(/no-store/);
  const body=await response.json();
  expect(body).toMatchObject({editable:true,quote:{quote_number:'Q-24817',status:'ready_for_review'},send_check:{subtotal:1122.4}});
  expect(body.lines[0].pricing.sources.cost).toBe(21.4);
  // Reading the detail doesn't mark it read: the page does that on screen (POST .../read).
  const {quote}=await import('@/server/repository');
  expect(quote('q-24817')!.unread_for_rep).toBe(true);
});

it('searches items for Add item',async()=>{
  expect((await items('Q-24817','strap','customer')).status).toBe(403);
  const response=await items('Q-24817','flap disc 60');
  expect(response.status).toBe(200);
  const {items:found}=await response.json();
  expect(found.map((i:{sku:string})=>i.sku)).toEqual(['FD-45-60Z']);
  expect(found[0]).toMatchObject({branch_code:'SLC',on_quote:false});
  expect((await items('Q-99999','strap')).status).toBe(404);
});

it('adds an item (201) and refuses bad input and customers',async()=>{
  expect((await add('Q-24817',{itemId:'FD-45-60Z'},'customer')).status).toBe(403);
  expect((await add('Q-24817',{itemId:'FD-45-60Z',qty:-2})).status).toBe(400);
  expect((await add('Q-24817',{itemId:'NOPE'})).status).toBe(400);
  const response=await add('Q-24817',{itemId:'FD-45-60Z',qty:4});
  expect(response.status).toBe(201);
  const body=await response.json();
  expect(body.line_id).toBe('q-24817-5');
  expect(body.detail.lines.at(-1)).toMatchObject({sku:'FD-45-60Z',qty:4,added_by:'rep'});
  expect((await add('Q-24816',{itemId:'FD-45-60Z'})).status).toBe(409);
});
