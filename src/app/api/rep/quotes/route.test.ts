import {NextRequest} from 'next/server';
import {expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// GET /api/rep/quotes (task 3.2): the signed-in rep's Quotes list. Rep-only: it carries margin.
useSeededDatabase();

const get=async(query='',persona:string|null='supplier')=>{
  const {GET}=await import('./route');
  return GET(new NextRequest(`http://127.0.0.1/api/rep/quotes${query}`,{headers:persona?{cookie:`querent-persona=${persona}`}:{}}));
};

it("returns the signed-in rep's quotes with counts, never cached",async()=>{
  const response=await get();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toMatch(/no-store/);
  const list=await response.json();
  expect(list).toMatchObject({customer:null,other_rep:false,status:null,unread:1});
  expect(list.counts).toMatchObject({all:25,ready_for_review:1,accepted:17,expired:7});
  expect(list.rows[0]).toMatchObject({quote_number:'Q-24817',status:'ready_for_review',total_basis:'draft',margin_label:'32.2%',unread:true});
});

it('follows ?customer= and ?status=, reading unknown values as All customers and every status',async()=>{
  const accepted=await (await get('?customer=wasatch&status=accepted')).json();
  expect(accepted.customer).toMatchObject({id:'wasatch'});
  expect(accepted.status).toBe('accepted');
  expect(accepted.rows).toHaveLength(17);
  const placeholder=await (await get('?customer=great-basin')).json();
  expect(placeholder).toMatchObject({rows:[],other_rep:false,counts:{all:0}});
  const otherRep=await (await get('?customer=canyon-ridge')).json();
  expect(otherRep).toMatchObject({rows:[],other_rep:true,customer:{rep_name:'Mara Jensen'}});
  const unknown=await (await get('?customer=nobody&status=lost')).json();
  expect(unknown).toMatchObject({customer:null,status:null});
  expect(unknown.rows).toHaveLength(25);
  expect((await (await get('?customer=all')).json()).customer).toBeNull();
});

it('asks for a workspace without a session, and refuses the customer persona',async()=>{
  expect((await get('',null)).status).toBe(401);
  expect((await get('','nobody')).status).toBe(401);
  const customer=await get('','customer');
  expect(customer.status).toBe(403);
  expect(customer.headers.get('cache-control')).toMatch(/no-store/);
  expect(await customer.json()).toEqual({detail:'Supplier access required.'});
});
