import {beforeEach,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

// The customer's Accept / Request changes (spec §3, §5.4; task 5.2): the narrow service a customer
// route may call. It takes only the customer's own fields, for the session customer's latest sent
// revision, and answers with the customer-safe preview only.

const SAMPLE='q-24817';
// Brandi sends on Wednesday Sep 23 (valid until Oct 7); Dana answers on Thursday Sep 24, 9:00 AM MDT.
const SEND='2026-09-23T17:00:00.000Z',NOW='2026-09-24T15:00:00.000Z';
const DANA={customerId:'wasatch'};
const ACCEPT={revision:1,day:'2026-09-25',time:'10:00',po:'7781'};

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

const services=async()=>({...(await import('./service')),...(await import('@/server/quotes/service')),...(await import('@/server/repository')),...(await import('@/server/rep/badges'))});

/** Every unit cost on the quote, which must not appear anywhere in what Dana gets back. */
async function seededCosts(quoteId:string){
  const {quote}=await import('@/server/repository');
  return [...new Set(quote(quoteId)!.lines.map(l=>l.unit_cost))];
}
function expectCustomerSafe(value:unknown,costs:number[]){
  expect(keys(value).filter(k=>FORBIDDEN.test(k))).toEqual([]);
  expect(costs.length).toBeGreaterThan(0);
  expect(leakedCosts(value,costs)).toEqual([]);
}

async function sentSample(){
  const {resetSample,sendQuote}=await services();
  resetSample();
  await sendQuote(SAMPLE,{repId:'brandi',message:'Hi Dana',now:SEND});
}

describe('acceptCustomerQuote',()=>{
  beforeEach(sentSample);

  it('accepts the latest revision with the pickup time and PO: accepted, unread for Brandi, logged, customer-safe',async()=>{
    const {acceptCustomerQuote,quote,quoteActivity,repBadges}=await services();
    const costs=await seededCosts(SAMPLE);
    const badge=repBadges('brandi',{now:NOW}).quotes;
    const result=acceptCustomerQuote(DANA,'Q-24817',ACCEPT,{now:NOW});
    expect(result).toMatchObject({replayed:false,quote:{id:SAMPLE,quote_number:'Q-24817',status:'accepted',latest_revision:1,
      response:{kind:'accepted',revision:1,fulfillment_time:'2026-09-25T16:00:00.000Z',customer_po:'7781'}}});
    expectCustomerSafe(result,costs);
    // Where Brandi sees it: the status, the PO (Quote terms), the time (Pickup or delivery), the badge and Activity.
    expect(quote(SAMPLE)).toMatchObject({status:'accepted',customer_po:'7781',fulfillment_time:'2026-09-25T16:00:00.000Z',fulfillment:'will_call',branch_id:'slc',
      unread_for_rep:true,responded_at:NOW});
    expect(repBadges('brandi',{now:NOW}).quotes).toBe(badge+1);
    expect(quoteActivity(SAMPLE).at(-1)).toMatchObject({actor:'customer',kind:'accepted',message:'Dana accepted Q-24817 rev 1 ($1,122.40) with PO 7781, pickup at SLC'});
  });

  it('stores the PO as one line of plain text',async()=>{
    const {acceptCustomerQuote,quote}=await services();
    acceptCustomerQuote(DANA,SAMPLE,{...ACCEPT,po:'  <b>PO</b>\n7781​ '},{now:NOW});
    expect(quote(SAMPLE)?.customer_po).toBe('<b>PO</b> 7781');
  });

  it('keeps branch and pickup or delivery locked: a crafted body that tries to change them is refused and changes nothing',async()=>{
    const {acceptCustomerQuote,quote}=await services();
    for(const extra of [{branch_id:'ogden'},{fulfillment:'delivery'},{ship_to:'1 Main St'},{branch:'Provo',fulfillment:'delivery'}]){
      expect(()=>acceptCustomerQuote(DANA,SAMPLE,{...ACCEPT,...extra},{now:NOW}),JSON.stringify(extra))
        .toThrow(expect.objectContaining({code:'invalid_input',message:'Branch and pickup are locked to what Brandi approved. To change them, use Request changes.'}));
    }
    expect(()=>acceptCustomerQuote(DANA,SAMPLE,{...ACCEPT,total:1},{now:NOW}))
      .toThrow(expect.objectContaining({code:'invalid_input',message:'Accept takes the revision, a day, a time and your PO only (not total).'}));
    expect(quote(SAMPLE)).toMatchObject({status:'sent',fulfillment:'will_call',branch_id:'slc',customer_po:null,fulfillment_time:null});
  });

  it('refuses a time in the past, too soon, on a weekend or outside the slots, and a missing or overlong PO',async()=>{
    const {acceptCustomerQuote,quote}=await services();
    const refused=(body:object,message:string)=>expect(()=>acceptCustomerQuote(DANA,SAMPLE,body,{now:NOW}),JSON.stringify(body))
      .toThrow(expect.objectContaining({code:'invalid_input',httpStatus:400,message}));
    refused({...ACCEPT,day:'2026-09-23'},'That day has passed. Choose Thu Sep 24 or later.');
    refused({...ACCEPT,day:'2026-09-24',time:'09:30'},'Choose a pickup time at least an hour from now.');
    refused({...ACCEPT,day:'2026-09-26'},'Pickup is Monday to Friday. Choose a weekday.');
    refused({...ACCEPT,time:'18:00'},'Pickup times are every 30 minutes, on the hour or half hour, from 7:00 AM to 4:00 PM. Choose one of those.');
    refused({...ACCEPT,day:'2026-09-25T10:00'},'Choose a pickup day.');
    refused({...ACCEPT,po:'   '},'Enter your PO number.');
    refused({...ACCEPT,po:'x'.repeat(41)},'Keep the PO number to 40 characters.');
    refused({...ACCEPT,po:7781},'Enter your PO number.');
    refused({revision:1,day:'2026-09-25',time:'10:00'},'Enter your PO number.');
    refused({...ACCEPT,revision:'1'},'Accept needs the revision you are looking at. Reload the quote and try again.');
    for(const body of [null,'accept',[ACCEPT]])refused(body as object,'Choose a pickup day and time, and enter your PO number.');
    expect(quote(SAMPLE)?.status).toBe('sent');
  });

  it('acts only on the latest sent revision: an older one is a conflict',async()=>{
    const {acceptCustomerQuote,quote}=await services();
    expect(()=>acceptCustomerQuote(DANA,SAMPLE,{...ACCEPT,revision:2},{now:NOW}))
      .toThrow(expect.objectContaining({code:'conflict',httpStatus:409,message:'Q-24817 rev 2 is out of date: rev 1 is the latest. Review it first.'}));
    expect(quote(SAMPLE)?.status).toBe('sent');
  });

  it('refuses an expired quote: the action bar is off once valid-until has passed',async()=>{
    const {acceptCustomerQuote,quote}=await services();
    expect(()=>acceptCustomerQuote(DANA,SAMPLE,{...ACCEPT,day:'2026-10-12'},{now:'2026-10-08T00:00:00.000Z'}))
      .toThrow(expect.objectContaining({code:'expired',httpStatus:409,message:'Q-24817 expired: it was valid until Oct 7. Ask Brandi for a new quote.'}));
    expect(quote(SAMPLE)?.status).not.toBe('accepted');
  });

  it('is the same not found for another customer’s quote and an unknown one',async()=>{
    const {acceptCustomerQuote,createQuote,quote}=await services();
    const theirs=createQuote({customerId:'great-basin',fulfillment:'will_call',branchId:'slc',lines:[]});
    for(const id of [theirs.id,theirs.quote_number,'q-nope',"q-24817' OR 1=1 --"])
      expect(()=>acceptCustomerQuote(DANA,id,ACCEPT,{now:NOW}),id).toThrow(expect.objectContaining({code:'not_found',httpStatus:404,message:'Quote not found.'}));
    // Even with a body that would be refused, so ids can't be probed.
    expect(()=>acceptCustomerQuote(DANA,theirs.id,{branch_id:'ogden'},{now:NOW})).toThrow(expect.objectContaining({code:'not_found'}));
    expect(()=>acceptCustomerQuote({customerId:'great-basin'},SAMPLE,ACCEPT,{now:NOW})).toThrow(expect.objectContaining({code:'not_found'}));
    expect(quote(SAMPLE)?.status).toBe('sent');
  });

  it('refuses a quote that isn’t waiting for an answer',async()=>{
    const {acceptCustomerQuote,resetSample}=await services();
    resetSample();
    expect(()=>acceptCustomerQuote(DANA,SAMPLE,ACCEPT,{now:NOW}))
      .toThrow(expect.objectContaining({code:'illegal_transition',httpStatus:409,message:'Q-24817 hasn’t been sent to you yet.'}));
  });

  it('a double submit is one acceptance: the same Idempotency-Key replays it, and without one the status guard refuses the second',async()=>{
    const {acceptCustomerQuote,quoteActivity}=await services();
    const first=acceptCustomerQuote(DANA,SAMPLE,ACCEPT,{now:NOW,idempotencyKey:'accept-1'});
    const again=acceptCustomerQuote(DANA,SAMPLE,ACCEPT,{now:NOW,idempotencyKey:'accept-1'});
    expect(again).toEqual({...first,replayed:true});
    expect(quoteActivity(SAMPLE).filter(a=>a.kind==='accepted')).toHaveLength(1);
    expect(()=>acceptCustomerQuote(DANA,SAMPLE,ACCEPT,{now:NOW}))
      .toThrow(expect.objectContaining({code:'illegal_transition',httpStatus:409,message:'You already accepted Q-24817.'}));
    expect(()=>acceptCustomerQuote(DANA,SAMPLE,ACCEPT,{now:NOW,idempotencyKey:'accept-2'})).toThrow(expect.objectContaining({code:'illegal_transition'}));
    expect(quoteActivity(SAMPLE).filter(a=>a.kind==='accepted')).toHaveLength(1);
  });
});

describe('requestCustomerChanges',()=>{
  beforeEach(sentSample);

  it('sends the note: changes_requested, editable again for Brandi, unread, logged, customer-safe',async()=>{
    const {requestCustomerChanges,quote,quoteActivity,repBadges}=await services();
    const {canEditDraft}=await import('@/server/quotes');
    const costs=await seededCosts(SAMPLE);
    const badge=repBadges('brandi',{now:NOW}).quotes;
    const result=requestCustomerChanges(DANA,SAMPLE,{revision:1,note:'  Make the bolts 12 boxes.\r\nThanks  '},{now:NOW});
    expect(result).toMatchObject({replayed:false,quote:{status:'changes_requested',response:{kind:'changes_requested',revision:1,note:'Make the bolts 12 boxes.\nThanks'}}});
    expectCustomerSafe(result,costs);
    const q=quote(SAMPLE)!;
    expect(q).toMatchObject({status:'changes_requested',change_request_note:'Make the bolts 12 boxes.\nThanks',unread_for_rep:true});
    expect(canEditDraft(q.status)).toBe(true);
    expect(repBadges('brandi',{now:NOW}).quotes).toBe(badge+1);
    expect(quoteActivity(SAMPLE).at(-1)).toMatchObject({actor:'customer',kind:'changes_requested',message:'Dana requested changes to Q-24817 rev 1: "Make the bolts 12 boxes.\nThanks"'});
  });

  it('stores the note as plain text, exactly as typed apart from invisible characters',async()=>{
    const {requestCustomerChanges,quote}=await services();
    requestCustomerChanges(DANA,SAMPLE,{revision:1,note:'<script>alert(1)</script> **bold**‮'},{now:NOW});
    expect(quote(SAMPLE)?.change_request_note).toBe('<script>alert(1)</script> **bold**');
  });

  it('requires a note, keeps it to 1,000 characters, and takes nothing else',async()=>{
    const {requestCustomerChanges,quote}=await services();
    const refused=(body:unknown,message:string)=>expect(()=>requestCustomerChanges(DANA,SAMPLE,body,{now:NOW}),JSON.stringify(body))
      .toThrow(expect.objectContaining({code:'invalid_input',httpStatus:400,message}));
    refused({revision:1,note:''},'Say what should change: a note is required.');
    refused({revision:1,note:' \n​ '},'Say what should change: a note is required.');
    refused({revision:1},'Say what should change: a note is required.');
    refused({revision:1,note:'x'.repeat(1001)},'Keep the note to 1,000 characters.');
    refused({revision:1,note:'Ogden instead',branch_id:'ogden'},'Request changes takes the revision and your note only (not branch_id). Say what should change in the note.');
    expect(quote(SAMPLE)).toMatchObject({status:'sent',branch_id:'slc',change_request_note:null});
  });

  it('refuses an older revision, an expired quote, and a second request; replays the same key',async()=>{
    const {requestCustomerChanges}=await services();
    expect(()=>requestCustomerChanges(DANA,SAMPLE,{revision:2,note:'x'},{now:NOW})).toThrow(expect.objectContaining({code:'conflict'}));
    expect(()=>requestCustomerChanges(DANA,SAMPLE,{revision:1,note:'x'},{now:'2026-10-08T00:00:00.000Z'})).toThrow(expect.objectContaining({code:'expired'}));
    const first=requestCustomerChanges(DANA,SAMPLE,{revision:1,note:'Fewer bolts'},{now:NOW,idempotencyKey:'changes-1'});
    expect(requestCustomerChanges(DANA,SAMPLE,{revision:1,note:'Fewer bolts'},{now:NOW,idempotencyKey:'changes-1'})).toEqual({...first,replayed:true});
    expect(()=>requestCustomerChanges(DANA,SAMPLE,{revision:1,note:'Fewer bolts'},{now:NOW}))
      .toThrow(expect.objectContaining({code:'illegal_transition',message:'You already asked for changes to Q-24817. Brandi is revising it.'}));
  });

  it('after Brandi sends rev 2, Dana answers rev 2 and rev 1 is out of date',async()=>{
    const {acceptCustomerQuote,requestCustomerChanges,sendQuote,updateQuoteLine}=await services();
    requestCustomerChanges(DANA,SAMPLE,{revision:1,note:'12 boxes of bolts'},{now:NOW});
    updateQuoteLine(SAMPLE,'q-24817-1',{qty:12},'2026-09-24T16:00:00.000Z');
    await sendQuote(SAMPLE,{repId:'brandi',now:'2026-09-24T17:00:00.000Z'});
    expect(()=>acceptCustomerQuote(DANA,SAMPLE,ACCEPT,{now:'2026-09-24T18:00:00.000Z'})).toThrow(expect.objectContaining({code:'conflict'}));
    expect(acceptCustomerQuote(DANA,SAMPLE,{...ACCEPT,revision:2},{now:'2026-09-24T18:00:00.000Z'}).quote).toMatchObject({status:'accepted',latest_revision:2});
  });
});
