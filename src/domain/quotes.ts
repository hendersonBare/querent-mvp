import type {Rep} from './accounts';
import type {Fulfillment} from './orders';

// Quotes (spec §4, §5.4). Quote and QuoteLine are internal: they carry unit cost and Querent's
// pricing notes. Customers only ever see CustomerQuoteSummary / CustomerQuoteView, which are
// built from the frozen revision the rep sent.

export const QUOTE_STATUSES=['ready_for_review','sent','accepted','changes_requested','expired'] as const;
export type QuoteStatus=typeof QUOTE_STATUSES[number];
export const PRICE_BASES=['contract','customer','list','last_paid','custom'] as const;
export type PriceBasis=typeof PRICE_BASES[number];
/** Who added a line: Querent's match, the rep, a rep-taken upsell chip, or the customer from the pop-up's suggestions (task E1). */
export const LINE_SOURCES=['querent','rep','upsell','suggestion'] as const;
export type LineSource=typeof LINE_SOURCES[number];
export type ActivityActor='customer'|'querent'|'rep'|'system';
export type ValidDays=7|14|30;

export interface QuoteHeader {
  id:string;quote_number:string;customer_id:string;customer_name:string;account_number:string;contact_id:string|null;contact_name:string|null;rep_id:string;rep_name:string;
  status:QuoteStatus;
  /** The last sent revision (0 = never sent). */
  revision:number;
  conversation_id:string|null;request_text:string|null;requested_at:string;created_at:string;updated_at:string;sent_at:string|null;responded_at:string|null;
  fulfillment:Fulfillment;branch_id:string;branch_code:string;
  /** The pickup/delivery day asked for in chat. fulfillment_time is what the customer confirms on Accept. */
  requested_date:string|null;fulfillment_time:string|null;
  ship_to_address:string|null;ship_to_lat:number|null;ship_to_lng:number|null;
  /** Freight is computed (task 1.3); only a rep override is stored. */
  freight_override:number|null;freight_override_reason:string|null;
  /**
   * Free delivery pricing (spec §4.4, §4.5), internal: the recovery rate frozen into the quote in bp
   * (null: the quote carries no recovery) with its ramp step of steps, and the modelled delivery cost
   * in cents (null for will call or call for freight). Never on a customer-safe type.
   */
  freight_rate_bp:number|null;freight_ramp_step:number|null;freight_ramp_steps:number|null;modelled_freight_cents:number|null;
  valid_days:ValidDays;valid_until:string|null;
  /** The expiration date the rep picked (YYYY-MM-DD), or null for the default: valid_days after the send day. */
  expires_on:string|null;
  customer_po:string|null;
  /** customer_note is printed on the quote; change_request_note is the customer's Request changes note. */
  customer_note:string|null;change_request_note:string|null;
  unread_for_rep:boolean;unread_for_customer:boolean;is_sample:boolean;duplicated_from:string|null;
}

/** Internal: one draft line with its cost and Querent's suggestion. */
export interface QuoteLine {
  id:string;quote_id:string;line_no:number;item_id:string;sku:string;description:string;pack:string;case_qty:number;category_id:string;category_name:string;list_price:number;
  qty:number;
  /** null = not priced yet. */
  unit_price:number|null;price_basis:PriceBasis|null;
  suggested_price:number|null;suggested_basis:PriceBasis|null;
  /** Kept for "+$X GP vs customer price". */
  customer_price:number|null;
  unit_cost:number;
  /**
   * Freight recovered in this line's price, integer cents per unit (spec §4.5, OA-6). The customer
   * pays unit_price + freight_recovery; unit_price stays the engine or rep price, so margin, floors
   * and suggestions ignore it (OA-10). 0 when the quote carries no recovery.
   */
  freight_recovery:number;
  /** Querent's "Why this price?" note. */
  explanation:string|null;requested_text:string|null;match_score:number|null;added_by:LineSource;
}

export interface Quote extends QuoteHeader {lines:QuoteLine[]}

/** One row of the rep's Quotes list. subtotal, cost_total and margin cover priced lines only (margin per spec §5.2). */
export interface QuoteListRow {
  id:string;quote_number:string;customer_id:string;customer_name:string;rep_id:string;rep_name:string;status:QuoteStatus;revision:number;
  requested_at:string;updated_at:string;sent_at:string|null;valid_until:string|null;fulfillment:Fulfillment;change_request_note:string|null;
  unread_for_rep:boolean;is_sample:boolean;line_count:number;subtotal:number;cost_total:number;margin:number|null;freight_override:number|null;
  /** Total of the last sent revision, or null if never sent. */
  sent_total:number|null;
}

export interface QuoteSnapshotLine {sku:string;description:string;pack:string;qty:number;unit_price:number;total:number}

/** The rep's contact as printed on the customer PDF, frozen at send (task 4.1). */
export interface SnapshotRepContact {name:string;title:string|null;phone:string|null;email:string|null}

/** The customer PDF's letterhead, frozen at send (task 4.1): Herrick and the quote's branch, with its phone. */
export interface SnapshotLetterhead {supplier:string;website:string|null;branch:string;address:string;city:string;state:string;zip:string;phone:string}

/**
 * The frozen copy of what the customer was sent ("Q-24817 rev 2"). Never add cost or internal notes.
 * Customer reads copy only these fields (see customerQuote), so a new field must be added here too.
 */
export interface QuoteSnapshot {
  quote_number:string;revision:number;customer:{name:string;account_number:string};contact:string|null;rep:string;
  fulfillment:Fulfillment;branch:string;valid_until:string|null;subtotal:number;freight:number;total:number;lines:QuoteSnapshotLine[];
  // The terms, frozen at send (task 1.5). Absent on snapshots stored before it (the seeded history).
  /** valid_days: the days from the send day to valid_until (the rep can pick any expiration date). */
  sent_at?:string;valid_days?:number;customer_po?:string|null;customer_note?:string|null;
  /** The delivery address, or null for will call. */
  ship_to?:string|null;
  /** Road miles from the branch that priced delivery freight (task 4.1 prints them); null for will call or unmeasured. */
  freight_miles?:number|null;
  // What the customer PDF prints around the quote, frozen at send so the PDF can always be
  // reproduced even after the account, rep or branch changes (task 4.1). Absent on snapshots
  // stored before it; the PDF then falls back to the live records.
  /** The customer's payment terms ("Net 30"). */
  terms?:string|null;
  rep_contact?:SnapshotRepContact|null;
  letterhead?:SnapshotLetterhead|null;
}

export interface QuoteRevision {id:string;quote_id:string;revision:number;sent_at:string;sent_by:string;message:string|null;attach_pdf:boolean;total:number;snapshot:QuoteSnapshot}

export interface QuoteActivity {id:number;quote_id:string;at:string;actor:ActivityActor;actor_id:string|null;kind:string;message:string}

/** Internal notes, never shown to the customer. */
export interface QuoteNote {id:number;quote_id:string;rep_id:string;rep_name:string;body:string;created_at:string}

/** Customer-safe: one quote button in the customer's right sidebar. total is the last sent revision's, or null before the first send. */
export interface CustomerQuoteSummary {id:string;quote_number:string;status:QuoteStatus;revision:number;requested_at:string;sent_at:string|null;valid_until:string|null;total:number|null;unread:boolean}

/** Customer-safe: the PDF preview modal. `sent` is the last revision the rep sent, or null before the first send. */
export interface CustomerQuoteView extends CustomerQuoteSummary {
  fulfillment_time:string|null;customer_po:string|null;change_request_note:string|null;
  sent:{revision:number;sent_at:string;message:string|null;attach_pdf:boolean;snapshot:QuoteSnapshot}|null;
}

/**
 * Customer-safe: one revision the rep sent (the customer PDF, task 4.1), with the quote's rep for its
 * contact block. attach_pdf: the rep left Attach PDF on, so the preview modal offers Download (5.1).
 */
export interface CustomerQuoteRevision {quote_id:string;revision:number;sent_at:string;attach_pdf:boolean;snapshot:QuoteSnapshot;rep:Rep|null}

/**
 * Customer-safe: what the PDF preview modal shows for one of the customer's quotes (task 5.1).
 * `shown` is the sent revision on screen (the latest unless an older one was asked for), or null
 * before the rep's first send: the customer PDF doesn't exist until then.
 */
export interface CustomerQuotePreview {
  id:string;quote_number:string;
  /** The status to show now: a sent quote past valid_until reads expired. */
  status:QuoteStatus;
  /** The last revision sent, 0 before the first send. */
  latest_revision:number;
  requested_at:string;
  shown:{revision:number;sent_at:string;total:number;valid_until:string|null;attach_pdf:boolean;
    /** GET /api/quotes/<id>/pdf?variant=customer&rev=<n>: shown inline, and downloaded when attach_pdf. */
    pdf_url:string;
    /**
     * What the rep approved in this revision (task 5.2): pickup (will call) or delivery, from which
     * branch (its code), to which address, and the PO they printed. Accept shows them locked.
     */
    fulfillment:Fulfillment;branch:string;ship_to:string|null;customer_po:string|null}|null;
  /** The rep who owns the quote, to name in the modal's notes. */
  rep:Pick<Rep,'name'|'phone'|'email'>|null;
  /** What the customer answered on the latest revision (task 5.2), while the quote is accepted or changes are requested. */
  response:CustomerQuoteResponse|null;
}

/** Customer-safe: the customer's own answer to a sent revision (task 5.2). */
export type CustomerQuoteResponse=
  |{kind:'accepted';revision:number;
    /** The pickup or delivery time they chose (an ISO instant), and their PO. */
    fulfillment_time:string|null;customer_po:string|null}
  |{kind:'changes_requested';revision:number;note:string};

// Write inputs. Unit cost is never an input: the repository copies it from the item when a line is written.

export interface NewQuoteLine {
  itemId:string;qty:number;unitPrice?:number|null;priceBasis?:PriceBasis|null;suggestedPrice?:number|null;suggestedBasis?:PriceBasis|null;
  customerPrice?:number|null;explanation?:string|null;requestedText?:string|null;matchScore?:number|null;addedBy?:LineSource;
}

export interface NewQuote {
  customerId:string;contactId?:string|null;conversationId?:string|null;requestText?:string|null;
  fulfillment:Fulfillment;branchId:string;requestedDate?:string|null;
  /** Defaults to the customer's ship-to. */
  shipTo?:{address:string;lat:number|null;lng:number|null}|null;
  validDays?:ValidDays;customerNote?:string|null;duplicatedFrom?:string|null;
  lines:NewQuoteLine[];
  /** ISO timestamp; defaults to now. */
  requestedAt?:string;at?:string;
}

export type QuoteLinePatch=Partial<Pick<NewQuoteLine,'qty'|'unitPrice'|'priceBasis'|'suggestedPrice'|'suggestedBasis'|'customerPrice'|'explanation'>>;
export interface QuoteTermsPatch {validDays?:ValidDays;expiresOn?:string|null;customerPo?:string|null;customerNote?:string|null}
export interface QuoteFulfillmentPatch {fulfillment?:Fulfillment;branchId?:string;requestedDate?:string|null;shipTo?:{address:string;lat:number|null;lng:number|null}|null}

/**
 * Persists a status change decided by the quote state machine (task 1.5). The write only
 * happens if the quote is still in `from`, so two concurrent transitions can't both win.
 */
export interface QuoteTransition {
  from:QuoteStatus;to:QuoteStatus;at?:string;revision?:number;sentAt?:string|null;respondedAt?:string|null;validUntil?:string|null;
  fulfillmentTime?:string|null;customerPo?:string|null;changeRequestNote?:string|null;unreadForRep?:boolean;unreadForCustomer?:boolean;
}

/**
 * Free delivery pricing's frozen state on a draft (spec §4.4, §4.5): the rate with its ramp step
 * (all null: no recovery), the modelled delivery cost in cents, and each line's recovery in cents per unit.
 */
export interface QuoteRecoveryState {
  rateBp:number|null;rampStep:number|null;rampSteps:number|null;modelledCents:number|null;
  lines:{lineId:string;freightRecovery:number}[];
}

export interface NewQuoteRevision {revision:number;sentBy:string;message?:string|null;attachPdf?:boolean;total:number;snapshot:QuoteSnapshot;sentAt?:string}
