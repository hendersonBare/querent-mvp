import {NextRequest} from 'next/server';
import {beforeEach,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

// POST /api/query/customer/quotes/:id/request-changes (task 5.2): Dana's Request changes from the
// preview modal, over HTTP.

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
const NOTE='Can you make the bolts 12 boxes?';

async function post(id:string,body:unknown,{persona='customer',key}:{persona?:string;key?:string}={}){
  const {POST}=await import('./route');
  const headers:Record<string,string>={'content-type':'application/json'};
  if(persona)headers.cookie=`querent-persona=${persona}`;
  if(key!==undefined)headers['idempotency-key']=key;
  const request=new NextRequest(`http://127.0.0.1/api/query/customer/quotes/${encodeURIComponent(id)}/request-changes`,{method:'POST',headers,body:JSON.stringify(body)});
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

describe('POST customer/quotes/:id/request-changes',()=>{
  it('refuses without a customer session',async()=>{
    expect(await post('q-24817',{revision:1,note:NOTE},{persona:''})).toMatchObject({status:401});
    expect(await post('q-24817',{revision:1,note:NOTE},{persona:'supplier'})).toMatchObject({status:403});
  });

  it('sends the note: changes_requested, editable for Brandi, and a customer-safe answer',async()=>{
    const response=await post('q-24817',{revision:1,note:NOTE},{key:'http-changes-1'});
    expect(response).toMatchObject({status:200,json:{replayed:false,quote:{status:'changes_requested',response:{kind:'changes_requested',revision:1,note:NOTE}}}});
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(keys(response.json).filter(k=>FORBIDDEN.test(k))).toEqual([]);
    expect(costs.length).toBeGreaterThan(0);
    expect(leakedCosts(response.json,costs)).toEqual([]);
    // The scanner does catch a leak.
    expect(leakedCosts({line:{unit_cost:costs[0]}},costs)).toEqual([costs[0]]);
    expect(leakedCosts({note:`costs $${costs[0].toFixed(2)}`},costs)).toEqual([costs[0]]);
    const {quote}=await import('@/server/repository');
    const {canEditDraft}=await import('@/server/quotes');
    expect(quote('q-24817')).toMatchObject({status:'changes_requested',change_request_note:NOTE,unread_for_rep:true});
    expect(canEditDraft(quote('q-24817')!.status)).toBe(true);
    expect(await post('q-24817',{revision:1,note:NOTE},{key:'http-changes-1'})).toMatchObject({status:200,json:{replayed:true}});
    expect(await post('q-24817',{revision:1,note:NOTE})).toMatchObject({status:409,json:{code:'illegal_transition'}});
  });

  it('requires a note, and takes nothing but the revision and the note',async()=>{
    expect(await post('q-24817',{revision:1,note:'   '})).toMatchObject({status:400,json:{detail:'Say what should change: a note is required.'}});
    expect(await post('q-24817',{revision:1,note:NOTE,branch_id:'ogden'})).toMatchObject({status:400,json:{code:'invalid_input'}});
    expect(await post('q-nope',{revision:1,note:NOTE})).toMatchObject({status:404,json:{detail:'Quote not found.'}});
    const {quote}=await import('@/server/repository');
    expect(quote('q-24817')).toMatchObject({status:'sent',branch_id:'slc',change_request_note:null});
  });
});
