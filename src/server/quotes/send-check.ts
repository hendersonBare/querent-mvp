import type {QuoteHeader,QuoteLine} from '@/domain';
import type {QuoteFreight} from '@/server/freight/engine';

// Send blockers (spec §4): Send is blocked while the quote is unfinished. Pure, so the rep portal
// can grey out Approve & send and list the reasons as the rep edits. Lines below their margin
// floor are not blockers; they only warn (spec §5.2, the count in Confirm send).

export const SEND_BLOCKER_CODES=['no_lines','zero_qty','no_price','no_ship_to','call_for_freight'] as const;
export type SendBlockerCode=typeof SEND_BLOCKER_CODES[number];

export interface SendBlocker {
  code:SendBlockerCode;
  /** The line to fix, for zero_qty and no_price; null for quote-level blockers. */
  line_id:string|null;
  message:string;
}

/** What the check reads from a quote (Quote has all of it). */
export type SendCheckQuote=Pick<QuoteHeader,'fulfillment'|'ship_to_address'>&{lines:readonly Pick<QuoteLine,'id'|'line_no'|'sku'|'qty'|'unit_price'>[]};

/**
 * Everything that stops the quote being sent, lines first, or [] when it can go. `freight` is the
 * quote's freight from task 1.3 (freightForQuote / resolveFreight).
 *
 * The ship-to is checked on its own, not through freight: a rep freight override clears
 * `unresolved` even on a delivery with no ship-to, and nobody can deliver without an address.
 * A $0 price counts as priced (it only warns as below floor); a missing, negative or non-finite
 * price does not.
 */
export function sendBlockers(q:SendCheckQuote,freight:Pick<QuoteFreight,'unresolved'>):SendBlocker[]{
  const blockers:SendBlocker[]=[];
  if(!q.lines.length)blockers.push({code:'no_lines',line_id:null,message:'The quote has no lines.'});
  for(const l of q.lines){
    const name=`Line ${l.line_no} (${l.sku})`;
    if(!(l.qty>0))blockers.push({code:'zero_qty',line_id:l.id,message:`${name} has a quantity of 0.`});
    if(l.unit_price===null||!Number.isFinite(l.unit_price))blockers.push({code:'no_price',line_id:l.id,message:`${name} has no price.`});
    else if(l.unit_price<0)blockers.push({code:'no_price',line_id:l.id,message:`${name} has a price below $0.`});
  }
  if(q.fulfillment==='delivery'&&!q.ship_to_address?.trim())blockers.push({code:'no_ship_to',line_id:null,message:'Delivery has no ship-to address: add one, or switch to will call.'});
  if(freight.unresolved)blockers.push({code:'call_for_freight',line_id:null,message:'Freight is still call for freight: set it by hand before sending.'});
  return blockers;
}
