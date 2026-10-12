import {NextRequest} from 'next/server';
import {expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// GET /api/rep/quotes (task 3.2): the signed-in rep's Quotes list. Rep-only: it carries margin.
// Brandi (the supplier persona) is the manager, whose list is every rep's quotes (task U1); these
// tests narrow it to her own with ?rep=brandi. src/app/api/rep/role-scope.route.test.ts covers the scope.
useSeededDatabase();

const get=async(query='',persona:string|null='supplier')=>{
  const {GET}=await import('./route');
  return GET(new NextRequest(`http://127.0.0.1/api/rep/quotes${query}`,{headers:persona?{cookie:`querent-persona=${persona}`}:{}}));
};

it("returns the quotes with counts, never cached",async()=>{
  const response=await get('?rep=brandi');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toMatch(/no-store/);
  const list=await response.json();
  expect(list).toMatchObject({customer:null,status:null,unread:1,rep_filter:'brandi'});
  // Wasatch's 28 and the three accepted quotes Brandi covered for Mara (task F1).
  expect(list.counts).toMatchObject({all:31,ready_for_review:1,accepted:20,expired:7});
  expect(list.rows.find((r:{quote_number:string})=>r.quote_number==='Q-24817')).toMatchObject({quote_number:'Q-24817',status:'ready_for_review',total_basis:'draft',margin_label:'32.2%',unread:true});
});

it('follows ?customer= and ?status=, reading unknown values as All customers and every status',async()=>{
  const accepted=await (await get('?customer=wasatch&status=accepted')).json();
  expect(accepted.customer).toMatchObject({id:'wasatch'});
  expect(accepted.status).toBe('accepted');
  expect(accepted.rows).toHaveLength(17);
  const placeholder=await (await get('?customer=great-basin')).json();
  expect(placeholder).toMatchObject({rows:[],counts:{all:0}});
  // Mara's customer: the manager reads every rep's quotes for it (Mara's 18, the three Brandi covered, Eli's two).
  const canyon=await (await get('?customer=canyon-ridge')).json();
  expect(canyon).toMatchObject({customer:{rep_name:'Mara Jensen'},counts:{all:23}});
  expect((await (await get('?customer=canyon-ridge&rep=brandi')).json()).counts).toMatchObject({all:3,accepted:3});
  const unknown=await (await get('?customer=nobody&status=lost&rep=brandi')).json();
  expect(unknown).toMatchObject({customer:null,status:null});
  expect(unknown.rows).toHaveLength(31);
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

it('serves the Needs attention view with ?attention=1, and its oldest-first toggle with &sort=oldest (task A2)',async()=>{
  const urgent=await (await get('?attention=1&rep=brandi')).json();
  expect(urgent).toMatchObject({attention:true,sort:'urgent',status:null,attention_count:3});
  expect(urgent.rows.map((r:{quote_number:string})=>r.quote_number)).toEqual(['Q-24790','Q-24817','Q-24789']);
  expect(urgent.rows[0].aging).toMatchObject({level:'red',reason:expect.stringMatching(/^Changes requested /)});
  const oldest=await (await get('?attention=1&sort=oldest&customer=wasatch')).json();
  expect(oldest).toMatchObject({attention:true,sort:'oldest',customer:{id:'wasatch'}});
  expect(oldest.rows.map((r:{quote_number:string})=>r.quote_number)).toEqual(['Q-24817','Q-24789','Q-24790']);
  expect((await (await get('?attention=yes&rep=brandi')).json()).attention).toBe(false);
});
