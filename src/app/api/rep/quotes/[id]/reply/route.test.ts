// @vitest-environment node
import {NextRequest} from 'next/server';
import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// POST /api/rep/quotes/<id or number>/reply {body} (plan U3; C_QOB6, C_QOT4 "Reply to Dana", "Send
// reply"): the owning rep's answer to the customer's change request note. Decision 63: it is posted
// into the customer's Querent conversation (as sent quotes are) and recorded on the quote's Activity,
// naming who replied to whom. Another rep's quote answers 404 like an unknown one (the manager reads
// it, but writes only her own, decision 22), and nothing is written.
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

  it("posts the reply into the customer's Querent conversation, where the customer's chat shows it (decision 63)",async()=>{
    const response=await post('Q-24790',{body:'Yes, we can hold them at Ogden.'});
    expect(response.status).toBe(201);
    const {conversationMessages,latestConversation,quoteByNumber}=await import('@/server/repository');
    const q=quoteByNumber('Q-24790')!;
    const where=q.conversation_id??latestConversation(q.customer_id)!.id;
    expect(conversationMessages(q.customer_id,where).at(-1)).toMatchObject({role:'system',kind:'rep_reply',content:'Yes, we can hold them at Ogden.',
      payload:{quote_id:q.id,quote_number:'Q-24790',rep_name:'Brandi Gallegos'}});
    // The customer's chat reads it with its notices, in that conversation and in a new one while the change request is open.
    const {chatNotices}=await import('@/server/customer/notices');
    for(const conversation of [where,'a-new-conversation'])
      expect(chatNotices(q.customer_id,conversation).at(-1)).toMatchObject({kind:'rep_reply',quote_number:'Q-24790',rep_name:'Brandi Gallegos',text:'Yes, we can hold them at Ogden.'});
  });

  it("writes nothing for the manager on another rep's quote: 404, no Activity row, no message",async()=>{
    const {quotes,quoteActivity,conversationMessages,latestConversation}=await import('@/server/repository');
    const theirs=quotes({repId:'mara',statuses:['changes_requested']})[0];
    expect(theirs).toBeDefined();
    const where=latestConversation(theirs.customer_id)?.id;
    const before={activity:quoteActivity(theirs.id).length,messages:where?conversationMessages(theirs.customer_id,where).length:0};
    const response=await post(theirs.quote_number,{body:'Hi'},'supplier');
    expect(response.status).toBe(404);
    expect(quoteActivity(theirs.id)).toHaveLength(before.activity);
    expect(where?conversationMessages(theirs.customer_id,where).length:0).toBe(before.messages);
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
