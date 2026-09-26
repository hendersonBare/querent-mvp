// Orders are the source of "last paid" and of won-quote history. None of these types carry cost.

export const FULFILLMENTS=['will_call','delivery'] as const;
export type Fulfillment=typeof FULFILLMENTS[number];
export type OrderStatus='open'|'shipped'|'closed';

/** One order as the get_order_status tool and the Orders list show it. */
export interface OrderSummary {id:string;order_number:string;po_number:string|null;order_date:string;status:OrderStatus;fulfillment:Fulfillment;branch_id:string;branch_code:string;shipped_on:string|null;tracking_number:string|null;subtotal:number;freight:number;tax:number;total:number;quote_number:string|null}

export interface OrderLine {line_no:number;item_id:string;sku:string;description:string;pack:string;qty:number;unit_price:number}

export interface Order extends OrderSummary {lines:OrderLine[]}

/** One purchased line with its order (the get_order_history tool). */
export interface PurchaseLine {order_number:string;order_date:string;po_number:string|null;item_id:string;sku:string;description:string;pack:string;qty:number;unit_price:number}

/** What the customer buys and how often: resolves "the usual" (task 1.4). */
export interface PurchasedItem {item_id:string;sku:string;description:string;pack:string;order_count:number;total_qty:number;last_order_date:string;last_qty:number;last_unit_price:number}

/** An item bought on the same orders as another (frequently bought together, task 1.6). */
export interface CoPurchase {item_id:string;sku:string;description:string;orders_together:number}
