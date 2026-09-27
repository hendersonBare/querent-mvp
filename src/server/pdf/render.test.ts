// @vitest-environment node
// react-pdf's browser build (picked under jsdom) writes streams pdf.js can't read.
import {beforeAll,describe,expect,it} from 'vitest';
import type {Quote} from '@/domain';
import {useSeededDatabase} from '@/server/repository/test-db';
import {internalLeaks,pdfText} from './test-pdf';

useSeededDatabase();

// The customer quote PDF end to end (task 4.1, spec §6.7): real seed data through the real
// renderer, read back with pdf.js. It must carry every required field and never cost, margin,
// floors or Querent's reasoning.

const NOW='2026-09-23T17:00:00.000Z';
type Repo=typeof import('@/server/repository');
let repo:Repo;
let render:(idOrNumber:string,rev:number|'draft'|null)=>Promise<{pages:number;text:string}>;

beforeAll(async()=>{
  repo=await import('@/server/repository');
  const {repCustomerPdf}=await import('./rep');
  const {renderCustomerQuotePdf}=await import('./CustomerQuotePdf');
  render=async(idOrNumber,rev)=>{
    const pdf=await repCustomerPdf(idOrNumber,rev,NOW);
    if(!pdf.ok)throw new Error(pdf.detail);
    const bytes=await renderCustomerQuotePdf(pdf.model);
    expect(new TextDecoder().decode(bytes.slice(0,5))).toBe('%PDF-');
    return pdfText(bytes);
  };
});

/** The letterhead, terms, rep and marks every customer PDF carries. */
function expectFrame(text:string){
  for(const field of ['Herrick Industrial Supply','Salt Lake City branch','1480 W 2100 S','Salt Lake City, UT 84119','Phone (801) 555-0120','QUOTATION','QUOTE FOR','QUOTE DETAILS',
    'Wasatch Mechanical Contractors','Attn: Dana Ortiz','Account WAS-1142','Customer PO','Terms Net 30','Sales rep Brandi Gallegos',
    '# SKU DESCRIPTION QTY UNIT UNIT PRICE EXTENDED','Subtotal','Freight','Sales tax Added on invoice','Total',
    'Payment terms: Net 30.','Sales tax added on invoice.','Brandi Gallegos','Inside Sales, Herrick Industrial Supply','(801) 111-2222','brandi.gallegos@herrickindustrial.com',
    'via Querent','Page 1 of 1'])expect(text).toContain(field);
  expect(text).toMatch(/sample data/i);
  // "via Querent" is the only mention of Querent.
  expect(text.match(/Querent/g)).toHaveLength(1);
}

describe('seeded Q-24817, the rep\'s draft preview (ready_for_review)',()=>{
  let q:Quote,text:string,pages:number;
  beforeAll(async()=>{
    repo.addQuoteNote('q-24817','brandi','Internal: hold the gloves price, Dana is shopping it.');
    q=repo.quote('q-24817')!;
    ({text,pages}=await render('Q-24817','draft'));
  });

  it('is one page with the letterhead, terms, rep, "via Querent" and "Sample data"',()=>{
    expect(pages).toBe(1);
    expectFrame(text);
  });

  it('shows the quote number with the revision a send would store, the date, valid until and PO',()=>{
    for(const field of ['Q-24817 · Rev 1','Quote number Q-24817 rev 1','Date Sep 23, 2026','Valid until Oct 7, 2026','Customer PO To be added'])expect(text).toContain(field);
    expect(text).toMatch(/draft preview · not sent/i);
  });

  it('lists every line with SKU, description, qty, unit, unit price and extended',()=>{
    expect(text).toContain('1 HCS-12-13-2G8 Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc 10 Box of 50 $31.50 $315.00');
    expect(text).toContain('2 CW-45-045-T1 Cut-off wheel 4.5 x .045 x 7/8 in, Type 1 6 Box of 25 $36.00 $216.00');
    expect(text).toContain('GLV-N8-L-1000');
    expect(text).toContain('4 Case of 1,000 $79.00 $316.00');
    expect(text).toContain('RS-2-27-JH');
    expect(text).toContain('12 Each $22.95 $275.40');
  });

  it('totals the draft: will call freight at SLC, tax added on invoice, $1,122.40 (the pricing engine\'s total for the seeded lines)',()=>{
    expect(text).toContain('Subtotal $1,122.40 Freight Will call at SLC $0.00 Sales tax Added on invoice Total $1,122.40');
    expect(text).toContain('WILL CALL Pick up at Salt Lake City branch 1480 W 2100 S, Salt Lake City, UT 84119');
  });

  it('never shows cost, margin, floors, price basis, Querent\'s reasoning or internal notes',()=>{
    expect(internalLeaks(text,q.lines)).toEqual([]);
    expect(q.lines.some(l=>l.explanation?.includes('GP'))).toBe(true);
    expect(text).not.toContain('Dana is shopping');
  });
});

describe('a sent revision renders from its frozen snapshot',()=>{
  it('seeded Q-24816 rev 1 (accepted, delivery): the freight with its miles, the sent total',async()=>{
    const {text,pages}=await render('Q-24816',null);
    expect(pages).toBe(1);
    expectFrame(text);
    const sent=repo.quoteRevision('q-24816',1)!;
    const day=new Date(sent.sent_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
    for(const field of ['Q-24816 · Rev 1',`Date ${day}`,'DELIVERY Ship to 1800 W 10950 S, South Jordan, UT 84095',
      'CW-45-045-T1','$36.00 $144.00','Freight Delivery from SLC, 15.0 mi $62.50','Total $655.25'])expect(text).toContain(field);
    expect(text).not.toMatch(/draft/i);
    // The PO Dana gave on Accept (7777) came after this revision was sent.
    expect(text).toContain('Customer PO To be added');
    expect(internalLeaks(text,repo.quote('q-24816')!.lines)).toEqual([]);
  });

  it('Q-24817 sent as a delivery with a PO and a note: rev 1 prints what was sent, not later draft edits',async()=>{
    const {sendQuote,requestChanges}=await import('@/server/quotes/service');
    repo.resetSampleQuote();
    repo.updateQuoteFulfillment('q-24817',{fulfillment:'delivery'});
    repo.updateQuoteTerms('q-24817',{customerPo:'7781',customerNote:'Straps ship with edge protectors on request.'});
    await sendQuote('q-24817',{repId:'brandi',now:NOW});
    requestChanges('wasatch','q-24817',{revision:1,note:'Can you do 20 boxes of the bolts?',now:'2026-09-24T15:00:00.000Z'});
    repo.updateQuoteLine('q-24817','q-24817-1',{qty:20,unitPrice:29.99,priceBasis:'custom'});

    const {text}=await render('Q-24817',1);
    expectFrame(text);
    for(const field of ['Q-24817 · Rev 1','Date Sep 23, 2026','Valid until Oct 7, 2026','Customer PO 7781','NOTE Straps ship with edge protectors on request.',
      '10 Box of 50 $31.50 $315.00','Subtotal $1,122.40 Freight Delivery from SLC, 15.0 mi $62.50','Total $1,184.90'])expect(text).toContain(field);
    expect(text).not.toContain('29.99');
    expect(text).not.toContain('Can you do 20 boxes');
    expect(internalLeaks(text,repo.quote('q-24817')!.lines)).toEqual([]);

    // Latest sent (no rev) is still rev 1; the edited draft previews as rev 2.
    expect((await render('Q-24817',null)).text).toContain('$31.50 $315.00');
    const draft=(await render('Q-24817','draft')).text;
    expect(draft).toContain('Q-24817 · Rev 2');
    expect(draft).toContain('20 Box of 50 $29.99 $599.80');
  });
});

describe('the leak detector',()=>{
  it('catches cost values, cost words and Querent\'s notes',()=>{
    const lines=[{qty:10,unit_cost:21.4,explanation:'Last paid $31.50 on Aug 12, above customer price $30.95. +$5.50 GP vs customer price.'}];
    expect(internalLeaks('Cost $21.40',lines)).toEqual(['cost value 21.40','"Cost"']);
    expect(internalLeaks('Extended $214.00',lines)).toEqual(['cost value 214.00']);
    expect(internalLeaks('Margin 32% below floor',lines)).toEqual(['"Margin"','"floor"','"%"']);
    expect(internalLeaks('Why this price? Last paid $31.50 on Aug 12, above customer price',lines)).toEqual([expect.stringMatching(/^Querent's note "Last paid/),'"Why this price"','"Last paid"']);
    expect(internalLeaks('Total $1,121.40 and $121.40',lines)).toEqual([]);
  });
});
