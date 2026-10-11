import {NextRequest} from 'next/server';
import {expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

const get=async(persona?:string,query='')=>{
  const {GET}=await import('./route');
  return GET(new NextRequest(`http://127.0.0.1/api/rep/analytics${query}`,{headers:persona?{cookie:`querent-persona=${persona}`}:{}}));
};

// Brandi (the supplier persona) is the manager: her All customers covers the whole organization
// (task U1). Wasatch, her own customer, carries the seed's history, so the numbers are read for it.
it("returns the analytics for every customer the rep may read, never cached",async()=>{
  const response=await get('supplier');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toMatch(/no-store/);
  expect((await response.json()).scope).toEqual({customer:null,customer_ids:['canyon-ridge','great-basin','uinta-facility','utah-valley-electric','wasatch','weber-basin']});
  expect((await (await get('mara')).json()).scope).toEqual({customer:null,customer_ids:['canyon-ridge']});
  const body=await (await get('supplier','?customer=wasatch')).json();
  expect(body.scope).toMatchObject({customer:{id:'wasatch'},customer_ids:['wasatch']});
  expect(body.win_rate).toMatchObject({won:17,lost:7});
  expect(body.hours_saved).toMatchObject({hours:9,quotes_sent:27}); // 24 history quotes and the 3 aging ones (task A2)
  expect(body.weekly).toHaveLength(26);
  expect(body.queries.total_queries).toBe(40);
});

it('follows the page\'s own ?customer=: a placeholder customer reads zero, another rep\'s customer is ignored for a rep, an unknown one is All customers',async()=>{
  const greatBasin=await (await get('supplier','?customer=great-basin')).json();
  expect(greatBasin.scope).toMatchObject({customer:{id:'great-basin'},customer_ids:['great-basin']});
  expect(greatBasin.hours_saved.quotes_sent).toBe(0);
  expect(greatBasin.queries.total_queries).toBe(0);
  const canyon=await (await get('eli','?customer=canyon-ridge')).json();
  expect(canyon.scope).toEqual({customer:null,customer_ids:['utah-valley-electric','weber-basin']});
  const unknown=await (await get('supplier','?customer=nobody')).json();
  expect(unknown.scope.customer).toBeNull();
  const all=await (await get('mara','?customer=all')).json();
  expect(all.scope.customer_ids).toEqual(['canyon-ridge']);
});

it('asks for a workspace without a session, and refuses the customer persona',async()=>{
  expect((await get()).status).toBe(401);
  expect((await get('nobody')).status).toBe(401);
  const customer=await get('customer','?customer=wasatch');
  expect(customer.status).toBe(403);
  expect(customer.headers.get('cache-control')).toMatch(/no-store/);
  expect(await customer.json()).toEqual({detail:'Supplier access required.'});
});
