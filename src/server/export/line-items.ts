import type {PdfQuote} from '@/server/pdf/model';
import {csvDocument,type CsvValue} from './csv';

// Line items (CSV) from the rep's Export menu (task 4.3, spec §4): the customer quote's line
// table, for Excel or Google Sheets. Pure and customer-safe by construction: it reads a PdfQuote,
// the customer PDF's own source (a sent revision's snapshot or the draft's customer fields,
// src/server/pdf/rep.ts), which has no field for cost, margin, floors, price basis or Querent's
// reasoning. So the columns are the customer PDF's: Line, SKU, Description, Qty, Unit, Unit price,
// Extended, then its totals. A file with cost and margin would be a separate, clearly internal
// export (the internal worksheet PDF covers that today).

export const LINE_ITEM_COLUMNS=['Line','SKU','Description','Qty','Unit','Unit price','Extended'] as const;

/** What the CSV reads from the quote: customer fields only. */
export type LineItemsQuote=Pick<PdfQuote,'quote_number'|'revision'|'draft'|'fulfillment'|'branch'|'lines'|'subtotal'|'freight'|'freight_miles'|'total'>;

/** "1122.40": two decimals, no currency sign or thousands separator, so any spreadsheet locale reads a number. */
export const plainAmount=(amount:number)=>amount.toFixed(2);
/** A unit price keeps its cents and up to four decimals, like the PDF ($0.0825 rivets): "31.50", "0.0825". */
export const plainUnitPrice=(price:number)=>price.toFixed(4).replace(/(\.\d{2}\d*?)0+$/,'$1');

function freightLabel(q:LineItemsQuote){
  if(q.fulfillment==='will_call')return `Freight, will call at ${q.branch}`;
  return `Freight, delivery from ${q.branch}${q.freight_miles===null?'':`, ${q.freight_miles.toFixed(1)} mi`}`;
}

/** A totals row: the label under Description, the value under Extended. */
const totalRow=(label:string,value:string):CsvValue[]=>['','',label,'','','',value];

/** The CSV text (UTF-8 BOM, CRLF rows). An unpriced line on a draft leaves its prices empty. */
export function lineItemsCsv(q:LineItemsQuote):string{
  return csvDocument([
    LINE_ITEM_COLUMNS,
    ...q.lines.map((l,i):CsvValue[]=>[i+1,l.sku,l.description,l.qty,l.pack,
      l.unit_price===null?null:plainUnitPrice(l.unit_price),l.total===null?null:plainAmount(l.total)]),
    [],
    totalRow('Subtotal',plainAmount(q.subtotal)),
    totalRow(freightLabel(q),q.freight===null?'Call for freight':plainAmount(q.freight)),
    totalRow('Sales tax','Added on invoice'),
    totalRow('Total before tax',q.total===null?'To be confirmed':plainAmount(q.total)),
  ]);
}

/** "Q-24817 rev 1 line items.csv"; the draft's is "Q-24817 rev 1 draft line items.csv" (rev 1 is the one a send would store). */
export const lineItemsFilename=(q:Pick<PdfQuote,'quote_number'|'revision'|'draft'>)=>`${q.quote_number} rev ${q.revision}${q.draft?' draft':''} line items.csv`;
