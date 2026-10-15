import {NextRequest} from 'next/server';
import {expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

const get=async(persona?:string)=>{
  const {GET}=await import('./route');
  return GET(new NextRequest('http://127.0.0.1/api/rep/badges',{headers:persona?{cookie:`querent-persona=${persona}`}:{}}));
};

it("returns the signed-in rep's badge counts: a rep's own unread and red quotes (Mara: her new demo draft unread; her Overdue draft and change request)",async()=>{
  const response=await get('mara');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toMatch(/no-store/);
  const body=await response.json();
  expect(body).toMatchObject({quotes:1,attention:2});
  // The dropdowns' summaries (plan U2): her red and amber quotes, and her one unread event.
  expect(body.caution.filter((c:{tag:string})=>c.tag==='Overdue')).toHaveLength(2);
  expect(body.bell).toHaveLength(1);
  for(const item of [...body.caution,...body.bell])expect(Object.keys(item).sort()).toEqual(['at','id','kind','label','line','quote_number','tag']);
});

it('counts every rep\'s red quotes for the manager (task U1); her unread stays her own (the seeded sample quote)',async()=>{
  const body=await (await get('supplier')).json();
  const own={brandi:2,mara:2},eli=(await (await get('eli')).json()).attention;
  expect(body).toMatchObject({quotes:1,attention:own.brandi+own.mara+eli});
  expect(body.caution.filter((c:{tag:string})=>c.tag==='Overdue')).toHaveLength(own.brandi+own.mara+eli);
  expect(body.bell.map((b:{quote_number:string})=>b.quote_number)).toEqual(['Q-24817']);
});

it('asks for a workspace without a session, and refuses the customer persona',async()=>{
  expect((await get()).status).toBe(401);
  expect((await get('nobody')).status).toBe(401);
  expect((await get('constructor')).status).toBe(401);
  const customer=await get('customer');
  expect(customer.status).toBe(403);
  expect(await customer.json()).toEqual({detail:'Supplier access required.'});
});
