# ERP Integration Readiness

Querent v2 (Query to Quote), task 7.2. This covers how the finished MVP code handles ERP data today and what has to change to connect a real ERP. It goes deep on **Epicor Prophet 21 (P21) + Epicor WMS**, and covers **Epicor Eclipse**, **Infor Distribution FACTS** and **TIMS (Computers Unlimited)** more briefly.

- Code baseline: `main` at `7b09f06` (schema v3). Spec: Notion "Querent v2: Query to Quote" §6 (<https://app.notion.com/p/3e7afa1db504810fbbddc37175014ead>).
- Written 2026-09-27. This file is the source of record. The Notion page "ERP Integration Readiness" is a short companion that links here, because the Notion workspace goes read-only for new content after 2026-09-29.

## How to read the evidence column

Every mapping row and every claim about a vendor API carries one of these labels:

| Label | Meaning |
|---|---|
| **Repo** | Checked in this repository at `7b09f06`. The file path is given. |
| **Search [Sx]** | A web search result for the linked public page reported this. **The page itself could not be opened from the build environment.** The network proxy blocked every vendor, partner and forum domain tried (list in §10), so only the search engine's excerpt was read. Treat the fact as a strong lead and confirm it before building on it. |
| **Unverified** | No public source was found, or the only source is the spec's own research notes. **Confirm with the vendor or the customer.** |
| **Querent design** | A recommendation from this document, not a vendor fact. |

P21's own API reference is served by each customer's P21 middleware (for example `https://{middleware}/docs/V2API.aspx`, Search [S4]), so it is not public. The authoritative check for every P21 field below is **Herrick's own middleware docs page and service definitions**.

---

## 1. Summary

- **The seams in the spec exist in code.** Thirteen ERP-sourced tables carry `source`, `external_id` and `synced_at`, with a unique `(source, external_id)` index. All SQL lives in `src/server/repository/`. The seven chat tools read only the customer-safe repository. Freight distance sits behind a `DistanceProvider` interface. (Repo, §2.)
- **Recommended shape (Querent design):**
  1. **Sync**: poll-and-upsert into the existing SQLite tables for reference data, customers, items, stock and order history.
  2. **Live calls**: only for the customer price and availability when a quote is drafted (step 5) and re-checked before send (step 7).
  3. **Write-back**: an outbox that turns an accepted quote into an ERP sales order (step 9).
- **Code changes a real integration needs:**
  - an ERP adapter module and a sync worker;
  - an async seam for live price and availability, because the repository, the chat tools and the quote intake are synchronous today (§2.11);
  - schema v4: an ERP order reference on quotes, multiple ship-tos, geocodes for ship-tos and branches, an outbox table, and possibly a cross-reference table for CRM IDs;
  - a real sync status to replace the simulated heartbeat.
- **Biggest unknowns:** Herrick's P21 version and middleware URL, how Querent reaches that middleware over the network, API licensing, the exact price and availability endpoint and whether it takes several items per call, the cost basis for margin, whether quotes should also exist in P21, and whether Epicor WMS changes what "available" means. See the open questions in §4.12.

---

## 2. Current implementation (what the code does today)

### 2.1 Data store

- A local SQLite file (`./data/querent.sqlite`, or `DATABASE_PATH`) opened by `better-sqlite3` in `src/server/db/index.ts`. It is seeded on first open. (Repo)
- `SCHEMA_VERSION=3` in `src/server/db/schema.ts`. There are no migrations. An older database refuses to open, and `npm run db:reset` rebuilds and reseeds it (spec §6.6). (Repo)
- There is one supplier per deployment (`suppliers` table) and no multi-tenancy (spec §1). (Repo)

### 2.2 ERP-sourced tables and the sync-ready columns

`ERP_SOURCED_TABLES` in `src/server/db/schema.ts` lists 13 tables. Each one gets:

- `source TEXT NOT NULL DEFAULT 'seed'`
- `external_id TEXT`
- `synced_at TEXT`
- `CREATE UNIQUE INDEX <table>_external ON <table>(source, external_id)`

In the seed, every row has `source='seed'`, a readable `external_id`, and `synced_at` set to the seed day at 12:00 (`src/server/db/seed/reference.ts`, `history.ts`, `insert.ts`). (Repo)

| Table | Holds | Seed `external_id` | Read by (repository) |
|---|---|---|---|
| `branches` | code, name, address, lat/lng, will-call phone and hours | branch code (`SLC`) | `catalog.ts` `branches`, `branch` |
| `product_categories` | the 6 Querent categories | category id | `catalog.ts` `productCategories` |
| `items` | sku, description, category, pack, case_qty, **cost**, list_price, keywords | SKU | `catalog.ts` `catalogItems`, `catalogItem`, `costedItems`, `costedItem`, `searchItems` |
| `branch_stock` | available, on_order, next_receipt_on per item and branch | `SKU@BRANCH` | `catalog.ts` `stockForItems` |
| `price_levels` | customer price levels | level code | via `pricing.ts` |
| `customer_prices` | unit price per level and item | `LEVEL:SKU` | `pricing.ts` `customerPrices`, `priceSources` |
| `contracts` | customer contracts with start and end dates | contract number | `pricing.ts` `contracts`, `customerPrices` |
| `contract_lines` | contract price per item | `CONTRACT:SKU` | `pricing.ts` |
| `customers` | account, terms, credit, balances, tax, price level, **one** ship-to with lat/lng | account number | `accounts.ts` `customerAccount`, `accountSummary`, `deliveryAddress`, `customers`, `customerDirectory` |
| `contacts` | customer contacts | `ACCOUNT:contact-id` | `accounts.ts` `contacts`, `contact` |
| `reps` | sales reps | `REP-<initials>` | `accounts.ts` `reps`, `rep`, `assignedRep` |
| `orders` | order header, status, fulfillment, branch, shipment, totals, `quote_id` | order number | `orders.ts` (all functions), `accounts.ts` `customerStats` |
| `order_lines` | line, item, qty, unit_price, **unit_cost** | `ORDER:line` | `orders.ts`, `pricing.ts` `lastPaid`, `priceSources` |

Details that matter for a sync:

- **Local ids are not ERP ids.** Foreign keys use local `id` columns (for example `quote_lines.item_id REFERENCES items(id)`). The seed happens to use the SKU as `items.id`, but a sync must resolve each foreign key through `(source, external_id)` and must not assume local id = ERP id. (Repo: `schema.ts`, `seed/reference.ts`)
- **Querent-created rows** leave `external_id` NULL. SQLite treats NULLs as distinct in a unique index, so they never collide. (Repo: `schema.ts`)
- **Business keys are also unique:** `items.sku`, `customers.account_number`, `branches.code`, `contracts.contract_number`, `orders.order_number`. A sync that renames a SKU in the ERP has to update in place. (Repo: `schema.ts`)
- **Nothing outside the seed writes to these 13 tables.** A grep for INSERT, UPDATE or DELETE on them in `src/server/repository/*.ts` finds nothing. The sync job would be their only writer. (Repo)

### 2.3 Querent-owned tables (never synced)

`suppliers`, `settings`, `customer_rep` (one rep per customer, edited in Settings > Rep assignments), `rep_category_floors`, `departments`, `delivery_rates`, `quotes`, `quote_lines`, `quote_removed_lines`, `quote_revisions`, `quote_activity`, `quote_notes`, `conversations`, `messages`, `query_logs`, `access`, `sync_events` and `meta`. (Repo: `src/server/db/schema.ts`)

Two decisions are needed at integration time:

- Does `customer_rep` come from the ERP's salesrep on the customer, or stay Querent-owned? Today Settings writes it with `setAssignedRep` in `accounts.ts`.
- Are the `departments` contacts (Customer Service, A/R, will-call phones) kept by hand in Querent?

### 2.4 Repository layer

- `src/server/repository/index.ts` is the **internal** barrel, which can return cost and margin. `src/server/repository/customer.ts` is the **customer-safe** barrel, which never does. (Repo)
- `src/server/repository/sql.ts` holds the only statement helpers (`one`, `all`, `run`, `scalar`, `inTransaction`). They are all **synchronous** (better-sqlite3). (Repo)
- `src/server/repository/boundary.test.ts` fails the build in these cases (Repo):
  - SQL appears outside the repository;
  - a customer route or chat code imports the internal barrel;
  - chat code imports a service that reads cost.

  An ERP adapter that talks HTTP instead of SQL fits under the same rule: put it behind repository-shaped functions.
- `src/server/repository/erp.ts` is the ERP status module today (Repo):
  - `demoDatabase()` returns the seed date, schema version, record counts, and the newest `synced_at` across customers, items, branch_stock, customer_prices, contracts and orders.
  - `events()` returns recent `sync_events` rows.
  - `heartbeat()` inserts a row.

### 2.5 LLM chat tools

The tools are defined in `src/server/chat/tools.ts`, and their schemas and dispatcher in `src/server/chat/definitions.ts`.

- Live mode uses the model in `ANTHROPIC_MODEL`, and the default is set in `src/server/chat/live.ts`. Scripted mode calls the same handlers.
- Every tool is wrapped by `gated()`, so a turned-off information category is refused on the server.
- The tools import only `@/server/repository/customer`.

(Repo)

| Tool | Gate (category) | Repository functions | ERP data behind it | Sync or live (Querent design) |
|---|---|---|---|---|
| `search_items` | items_stock | `catalogItems`, `purchasedItems` (when Orders & quotes is on); scoring in `src/server/matching` | item master, order history | synced |
| `get_stock` | items_stock | `catalogItem`, `stockForItems` | stock by branch | synced; live is optional |
| `get_price` | pricing | `customerPrices` (contract, then price level, then list) | customer pricing, contracts | synced, or live via the ERP price engine (§4.7) |
| `get_order_history` | orders_quotes | `orderHistory` (unit price only when Pricing is on) | order lines | synced |
| `get_order_status` | orders_quotes | `orderStatus`, `customerQuote` | order header and shipments; quotes are Querent's | synced |
| `get_account_summary` | account | `accountSummary` | terms, credit limit, balances | synced (A/R can go stale; see §4.9) |
| `propose_cart` | items_stock | `branches`, `catalogItem` | item master, branches | synced |

### 2.6 Pricing

- `src/server/pricing/engine.ts` is pure. It picks a suggestion from these bases: `contract`, `customer`, `list`, `last_paid` (12 months), and `custom` (rep-entered). The rules are:
  - broken case moves the suggestion to list;
  - scarcity adds an uplift and is off by default;
  - the suggestion is capped at list;
  - the margin floor check uses `src/server/floors`.

  (Repo)
- `src/server/pricing/service.ts` `priceLines()` loads `priceSources()`, `stockForItems()`, the rep's floors and the scarcity setting, then prices each line. This happens synchronously. (Repo)
- `src/server/intake/quote-request.ts` `requestQuote()` runs Request quote (step 5): it calls `priceLines()` and `createQuote()` **inside one synchronous SQLite transaction**. (Repo)
- ERP impact: margin needs `items.cost` and `order_lines.unit_cost`. Which ERP cost to use (average, replacement, standard) is a business decision. **Unverified: confirm with the customer.**

### 2.7 Quotes and the step 8/9 boundary

- The state machine is in `src/server/quotes/lifecycle.ts`: ready_for_review → sent → accepted, or changes_requested, or expired. (Repo)
- The services are in `src/server/quotes/service.ts`:
  - `sendQuote` stores a frozen `quote_revisions.snapshot` (built in `src/server/quotes/snapshot.ts`), posts the chat message and logs Activity.
  - `acceptQuote` sets `accepted` with `fulfillment_time` and `customer_po`, flags the rep and logs Activity. **Acceptance ends the MVP.** Step 9 (write the order to the ERP) is out of scope (spec §1).

  (Repo)
- `orders.quote_id` exists, so a won quote can be linked to the order that came from it. **`quotes` has no column for an ERP order or quote number.** (Repo: `schema.ts`)
- The rep's ⋯ menu shows "Open customer in ERP" disabled, with the tooltip "Available after ERP integration" (`src/components/rep/quote-detail/more-menu/MoreMenu.tsx`). (Repo)

### 2.8 Freight and `DistanceProvider`

- `src/server/freight/distance.ts` defines the interface `DistanceProvider { roadMiles(from, to): Promise<number|null> }`. It is async so that a routing API can replace the MVP's `HaversineRoadFactorProvider` (straight-line miles × 1.25, rounded to 0.1). (Repo)
- `freightForQuote()` in `src/server/freight/quote.ts` takes `{provider}`, and so do `sendCheck` and `sendQuote`. Rates come from the Querent-owned `delivery_rates` table. (Repo)
- ERP impact: the haversine provider needs `lat`/`lng` at both ends. Querent stores them on `branches` and on the customer's single ship-to. Whether P21 stores coordinates on addresses is **Unverified**. Plan to geocode addresses during sync, or switch to a routing provider that takes addresses. (Querent design)

### 2.9 Settings > Data sources and the heartbeat

- `src/components/rep/settings/DataSources.tsx` shows two cards (Repo):
  - "Demo database": the seed date, record counts, "ERP records synced" (the newest `synced_at`) and the schema version, with a "Sample data" pill.
  - "Herrick Industrial Supply ERP": "Connected", or "Update delayed" when the last `sync_events` row is 120 s old or older, plus the last 5 syncs.
- Its data comes from `dataSources()` in `src/server/rep/settings.ts` and `GET /api/rep/settings/sources`. (Repo)
- **The connection is simulated.** `ensureHeartbeat()` in `src/server/heartbeat.ts` runs every 60 s once any of these has been hit: the Settings page (`src/app/rep/settings/page.tsx`), the Settings API routes, or the chat query route (`src/app/api/query/[...path]/route.ts`). It calls `heartbeat()`, which writes "ERP connection refreshed" into `sync_events`. No ERP is contacted. (Repo)

### 2.10 What is demo-only

| Demo-only today | Where | What a real integration needs |
|---|---|---|
| All ERP data is seed data (`source='seed'`) | `src/server/db/seed/*` | A sync job writes `source='p21'` (or similar) rows. A production tenant starts with no demo rows. |
| "ERP connection refreshed" heartbeat | `src/server/heartbeat.ts`, `repository/erp.ts` | Real sync runs write real events (entity, rows upserted, errors, watermark). "Connected" should reflect the last successful ERP call. |
| One ship-to per customer, with lat/lng | `customers.ship_to_*` | ERPs usually hold many ship-tos per customer: a `ship_tos` table plus a ship-to picker. |
| Freight by haversine × 1.25 and seeded rates | `freight/distance.ts`, `delivery_rates` | A routing `DistanceProvider`. Confirm whether the ERP or a carrier system owns freight rules. |
| Prices from `price_levels`/`customer_prices` | `repository/pricing.ts` | ERP price engines (P21 price pages, libraries and contracts) are richer than one price per level. Prefer the ERP's computed price (§4.7). |
| Cost from `items.cost` | `schema.ts` | Pick an ERP cost basis. |
| Accepted quote stops at `accepted` | `quotes/service.ts` `acceptQuote` | Step 9 outbox and write-back (§4.10). |
| "Open customer in ERP" disabled | `MoreMenu.tsx` | A deep link into the ERP client. Whether P21 supports one is Unverified. |
| Persona chooser, no auth | README "Security boundary" | Real auth and customer identity mapped to the ERP customer id and contact. |
| Scripted chat | `src/server/chat/scripted.ts` | None. Scripted mode stays for CI. |

### 2.11 Constraints a real integration must respect

1. **Synchronous core.** Repository calls, `priceLines()`, `requestQuote()` and every chat tool (`ToolResult<T>`, not a Promise) are synchronous. A live ERP call cannot go inside them without an async refactor. Querent design: fetch live data **before** the transaction (for example, an async `prefetchPrices(customer, items, branch)` in the route), then pass it into the synchronous pricing code. Or keep the data synced so nothing changes.
2. **Identity.** Resolve every foreign key through `(source, external_id)` (§2.2).
3. **The customer-safe boundary.** The ERP adapter must not hand cost to chat tools. Keep cost-bearing reads in internal repository functions.
4. **No migrations.** Schema v4 for the integration will reseed. That is fine before go-live and needs a migration story after.

---

## 3. Target architecture (ERP-agnostic, Querent design)

| Piece | Responsibility | Where it would live |
|---|---|---|
| ERP adapter (one per ERP) | auth and token cache; `pull(entity, since)`; `priceAndAvailability(customer, lines, branch)`; `createOrder(acceptedQuote)`; optional `createQuote` | `src/server/erp/<vendor>/` (new), called only by the sync worker and repository-shaped functions |
| Sync worker | per-entity watermarks; upsert by `(source, external_id)`; resolve foreign keys; set `synced_at`; write `sync_events`; periodic full reconcile for deletes | a separate process or interval, never inside a request |
| Live price and availability | async prefetch before the step-5 intake transaction and before send; short cache | a route or service layer, then the pure pricing engine |
| Outbox (step 9) | durable queue of accepted quotes to write back; idempotency key; retries; last error | new `erp_outbox` table (schema v4) and a worker |
| Tenant config | ERP kind, base URL, credentials (env or secret store, **never** in the DB or this doc) | environment per deployment (one supplier per deployment today) |

---

## 4. Epicor Prophet 21 + Epicor WMS

### 4.1 What is public

- P21's APIs run on each customer's self-hosted **P21 middleware**. Search [S1] reports there is no public developer portal or sandbox.
- Per-instance docs are at `https://{middleware}/docs/V2API.aspx` (Search [S4]).
- The spec also points to an unofficial community repository. It was **not used**: it was out of bounds for this session.
- Everything below must be confirmed against Herrick's middleware.

### 4.2 API families

| Family | What it is for | Path | Evidence |
|---|---|---|---|
| Data Services (OData) | read-only queries over P21 views and tables, JSON or XML | base path Unverified. The spec notes "OData read views". Search excerpts point to an `/odataservice/odata/...` base and suggest views and tables may use different endpoints. Confirm on the middleware. | Search [S4] (purpose); path Unverified |
| Transaction API (v2) | stateless create, retrieve and update that mimics a P21 window (for example Order Entry) | `POST /uiserver0/api/V2/Transaction` with a body holding `Name` (for example `"Order"`), `UseCodeValues`, `IgnoreDisabled` and a `Transactions` array | Search [S4], [S6] |
| Entity / REST | fit-for-purpose REST endpoints (items, customers, inventory) | Unverified | Search [S1] (existence) |
| Interactive API | stateful sessions that drive P21 windows | Unverified | Search [S1] (existence) |
| Scope | 300+ services over SOAP and REST; get, insert and update for sales orders, service orders and POs | n/a | Search [S5] |
| Webhooks | none reported; integrators poll | n/a | Search [S1], [S10] (polling on `date_last_modified`); a "no webhooks" statement in vendor docs was not found, so Unverified |

### 4.3 Auth: token v2 and consumer keys

| Fact | Evidence |
|---|---|
| Token endpoint `POST /api/security/token/v2`, with either user credentials or a client-credentials style consumer key | Search [S1]; also the spec's research notes |
| Consumer keys are created on the middleware's API Console page, and their permissions are scope-driven. User-credential tokens need a separate two-step authorization. | Search [S1]–[S3] |
| Tokens from consumer keys are reported as very long-lived; password tokens as about 24 h. After a scope change, mint a new token, because a cached token keeps the old scope. | Search [S1]; exact lifetimes Unverified |
| No OAuth authorization-code flow | Search [S1] |
| Querent design: use **one consumer key per tenant**, scoped to exactly the services in §4.8 to §4.10. Keep it in the deployment's secret store, cache the token, and re-mint on 401. | Querent design |

### 4.4 Per-tenant middleware URL

- Each P21 customer has its own middleware host and port. Search [S1]–[S3] reports the P21 client resolves them at login. Querent needs `P21_BASE_URL` per deployment. (Querent design)
- **The network path is the open problem.** The middleware is customer-hosted (Search [S1]), and Querent runs on Railway. Herrick must expose the middleware over HTTPS through one of these (**Unverified**, a customer decision):
  - an IP allowlist;
  - a reverse proxy;
  - a VPN or tunnel.
- If Herrick is on Epicor-hosted P21 cloud, the URL and allowlisting come from Epicor. Whether that applies is **Unverified**.

### 4.5 OData reads (sync)

- **Tables named in public sources** (Search [S11], [S12]):
  - `inv_mast` (items): `item_id`, `item_desc`, `product_group_id`
  - `inv_loc` (item by location): `location_id`, `qty_on_hand`, `qty_allocated`, `reorder_point`
  - `customer` and `address`
  - `oe_hdr` (order header): `order_no`, `customer_id`, `order_date`, `po_no`, `ship_to_address_id`
  - `oe_line` (order lines): `line_no`, `item_id`, `qty_ordered`, `qty_shipped`, `unit_price`
- P21 ships many pre-built SQL views (Search [S12]). Whether OData exposes views, tables or both on Herrick's version is **Unverified**.
- **Quotes:** the spec's notes say P21 quotes are `oe_hdr` rows with `projected_order='Y'`. No public source confirming this was found, so it is **Unverified**. P21 does have quotes that convert to orders in the UI (Search [S16]).
- **Change tracking:** a public connector's order-history job looks back 5 days on `date_last_modified`, deletes the synced lines and repopulates them (Search [S10], [S17]). Whether `date_last_modified` exists on every table listed above is **Unverified**.

### 4.6 Transaction API: Quote and Order services

- `POST /uiserver0/api/V2/Transaction` with `Name: "Order"` creates a sales order (Search [S6]). A `Quote` service name comes from the spec's notes only: **Unverified**.
- The Transaction API may answer with P21 window messages that need a response. A forum thread covers "responding to messages in the Transaction API" (Search [S6]). The write-back must treat any unexpected message as a failure for the rep to review, never auto-confirm it. (Querent design)
- **Field names for the order header and lines** (customer, ship-to, PO, location, required date, item, qty, unit price, freight): **Unverified.** Get the service definition from Herrick's middleware.
- One public connector notes that P21's "Order Submit API does not dynamically create the order", so it runs a batch step that finds web orders and updates them before the order-history sync (Search [S9]). Plan for a delay between submit and the order appearing in OData.

### 4.7 Price and availability

- Public sources report a price calculation endpoint that takes customer, item and quantity and returns P21's authoritative price. It is reported as `api/inventory/v2/parts/prices` (Search [S7], [S8]).
- The spec's notes give `/api/inventory/parts/{id}/v2/price` instead. **The two paths disagree. Unverified:** check on the middleware, including whether it takes several items per call, ship-to, location and unit of measure.
- A public connector runs pricing, inventory and A/R summary as **real-time API calls**, and offers a scheduled "Inventory Refresh" job for sites that don't use real-time inventory (Search [S9]).
- Querent design:
  - **Step 5 (Request quote):** prefetch the P21 price for each line (async, before `requestQuote`'s transaction). Pass it to the pricing engine as the `customer` basis. Keep `contract`, `list` and `last_paid` from synced data so "Why this price?" still works.
  - **`get_price` in chat:** use synced prices, or the same prefetch with a short cache.
  - **Availability:** use synced `branch_stock`, re-checked live for quote lines before send (§8).

### 4.8 Field mapping: Querent `table.column` → P21

Direction: **←** P21 to Querent (sync or live); **→** Querent to P21 (write-back).

| Querent `table.column` | P21 source | Dir | Evidence |
|---|---|---|---|
| `items.external_id`, `items.sku` | `inv_mast.item_id` | ← | Search [S11] |
| `items.description` | `inv_mast.item_desc` | ← | Search [S11] |
| `items.category_id` → `product_categories` | `inv_mast.product_group_id`, mapped to Querent's 6 categories by a Querent-owned table | ← | Search [S11] (column); mapping is Querent design |
| `items.pack`, `items.case_qty` | item sales unit of measure and unit size | ← | Unverified |
| `items.list_price` | item list price field | ← | Unverified |
| `items.cost` | cost at location, basis to choose | ← | Unverified: confirm with the customer |
| `items.keywords` | none; Querent-owned search words (could seed from extended description) | n/a | Repo: `schema.ts` |
| `branches.external_id`, `branches.code` | `inv_loc.location_id` and the location master | ← | Search [S12] (column); location master table Unverified |
| `branches.address`, `city`, `state`, `zip` | location address | ← | Unverified |
| `branches.lat`, `lng` | none known; geocode during sync | n/a | Unverified |
| `branches.will_call_phone`, `will_call_hours` | Querent-owned unless P21 holds them | n/a | Unverified |
| `branch_stock.available` | `inv_loc.qty_on_hand − inv_loc.qty_allocated`, or the live availability call | ← | Search [S12] (columns); the formula is Unverified |
| `branch_stock.on_order`, `next_receipt_on` | open PO qty and expected date | ← | Unverified |
| `price_levels`, `customer_prices` | P21 sales price pages, books and libraries assigned on the customer's pricing tab. **Not 1:1**: prefer the live price call. | ← | Search [S13], [S14] (concepts); tables Unverified |
| `contracts`, `contract_lines` | P21 job/contract pricing (price or source × multiplier; start and end dates) | ← | Search [S13]; tables Unverified |
| `customers.external_id`, `account_number` | `customer.customer_id` (also `oe_hdr.customer_id`) | ← | Search [S11] |
| `customers.name` | customer name field | ← | Unverified |
| `customers.terms` | A/R payment terms code (a public connector syncs terms in its Code Tables job) | ← | Search [S9] |
| `customers.credit_limit`, `open_balance`, `past_due_balance` | A/R summary (a public connector reads it in real time) | ← | Search [S9]; fields Unverified |
| `customers.tax_status`, `tax_state` | tax exemption and jurisdiction | ← | Unverified |
| `customers.price_level_id` | customer pricing method or library | ← | Search [S14] (concept) |
| `customers.ship_to_*` | ship-to records and `address` (`oe_hdr.ship_to_address_id` points at one). P21 has many per customer; Querent stores one. | ← | Search [S11]; the one-to-many gap is Repo (`schema.ts`) |
| `customers.ship_to_lat`, `ship_to_lng` | none known; geocode | n/a | Unverified |
| `contacts.*` | customer contacts | ← | Unverified |
| `reps.*` | sales reps (a public connector syncs them in Code Tables) | ← | Search [S9]; fields Unverified |
| `customer_rep.rep_id` | the customer's salesrep, if Herrick wants the ERP to own it (§2.3) | ← | Unverified |
| `orders.external_id`, `order_number` | `oe_hdr.order_no` | ← | Search [S11] |
| `orders.customer_id` | `oe_hdr.customer_id` | ← | Search [S11] |
| `orders.order_date` | `oe_hdr.order_date` | ← | Search [S11] |
| `orders.po_number` | `oe_hdr.po_no` | ← | Search [S11] |
| `orders.status` (`open`, `shipped`, `closed`) | derived from order completion, shipment and invoice state | ← | Unverified |
| `orders.fulfillment` (`will_call`, `delivery`) | ship method or carrier (will call vs ship) | ← | Unverified |
| `orders.branch_id` | order location | ← | Unverified |
| `orders.shipped_on`, `tracking_number` | shipment history (a public connector syncs shipments) | ← | Search [S10]; fields Unverified |
| `orders.subtotal`, `freight`, `tax`, `total` | invoice or order totals | ← | Unverified |
| `orders.quote_id` | set by Querent when the order came from a Querent quote (§4.10) | n/a | Repo: `schema.ts` |
| `order_lines.line_no`, `item_id`, `qty`, `unit_price` | `oe_line.line_no`, `item_id`, `qty_ordered` (or `qty_shipped`), `unit_price` | ← | Search [S11] |
| `order_lines.unit_cost` | line cost | ← | Unverified |
| every `synced_at` | when Querent's sync wrote the row. The watermark is P21 `date_last_modified`. | ← | Search [S10] (watermark) |
| `quotes.customer_id` → customer | Order header customer | → | Transaction API Search [S6]; field Unverified |
| `quotes.customer_po` → PO | Order header PO number | → | Unverified |
| `quotes.branch_id` → location | Order header sales or source location | → | Unverified |
| `quotes.fulfillment`, `ship_to_*` → ship-to or will call | Order header ship-to id and ship method | → | Unverified |
| `quotes.fulfillment_time` → required date | Order header required or promise date | → | Unverified |
| `quote_revisions.snapshot.lines[]` → lines | Order lines: item id, qty, unit price (a price override) | → | Unverified |
| `quote_revisions.snapshot.freight` → freight | Order freight or other charge | → | Unverified |
| `quotes.quote_number`, `revision` → reference | a header reference or notes field that carries "Q-24817 rev 2" for idempotency | → | Unverified |

### 4.9 Sync jobs and polling on `date_last_modified` (Querent design)

Cadences are proposals. Watermarks use P21 `date_last_modified` wherever the table has it (Unverified per table).

| Job | Querent tables | P21 source | Cadence | Notes |
|---|---|---|---|---|
| Reference | `branches`, `product_categories`, `reps` | locations, product groups, salesreps, terms (like a Code Tables job, Search [S9]) | nightly and on demand | full refresh (small tables) |
| Items | `items` | `inv_mast` (and unit-of-measure data) | every 15 min, full nightly | resolve category through the Querent mapping table |
| Stock | `branch_stock` | `inv_loc`, open POs | every 5 min, or live | the value comes from P21, not from Querent arithmetic (§8) |
| Customers | `customers`, `contacts`, future `ship_tos` | `customer`, `address`, ship-tos, contacts | every 15 min | geocode new or changed addresses |
| A/R | `customers.credit_limit`, `open_balance`, `past_due_balance` | A/R summary | every 15 min, or live on the rep's Customer panel | the credit bar depends on it |
| Pricing | `contracts`, `contract_lines`, `price_levels`, `customer_prices` | job/contract pricing, price pages | nightly | the live price call wins at quote time |
| Orders | `orders`, `order_lines` | `oe_hdr`, `oe_line`, shipments, invoices | every 15 min | 5-day overlap window, replace lines per order (pattern from Search [S10]) |
| Reconcile | all of the above | full key lists | nightly | polling misses deletes and inactivations; mark those rows inactive |

Every run writes `sync_events` with the entity, rows upserted, errors and the new watermark. It replaces the simulated heartbeat (§2.9).

### 4.10 Step 9 write-back path (Querent design)

1. **Trigger.** `acceptQuote()` (`src/server/quotes/service.ts`) commits `accepted` in one SQLite transaction. In that **same** transaction, insert an `erp_outbox` row. The row holds quote id, revision, kind `create_order`, status `pending`, and idempotency key `quote_number + rev`. Never call P21 inside the transaction.
2. **Build.** A worker reads the accepted revision's frozen `quote_revisions.snapshot`. That is exactly what the customer saw and accepted, so prices can't drift. It adds `customer_po`, `fulfillment_time`, `branch_id`, `fulfillment` and the ship-to from `quotes`.
3. **Map ids.** Convert items, customer, branch and ship-to to P21 ids through `external_id`. If any of them has no external id, fail with a clear error for the rep.
4. **De-duplicate.** Before any retry, query `oe_hdr` for an order with the same customer and PO, or the Querent reference (§4.8, last row). Which field can hold that reference is Unverified.
5. **Submit.** `POST /uiserver0/api/V2/Transaction` with `Name: "Order"` (Search [S6]). An unexpected P21 message counts as a failure (§4.6).
6. **Record.** Store the returned order number in a new column, `quotes.erp_order_number` (schema v4). Add an Activity entry ("Order SO-… created in P21") and a rep badge.
7. **Link.** When the order sync picks up the `oe_hdr` row, set `orders.quote_id` by matching `erp_order_number`. `src/server/repository/orders.ts` already joins `orders.quote_id` to show the quote number on an order (`get_order_status`, the rep's Orders views). Analytics win rate reads quote statuses, not orders (`src/server/repository/analytics.ts`).
8. **Failure.** Retry with backoff on network errors only. Validation errors go to the rep, and Settings > Data sources shows outbox failures.
9. **Option (open question).** Create a **P21 quote** at step 7 (send) and convert it to an order on accept. P21 supports conversion in the UI (Search [S16]); API support is Unverified. Choose this only if Herrick's reps must see Querent quotes inside P21.

### 4.11 Epicor WMS

- Epicor WMS is built to integrate with P21. It covers receiving, cross-docking, put-away, picking, cycle counting, bins, license plating and RF/wireless (Search [S15]).
- Querent design: Querent works per branch and never needs bins or license plates. WMS transactions update P21 inventory, so **read availability from P21**, not from WMS. That assumption is **Unverified**: confirm that WMS posts back to `inv_loc` promptly, and whether quarantined, staged or RF-bin stock is excluded from P21's available quantity.
- A WMS API for Querent: none needed and none researched.

### 4.12 Open questions for P21 (ask Herrick or Epicor)

1. The P21 version, and whether it is on-premises or Epicor-hosted. The middleware base URL for test and production.
2. The network path from Railway to the middleware: allowlist, proxy or VPN.
3. API licensing, and who creates the consumer key and its scopes.
4. OData: views, tables or both? Which ones carry `date_last_modified`?
5. Quotes: are they `oe_hdr` with `projected_order='Y'`? Should Querent quotes exist in P21 at all?
6. The price endpoint's exact path and inputs (ship-to, location, UOM, qty). Does it take several items per call? What are its latency and rate limits?
7. Availability: which quantity is "available" in P21 (on hand minus allocated, or something else)? Does Epicor WMS change it?
8. The cost basis for margin and floors.
9. The Order transaction's required fields. Where can the Querent reference be stored? How are will-call vs delivery and freight entered?
10. Should reps and the customer-rep assignment come from P21?
11. Can the P21 web client be deep-linked for "Open customer in ERP"?
12. Delete and inactivation semantics for items, customers and ship-tos.

---

## 5. Epicor Eclipse

- Eclipse has an **Eclipse API**: a REST integration layer on a .NET Core engine. It supports get, insert and update for selected Eclipse business logic, with endpoints that mirror business objects: products, pricing, documents, customers, inventory and shipping (Search [E1]). An older XML "web integration" path for product and customer queries is also reported (Search [E2]).
- Querent would plug in the same way as P21:
  - sync products, customers and inventory into the ERP-sourced tables;
  - call Eclipse pricing live at step 5;
  - write accepted quotes back as orders.
- **Unverified; confirm with Epicor or the customer:** auth, change tracking or webhooks, whether quotes are writable, the field-level mapping, and hosting.

---

## 6. Infor Distribution FACTS

### 6.1 Status

- Infor Distribution FACTS is reported as **no longer sold** (support continues). The suggested replacements are CloudSuite Distribution or CloudSuite Industrial (Search [F1]).
- Querent design: before building, confirm the prospect's migration plan. The integration target may really be CloudSuite.

### 6.2 API surface

| Fact | Evidence |
|---|---|
| FACTS has a configuration guide for Infor OS. It supports REST/API through IMS web services, with connection points set up for either the inbox/outbox or the REST/API IMS method. | Search [F2] |
| Infor ION moves BODs (Business Object Documents) between applications through connection points modelled in ION Desk | Search [F3] |
| The ION API Gateway is the API front end: it applies throttling and security policies and forwards to back-end services | Search [F4] |
| OAuth 2.0 credentials come as an `.ionapi` file downloaded from ION API. This is documented for Infor LN; that it applies to FACTS is **Unverified**. | Search [F7] |
| A commerce partner integrates with FACTS over REST or SOAP web services with XML request/response. Scheduled jobs plus direct calls cover customers, real-time contract pricing, multi-warehouse inventory and pricing, and order submission. | Search [F6] |
| The Infor API catalog | Search [F8]; FACTS entries not confirmed |

### 6.3 Mapping (BOD level)

Standard Infor BOD nouns, as documented for Infor CRM's ION integration. **Which of these FACTS publishes or accepts is Unverified.**

| Querent tables | Infor BOD noun | Dir | Evidence |
|---|---|---|---|
| `items` | ItemMaster | ← | Search [F5] |
| `branches` | Location | ← | Search [F5] |
| `customers`, ship-tos | CustomerPartyMaster, BillToPartyMaster, ShipToPartyMaster | ← | Search [F5] |
| `orders`, `order_lines` | SalesOrder, Shipment, Invoice | ← | Search [F5] |
| `quotes` (step 7 or 9) | Quote, SalesOrder | → | Search [F5] |
| `branch_stock` | Unverified (no inventory noun confirmed for FACTS) | ← | Unverified |
| prices, contracts | Unverified; the partner reports real-time contract pricing (Search [F6]) | ← | Unverified |

**Sync model.** ION delivers BODs as messages, which is push, not polling. Querent would need an ION connection point, or IMS REST calls. Which of the two FACTS supports for outbound change events is **Unverified**.

**Open questions:**
- the FACTS version, and whether Infor OS/ION is licensed;
- IMS REST vs BOD messaging;
- the live price call;
- order write-back;
- the migration timeline to CloudSuite.

---

## 7. TIMS (Computers Unlimited)

### 7.1 What is known

- TIMS is Computers Unlimited's ERP for industrial gas and welding supply distributors (Search [T8]). CU publishes a "TIMS API" blog topic (Search [T7]). **No public API reference was found.**
- **Access is partner-mediated.** The EvolutionX ecommerce integration:
  - expects TIMS V8 R19;
  - is enabled in EvolutionX Admin → App Store → TIMS ERP Integration (Search [T1]);
  - retrieves an API authorization token from a "TIMS Security URL" that **CU provides** for test and live environments (Search [T1], [T3]).
- A 2025 EvolutionX release adds a **TIMS API App Key** to all requests, except live pricing and live inventory, which were due to follow (Search [T2]).
- **OAuth.** The task brief describes TIMS auth as OAuth. The OAuth 2.0 client-credentials article found describes EvolutionX's own API (Search [T6]). **That TIMS uses OAuth 2.0 is Unverified.**
- Capabilities seen through EvolutionX (Search):
  - **live pricing**, with prices up to 6 decimals (9.6 precision) [T4];
  - **live inventory** [T5];
  - **customer sync** [T1];
  - **Live Quotes**: TIMS quotes are shown read-only and can't be converted there [T3].
- **Contact:** API access goes through Computers Unlimited at **timsapi@cu.net** (spec §6). A search excerpt describes it as the TIMS API support contact, including for live surcharge fees and other API toggles (result set [T1], [T7]).

### 7.2 Mapping (coarse; everything Unverified unless marked)

| Querent tables | TIMS capability | Dir | Evidence |
|---|---|---|---|
| `customers` | customer sync | ← | Search [T1] |
| `customer_prices` (or the live `customer` basis) | live pricing (6-decimal prices; Querent rounds to cents) | ← | Search [T4] |
| `branch_stock` | live inventory | ← | Search [T5] |
| `quotes` | TIMS quotes are readable. Whether they can be **written** is Unverified. | ← / → | Search [T3]; write Unverified |
| `items`, `orders`, `order_lines`, `contracts`, `reps` | Unverified | ← | Unverified |
| step 9 order write-back | Unverified | → | Unverified |

### 7.3 Unknowns (ask timsapi@cu.net)

1. Endpoint list and documentation, and the test environment.
2. The auth flow: OAuth grant vs token plus App Key.
3. Whether Querent can connect directly or must go through a partner.
4. Licensing and fees.
5. A change feed or modified-since filters.
6. Quote and order **create** APIs.
7. Branch and warehouse model.
8. How cylinder rental, deposits, hazmat and surcharges appear on quotes. TIMS serves gas and welding, and a search excerpt mentions live surcharge fees (result set [T1], [T7]).
9. Whether cost is available for margin.
10. Rate limits.

---

## 8. CRM and WMS patterns (Querent design)

- **The ERP stays the source of truth** for items, prices, stock, customers, A/R and orders. Querent never edits ERP masters (no customer or item edits flow back). It writes only orders (step 9), and optionally quotes.
- **Querent keeps what it owns:**
  - conversations and query logs;
  - quote drafts, revisions and Activity;
  - suggestions, floors, access toggles;
  - analytics such as win rate, GP found and hours saved.
- **CRM external IDs.** Each ERP-sourced row holds one `(source, external_id)`. Suppose Herrick also runs a CRM (for example, a customer record that exists in both the ERP and the CRM). Then add a cross-reference table, `external_refs(entity, local_id, system, external_id)`, instead of overloading `source`. The ERP stays the key for sync. The CRM id is used for activity logging (for example, posting "quote sent" or "quote accepted" to the CRM timeline).
- **ATP comes from the ERP.**
  - Show the ERP's available quantity, synced or fetched live. Don't compute availability in Querent.
  - Stock is advisory on a quote. Today it feeds scarcity pricing and the pop-up, and it does not block send (`src/server/quotes/send-check.ts`).
  - The ERP allocates stock when the order is written (step 9).
  - A live availability re-check before send would be a new, warning-only line in the send dialog.
- **WMS:** read it through the ERP, which is the P21 + Epicor WMS pattern (§4.11). Integrate a WMS directly only if the ERP's figure lags the floor.

---

## 9. Suggested follow-up tasks (Querent design)

1. **Schema v4.** Add:
   - `ship_tos`
   - `quotes.erp_order_number`
   - `erp_outbox`
   - `external_refs`
   - an `active` flag on synced tables
   - a Querent category mapping table for `product_categories`
2. **ERP adapter interface** with a fake adapter (contract tests), and a P21 adapter once Herrick's middleware is reachable.
3. **Sync worker and real `sync_events`.** Replace the heartbeat and update the Data sources tab.
4. **Async price and availability prefetch** before `requestQuote()` and `sendQuote()`.
5. **Step 9 outbox worker** and a rep-facing failure state.
6. **Geocoding or a routing `DistanceProvider`.**

---

## 10. Sources and research log

**Research method (2026-09-27).**
- About 20 WebSearch queries.
- WebFetch was attempted on these domains, and **every one was blocked by the network proxy**: epicor.com, epiusers.help, webhelp.optimizely.com, docs.evolutionx.io, cu.net, docs.infor.com, docs.jitterbit.com, supergood.ai, bizxcel.com, doc.oroinc.com.
- So "Search" facts come from search-result excerpts only.
- The unofficial P21 community repository named in the spec was not consulted.

### Prophet 21 and Epicor WMS

- [S1] Supergood, "Prophet 21 (Epicor) API: API Report Card": <https://supergood.ai/api-report-card/prophet-21-epicor>
- [S2] Epicor User Help Forum, "P21 API via Consumer Key rather than Username & Password": <https://www.epiusers.help/t/p21-api-via-consumer-key-rather-than-username-password/119312>
- [S3] Jitterbit, "Epicor Prophet 21 connection": <https://docs.jitterbit.com/integration-studio/design/connectors/epicor-prophet-21/connection/>
- [S4] BizXcel, "Connecting to Epicor Prophet 21 (P21) for Integration (APIs)": <https://www.bizxcel.com/blog/connecting-to-epicor-p21-for-integration>
- [S5] Industrial Distribution, "Prophet 21 Application Programming Interface" (whitepaper): <https://www.inddist.com/home/whitepaper/13777021/epicor-software-prophet-21-application-programming-interface>
- [S6] Epicor User Help Forum, "Responding to messages in the Transaction API?": <https://www.epiusers.help/t/responding-to-messages-in-the-transaction-api/126646>
- [S7] Epicor User Help Forum, "Bulk Pricing Fetch via API": <https://www.epiusers.help/t/bulk-pricing-fetch-via-api/118277>
- [S8] B2Sell, "Epicor P21 API: REST Integration for Prophet 21": <https://www.b2sell.com/api-for-p21>
- [S9] Optimizely, "Overview of InsiteConnect for Prophet 21": <https://webhelp.optimizely.com/latest/en/b2b-commerce-sdk/connectorsandintegrations/erps/overviewprophet21.htm>
- [S10] Optimizely, "How to implement connectors for Prophet 21": <https://webhelp.optimizely.com/latest/en/b2b-commerce/connectorsandintegrations/erps/howimplementconnectorsprophet21.htm>
- [S11] Optimizely, "Reference for connectors for Prophet 21": <https://webhelp.optimizely.com/latest/en/b2b-commerce/connectorsandintegrations/erps/referencematerialconnectorsprophet21.htm>
- [S12] Ximple Solution, "Epicor Prophet 21 Migration Guide" (PDF): <https://www.ximplesolution.com/resources/prophet-21-migration-guide.pdf>
- [S13] Atlas Precision Consulting, "Prophet 21 Pricing: The Basics of Job/Contract": <https://www.atlasprecon.com/job-contract-basics-prophet-21/>
- [S14] Atlas Precision Consulting, "Adding Pricing Libraries to Customers in Prophet 21": <https://www.atlasprecon.com/adding-pricing-libraries-to-customers-in-prophet-21/> and "Prophet 21's Sales Price Page": <https://www.atlasprecon.com/prophet-21-sales-price-page/>
- [S15] Epicor, "Epicor Prophet 21: Advanced Warehouse Management System Features": <https://www.epicor.com/en-us/products/enterprise-resource-planning-erp/prophet-21/warehousing/>
- [S16] Epicor P21 Knowledge On Demand, "Converting a Quote to an Order": <https://p21video.epicor.com/detail/video/5785036470001/converting-a-quote-to-an-order>
- [S17] Optimizely Support, "Prophet 21 connectors implementation": <https://support.optimizely.com/hc/en-us/articles/4413191571597-Prophet-21-connectors-implementation>

### Epicor Eclipse

- [E1] Epicor, "Application Programming Interface (API) - Epicor Eclipse": <https://www.epicor.com/en-us/products/enterprise-resource-planning-erp/eclipse/ptw-api/>
- [E2] DCKAP, "Epicor Eclipse ERP: Features, Benefits, Integration & More": <https://www.dckap.com/blog/epicor-eclipse-erp/>. The XML web-integration excerpt came from this result set; the exact page is uncertain.

### Infor Distribution FACTS

- [F1] SoftwareConnect, "Infor Distribution FACTS (Discontinued) + Alternatives": <https://softwareconnect.com/reviews/infor-distribution-facts/>
- [F2] Infor, "Infor Distribution FACTS Configuration Guide for Infor Operating Service" (9.3.2, PDF): <https://docs.infor.com/facts/9.3.2/en-us/useradminlist/FACTSConfigurationGuideforInforOS_68161.pdf>
- [F3] Infor Developer Portal, "Integration with ION": <https://developer.infor.com/tutorials/integration-with-ion>
- [F4] Infor, "Infor ION API Administration Guide": <https://docs.infor.com/ionapi/2021-x/en-us/ionapiag_cloud/default.html>
- [F5] Infor CRM, "BODs and BOD Mappings": <https://docs.infor.com/crm/ce/en-us/crmolh/crmadminolh/beh1556172061994.html>
- [F6] Enterpristore, "Infor API Integration": <https://enterpristore.com/infor-api-integration/>
- [F7] Infor LN, "Appendix C: Create and Download ION API File": <https://docs.infor.com/ln/2024.x/en-us/lnolh/default.html?helpcontent=soe1647345257385.html>
- [F8] Infor, "Infor API Documentation" (catalog): <https://developer.infor.com/hub/apicatalog>

### TIMS (Computers Unlimited)

- [T1] EvolutionX, "TIMS ERP Integration Setup": <https://docs.evolutionx.io/en/articles/5057134-tims-erp-integration-setup>
- [T2] EvolutionX, "EvolutionX Release Log 2025": <https://docs.evolutionx.io/en/articles/10353842-evolutionx-release-log-2025>
- [T3] EvolutionX, "ERP Live Quotes Integrations": <https://docs.evolutionx.io/en/articles/8360999-erp-live-quotes-integrations>
- [T4] EvolutionX, "Live Pricing — Real-Time Price from the ERP": <https://docs.evolutionx.io/en/articles/4102953-live-pricing-real-time-price-from-the-erp>
- [T5] EvolutionX, "Inventory - Real-Time Inventory from the ERP": <https://docs.evolutionx.io/en/articles/7947048-inventory-real-time-inventory-from-the-erp>
- [T6] EvolutionX, "OAuth2.0 By Evolutionx Integration": <https://docs.evolutionx.io/en/articles/8065703-oauth2-0-by-evolutionx-integration>
- [T7] Computers Unlimited, "TIMS Software Blog: TIMS API": <https://www.cu.net/industrial/blog/topic/tims-api>
- [T8] Computers Unlimited, "Industrial Gas Cylinder Tracking and ERP Software | TIMS Software": <https://www.cu.net/industrial>
