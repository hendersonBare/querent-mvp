import type {Fulfillment} from './orders';
import type {DeclineReason,QuoteStatus} from './quotes';

// The Team dashboard's facts (v3 spec §7; decisions 23–25; task D3). Internal: they carry cost
// and margin, for the manager only.

/** Internal: one cohort quote (created in the window) as the Team metrics read it. Money in dollars unless named _cents. */
export interface TeamQuoteFact {
  id:string;quote_number:string;
  /** The current owner (a reassigned quote counts under its new rep). */
  rep_id:string;
  status:QuoteStatus;created_at:string;sent_at:string|null;responded_at:string|null;valid_until:string|null;
  fulfillment:Fulfillment;
  last_rep_touch_at:string|null;customer_viewed_at:string|null;
  decline_reason:DeclineReason|null;decline_note:string|null;declined_at:string|null;
  /** The latest sent revision's total, or null if never sent. */
  sent_total:number|null;
  /** The live draft total (items + freight, as the Quotes list shows it) for a quote never sent; null otherwise. */
  draft_total:number|null;
  /** Priced lines at unit_price (before freight recovery, OA-10) and their cost: the quote's margin. */
  priced_subtotal:number;priced_cost:number;
  /** Σ freight_recovery × qty over the lines, in cents. */
  recovered_cents:number;
  /** The modelled delivery cost frozen on the quote (null for will call or before C1). */
  modelled_freight_cents:number|null;
  /** Lines the customer added from the pop-up's suggestions, and rep-added "Suggested by Querent" lines. */
  suggestion_lines:number;upsell_lines:number;
  /** Suggestions the pop-up behind this quote offered (OA-13, OA-42); 0 with no pop-up. */
  suggestions_offered:number;
}

/** A status change on a cohort quote's timeline (quote_activity kinds sent, accepted, changes_requested, declined, expired). */
export interface TeamStatusEvent {quote_id:string;at:string;kind:'sent'|'accepted'|'changes_requested'|'declined'|'expired'}
