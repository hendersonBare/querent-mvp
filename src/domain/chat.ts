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

/** What a chat reply's `kind` can be. The quote flow adds more (quote_ready, ...). */
export type ChatReplyKind='text'|'clarify'|'item_popup'|'quote_requested';

export interface Conversation {id:string;customer_id:string;contact_id:string|null;started_at:string}

/** kind: text, item_popup, quote_requested, quote_ready, ...; payload is kind-specific JSON (null for text). */
export interface ChatMessage {id:string;conversation_id:string;role:MessageRole;kind:string;content:string;payload:unknown;created_at:string}
