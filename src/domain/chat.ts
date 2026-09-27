// Customer chat: conversations and their messages.
import type {Rep} from './accounts';
import type {Fulfillment} from './orders';
import type {QuoteStatus} from './quotes';

export type MessageRole='customer'|'assistant'|'system';

/** A catalog item as chat names it while matching a request: identity only, no stock or prices. */
export interface ItemCandidate {sku:string;description:string;pack:string;category_name:string}

/** One matched line of a quote request. requested_text is what the customer said for it. */
export interface CartLine {sku:string;qty:number;requested_text?:string}

/** Payload of an `item_popup` message: what the item pop-up opens with (spec §3). No prices. */
export interface ItemPopupPayload {fulfillment:Fulfillment;branch_id:string;lines:CartLine[]}

/**
 * One requested line Querent could not match to a single SKU with confidence (spec §3, task 2.2).
 * `round` counts the tries without a confident match: 1 when Querent first asks `question`, one
 * more for each reply that settles no line. From round 2 `choices` holds the top 3 candidates,
 * shown as buttons; before that it is empty.
 */
export interface ClarifyLine {
  requested_text:string;qty:number;question:string;round:number;
  /** The shortlist, best first: identity only, never stock, prices or cost. */
  candidates:ItemCandidate[];
  /** The candidate buttons: the top 3 candidates from round 2, else none. */
  choices:ItemCandidate[];
  /** What the matcher scores for the line: the customer's words without the qty, plus any answer that narrowed it. */
  text:string;
}

/** The assigned rep, as a clarifying reply shows them from round 2. */
export type ClarifyRep=Pick<Rep,'name'|'initials'|'title'|'phone'|'email'>;

/**
 * Payload of a `clarify` message: the state of a quote request, line by line. `open` lines still
 * need an answer; `cart` holds the matched lines and the pickup/delivery choice, and the item pop-up
 * opens with it once nothing is open. The customer may drop a line they can't settle. `rep` is the
 * assigned rep's contact, set once any open line reaches round 2.
 */
export interface ClarifyPayload {open:ClarifyLine[];cart:ItemPopupPayload;dropped:{requested_text:string;qty:number}[];rep:ClarifyRep|null}

/**
 * Payload of a `quote_requested` message: the quote the item pop-up's Request quote created (spec §3,
 * task 2.3). Customer-safe: no prices. `popup_message_id` is the item_popup message it came from;
 * one pop-up makes at most one quote.
 */
export interface QuoteRequestedPayload {quote_id:string;quote_number:string;status:QuoteStatus;popup_message_id:string}

/** The kind of the message Approve & send posts in the customer's chat (spec §3, task 3.7). */
export const QUOTE_READY_KIND='quote_ready';

/**
 * Payload of a `quote_ready` message: the rep sent a revision of a quote (spec §3, task 3.7). The
 * message is a notice (role `system`), not a chat reply: its `content` is the rep's own message
 * from the send dialog, plain text (render it as text, never as Markdown or HTML), and may be
 * empty. The chat shows `headline` with a "View quote" link that opens the PDF preview modal (the
 * open-quote event, task 2.4) on `revision`. Customer-safe: what the customer was sent, never
 * cost, margin or internal notes.
 */
export interface QuoteReadyPayload {
  quote_id:string;quote_number:string;
  /** The revision sent (1, 2, …). */
  revision:number;
  /** The revision's total before tax, in dollars, as frozen in its snapshot. */
  total:number;
  /** The last day the quote can be accepted (YYYY-MM-DD). */
  valid_until:string;
  /** "Quote Q-24817 is ready: $1,122.40, valid until Oct 7" (spec §3); the chat adds " — View quote". */
  headline:string;
  /** The rep left Attach PDF on: the preview modal offers Download (spec §3). */
  attach_pdf:boolean;
  /** The sent revision's customer PDF (GET /api/quotes/<id>/pdf?variant=customer&rev=<n>), which the modal shows inline. */
  pdf_url:string;
}

/**
 * Customer-safe: one `quote_ready` message as the customer's chat shows it (task 5.1): the
 * payload's fields, rebuilt one by one, plus where and when it was posted and the rep's text.
 */
export interface QuoteNotice extends QuoteReadyPayload {
  /** The message id. */
  id:string;conversation_id:string;created_at:string;
  /** The rep's message from the send dialog: plain text, possibly empty. Render it as text, never as Markdown or HTML. */
  text:string;
}

/** What a chat reply's `kind` can be. The quote flow adds more (quote_ready is a notice, not a reply). */
export type ChatReplyKind='text'|'clarify'|'item_popup'|'quote_requested';

export interface Conversation {id:string;customer_id:string;contact_id:string|null;started_at:string}

/** kind: text, item_popup, quote_requested, quote_ready, ...; payload is kind-specific JSON (null for text). */
export interface ChatMessage {id:string;conversation_id:string;role:MessageRole;kind:string;content:string;payload:unknown;created_at:string}
