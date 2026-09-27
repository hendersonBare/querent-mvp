// @vitest-environment node
import {beforeEach,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// Approve & send from the rep portal (task 3.7; spec §4, §5.4): the signed-in rep's own quote
// only, sent by the quote's own rep, one send per click, and the fresh detail back. The send
// itself is task 1.5's sendQuote, which also posts the quote in the customer's chat.
useSeededDatabase();

const NOW='2026-09-25T18:00:00.000Z';
const load=async()=>({
  send:await import('./quote-send'),
  repo:await import('@/server/repository'),
  service:await import('@/server/quotes/service'),
});
const rejected=async(promise:Promise<unknown>)=>{try{await promise;}catch(error){return error;}throw new Error('expected a rejection');};
/** What Confirm send showed for the sample: rev 1 at $1,122.40. */
const CONFIRMED={message:'Hi Dana, your quote is ready.',attach_pdf:true,revision:1,total:1122.4};

beforeEach(async()=>{(await import('@/server/quotes/service')).resetSample();});

describe('sendRepQuote',()=>{
  it('sends the rep’s quote as rev 1 and answers the fresh, read-only detail with what was sent',async()=>{
    const {send,repo}=await load();
    const {value,replayed}=await send.sendRepQuote('brandi','Q-24817',CONFIRMED,{now:NOW});
    expect(replayed).toBe(false);
    expect(value.sent).toEqual({quote_id:'q-24817',quote_number:'Q-24817',revision:1,total:1122.4,valid_until:'2026-10-09',attach_pdf:true,
      conversation_id:'conv-q-24817',message_id:expect.any(String),headline:'Quote Q-24817 is ready: $1,122.40, valid until Oct 9'});
    expect(value.detail.quote).toMatchObject({id:'q-24817',status:'sent',revision:1,sent_at:NOW,valid_until:'2026-10-09'});
    expect(value.detail.editable).toBe(false);
    // The snapshot and the chat message are stored.
    expect(repo.quoteRevision('q-24817',1)).toMatchObject({sent_by:'brandi',message:'Hi Dana, your quote is ready.',attach_pdf:true,total:1122.4,snapshot:{quote_number:'Q-24817',revision:1,total:1122.4}});
    expect(repo.conversationMessages('wasatch','conv-q-24817').at(-1)).toMatchObject({id:value.sent.message_id,kind:'quote_ready',content:'Hi Dana, your quote is ready.'});
    // Activity shows it, newest last.
    expect(value.detail.panels.activity.at(-1)).toMatchObject({kind:'sent',message:'Brandi Gallegos sent Q-24817 rev 1 to Dana ($1,122.40)'});
  });

  it('sends as the quote’s own rep (quote.rep_id), not whoever the customer is assigned to now',async()=>{
    const {send,repo}=await load();
    repo.setAssignedRep('wasatch','mara');
    try{
      await send.sendRepQuote('brandi','Q-24817',CONFIRMED,{now:NOW});
      expect(repo.quoteRevision('q-24817',1)?.sent_by).toBe('brandi');
    }finally{repo.setAssignedRep('wasatch','brandi');}
  });

  it('reads another rep’s quote, or an unknown one, as not found, sending nothing',async()=>{
    const {send,repo}=await load();
    const other=repo.createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'GLV-N8-L-1000',qty:1,unitPrice:82}]});
    expect(await rejected(send.sendRepQuote('brandi',other.quote_number,{...CONFIRMED,total:82},{now:NOW}))).toMatchObject({code:'not_found',httpStatus:404});
    expect(await rejected(send.sendRepQuote('brandi','Q-99999',CONFIRMED,{now:NOW}))).toMatchObject({code:'not_found'});
    expect(repo.quote(other.id)).toMatchObject({status:'ready_for_review'});
  });

  it('makes one send of a double click: a repeat of the key, even mid-flight, gets the same send back',async()=>{
    const {send,repo}=await load();
    const [first,second]=await Promise.all([
      send.sendRepQuote('brandi','Q-24817',CONFIRMED,{idempotencyKey:'confirm-1',now:NOW}),
      send.sendRepQuote('brandi','Q-24817',CONFIRMED,{idempotencyKey:'confirm-1',now:NOW}),
    ]);
    expect([first.replayed,second.replayed]).toEqual([false,true]);
    expect(second.value).toEqual(first.value);
    expect(repo.quoteRevisions('q-24817')).toHaveLength(1);
    expect(repo.conversationMessages('wasatch','conv-q-24817').filter(m=>m.kind==='quote_ready')).toHaveLength(1);
    expect(repo.quoteActivity('q-24817').filter(a=>a.kind==='sent')).toHaveLength(1);
  });

  it('refuses a second send without the key (another tab): the status guard stops it (409)',async()=>{
    const {send,repo}=await load();
    const results=await Promise.allSettled([
      send.sendRepQuote('brandi','Q-24817',CONFIRMED,{idempotencyKey:'tab-a',now:NOW}),
      send.sendRepQuote('brandi','Q-24817',CONFIRMED,{idempotencyKey:'tab-b',now:NOW}),
    ]);
    expect(results.map(r=>r.status).sort()).toEqual(['fulfilled','rejected']);
    expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'illegal_transition',httpStatus:409}});
    expect(await rejected(send.sendRepQuote('brandi','Q-24817',CONFIRMED,{now:NOW}))).toMatchObject({code:'illegal_transition'});
    expect(repo.quoteRevisions('q-24817')).toHaveLength(1);
  });

  it('refuses a quote that changed since Confirm send (409 conflict), sending nothing',async()=>{
    const {send,repo}=await load();
    expect(await rejected(send.sendRepQuote('brandi','Q-24817',{...CONFIRMED,total:1109.5},{idempotencyKey:'stale',now:NOW})))
      .toMatchObject({code:'conflict',message:'Q-24817 now totals $1,122.40, not the $1,109.50 you confirmed. Review it and send again.'});
    expect(repo.quote('q-24817')).toMatchObject({status:'ready_for_review',revision:0});
    // The refusal isn't remembered: the same key sends once the rep confirms the real total.
    expect((await send.sendRepQuote('brandi','Q-24817',CONFIRMED,{idempotencyKey:'stale',now:NOW})).value.sent.revision).toBe(1);
  });

  it('refuses an unfinished quote (422 send_blocked) with the blockers',async()=>{
    const {send,repo}=await load();
    repo.updateQuoteLine('q-24817','q-24817-1',{unitPrice:null},NOW);
    const error=await rejected(send.sendRepQuote('brandi','Q-24817',CONFIRMED,{now:NOW}));
    expect(error).toMatchObject({code:'send_blocked',httpStatus:422,blockers:[{code:'no_price',line_id:'q-24817-1'}]});
  });

  it('validates the body (400) before sending: known fields only, the confirmed revision and total required',async()=>{
    const {send,repo}=await load();
    const bad:[unknown,RegExp][]=[
      [undefined,/Send needs/],
      ['hello',/Send needs/],
      [{...CONFIRMED,revision:undefined},/revision/],
      [{...CONFIRMED,revision:0},/revision/],
      [{...CONFIRMED,total:undefined},/total/],
      [{...CONFIRMED,total:-1},/total/],
      [{...CONFIRMED,total:Number.NaN},/total/],
      [{...CONFIRMED,attach_pdf:'yes'},/Attach PDF/],
      [{...CONFIRMED,message:42},/message/],
      [{...CONFIRMED,message:'x'.repeat(20_001)},/message/],
      [{...CONFIRMED,channel:'email'},/channel/],
      [{...CONFIRMED,unit_price:1},/unit_price/],
    ];
    for(const [body,message] of bad){
      const error=await rejected(send.sendRepQuote('brandi','Q-24817',body,{now:NOW}));
      expect(error,JSON.stringify(body)).toMatchObject({code:'invalid_input',httpStatus:400,message:expect.stringMatching(message)});
    }
    expect(repo.quote('q-24817')).toMatchObject({status:'ready_for_review'});
  });

  it('defaults to Attach PDF on and no message',async()=>{
    const {send,repo}=await load();
    await send.sendRepQuote('brandi','Q-24817',{revision:1,total:1122.4},{now:NOW});
    expect(repo.quoteRevision('q-24817',1)).toMatchObject({attach_pdf:true,message:null});
  });
});
