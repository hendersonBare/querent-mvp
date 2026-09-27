import type {Quote,QuoteSnapshot} from '@/domain';

// The frozen revision (spec §5.4): each send stores what the customer was sent ("Q-24817 rev 2")
// so the PDF they saw can always be reproduced. Pure; copies only customer-facing fields, never
// cost, margin, Querent's suggestions or internal notes.

/** Rounds dollars to the cent, half up. toPrecision drops float noise first (7 x 12.345 = 86.41499999999999 -> 86.42). */
export const cents=(n:number)=>Math.round(Number((n*100).toPrecision(12)))/100;

export interface SnapshotInput {revision:number;sentAt:string;validUntil:string;
  /** Resolved freight in dollars (task 1.3). Call-for-freight never reaches a snapshot: it blocks send. */
  freight:number;
  /** Road miles from the branch (FreightQuote.miles), printed on the customer PDF (task 4.1). */
  freightMiles?:number|null}

/**
 * The customer's copy of `q` as sent. Each line total is qty x price to the cent, and the
 * subtotal is the sum of those line totals, so the PDF adds up. Throws RangeError on an unpriced
 * line or freight, which sendBlockers stops earlier.
 */
export function buildSnapshot(q:Quote,{revision,sentAt,validUntil,freight,freightMiles}:SnapshotInput):QuoteSnapshot{
  if(!Number.isFinite(freight))throw new RangeError(`${q.quote_number}: freight must be priced before sending.`);
  const lines=q.lines.map(l=>{
    if(l.unit_price===null||!Number.isFinite(l.unit_price))throw new RangeError(`${q.quote_number} line ${l.line_no} has no price.`);
    return {sku:l.sku,description:l.description,pack:l.pack,qty:l.qty,unit_price:l.unit_price,total:cents(l.qty*l.unit_price)};
  });
  const subtotal=cents(lines.reduce((sum,l)=>sum+l.total,0));
  return {
    quote_number:q.quote_number,revision,sent_at:sentAt,customer:{name:q.customer_name,account_number:q.account_number},contact:q.contact_name,rep:q.rep_name,
    fulfillment:q.fulfillment,branch:q.branch_code,ship_to:q.fulfillment==='delivery'?q.ship_to_address:null,
    valid_days:q.valid_days,valid_until:validUntil,customer_po:q.customer_po,customer_note:q.customer_note,
    subtotal,freight:cents(freight),total:cents(subtotal+freight),lines,
    ...(freightMiles===undefined?{}:{freight_miles:freightMiles}),
  };
}
