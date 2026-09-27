// @vitest-environment node
import {NextRequest} from 'next/server';
import {beforeEach,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// The side panels' routes (task 3.4): PATCH .../fulfillment, PUT|DELETE .../freight,
// PATCH .../terms and POST .../notes. Rep-only (401 / 403 before anything is read), the rep's own
// quote only (404), never on a quote whose status doesn't allow edits (409), validated (400),
// and never cached. Each answers the fresh quote detail.
useSeededDatabase();

type Method='PATCH'|'PUT'|'DELETE'|'POST';
type Path='fulfillment'|'freight'|'terms'|'notes';
const routes={
  fulfillment:()=>import('./fulfillment/route'),
  freight:()=>import('./freight/route'),
  terms:()=>import('./terms/route'),
  notes:()=>import('./notes/route'),
};

async function call(path:Path,method:Method,id:string,body?:unknown,persona:string|null='supplier'){
  const route=await routes[path]() as unknown as Record<Method,(request:NextRequest,context:{params:Promise<{id:string}>})=>Promise<Response>>;
  const headers:Record<string,string>={'content-type':'application/json'};
  if(persona)headers.cookie=`querent-persona=${persona}`;
  const request=new NextRequest(`http://127.0.0.1/api/rep/quotes/${id}/${path}`,{method,headers,body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
  return route[method](request,{params:Promise.resolve({id})});
}

/** One good request per route and method. */
const EDITS:[Path,Method,unknown][]=[
  ['fulfillment','PATCH',{fulfillment:'delivery'}],
  ['freight','PUT',{amount:80,reason:'Liftgate'}],
  ['freight','DELETE',undefined],
  ['terms','PATCH',{validDays:30}],
  ['notes','POST',{body:'Call Dana before loading.'}],
];

beforeEach(async()=>{(await import('@/server/quotes/service')).resetSample();});

describe.each(EDITS)('%s %s',(path,method,body)=>{
  it('refuses visitors (401) and customers (403), changing nothing',async()=>{
    const {quote,quoteNotes,quoteActivity}=await import('@/server/repository');
    const before={q:quote('q-24817'),notes:quoteNotes('q-24817'),activity:quoteActivity('q-24817')};
    expect((await call(path,method,'Q-24817',body,null)).status).toBe(401);
    const customer=await call(path,method,'Q-24817',body,'customer');
    expect(customer.status).toBe(403);
    expect(await customer.json()).toEqual({detail:'Supplier access required.'});
    expect({q:quote('q-24817'),notes:quoteNotes('q-24817'),activity:quoteActivity('q-24817')}).toEqual(before);
  });

  it('answers the fresh detail, never cached',async()=>{
    const response=await call(path,method,'Q-24817',body);
    expect(response.status).toBe(method==='POST'?201:200);
    expect(response.headers.get('cache-control')).toMatch(/no-store/);
    const detail=await response.json();
    expect(detail.quote.quote_number).toBe('Q-24817');
    expect(detail.panels.customer.account_number).toBe('WAS-1142');
  });

  it('answers 409 on an accepted quote and 404 on another rep\'s',async()=>{
    const {createQuote,quoteByNumber}=await import('@/server/repository');
    const accepted=quoteByNumber('Q-24816')!;
    const refused=await call(path,method,'Q-24816',body);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({detail:'Q-24816 was accepted, so it can\'t be edited. Duplicate it to quote again.',code:'illegal_transition'});
    expect(quoteByNumber('Q-24816')).toEqual(accepted);
    const other=createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'GLV-N8-L-1000',qty:1,unitPrice:82}]});
    const hidden=await call(path,method,other.quote_number,body);
    expect(hidden.status).toBe(404);
    expect(await hidden.json()).toEqual({detail:`No quote ${other.quote_number}.`,code:'not_found'});
  });
});

it('validates every body server-side (400), whatever the client sent',async()=>{
  const bad:[Path,Method,unknown][]=[
    ['fulfillment','PATCH',{fulfillment:'ship'}],['fulfillment','PATCH',{branchId:'moab'}],['fulfillment','PATCH','not json'],['fulfillment','PATCH',{}],
    ['freight','PUT',{amount:80}],['freight','PUT',{amount:80,reason:'  '}],['freight','PUT',{amount:-1,reason:'x'}],['freight','PUT',{amount:1.005,reason:'x'}],['freight','PUT','not json'],
    ['terms','PATCH',{validDays:21}],['terms','PATCH',{customerPo:'x'.repeat(41)}],['terms','PATCH',{}],
    ['notes','POST',{body:''}],['notes','POST','not json'],
  ];
  for(const [path,method,body] of bad){
    const response=await call(path,method,'Q-24817',body);
    expect(response.status,`${method} ${path} ${JSON.stringify(body)}`).toBe(400);
    expect((await response.json()).code).toBe('invalid_input');
  }
  const {quote,quoteNotes}=await import('@/server/repository');
  expect(quote('q-24817')).toMatchObject({fulfillment:'will_call',branch_id:'slc',freight_override:null,valid_days:14,customer_po:null});
  expect(quoteNotes('q-24817')).toEqual([]);
});

it('keeps the send checks in sync: an override clears call for freight but not the missing ship-to',async()=>{
  const {createQuote}=await import('@/server/repository');
  const q=createQuote({customerId:'wasatch',fulfillment:'delivery',branchId:'slc',shipTo:null,lines:[{itemId:'HCS-12-13-2G8',qty:2,unitPrice:31.5,priceBasis:'custom'}]});
  const detail=await (await call('freight','PUT',q.quote_number,{amount:95,reason:'Carrier quote'})).json();
  expect(detail.send_check.blockers.map((b:{code:string})=>b.code)).toEqual(['no_ship_to']);
  const willCall=await (await call('fulfillment','PATCH',q.quote_number,{fulfillment:'will_call'})).json();
  expect(willCall.send_check).toMatchObject({can_send:true,blockers:[]});
});
