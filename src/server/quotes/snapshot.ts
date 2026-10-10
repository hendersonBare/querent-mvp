import type {Branch,Quote,QuoteSnapshot,Rep,SnapshotLetterhead,SnapshotRepContact,Supplier} from '@/domain';
import {fromCents,roundDollars} from '@/lib/money';

// The frozen revision (spec §5.4): each send stores what the customer was sent ("Q-24817 rev 2")
// so the PDF they saw can always be reproduced. Pure; copies only customer-facing fields, never
// cost, margin, Querent's suggestions or internal notes.

/** Rounds dollars to the cent: the shared money helper (src/lib/money.ts), kept under its old name for its callers. */
export const cents=roundDollars;

/**
 * What the customer pays per unit (spec §4.5): the unit price plus the line's freight recovery
 * (integer cents per unit), in dollars. Exactly the unit price with no recovery (free delivery pricing
 * off); otherwise kept to 4 decimals, like a unit price on the customer PDF.
 */
export function customerUnitPrice(unitPrice:number,freightRecovery:number){
  if(!freightRecovery)return unitPrice;
  return Math.round(Number(((unitPrice+fromCents(freightRecovery))*10_000).toPrecision(12)))/10_000;
}

/** The rep's contact block on the customer PDF, from a rep or a stored contact: named fields only. */
export function repContactOf(r:Pick<Rep,'name'>&{[K in 'title'|'phone'|'email']:string|null}):SnapshotRepContact{
  return {name:r.name,title:r.title||null,phone:r.phone||null,email:r.email||null};
}

/** The customer PDF's letterhead: Herrick's name and website, and the quote's branch with its will-call phone. */
export function letterheadOf(s:Pick<Supplier,'name'|'website'>,b:Pick<Branch,'name'|'address'|'city'|'state'|'zip'|'will_call_phone'>):SnapshotLetterhead{
  return {supplier:s.name,website:s.website||null,branch:b.name,address:b.address,city:b.city,state:b.state,zip:b.zip,phone:b.will_call_phone};
}

/** A letterhead's named fields only, whatever else the object carries. */
export function copyLetterhead(l:SnapshotLetterhead):SnapshotLetterhead{
  return {supplier:l.supplier,website:l.website,branch:l.branch,address:l.address,city:l.city,state:l.state,zip:l.zip,phone:l.phone};
}

export interface SnapshotInput {revision:number;sentAt:string;validUntil:string;
  /** Days from the send day to validUntil (the rep may pick any expiration date); the quote's valid_days when absent. */
  validDays?:number;
  /** Resolved freight in dollars (task 1.3). Call-for-freight never reaches a snapshot: it blocks send. */
  freight:number;
  /** Road miles from the branch (FreightQuote.miles), printed on the customer PDF (task 4.1). */
  freightMiles?:number|null;
  // What the customer PDF prints around the quote, as it stands at send (task 4.1).
  /** The customer's payment terms. */
  terms?:string|null;
  repContact?:SnapshotRepContact|null;
  letterhead?:SnapshotLetterhead|null}

/**
 * The customer's copy of `q` as sent. Each line's price is the customer-facing unit price (unit
 * price + freight recovery, spec §4.5) and its total is qty x that price to the cent; the subtotal
 * is the sum of those line totals, so the PDF adds up. Nothing about the recovery itself is copied.
 * Throws RangeError on an unpriced line or freight, which sendBlockers stops earlier. Optional
 * inputs left out add no key.
 */
export function buildSnapshot(q:Quote,{revision,sentAt,validUntil,validDays,freight,freightMiles,terms,repContact,letterhead}:SnapshotInput):QuoteSnapshot{
  if(!Number.isFinite(freight))throw new RangeError(`${q.quote_number}: freight must be priced before sending.`);
  const lines=q.lines.map(l=>{
    if(l.unit_price===null||!Number.isFinite(l.unit_price))throw new RangeError(`${q.quote_number} line ${l.line_no} has no price.`);
    const unitPrice=customerUnitPrice(l.unit_price,l.freight_recovery);
    return {sku:l.sku,description:l.description,pack:l.pack,qty:l.qty,unit_price:unitPrice,total:cents(l.qty*unitPrice)};
  });
  const subtotal=cents(lines.reduce((sum,l)=>sum+l.total,0));
  return {
    quote_number:q.quote_number,revision,sent_at:sentAt,customer:{name:q.customer_name,account_number:q.account_number},contact:q.contact_name,rep:q.rep_name,
    fulfillment:q.fulfillment,branch:q.branch_code,ship_to:q.fulfillment==='delivery'?q.ship_to_address:null,
    valid_days:validDays??q.valid_days,valid_until:validUntil,customer_po:q.customer_po,customer_note:q.customer_note,
    subtotal,freight:cents(freight),total:cents(subtotal+freight),lines,
    ...(freightMiles===undefined?{}:{freight_miles:freightMiles}),
    ...(terms===undefined?{}:{terms}),
    ...(repContact===undefined?{}:{rep_contact:repContact&&repContactOf(repContact)}),
    ...(letterhead===undefined?{}:{letterhead:letterhead&&copyLetterhead(letterhead)}),
  };
}
