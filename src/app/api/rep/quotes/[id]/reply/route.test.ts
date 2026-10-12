// @vitest-environment node
import {NextRequest} from 'next/server';
import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// POST /api/rep/quotes/<id or number>/reply {body} (plan U3; C_QOB6, C_QOT4 "Reply to Dana", "Send
// reply"): the owning rep's answer to the customer's change request note. No frame or spec says where
// the reply reaches the customer (raised with the product owner, docs/plans/status.md "No frame"), so
// for now it is recorded on the quote's Activity, naming who replied to whom. Another rep's quote
// answers 404 like an unknown one (the manager reads it, but writes only her own, decision 22).
useSeededDatabase();

const post=async(id:string,body:unknown,persona='supplier')=>{
  const {POST}=await import('./route');
  return POST(new NextRequest(`http://127.0.0.1/api/rep/quotes/${id}/reply`,{method:'POST',headers:{cookie:`querent-persona=${persona}`,'content-type':'application/json'},body:JSON.stringify(body)}),
    {params:Promise.resolve({id})});
};

describe('a reply to the change request note',()=>{
  it("is recorded on the quote's Activity as the rep's reply to the contact",async()=>{
    const response=await post('Q-24790',{body:'  Yes, we can hold them at Ogden.  '});
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({kind:'replied',actor:'rep',actor_id:'brandi',message:'Brandi Gallegos replied to Dana Ortiz: "Yes, we can hold them at Ogden."'});
    const {quoteActivity,quoteByNumber}=await import('@/server/repository');
    expect(quoteActivity(quoteByNumber('Q-24790')!.id).at(-1)).toMatchObject({kind:'replied'});
  });

  it('refuses an empty or overlong reply, and a quote with no change request note',async()=>{
    expect((await post('Q-24790',{body:'   '})).status).toBe(400);
    expect((await post('Q-24790',{body:'x'.repeat(2001)})).status).toBe(400);
    expect((await post('Q-24790',{})).status).toBe(400);
    expect((await post('Q-24791',{body:'Hello'})).status).toBe(409);
  });

  it("answers 404 for another rep's quote or an unknown one, and 403 for a customer",async()=>{
    expect((await post('Q-24790',{body:'Hi'},'mara')).status).toBe(404);
    expect((await post('Q-NOPE',{body:'Hi'})).status).toBe(404);
    expect((await post('Q-24790',{body:'Hi'},'customer')).status).toBe(403);
  });
});
