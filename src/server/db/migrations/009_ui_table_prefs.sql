-- 009_ui_table_prefs: each user's column order and hidden columns per table in the new UI (plan U0;
-- new-ui-implementation-prompt Appendix C "ui_table_prefs"). A new table only, so code that predates it
-- ignores it (rollback = revert the PR).
-- user_id: the signed-in user (in the demo, the rep id of the supplier persona). table_id: the table's
-- stable id in the UI ('quotes', 'customers', ...). column_order and hidden_columns: JSON arrays of
-- column ids. A user with no row sees the table's default columns.
CREATE TABLE ui_table_prefs(
  user_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  column_order TEXT NOT NULL CHECK(json_valid(column_order) AND json_type(column_order)='array'),
  hidden_columns TEXT NOT NULL CHECK(json_valid(hidden_columns) AND json_type(hidden_columns)='array'),
  PRIMARY KEY(user_id,table_id)
);
