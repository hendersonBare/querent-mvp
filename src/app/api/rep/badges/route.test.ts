import {NextRequest} from 'next/server';
import {expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

const get=async(persona?:string)=>{
  const {GET}=await import('./route');
  return GET(new NextRequest('http://127.0.0.1/api/rep/badges',{headers:persona?{cookie:`querent-persona=${persona}`}:{}}));
};

it("returns the signed-in rep's badge counts: the seeded sample quote unread, and her red quotes (task A2: the sample and Q-24790)",async()=>{
  const response=await get('supplier');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toMatch(/no-store/);
  expect(await response.json()).toEqual({quotes:1,attention:2});
});

it('asks for a workspace without a session, and refuses the customer persona',async()=>{
  expect((await get()).status).toBe(401);
  expect((await get('nobody')).status).toBe(401);
  expect((await get('constructor')).status).toBe(401);
  const customer=await get('customer');
  expect(customer.status).toBe(403);
  expect(await customer.json()).toEqual({detail:'Supplier access required.'});
});
