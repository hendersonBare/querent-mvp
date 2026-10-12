import {beforeEach,describe,expect,it} from 'vitest';
import {isRepReply,type NewQuote,type QuoteNotice} from '@/domain';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

// The "quote is ready" messages in Dana's chat (spec §3, task 5.1). A send posts one in the quote's
// own conversation (task 3.7); the chat on screen shows its own, plus any from Dana's other
// conversations whose quote still waits for her answer, so a quote is never announced only where
// she isn't looking (the seeded Q-24817 was asked for in a conversation her browser never opens).

const SAMPLE='q-24817',SAMPLE_CHAT='conv-q-24817',DANA_CHAT='conv-dana-now';
const SEND='2026-09-23T17:00:00.000Z',LATER='2026-09-24T09:00:00.000Z';

/** A priced will-call quote Dana asked for in the conversation on screen. */
async function ownQuote(input:Partial<NewQuote>={}){
  const {createQuote}=await import('@/server/repository');
  return createQuote({customerId:'wasatch',contactId:'dana',conversationId:DANA_CHAT,fulfillment:'will_call',branchId:'slc',at:'2026-09-23T16:40:00.000Z',
    lines:[{itemId:'HCS-12-13-2G8',qty:10,unitPrice:31.5,priceBasis:'last_paid'}],...input});
}

describe('chatNotices',()=>{
  beforeEach(async()=>{
    const {createConversation,conversation}=await import('@/server/repository');
    const {resetSample}=await import('@/server/quotes/service');
    resetSample();
    if(!conversation('wasatch',DANA_CHAT))createConversation({id:DANA_CHAT,customerId:'wasatch',contactId:'dana',at:'2026-09-23T16:30:00.000Z'});
  });

  it('shows a quote sent into the conversation on screen, with the rep’s text and the headline',async()=>{
    const {chatNotices}=await import('./notices');
    const {sendQuote}=await import('@/server/quotes/service');
    const q=await ownQuote();
    await sendQuote(q.id,{repId:'brandi',message:'Hi Dana, <b>here</b> it is',now:SEND});
    const notices=chatNotices('wasatch',DANA_CHAT,LATER).filter(n=>n.quote_id===q.id);
    expect(notices).toEqual([{id:expect.any(String),conversation_id:DANA_CHAT,created_at:SEND,text:'Hi Dana, <b>here</b> it is',quote_id:q.id,quote_number:q.quote_number,revision:1,
      total:315,valid_until:'2026-10-07',headline:`Quote ${q.quote_number} is ready: $315.00, valid until Oct 7`,attach_pdf:true,pdf_url:`/api/quotes/${q.id}/pdf?variant=customer&rev=1`}]);
  });

  it('keeps a conversation’s own notices whatever happened to the quote since',async()=>{
    const {chatNotices}=await import('./notices');
    const {sendQuote,acceptQuote}=await import('@/server/quotes/service');
    const q=await ownQuote();
    await sendQuote(q.id,{repId:'brandi',now:SEND});
    acceptQuote('wasatch',q.id,{revision:1,fulfillmentTime:'2026-09-25',customerPo:'7781',now:LATER});
    expect(chatNotices('wasatch',DANA_CHAT,'2026-12-01T00:00:00.000Z').map(n=>n.quote_id)).toContain(q.id);
  });

  it('brings in a notice from another conversation while its quote waits for Dana: sent, the latest revision, not expired',async()=>{
    const {chatNotices}=await import('./notices');
    const {sendQuote,requestChanges,acceptQuote}=await import('@/server/quotes/service');
    await sendQuote(SAMPLE,{repId:'brandi',message:'Rev 1',now:SEND});
    const shown=(now:string,conversationId=DANA_CHAT)=>chatNotices('wasatch',conversationId,now).filter((n):n is QuoteNotice=>n.quote_id===SAMPLE&&!isRepReply(n)).map(n=>[n.conversation_id,n.revision,n.text]);
    // Sent into the sample's own conversation, and shown in the one on screen too.
    expect(shown(LATER)).toEqual([[SAMPLE_CHAT,1,'Rev 1']]);
    // Not once it expired (valid until Oct 7): its own conversation still has it.
    expect(shown('2026-10-08T00:00:00.000Z')).toEqual([]);
    expect(shown('2026-10-08T00:00:00.000Z',SAMPLE_CHAT)).toEqual([[SAMPLE_CHAT,1,'Rev 1']]);
    // Dana asked for changes: nothing waits for her until rev 2, and then only rev 2's notice follows her.
    requestChanges('wasatch',SAMPLE,{revision:1,note:'XL gloves',now:LATER});
    expect(shown(LATER)).toEqual([]);
    await sendQuote(SAMPLE,{repId:'brandi',message:'Rev 2',now:'2026-09-24T10:00:00.000Z'});
    expect(shown('2026-09-24T11:00:00.000Z')).toEqual([[SAMPLE_CHAT,2,'Rev 2']]);
    expect(shown('2026-09-24T11:00:00.000Z',SAMPLE_CHAT)).toEqual([[SAMPLE_CHAT,1,'Rev 1'],[SAMPLE_CHAT,2,'Rev 2']]);
    // Accepted: it no longer waits for her.
    acceptQuote('wasatch',SAMPLE,{revision:2,fulfillmentTime:'2026-09-25',customerPo:'7781',now:'2026-09-24T12:00:00.000Z'});
    expect(shown('2026-09-24T13:00:00.000Z')).toEqual([]);
  });

  it('shows the same for a conversation that doesn’t exist yet (New conversation before its first message)',async()=>{
    const {chatNotices}=await import('./notices');
    const {sendQuote}=await import('@/server/quotes/service');
    await sendQuote(SAMPLE,{repId:'brandi',now:SEND});
    const notices=chatNotices('wasatch','not-created-yet',LATER);
    expect(notices.map(n=>n.quote_id)).toContain(SAMPLE);
    expect(notices.every(n=>n.conversation_id!=='not-created-yet')).toBe(true);
  });

  it('never shows another customer’s notices, whatever conversation id is asked for',async()=>{
    const {chatNotices}=await import('./notices');
    const {createConversation,createQuote}=await import('@/server/repository');
    const {sendQuote}=await import('@/server/quotes/service');
    createConversation({id:'conv-gb-notices',customerId:'great-basin',at:'2026-09-23T16:00:00.000Z'});
    const theirs=createQuote({customerId:'great-basin',conversationId:'conv-gb-notices',fulfillment:'will_call',branchId:'slc',at:'2026-09-23T16:00:00.000Z',lines:[{itemId:'HCS-12-13-2G8',qty:1,unitPrice:40}]});
    await sendQuote(theirs.id,{repId:'brandi',message:'For Great Basin',now:SEND});
    expect(chatNotices('great-basin','conv-gb-notices',LATER).map(n=>n.quote_id)).toEqual([theirs.id]);
    for(const conversationId of ['conv-gb-notices',DANA_CHAT,SAMPLE_CHAT])
      expect(chatNotices('wasatch',conversationId,LATER).some(n=>n.quote_id===theirs.id||n.conversation_id==='conv-gb-notices')).toBe(false);
  });

  it('carries nothing a customer mustn’t see',async()=>{
    const {chatNotices}=await import('./notices');
    const {sendQuote}=await import('@/server/quotes/service');
    const {addQuoteNote}=await import('@/server/repository');
    addQuoteNote(SAMPLE,'brandi','SECRET-NOTE',SEND);
    await sendQuote(SAMPLE,{repId:'brandi',message:'Hi',now:SEND});
    expect(JSON.stringify(chatNotices('wasatch',DANA_CHAT,LATER))).not.toMatch(/SECRET|cost|margin|floor|suggest|explanation|internal|basis/i);
  });
});
