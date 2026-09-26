// Customer chat: conversations and their messages.
import type {Fulfillment} from './orders';

export type MessageRole='customer'|'assistant'|'system';

/** A catalog item as chat names it while matching a request: identity only, no stock or prices. */
export interface ItemCandidate {sku:string;description:string;pack:string;category_name:string;score:number}

/** One matched line of a quote request. requested_text is what the customer said for it. */
export interface CartLine {sku:string;qty:number;requested_text?:string}

/** Payload of an `item_popup` message: what the item pop-up opens with (spec §3). No prices. */
export interface ItemPopupPayload {fulfillment:Fulfillment;branch_id:string;lines:CartLine[]}

/**
 * Payload of a `clarify` message: Querent asked `question` about one line it could not match
 * with confidence. `cart` holds the lines matched so far and the pickup/delivery choice; the item
 * pop-up opens with it once `line` resolves. After 2 rounds the reply also lists the candidates
 * and the rep's contact details (spec §3).
 */
export interface ClarifyPayload {question:string;round:number;line:{requested_text:string;qty:number;candidates:ItemCandidate[]};cart:ItemPopupPayload}

/** What a chat reply's `kind` can be. The quote flow adds more (quote_requested, quote_ready, ...). */
export type ChatReplyKind='text'|'clarify'|'item_popup';

export interface Conversation {id:string;customer_id:string;contact_id:string|null;started_at:string}

/** kind: text, item_popup, quote_requested, quote_ready, ...; payload is kind-specific JSON (null for text). */
export interface ChatMessage {id:string;conversation_id:string;role:MessageRole;kind:string;content:string;payload:unknown;created_at:string}
