-- 008_fuel_prices: the stored fuel price per state and fuel (v3 spec §1.2 "fuel_prices" row, §4.3; decision 30; C3).
-- A new table only, so code that predates it ignores it (rollback = revert the PR).
-- price_cents: cents per gallon. as_of: when the price was true (OilPriceAPI's as_of, or the seed date).
-- source: 'api' (OilPriceAPI) or 'seed' (the demo's UT gasoline). A manual price lives in settings
-- (freight_fuel_manual_cents) and always wins. fetched_on: the UTC day of the last fetch attempt, so
-- each state is fetched at most once a day, even when the fetch fails.
CREATE TABLE fuel_prices(
  state TEXT NOT NULL,
  fuel TEXT NOT NULL CHECK(fuel IN ('gasoline','diesel')),
  price_cents INTEGER NOT NULL CHECK(price_cents>=0),
  as_of TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('api','seed')),
  fetched_on TEXT NOT NULL,
  PRIMARY KEY(state,fuel)
);
