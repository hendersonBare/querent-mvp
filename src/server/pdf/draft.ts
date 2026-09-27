import type {Quote} from '@/domain';
import type {QuoteFreight} from '@/server/freight/engine';
import {cents} from '@/server/quotes/snapshot';
import {validUntilFor} from '@/server/quotes/lifecycle';
import type {PdfQuote} from './model';

// The rep's preview of an unsent draft (task 4.1, for the 3.7 send dialog). Rep-only: customers
// get sent revisions only. Like buildSnapshot, it copies only the customer fields of the draft,
// so cost, basis, suggestions and Querent's notes never reach the PDF. Unlike it, an unfinished
// draft still previews: an unpriced line or call-for-freight shows as open, with no total.

/** The draft as the next revision would print it: dated `now`, valid for the quote's days from now. */
export function fromDraft(q:Quote,freight:QuoteFreight,now:string):PdfQuote{
  const lines=q.lines.map(l=>{
    const price=l.unit_price!==null&&Number.isFinite(l.unit_price)?l.unit_price:null;
    return {sku:l.sku,description:l.description,pack:l.pack,qty:l.qty,unit_price:price,total:price===null?null:cents(l.qty*price)};
  });
  const subtotal=cents(lines.reduce((sum,l)=>sum+(l.total??0),0));
  const amount=typeof freight.amount==='number'?cents(freight.amount):null;
  return {
    quote_number:q.quote_number,revision:q.revision+1,draft:true,date:now,valid_until:validUntilFor(now,q.valid_days),
    customer:{name:q.customer_name,account_number:q.account_number},contact:q.contact_name,rep:q.rep_name,customer_po:q.customer_po,customer_note:q.customer_note,
    fulfillment:q.fulfillment,branch:q.branch_code,ship_to:q.fulfillment==='delivery'?q.ship_to_address:null,
    lines,subtotal,freight:amount,freight_miles:q.fulfillment==='delivery'?freight.computed.miles:null,total:amount===null?null:cents(subtotal+amount),
  };
}
