import {beforeEach,describe,expect,it} from 'vitest';
import type {NewQuote} from '@/domain';
import {overrideFreight} from '@/server/freight/quote';
import {
  createQuote,customerQuote,customerStats,quote,quoteActivity,quoteRevision,quoteRevisions,quotes,updateQuoteFulfillment,updateQuoteLine,updateQuoteTerms,
} from '@/server/repository';
import {SEED_DATE,useSeededDatabase} from '@/server/repository/test-db';
import {QuoteActionError} from './errors';
import {customerCanRespond,winRate} from './lifecycle';
import {acceptQuote,duplicateQuote,expireOverdueQuotes,expireQuote,requestChanges,resetSample,sendCheck,sendQuote} from './service';

// Spec §5.4 lifecycle against the seeded database. useSeededDatabase pins QUERENT_SEED_DATE to
// 2026-09-23 (the mockup's day), so every date below is fixed.
useSeededDatabase();

const SAMPLE='q-24817';
/** Sent the day Dana asked (Sep 23), 14 days: valid until Oct 7, as in the mockup. */
const SEND='2026-09-23T17:00:00.000Z';
const LAST_VALID_MS='2026-10-07T23:59:59.999Z',EXPIRED='2026-10-08T00:00:00.000Z';
const PICKUP='2026-09-24T15:00:00.000Z';

function caught(fn:()=>unknown):QuoteActionError{
  try{fn();}catch(error){if(error instanceof QuoteActionError)return error;throw error;}
  throw new Error('Expected a QuoteActionError.');
}
const counts=(id:string)=>({revisions:quoteRevisions(id).length,activity:quoteActivity(id).length});
const lastActivity=(id:string)=>quoteActivity(id).at(-1)!;

/** A priced Wasatch will-call quote: 10 boxes of bolts at $31.50 from SLC. */
const newQuote=(input:Partial<NewQuote>={})=>createQuote({customerId:'wasatch',contactId:'dana',fulfillment:'will_call',branchId:'slc',at:'2026-09-23T16:00:00.000Z',
  lines:[{itemId:'HCS-12-13-2G8',qty:10,unitPrice:31.5,priceBasis:'last_paid'}],...input});
const sentQuote=async(sentAt=SEND,input:Partial<NewQuote>={})=>(await sendQuote(newQuote(input).id,{repId:'brandi',now:sentAt})).quote;

describe('seeded history: lost quotes are stored as expired (task 0.2)',()=>{
  // Runs first, before other tests add quotes.
  const NOW=`${SEED_DATE}T18:00:00.000Z`;
  it('counts 17 won and 7 lost Wasatch quotes plus the open sample and three aging quotes (task A2): 71%, as the Customer panel does',()=>{
    expect(SEED_DATE).toBe('2026-09-23');
    const rate=winRate(quotes({customerId:'wasatch'}),NOW);
    expect(rate).toMatchObject({won:17,lost:7,open:4});
    expect(Math.round(rate.rate!*100)).toBe(71);
    expect(customerStats('wasatch')).toMatchObject({quotes_accepted:17,quotes_lost:7,win_rate:rate.rate});
  });

  it('refuses a customer action on a seeded lost quote as expired, writing nothing',()=>{
    const before=counts('q-24815');
    expect(caught(()=>acceptQuote('wasatch','Q-24815',{revision:1,fulfillmentTime:PICKUP,customerPo:'1',now:NOW}))).toMatchObject({code:'expired'});
    expect(caught(()=>requestChanges('wasatch','Q-24815',{revision:1,note:'x',now:NOW}))).toMatchObject({code:'expired'});
    expect(counts('q-24815')).toEqual(before);
  });
});

describe('sendCheck: what the Approve & send dialog shows',()=>{
  beforeEach(()=>{resetSample();});

  it('lets the sample quote go: no blockers, rev 1 next, $1,122.40 will call, the gloves line below floor (warn only)',async()=>{
    expect(await sendCheck(SAMPLE)).toMatchObject({quote_id:SAMPLE,quote_number:'Q-24817',status:'ready_for_review',revision:1,can_send:true,status_problem:null,blockers:[],
      below_floor_count:1,subtotal:1122.4,total:1122.4,freight:{amount:0,unresolved:false}});
  });

  it('refuses a status that can\'t be sent, with the reason',async()=>{
    await sendQuote(SAMPLE,{repId:'brandi',now:SEND});
    expect(await sendCheck(SAMPLE)).toMatchObject({can_send:false,status_problem:'Can\'t send Q-24817: it is Sent.',blockers:[]});
  });

  it('blocks call for freight until the rep overrides it (St. George is beyond the 75 mi radius)',async()=>{
    const q=newQuote({fulfillment:'delivery',shipTo:{address:'100 S Main St, St. George, UT 84770',lat:37.0965,lng:-113.5684}});
    expect(await sendCheck(q.id)).toMatchObject({can_send:false,total:null,blockers:[{code:'call_for_freight'}]});
    overrideFreight(q.id,'brandi',{amount:180,reason:'LTL carrier quote'},'2026-09-23T16:30:00.000Z');
    expect(await sendCheck(q.id)).toMatchObject({can_send:true,blockers:[],subtotal:315,total:495});
  });

  it('still blocks a delivery with no ship-to after a freight override (override clears call-for-freight only)',async()=>{
    const q=newQuote({fulfillment:'delivery',shipTo:null});
    expect((await sendCheck(q.id)).blockers.map(b=>b.code)).toEqual(['no_ship_to','call_for_freight']);
    overrideFreight(q.id,'brandi',{amount:40,reason:'Flat rate'},'2026-09-23T16:30:00.000Z');
    const check=await sendCheck(q.id);
    expect(check.freight).toMatchObject({unresolved:false,amount:40});
    expect(check.blockers.map(b=>b.code)).toEqual(['no_ship_to']);
    const before=counts(q.id);
    const error=await sendQuote(q.id,{repId:'brandi',now:SEND}).catch(e=>e);
    expect(error).toMatchObject({code:'send_blocked',httpStatus:422,blockers:[{code:'no_ship_to'}]});
    expect(quote(q.id)).toMatchObject({status:'ready_for_review',revision:0});
    expect(counts(q.id)).toEqual(before);
  });

  it('lists line blockers: no lines, qty 0, no price',async()=>{
    expect((await sendCheck(newQuote({lines:[]}).id)).blockers.map(b=>b.code)).toEqual(['no_lines']);
    const q=newQuote({lines:[{itemId:'HCS-12-13-2G8',qty:0,unitPrice:31.5},{itemId:'HN-12-13-G8',qty:5,unitPrice:null}]});
    expect((await sendCheck(q.id)).blockers).toEqual([
      {code:'zero_qty',line_id:`${q.id}-1`,message:'Line 1 (HCS-12-13-2G8) has a quantity of 0.'},
      {code:'no_price',line_id:`${q.id}-2`,message:'Line 2 (HN-12-13-G8) has no price.'},
    ]);
  });

  it('throws not_found for an unknown quote',async()=>{
    await expect(sendCheck('q-nope')).rejects.toMatchObject({code:'not_found',httpStatus:404});
  });
});

describe('send: ready_for_review --> sent (rev 1)',()=>{
  beforeEach(()=>{resetSample();});

  it('stores rev 1 with a frozen snapshot, sets valid_until, flags the customer, and logs it',async()=>{
    const {quote:sent,revision}=await sendQuote(SAMPLE,{repId:'brandi',message:'Hi Dana, here is your quote.',now:SEND});
    expect(sent).toMatchObject({status:'sent',revision:1,sent_at:SEND,valid_until:'2026-10-07',updated_at:SEND,unread_for_customer:true,unread_for_rep:false});
    expect(revision).toMatchObject({id:'q-24817-r1',revision:1,sent_at:SEND,sent_by:'brandi',message:'Hi Dana, here is your quote.',attach_pdf:true,total:1122.4});
    expect(revision.snapshot).toEqual({quote_number:'Q-24817',revision:1,sent_at:SEND,customer:{name:'Wasatch Mechanical Contractors',account_number:'WAS-1142'},contact:'Dana Ortiz',
      rep:'Brandi Gallegos',fulfillment:'will_call',branch:'SLC',ship_to:null,valid_days:14,valid_until:'2026-10-07',customer_po:null,customer_note:null,subtotal:1122.4,freight:0,total:1122.4,
      freight_miles:null,
      // What the customer PDF prints around the quote, frozen at send (task 4.1).
      terms:'Net 30',
      rep_contact:{name:'Brandi Gallegos',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'},
      letterhead:{supplier:'Herrick Industrial Supply',website:'herrickindustrial.com',branch:'Salt Lake City',address:'1480 W 2100 S',city:'Salt Lake City',state:'UT',zip:'84119',phone:'(801) 555-0120'},
      lines:[
        {sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',pack:'Box of 50',qty:10,unit_price:31.5,total:315},
        {sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',qty:6,unit_price:36,total:216},
        {sku:'GLV-N8-L-1000',description:expect.any(String),pack:expect.any(String),qty:4,unit_price:79,total:316},
        {sku:'RS-2-27-JH',description:expect.any(String),pack:expect.any(String),qty:12,unit_price:22.95,total:275.4},
      ]});
    expect(lastActivity(SAMPLE)).toMatchObject({actor:'rep',actor_id:'brandi',kind:'sent',at:SEND,message:'Brandi Gallegos sent Q-24817 rev 1 to Dana ($1,122.40)'});
    expect(customerQuote('wasatch','Q-24817')).toMatchObject({status:'sent',revision:1,total:1122.4,unread:true,sent:{revision:1,message:'Hi Dana, here is your quote.',snapshot:{valid_until:'2026-10-07',total:1122.4}}});
  });

  it('freezes the terms: valid days, PO, the note printed on the quote, and the delivery ship-to',async()=>{
    const q=newQuote({fulfillment:'delivery',validDays:7,customerNote:'Call before delivery.'});
    updateQuoteTerms(q.id,{customerPo:'JOB-12'},'2026-09-23T16:10:00.000Z');
    const {revision}=await sendQuote(q.id,{repId:'brandi',attachPdf:false,now:SEND});
    expect(revision).toMatchObject({attach_pdf:false,message:null,total:377.5});
    expect(revision.snapshot).toMatchObject({fulfillment:'delivery',ship_to:'1800 W 10950 S, South Jordan, UT 84095',valid_days:7,valid_until:'2026-09-30',customer_po:'JOB-12',
      customer_note:'Call before delivery.',subtotal:315,freight:62.5,total:377.5});
    expect(customerQuote('wasatch',q.id)?.sent?.snapshot).toMatchObject({ship_to:'1800 W 10950 S, South Jordan, UT 84095',customer_po:'JOB-12',customer_note:'Call before delivery.',sent_at:SEND,valid_days:7});
  });

  it('sends with the expiration date the rep picked: valid_until is that day, and the snapshot counts its days',async()=>{
    const q=newQuote();
    updateQuoteTerms(q.id,{expiresOn:'2026-11-17'},'2026-09-23T16:10:00.000Z');
    const {quote:sent,revision}=await sendQuote(q.id,{repId:'brandi',now:SEND});
    expect(sent.valid_until).toBe('2026-11-17');
    expect(revision.snapshot).toMatchObject({valid_until:'2026-11-17',valid_days:55});
    // Valid through Nov 17, expired from Nov 18.
    expect(customerCanRespond(sent,'2026-11-17T23:59:59.000Z')).toBe(true);
    expect(expireOverdueQuotes({now:'2026-11-18T00:00:00.000Z'})).toContain(q.quote_number);
  });

  it('won\'t send once the picked expiration date has passed (send_blocked), and sendCheck says why',async()=>{
    const q=newQuote();
    updateQuoteTerms(q.id,{expiresOn:'2026-09-23'},'2026-09-22T16:10:00.000Z');
    const message='The expiration date (Sep 23, 2026) has passed: pick a later one before sending.';
    expect(await sendCheck(q.id,{now:SEND})).toMatchObject({can_send:false,blockers:[{code:'expiration_passed',line_id:null,message}]});
    const before=counts(q.id);
    expect(await sendQuote(q.id,{repId:'brandi',now:SEND}).catch(e=>e)).toMatchObject({code:'send_blocked',httpStatus:422});
    expect(counts(q.id)).toEqual(before);
    // The day before, it could go.
    expect((await sendCheck(q.id,{now:'2026-09-22T17:00:00.000Z'})).can_send).toBe(true);
  });

  it('rejects a double send and writes nothing the second time',async()=>{
    await sendQuote(SAMPLE,{repId:'brandi',now:SEND});
    const before=counts(SAMPLE);
    const error=await sendQuote(SAMPLE,{repId:'brandi',now:'2026-09-23T17:01:00.000Z'}).catch(e=>e);
    expect(error).toMatchObject({code:'illegal_transition',httpStatus:409,message:'Can\'t send Q-24817: it is Sent.'});
    expect(counts(SAMPLE)).toEqual(before);
    expect(quote(SAMPLE)).toMatchObject({revision:1,sent_at:SEND});
  });

  it('lets exactly one of two concurrent sends win',async()=>{
    const results=await Promise.allSettled([sendQuote(SAMPLE,{repId:'brandi',now:SEND}),sendQuote(SAMPLE,{repId:'brandi',now:SEND})]);
    expect(results.map(r=>r.status).sort()).toEqual(['fulfilled','rejected']);
    expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'illegal_transition'}});
    expect(quoteRevisions(SAMPLE).map(r=>r.revision)).toEqual([1]);
    expect(quoteActivity(SAMPLE).filter(a=>a.kind==='sent')).toHaveLength(1);
  });

  it('refuses to send a draft edited while freight was being priced (the rep confirmed the old one)',async()=>{
    const before=counts(SAMPLE);
    const sending=sendQuote(SAMPLE,{repId:'brandi',now:SEND});
    updateQuoteLine(SAMPLE,'q-24817-1',{qty:11},'2026-09-23T16:59:00.000Z');
    await expect(sending).rejects.toMatchObject({code:'conflict',httpStatus:409});
    expect(quote(SAMPLE)).toMatchObject({status:'ready_for_review',revision:0});
    expect(counts(SAMPLE)).toEqual(before);
  });

  it('refuses an unknown rep or quote, writing nothing',async()=>{
    await expect(sendQuote(SAMPLE,{repId:'nobody',now:SEND})).rejects.toMatchObject({code:'invalid_input'});
    await expect(sendQuote('q-nope',{repId:'brandi',now:SEND})).rejects.toMatchObject({code:'not_found'});
    expect(quote(SAMPLE)).toMatchObject({status:'ready_for_review',revision:0});
  });

  it('refuses a malformed send time',async()=>{
    await expect(sendQuote(SAMPLE,{repId:'brandi',now:'tomorrow'})).rejects.toBeInstanceOf(RangeError);
    expect(quote(SAMPLE)).toMatchObject({status:'ready_for_review'});
  });
});

describe('customer response: sent --> changes_requested --> sent (rev 2) --> accepted',()=>{
  const REQUEST='2026-09-24T09:00:00.000Z',RESEND='2026-09-25T15:00:00.000Z',ACCEPT='2026-09-25T16:00:00.000Z';
  let rev1Snapshot:unknown;

  it('refuses Request changes with an empty or blank note',async()=>{
    resetSample();
    await sendQuote(SAMPLE,{repId:'brandi',now:SEND});
    rev1Snapshot=structuredClone(quoteRevision(SAMPLE,1)!.snapshot);
    const before=counts(SAMPLE);
    for(const note of ['','   \n\t',undefined as unknown as string])expect(caught(()=>requestChanges('wasatch',SAMPLE,{revision:1,note,now:REQUEST}))).toMatchObject({code:'invalid_input',httpStatus:400});
    expect(quote(SAMPLE)).toMatchObject({status:'sent',change_request_note:null});
    expect(counts(SAMPLE)).toEqual(before);
  });

  it('refuses another customer\'s quote as not found',()=>{
    expect(caught(()=>requestChanges('great-basin',SAMPLE,{revision:1,note:'x',now:REQUEST}))).toMatchObject({code:'not_found'});
    expect(caught(()=>acceptQuote('great-basin','Q-24817',{revision:1,fulfillmentTime:PICKUP,customerPo:'1',now:REQUEST}))).toMatchObject({code:'not_found'});
  });

  it('records the note, flags the rep, and logs it',()=>{
    const q=requestChanges('wasatch','Q-24817',{revision:1,note:'  Can you do 20 boxes of the bolts?  ',now:REQUEST});
    expect(q).toMatchObject({status:'changes_requested',revision:1,change_request_note:'Can you do 20 boxes of the bolts?',responded_at:REQUEST,unread_for_rep:true,unread_for_customer:false});
    expect(lastActivity(SAMPLE)).toMatchObject({actor:'customer',actor_id:'dana',kind:'changes_requested',at:REQUEST,message:'Dana requested changes to Q-24817 rev 1: "Can you do 20 boxes of the bolts?"'});
    expect(quotes({statuses:['changes_requested']}).map(r=>[r.quote_number,r.change_request_note])).toEqual([
      ['Q-24790','Can you hold the anchors for pickup at Ogden instead?'],['Q-24817','Can you do 20 boxes of the bolts?']]); // Q-24790: the seed's aging quote (task A2)
  });

  it('allows no customer action while changes are requested',()=>{
    expect(caught(()=>acceptQuote('wasatch',SAMPLE,{revision:1,fulfillmentTime:PICKUP,customerPo:'7781',now:REQUEST}))).toMatchObject({code:'illegal_transition',message:'Can\'t accept Q-24817: it is Changes requested.'});
    expect(caught(()=>requestChanges('wasatch',SAMPLE,{revision:1,note:'again',now:REQUEST}))).toMatchObject({code:'illegal_transition'});
    expect(caught(()=>expireQuote(SAMPLE,{now:EXPIRED}))).toMatchObject({code:'illegal_transition'});
  });

  it('sends the edited draft as rev 2 with a new valid_until; rev 1 stays exactly as sent',async()=>{
    updateQuoteLine(SAMPLE,'q-24817-1',{qty:20},'2026-09-25T14:00:00.000Z');
    const {quote:sent,revision}=await sendQuote(SAMPLE,{repId:'brandi',now:RESEND});
    expect(sent).toMatchObject({status:'sent',revision:2,sent_at:RESEND,valid_until:'2026-10-09',unread_for_customer:true,unread_for_rep:false});
    expect(revision).toMatchObject({id:'q-24817-r2',revision:2,total:1437.4});
    expect(revision.snapshot.lines[0]).toMatchObject({sku:'HCS-12-13-2G8',qty:20,total:630});
    expect(quoteRevision(SAMPLE,1)!.snapshot).toEqual(rev1Snapshot);
    expect(quoteRevision(SAMPLE,1)!.total).toBe(1122.4);
    expect(customerQuote('wasatch',SAMPLE)).toMatchObject({revision:2,total:1437.4,sent:{revision:2}});
    expect(lastActivity(SAMPLE).message).toBe('Brandi Gallegos sent Q-24817 rev 2 to Dana ($1,437.40)');
  });

  it('refuses an Accept of the stale rev 1 (a second tab) as a conflict',()=>{
    expect(caught(()=>acceptQuote('wasatch',SAMPLE,{revision:1,fulfillmentTime:PICKUP,customerPo:'7781',now:ACCEPT}))).toMatchObject({code:'conflict',httpStatus:409,
      message:'Q-24817 rev 1 is out of date: rev 2 is the latest. Review it first.'});
    expect(quote(SAMPLE)?.status).toBe('sent');
  });

  it('refuses Accept without a pickup or delivery time, or without a PO',()=>{
    const before=counts(SAMPLE);
    for(const input of [{fulfillmentTime:'',customerPo:'7781'},{fulfillmentTime:'Thursday',customerPo:'7781'},{fulfillmentTime:'2026-02-30',customerPo:'7781'},{fulfillmentTime:PICKUP,customerPo:'  '},{fulfillmentTime:undefined as unknown as string,customerPo:'7781'},{fulfillmentTime:PICKUP,customerPo:null as unknown as string}])
      expect(caught(()=>acceptQuote('wasatch',SAMPLE,{revision:2,...input,now:ACCEPT}))).toMatchObject({code:'invalid_input'});
    expect(quote(SAMPLE)?.status).toBe('sent');
    expect(counts(SAMPLE)).toEqual(before);
  });

  it('accepts rev 2 with the time and PO, flags the rep, and logs it',()=>{
    const q=acceptQuote('wasatch',SAMPLE,{revision:2,fulfillmentTime:PICKUP,customerPo:' 7781 ',now:ACCEPT});
    expect(q).toMatchObject({status:'accepted',revision:2,fulfillment_time:PICKUP,customer_po:'7781',responded_at:ACCEPT,unread_for_rep:true,unread_for_customer:false,
      fulfillment:'will_call',branch_id:'slc'});
    expect(lastActivity(SAMPLE)).toMatchObject({actor:'customer',actor_id:'dana',kind:'accepted',at:ACCEPT,message:'Dana accepted Q-24817 rev 2 ($1,437.40) with PO 7781, pickup at SLC'});
    expect(customerQuote('wasatch',SAMPLE)).toMatchObject({status:'accepted',customer_po:'7781',fulfillment_time:PICKUP});
  });

  it('treats accepted as final: every event is illegal',async()=>{
    const before=counts(SAMPLE);
    await expect(sendQuote(SAMPLE,{repId:'brandi',now:ACCEPT})).rejects.toMatchObject({code:'illegal_transition'});
    expect(caught(()=>acceptQuote('wasatch',SAMPLE,{revision:2,fulfillmentTime:PICKUP,customerPo:'7781',now:ACCEPT}))).toMatchObject({code:'illegal_transition'});
    expect(caught(()=>requestChanges('wasatch',SAMPLE,{revision:2,note:'x',now:ACCEPT}))).toMatchObject({code:'illegal_transition'});
    expect(caught(()=>expireQuote(SAMPLE,{now:'2026-12-01T00:00:00.000Z'}))).toMatchObject({code:'illegal_transition'});
    expect(counts(SAMPLE)).toEqual(before);
  });

  it('logs one activity event per transition, in order',()=>{
    expect(quoteActivity(SAMPLE).map(a=>a.kind)).toEqual(['requested','matched','drafted','sent','changes_requested','sent','accepted']);
  });
});

describe('revision numbering',()=>{
  it('counts sends: rev 1, 2, 3, each stored once with its own snapshot',async()=>{
    const q=newQuote();
    const sends=['2026-09-23T17:00:00.000Z','2026-09-24T17:00:00.000Z','2026-09-25T17:00:00.000Z'];
    for(const [i,at] of sends.entries()){
      if(i>0)requestChanges('wasatch',q.id,{revision:i,note:`round ${i}`,now:at.replace('17:00','09:00')});
      const {revision}=await sendQuote(q.id,{repId:'brandi',now:at});
      expect(revision).toMatchObject({id:`${q.id}-r${i+1}`,revision:i+1,snapshot:{revision:i+1,quote_number:q.quote_number}});
    }
    expect(quoteRevisions(q.id).map(r=>[r.revision,r.sent_at])).toEqual(sends.map((at,i)=>[i+1,at]));
    expect(quote(q.id)).toMatchObject({revision:3,sent_at:sends[2],valid_until:'2026-10-09'});
  });

  it('starts a duplicate at rev 0, so its first send is rev 1',async()=>{
    const source=await sentQuote();
    const copy=duplicateQuote(source.id,{repId:'brandi',now:'2026-09-24T08:00:00.000Z'});
    expect(copy.revision).toBe(0);
    expect((await sendQuote(copy.id,{repId:'brandi',now:'2026-09-24T09:00:00.000Z'})).revision.revision).toBe(1);
  });
});

describe('expiry: sent --(now > valid_until)--> expired',()=>{
  it('accepts at the last millisecond of valid_until',async()=>{
    const q=await sentQuote();
    expect(q.valid_until).toBe('2026-10-07');
    expect(customerCanRespond(q,LAST_VALID_MS)).toBe(true);
    expect(acceptQuote('wasatch',q.id,{revision:1,fulfillmentTime:'2026-10-08',customerPo:'9001',now:LAST_VALID_MS})).toMatchObject({status:'accepted',fulfillment_time:'2026-10-08'});
  });

  it('refuses Accept once valid_until has passed, and stores the expiry it found',async()=>{
    const q=await sentQuote();
    const error=caught(()=>acceptQuote('wasatch',q.id,{revision:1,fulfillmentTime:PICKUP,customerPo:'9001',now:EXPIRED}));
    expect(error).toMatchObject({code:'expired',httpStatus:409,message:`${q.quote_number} expired: it was valid until 2026-10-07. Ask your rep for a new quote.`});
    expect(quote(q.id)).toMatchObject({status:'expired',customer_po:null,updated_at:EXPIRED});
    expect(lastActivity(q.id)).toMatchObject({actor:'system',actor_id:null,kind:'expired',at:EXPIRED,message:`${q.quote_number} rev 1 expired without a response`});
    // Once stored as expired, it still reads as expired, not as an illegal move.
    expect(caught(()=>acceptQuote('wasatch',q.id,{revision:1,fulfillmentTime:PICKUP,customerPo:'9001',now:EXPIRED}))).toMatchObject({code:'expired'});
    expect(quoteActivity(q.id).filter(a=>a.kind==='expired')).toHaveLength(1);
  });

  it('refuses Request changes after expiry too (the whole action bar is disabled)',async()=>{
    const q=await sentQuote();
    expect(caught(()=>requestChanges('wasatch',q.id,{revision:1,note:'Still need these',now:'2026-10-20T12:00:00.000Z'}))).toMatchObject({code:'expired'});
    expect(quote(q.id)?.status).toBe('expired');
  });

  it('expires a quote only after valid_until: not at its first instant, nor its last millisecond',async()=>{
    const q=await sentQuote();
    for(const now of ['2026-10-07T00:00:00.000Z',LAST_VALID_MS])
      expect(caught(()=>expireQuote(q.id,{now}))).toMatchObject({code:'illegal_transition',message:`${q.quote_number} is valid until 2026-10-07; it can't expire before then.`});
    expect(expireQuote(q.id,{now:EXPIRED})).toMatchObject({status:'expired',updated_at:EXPIRED});
    expect(caught(()=>expireQuote(q.id,{now:EXPIRED}))).toMatchObject({code:'illegal_transition'});
  });

  it('only expires sent quotes: a draft never expires',()=>{
    const q=newQuote();
    expect(caught(()=>expireQuote(q.id,{now:'2027-01-01T00:00:00.000Z'}))).toMatchObject({code:'illegal_transition',message:`Can't expire ${q.quote_number}: it is Awaiting rep.`});
  });

  it('sweeps every overdue sent quote, dating each expiry at 00:00Z after its valid_until',async()=>{
    expireOverdueQuotes({now:'2027-01-01T00:00:00.000Z'});
    const due=await sentQuote('2026-09-23T17:00:00.000Z');
    const notDue=await sentQuote('2026-09-24T17:00:00.000Z');
    expect(expireOverdueQuotes({now:'2026-10-08T12:00:00.000Z'})).toEqual([due.quote_number]);
    expect(quote(due.id)).toMatchObject({status:'expired',updated_at:EXPIRED});
    expect(lastActivity(due.id)).toMatchObject({kind:'expired',at:EXPIRED});
    expect(quote(notDue.id)?.status).toBe('sent');
    expect(expireOverdueQuotes({now:'2026-10-08T12:00:00.000Z'})).toEqual([]);
    expect(expireOverdueQuotes({now:'2026-10-09T00:00:00.000Z'})).toEqual([notDue.quote_number]);
  });

  it('lets the rep duplicate an expired quote into a new ready_for_review quote',async()=>{
    const q=await sentQuote();
    expireQuote(q.id,{now:EXPIRED});
    expect(duplicateQuote(q.id,{repId:'brandi',now:'2026-10-08T09:00:00.000Z'})).toMatchObject({status:'ready_for_review',duplicated_from:q.id});
  });
});

describe('duplicate',()=>{
  it('copies the draft into a new ready_for_review quote, without the send, response, PO or picked expiration date',async()=>{
    const source=newQuote({fulfillment:'delivery',requestedDate:'2026-09-25',validDays:30,customerNote:'Gate code 4411.',requestText:'bolts and nuts',
      lines:[{itemId:'HCS-12-13-2G8',qty:10,unitPrice:31.5,priceBasis:'last_paid',suggestedPrice:31.5,suggestedBasis:'last_paid',customerPrice:30.95,explanation:'Last paid $31.50.',requestedText:'bolts',matchScore:0.92},
        {itemId:'HN-12-13-G8',qty:0,unitPrice:null,addedBy:'upsell'}]});
    updateQuoteFulfillment(source.id,{shipTo:{address:'1 Job Site Rd, Ogden, UT 84401',lat:41.2,lng:-111.97}},'2026-09-23T16:01:00.000Z');
    overrideFreight(source.id,'brandi',{amount:75,reason:'Crane truck'},'2026-09-23T16:02:00.000Z');
    updateQuoteTerms(source.id,{customerPo:'OLD-PO',expiresOn:'2026-10-01'},'2026-09-23T16:03:00.000Z');
    const src=quote(source.id)!;
    const DUP='2026-09-26T10:00:00.000Z';
    const copy=duplicateQuote(src.quote_number,{repId:'brandi',now:DUP});
    expect(copy.id).not.toBe(src.id);
    expect(copy).toMatchObject({status:'ready_for_review',revision:0,duplicated_from:src.id,customer_id:'wasatch',contact_id:'dana',rep_id:'brandi',conversation_id:src.conversation_id,
      request_text:'bolts and nuts',requested_at:DUP,created_at:DUP,sent_at:null,responded_at:null,valid_until:null,expires_on:null,fulfillment_time:null,customer_po:null,change_request_note:null,
      fulfillment:'delivery',branch_id:'slc',requested_date:'2026-09-25',ship_to_address:'1 Job Site Rd, Ogden, UT 84401',ship_to_lat:41.2,ship_to_lng:-111.97,
      freight_override:75,freight_override_reason:'Crane truck',valid_days:30,customer_note:'Gate code 4411.',is_sample:false,unread_for_rep:false,unread_for_customer:false});
    const keep=({item_id,qty,unit_price,price_basis,suggested_price,suggested_basis,customer_price,explanation,requested_text,match_score,added_by,line_no}:typeof src.lines[number])=>
      ({item_id,qty,unit_price,price_basis,suggested_price,suggested_basis,customer_price,explanation,requested_text,match_score,added_by,line_no});
    expect(copy.lines.map(keep)).toEqual(src.lines.map(keep));
    expect(quoteRevisions(copy.id)).toEqual([]);
    expect(quoteActivity(copy.id).map(a=>[a.kind,a.actor_id,a.message])).toEqual([
      ['duplicated','brandi',`Brandi Gallegos duplicated ${src.quote_number} as ${copy.quote_number}`],
      ['freight_override','brandi','Freight set to $75.00: Crane truck'],
    ]);
    expect(lastActivity(src.id)).toMatchObject({kind:'duplicated',at:DUP,message:`Brandi Gallegos duplicated ${src.quote_number} as ${copy.quote_number}`});
    expect(quote(src.id)).toMatchObject({status:src.status,updated_at:src.updated_at});
  });

  it('duplicates from any status, including accepted',async()=>{
    const q=await sentQuote();
    acceptQuote('wasatch',q.id,{revision:1,fulfillmentTime:PICKUP,customerPo:'1',now:'2026-09-23T18:00:00.000Z'});
    expect(duplicateQuote(q.id,{repId:'brandi',now:'2026-09-23T19:00:00.000Z'})).toMatchObject({status:'ready_for_review',duplicated_from:q.id});
  });

  it('refuses an unknown quote or rep',()=>{
    expect(caught(()=>duplicateQuote('q-nope',{repId:'brandi'}))).toMatchObject({code:'not_found'});
    expect(caught(()=>duplicateQuote(SAMPLE,{repId:'nobody'}))).toMatchObject({code:'invalid_input'});
  });
});

describe('reset sample quote',()=>{
  it('restores Q-24817 exactly as seeded from any state, keeping its duplicates',async()=>{
    const seeded=resetSample();
    const seededActivity=quoteActivity(SAMPLE);
    await sendQuote(SAMPLE,{repId:'brandi',now:SEND});
    requestChanges('wasatch',SAMPLE,{revision:1,note:'More gloves',now:'2026-09-24T09:00:00.000Z'});
    updateQuoteLine(SAMPLE,'q-24817-3',{qty:8},'2026-09-24T10:00:00.000Z');
    await sendQuote(SAMPLE,{repId:'brandi',now:'2026-09-24T11:00:00.000Z'});
    const copy=duplicateQuote(SAMPLE,{repId:'brandi',now:'2026-09-24T12:00:00.000Z'});
    expect(copy.is_sample).toBe(false);

    const reset=resetSample();
    expect(reset).toEqual(seeded);
    expect(reset).toMatchObject({status:'ready_for_review',revision:0,valid_until:null,sent_at:null,unread_for_rep:true,is_sample:true});
    expect(quoteRevisions(SAMPLE)).toEqual([]);
    expect(quoteActivity(SAMPLE).map(a=>[a.kind,a.at,a.message])).toEqual(seededActivity.map(a=>[a.kind,a.at,a.message]));
    expect(customerQuote('wasatch',SAMPLE)).toMatchObject({status:'ready_for_review',total:null,sent:null});
    expect(quote(copy.id)).toMatchObject({status:'ready_for_review',duplicated_from:null});

    // Revisions start again at 1.
    expect((await sendQuote(SAMPLE,{repId:'brandi',now:SEND})).revision.id).toBe('q-24817-r1');
    resetSample();
  });
});
