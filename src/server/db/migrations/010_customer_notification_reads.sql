-- 010_customer_notification_reads: which bell notifications each customer has read (plan U10;
-- new-ui-implementation-prompt Appendix C "customer_notifications ... Or derive from quote_activity and
-- order status with a per-customer read marker"). The notifications themselves are derived on read
-- (src/server/customer/notifications.ts), so this table holds only the read marks. A new table only,
-- so code that predates it ignores it (rollback = revert the PR).
-- notification_id: the derived notification's stable id (quote:<id>:rev:<n>, quote:<id>:expired,
-- order:<id>:shipped). read_at: when the customer read it.
CREATE TABLE customer_notification_reads(
  customer_id TEXT NOT NULL REFERENCES customers(id),
  notification_id TEXT NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY(customer_id,notification_id)
);
