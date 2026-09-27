import {describe,expect,it} from 'vitest';
import type {PdfQuote} from '@/server/pdf/model';
import {LINE_ITEM_COLUMNS,lineItemsCsv,lineItemsFilename,plainAmount,plainUnitPrice} from './line-items';

// Line items (CSV) from the Export menu (task 4.3): the customer quote's line table as a
// spreadsheet. It is built from the same customer-safe PdfQuote as the customer PDF, so it has
// the PDF's columns and totals and nothing internal.

const SAMPLE:PdfQuote={
  quote_number:'Q-24817',revision:1,draft:true,date:'2026-09-25T18:00:00.000Z',valid_until:'2026-10-09',
  customer:{name:'Wasatch Mechanical Contractors',account_number:'WAS-1142'},contact:'Dana Ortiz',rep:'Brandi Gallegos',
  customer_po:null,customer_note:null,fulfillment:'will_call',branch:'SLC',ship_to:null,
  lines:[
    {sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',pack:'Box of 50',qty:10,unit_price:31.5,total:315},
    {sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',qty:6,unit_price:36,total:216},
    {sku:'GLV-N8-L-1000',description:'Nitrile disposable gloves, 8 mil, black, size L',pack:'Case of 1,000',qty:4,unit_price:79,total:316},
    {sku:'RS-2-27-JH',description:'Ratchet strap 2 in x 27 ft, 3,333 lb WLL, J-hooks',pack:'Each',qty:12,unit_price:22.95,total:275.4},
  ],
  subtotal:1122.4,freight:0,freight_miles:null,total:1122.4,terms:null,rep_contact:null,letterhead:null,
};

const rowsOf=(text:string)=>text.replace(/^﻿/,'').split('\r\n');

describe('lineItemsCsv',()=>{
  it('writes the customer PDF\'s line table, one row per line, then the totals',()=>{
    const text=lineItemsCsv(SAMPLE);
    expect(text.startsWith('﻿')).toBe(true);
    expect(rowsOf(text)).toEqual([
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
    expect(LINE_ITEM_COLUMNS).toEqual(['Line','SKU','Description','Qty','Unit','Unit price','Extended']);
  });

  it('has no column or word for cost, margin, floors, price basis or Querent\'s reasoning',()=>{
    const text=lineItemsCsv(SAMPLE);
    expect(text).not.toMatch(/cost|margin|floor|\bGP\b|%|basis|last paid|list price|contract|suggest|querent|internal/i);
  });

  it('prints delivery with its miles, and leaves an open price, call for freight and the total to be confirmed on a draft',()=>{
    const draft:PdfQuote={...SAMPLE,fulfillment:'delivery',ship_to:'1800 W 10950 S, South Jordan, UT 84095',freight:null,freight_miles:15,total:null,
      lines:[...SAMPLE.lines.slice(0,1),{sku:'FD-45-60Z',description:'Flap disc 4.5 in, 60 grit zirconia',pack:'Box of 10',qty:2,unit_price:null,total:null}],subtotal:315};
    expect(rowsOf(lineItemsCsv(draft)).slice(2)).toEqual([
      '2,FD-45-60Z,"Flap disc 4.5 in, 60 grit zirconia",2,Box of 10,,',
      '',
      ',,Subtotal,,,,315.00',
      ',,"Freight, delivery from SLC, 15.0 mi",,,,Call for freight',
      ',,Sales tax,,,,Added on invoice',
      ',,Total before tax,,,,To be confirmed',
      '',
    ]);
    const priced={...draft,freight:62.5,total:377.5};
    expect(rowsOf(lineItemsCsv(priced))).toContain(',,"Freight, delivery from SLC, 15.0 mi",,,,62.50');
  });

  it('keeps a hostile description as text: quoted, with its formula disarmed',()=>{
    const hostile={...SAMPLE,lines:[{sku:'@SKU',description:'=HYPERLINK("http://evil.example","Click, here")',pack:'-1',qty:1,unit_price:1,total:1}]};
    expect(rowsOf(lineItemsCsv(hostile))[1]).toBe('1,\'@SKU,"\'=HYPERLINK(""http://evil.example"",""Click, here"")",1,\'-1,1.00,1.00');
  });

  it('writes an empty quote as the header and the totals',()=>{
    const empty={...SAMPLE,lines:[],subtotal:0,total:0};
    expect(rowsOf(lineItemsCsv(empty))).toEqual(['Line,SKU,Description,Qty,Unit,Unit price,Extended','',',,Subtotal,,,,0.00',',,"Freight, will call at SLC",,,,0.00',',,Sales tax,,,,Added on invoice',',,Total before tax,,,,0.00','']);
  });
});

describe('numbers',()=>{
  it('writes plain amounts a spreadsheet reads as numbers: no $, no thousands separator, two decimals',()=>{
    expect(plainAmount(1122.4)).toBe('1122.40');
    expect(plainAmount(0)).toBe('0.00');
    expect(plainAmount(12345.678)).toBe('12345.68');
  });

  it('keeps a unit price\'s cents and up to four decimals, like the PDF',()=>{
    expect(plainUnitPrice(31.5)).toBe('31.50');
    expect(plainUnitPrice(22.95)).toBe('22.95');
    expect(plainUnitPrice(0.0825)).toBe('0.0825');
    expect(plainUnitPrice(1.234)).toBe('1.234');
    expect(plainUnitPrice(1500)).toBe('1500.00');
  });
});

describe('lineItemsFilename',()=>{
  it('names the quote and revision, and says draft for the unsent draft',()=>{
    expect(lineItemsFilename(SAMPLE)).toBe('Q-24817 rev 1 draft line items.csv');
    expect(lineItemsFilename({...SAMPLE,draft:false,revision:2})).toBe('Q-24817 rev 2 line items.csv');
  });
});
