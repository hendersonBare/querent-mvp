import {beforeEach,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

// What Dana's PDF preview modal shows (spec §3, task 5.1): one of her own quotes, the revision the
// rep sent (the latest, or an older one a chat message announced), and whether it offers Download.

const SAMPLE='q-24817',SEND='2026-09-23T17:00:00.000Z',LATER='2026-09-24T09:00:00.000Z';
const FORBIDDEN=/cost|margin|floor|suggest|explanation|internal/i;
const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];

describe('customerQuotePreview',()=>{
  beforeEach(async()=>{(await import('@/server/quotes/service')).resetSample();});

  it('before the first send: the quote with no revision to show (its customer PDF doesn’t exist yet)',async()=>{
    const {customerQuotePreview}=await import('./quote-preview');
    expect(customerQuotePreview('wasatch','Q-24817',undefined,LATER)).toEqual({id:SAMPLE,quote_number:'Q-24817',status:'ready_for_review',latest_revision:0,
      requested_at:'2026-09-23T16:14:00.000Z',shown:null,rep:{name:'Brandi Gallegos',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'},response:null});
  });

  it('once sent: the latest revision with its total, valid-until day, PDF and whether Attach PDF was on',async()=>{
    const {customerQuotePreview}=await import('./quote-preview');
    const {sendQuote}=await import('@/server/quotes/service');
    await sendQuote(SAMPLE,{repId:'brandi',message:'Hi',now:SEND});
    const preview=customerQuotePreview('wasatch',SAMPLE,undefined,LATER);
    expect(preview).toMatchObject({status:'sent',latest_revision:1,rep:{name:'Brandi Gallegos'},
      shown:{revision:1,sent_at:SEND,total:1122.4,valid_until:'2026-10-07',attach_pdf:true,pdf_url:'/api/quotes/q-24817/pdf?variant=customer&rev=1'}});
    expect(keys(preview).filter(k=>FORBIDDEN.test(k))).toEqual([]);
    expect(customerQuotePreview('wasatch','q-24817',1,LATER)).toEqual(preview);
  });

  it('names what the rep approved, for Accept to show locked (task 5.2): pickup or delivery, branch, ship-to, PO',async()=>{
    const {customerQuotePreview}=await import('./quote-preview');
    const {sendQuote}=await import('@/server/quotes/service');
    const {updateQuoteTerms}=await import('@/server/repository');
    updateQuoteTerms(SAMPLE,{customerPo:'7781'},SEND);
    await sendQuote(SAMPLE,{repId:'brandi',now:SEND});
    expect(customerQuotePreview('wasatch',SAMPLE,undefined,LATER)?.shown).toMatchObject({fulfillment:'will_call',branch:'SLC',ship_to:null,customer_po:'7781'});
  });

  it('carries Dana’s own answer while the quote is accepted or changes are requested (task 5.2)',async()=>{
    const {customerQuotePreview}=await import('./quote-preview');
    const {acceptQuote,duplicateQuote,requestChanges,sendQuote}=await import('@/server/quotes/service');
    await sendQuote(SAMPLE,{repId:'brandi',now:SEND});
    expect(customerQuotePreview('wasatch',SAMPLE,undefined,LATER)?.response).toBeNull();
    requestChanges('wasatch',SAMPLE,{revision:1,note:'Fewer bolts, please',now:LATER});
    expect(customerQuotePreview('wasatch',SAMPLE,undefined,LATER)?.response).toEqual({kind:'changes_requested',revision:1,note:'Fewer bolts, please'});
    const copy=duplicateQuote(SAMPLE,{repId:'brandi',now:SEND});
    await sendQuote(copy.id,{repId:'brandi',now:SEND});
    acceptQuote('wasatch',copy.id,{revision:1,fulfillmentTime:'2026-09-29T16:00:00.000Z',customerPo:'PO-7781',now:LATER});
    const accepted=customerQuotePreview('wasatch',copy.id,undefined,LATER);
    expect(accepted).toMatchObject({status:'accepted',response:{kind:'accepted',revision:1,fulfillment_time:'2026-09-29T16:00:00.000Z',customer_po:'PO-7781'}});
    expect(keys(accepted).filter(k=>FORBIDDEN.test(k))).toEqual([]);
  });

  it('offers no Download when the rep turned Attach PDF off',async()=>{
    const {customerQuotePreview}=await import('./quote-preview');
    const {sendQuote}=await import('@/server/quotes/service');
    await sendQuote(SAMPLE,{repId:'brandi',attachPdf:false,now:SEND});
    expect(customerQuotePreview('wasatch',SAMPLE,undefined,LATER)?.shown?.attach_pdf).toBe(false);
  });

  it('reads expired once past valid-until, before the expiry sweep stores it',async()=>{
    const {customerQuotePreview}=await import('./quote-preview');
    const {sendQuote}=await import('@/server/quotes/service');
    await sendQuote(SAMPLE,{repId:'brandi',now:SEND});
    expect(customerQuotePreview('wasatch',SAMPLE,undefined,'2026-10-07T23:59:59.000Z')?.status).toBe('sent');
    const expired=customerQuotePreview('wasatch',SAMPLE,undefined,'2026-10-08T00:00:00.000Z');
    expect(expired).toMatchObject({status:'expired',shown:{revision:1,valid_until:'2026-10-07'}});
  });

  it('shows an older revision when asked, each with its own total and Attach PDF',async()=>{
    const {customerQuotePreview}=await import('./quote-preview');
    const {sendQuote,requestChanges}=await import('@/server/quotes/service');
    const {updateQuoteLine}=await import('@/server/repository');
    await sendQuote(SAMPLE,{repId:'brandi',attachPdf:false,now:SEND});
    requestChanges('wasatch',SAMPLE,{revision:1,note:'Fewer bolts',now:LATER});
    expect(customerQuotePreview('wasatch',SAMPLE,undefined,LATER)).toMatchObject({status:'changes_requested',latest_revision:1,shown:{revision:1}});
    updateQuoteLine(SAMPLE,'q-24817-1',{qty:5},'2026-09-24T09:30:00.000Z');
    await sendQuote(SAMPLE,{repId:'brandi',now:'2026-09-24T10:00:00.000Z'});
    const latest=customerQuotePreview('wasatch',SAMPLE,undefined,'2026-09-24T11:00:00.000Z');
    const first=customerQuotePreview('wasatch',SAMPLE,1,'2026-09-24T11:00:00.000Z');
    expect(latest).toMatchObject({status:'sent',latest_revision:2,shown:{revision:2,attach_pdf:true,valid_until:'2026-10-08',pdf_url:'/api/quotes/q-24817/pdf?variant=customer&rev=2'}});
    expect(first).toMatchObject({status:'sent',latest_revision:2,shown:{revision:1,attach_pdf:false,total:1122.4,valid_until:'2026-10-07',pdf_url:'/api/quotes/q-24817/pdf?variant=customer&rev=1'}});
    expect(latest!.shown!.total).toBeLessThan(first!.shown!.total);
  });

  it('is undefined for anyone else’s quote, an unknown one, or a revision never sent',async()=>{
    const {customerQuotePreview}=await import('./quote-preview');
    const {createQuote}=await import('@/server/repository');
    const theirs=createQuote({customerId:'great-basin',fulfillment:'will_call',branchId:'slc',lines:[]});
    expect(customerQuotePreview('wasatch',theirs.id)).toBeUndefined();
    expect(customerQuotePreview('wasatch',theirs.quote_number)).toBeUndefined();
    expect(customerQuotePreview('great-basin','Q-24816')).toBeUndefined();
    expect(customerQuotePreview('wasatch','q-nope')).toBeUndefined();
    expect(customerQuotePreview('wasatch','Q-24816',2)).toBeUndefined();
    expect(customerQuotePreview('wasatch','Q-24817',1)).toBeUndefined();
  });

  it('shows a seeded quote from history as sent (accepted, expired) with its revision',async()=>{
    const {customerQuotePreview}=await import('./quote-preview');
    expect(customerQuotePreview('wasatch','Q-24816',undefined,LATER)).toMatchObject({status:'accepted',latest_revision:1,shown:{revision:1,total:655.25,attach_pdf:true}});
  });
});
