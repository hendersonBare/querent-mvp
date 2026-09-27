import {NextRequest} from 'next/server';
import {expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// POST /api/rep/quotes/<id or number>/read (task 3.2): opening a quote clears its unread flag.
useSeededDatabase();

const post=async(id:string,persona:string|null='supplier')=>{
  const {POST}=await import('./route');
  return POST(new NextRequest(`http://127.0.0.1/api/rep/quotes/${id}/read`,{method:'POST',headers:persona?{cookie:`querent-persona=${persona}`}:{}}),{params:Promise.resolve({id})});
};

it("refuses customers and visitors before touching the quote",async()=>{
  const {quote}=await import('@/server/repository');
  expect((await post('Q-24817',null)).status).toBe(401);
  const customer=await post('Q-24817','customer');
  expect(customer.status).toBe(403);
  expect(await customer.json()).toEqual({detail:'Supplier access required.'});
  expect(quote('q-24817')!.unread_for_rep).toBe(true);
});

it("marks the rep's quote read, by number or id, and the badge drops",async()=>{
  const {quote}=await import('@/server/repository');
  const {repBadges}=await import('@/server/rep/badges');
  expect(repBadges('brandi').quotes).toBe(1);
  const response=await post('Q-24817');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toMatch(/no-store/);
  expect(await response.json()).toEqual({id:'q-24817',quote_number:'Q-24817',unread:false});
  expect(quote('q-24817')!.unread_for_rep).toBe(false);
  expect(repBadges('brandi').quotes).toBe(0);
  expect((await post('q-24817')).status).toBe(200);
});

it("answers 404 for an unknown quote and for another rep's",async()=>{
  const {createQuote,quote}=await import('@/server/repository');
  const other=createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'GLV-N8-L-1000',qty:1,unitPrice:82}]});
  const response=await post(other.quote_number);
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({detail:`No quote ${other.quote_number}.`});
  expect(quote(other.id)!.unread_for_rep).toBe(true);
  expect((await post('Q-99999')).status).toBe(404);
});
