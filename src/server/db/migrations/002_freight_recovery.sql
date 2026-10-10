-- 002_freight_recovery: free delivery pricing's recovery columns (spec §1.2 "004" row, §4.4, §4.5; C1).
-- Added columns only, so code that predates them ignores them (rollback = revert the PR).
-- quote_lines.freight_recovery: integer cents PER UNIT on top of unit_price (decision 32, OA-6); 0 = none.
ALTER TABLE quote_lines ADD COLUMN freight_recovery INTEGER NOT NULL DEFAULT 0;
-- The rate in force frozen at creation, in bp; NULL = the quote carries no recovery (and is not in the pool).
ALTER TABLE quotes ADD COLUMN freight_rate_bp INTEGER;
-- The ramp step frozen with the rate ("ramp step 2 of 3").
ALTER TABLE quotes ADD COLUMN freight_ramp_step INTEGER;
ALTER TABLE quotes ADD COLUMN freight_ramp_steps INTEGER;
-- The modelled delivery cost frozen at creation, in cents; NULL for will call or call-for-freight.
ALTER TABLE quotes ADD COLUMN modelled_freight_cents INTEGER;
