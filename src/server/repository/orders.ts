import 'server-only';
import type {CoPurchase,CustomerOrder,ItemSale,Order,OrderLine,OrderListRow,OrderSummary,PurchasedItem,PurchaseLine} from '@/domain';
import {all,one} from './sql';

// Orders and order history. None of these functions returns unit_cost. Most are scoped to one
// customer: they back the get_order_history / get_order_status tools. The rep portal's Orders and
// Items views (task 3.8) cover every customer: allOrders, findOrder and itemSales.

const ORDER_COLUMNS=`o.id,o.order_number,o.po_number,o.order_date,o.status,o.fulfillment,o.branch_id,b.code branch_code,o.shipped_on,o.tracking_number,
  o.subtotal,o.freight,o.tax,o.total,q.quote_number`;
const ORDER_FROM=' FROM orders o JOIN branches b ON b.id=o.branch_id LEFT JOIN quotes q ON q.id=o.quote_id';
const ORDER=`SELECT ${ORDER_COLUMNS}${ORDER_FROM}`;
/** ORDER plus whose order it is (the rep portal's views cover every customer). */
const CUSTOMER_COLUMNS=`${ORDER_COLUMNS},o.customer_id,cu.name customer_name,cu.account_number`;
const CUSTOMER_FROM=`${ORDER_FROM} JOIN customers cu ON cu.id=o.customer_id`;
const NEWEST=' ORDER BY o.order_date DESC,o.order_number DESC';

/** The customer's orders, newest first. */
export function orders(customerId:string,{limit=100}:{limit?:number}={}){return all<OrderSummary>(`${ORDER} WHERE o.customer_id=?${NEWEST} LIMIT ?`,customerId,limit);}

const orderLines=(orderId:string)=>all<OrderLine>('SELECT l.line_no,l.item_id,i.sku,i.description,i.pack,l.qty,l.unit_price FROM order_lines l JOIN items i ON i.id=l.item_id WHERE l.order_id=? ORDER BY l.line_no',orderId);

/** One of the customer's orders, by id or order number, with its lines. */
export function order(customerId:string,orderIdOrNumber:string):Order|undefined{
  const header=one<OrderSummary>(`${ORDER} WHERE o.customer_id=? AND (o.id=? OR upper(o.order_number)=upper(?))`,customerId,orderIdOrNumber,orderIdOrNumber);
  return header&&{...header,lines:orderLines(header.id)};
}

// ---- Rep portal: every customer (task 3.8) ----

/** Internal: every customer's orders (or one customer's), newest first, with the customer and line count: the rep's Orders list. */
export function allOrders({customerId=null,limit=500}:{customerId?:string|null;limit?:number}={}){
  return all<OrderListRow>(`SELECT ${CUSTOMER_COLUMNS},(SELECT count(*) FROM order_lines l WHERE l.order_id=o.id) line_count${CUSTOMER_FROM}
    WHERE (@customerId IS NULL OR o.customer_id=@customerId)${NEWEST} LIMIT @limit`,{customerId,limit});
}

/** Internal: one order by id or order number, whoever the customer, with its lines: the rep's order detail. */
export function findOrder(orderIdOrNumber:string):CustomerOrder|undefined{
  const header=one<Omit<CustomerOrder,'lines'>>(`SELECT ${CUSTOMER_COLUMNS}${CUSTOMER_FROM} WHERE o.id=? OR upper(o.order_number)=upper(?)`,orderIdOrNumber,orderIdOrNumber);
  return header&&{...header,lines:orderLines(header.id)};
}

/** Internal: the order lines for one item, newest first, optionally one customer's: an item's recent sales. */
export function itemSales(itemId:string,{customerId=null,limit=20}:{customerId?:string|null;limit?:number}={}){
  return all<ItemSale>(`SELECT o.id order_id,o.order_number,o.order_date,o.customer_id,cu.name customer_name,l.qty,l.unit_price
    FROM order_lines l JOIN orders o ON o.id=l.order_id JOIN customers cu ON cu.id=o.customer_id
    WHERE l.item_id=@itemId AND (@customerId IS NULL OR o.customer_id=@customerId)${NEWEST},l.line_no LIMIT @limit`,{itemId,customerId,limit});
}

/** Order status by order number or PO number (ignoring case), or the latest order when no reference is given. */
export function orderStatus(customerId:string,reference?:string){
  const ref=reference?.trim();
  if(!ref)return one<OrderSummary>(`${ORDER} WHERE o.customer_id=?${NEWEST} LIMIT 1`,customerId);
  return one<OrderSummary>(`${ORDER} WHERE o.customer_id=? AND (upper(o.order_number)=upper(?) OR upper(o.po_number)=upper(?))${NEWEST} LIMIT 1`,customerId,ref,ref);
}

interface HistoryFilter {itemIds?:readonly string[];since?:string;limit?:number}

/** Purchased lines, newest first, optionally for some items and since a day (YYYY-MM-DD). */
export function orderHistory(customerId:string,{itemIds,since='0000-01-01',limit=200}:HistoryFilter={}){
  return all<PurchaseLine>(`SELECT o.order_number,o.order_date,o.po_number,l.item_id,i.sku,i.description,i.pack,l.qty,l.unit_price
    FROM order_lines l JOIN orders o ON o.id=l.order_id JOIN items i ON i.id=l.item_id
    WHERE o.customer_id=? AND o.order_date>=? AND (? IS NULL OR l.item_id IN (SELECT value FROM json_each(?)))
    ${NEWEST},l.line_no LIMIT ?`,customerId,since,itemIds?1:null,JSON.stringify(itemIds??[]),limit);
}

/** Orders dated since..until (YYYY-MM-DD, both inclusive). Both are optional: the default is all history. */
interface DateWindow {since?:string;until?:string}

/** What the customer buys, most often first: resolves "the usual" (task 1.4). last_* is the latest order in the window. */
export function purchasedItems(customerId:string,{since='0000-01-01',until='9999-12-31'}:DateWindow={}){
  return all<PurchasedItem>(`SELECT item_id,sku,description,pack,count(DISTINCT order_id) order_count,sum(qty) total_qty,max(order_date) last_order_date,
      max(CASE WHEN n=1 THEN qty END) last_qty,max(CASE WHEN n=1 THEN unit_price END) last_unit_price
    FROM (SELECT l.item_id,i.sku,i.description,i.pack,l.order_id,l.qty,l.unit_price,o.order_date,
        row_number() OVER (PARTITION BY l.item_id ORDER BY o.order_date DESC,o.order_number DESC,l.line_no) n
      FROM order_lines l JOIN orders o ON o.id=l.order_id JOIN items i ON i.id=l.item_id WHERE o.customer_id=? AND o.order_date>=? AND o.order_date<=?)
    GROUP BY item_id ORDER BY order_count DESC,last_order_date DESC,sku`,customerId,since,until);
}

/** Internal: items bought on the same orders as `itemId`, most often first (frequently bought together, task 1.6). */
export function coPurchases(customerId:string,itemId:string,{since='0000-01-01',until='9999-12-31'}:DateWindow={}){
  return all<CoPurchase>(`SELECT other.item_id,i.sku,i.description,count(DISTINCT other.order_id) orders_together
    FROM order_lines mine JOIN orders o ON o.id=mine.order_id JOIN order_lines other ON other.order_id=mine.order_id AND other.item_id<>mine.item_id JOIN items i ON i.id=other.item_id
    WHERE o.customer_id=? AND mine.item_id=? AND o.order_date>=? AND o.order_date<=?
    GROUP BY other.item_id ORDER BY orders_together DESC,i.sku`,customerId,itemId,since,until);
}
