// @vitest-environment node
// react-pdf's browser build (picked under jsdom) writes streams pdf.js can't read.
import {NextRequest} from 'next/server';
import {beforeAll,describe,expect,it} from 'vitest';
import {pdfText} from '@/server/pdf/test-pdf';
import {useSeededDatabase} from '@/server/repository/test-db';

// Internal notes stay internal (spec §4, task 3.4): a note Brandi adds for her team, and the
// reason she gives for a freight override, never reach the customer: not the frozen revision
// snapshot, not the customer-safe reads, not the customer's API routes, not the customer PDF.
// The note printed on the quote is the control: it is meant for the customer and does get there.
useSeededDatabase();

const NOTE='ZQX internal: Dana will push back on glove price, hold at 79.';
const REASON='ZQX freight: our truck is already going to South Jordan';
const PRINTED='Straps not in stock at SLC will ship from Ogden.';
const SECRETS=['ZQX','hold at 79','our truck'];

const customerGet=async(url:string,handler:(request:NextRequest,context:{params:Promise<{id:string}>})=>Promise<Response>,id='')=>
  handler(new NextRequest(`http://127.0.0.1${url}`,{headers:{cookie:'querent-persona=customer'}}),{params:Promise.resolve({id})});
const leaks=(text:string)=>SECRETS.filter(secret=>text.includes(secret));

let quoteId='';
let quoteNumber='';

beforeAll(async()=>{
  const {addRepQuoteNote,editRepQuoteFulfillment,editRepQuoteTerms,overrideRepQuoteFreight}=await import('@/server/rep/quote-panel-edits');
  const {sendQuote}=await import('@/server/quotes/service');
  const now='2026-09-24T15:00:00.000Z';
  const d=await addRepQuoteNote('brandi','Q-24817',{body:NOTE},{now});
  quoteId=d.quote.id;quoteNumber=d.quote.quote_number;
  await editRepQuoteFulfillment('brandi',quoteId,{fulfillment:'delivery'},{now});
  await overrideRepQuoteFreight('brandi',quoteId,{amount:40,reason:REASON},{now});
  await editRepQuoteTerms('brandi',quoteId,{customerNote:PRINTED,customerPo:'7781'},{now});
  await sendQuote(quoteId,{repId:'brandi',now:'2026-09-24T16:00:00.000Z'});
});

describe('an internal note and a freight reason on a sent quote',()=>{
  it('are on the rep\'s side, as the control',async()=>{
    const {repQuoteDetail}=await import('@/server/rep/quote-detail');
    const detail=JSON.stringify(await repQuoteDetail('brandi',quoteNumber));
    expect(detail).toContain(NOTE);
    expect(detail).toContain(REASON);
  });

  it('never reach the frozen revision snapshot',async()=>{
    const {quoteRevision}=await import('@/server/repository');
    const revision=quoteRevision(quoteId,1)!;
    expect(revision.snapshot.customer_note).toBe(PRINTED);
    expect(revision.snapshot.freight).toBe(40);
    expect(leaks(JSON.stringify(revision))).toEqual([]);
  });

  it('never reach the customer-safe reads',async()=>{
    const customer=await import('@/server/repository/customer');
    const reads=[customer.customerQuotes('wasatch'),customer.customerQuote('wasatch',quoteNumber),customer.customerQuoteRevision('wasatch',quoteNumber),
      customer.customerQuoteRevision('wasatch',quoteNumber,1)];
    expect(JSON.stringify(reads[1])).toContain(PRINTED);
    expect(leaks(JSON.stringify(reads))).toEqual([]);
  });

  it('never reach the customer\'s API routes',async()=>{
    const quotes=await customerGet('/api/query/customer/quotes',(await import('@/app/api/query/customer/quotes/route')).GET);
    expect(quotes.status).toBe(200);
    const body=await quotes.text();
    expect(body).toContain(quoteNumber);
    expect(leaks(body)).toEqual([]);
  });

  it('never reach the customer PDF, which prints the note meant for the customer',async()=>{
    const {GET}=await import('@/app/api/quotes/[id]/pdf/route');
    const response=await customerGet(`/api/quotes/${quoteNumber}/pdf`,GET,quoteNumber);
    expect(response.status).toBe(200);
    const {text}=await pdfText(await response.arrayBuffer());
    expect(text).toContain(PRINTED);
    expect(leaks(text)).toEqual([]);
  });
});
