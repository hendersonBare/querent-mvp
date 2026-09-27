import type {LineSource,PriceBasis,QuoteStatus} from './quotes';

// Raw facts for the Analytics tab (spec §4). The stat cards compute from these (task 6.2, src/server/analytics).

export interface QuoteFact {
  id:string;quote_number:string;customer_id:string;rep_id:string;status:QuoteStatus;is_sample:boolean;
  requested_at:string;first_sent_at:string|null;last_sent_at:string|null;responded_at:string|null;
  /** Set on send; with `status` it gives the effective status (a sent quote past it is expired). */
  valid_until:string|null;
  revisions:number;
  /** Total of the last sent revision, or null if never sent. */
  sent_total:number|null;
}

/** Internal: one quote line with its cost, Querent's suggestion and the floor for (quote rep x item category). */
export interface QuoteLineFact {
  quote_id:string;status:QuoteStatus;item_id:string;sku:string;category_id:string;qty:number;unit_price:number|null;price_basis:PriceBasis|null;
  suggested_price:number|null;suggested_basis:PriceBasis|null;customer_price:number|null;unit_cost:number;
  /** null when the quote rep has no floor row for the category (use DEFAULT_FLOOR). */
  margin_floor:number|null;added_by:LineSource;
}

/**
 * Internal: one line of a quote's last sent revision, as the customer saw it (the frozen
 * snapshot), with its cost and the floor for (quote rep x item category). unit_cost is the draft
 * line's, frozen when the line was written, or the item's if the rep has since removed the line.
 */
export interface SentLineFact {
  quote_id:string;revision:number;item_id:string;sku:string;category_id:string;qty:number;unit_price:number;unit_cost:number;
  /** null when the quote rep has no floor row for the category (use DEFAULT_FLOOR). */
  margin_floor:number|null;
}

export interface RequestedItem{item_id:string;sku:string;description:string;quote_count:number;total_qty:number}
