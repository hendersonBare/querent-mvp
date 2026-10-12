import {NextRequest} from 'next/server';
import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

// GET /api/query/customer/contacts (the My rep sheet, C_CVL3), /api/query/customer/quotes (task 2.4),
// /api/query/customer/orders (the Orders sheet, C_CVL2) and /api/query/customer/notifications (the
// bell, C_CVL4; plan U10). These static routes take precedence over the /api/query/[...path] catch-all.

const request=(path:string,persona?:'customer'|'supplier')=>new NextRequest(`http://127.0.0.1/api/query/customer/${path}`,{headers:persona?{cookie:`querent-persona=${persona}`}:{}});
const routes={
  contacts:async()=>(await import('./contacts/route')).GET,
  quotes:async()=>(await import('./quotes/route')).GET,
  orders:async()=>(await import('./orders/route')).GET,
  notifications:async()=>(await import('./notifications/route')).GET,
};

describe.each(Object.keys(routes) as (keyof typeof routes)[])('GET customer/%s',path=>{
  it('asks for a workspace without a session, and refuses the supplier',async()=>{
    const GET=await routes[path]();
    const anonymous=await GET(request(path));
    expect(anonymous.status).toBe(401);
    expect((await anonymous.json()).detail).toBe('Choose a demo workspace.');
    const supplier=await GET(request(path,'supplier'));
    expect(supplier.status).toBe(403);
    expect((await supplier.json()).detail).toBe('Customer access required.');
  });
});

it("returns Dana's rep only: the departments stay with the chat's answers (Appendix D)",async()=>{
  const GET=await routes.contacts();
  const response=await GET(request('contacts','customer'));
  expect(response.status).toBe(200);
  const body=await response.json();
  expect(Object.keys(body)).toEqual(['rep']);
  expect(body.rep).toEqual({id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'});
});

it("returns Wasatch's own orders, newest first, with no cost",async()=>{
  const GET=await routes.orders();
  const response=await GET(request('orders','customer'));
  expect(response.status).toBe(200);
  const body=await response.json();
  expect(body[0]).toEqual({id:'so-51223',order_number:'SO-51223',order_date:'2026-09-09',status:'shipped',fulfillment:'delivery',branch_code:'SLC',total:698.22,quote_number:'Q-24816'});
  expect(JSON.stringify(body)).not.toMatch(/cost|margin|subtotal/i);
});

it("returns Dana's notifications with the unread count, and marks them read",async()=>{
  const GET=await routes.notifications();
  const {POST}=await import('./notifications/read/route');
  const body=await (await GET(request('notifications','customer'))).json();
  expect(body.items.length).toBeGreaterThan(0);
  expect(body.unread).toBe(body.items.filter((n:{read:boolean})=>!n.read).length);
  expect(body.items.find((n:{id:string})=>n.id==='order:so-51223:shipped')).toMatchObject({title:'Order SO-51223 has shipped',body:'Delivery, SLC. From quote Q-24816.'});
  const post=(payload:unknown,persona?:'customer'|'supplier')=>POST(new NextRequest('http://127.0.0.1/api/query/customer/notifications/read',{method:'POST',body:JSON.stringify(payload),
    headers:{'content-type':'application/json',...(persona?{cookie:`querent-persona=${persona}`}:{})}}));
  expect((await post({all:true})).status).toBe(401);
  expect((await post({all:true},'supplier')).status).toBe(403);
  for(const bad of [{},{ids:'x'},{ids:[1]},{all:false},{ids:Array(101).fill('x')}])expect((await post(bad,'customer')).status,JSON.stringify(bad)).toBe(400);
  const one=body.items.find((n:{read:boolean})=>!n.read);
  const marked=await post({ids:[one.id]},'customer');
  expect(marked.status).toBe(200);
  expect((await marked.json()).unread).toBe(body.unread-1);
  const all=await (await post({all:true},'customer')).json();
  expect(all.unread).toBe(0);
  expect((await (await GET(request('notifications','customer'))).json()).unread).toBe(0);
});

it("returns Wasatch's quotes newest first, Q-24817 with no total yet",async()=>{
  const GET=await routes.quotes();
  const response=await GET(request('quotes','customer'));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')??'').not.toMatch(/max-age=[1-9]/);
  const body=await response.json();
  // After the seed's three aging quotes (task A2), dated from the reset time.
  expect(body[3]).toMatchObject({quote_number:'Q-24817',status:'ready_for_review',total:null});
  expect(body.length).toBeGreaterThan(20);
});
