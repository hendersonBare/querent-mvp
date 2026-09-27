// @vitest-environment node
// react-pdf's browser build (picked under jsdom) writes streams pdf.js can't read.
import {NextRequest} from 'next/server';
import {beforeAll,describe,expect,it} from 'vitest';
import {updateLiveRecord,useSeededDatabase} from '@/server/repository/test-db';
import {internalLeaks,pdfText} from '@/server/pdf/test-pdf';

useSeededDatabase();

// GET /api/quotes/:id/pdf (task 4.1): who may fetch which customer PDF.
// - Dana (customer): her own quotes, sent revisions only. Q-24817 in ready_for_review has
//   unreviewed prices, so it is 404, exactly like an unknown id or another customer's quote.
// - Brandi (rep): any sent revision, or rev=draft to preview the unsent draft (task 3.7).

type Persona='customer'|'supplier';
let GET:typeof import('./route').GET;
let otherCustomersQuote='';

const call=(id:string,query='',persona?:Persona)=>GET(
  new NextRequest(`http://127.0.0.1/api/quotes/${encodeURIComponent(id)}/pdf${query}`,{headers:persona?{cookie:`querent-persona=${persona}`}:{}}),
  {params:Promise.resolve({id})},
);
const detail=async(response:Response)=>(await response.json()).detail as string;

beforeAll(async()=>{
  ({GET}=await import('./route'));
  // A sent quote for another customer (Great Basin, also Brandi's).
  const {createQuote}=await import('@/server/repository');
  const {sendQuote}=await import('@/server/quotes/service');
  const q=createQuote({customerId:'great-basin',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'HCS-12-13-2G5',qty:10,unitPrice:21.95,priceBasis:'customer'}]});
  await sendQuote(q.id,{repId:'brandi'});
  otherCustomersQuote=q.quote_number;
});

describe('without a session',()=>{
  it('asks for a workspace',async()=>{
    const response=await call('Q-24816');
    expect(response.status).toBe(401);
    expect(await detail(response)).toBe('Choose a demo workspace.');
  });
});

describe('the customer (Dana)',()=>{
  it('gets the latest sent revision of her own quote as an inline, uncached PDF',async()=>{
    const response=await call('Q-24816','?variant=customer','customer');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toMatch(/^inline; filename="Herrick Industrial Supply quote Q-24816 rev 1\.pdf"/);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const {text}=await pdfText(await response.arrayBuffer());
    expect(text).toContain('Q-24816 · Rev 1');
    expect(text).toContain('Freight Delivery from SLC, 15.0 mi $62.50');
    expect(text).toContain('Total $655.25');
    const {quote}=await import('@/server/repository');
    expect(internalLeaks(text,quote('q-24816')!.lines)).toEqual([]);
  });

  it('finds it by id or number, with variant and rev optional',async()=>{
    for(const [id,query] of [['q-24816',''],['q-24816','?rev=1'],['Q-24816','?variant=customer&rev=1']])expect((await call(id,query,'customer')).status).toBe(200);
  });

  it('never gets a quote that hasn\'t been sent: Q-24817 is waiting for Brandi, so its prices are unreviewed',async()=>{
    for(const query of ['','?rev=1','?rev=draft','?variant=customer&rev=draft']){
      const response=await call('Q-24817',query,'customer');
      expect(response.status).toBe(404);
      expect(await detail(response)).toBe('Quote not found.');
    }
  });

  it('gets the same 404 for another customer\'s quote, an unknown id and a revision that doesn\'t exist',async()=>{
    for(const [id,query] of [[otherCustomersQuote,''],['q-nope',''],['Q-24816','?rev=2']]){
      const response=await call(id,query,'customer');
      expect(response.status).toBe(404);
      expect(await detail(response)).toBe('Quote not found.');
    }
  });

  it('refuses an unknown variant or a malformed rev before looking anything up',async()=>{
    for(const query of ['?variant=internal','?rev=0','?rev=abc','?rev=-1','?rev=1.5']){
      expect((await call('Q-24816',query,'customer')).status).toBe(400);
    }
  });

  it('after she asks for changes, still sees rev 1 as sent, never the rep\'s edited draft',async()=>{
    const {resetSampleQuote,updateQuoteLine}=await import('@/server/repository');
    const {requestChanges,sendQuote}=await import('@/server/quotes/service');
    resetSampleQuote();
    await sendQuote('q-24817',{repId:'brandi',now:'2026-09-23T17:00:00.000Z'});
    requestChanges('wasatch','q-24817',{revision:1,note:'Can you do 20 boxes?',now:'2026-09-24T15:00:00.000Z'});
    updateQuoteLine('q-24817','q-24817-1',{qty:20,unitPrice:29.99,priceBasis:'custom'});

    const response=await call('Q-24817','','customer');
    expect(response.status).toBe(200);
    const {text}=await pdfText(await response.arrayBuffer());
    expect(text).toContain('Q-24817 · Rev 1');
    expect(text).toContain('10 Box of 50 $31.50 $315.00');
    expect(text).not.toContain('29.99');
    expect((await call('Q-24817','?rev=draft','customer')).status).toBe(404);
    expect((await call('Q-24817','?rev=2','customer')).status).toBe(404);
    resetSampleQuote();
  });
});

describe('a sent revision is frozen (spec §5.4): the PDF the customer saw can always be reproduced',()=>{
  const textOf=async(response:Response)=>{expect(response.status).toBe(200);return (await pdfText(await response.arrayBuffer())).text;};

  it('keeps its terms, rep contact and letterhead after the account, rep and branch change; the draft preview shows the live ones',async()=>{
    const {resetSampleQuote}=await import('@/server/repository');
    const {requestChanges,sendQuote}=await import('@/server/quotes/service');
    resetSampleQuote();
    await sendQuote('q-24817',{repId:'brandi',now:'2026-09-23T17:00:00.000Z'});
    const sentAsIs=await textOf(await call('Q-24817','','customer'));
    const seededAsIs=await textOf(await call('Q-24816','','customer'));
    for(const text of [sentAsIs,seededAsIs])for(const field of ['Terms Net 30','Payment terms: Net 30.','(801) 111-2222','Inside Sales, Herrick Industrial Supply','1480 W 2100 S','Phone (801) 555-0120'])expect(text).toContain(field);

    await updateLiveRecord('customers','wasatch','terms','Net 45');
    await updateLiveRecord('reps','brandi','phone','(801) 555-0199');
    await updateLiveRecord('reps','brandi','title','Branch Sales');
    await updateLiveRecord('branches','slc','address','200 N Main St');
    await updateLiveRecord('branches','slc','will_call_phone','(801) 555-0177');
    try{
      // Unchanged, byte for byte in text, for the customer and for the rep, and for the seeded history.
      expect(await textOf(await call('Q-24817','','customer'))).toBe(sentAsIs);
      expect(await textOf(await call('Q-24817','?rev=1','supplier'))).toBe(sentAsIs);
      expect(await textOf(await call('Q-24816','','customer'))).toBe(seededAsIs);

      // Nothing is frozen until the next send: the rev 2 draft preview prints the live records.
      requestChanges('wasatch','q-24817',{revision:1,note:'Can you do 20 boxes?',now:'2026-09-24T15:00:00.000Z'});
      const draft=await textOf(await call('Q-24817','?rev=draft','supplier'));
      for(const field of ['Terms Net 45','Payment terms: Net 45.','(801) 555-0199','Branch Sales, Herrick Industrial Supply','200 N Main St','Phone (801) 555-0177'])expect(draft).toContain(field);
      expect(draft).not.toMatch(/Net 30|111-2222|1480 W 2100 S/);
    }finally{
      await updateLiveRecord('customers','wasatch','terms','Net 30');
      await updateLiveRecord('reps','brandi','phone','(801) 111-2222');
      await updateLiveRecord('reps','brandi','title','Inside Sales');
      await updateLiveRecord('branches','slc','address','1480 W 2100 S');
      await updateLiveRecord('branches','slc','will_call_phone','(801) 555-0120');
      resetSampleQuote();
    }
  });
});

describe('the rep (Brandi)',()=>{
  it('previews the unsent draft of Q-24817 with rev=draft, marked as a draft',async()=>{
    const response=await call('Q-24817','?variant=customer&rev=draft','supplier');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toMatch(/filename="Herrick Industrial Supply quote Q-24817 rev 1 draft\.pdf"/);
    const {text}=await pdfText(await response.arrayBuffer());
    expect(text).toMatch(/draft preview · not sent/i);
    expect(text).toContain('Total $1,122.40');
  });

  it('is told a never-sent quote has no revision to show yet',async()=>{
    const response=await call('Q-24817','','supplier');
    expect(response.status).toBe(404);
    expect(await detail(response)).toBe('Q-24817 hasn\'t been sent yet. Preview the draft with rev=draft.');
  });

  it('gets any customer\'s sent revisions, but no draft of a quote that can\'t be edited',async()=>{
    expect((await call('Q-24816','?rev=1','supplier')).status).toBe(200);
    expect((await call(otherCustomersQuote,'','supplier')).status).toBe(200);
    const accepted=await call('Q-24816','?rev=draft','supplier');
    expect(accepted.status).toBe(409);
    expect(await detail(accepted)).toBe('Q-24816 has no draft to preview: it is accepted. Open rev 1 instead.');
    const missing=await call('Q-24816','?rev=3','supplier');
    expect(missing.status).toBe(404);
    expect(await detail(missing)).toBe('Q-24816 has no rev 3.');
    expect((await call('q-nope','','supplier')).status).toBe(404);
  });
});
