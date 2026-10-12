-- 012_org_margin_floors: one organization margin floor per product category (plan U8; new-ui-implementation-prompt
-- Appendix C "org_margin_floors"), the hard stop reps cannot go below; managers set them on Settings > Margin
-- floors. A new table only, so code that predates it ignores it (rollback = revert the PR).
-- floor: a fraction, at least 0 and under 1, like rep_category_floors.margin_floor.
CREATE TABLE org_margin_floors(
  category_id TEXT PRIMARY KEY REFERENCES product_categories(id),
  floor REAL NOT NULL CHECK(floor>=0 AND floor<1)
);
-- An existing database starts each category at the lowest floor any rep has in it, so no rep's own margin
-- starts under the organization floor. A category no rep has a floor in gets no row (read as 0).
INSERT INTO org_margin_floors(category_id,floor)
  SELECT category_id,min(margin_floor) FROM rep_category_floors GROUP BY category_id ORDER BY category_id;
