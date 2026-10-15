// The customer's notification bell (plan U10; decision 41; C_CVL4). Notifications are derived on read
// from quote activity and order status; only which ones a customer has read is stored. Customer-safe:
// no cost or margin.

/** What happened: a quote was sent (ready), sent again after Dana asked for changes (updated), expired, or an order shipped. */
export type CustomerNotificationKind='quote_ready'|'quote_updated'|'quote_expired'|'order_shipped';

export interface CustomerNotification {
  /** Stable per event: quote:<id>:rev:<n>, quote:<id>:expired, order:<id>:shipped. */
  id:string;
  kind:CustomerNotificationKind;
  title:string;
  body:string;
  /** When it happened (ISO). */
  at:string;
  /** `at` is a day only (an order's ship date), so it reads as a day, not a time. */
  day_only:boolean;
  read:boolean;
  /** The quote a quote notification opens; null for an order. */
  quote:{id:string;quote_number:string}|null;
}

/** GET /api/query/customer/notifications: the newest notifications and how many of them are unread. */
export interface CustomerNotifications {unread:number;items:CustomerNotification[]}
