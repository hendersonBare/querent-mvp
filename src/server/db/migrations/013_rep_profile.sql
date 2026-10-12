-- 013_rep_profile: a rep's Settings > Profile and Notifications (plan U9; new-ui-implementation-prompt Appendix C
-- "rep profile" and "rep_notification_prefs"). New columns and a new table only, so code that predates them
-- ignores them (rollback = revert the PR).
-- The picture lives on the rep record beside the name, phone and email that are already there: the image bytes,
-- their type (PNG, JPEG or WebP only: never SVG, which can carry script) and when it last changed (the link's
-- version). Only explicit column lists read reps, so the picture never rides along with a rep.
ALTER TABLE reps ADD COLUMN picture BLOB;
ALTER TABLE reps ADD COLUMN picture_type TEXT CHECK(picture_type IS NULL OR picture_type IN ('image/png','image/jpeg','image/webp'));
ALTER TABLE reps ADD COLUMN picture_updated_at TEXT;
-- One in-app choice per rep per event; no row means on. No email column (Appendix C).
CREATE TABLE rep_notification_prefs(
  rep_id TEXT NOT NULL REFERENCES reps(id),
  event_key TEXT NOT NULL CHECK(event_key IN ('quote_overdue','quote_aging','below_margin_floor','change_requested','quote_accepted','quote_declined','quote_expired','customer_chat_needs_rep')),
  in_app INTEGER NOT NULL CHECK(in_app IN (0,1)),
  PRIMARY KEY(rep_id,event_key)
);
