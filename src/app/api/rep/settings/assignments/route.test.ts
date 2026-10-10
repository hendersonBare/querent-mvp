// @vitest-environment node
import {NextRequest} from 'next/server';
import {beforeAll,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// PUT /api/rep/settings/assignments {customer_id, rep_id, moveOpenQuotes?} (v3 spec §5, §6 Settings,
// §8; decision 21; OA-55; task D2): the manager only (a rep 403). Reassigning the customer leaves
// its quotes alone unless "Also move this customer's open quotes" is ticked: then its open quotes
// (ready_for_review, changes_requested, sent and not yet past valid_until) move to the new rep
// through the same reassignment as the Quotes list, each with an activity row. Closed quotes stay.
useSeededDatabase();

const DAY=86_400_000;
let expiredSent='';

async function put(body:unknown,persona='supplier'){
  const {PUT}=await import('./route');
  const response=await PUT(new NextRequest('http://127.0.0.1/api/rep/settings/assignments',{method:'PUT',headers:{'content-type':'application/json',cookie:`querent-persona=${persona}`},body:JSON.stringify(body)}));
  return {status:response.status,json:await response.json()};
}
const owners=async()=>{
  const {quotes}=await import('@/server/repository');
  return Object.fromEntries(quotes({customerId:'wasatch'}).map(q=>[q.quote_number,q.rep_id]));
};
const reassignedRows=async(id:string)=>(await import('@/server/repository')).quoteActivity(id).filter(a=>a.kind==='reassigned');
const customerRep=async(id:string)=>(await import('@/server/repository')).assignedRep(id)?.id;

beforeAll(async()=>{
  // A Wasatch quote sent 20 days ago, valid 14: stored as sent but expired in effect, so it is not open.
  const {duplicateQuote,sendQuote}=await import('@/server/quotes/service');
  const now=Date.now(),daysAgo=(days:number)=>new Date(now-days*DAY).toISOString();
  const q=duplicateQuote('Q-24814',{repId:'brandi',now:daysAgo(21)});
  await sendQuote(q.id,{repId:'brandi',now:daysAgo(20)});
  expiredSent=q.quote_number;
});

describe('who may change rep assignments',()=>{
  it('refuses a rep (403), changing nothing',async()=>{
    expect(await put({customer_id:'canyon-ridge',rep_id:'eli'},'mara')).toMatchObject({status:403,json:{detail:'Manager access required.'}});
    expect(await put({customer_id:'canyon-ridge',rep_id:'mara',moveOpenQuotes:true},'eli')).toMatchObject({status:403});
    expect(await customerRep('canyon-ridge')).toBe('mara');
  });
});

describe('PUT /api/rep/settings/assignments',()=>{
  it('without the checkbox: the customer moves, every quote stays with its rep',async()=>{
    const before=await owners();
    const saved=await put({customer_id:'wasatch',rep_id:'eli'});
    expect(saved.status).toBe(200);
    expect(saved.json.moved).toBeNull();
    expect(saved.json.assignments.find((a:{id:string})=>a.id==='wasatch').rep_id).toBe('eli');
    expect(await owners()).toEqual(before);
    expect(await reassignedRows('q-24817')).toEqual([]);
    expect((await put({customer_id:'wasatch',rep_id:'brandi',moveOpenQuotes:false})).json.moved).toBeNull();
    expect(await owners()).toEqual(before);
  });

  it('with the checkbox: the open quotes move with activity rows; closed and expired ones stay',async()=>{
    const saved=await put({customer_id:'wasatch',rep_id:'mara',moveOpenQuotes:true});
    expect(saved.status).toBe(200);
    expect(saved.json.moved.to).toEqual({id:'mara',name:'Mara Jensen'});
    const moved=saved.json.moved.moved.map((m:{quote_number:string})=>m.quote_number).sort();
    expect(moved).toEqual(['Q-24789','Q-24790','Q-24791','Q-24817']);
    const after=await owners();
    for(const number of moved)expect(after[number]).toBe('mara');
    expect(after['Q-24816']).toBe('brandi');
    expect(after[expiredSent]).toBe('brandi');
    expect(Object.values(after).filter(rep=>rep==='mara')).toHaveLength(4);
    expect(await reassignedRows('q-24817')).toEqual([expect.objectContaining({actor:'rep',actor_id:'brandi',message:'Brandi Gallegos reassigned Q-24817 from Brandi Gallegos to Mara Jensen'})]);
    const {quote}=await import('@/server/repository');
    expect(quote('q-24817')).toMatchObject({rep_id:'mara',original_rep_id:'brandi'});
    // And back, moving them again.
    const back=await put({customer_id:'wasatch',rep_id:'brandi',moveOpenQuotes:true});
    expect(back.json.moved.moved).toHaveLength(4);
    expect(Object.values(await owners()).every(rep=>rep==='brandi')).toBe(true);
  });

  it('refuses a moveOpenQuotes that isn’t true or false (400), changing nothing',async()=>{
    expect(await put({customer_id:'wasatch',rep_id:'eli',moveOpenQuotes:'yes'})).toMatchObject({status:400});
    expect(await customerRep('wasatch')).toBe('brandi');
  });
});
