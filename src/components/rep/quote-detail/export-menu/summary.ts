import {formatAmount,formatDay,formatUnitPrice,type PdfQuote} from '@/server/pdf/model';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import {shortName,type DetailLine,type QuoteFigures} from '@/server/rep/quote-math';
import {cents} from '@/server/quotes/snapshot';

// Copy quote summary (task 4.3, spec §4, the mockup's summaryText): the quote as plain text for
// an email or a text message, in the mockup's shape:
//
//   Quote Q-24817 rev 1 for Wasatch Mechanical Contractors (Dana Ortiz)
//   Valid until Oct 9, 2026 · Will call at SLC
//
//   10 x HCS-12-13-2G8 Hex cap screw 1/2-13 x 2 in (Box of 50) @ $31.50 = $315.00
//   …
//
//   Items $1,122.40 · Freight $0.00 · Total $1,122.40 before tax
//
// Pure. Customer-safe by construction: the text is built from a SummaryQuote, a Pick of the
// customer PDF's PdfQuote, which has no field for cost, margin, floors, price basis or Querent's
// reasoning; summaryQuoteOf copies named fields only. It reads the quote as it stands on screen,
// like the other exports: the draft while the rep can edit it (numbered as the revision a send
// would store), else the latest sent revision (which a sent quote's lines are).

/** What the summary says. */
export type SummaryQuote=Pick<PdfQuote,'quote_number'|'revision'|'customer'|'contact'|'valid_until'|'terms'|'fulfillment'|'branch'|'ship_to'|'lines'|'subtotal'|'freight'|'total'>;

/**
 * The summary's facts from the quote page: `lines` as on screen (queued edits and typing
 * included) and their `figures` (the totals the page shows). `terms` are the customer's payment
 * terms when the page has them.
 */
export function summaryQuoteOf(detail:Pick<QuoteDetail,'quote'|'valid_until'|'editable'>,lines:readonly DetailLine[],
  figures:Pick<QuoteFigures,'items'|'freight'|'total'>,terms:string|null=null):SummaryQuote{
  const {quote}=detail;
  return {
    quote_number:quote.quote_number,revision:detail.editable?quote.revision+1:quote.revision,
    customer:{name:quote.customer_name,account_number:quote.account_number},contact:quote.contact_name,
    valid_until:detail.valid_until,terms,fulfillment:quote.fulfillment,branch:quote.branch_code,
    ship_to:quote.fulfillment==='delivery'?quote.ship_to_address:null,
    lines:lines.map(l=>{
      const price=l.unit_price!==null&&Number.isFinite(l.unit_price)?l.unit_price:null;
      return {sku:l.sku,description:l.description,pack:l.pack,qty:l.qty,unit_price:price,total:price===null?null:cents(l.qty*price)};
    }),
    subtotal:figures.items,freight:figures.freight.amount,total:figures.total,
  };
}

const pack=(unit:string)=>/^each$/i.test(unit.trim())?'':` (${unit})`;

/** The summary as plain text, lines joined with \n. */
export function quoteSummaryText(q:SummaryQuote):string{
  const who=q.contact?` (${q.contact})`:'';
  const fulfillment=q.fulfillment==='will_call'?`Will call at ${q.branch}`:`Delivery from ${q.branch}${q.ship_to?.trim()?` to ${q.ship_to.trim()}`:''}`;
  const facts=[q.valid_until&&`Valid until ${formatDay(q.valid_until)}`,q.terms?.trim(),fulfillment].filter(Boolean).join(' · ');
  const items=q.lines.map(l=>`${l.qty} x ${l.sku} ${shortName(l.description)}${pack(l.pack)} @ `
    +(l.unit_price===null||l.total===null?'price to be confirmed':`${formatUnitPrice(l.unit_price)} = ${formatAmount(l.total)}`));
  const totals=[`Items ${formatAmount(q.subtotal)}`,q.freight===null?'Freight to be confirmed':`Freight ${formatAmount(q.freight)}`,
    q.total===null?'Total to be confirmed':`Total ${formatAmount(q.total)} before tax`].join(' · ');
  return [`Quote ${q.quote_number} rev ${q.revision} for ${q.customer.name}${who}`,facts,'',...items,'',totals].join('\n');
}
