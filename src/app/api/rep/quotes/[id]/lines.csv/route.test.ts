// @vitest-environment node
import {NextRequest} from 'next/server';
import {beforeAll,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';
import {internalLeaks} from '@/server/pdf/test-pdf';

// GET /api/rep/quotes/<id>/lines.csv?rev=n|draft (task 4.3): Line items (CSV) from the Export menu.
// Rep-only (401 without a session, 403 for the customer), the rep's own quotes only (another
// rep's is 404, like an unknown one). rev works as on the PDF route: a sent revision, the latest
// sent without it, or rev=draft for the unsent draft.

useSeededDatabase();

let GET:typeof import('./route').GET;
/** Quotes of Canyon Ridge, Mara's customer: one she sent, one still a draft. */
let marasSentQuote='',marasDraft='';

const call=(id:string,query='',persona:'customer'|'supplier'|null='supplier')=>GET(
  new NextRequest(`http://127.0.0.1/api/rep/quotes/${encodeURIComponent(id)}/lines.csv${query}`,{headers:persona?{cookie:`querent-persona=${persona}`}:{}}),
  {params:Promise.resolve({id})},
);
const detail=async(response:Response)=>(await response.json()).detail as string;
/** The body as bytes, then as text without the BOM, split into rows. */
async function csvOf(response:Response){
  const bytes=new Uint8Array(await response.arrayBuffer());
  const text=new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes);
  return {bytes,text,rows:text.replace(/^﻿/,'').split('\r\n')};
}

beforeAll(async()=>{
  ({GET}=await import('./route'));
  const {createQuote}=await import('@/server/repository');
  const {sendQuote}=await import('@/server/quotes/service');
  const lines=[{itemId:'GLV-N8-L-1000',qty:2,unitPrice:82,priceBasis:'custom' as const}];
  const sent=createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',lines});
  await sendQuote(sent.id,{repId:'mara'});
  marasSentQuote=sent.quote_number;
  marasDraft=createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',lines}).quote_number;
});

describe('who may export',()=>{
  it('asks for a workspace without a session, and refuses the customer',async()=>{
    const none=await call('Q-24817','?rev=draft',null);
    expect(none.status).toBe(401);
    expect(await detail(none)).toBe('Choose a demo workspace.');
    // Even Dana's own sent quote: the CSV is a rep tool.
    for(const [id,query] of [['Q-24816',''],['Q-24817','?rev=draft']]){
      const response=await call(id,query,'customer');
      expect(response.status).toBe(403);
      expect(await detail(response)).toBe('Supplier access required.');
    }
  });

  it('answers 404 for another rep\'s quote, sent or draft, exactly as for an unknown one',async()=>{
    for(const [id,query] of [[marasSentQuote,''],[marasSentQuote,'?rev=1'],[marasDraft,'?rev=draft'],['q-nope','']]){
      const response=await call(id,query);
      expect(response.status,`${id}${query}`).toBe(404);
      expect(await detail(response)).toBe('Quote not found.');
    }
  });

  it('refuses a malformed rev',async()=>{
    for(const query of ['?rev=0','?rev=one','?rev=-1']){
      const response=await call('Q-24816',query);
      expect(response.status).toBe(400);
      expect(await detail(response)).toMatch(/^rev must be/);
    }
  });
});

describe('the rep\'s own quotes',()=>{
  it('downloads the draft of Q-24817 as a UTF-8 CSV with a BOM, named for the quote',async()=>{
    const response=await call('Q-24817','?rev=draft');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="Q-24817 rev 1 draft line items.csv"; filename*=UTF-8\'\'Q-24817%20rev%201%20draft%20line%20items.csv');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const {bytes,rows}=await csvOf(response);
    expect([...bytes.slice(0,3)]).toEqual([0xef,0xbb,0xbf]);
    expect(rows).toEqual([
      'Line,SKU,Description,Qty,Unit,Unit price,Extended',
      '1,HCS-12-13-2G8,"Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc",10,Box of 50,31.50,315.00',
      '2,CW-45-045-T1,"Cut-off wheel 4.5 x .045 x 7/8 in, Type 1",6,Box of 25,36.00,216.00',
      '3,GLV-N8-L-1000,"Nitrile disposable gloves, 8 mil, black, size L",4,"Case of 1,000",79.00,316.00',
      '4,RS-2-27-JH,"Ratchet strap 2 in x 27 ft, 3,333 lb WLL, J-hooks",12,Each,22.95,275.40',
      '',
      ',,Subtotal,,,,1122.40',
      ',,"Freight, will call at SLC",,,,0.00',
      ',,Sales tax,,,,Added on invoice',
      ',,Total before tax,,,,1122.40',
      '',
    ]);
  });

  it('never carries cost, margin, floors, price basis or Querent\'s reasoning',async()=>{
    const {quote}=await import('@/server/repository');
    for(const [id,query] of [['Q-24817','?rev=draft'],['Q-24816','']]){
      const {text}=await csvOf(await call(id,query));
      expect(internalLeaks(text,quote(id.toLowerCase())!.lines),`${id}${query}`).toEqual([]);
    }
  });

  it('exports the latest sent revision without rev, or rev n; a quote that was never sent has only its draft',async()=>{
    for(const [id,query] of [['Q-24816',''],['q-24816','?rev=1']]){
      const response=await call(id,query);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="Q-24816 rev 1 line items\.csv"/);
      const {rows}=await csvOf(response);
      expect(rows).toContain(',,"Freight, delivery from SLC, 15.0 mi",,,,62.50');
      expect(rows).toContain(',,Total before tax,,,,655.25');
    }
    const unsent=await call('Q-24817');
    expect(unsent.status).toBe(404);
    expect(await detail(unsent)).toBe('Q-24817 hasn\'t been sent yet. Preview the draft with rev=draft.');
    expect((await call('Q-24816','?rev=2')).status).toBe(404);
  });

  it('has no draft to export once the quote is sent (409): Q-24816 is accepted',async()=>{
    const response=await call('Q-24816','?rev=draft');
    expect(response.status).toBe(409);
    expect(await detail(response)).toBe('Q-24816 has no draft to preview: it is accepted. Open rev 1 instead.');
  });
});
