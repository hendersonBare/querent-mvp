-- 005_quote_touch: the touch and view clocks behind "why quotes went untouched" (v3 spec §1.2 "003" row, §3, §7.3; decision 25; A2).
-- Added columns only, so code that predates them ignores them (rollback = revert the PR). ISO-8601 UTC, NULL = never.
-- last_rep_touch_at: the owning rep last opened the quote detail or edited the quote. Not stamped on updated_at.
ALTER TABLE quotes ADD COLUMN last_rep_touch_at TEXT;
-- customer_viewed_at: the customer last opened the PDF preview of a sent revision.
ALTER TABLE quotes ADD COLUMN customer_viewed_at TEXT;
