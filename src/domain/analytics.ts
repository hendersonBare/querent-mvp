import type {LineSource,QuoteStatus} from './quotes';

// Raw facts for the Analytics tab (spec §4). The stat cards compute from these (Phase 6).

export interface QuoteFact {
  id:string;quote_number:string;customer_id:string;rep_id:string;status:QuoteStatus;is_sample:boolean;
  requested_at:string;first_sent_at:string|null;last_sent_at:string|null;responded_at:string|null;revisions:number;
  /** Total of the last sent revision, or null if never sent. */
  sent_total:number|null;
}

/** Internal: one quote line with its cost and the floor for (quote rep x item category). */
export interface QuoteLineFact {
  quote_id:string;status:QuoteStatus;item_id:string;sku:string;category_id:string;qty:number;unit_price:number|null;
  suggested_price:number|null;customer_price:number|null;unit_cost:number;margin_floor:number|null;added_by:LineSource;
}

export interface RequestedItem {item_id:string;sku:string;description:string;quote_count:number;total_qty:number}
