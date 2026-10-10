-- 003_suggestion_lines: lines the customer adds from the item pop-up's "Frequently bought together"
-- (decision 37; spec §1.2 "008" row, §10; task E1). SQLite can't alter a CHECK, so quote_lines and
-- quote_removed_lines are rebuilt (12-step recipe) with added_by IN (..., 'suggestion'). Every
-- current column is copied by name, in its current order (C1's freight_recovery included); the
-- tables have no indexes beyond their UNIQUE and PRIMARY KEY constraints, which the new definitions
-- carry, and nothing references them by foreign key. The runner runs foreign_key_check afterwards.
CREATE TABLE quote_lines_new(id TEXT PRIMARY KEY,quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,line_no INTEGER NOT NULL,item_id TEXT NOT NULL REFERENCES items(id),qty INTEGER NOT NULL CHECK(qty>=0),unit_price REAL,price_basis TEXT CHECK(price_basis IN ('contract','customer','list','last_paid','custom')),suggested_price REAL,suggested_basis TEXT CHECK(suggested_basis IN ('contract','customer','list','last_paid','custom')),customer_price REAL,unit_cost REAL NOT NULL,explanation TEXT,requested_text TEXT,match_score REAL,added_by TEXT NOT NULL DEFAULT 'querent' CHECK(added_by IN ('querent','rep','upsell','suggestion')),freight_recovery INTEGER NOT NULL DEFAULT 0,UNIQUE(quote_id,line_no));
INSERT INTO quote_lines_new(id,quote_id,line_no,item_id,qty,unit_price,price_basis,suggested_price,suggested_basis,customer_price,unit_cost,explanation,requested_text,match_score,added_by,freight_recovery)
  SELECT id,quote_id,line_no,item_id,qty,unit_price,price_basis,suggested_price,suggested_basis,customer_price,unit_cost,explanation,requested_text,match_score,added_by,freight_recovery FROM quote_lines;
DROP TABLE quote_lines;
ALTER TABLE quote_lines_new RENAME TO quote_lines;

CREATE TABLE quote_removed_lines_new(quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,line_no INTEGER NOT NULL,item_id TEXT NOT NULL REFERENCES items(id),requested_text TEXT,match_score REAL,added_by TEXT NOT NULL CHECK(added_by IN ('querent','rep','upsell','suggestion')),removed_at TEXT NOT NULL,PRIMARY KEY(quote_id,line_no));
INSERT INTO quote_removed_lines_new(quote_id,line_no,item_id,requested_text,match_score,added_by,removed_at)
  SELECT quote_id,line_no,item_id,requested_text,match_score,added_by,removed_at FROM quote_removed_lines;
DROP TABLE quote_removed_lines;
ALTER TABLE quote_removed_lines_new RENAME TO quote_removed_lines;
