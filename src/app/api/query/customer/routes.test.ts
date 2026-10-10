import {NextRequest} from 'next/server';
import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

// GET /api/query/customer/contacts and /api/query/customer/quotes (task 2.4): Dana's sidebars.
// These static routes take precedence over the /api/query/[...path] catch-all.

const request=(path:string,persona?:'customer'|'supplier')=>new NextRequest(`http://127.0.0.1/api/query/customer/${path}`,{headers:persona?{cookie:`querent-persona=${persona}`}:{}});
const routes={
  contacts:async()=>(await import('./contacts/route')).GET,
  quotes:async()=>(await import('./quotes/route')).GET,
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

it("returns Dana's rep first, then the departments and will-call per branch",async()=>{
  const GET=await routes.contacts();
  const response=await GET(request('contacts','customer'));
  expect(response.status).toBe(200);
  const body=await response.json();
  expect(body.rep.name).toBe('Brandi Gallegos');
  expect(body.departments.map((d:{name:string})=>d.name)).toEqual(['Customer Service','Accounts Receivable / Finance']);
  expect(body.willCall.map((b:{code:string})=>b.code)).toEqual(['SLC','Ogden','Provo']);
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
