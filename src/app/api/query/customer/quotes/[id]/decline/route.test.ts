import {NextRequest} from 'next/server';
import {beforeEach,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

// POST /api/query/customer/quotes/:id/decline (v3 spec §2.1, §5; task A1): Dana's Decline from the
// preview modal, over HTTP. The answer is deep-scanned for cost, and for the Other note, which is
// for Brandi only (decision 14).

const FORBIDDEN=/cost|margin|floor|suggest|explanation|internal|basis|gp|reason|decline_note/i;
const NOTE='Found a cheaper supplier down the road';
const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];
/** `amount` as a number in text ("58", "58.00", "$58"), not as digits inside an id or a timestamp (as in the intake's test, task 2.3). */
const mentions=(text:string,amount:number)=>new RegExp(`(?<![\\w.:-])\\$?${String(amount).replace('.','\\.')}(?:0*)?(?![\\w:]|\\.\\d*[1-9])`).test(text);
const leaves=(value:unknown):unknown[]=>Array.isArray(value)?value.flatMap(leaves):value&&typeof value==='object'?Object.values(value).flatMap(leaves):[value];
/** The unit costs that show up anywhere in `value`: as a number, or written in a text. */
function leakedCosts(value:unknown,costs:readonly number[]){
  const values=leaves(value),strings=values.filter((v):v is string=>typeof v==='string');
  return costs.filter(cost=>values.includes(cost)||strings.some(text=>mentions(text,cost)));
}

async function post(id:string,body:unknown,{persona='customer',key}:{persona?:string;key?:string}={}){
  const {POST}=await import('./route');
  const headers:Record<string,string>={'content-type':'application/json'};
  if(persona)headers.cookie=`querent-persona=${persona}`;
  if(key!==undefined)headers['idempotency-key']=key;
  const request=new NextRequest(`http://127.0.0.1/api/query/customer/quotes/${encodeURIComponent(id)}/decline`,{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});
  const response=await POST(request,{params:Promise.resolve({id})});
  return {status:response.status,headers:response.headers,text:await response.clone().text(),json:await response.json()};
}

let costs:number[]=[];
beforeEach(async()=>{
  const {resetSample,sendQuote}=await import('@/server/quotes/service');
  const {quote}=await import('@/server/repository');
  resetSample();
  await sendQuote('q-24817',{repId:'brandi',now:new Date().toISOString()});
  costs=[...new Set(quote('q-24817')!.lines.map(l=>l.unit_cost))];
});

describe('POST customer/quotes/:id/decline',()=>{
  it('asks for a workspace without a session, and refuses the supplier',async()=>{
    expect(await post('q-24817',{revision:1},{persona:''})).toMatchObject({status:401});
    expect(await post('q-24817',{revision:1},{persona:'supplier'})).toMatchObject({status:403,json:{detail:'Customer access required.'}});
  });

  it('declines with Other and a note, and answers with the customer-safe preview only: no cost, no reason, no note',async()=>{
    const response=await post('Q-24817',{revision:1,reason:'other',note:NOTE},{key:'http-decline-1'});
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.json).toMatchObject({replayed:false,quote:{id:'q-24817',status:'declined',latest_revision:1,response:{kind:'declined',revision:1}}});
    expect(response.json.quote.response).toEqual({kind:'declined',revision:1});
    expect(keys(response.json).filter(k=>FORBIDDEN.test(k))).toEqual([]);
    expect(costs.length).toBeGreaterThan(0);
    expect(leakedCosts(response.json,costs)).toEqual([]);
    expect(response.text).not.toContain(NOTE);
    expect(response.text).not.toMatch(/other/i);
    const {quote}=await import('@/server/repository');
    expect(quote('q-24817')).toMatchObject({status:'declined',decline_reason:'other',decline_note:NOTE,unread_for_rep:true});
  });

  it('declines with no reason at all',async()=>{
    expect(await post('q-24817',{revision:1},{key:'http-decline-2'})).toMatchObject({status:200,json:{quote:{status:'declined'}}});
  });

  it('replays a double submit with the same key, and refuses a second one without it (409)',async()=>{
    const first=await post('q-24817',{revision:1,reason:'need_sooner'},{key:'http-decline-3'});
    expect(await post('q-24817',{revision:1,reason:'need_sooner'},{key:'http-decline-3'})).toMatchObject({status:200,json:{...first.json,replayed:true}});
    expect(await post('q-24817',{revision:1})).toMatchObject({status:409,json:{code:'illegal_transition',detail:'You already declined Q-24817.'}});
  });

  it('refuses a bad reason, a long note, a bad body or key (400); another customer’s quote (404); an older revision (409)',async()=>{
    expect(await post('q-24817',{revision:1,reason:'no_response'})).toMatchObject({status:400,json:{code:'invalid_input'}});
    expect(await post('q-24817',{revision:1,reason:'other',note:'x'.repeat(251)})).toMatchObject({status:400,json:{code:'invalid_input',detail:'Keep the note to 250 characters.'}});
    expect(await post('q-24817','not json')).toMatchObject({status:400});
    expect(await post('q-24817',{revision:1},{key:'bad key!'})).toMatchObject({status:400,json:{code:'invalid_input'}});
    const {createQuote,quote}=await import('@/server/repository');
    const theirs=createQuote({customerId:'great-basin',fulfillment:'will_call',branchId:'slc',lines:[]});
    for(const id of [theirs.id,'q-nope'])expect(await post(id,{revision:1}),id).toMatchObject({status:404,json:{detail:'Quote not found.'}});
    expect(await post('q-24817',{revision:2})).toMatchObject({status:409,json:{code:'conflict'}});
    expect(quote('q-24817')?.status).toBe('sent');
  });
});
