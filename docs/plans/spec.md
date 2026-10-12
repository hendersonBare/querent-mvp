# Querent v3 spec

Derived from `docs/plans/decision-log.md` (final). Where this spec and the decision log disagree, the decision log wins. Choices the log does not settle are listed in `docs/plans/open-assumptions.md` (referenced here as **OA-n**). Task slices and their order are in `docs/plans/plan.md`.

Conventions used below:
- Money: new money math is integer cents through the shared helper `src/lib/money.ts` (T1): `toCents(dollars)` converts dollars to integer cents (float-noise safe, 1.005 → 101), `roundCents(x)` rounds a fractional cent amount to integer cents (half away from zero), `fromCents(c)` gives dollars. Every `roundCents(...)` below takes cents. Existing REAL dollar columns stay REAL; new money columns are `INTEGER` cents with a `_cents` suffix, except `quote_lines.freight_recovery` (name fixed by the log, integer cents per unit, OA-6).
- Rates: integer basis points (`_bp`, 1 bp = 0.01%), so 5.0% = 500 bp.
- Times: ISO-8601 UTC strings in the database (`nowIso()`). The browser formats and buckets them in its own time zone.

---

## 1. Data model and migrations

### 1.1 Migration system (T1)

- Files: `src/server/db/migrations/NNN_<slug>.sql`, three-digit numbers, applied in numeric order.
- Table: `schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`, where `id` is the file stem (`001_baseline`).
- Runner: `src/server/db/migrate.ts`, `migrate(database)`. On every `db()` open it reads the directory (path resolved from `process.cwd()` with `/* turbopackIgnore: true */`, like `databasePath()`), and applies every file whose id is not in `schema_migrations`, in numeric order (a set difference, not "greater than the max", so two lanes that merge out of order still both apply). Each file runs in its own `IMMEDIATE` transaction together with its `schema_migrations` insert. The runner turns `foreign_keys` OFF around the whole run (the pragma cannot change inside a transaction), runs `PRAGMA foreign_key_check` after each file and rolls that file back if it reports rows, then turns `foreign_keys` back ON.
- Adoption: a database that has tables, has `meta.schema_version = 4`, and has no `schema_migrations` table is adopted: the runner creates `schema_migrations` and records `001_baseline` as applied without running it, then applies 002 and later. A database with any other `schema_version` and no `schema_migrations` refuses to open with the existing "incompatible … Run npm run db:reset." message.
- `001_baseline.sql` is the current v4 DDL, expanded to literal SQL (the status, fulfillment, price-basis and category lists written out). A Vitest test proves that a database built from `001` has exactly the same `sqlite_master` (tables, columns, CHECKs, indexes) as one built from the pre-T1 `applySchema()`, captured once as a fixture string.
- `SCHEMA_VERSION` goes away. `meta` stays for `seed_anchor`. `repository/erp.ts` reports the latest applied migration id instead of the schema version.
- Seeding: a new, empty database is migrated, then seeded (unchanged). `reseedDatabase()` and `npm run db:reset` drop everything, run every migration, then seed. `db:reset` loads `.env.local` (T1) using Node's `process.loadEnvFile` when the file exists; shell variables still win.
- No down migrations. Rollback = restore the volume backup taken before deploy (README deploy step).

### 1.2 Planned migrations

Numbers below are the expected order. Each slice takes the next free number on `main` when its PR opens and renumbers on rebase, so ids stay contiguous and a table rebuild always runs after every column it must copy (plan.md, "Rules for every task"):

| File | Slice | Change |
|---|---|---|
| `001_baseline.sql` | T1 | v4 schema as-is |
| `002_declined.sql` | A1 | Rebuild `quotes`: status CHECK adds `declined`; add `declined_at TEXT`, `decline_reason TEXT CHECK(decline_reason IN ('price_too_high','found_other_source','need_sooner','wrong_items','other'))`, `decline_note TEXT CHECK(decline_note IS NULL OR length(decline_note)<=250)` |
| `003_quote_touch.sql` | A2 | `quotes.last_rep_touch_at TEXT`, `quotes.customer_viewed_at TEXT` |
| `004_freight_recovery.sql` | C1 | `quote_lines.freight_recovery INTEGER NOT NULL DEFAULT 0` (cents per unit); `quotes.freight_rate_bp INTEGER` (rate in force frozen at creation, NULL = quote carries no recovery); `quotes.freight_ramp_step INTEGER`, `quotes.freight_ramp_steps INTEGER`; `quotes.modelled_freight_cents INTEGER` (modelled delivery cost frozen at creation, NULL for will call) |
| `005_fuel_prices.sql` | C3 | `fuel_prices(state TEXT NOT NULL, fuel TEXT NOT NULL CHECK(fuel IN ('gasoline','diesel')), price_cents INTEGER NOT NULL CHECK(price_cents>=0), as_of TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('api','seed')), fetched_on TEXT NOT NULL, PRIMARY KEY(state,fuel))` |
| `006_roles.sql` | D1 | `reps.role TEXT NOT NULL DEFAULT 'rep' CHECK(role IN ('rep','manager'))`, `reps.team TEXT`, `reps.active INTEGER NOT NULL DEFAULT 1`; sets `brandi` to `manager` |
| `007_original_rep.sql` | D2 | `quotes.original_rep_id TEXT REFERENCES reps(id)`, backfilled from `rep_id` |
| `008_suggestion_lines.sql` | E1 | Rebuild `quote_lines` and `quote_removed_lines`: `added_by` CHECK adds `'suggestion'` |
| `009_ui_table_prefs.sql` | U0 | `ui_table_prefs(user_id TEXT NOT NULL, table_id TEXT NOT NULL, column_order TEXT NOT NULL, hidden_columns TEXT NOT NULL, PRIMARY KEY(user_id,table_id))`; both lists are JSON arrays of column ids (CHECKed) |
| `010_customer_notification_reads.sql` | U10 | `customer_notification_reads(customer_id TEXT NOT NULL REFERENCES customers(id), notification_id TEXT NOT NULL, read_at TEXT NOT NULL, PRIMARY KEY(customer_id,notification_id))`: the bell's read marks; the notifications themselves are derived on read |
| `011_teams.sql` | U7 | `teams(id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE` (1 to 40 characters after trimming), `parent_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL` (never itself)`)` and `team_members(rep_id TEXT PRIMARY KEY REFERENCES reps(id), team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE)`; backfilled from `reps.team` (one team per label, trimmed and case-insensitive). `reps.team` stays for old code and is no longer read |
| `013_rep_profile.sql` | U9 | `reps.picture BLOB`, `reps.picture_type TEXT` (CHECK `image/png`, `image/jpeg`, `image/webp`), `reps.picture_updated_at TEXT`; `rep_notification_prefs(rep_id TEXT NOT NULL REFERENCES reps(id), event_key TEXT NOT NULL` (CHECK the eight Appendix C keys)`, in_app INTEGER NOT NULL CHECK(in_app IN (0,1)), PRIMARY KEY(rep_id,event_key))`; no row means on |

Rebuild migrations (002, 008) follow SQLite's 12-step recipe: create `<t>_new` with the new definition, `INSERT INTO <t>_new SELECT …` with explicit columns, `DROP TABLE <t>`, `ALTER TABLE <t>_new RENAME TO <t>`, recreate the table's indexes, and rely on the runner's `foreign_key_check`. Each has a Vitest test that builds a database at the previous migration, inserts rows that reference the rebuilt table (`quote_lines`, `quote_revisions`, `quote_activity`, `orders.quote_id`, `quotes.duplicated_from`), migrates, and asserts row counts, values and that foreign keys still resolve.

### 1.3 Settings keys (all in `settings`, defaults in code)

Read through typed repository getters that fall back to the code default when the key is absent. Code defaults live next to the logic that uses them.

| Key | Default | Slice | Editable by |
|---|---|---|---|
| `aging_rfr_amber_h`, `aging_rfr_red_h` | 4, 24 | A2 | manager (D1) |
| `aging_cr_amber_h`, `aging_cr_red_h` | 4, 24 | A2 | manager (D1) |
| `aging_sent_amber_h`, `aging_sent_red_h` | 72, 168 | A2 | manager (D1) |
| `free_delivery_pricing` | `false` | C3 | manager |
| `free_delivery_enabled_at` | unset | C3 | set on enable |
| `free_delivery_preview_viewed_at` | unset | C3 | set by viewing the preview |
| `freight_vehicle_mpg` | 10 | C1 | manager (C3 UI) |
| `freight_fuel_type` | `gasoline` | C1 | manager |
| `freight_wear_cents_per_mile` | 20 | C1 | manager |
| `freight_depreciation_cents_per_mile` | 15 | C1 | manager |
| `freight_driver_cents_per_hour` | 2500 | C1 | manager |
| `freight_avg_speed_mph` | 35 | C1 | manager |
| `freight_stop_minutes` | 0 | C1 | manager |
| `freight_fuel_manual_cents` | unset | C1 | manager (override, always wins) |
| `freight_starting_rate_bp` | 300 | C1 | manager |
| `freight_rate_cap_bp` | 800 | C1 | manager |
| `freight_line_cap_bp` | 800 | C1 | manager |
| `freight_ramp_steps`, `freight_ramp_days` | 3, 90 | C1 | manager |
| `freight_pool_rate_bp`, `freight_pool_on`, `freight_pool_count` | computed | C1 | cache, recomputed once per UTC day |

The cost-model defaults are placeholders for the demo (OA-4).

---

## 2. Status model and transitions

Stored statuses: `ready_for_review | sent | accepted | changes_requested | expired | declined`. `declined` is the only new one.

```
ready_for_review  --send (rep)-------------> sent (rev n)
changes_requested --send (rep)-------------> sent (rev n+1)
sent              --accept (customer)------> accepted          (final)
sent              --request_changes--------> changes_requested
sent              --decline (customer)-----> declined          (final, new)
sent              --expire (system)--------> expired           (final)
```

- `lifecycle.ts`: `QUOTE_EVENTS` adds `decline`; `TRANSITIONS.decline = {from:['sent'], to:'declined', actor:'customer'}`; `STATUS_LABELS.declined = 'Declined'`. `effectiveStatus` is unchanged (only `sent` can read as expired). `customerCanRespond` stays "effective status is sent", so Decline is available exactly when Accept is.
- Win/loss helpers: `quoteOutcome` treats `declined` as `lost`. The Team metrics (section 7) keep declined and expired apart.
- Final statuses (`accepted`, `expired`, `declined`) allow only Duplicate and a manager's reassignment (decision 21).
- Expiry is unchanged (decision 17): the rep picks 7, 14 or 30 days or a custom date; the default is 14 days after the send day.

### 2.1 Decline

- Reasons (code → label): `price_too_high` "Price too high", `found_other_source` "Found other source", `need_sooner` "Need it sooner than quoted", `wrong_items` "Wrong items or quantity", `other` "Other". There is no "no response" option.
- "Other" shows a plain-text field, max 250 characters (trimmed; control characters stripped). The note is stored only when the reason is `other`.
- The dialog's confirm button reads **Decline** and records the decline with or without a reason. Cancel or the X closes with no change.
- On decline, in one transaction: `status='declined'`, `declined_at=responded_at=now`, `decline_reason`, `decline_note`, `unread_for_rep=1`, a `quote_activity` row (`actor='customer'`, `kind='declined'`, message names the reason, and the note for Other). The customer's chip reads "Declined".
- The reason and note are rep-only: never in the snapshot, the customer PDF, or any customer-safe type. `CustomerQuoteResponse` gains `{kind:'declined';revision:number}` with no reason.

---

## 3. Aging rules (A2)

Aging is derived on read, never stored: `src/server/quotes/aging.ts`, pure, `aging(q, now, thresholds) → {level:'ok'|'amber'|'red', since:string, reason:string} | null`. `null` for final statuses.

| Effective status | Clock starts | Amber after | Red after |
|---|---|---|---|
| `ready_for_review` | `created_at` | 4 h | 24 h |
| `changes_requested` | `responded_at` | 4 h | 24 h |
| `sent` | `sent_at` (latest send) | 72 h | 168 h |

- Wall-clock hours. A level starts at the threshold instant (`now - start >= amber` is amber).
- A `sent` quote is also amber from 2 days before expiry and red on its last day. Expiry is 00:00Z on the day after `valid_until` (`expiresAt` in `lifecycle.ts`), so amber starts at 00:00Z on `valid_until - 1 day` and red at 00:00Z on `valid_until`. The worse of the two levels wins.
- Worked example (`sent`, sent 2026-10-01T15:00Z, valid_until 2026-10-15): ok until 10-04T15:00Z; amber from 10-04T15:00Z (72 h); red from 10-08T15:00Z (168 h). A quote sent 10-10T09:00Z valid until 10-14 (expires 10-15T00:00Z): amber from 10-13T00:00Z (expiry rule), red from 10-14T00:00Z.
- UI: amber shows a clock icon and the text "Aging", red shows an alert icon and "Overdue" (text label and icon besides colour). The tooltip gives the reason ("Sent 4 days ago", "Expires tomorrow").
- Quotes list (U3): Needs attention is the header's caution dropdown plus the filter panel's Only show **Overdue** (red) and **Aging** (amber); the list keeps newest request first. The old Needs attention view (`?attention=1`) opens as Only show Overdue and Aging. `GET /api/rep/quotes?attention=1` still answers red first, then amber, then quoted total descending, or oldest clock first with `&sort=oldest` (OA-9).
- Header caution (U2, replacing the old red badge and the nav unread count): the caution button in every rep page header opens the "Needs attention" dropdown of amber and red open quotes, red first (C_QOB3); its accessible name counts the red ones only ("Needs attention, 2 items"). Scoped like the list: own quotes, every rep's for the manager (U1). Unread customer events are in the bell dropdown (C_QOB4).
- Touch and view clocks (used by Team, section 7.3):
  - `last_rep_touch_at` is set to now when the owning rep opens the quote detail (`GET /api/rep/quotes/[id]` and the page load) or makes any edit (lines, terms, fulfillment, freight, notes, send). A manager's read-only open does not touch it.
  - `customer_viewed_at` is set to now when the customer opens the PDF preview of a sent revision (the existing customer read path that clears `unread_for_customer`).

---

## 4. Freight and pricing

### 4.1 Freight line

- Free delivery pricing **off**: freight is exactly as today (`freight/engine.ts`, rules and rates unchanged).
- Free delivery pricing **on**: a delivery quote within the radius gets rule `free_delivery_pricing`, amount $0.00, explanation "Free delivery pricing: freight is recovered in item prices." `free_threshold` and `min_charge` are ignored but kept. Beyond the radius, no ship-to and no distance still give "call for freight" (OA-7). Will call stays $0.00.
- A rep's explicit freight override still wins (section 4.5).

### 4.2 Modelled delivery cost (C1)

Pure: `src/server/freight/cost-model.ts`, `modelledDeliveryCost(input) → {cents, components, roundTripMiles, driveHours}`.

```
miles        = DistanceProvider (haversine × road_factor), to 0.1 mi (existing)
round_trip   = 2 × miles
drive_hours  = round_trip ÷ avg_speed_mph
fuel         = round_trip ÷ mpg × fuel_price
wear         = round_trip × wear_per_mile
depreciation = round_trip × depreciation_per_mile
driver       = (drive_hours + stop_minutes ÷ 60) × driver_per_hour
cost_cents   = roundCents(fuel + wear + depreciation + driver)   (components in unrounded cents, one rounding at the end)
```

Worked example (Wasatch ship-to, SLC branch, defaults, gasoline $3.40/gal): straight line 12.0 mi × 1.25 = 15.0 mi; round trip 30.0 mi; drive time 30 ÷ 35 = 0.857142… h.
- fuel = 30 ÷ 10 × 340¢ = 1020¢
- wear = 30 × 20¢ = 600¢
- depreciation = 30 × 15¢ = 450¢
- driver = 0.857142… × 2500¢ = 2142.857…¢
- total = 4212.857…¢ → **4213¢ = $42.13**. With a 15-minute stop: driver = (0.857142… + 0.25) × 2500 = 2767.857…¢, total 4837.857… → **$48.38**.

The quote freezes `modelled_freight_cents` at creation for delivery quotes (NULL for will call or call-for-freight).

### 4.3 Fuel price (C3)

- Gasoline: `OilPriceAPI` at `https://api.oilpriceapi.com/v1`, header `Authorization: Token <OILPRICEAPI_KEY>` (not Bearer), code `GASOLINE_RETAIL_STATE_<ST>_USD` for the delivering branch's `state`. Client: `src/server/freight/fuel-price.ts` behind a `FuelPriceSource` interface; the real HTTP source is constructed only when the key is set, and tests inject a fake. The key is read server-side only, never logged, never serialised, never sent to the client.
- At most one fetch per state per UTC day: the `fuel_prices` row's `fetched_on` is compared with today before fetching. A fetch happens lazily when a price is needed (quote creation, Pricing & Delivery load). No scheduler.
- On fetch failure (or no key), use the last stored price. If its `as_of` is more than 14 days old, Pricing & Delivery shows a "Fuel price is N days old" warning. If no price was ever stored, a manual price is required: the warning reads "No fuel price. Enter one by hand." and the fuel component is 0.
- `freight_fuel_manual_cents`, when set, always wins.
- Diesel (`freight_fuel_type='diesel'`) never calls the API: it uses the manual price, or $0 when none exists. `TODO(R-9)`.
- A visible warning shows on Pricing & Delivery whenever the fuel price in use is missing or zero.
- The seed stores a gasoline price for UT (`source='seed'`, 340¢, `as_of` = seed date) so the offline demo and CI never need the API.

### 4.4 Recovery rate: percentage pool (C1)

```
eligible quote = status accepted
               AND fulfillment = delivery
               AND freight_rate_bp IS NOT NULL       (it carried recovery: free delivery was on, no override, not under threshold)
               AND responded_at within the trailing 90 days
pool_rate      = Σ modelled_freight_cents ÷ Σ goods_cents            (over eligible quotes)
goods_cents    = Σ over the quote's non-contract priced lines of unit_price × qty   (engine/rep price before the freight uplift)
base_rate      = count ≥ 20 ? pool_rate : freight_starting_rate_bp
capped_rate    = min(base_rate, freight_rate_cap_bp)
rate_in_force  = round(capped_rate × ramp_step ÷ ramp_steps)          (bp)
```

- Recomputed at most once per UTC day, lazily, cached in `freight_pool_*` settings.
- One pool per deployment.
- Ramp: on enable, `free_delivery_enabled_at` is recorded. `ramp_step = min(steps, floor(days_since_enabled ÷ (ramp_days ÷ steps)) + 1)`. Defaults: 3 steps over 90 days, so step 1 on days 0–29, step 2 on days 30–59, step 3 from day 60.
- Frozen at creation: `freight_rate_bp = rate_in_force`, `freight_ramp_step`, `freight_ramp_steps`.
- Worked example: 24 eligible quotes, Σ modelled cost 101,040¢, Σ goods 2,526,000¢ → pool 4.0% (400 bp). Cap 800 bp → 400 bp. Day 35 after enable (step 2 of 3) → rate in force = round(400 × 2 ÷ 3) = **267 bp (2.67%)**. With 12 eligible quotes the starting rate 300 bp applies instead → step 2 → **200 bp**. A computed pool of 9.5% is capped at 800 bp.

### 4.5 Allocation within a quote (C2)

Pure: `src/server/freight/recovery.ts`, `allocateRecovery({rateBp, lines, lineCapBp}) → per-line {freight_recovery (cents per unit)}`.

A quote carries recovery only when **all** hold: free delivery pricing is on, fulfillment is delivery, no freight override, goods value is at or above `free_threshold` (quotes under it carry none, OA-3), and freight is not call-for-freight.

```
eligible line  = price_basis != 'contract' AND unit_price not null AND qty > 0
goods_cents    = Σ eligible unit_price_cents × qty
target_cents   = roundCents(rate_bp × goods_cents ÷ 10000)
margin_i       = (unit_price_cents - unit_cost_cents) × qty           (eligible lines with margin_i > 0 only)
share_i        = floor(target × margin_i ÷ Σ margin)
remainder      = target - Σ share_i  → added to the highest-margin line (ties: lowest line_no)
per_unit_i     = roundCents(share_i ÷ qty_i)                          (OA-6)
cap_i          = floor(unit_price_cents × line_cap_bp ÷ 10000)
freight_recovery_i = min(per_unit_i, cap_i)                           (excess is dropped, not redistributed, OA-5)
```

If every eligible line has zero or negative margin, no line gets recovery. Contract lines, zero-margin lines and negative-margin lines get 0.

Worked example (decision log): bolts qty 1 at $20.00 (cost $19.00), drill qty 1 at $180.00 (cost $150.00), target $10.00 (1000¢).
- margins: bolts 100¢, drill 3000¢, Σ 3100¢
- bolts share = floor(1000 × 100 ÷ 3100) = floor(32.26) = 32¢
- drill share = floor(1000 × 3000 ÷ 3100) = floor(967.74) = 967¢
- remainder = 1000 − 999 = 1¢ → drill (highest margin) → 968¢
- result: **bolts +$0.32, drill +$9.68**. Caps: bolts 8% of 2000¢ = 160¢, drill 1440¢; neither binds.

Same quote at qty 10 bolts at $2.00 (cost $1.90): line margin is still 100¢, share 32¢, per unit roundCents(3.2) = 3¢, so the bolts line recovers 30¢ and the customer sees $2.03 a box.

Per-line cap example (rate cap raised to 10%): a $5.00 item (cost $1.00, qty 1) as the only line with a 1000 bp rate on a $5 quote: target 50¢, cap 40¢ → +$0.40.

- Customer-facing unit price = `unit_price + freight_recovery`. `unit_price` remains the engine or rep price (pre-recovery), so price bases, floors, the floor warning and suggestion logic are unchanged. Margin and GP figures stay computed from `unit_price`; recovery is reported separately (OA-10).
- Totals: line total = (unit_price_cents + freight_recovery) × qty; quote total = Σ line totals + freight. The snapshot freezes the customer-facing unit price, so the customer PDF shows only the final unit price and "Freight $0.00".
- A rep's explicit freight override sets every line's `freight_recovery` to 0, sets `freight_rate_bp` NULL (the quote leaves the pool), and logs in `quote_activity` as today. Clearing the override re-freezes the rate in force and reallocates.
- Reallocation runs on every draft edit that changes prices, qty, lines, fulfillment or ship-to, using the quote's frozen rate.
- Toggle change: a draft (`ready_for_review`, `changes_requested`) whose frozen state does not match the toggle reprices on its next open or edit (re-freeze the current rate in force, or clear it). Sent and final quotes stay frozen in their snapshots.

### 4.6 Visibility

- Rep "Why this price?" row: "Freight recovery +$2.40 (rate 5.0%, ramp step 2 of 3)" (per-unit amount, the quote's frozen rate and step).
- Rep quote header: "Freight recovery 5.0%" chip when the quote carries recovery.
- Customer and customer PDF: final unit price and "Freight $0.00" only. Nothing about recovery, rates or cost crosses the customer-safe boundary.
- Pricing and delivery (manager; each section only while its feature flag is on, decision 48, U8): pool rate (computed or starting, with the eligible count), cap, ramp step and its schedule, trailing 90-day modelled cost and recovered amount, cost-model inputs, fuel price and its age, the toggle and the impact preview.

### 4.7 Impact preview and safeguards (C3)

- `GET /api/rep/settings/freight/preview` computes, over delivery quotes created in the last 90 days that would carry recovery: the number of quotes affected, and per product category the average line price change in percent and in cents at the step-1 rate and at the full (step n) rate, and the affected quotes with a line in it (U8: the C_S7 dialog shows "N of <delivery quotes>" and the change in dollars). It records `free_delivery_preview_viewed_at`. Refused (403 `feature_off`) while `FEATURE_FREE_DELIVERY_PRICING` is off.
- Enabling (`PUT … {free_delivery_pricing:true}`) is refused with 409 `preview_required` unless the preview was viewed within the last 24 hours (OA-11).

---

## 5. API changes

All `/api/rep/*` routes keep `repRoute()`. New helper `managerRoute()` (D1) answers 403 for a non-manager. All customer routes keep the customer-safe boundary.

| Route | Slice | Who | Behaviour |
|---|---|---|---|
| `POST /api/query/customer/quotes/[id]/decline` | A1 | customer | `{reason?:DeclineReason\|null, note?:string}`; Idempotency-Key replay like accept; 409 when not respondable |
| `GET /api/rep/quotes?attention=1&sort=oldest` | A2 | rep | Needs-attention filter and sort; rows carry `aging` |
| `GET /api/rep/quotes?status=a,b&customer=&rep=&requested_from=&requested_to=&only=` | U3 | rep, manager | The Quotes page's filter panel: any set of statuses, the page's own customer, Rep (the manager only; ignored for a rep), requested days (YYYY-MM-DD, UTC, both included) and Only show `overdue`, `aging`, `below_floor` (any of them). `counts` (the board's lanes) cover every filter but the status ones. Rows carry `contact_name`; the list carries `customers` (the picker: a rep's own, every customer for the manager), `statuses`, `requested_from`, `requested_to`, `only`. The page and its poll send the same query |
| `POST /api/rep/quotes/[id]/reply` | U3 | owning rep | `{body}` (1 to 2000 characters): the rep's reply to the customer's change request note (C_QOB6 "Send reply"), recorded on the quote's Activity (`kind='replied'`, "Brandi Gallegos replied to Dana Ortiz: …"); nothing is sent to the customer yet (no frame or spec says where, status.md "No frame"). 409 without a change request, 404 for another rep's quote |
| `GET /api/rep/badges` | A2, U2 | rep | `{quotes, attention, caution, bell}`: the unread count, the red count, and the two header dropdowns' rows `{id, quote_number, kind, label, tag, line, at}` (caution: amber and red open quotes, red first, tag "Overdue" or "Aging", one line in C_QOB3's sentence for the quote's status: "Dana Ortiz asked to move pickup to Ogden.", "Draft has 1 line below the margin floor.", "Sent Oct 6, no reply yet."; bell: the reader's own unread customer events, newest first, worded as C_QOB4 ("Dana Ortiz replied on Q-24790", "Q-24763 accepted by Canyon Ridge Builders": the customer's full name, decision 59, also for a quote with no contact; "Q-24815 expired"), `line` null and `at` printed in the browser's time zone, except an expired row, whose `line` is its day). Preferences (U9) filter the rows through one seam (`notify` in `src/server/rep/badges.ts`) |
| `GET /api/rep/quotes/[id]/messages?before=&limit=50` | B1 | owner rep, manager (after D2) | `{total, messages:[{id,role,kind,content,created_at}], next_before}` oldest-first pages of 50, newest page first |
| `GET/PUT /api/rep/settings/freight` | C3, U8 | manager | toggle, cost inputs, rates, caps, ramp; GET returns pool, fuel status, warnings. A PUT touching a section whose flag is off is refused whole (403 `feature_off`): `enabled` needs `FEATURE_FREE_DELIVERY_PRICING`, `rates` `FEATURE_RECOVERY_POOL`, `cost` `FEATURE_DELIVERY_COST_MODEL` (decision 48) |
| `GET /api/rep/settings/freight/preview` | C3 | manager | impact preview (4.7) |
| `GET/PUT /api/rep/settings/aging` | D1 | manager | thresholds in hours |
| `GET /api/rep/settings` | U8, U9 | rep, manager | The manager: `{rep_id, manager:{access, accessTable, orgFloors, repMargins, pricing, delivery, aging, flags}, mine, own:null}`; `?customer=<id>` fills `accessTable` with that customer searched by name. A rep: `{rep_id, manager:null, mine, own:{orgFloors, profile, notifications}}`, their own margins, the organization floors, their profile and switches only (OA-69) |
| `PUT /api/rep/settings/floors` | 6.1, U9 | rep, manager | The signed-in rep's own margins: `{category_id, floor_pct}` or `{floors:[{category_id, floor_pct}]}` (all or none). Another rep's: 403. Below the category's organization floor: 400 `{detail, code:'below_org_floor', fields:[{category_id, floor, detail}]}` |
| `GET/PUT /api/rep/profile`, `GET/PUT/DELETE /api/rep/profile/picture` | U9 | rep, manager | The signed-in rep's own profile `{name, initials, title, phone, email, picture_url}`; PUT `{name, phone, email}` (400 `{detail, field}`). The picture: PUT with the image as the body, PNG, JPEG or WebP by its bytes (400), 2 MB at most (413); served with its stored type, `nosniff`, a sandboxing CSP, private |
| `GET/PUT /api/rep/notification-prefs` | U9 | rep, manager | The signed-in rep's in-app switches, the eight Appendix C keys, on until turned off; PUT `{<key>: boolean}` (400 for anything else) |
| `GET /api/query/customer/contacts/picture` | U9 | customer | The picture of the customer's own rep (404 without one); `GET /api/query/customer/contacts` gives `{rep:{name, initials, title, phone, email, picture_url}}` |
| `GET /api/rep/settings/access?q=&items_stock=&pricing=&orders_quotes=&account=`, `PUT /api/rep/settings/access` | U8 | manager | Customer access (C_S1b): the customers whose name or account number contains `q` and whose data types are in the states given (`any`, `answers`, `not_shared`), `{q, customers:[{id,name,account_number,access}], total}`; 400 for another state. PUT `{customer_id\|null, category, enabled}` answers `{customer_id, rules, all}` |
| `GET/PUT /api/rep/settings/org-floors` | U8 | manager | Organization margin floors (`org_margin_floors`): every category with `{floor, label}`; PUT `{floors:[{category_id, floor_pct}]}` (0 to 99.9, 0.1 point, each category once, all or none) |
| `GET /api/rep/settings/margins` | U8 | manager | Every rep's own margins, by name, read-only (Rep margins) |
| `PUT /api/rep/settings/pricing`, `PUT /api/rep/settings/delivery`, `GET /api/rep/settings/sources` | U8 | manager | Manager only since U8 (Appendix B; a rep 403). `/sources` has no page any more |
| `GET /api/rep/team/reps`, `PUT /api/rep/team/reps/[id]` | D1, U7 | manager | list reps (with their team entity's name and id); set `active` (deactivate refused 409 `has_customers` while the rep has customers). The free-text team label is gone (U7): teams are set through `/api/rep/teams`. Teams and Reps' Save writes here |
| `GET /api/rep/teams`, `POST /api/rep/teams` `{name, rep_ids?, parent_team_id?}`, `PATCH /api/rep/teams/[id]` `{name?, parent_team_id?}`, `DELETE /api/rep/teams/[id]`, `PUT /api/rep/teams/[id]/members` `{add?, remove?}` | U7 | manager | Teams and Reps' board (the reps without managers, with their customers and open quotes; everyone who can own a customer; the teams in list order with their own members and the reps each counts; every customer with its rep and the owners of its open quotes). Team names are 1 to 40 characters and unique whatever their case; a rep is in at most one team (adding moves them); a team can sit inside another, never inside itself or a team inside it (400); deleting a team leaves its reps with no team and its child teams on their own. Every write answers the board. A parent is grouping only (decision 47) |
| `POST /api/rep/quotes/reassign` | D2 | manager | `{quoteIds:string[], toRepId}` single or bulk; writes `quote_activity` (`kind='reassigned'`, actor manager, message "from A to B") per quote |
| `PUT /api/rep/settings/assignments` | D2, U7 | manager | adds `{moveOpenQuotes:boolean}`; the backing route of Teams and Reps' disconnect (C_TR2) and connect (C_TR4) |
| `GET /api/rep/quotes?rep=<id>&team=<label>` | D2, U1 | rep, manager | Scope is role based (U1): a rep's own quotes, every rep's for the manager, who also filters by rep and team. `?scope=all` is ignored (no switch, never a 403) |
| `GET /api/rep/badges`, `/api/rep/analytics`, `/api/rep/settings` | U1 | rep, manager | Role based: a rep's own customers and quotes, the whole organization for the manager. `?customer=` is a page's own filter; a customer the rep can't read is ignored |
| `GET /api/rep/team/metrics?from=&to=&reps=&team=` | D3 | manager | metrics (section 7); `from`/`to` are ISO instants computed in the browser's time zone. Kept, unchanged; no page reads it since U7 replaced the old dashboard on `/rep/teams` (Analytics reads `GET /api/rep/analytics`) |
| `GET /api/rep/team/metrics.csv?…` | D3 | manager | same rows via `src/server/export/csv.ts` (kept like the route above) |
| `GET /api/rep/analytics?customer=&reps=a,b&teams=X,Y&breakdown=org\|rep\|team\|customer&from=&to=` (or `&period=7\|30\|90`) | U6 | rep, manager | The Analytics page: the Overview (stat cards, weekly trend, margin vs floor, top items), the customer questions and query analytics, `filter`, `options` (reps, team names in the Teams card's order, readable customers), and `groups`: the section 7 metrics, one row per rep, team (each team with any of the reps, a parent counting the reps of the teams inside it, decision 47; "No team" for reps without one) or customer, plus the totals and the Other notes, over the quotes created in the window. Reps and teams narrow every number to those reps' quotes and their customers' questions; the whole organization groups the rows by rep. A rep is forced to their own data (reps, teams and breakdown ignored, another rep's customer reads as none, never a 403). The window defaults to the last 30 UTC days; the browser sends its own midnights (OA-19). 400 for an unknown rep, team or breakdown or a bad window |
| `GET /api/rep/analytics/csv?…` | U6 | manager | Export CSV on the Rep leaderboard: the rows as filtered and broken down, then the totals, `rep-leaderboard.csv`; the first column is named Rep, Team or Customer. 403 for a rep |
| `POST /api/query/customer/item-popup` (existing payload) | E1 | customer | adds `suggestions:[{item_id,sku,description,pack,reason}]` (no prices, no cost) |
| line add with `added_by:'suggestion'` | E1 | customer | adding a suggestion to the cart at qty 1 |
| `GET /api/query/customer/orders` | U10 | customer | the session customer's own orders, newest first: `[{id, order_number, order_date, status, fulfillment, branch_code, total, quote_number}]`; no lines, subtotal, freight, tax, cost or margin |
| `GET /api/query/customer/notifications` | U10 | customer | the bell: `{unread, items:[{id, kind, title, body, at, day_only, read, quote}]}`, newest ten, derived on read |
| `POST /api/query/customer/notifications/read` | U10 | customer | `{ids:[…]}` (1 to 100) or `{all:true}`; ids that are not the customer's notifications are ignored; answers the bell as it now reads |
| `GET /api/query/customer/contacts` | U10 | customer | trimmed to `{rep}` for the My rep sheet (departments stay with the chat's answers) |
| `POST /api/query/visitor/chat` | U10 | anyone | the visitor box's stub: always `{answer:"Sign in to continue."}`, imports nothing (decision 49, `TODO(R-14)`) |
| `GET /api/rep/table-prefs?table=<id>`, `PUT /api/rep/table-prefs` | U0 | rep, manager | the signed-in user's column order and hidden columns for one table: `{table_id, prefs:{column_order, hidden_columns}\|null}`; PUT takes `{table_id, column_order, hidden_columns}` and refuses any other field (a `user_id` included) with 400 |

Rep write routes refuse a quote the caller does not own (existing "not found"), including managers: a manager reads any quote but edits only after reassigning it to themselves (D2).

---

## 6. UI changes by page

### Customer site (`/`, U10; frames C_CVE0 to C_CVL5)
- Querent is a box on the supplier's own site; only the box, the Orders and My rep sheets, the bell and the account chip are built (the frames' Herrick header and page are a stand-in).
- No session: the visitor box (C_CVE0) with the four public starter questions and a Sign in button that opens the demo chooser at `/demo` (decision 53). Every question goes to `POST /api/query/visitor/chat`, a stub that always answers "Sign in to continue." and never calls the model or a tool (decision 49, `TODO(R-14)`).
- Customer session: the same box with the logged-in starter questions (C_CVL1), Orders (C_CVL2: previous orders, five then "Show N more") and My rep (C_CVL3) side sheets, the notification bell with its unread count, and the account chip (its Sign out menu has no frame and returns to the visitor box). The contacts and quotes sidebars, the three panes, the phone tabs, the ERP indicator and "Switch workspace" are gone; there is no phone layout (decision 43). New conversation shows next to Orders once the conversation has turns (no frame).
- Bell (C_CVL4, decision 41): notifications derived from quote activity and order status, newest ten, one per quote (its latest news): a quote sent ("Quote Q-… is ready to review"), sent again after Dana asked for changes ("Brandi updated Q-…"), expired ("Quote Q-… expired", no frame copy), and an order whose status is shipped ("Order SO-… has shipped"). Read per customer: pressing one or "Mark all read" marks it read, and a quote Dana answered or opened after the news counts as read. Polled every 5 s like the rep badges, and re-read when a quote changes. A quote notification opens the quote preview (C_CVL5) with Decline, Request changes and Accept.
- Quote preview (C_CVL5): the existing preview and its three routes, restyled to the frame; its status is plain text ("Sent" in the accent).
- `QuoteNoticeCard` stays in the chat as the in-conversation twin of the bell's quote notices.
- PDF preview modal action bar: **Decline** next to Accept / Request changes, opening a centered dialog with the five reasons as radio buttons, a 250-character field for Other, red Cancel, and a **Decline** confirm button (A1).
- Item pop-up: "Frequently bought together" below the cart, at least 2 suggestions when the pool allows, each with its reason and an "Add" button that adds qty 1 (E1).

### Rep: Quotes list (`/rep/quotes`; U3, frames C_QOBoard, C_QOTable, C_RQBoard, C_RQTable)
- One toolbar: the customer picker ("All customers", a rep's "All my customers"; first five rows, the rest scroll, typing narrows; C_QOB1, C_QOT7, C_RQB1), **Filter** (C_QOB2) and the **Board** / **Table** toggle (`?view=table`). No status strip, no "Viewing" line, no unread dot, no sort toggle.
- Board: one lane per status (Draft ready, Changes requested, Sent, Accepted, Expired, Declined) with its count (real data), seven cards, then "Show N more" and "Show less" (C_QOB7); an empty lane reads "No quotes here". A card: number, requested day, customer, View note (a change request), total, margin and one red line when something is wrong ("Overdue", "Aging", "1 line below floor", "Overdue. 1 line below floor"). Lanes move by drag or Alt+Left / Alt+Right (C_QOB8); the order is the user's own (`ui_table_prefs`, table `quotes-board`). A status filter shows only its lanes.
- Table: Quote, Customer, Requested, Status, Total, Margin; the columns picker (C_QOT2) also offers Rep (the manager only), Valid until and Purchasing agent, hidden at first; order and visibility are the user's own (table `quotes`). Fourteen rows, then "Show N more quotes" and "Show fewer quotes" (C_QOT5).
- Filter (C_QOB2, C_RQB2 for a rep): status (all ticked means every status), Rep (the manager only), Customer, Requested from and to, Only show Overdue, Aging, Below margin floor; the badge counts what is applied. Everything lives in the URL; a page with a Team dashboard drill-down (`?rep=a,b&from=&to=&aging=`) opens that list (`aging=red|amber` reads as Only show Overdue or Aging).
- A card or row opens the quote preview (C_QOB5, C_QOT3): total, requested day, margin, status, the customer's note, **Open quote** (which opens the quote page and marks it read) and **Reply to Dana** (which opens the note). **View note** (C_QOB6, C_QOT4) shows the note with a reply box; **Send reply** records the reply on the quote's Activity.
- Manager: every rep's quotes by default (no "My quotes / All reps" switch, U1). No bulk reassign on this page (decision 45: Teams and Reps, U7); `POST /api/rep/quotes/reassign` stays.
- Rep: own quotes and customers only, no Rep column or Rep filter (U1).
- `?customer=` filters this page only (U1); its links keep it, no other page's links do.

### Rep: shell (`RepShell`, `Rail`, `RepPageHeader`; U2)
- Left rail, 216px charcoal, sticky at the top at 100vh (every page frame; C_QOBoard, C_RQBoard): the Querent logo, the supplier name, the nav with icons, and the user block (initials, short name such as "Brandi G.", role Manager or Rep, **Sign out**). Manager nav: Quotes, Customers, Orders, Stock, Analytics, Teams and Reps, Settings. Rep nav: Quotes, Customers, Orders, Stock, My Analytics, Settings. No search, no avatar menu, no "Switch workspace", no role switch (decision 42), no count on the nav.
- Sign out asks first ("Sign out of Querent?", C_QOB9); confirming calls `DELETE /api/session` and returns to `/` (decision 53).
- Every rep page header (`RepPageHeader` on the U0 `PageHeader`): the title, the page's own picker or Filter (added by U3 to U9), then the caution and bell on the right. Each opens a dropdown and never navigates on open (C_QOB3, C_QOB4); choosing a row opens that quote (no frame, status.md).
- Routes (decision 46): `/rep/items` is `/rep/stock` and `/rep/team` is `/rep/teams`; the old paths (and `/rep/items/<sku>`) answer 308 with the query kept (`next.config.ts`).
- No "Viewing" customer picker and no `?customer=` on nav links (U1). Customer filters live on the pages that need them (Quotes, Customers, Orders, Analytics, Settings > Customer access).
- No phone or tablet layout (decision 43): the old app bar, its scrolling nav strip and its breakpoints are gone.
- Type (U0): every rep page renders in Albert Sans (UI) and Geist Mono (numbers, codes), loaded once by `next/font` in the root layout; Archivo and IBM Plex are gone. The layouts stay as they are until their lane U task rebuilds them on the shared primitives in `src/components/ui/` and the tokens in `src/app/tokens.css`.

### Rep: Quote editor (`/rep/quotes/[id]`; U4, frames C_QEBase and C_QE1 to C_QE11)
- Minimal header (C_QEBase): the customer as the title with the caution and bell, then Quote, Status (with Overdue or Aging), Purchasing agent, Requested and Valid until. No breadcrumb, status banners, request box or recovery chip: what the banners said (the change request note, the decline reason and Other note (A1), the accepted PO and pickup) is in Quote details, Activity.
- Items card: Show cost and stock (off by default; on, Available and Cost appear between Qty and Unit price, C_QE7), the lines with fixed columns Qty 60, Unit price 118, Margin 78, Total 82 and a 34px centre line, each line's price-basis dropdown (C_QE10) and Line details (C_QE9, three columns, with the freight recovery line when the quote carries recovery, C2), then + Add item with its results dropdown (C_QE8: Add, or "Already on quote"). Suggested by Querent below (C_QE5).
- Total column: the total box (total before tax, gross profit, margin with the floor, **Approve and send**), the Save draft (C_QE11), Export (C_QE2), Chat (C_QE6, the "Full chat" drawer of B1) and More (C_QE3) icon buttons, and Quote details (C_QE4: Customer, Pickup or delivery, Quote terms, Internal notes, Activity), closed by default.
- Send blockers (decision 44): Approve and send is disabled while `sendBlockers()` finds anything; the first blocker is named under it in red with "+N more", and clicking it jumps to the line's field, opens Quote details at the section, or scrolls to + Add item. Stock short at the branch and a match below 0.75 show as inline notes on their line and never block. The server still refuses a blocked send (422 `send_blocked`). The checks box is gone.
- Manager viewing another rep's quote (D2, decision 22): read-only, one line under Approve and send "Read only: Mara Jensen's quote. Reassign it to edit.", every edit control off, Reassign in More actions.

### Rep: Settings (`/rep/settings`, U8, U9; frames C_S1 to C_S8, C_RS1 to C_RS4)
- Manager tabs: Customer access, Margin floors, Pricing and delivery, Aging; an unknown `?tab=` opens Customer access. Data sources is gone; Rep assignments and Reps moved to Teams and Reps (U7). No descriptions except the frames' own lines.
- Customer access (C_S1, C_S1a, C_S1b): with no search and no filter, one switch per data type (Items and stock, Pricing, Orders and quotes, Account) for every customer; the search (name or account number) or the Filter (each type Any, Querent answers, Not shared) lists the matching customers with one switch per type and "2 of 6 customers" beside the Filter. Analytics' Manage customer access link (`?customer=`) opens it searched for that customer.
- Margin floors (C_S2, C_S3): Organization margin floors (a field and the 0% to 50% bar per category, Save floors), then Rep margins, read-only: a searchable rep (the first rep who is not the signed-in manager first) with their margin against the organization floor. Since U9 every rep's own margin must be at or above its organization floor (checked on write).
- Pricing and delivery (C_S4): Pricing (scarcity uplift, broken case) and Delivery rates (right-aligned fields, units under the labels, Save rates on the title bar). Free delivery pricing (toggle, ramp-in, View impact preview, C_S5, C_S7), Recovery pool and Delivery cost model (C_S6) render only while their flags are on (decision 48).
- Aging (C_S8): the three status rows (Draft ready, Changes requested, Sent) with amber and red hours and the "1 day" conversions, Save thresholds.
- A rep's tabs (U9): Margins, Profile, Notifications, nothing else; any other `?tab=` opens Margins. No descriptions except the legend.
- Margins (C_RS1, C_RS3): "Your margins", one row per category: the 0% to 50% bar filled to the rep's margin with the dark organization floor tick and the green margin tick, the 80px field, the organization floor. Under the floor the row turns red ("Below the 30.0% organization floor. Pick 30.0% or higher.", the real floor) and Save margins is disabled (drawn grey). The legend ("Organization floor, set by your manager", "Your margin") stays. Save margins sends the changed margins together through `PUT /api/rep/settings/floors {floors}`.
- Profile (C_RS2): the picture (initials until one is uploaded; Upload picture: PNG, JPEG or WebP, 2 MB at most; Remove), Name, Phone, Email; Save profile. Customers see them in the My rep sheet, and quotes carry the rep's name, phone and email from the next send.
- Notifications (C_RS4): in-app switches only, Needs attention (Quote overdue, Quote aging, Below margin floor, Change requested: the caution dropdown) and Notifications (Quote accepted, Quote declined, Quote expired, Customer chat needs a rep: the bell), each card with its own Save notifications. `GET /api/rep/badges` drops the rows they turn off.

### Rep: Analytics (`/rep/analytics`, U6; frames C_ANBase to C_AN8, C_RAN1 to C_RAN5)
- Manager tabs: Overview, Rep leaderboard, Decline reasons, Untouched quotes, Customer questions. Rep ("My Analytics"): the same without Rep leaderboard.
- Header: the title and the line under it ("Quotes and customer questions for the whole organization", "for your customers", or the filtered customer's name), **Filter**, and on the Rep leaderboard tab **Export CSV**.
- Manager filter (C_AN4): Reps and Teams checkboxes, a Customer select ("Any customer"), "Break the numbers down by" Whole organization, Rep, Team, Customer. Rep filter (C_RAN2): Customer ("Any of my customers") and Period 7, 30 (default), 90 days or Custom. The manager picks the window in the leaderboard's title bar ("Created"). The window is the cohort of the leaderboard, Decline reasons and Untouched quotes (section 7); the Overview keeps its own spans (26 weeks, all time).
- Overview: the five stat cards with an "i" each, quotes and wins by week (a column per week, a label under every fourth from the first, **Show table** newest first, nine weeks then "Show N more weeks"), average margin vs floor per category, top requested items (bars by quantity).
- Rep leaderboard (C_AN6): the section 7 counts and rates per row and in the totals, each count linked to its quotes; the frame's 18 columns, with the rest of section 7 in the columns picker. Decline reasons (C_AN7): per reason, a column per row for the manager, and the Other notes ("Q-24767, Mara Jensen, Sep 28"; a rep's notes name the customer). Untouched quotes (C_AN8): per reason, a row per rep and the totals; a rep's single row is "Your quotes".
- Customer questions (C_AN2): questions answered without a rep, then Query analytics (Total queries, Estimated time saved, Queries by category with the Assigned rep for the manager, and the access card with "Manage customer access" for the manager).
- Table headers carry "::" and reorder by drag or Alt+Left/Right; the week and leaderboard tables have the columns picker. Order and hidden columns are the user's own (`ui_table_prefs`).

### Rep: Teams and Reps (`/rep/teams`, was `/rep/team`; manager-only; U7, frames C_TRBase to C_TR7)
- No analytics here: the old dashboard's content is on Analytics (U6). A rep is sent to their Quotes; every route answers them 403.
- Header: "Teams and Reps" and "Who is on your team and which customers they own", then the caution and bell.
- Reps card (C_TRBase): "N reps. Managers are not listed.", **Filter** (no frame: by team, a parent taking in the reps of the teams inside it, plus "No team"), **Save**; columns Rep name, Customers (a count button), Role (the rep's title), Team, Active (a switch), with the `::` handles and the columns picker (`ui_table_prefs` table `teams-reps`). Active switches change on the page and **Save** stores them through `PUT /api/rep/team/reps/[id]`; deactivating a rep with customers is refused and the server's reason shows in one red line (decision 21).
- Customers under a rep (C_TR1): "Hide customers", "Customers for <rep>", each customer with its account code and an **x**, and **+ Connect a customer**. The x opens "Disconnect <customer>?" (C_TR2): the new rep is picked in the same step among the other active reps and the manager ("2 customers", "No customers yet"), with "Also move this customer's open quotes"; **Disconnect and reassign**. Connect (C_TR3) searches the customers that are not the rep's, each "With <rep>"; picking one asks "<customer> is with <rep>" (C_TR4): "Connecting it to <new rep> takes it off <old rep>. <first name> will keep N customers.", "Also move this customer's open quotes (N quotes)" (the open quotes the new rep doesn't own yet), **Move to <new rep>**. Both go through `PUT /api/rep/settings/assignments`: one rep per customer, open quotes moved only when ticked, each with an Activity entry.
- Bulk reassign (decision 45; no frame): clicking a rep's row (or Space or Enter on it) picks it; a bar under the title shows the rep (or "N reps") and **Reassign open quotes**, which opens the reassign dialog with their open quotes (`POST /api/rep/quotes/reassign`, an Activity entry each).
- Teams card (C_TRBase): **Filter** (no frame: the teams a picked rep counts in), **Create team**, a `::` Team header with the columns picker, and each team with its tick box and "N reps" (its own members plus those of the teams inside it; a team inside another is indented, no frame). A picked team (C_TR5) shows a bar with its name, **Add to team**, **Remove from team**, **Move into other team**, and its reps as chips. Create team (C_TR6): Team name, Add reps (every active rep and manager; a rep moves out of their old team), Inside another team (None or a team). Move team (C_TR7): "Reps in <team> stay in it, and also count in the team you pick.", the other teams except those inside it, and "No parent team". Add to team and Remove from team (no frame) tick reps in Create team's grid.
- Teams are entities (`011_teams`: `teams(id, name, parent_team_id)`, `team_members(rep_id, team_id)`), migrated from the reps' free-text labels. A parent is grouping only (decision 47): it counts the reps of the teams inside it for the Teams card, the Reps filter and Analytics' team filter and breakdown, and grants nothing (TODO R-12).

### Rep: Customers, Orders, Stock (`/rep/customers`, `/rep/orders`, `/rep/stock` and their record pages; U5, frames C_CUBase to C_ST3)
- Lists (C_CUBase, C_ORBase, C_STBase): the page header holds the page's own search (Customers "Search customers", Stock "Search SKU or item name") or the customer picker (Orders), the Filter button and the count ("6 customers", "23 orders", "62 items, stock at SLC, Ogden and Provo"). Each table has the gray header with `::` handles, the columns picker and per-user column prefs (`ui_table_prefs`: tables `customers`, `orders`, `stock`), and about one screen of rows then "Show N more" (Orders 10, Stock 9). No breakpoints (decision 43).
- Customers: Customer (name and account code), Rep (manager only), Terms, Open balance (of the credit limit), Last order, Orders, Quotes. Filter (C_CU1; C_RCU1 for a rep): Rep with counts (manager only), Terms (the terms on file, then Not on file), Open balance from and to, Only show Has open quotes (a Draft ready, Changes requested or Sent quote of the reader's), Over 80% of credit limit, Never ordered. Applied groups show as chips with "x" and Clear all (C_CU2); the badge counts groups. `?customer=` still narrows the list.
- Orders (read-only, ERP): Order (with "PO 7777, from Q-24816"), Customer, Rep (the customer's rep; manager only), Ordered, Fulfillment ("Delivery, SLC"), Status (Shipped green, Closed muted), Lines, Total. Filter (C_OR1): Rep (manager only), Status, Fulfillment, Branch, Ordered from and to. The picker loads `?customer=`.
- Stock: Item (SKU and pack), Category, List price, one column per branch, Total, and "Add to quote" on each row. Filter (C_ST1) replaces the category dropdown: Category with counts, In stock at, Only show Low stock (less than one full case at some branch, an open assumption) and On order, List price from and to. `?category=` starts the Filter on that category.
- Record pages (C_CU3, C_OR2, C_ST2): a header with the name and one facts line (the order number in Geist Mono with its status chip), then the main column and a 340px side column of cards with charcoal title bars. Detail tables have no filter and no columns picker. No breadcrumb.
- Add to quote (C_ST3), from a Stock row or the item page: the signed-in rep's own editable drafts (Draft ready, Changes requested; a manager only their own, decision 22), newest quote first, the first picked; Quantity (1 by default); "Add to Q-…" posts to `POST /api/rep/quotes/<number>/lines`, so the engine prices the line, then the quote opens. "Start a new quote" is drawn; no route starts a quote from Stock yet, so its button stays disabled (to ask).
- A rep sees the same layouts with their own customers, orders and drafts (U1).

### Workspace chooser (`/demo`)
- Moved unchanged from `/` to `/demo` (decision 53); the visitor box's Sign in opens it, and it shows even with a session, to switch workspaces. Choosing the customer opens `/`; a rep persona opens the rep portal.
- Rep personas: Brandi (manager), Mara (rep), Eli (rep) (F1; server personas in D1).

---

## 7. Team metrics (D3)

Cohort for rate metrics: quotes whose `created_at` falls in `[from, to)`, where the browser computes `from`/`to` at local midnight. Filtered to the selected reps (current owner `rep_id`) and teams (U7: a team counts its members and those of the teams inside it). Statuses use `effectiveStatus` at request time. Rates are `null` (shown "-") when the denominator is 0. Analytics (U6) groups the same metrics by rep, team (U7: team entities) or customer; only the grouping changes.

| Metric | Definition |
|---|---|
| Created | count of cohort quotes |
| Counts per status | per effective status; open quotes (`ready_for_review`, `sent`, `changes_requested`) split ok / amber / red |
| Quote-to-order rate | accepted ÷ created. `TODO(R-1)`: stand-in until accepted quotes create orders |
| Unaccepted rate | (declined + expired) ÷ created; open shown separately |
| Decided win rate | accepted ÷ (accepted + declined + expired) |
| Time to send | mean hours from `created_at` to the first `sent` activity, over cohort quotes ever sent |
| Customer response time | mean hours from each send to the next customer response (`accepted`, `changes_requested`, `declined` activity) |
| Time in each status | mean hours spent in `ready_for_review`, `sent`, `changes_requested` per visit, from the `quote_activity` timeline (open visits counted up to now) |
| Total quoted value | Σ latest sent revision total (or the live draft total if never sent) |
| Accepted value | Σ accepted quotes' latest revision total |
| Average quoted margin | mean of the existing quote margin (spec §5.2 GP fields) over priced cohort quotes |
| Freight recovered vs modelled cost | Σ (freight_recovery × qty) on accepted quotes vs Σ `modelled_freight_cents` on accepted delivery quotes |
| Decline reasons | count per reason; Other notes listed |
| Upsell suggestion acceptance | cohort quotes' lines with `added_by='suggestion'` ÷ pop-up suggestions offered for those quotes (count recorded on the pop-up). Rep-added "Suggested by Querent" lines (`added_by='upsell'`) are shown beside it as a count (OA-13) |

### 7.3 Why quotes went untouched (inferred, never typed)

Per rep, over cohort quotes:

| Reason | Rule |
|---|---|
| Draft never opened | `ready_for_review`, aging amber or red, `last_rep_touch_at` NULL |
| Draft opened but never sent | `ready_for_review`, aging amber or red, `last_rep_touch_at` set |
| Changes requested but never revised | `changes_requested`, aging amber or red |
| Sent but never opened | effective `sent`, aging amber or red, `customer_viewed_at` NULL or before `sent_at` |
| Sent and opened but no reply | effective `sent`, aging amber or red, `customer_viewed_at` ≥ `sent_at` |
| Expired with no response | effective `expired` |

All queries are live SQL in `src/server/repository/team.ts`; no materialised tables. Aggregation that needs the aging thresholds runs in TS over repository rows.

---

## 8. Roles, reassignment and scope (D1, D2)

- Roles `rep | manager` on `reps.role`. `Principal.role` stays `supplier_admin` for every supplier persona; a new `Principal.rep_role` (from the session persona, checked against `reps.role` in `managerRoute`) decides manager features (OA-12). Personas: `brandi` (manager), `mara` and `eli` (rep).
- Scope is purely role based on the server (U1; Appendix B of `docs/design/new-ui-implementation-prompt.md`): a rep reads only their own customers (`customer_rep`), those customers' orders, their own quotes (`quotes.rep_id`) and their own analytics (quote numbers from the quotes they own, chat-question numbers from their own customers; OA-67); a manager reads the whole organization. No request parameter widens it: the "Viewing" picker and the "My quotes / All reps" switch (`?scope=all`) are gone, and `?customer=` only narrows a page. Another rep's customer, order or quote reads as not found (404) for a rep. The manager still edits only her own quotes and opens other reps' read-only until she reassigns them (decision 22). The role switch is not built (decision 42).
- Deactivation: refused while any customer has the rep in `customer_rep`. Inactive reps cannot be chosen as a reassignment target, do not appear in the workspace chooser, and stay in Team history.
- Reassignment: `quotes.rep_id` becomes the new owner; `original_rep_id` keeps the first owner (set at creation, never changed). Open and closed quotes can both be moved. Each move writes `quote_activity` (`actor='rep'`, `actor_id`=manager, `kind='reassigned'`, "Brandi Gallegos reassigned Q-24817 from Mara Jensen to Eli Porter"). Reassigning a customer's rep (Settings) offers "Also move this customer's open quotes".
- Hierarchies and named groups: `TODO(R-12)`.

---

## 9. Chat log drawer (B1)

- Read via `quotes.conversation_id` from `messages` through a repository function `conversationMessages(conversationId, {before, limit:50})` plus `conversationMessageCount`.
- Only the owning rep and managers (after D2) can read it; everyone else gets 404.
- Rendering: customer messages emphasised (bold, left accent); assistant turns collapsed to one line (first line, ellipsis, click to expand); system/kind messages (item pop-up, quote ready) as one muted line. No AI summary.

---

## 10. Pop-up suggestions (E1)

- Candidate pool (server, cost-free path in `src/server/customer/suggestions.ts`): items from the existing co-occurrence and fastener rules, in the catalog, in stock at the chosen branch, not already in the cart. The rules are reached through a new cost-free function so `boundary.test.ts` stays green (customer code may not import the priced upsell service).
- Selection: live mode asks the LLM (customer-safe module only) to pick up to 3 from the pool and write a short reason in the chip style; scripted mode picks the first N deterministically with template reasons. The server drops any SKU not in the pool. If fewer than 2 candidates exist, show what exists.
- Payload: `{item_id, sku, description, pack, reason}`, no prices or costs.
- Add: qty 1, line `added_by='suggestion'` (migration 008). Offered suggestion count is recorded on the pop-up message payload so the Team acceptance rate has a denominator.

---

## 11. Secrets handling

- One real env file, `.env.local` (git-ignored). Committed `.env.example` with placeholders for `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `DATABASE_PATH`, `OILPRICEAPI_KEY`, `QUERENT_SEED_DATE`, `QUERENT_SCRIPTED`, `QUERENT_E2E_RESET`, `PORT`, and a `TODO(R-2)` comment about user secrets. `.env.example` is removed from `.gitignore`. `JEV_API_KEY` is never added.
- Keys are read server-side only, never logged, never returned by any route, never in tests. Tests use fakes and scripted LLM mode. A Vitest guard asserts `OILPRICEAPI_KEY` and `ANTHROPIC_API_KEY` appear only in the modules that read them and in `.env.example`.
- No outbound messaging is built.

---

## 12. Test plan

Each slice writes failing tests first, then implements.

| Area | Tests |
|---|---|
| Money helper | `toCents` (dollars, float-noise safe: 1.005 → 101), `roundCents` (fractional cents, half away from zero: 4212.857 → 4213, -0.5 → -1), `fromCents`; equality with the three replaced helpers on a table of values |
| Migrations | empty DB builds from 001…N; 001 matches the v4 fixture; v4 DB adoption; incompatible DB refused; failing migration rolls back and leaves `schema_migrations` unchanged; set-difference ordering; each rebuild keeps rows and FKs |
| Lifecycle | decline transition legal only from `sent`; final; labels; `quoteOutcome` |
| Decline API | reasons, Other length 250, no-reason decline, idempotency replay, 409 after expiry, customer response deep-scanned for cost and for the decline note |
| Aging | every threshold boundary, the expiry rule, worse-level-wins, final statuses null, settings overrides |
| Chat drawer | paging (50, `before` cursor), count, owner-only access, manager access after D2 |
| Cost model | worked example (4213¢), stop time, zero fuel price, diesel manual/$0 |
| Pool | eligibility filter, cold start (<20), cap, ramp steps at day 0/29/30/60/200, daily cache |
| Allocation | decision-log example (+32¢/+968¢), qty > 1 rounding, all-zero margin, contract exempt, per-line cap, remainder tie, override drops recovery |
| Freight line | free delivery on → $0 with radius rule kept; off → unchanged |
| Fuel client | fake source; once per state per day; failure → last price; stale > 14 days warning; none → manual required; manual wins; key never in output or logs |
| Impact preview | counts and per-category averages on fixture quotes; enable refused without preview |
| Roles | manager-only routes 403 for reps; deactivate blocked with customers; personas |
| Reassignment | single/bulk, activity rows, `original_rep_id`, customer move with checkbox, read-only enforcement on every write route |
| Team metrics | each metric on a fixed fixture, null denominators, window boundaries, CSV |
| Suggestions | pool filter (stock, cart, catalog), LLM output validated against pool, scripted determinism, payload has no price-like field, `added_by='suggestion'` |
| Boundary | `boundary.test.ts` and `customer.test.ts` stay green; new customer exports added to the cost scan |
| TODO registry | every `TODO(R-n)` in `src/` exists in `docs/todo-registry.md` |
| Playwright | `e2e/decline.spec.ts` (A1), `e2e/rep-aging.spec.ts` (A2), `e2e/chat-drawer.spec.ts` (B1), `e2e/free-delivery.spec.ts` (C3), `e2e/rep-roles.spec.ts` (D1), `e2e/rep-reassign.spec.ts` (D2), `e2e/rep-analytics.spec.ts` (D3's dashboard checks, moved there in U7), `e2e/rep-teams.spec.ts` and `e2e/frames-teams.spec.ts` (U7), `e2e/popup-suggestions.spec.ts` (E1), `e2e/demo-script.spec.ts` (F1); existing specs stay green |
