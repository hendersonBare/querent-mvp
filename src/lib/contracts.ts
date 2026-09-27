import type {ChatReplyKind,ClarifyPayload,Fulfillment,ItemPopupPayload,QuoteRequestedPayload,QuoteStatus} from '@/domain';
/** What Querent may answer in chat, toggled per customer in Settings (spec §2). */
export const categories = ['items_stock','pricing','orders_quotes','account'] as const;
export type Category = typeof categories[number];
export const labels: Record<Category,string> = {items_stock:'Items & stock',pricing:'Pricing',orders_quotes:'Orders & quotes',account:'Account'};
/** Supplier personas are a rep (rep_id); customer personas are a contact at a customer. */
export interface Principal {user_id:string;role:'supplier_admin'|'customer_user';customer_id:string|null;name:string;user_name:string;rep_id:string|null;contact_id:string|null}
export interface AccessRule {category:Category;enabled:boolean|null;rep_id:string|null;mixed_rep:boolean;rep_name:string;phone:string|null;email:string|null}
export interface Rep {id:string;name:string;phone:string;email:string;initials?:string;title?:string}
export interface Customer {id:string;name:string;account_number?:string}
export interface Analytics {total_queries:number;minutes_saved:number;hours_saved:string;categories:{category:Category;count:number;rep_name:string}[]}
export interface ERPStatus {last_updated:string|null;events:{id:number;timestamp:string;message:string}[]}
/**
 * One chat reply. kind 'clarify' carries a ClarifyPayload (Querent's question about a vague line),
 * 'item_popup' an ItemPopupPayload (the cart the item pop-up opens with) and 'quote_requested' a
 * QuoteRequestedPayload (the quote Request quote created); plain text has no payload.
 */
export interface ChatAnswer {answer:string;categories:Category[];outcome:'answered'|'no_rows'|'error'|'restricted';row_count:number;kind?:ChatReplyKind;payload?:ClarifyPayload|ItemPopupPayload|QuoteRequestedPayload|null}
export interface ChatTurn extends ChatAnswer {id:string;question:string;timestamp?:string}

/**
 * GET customer/item-popup?skus=...: what the item pop-up reads when it renders (spec §3, task 2.3).
 * Stock per branch is read now, not stored in the pop-up's payload; it is null for every item when
 * the customer has Items & stock turned off (stock_shown false). No prices, ever.
 */
export interface ItemPopupContext {
  items:{sku:string;description:string;pack:string;stock:{branch_id:string;available:number}[]|null}[];
  branches:{id:string;code:string;name:string}[];
  stock_shown:boolean;
  /** The delivery address on file (one line), or null: delivery needs one. */
  ship_to:string|null;
  /** The assigned rep, who prices the quote. */
  rep_name:string|null;
}

/** POST customer/quote-requests: the item pop-up's Request quote. Only these fields are accepted: prices are the rep's. */
export interface QuoteRequestInput {conversation_id:string;fulfillment:Fulfillment;branch_id:string;lines:{sku:string;qty:number}[]}

/**
 * The answer to Request quote: the new quote (ready_for_review), and the chat turn that confirms it
 * ("Sent to Brandi for review."). `replayed` is true when this pop-up had already made the quote.
 */
export interface QuoteRequestResult {quote:{id:string;quote_number:string;status:QuoteStatus};turn:ChatTurn;replayed:boolean}
export interface API {get<T>(path:string):Promise<T>;send<T>(path:string,method:'POST'|'PUT',body:unknown):Promise<T>}
export interface Persona {id:'supplier'|'customer';label:string;description:string}
