import {NextRequest} from 'next/server';
import {beforeEach,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

// POST /api/query/customer/quotes/:id/accept (task 5.2): Dana's Accept from the preview modal,
// over HTTP. Brandi sends with the real clock, so the pickup day is a weekday a few days ahead.

const FORBIDDEN=/cost|margin|floor|suggest|explanation|internal|basis|gp/i;
const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];
/** `amount` as a number in text ("58", "58.00", "$58"), not as digits inside an id or a timestamp (as in the intake's test, task 2.3). */
const mentions=(text:string,amount:number)=>new RegExp(`(?<![\\w.:-])\\$?${String(amount).replace('.','\\.')}(?:0*)?(?![\\w:]|\\.\\d*[1-9])`).test(text);
const leaves=(value:unknown):unknown[]=>Array.isArray(value)?value.flatMap(leaves):value&&typeof value==='object'?Object.values(value).flatMap(leaves):[value];
/** The unit costs that show up anywhere in `value`: as a number, or written in a text. */
function leakedCosts(value:unknown,costs:readonly number[]){
  const values=leaves(value),strings=values.filter((v):v is string=>typeof v==='string');
  return costs.filter(cost=>values.includes(cost)||strings.some(text=>mentions(text,cost)));
}

/** A weekday at least two days from now (Mountain time), as YYYY-MM-DD. */
function nextWeekday(){
  const day=new Date(Date.now()+2*86_400_000);
  while(day.getUTCDay()===0||day.getUTCDay()===6)day.setUTCDate(day.getUTCDate()+1);
  return day.toISOString().slice(0,10);
}

async function post(id:string,body:unknown,{persona='customer',key}:{persona?:string;key?:string}={}){
  const {POST}=await import('./route');
  const headers:Record<string,string>={'content-type':'application/json'};
  if(persona)headers.cookie=`querent-persona=${persona}`;
  if(key!==undefined)headers['idempotency-key']=key;
  const request=new NextRequest(`http://127.0.0.1/api/query/customer/quotes/${encodeURIComponent(id)}/accept`,{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});
  const response=await POST(request,{params:Promise.resolve({id})});
  return {status:response.status,headers:response.headers,text:await response.clone().text(),json:await response.json()};
}

let costs:number[]=[];
let body:{revision:number;day:string;time:string;po:string};
beforeEach(async()=>{
  const {resetSample,sendQuote}=await import('@/server/quotes/service');
  const {quote}=await import('@/server/repository');
  resetSample();
  await sendQuote('q-24817',{repId:'brandi',now:new Date().toISOString()});
  costs=[...new Set(quote('q-24817')!.lines.map(l=>l.unit_cost))];
  body={revision:1,day:nextWeekday(),time:'10:00',po:'7781'};
});

describe('POST customer/quotes/:id/accept',()=>{
  it('asks for a workspace without a session, and refuses the supplier',async()=>{
    expect(await post('q-24817',body,{persona:''})).toMatchObject({status:401});
    expect(await post('q-24817',body,{persona:'supplier'})).toMatchObject({status:403,json:{detail:'Customer access required.'}});
  });

  it('accepts Dana’s latest revision and answers with the customer-safe preview only: no cost-like key, no seeded cost',async()=>{
    const response=await post('Q-24817',body,{key:'http-accept-1'});
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.json).toMatchObject({replayed:false,quote:{id:'q-24817',status:'accepted',latest_revision:1,response:{kind:'accepted',revision:1,customer_po:'7781'}}});
    expect(keys(response.json).filter(k=>FORBIDDEN.test(k))).toEqual([]);
    expect(costs.length).toBeGreaterThan(0);
    expect(leakedCosts(response.json,costs)).toEqual([]);
    // The scanner does catch a leak.
    expect(leakedCosts({line:{unit_cost:costs[0]}},costs)).toEqual([costs[0]]);
    expect(leakedCosts({note:`costs $${costs[0].toFixed(2)}`},costs)).toEqual([costs[0]]);
    const {quote}=await import('@/server/repository');
    expect(quote('q-24817')).toMatchObject({status:'accepted',customer_po:'7781',unread_for_rep:true,fulfillment:'will_call',branch_id:'slc'});
  });

  it('replays a double submit with the same key, and refuses a second one without it',async()=>{
    const first=await post('q-24817',body,{key:'http-accept-2'});
    const again=await post('q-24817',body,{key:'http-accept-2'});
    expect(again).toMatchObject({status:200,json:{...first.json,replayed:true}});
    expect(await post('q-24817',body)).toMatchObject({status:409,json:{code:'illegal_transition',detail:'You already accepted Q-24817.'}});
  });

  it('refuses a crafted body that changes branch or pickup/delivery, a past time and a bad key',async()=>{
    expect(await post('q-24817',{...body,branch_id:'ogden',fulfillment:'delivery'})).toMatchObject({status:400,
      json:{code:'invalid_input',detail:'Branch and pickup are locked to what Brandi approved. To change them, use Request changes.'}});
    expect(await post('q-24817',{...body,day:'2020-01-06'})).toMatchObject({status:400,json:{code:'invalid_input',detail:expect.stringMatching(/^That day has passed\./)}});
    expect(await post('q-24817','not json')).toMatchObject({status:400});
    expect(await post('q-24817',body,{key:'bad key!'})).toMatchObject({status:400,json:{code:'invalid_input'}});
    const {quote}=await import('@/server/repository');
    expect(quote('q-24817')).toMatchObject({status:'sent',branch_id:'slc',fulfillment:'will_call'});
  });

  it('is the same 404 for another customer’s quote and an unknown one; 409 for an older revision',async()=>{
    const {createQuote}=await import('@/server/repository');
    const theirs=createQuote({customerId:'great-basin',fulfillment:'will_call',branchId:'slc',lines:[]});
    for(const id of [theirs.id,theirs.quote_number,'q-nope'])expect(await post(id,body),id).toMatchObject({status:404,json:{detail:'Quote not found.'}});
    expect(await post('q-24817',{...body,revision:2})).toMatchObject({status:409,json:{code:'conflict'}});
  });
});
