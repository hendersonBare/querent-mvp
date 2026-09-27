import {beforeEach,describe,expect,it} from 'vitest';
import {QUOTE_READY_KIND,type NewQuote} from '@/domain';
import {overrideFreight} from '@/server/freight/quote';
import {
  addQuoteNote,conversationMessages,createConversation,createQuote,customerQuote,quote,quoteRevisions,
} from '@/server/repository';
import {useSeededDatabase} from '@/server/repository/test-db';
import {QUOTE_MESSAGE_MAX} from './announce';
import {resetSample,sendQuote} from './service';

// Approve & send posts the quote in the customer's Querent chat (spec §3, §5.4; task 3.7): one
// `quote_ready` message per send, in the same transaction as the revision, with the rep's message
// as plain text and the headline and PDF link in its payload. Nothing the customer mustn't see.
useSeededDatabase();

const SAMPLE='q-24817',CHAT='conv-q-24817';
const SEND='2026-09-23T17:00:00.000Z';
const readyMessages=(customerId:string,conversationId:string)=>conversationMessages(customerId,conversationId).filter(m=>m.kind===QUOTE_READY_KIND);
const allReady=(customerId:string,conversationIds:string[])=>conversationIds.flatMap(id=>readyMessages(customerId,id));

/** A priced Wasatch will-call quote with no chat of its own: 10 boxes of bolts at $31.50 from SLC. */
const newQuote=(input:Partial<NewQuote>={})=>createQuote({customerId:'wasatch',contactId:'dana',fulfillment:'will_call',branchId:'slc',at:'2026-09-23T16:00:00.000Z',
  lines:[{itemId:'HCS-12-13-2G8',qty:10,unitPrice:31.5,priceBasis:'last_paid'}],...input});

describe('the quote_ready chat message',()=>{
  beforeEach(()=>{resetSample();});

  it('goes into the quote’s own conversation, after the Request quote turn, with the rep’s message and the headline',async()=>{
    const before=conversationMessages('wasatch',CHAT).length;
    const {revision,message}=await sendQuote(SAMPLE,{repId:'brandi',message:'Hi Dana, your quote is ready.\n\nThanks, Brandi',now:SEND});
    const messages=conversationMessages('wasatch',CHAT);
    expect(messages).toHaveLength(before+1);
    expect(messages.at(-1)).toEqual(message);
    expect(message).toEqual({id:expect.any(String),conversation_id:CHAT,role:'system',kind:'quote_ready',content:'Hi Dana, your quote is ready.\n\nThanks, Brandi',created_at:SEND,
      payload:{quote_id:SAMPLE,quote_number:'Q-24817',revision:1,total:1122.4,valid_until:'2026-10-07',headline:'Quote Q-24817 is ready: $1,122.40, valid until Oct 7',
        attach_pdf:true,pdf_url:'/api/quotes/q-24817/pdf?variant=customer&rev=1'}});
    // The revision keeps the same text.
    expect(revision).toMatchObject({revision:1,message:'Hi Dana, your quote is ready.\n\nThanks, Brandi',attach_pdf:true,total:1122.4});
  });

  it('stores the message as plain text: sanitized the same way in the chat and the revision',async()=>{
    const typed='  Hi Dana,\r\n\r\n\r\n\r\nhere it is\u202E \u0007<b>bold</b>  \r\n';
    const {revision,message}=await sendQuote(SAMPLE,{repId:'brandi',message:typed,now:SEND});
    expect(message.content).toBe('Hi Dana,\n\nhere it is <b>bold</b>');
    expect(revision.message).toBe('Hi Dana,\n\nhere it is <b>bold</b>');
    expect(customerQuote('wasatch',SAMPLE)?.sent?.message).toBe('Hi Dana,\n\nhere it is <b>bold</b>');
  });

  it('sends with no message: the chat still gets the headline in its payload; the revision stores none',async()=>{
    const {revision,message}=await sendQuote(SAMPLE,{repId:'brandi',message:' \n ',attachPdf:false,now:SEND});
    expect(message).toMatchObject({content:'',payload:{headline:'Quote Q-24817 is ready: $1,122.40, valid until Oct 7',attach_pdf:false}});
    expect(revision).toMatchObject({message:null,attach_pdf:false});
  });

  it('refuses a message over the limit, writing nothing',async()=>{
    const before=conversationMessages('wasatch',CHAT).length;
    await expect(sendQuote(SAMPLE,{repId:'brandi',message:'x'.repeat(QUOTE_MESSAGE_MAX+1),now:SEND})).rejects.toMatchObject({code:'invalid_input',httpStatus:400});
    expect(quote(SAMPLE)).toMatchObject({status:'ready_for_review',revision:0});
    expect(quoteRevisions(SAMPLE)).toEqual([]);
    expect(conversationMessages('wasatch',CHAT)).toHaveLength(before);
    // Whitespace doesn't count against the limit.
    await expect(sendQuote(SAMPLE,{repId:'brandi',message:`${'x'.repeat(QUOTE_MESSAGE_MAX)}\n\n\n   `,now:SEND})).resolves.toBeTruthy();
  });

  it('carries no cost, margin, floor, Querent reasoning, internal note or freight reason',async()=>{
    addQuoteNote(SAMPLE,'brandi','SECRET-NOTE: they will pay list, push it',SEND);
    const q=newQuote({fulfillment:'delivery',conversationId:CHAT});
    overrideFreight(q.id,'brandi',{amount:80,reason:'SECRET-REASON: padding the freight'},'2026-09-23T16:30:00.000Z');
    addQuoteNote(q.id,'brandi','SECRET-NOTE-2',SEND);
    for(const id of [SAMPLE,q.id]){
      const {message}=await sendQuote(id,{repId:'brandi',message:'Hi Dana',now:SEND});
      const json=JSON.stringify(message);
      expect(json).not.toMatch(/SECRET|cost|margin|floor|basis|explanation|suggested|why/i);
      expect(Object.keys(message.payload as object).sort()).toEqual(['attach_pdf','headline','pdf_url','quote_id','quote_number','revision','total','valid_until']);
    }
  });

  it('writes no message when the send is refused (a blocker, a double send)',async()=>{
    const blocked=newQuote({conversationId:CHAT,lines:[{itemId:'HCS-12-13-2G8',qty:10,unitPrice:null}]});
    const before=conversationMessages('wasatch',CHAT).length;
    await expect(sendQuote(blocked.id,{repId:'brandi',message:'Hi',now:SEND})).rejects.toMatchObject({code:'send_blocked'});
    expect(conversationMessages('wasatch',CHAT)).toHaveLength(before);
    await sendQuote(SAMPLE,{repId:'brandi',message:'Hi',now:SEND});
    await expect(sendQuote(SAMPLE,{repId:'brandi',message:'Hi again',now:SEND})).rejects.toMatchObject({code:'illegal_transition'});
    expect(readyMessages('wasatch',CHAT).map(m=>m.content)).toEqual(['Hi']);
  });

  it('posts one message per revision: rev 2 after a change request is a second message',async()=>{
    const {requestChanges}=await import('./service');
    await sendQuote(SAMPLE,{repId:'brandi',message:'First',now:SEND});
    requestChanges('wasatch',SAMPLE,{revision:1,note:'Make the gloves size XL',now:'2026-09-24T09:00:00.000Z'});
    await sendQuote(SAMPLE,{repId:'brandi',message:'Second',now:'2026-09-24T10:00:00.000Z'});
    expect(readyMessages('wasatch',CHAT).map(m=>[m.content,(m.payload as {revision:number}).revision])).toEqual([['First',1],['Second',2]]);
  });

  it('is removed by Reset sample quote with the rest of the sample’s chat',async()=>{
    await sendQuote(SAMPLE,{repId:'brandi',message:'Hi',now:SEND});
    resetSample();
    expect(readyMessages('wasatch',CHAT)).toEqual([]);
  });
});

describe('which conversation: the quote’s own, else the customer’s latest, else a new one',()=>{
  it('uses the customer’s most recently active conversation for a quote with no chat (a duplicate, a seeded quote)',async()=>{
    createConversation({id:'conv-later',customerId:'wasatch',contactId:'dana',at:'2026-09-23T16:40:00.000Z'});
    const q=newQuote();
    expect(q.conversation_id).toBeNull();
    const {message}=await sendQuote(q.id,{repId:'brandi',message:'Here it is',now:SEND});
    expect(message.conversation_id).toBe('conv-later');
    expect(readyMessages('wasatch','conv-later').map(m=>m.content)).toEqual(['Here it is']);
  });

  it('starts a conversation for the quote’s contact when the customer has none',async()=>{
    const q=createQuote({customerId:'great-basin',fulfillment:'will_call',branchId:'slc',at:'2026-09-23T16:00:00.000Z',lines:[{itemId:'HCS-12-13-2G8',qty:1,unitPrice:40}]});
    const {message}=await sendQuote(q.id,{repId:'brandi',now:SEND});
    expect(message.conversation_id).toEqual(expect.any(String));
    expect(conversationMessages('great-basin',message.conversation_id)).toEqual([message]);
    // Never another customer's chat.
    expect(allReady('wasatch',[CHAT,'conv-later']).some(m=>(m.payload as {quote_id:string}).quote_id===q.id)).toBe(false);
  });
});

describe('expected: what the rep confirmed (Confirm send names the revision and the total)',()=>{
  beforeEach(()=>{resetSample();});

  it('sends when the revision and total are what the rep confirmed',async()=>{
    const {revision}=await sendQuote(SAMPLE,{repId:'brandi',expected:{revision:1,total:1122.4},now:SEND});
    expect(revision).toMatchObject({revision:1,total:1122.4});
  });

  it('refuses (conflict) a total that changed since the rep confirmed it, writing nothing',async()=>{
    const before=conversationMessages('wasatch',CHAT).length;
    const error=await sendQuote(SAMPLE,{repId:'brandi',expected:{revision:1,total:1109.5},now:SEND}).catch(e=>e);
    expect(error).toMatchObject({code:'conflict',httpStatus:409,message:'Q-24817 now totals $1,122.40, not the $1,109.50 you confirmed. Review it and send again.'});
    expect(quote(SAMPLE)).toMatchObject({status:'ready_for_review',revision:0});
    expect(quoteRevisions(SAMPLE)).toEqual([]);
    expect(conversationMessages('wasatch',CHAT)).toHaveLength(before);
  });

  it('refuses (conflict) a revision other than the one confirmed',async()=>{
    const error=await sendQuote(SAMPLE,{repId:'brandi',expected:{revision:2,total:1122.4},now:SEND}).catch(e=>e);
    expect(error).toMatchObject({code:'conflict',message:'Q-24817 would go out as rev 1, not the rev 2 you confirmed. Review it and send again.'});
    expect(quoteRevisions(SAMPLE)).toEqual([]);
  });

  it('compares totals to the cent',async()=>{
    await expect(sendQuote(SAMPLE,{repId:'brandi',expected:{revision:1,total:1122.4000000001},now:SEND})).resolves.toBeTruthy();
  });
});
