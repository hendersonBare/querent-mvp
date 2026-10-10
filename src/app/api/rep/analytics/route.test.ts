import {NextRequest} from 'next/server';
import {expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

const get=async(persona?:string,query='')=>{
  const {GET}=await import('./route');
  return GET(new NextRequest(`http://127.0.0.1/api/rep/analytics${query}`,{headers:persona?{cookie:`querent-persona=${persona}`}:{}}));
};

it("returns the signed-in rep's analytics for All customers, never cached",async()=>{
  const response=await get('supplier');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toMatch(/no-store/);
  const body=await response.json();
  expect(body.scope).toEqual({customer:null,customer_ids:['great-basin','wasatch'],other_rep:false});
  expect(body.win_rate).toMatchObject({won:17,lost:7});
  expect(body.hours_saved).toMatchObject({hours:9,quotes_sent:27}); // 24 history quotes and the 3 aging ones (task A2)
  expect(body.weekly).toHaveLength(26);
  expect(body.queries.total_queries).toBe(40);
});

it('follows the picker: a placeholder customer reads zero, another rep\'s customer is flagged, an unknown one is All customers',async()=>{
  const greatBasin=await (await get('supplier','?customer=great-basin')).json();
  expect(greatBasin.scope).toMatchObject({customer:{id:'great-basin'},customer_ids:['great-basin'],other_rep:false});
  expect(greatBasin.hours_saved.quotes_sent).toBe(0);
  expect(greatBasin.queries.total_queries).toBe(0);
  const canyon=await (await get('supplier','?customer=canyon-ridge')).json();
  expect(canyon.scope).toMatchObject({customer:{id:'canyon-ridge'},customer_ids:[],other_rep:true});
  const unknown=await (await get('supplier','?customer=nobody')).json();
  expect(unknown.scope.customer).toBeNull();
  const all=await (await get('supplier','?customer=all')).json();
  expect(all.scope.customer_ids).toEqual(['great-basin','wasatch']);
});

it('asks for a workspace without a session, and refuses the customer persona',async()=>{
  expect((await get()).status).toBe(401);
  expect((await get('nobody')).status).toBe(401);
  const customer=await get('customer','?customer=wasatch');
  expect(customer.status).toBe(403);
  expect(customer.headers.get('cache-control')).toMatch(/no-store/);
  expect(await customer.json()).toEqual({detail:'Supplier access required.'});
});
