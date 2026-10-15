import 'server-only';
import {all,run} from './sql';

// The customer's notification bell (plan U10; C_CVL4). Notifications are derived on read from what
// already happened: each quote's latest sent revision (with whether Dana asked for changes before it),
// and orders whose status is shipped. Only the read marks are stored (010_customer_notification_reads).
// Customer-safe: a revision's total is the price Dana was sent; no cost, no margin.

/** One quote's latest sent revision, with what the bell needs to word it and to know if Dana has seen it. */
export interface QuoteNewsRow {
  quote_id:string;quote_number:string;status:string;valid_until:string|null;responded_at:string|null;customer_viewed_at:string|null;
  revision:number;sent_at:string;total:number;rep_name:string;
  /** 1 when Dana asked for changes after the previous revision was sent and before this one. */
  after_changes:number;
}

/** Each of the customer's quotes that has been sent, at its latest sent revision. */
export function quoteNews(customerId:string){
  return all<QuoteNewsRow>(`SELECT q.id quote_id,q.quote_number,q.status,q.valid_until,q.responded_at,q.customer_viewed_at,
      r.revision,r.sent_at,r.total,rp.name rep_name,
      EXISTS(SELECT 1 FROM quote_activity a WHERE a.quote_id=q.id AND a.kind='changes_requested' AND a.at<r.sent_at
        AND a.at>COALESCE((SELECT p.sent_at FROM quote_revisions p WHERE p.quote_id=q.id AND p.revision=r.revision-1),'')) after_changes
    FROM quotes q
    JOIN quote_revisions r ON r.quote_id=q.id AND r.revision=(SELECT max(m.revision) FROM quote_revisions m WHERE m.quote_id=q.id)
    JOIN reps rp ON rp.id=r.sent_by
    WHERE q.customer_id=?`,customerId);
}

/** An order on its way: status shipped, with how and from where, and the quote it came from. */
export interface ShippedOrderRow {order_id:string;order_number:string;shipped_on:string;fulfillment:'will_call'|'delivery';branch_code:string;quote_number:string|null}

/** The customer's orders whose status is shipped. */
export function shippedOrders(customerId:string){
  return all<ShippedOrderRow>(`SELECT o.id order_id,o.order_number,o.shipped_on,o.fulfillment,b.code branch_code,q.quote_number
    FROM orders o JOIN branches b ON b.id=o.branch_id LEFT JOIN quotes q ON q.id=o.quote_id
    WHERE o.customer_id=? AND o.status='shipped' AND o.shipped_on IS NOT NULL`,customerId);
}

/** The notification ids this customer has read. */
export function notificationReads(customerId:string){
  return all<{notification_id:string}>('SELECT notification_id FROM customer_notification_reads WHERE customer_id=? ORDER BY notification_id',customerId).map(r=>r.notification_id);
}

/** Marks these notifications read for the customer (one already read keeps its first read time); returns every id the customer has read. */
export function saveNotificationReads(customerId:string,ids:readonly string[],at:string){
  for(const id of ids)run('INSERT OR IGNORE INTO customer_notification_reads(customer_id,notification_id,read_at) VALUES(?,?,?)',customerId,id,at);
  return notificationReads(customerId);
}
