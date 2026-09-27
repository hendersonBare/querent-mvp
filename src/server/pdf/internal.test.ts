// @vitest-environment node
// react-pdf's browser build (picked under jsdom) writes streams pdf.js can't read.
import {beforeAll,describe,expect,it} from 'vitest';
import type {Quote,QuoteLine} from '@/domain';
import {useSeededDatabase} from '@/server/repository/test-db';
import {internalLeaks,pdfText} from './test-pdf';

useSeededDatabase();

// The internal worksheet end to end (task 4.2, spec §6.7): real seed data through the real loader
// and renderer, read back with pdf.js. It carries everything the customer PDF prints, plus cost,
// margin %, the floor applied, the price basis, "Why this price?", last paid, credit used and the
// open balance, and the internal notes, under a CONFIDENTIAL — INTERNAL banner on every page.

const NOW='2026-09-23T17:00:00.000Z';
const LATER='2026-09-27T02:40:00.000Z';
const NOTE='Dana is shopping the gloves price against another supplier. Hold at $79 unless she pushes.';
type Repo=typeof import('@/server/repository');
let repo:Repo;
let internal:typeof import('./internal');
let render:(idOrNumber:string,rev:number|'draft'|null,now?:string)=>Promise<{pages:number;text:string}>;
let floorsOf:(q:Quote)=>import('@/server/floors').QuoteFloorSummary;
let formatMargin:typeof import('@/server/floors').formatMargin;

beforeAll(async()=>{
  repo=await import('@/server/repository');
  internal=await import('./internal');
  const {renderInternalWorksheetPdf}=await import('./InternalWorksheetPdf');
  const {quoteFloors}=await import('@/server/floors/service');
  ({formatMargin}=await import('@/server/floors'));
  floorsOf=q=>quoteFloors(q)!;
  render=async(idOrNumber,rev,now=NOW)=>{
    const pdf=await internal.internalWorksheet(idOrNumber,rev,{now});
    if(!pdf.ok)throw new Error(pdf.detail);
    const bytes=await renderInternalWorksheetPdf(pdf.model);
    expect(new TextDecoder().decode(bytes.slice(0,5))).toBe('%PDF-');
    return pdfText(bytes);
  };
});

const usd=(n:number)=>n.toLocaleString('en-US',{style:'currency',currency:'USD'});

/** The banner on every page, and the frame the customer PDF prints. */
function expectFrame(text:string,pages:number){
  expect(text.match(/CONFIDENTIAL — INTERNAL/g)).toHaveLength(pages);
  expect(text).toContain('Cost and margin. Do not send to the customer.');
  for(const field of ['Herrick Industrial Supply','Salt Lake City branch','1480 W 2100 S','Salt Lake City, UT 84119','Phone (801) 555-0120','QUOTE WORKSHEET','QUOTE FOR','QUOTE DETAILS',
    'Wasatch Mechanical Contractors','Attn: Dana Ortiz','Account WAS-1142','Customer PO','Terms Net 30','Sales rep Brandi Gallegos',
    'Subtotal','Freight','Sales tax Added on invoice','Total','Payment terms: Net 30.','Sales tax added on invoice.',
    'Inside Sales, Herrick Industrial Supply','(801) 111-2222','brandi.gallegos@herrickindustrial.com','via Querent',`Page 1 of ${pages}`])expect(text).toContain(field);
  expect(text).toMatch(/sample data/i);
  for(let page=1;page<=pages;page++)expect(text).toContain(`Confidential, internal via Querent Page ${page} of ${pages}`);
}

/** Every printed line's customer fields: SKU, description, qty and extended, as the customer PDF has them. */
function expectCustomerLines(text:string,lines:readonly Pick<QuoteLine,'sku'|'description'|'pack'|'qty'|'unit_price'>[]){
  for(const l of lines){
    expect(text).toContain(`${l.sku} ${l.description}`);
    expect(text).toContain(`${l.qty} ${usd(l.unit_price!)} ${usd(Math.round(l.qty*l.unit_price!*100)/100)}`);
    expect(text).toContain(l.pack);
  }
}

describe('seeded Q-24817, the live draft (rev=draft, ready_for_review)',()=>{
  let q:Quote,text:string,pages:number;
  beforeAll(async()=>{
    repo.addQuoteNote('q-24817','brandi',NOTE,'2026-09-23T16:40:00.000Z');
    q=repo.quote('q-24817')!;
    ({text,pages}=await render('Q-24817','draft'));
  });

  it('is marked CONFIDENTIAL — INTERNAL on every page, a draft, and carries everything the customer PDF prints',()=>{
    expect(pages).toBeGreaterThanOrEqual(1);
    expectFrame(text,pages);
    expect(text).toMatch(/draft · not sent/i);
    for(const field of ['Q-24817 · Rev 1','Quote number Q-24817 rev 1','Date Sep 23, 2026','Valid until Oct 7, 2026','Customer PO To be added',
      'Subtotal $1,122.40','Will call at SLC $0.00','Total $1,122.40','WILL CALL Pick up at Salt Lake City branch'])expect(text).toContain(field);
    expectCustomerLines(text,q.lines);
  });

  it('shows each line\'s cost, basis, margin and floor, the numbers of the quote screen (lineFloorStatus)',()=>{
    const floors=floorsOf(q);
    expect(floors.lines.map(l=>formatMargin(l.margin))).toEqual(['32.1%','33.1%','26.6%','38.1%']);
    const BASIS={last_paid:'Last paid',contract:'Contract',customer:'Customer',list:'List',custom:'Custom'} as const;
    q.lines.forEach((l,i)=>{
      const f=floors.lines[i];
      expect(text).toContain(`${BASIS[l.price_basis!]} ${usd(l.unit_cost)} ${formatMargin(f.margin)} ${f.floorPct}%`);
    });
    expect(text).toContain('Last paid $21.40 32.1% 20%');
    expect(text).toContain('Contract $24.10 33.1% 25%');
    expect(text).toContain('Last paid $58.00 26.6% 30%');
    expect(text).toContain('Customer $14.20 38.1% 20%');
  });

  it('warns on the line below its floor, as the quote screen does',()=>{
    expect(floorsOf(q).lines.map(l=>l.label)).toEqual([null,null,'Below Brandi\'s 30% Safety & PPE floor',null]);
    expect(text).toContain('Below Brandi\'s 30% Safety & PPE floor');
    expect(text.match(/Below Brandi's/g)).toHaveLength(1);
  });

  it('shows "Why this price?" (the pricing engine\'s note, as seeded), Querent\'s pick and last paid for each line',()=>{
    for(const l of q.lines)expect(text).toContain(`Why this price? ${l.explanation}`);
    expect(text).toContain('Querent\'s pick. Last paid $31.50 on Aug 12, 2026.');
    expect(text).toContain('Querent\'s pick. Last paid $36.00 on Sep 9, 2026.');
    expect(text).toContain('Querent\'s pick. Last paid $79.00 on Sep 9, 2026.');
    expect(text).toContain('Querent\'s pick. Last paid: none in the last 12 months.');
  });

  it('adds cost of goods, gross profit and margin, matching the Quotes list margin',async()=>{
    const {repQuoteList}=await import('@/server/rep/quotes');
    const row=(await repQuoteList('brandi',{now:NOW})).rows.find(r=>r.quote_number==='Q-24817')!;
    expect(row.margin_label).toBe('32.2%');
    expect(text).toContain(`PROFIT (INTERNAL) Cost of goods $761.00 Gross profit $361.40 Margin ${row.margin_label} Below floor 1 of 4 lines`);
  });

  it('shows the open balance and credit used, with this quote',()=>{
    expect(text).toContain('ACCOUNT AND CREDIT Credit limit $50,000.00 Open balance $18,420.00 Past due $0.00 Credit used 37% Credit used, with this quote 39%');
  });

  it('prints the internal notes, what blocks the send, and that the numbers are live',()=>{
    expect(text).toContain(`INTERNAL NOTES ${NOTE} Brandi Gallegos · Sep 23, 2026, 4:40 PM UTC`);
    expect(text).toContain('BEFORE SENDING Nothing blocks the send. 1 line is below floor: a warning only.');
    expect(text).toContain('Live draft as of Sep 23, 2026, 5:00 PM UTC, not sent yet.');
  });

  it('is everything the customer PDF must never show (the 4.1 leak detector finds it)',()=>{
    expect(internalLeaks(text,q.lines).length).toBeGreaterThan(5);
  });
});

describe('a sent revision: the frozen snapshot for what the customer saw, the quote\'s stored cost',()=>{
  let text:string,pages:number;
  beforeAll(async()=>{
    const {sendQuote,requestChanges}=await import('@/server/quotes/service');
    repo.resetSampleQuote();
    repo.addQuoteNote('q-24817','brandi',NOTE,'2026-09-23T16:40:00.000Z');
    repo.updateQuoteFulfillment('q-24817',{fulfillment:'delivery'});
    repo.updateQuoteTerms('q-24817',{customerPo:'7781',customerNote:'Straps ship with edge protectors on request.'});
    await sendQuote('q-24817',{repId:'brandi',now:NOW});
    // After the send: Dana asks for changes, Brandi reprices the bolts and drops the straps.
    requestChanges('wasatch','q-24817',{revision:1,note:'Can you do 20 boxes of the bolts?',now:'2026-09-24T15:00:00.000Z'});
    repo.updateQuoteLine('q-24817','q-24817-1',{qty:20,unitPrice:29.99,priceBasis:'custom'});
    expect(repo.removeQuoteLine('q-24817','q-24817-4')).toBe(true);
    ({text,pages}=await render('Q-24817',1,LATER));
  });

  it('prints rev 1 as sent, stamped with its date, not the later draft edits',()=>{
    expectFrame(text,pages);
    expect(text).toMatch(/as sent sep 23, 2026/i);
    expect(text).not.toMatch(/draft · not sent/i);
    for(const field of ['Q-24817 · Rev 1','Customer PO 7781','Straps ship with edge protectors on request.','Freight Delivery from SLC, 15.0 mi $62.50','Total $1,184.90',
      'RS-2-27-JH','12 $22.95 $275.40'])expect(text).toContain(field);
    expect(text).toContain('10 $31.50 $315.00');
    expect(text).not.toContain('29.99');
    expect(text).not.toContain('BEFORE SENDING');
  });

  it('takes cost from the quote\'s lines, and marks the item\'s current cost for a line removed since',()=>{
    expect(text).toContain('Last paid $21.40 32.1% 20%');
    expect(text).toContain('Customer $14.20* 38.1% 20%');
    expect(text).toContain('Cost of goods $761.00 Gross profit $361.40 Margin 32.2%');
  });

  it('names the basis of the price as sent, and computes Why this price? and last paid for the send date',()=>{
    // The bolts line now says custom $29.99; as sent it was $31.50, the last paid price.
    expect(text).toContain('Why this price? Last paid $31.50 on Aug 12, above customer price $30.95. +$5.50 GP vs customer price.');
    expect(text).toContain('Querent\'s pick. Last paid $31.50 on Aug 12, 2026.');
  });

  it('says what is frozen, where cost comes from, and as of when the live figures are',()=>{
    expect(text).toContain('Q-24817 rev 1 as sent on Sep 23, 2026: quantities, prices and totals are the frozen revision the customer received.');
    expect(text).toContain('(* the item\'s current cost, for a line no longer on the quote)');
    expect(text).toContain('Floors, credit and internal notes are as of Sep 27, 2026, 2:40 AM UTC.');
    expect(text).toContain(NOTE);
    // ($18,420.00 open + $1,184.90 as sent) / $50,000.00
    expect(text).toContain('Credit used, with this quote 39%');
  });

  it('the rev 2 draft shows the rep\'s edits: 20 at the custom $29.99, below Querent\'s last-paid pick',async()=>{
    const draft=(await render('Q-24817','draft','2026-09-24T18:00:00.000Z')).text;
    expect(draft).toContain('Q-24817 · Rev 2');
    expect(draft).toContain('20 $29.99 $599.80 Custom $21.40 28.6% 20%');
    expect(draft).toContain('Querent suggested Last paid $31.50.');
    expect(draft).not.toContain('RS-2-27-JH');
  });
});

describe('seeded Q-24816 rev 1 (accepted, delivery)',()=>{
  let text:string,pages:number;
  beforeAll(async()=>({text,pages}=await render('Q-24816',null,LATER)));

  it('prints the sent revision with cost, basis, margin and floor per line',()=>{
    expectFrame(text,pages);
    const sent=repo.quoteRevision('q-24816',1)!;
    const day=new Date(sent.sent_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
    expect(text.toLowerCase()).toContain(`as sent ${day}`.toLowerCase());
    for(const field of ['Q-24816 · Rev 1','Freight Delivery from SLC, 15.0 mi $62.50','Total $655.25',
      '4 $36.00 $144.00 Contract $24.10 33.1% 25%','4 $79.00 $316.00 Custom $58.00 26.6% 30%','Below Brandi\'s 30% Safety & PPE floor'])expect(text).toContain(field);
    expect(text).toContain('INTERNAL NOTES None.');
  });

  it('names Querent\'s pick where the rep chose otherwise, and last paid as of the send date, not today',()=>{
    expect(text).toContain('Querent suggested Last paid $78.00. Last paid $78.00 on May 5, 2026.');
    // Dana paid $79.00 on Sep 9, after this revision was sent.
    expect(text).not.toContain('Last paid $79.00 on Sep 9');
  });
});

describe('what the rep can\'t get',()=>{
  it('answers like the customer PDF: unknown quote, never sent, no such revision, no draft once accepted',async()=>{
    expect(await internal.internalWorksheet('q-nope',null,{now:NOW})).toEqual({ok:false,status:404,detail:'Quote not found.'});
    repo.resetSampleQuote();
    expect(await internal.internalWorksheet('Q-24817',null,{now:NOW})).toEqual({ok:false,status:404,detail:'Q-24817 hasn\'t been sent yet. Preview the draft with rev=draft.'});
    expect(await internal.internalWorksheet('Q-24816',3,{now:NOW})).toEqual({ok:false,status:404,detail:'Q-24816 has no rev 3.'});
    expect(await internal.internalWorksheet('Q-24816','draft',{now:NOW})).toEqual({ok:false,status:409,detail:'Q-24816 has no draft to preview: it is accepted. Open rev 1 instead.'});
  });
});

describe('matching a sent revision to the quote\'s lines',()=>{
  const line=(id:string,sku:string,unit_price:number|null,price_basis:QuoteLine['price_basis']):QuoteLine=>({id,sku,unit_price,price_basis} as QuoteLine);

  it('pairs lines by SKU in order, each stored line once, and leaves removed ones unmatched',()=>{
    const stored=[line('a','X',1,'list'),line('b','Y',2,'customer'),line('c','X',3,'custom')];
    expect(internal.matchSentLines([{sku:'X'},{sku:'Z'},{sku:'X'},{sku:'X'},{sku:'Y'}],stored).map(l=>l?.id)).toEqual(['a',undefined,'c',undefined,'b']);
  });

  it('keeps the stored basis while the price is unchanged, else finds the basis with that price, else Custom',()=>{
    const options=[{basis:'contract',price:null},{basis:'customer',price:30.95},{basis:'list',price:46},{basis:'last_paid',price:31.5},{basis:'custom',price:31.5}] as import('@/server/pricing').PriceOption[];
    expect(internal.basisFor(31.5,line('a','X',31.5,'custom'),{options})).toBe('custom');
    expect(internal.basisFor(31.5,line('a','X',29.99,'custom'),{options})).toBe('last_paid');
    expect(internal.basisFor(30.95,undefined,{options})).toBe('customer');
    expect(internal.basisFor(33,undefined,{options})).toBe('custom');
    expect(internal.basisFor(33,undefined,undefined)).toBe('custom');
    expect(internal.basisFor(null,line('a','X',31.5,'last_paid'),{options})).toBeNull();
  });
});
