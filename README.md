# Querent: Query to Quote

Querent is a fictional demo of **Query to Quote** for an industrial distributor. A customer asks for goods in plain language. Querent matches each line to a SKU, checks stock, and prices a draft quote from the supplier's data. The assigned rep reviews and sends it, and the customer accepts or asks for changes, all inside Querent.

It is one Next.js 16 application (App Router, React 19, TypeScript) backed by a local SQLite file. It needs no database server, accounts, containers, or migrations. All companies, people, and records are fictional.

The spec, design decisions, and task history live in Notion: **Querent HQ → Querent v2: Query to Quote** (<https://app.notion.com/p/3e7afa1db504810fbbddc37175014ead>). The visual reference is [`docs/design/`](docs/design/README.md).

## Personas and demo data

The workspace chooser at `/` offers two personas. It is not a login (see [Security and known limitations](#security-and-known-limitations)).

| Persona | Who | Where they work |
|---|---|---|
| **Customer** | **Dana Ortiz**, Purchasing at **Wasatch Mechanical Contractors** (account WAS-1142) | The customer workspace at `/`: contacts, chat, and quotes |
| **Supplier** | **Brandi Gallegos (BG)**, Inside Sales rep at **Herrick Industrial Supply** | The rep portal at `/rep` |

The seed (`src/server/db/seed/`) is the demo's only data source:

- **Customers:** Wasatch is the only customer with history (orders, contracts, prices, quotes, chat logs). Three placeholder customers have only a name, an account number, and a rep: Great Basin Fabrication (Brandi), Canyon Ridge Builders (Mara Jensen), and Uinta Facility Services (Nora Chen). They show what multi-customer looks like, with empty states.
- **Branches:** SLC, Ogden, and Provo.
- **Catalog:** 62 SKUs in 6 categories (Fasteners; Abrasives & Cutting; Safety & PPE; Material Handling & Tie-downs; Tools; Janitorial/MRO). It includes deliberate near-duplicates (Grade 5 vs 8, Type 1 vs 27) so clarification has something to ask.
- **Quotes:** 24 historical Wasatch quotes, plus the sample quote **Q-24817**, which starts in `ready_for_review` with Brandi's unread badge set. The rep portal's ⋯ menu has **Reset sample quote** to restore it.

## The golden flow (workflow steps 1–8)

These are steps 1–8 of the flowchart in `docs/design/querent-quote-flow.html`. Step 9 (writing the order to the ERP) and everything after it are out of scope.

1. **Dana asks a question** in chat, for example about stock.
2. **Querent answers from the data** (stock by branch, price, order status, account), limited by the information categories Herrick has switched on for her.
3. **Dana asks for goods** in chat.
4. **Querent builds the cart.** It matches each line to one SKU and asks a clarifying question when it isn't confident. After 2 rounds it shows the top 3 candidates as buttons, plus Brandi's contact details. When every line is matched, the **item pop-up** opens with items, quantities, and branch stock, but **no prices**. Dana picks pickup or delivery and a branch, then presses **Request quote**.
5. **Querent prices the draft.** Each line gets a price basis, a "Why this price?" note, and the GP it adds over the customer price. The quote also gets distance-based freight and "Suggested by Querent" upsells. The quote is `ready_for_review`, and Brandi's Quotes badge lights up.
6. **Brandi reviews it** in the rep portal. She can switch price bases, type any price (a red warning appears above a price that falls below her floor), add upsells, set freight, and edit terms and notes.
7. **Brandi approves and sends it** with **Approve & send**, then the centered **Confirm send**. The quote arrives in Dana's chat and her quotes sidebar, and opens as a PDF preview.
8. **Dana accepts** (with a pickup or delivery time and a PO) **or requests changes** (with a note), each after a centered Confirm dialog. After a change request, Brandi edits the quote and sends rev 2. Acceptance ends the MVP flow, and Brandi sees the quote as Accepted.

`e2e/golden-quote-flow.spec.ts` walks this flow end to end with both personas. `e2e/mobile-flow.spec.ts` walks it again on 390×844 phones.

## Run locally

Requires **Node.js 22 or newer**.

```sh
npm ci
npm run db:reset
npm run dev
```

Open <http://localhost:3000> and choose a persona. The dev server listens on all interfaces, so a phone on the same network can open it at your computer's IP address.

### The demo database

- The database lives at `./data/querent.sqlite`, or wherever `DATABASE_PATH` points. It is created and seeded on first open, and its state survives restarts.
- `npm run db:reset` (`scripts/reset-db.ts`) deletes the file and reseeds it. Run it before a demo, and after any schema change.
- **Seed date:** every seeded date is an offset from a seed date. It defaults to yesterday (UTC), so the demo stays current. To reproduce the mockup's dates exactly (last paid Aug 12, last order Sep 9), reset with `QUERENT_SEED_DATE=2026-09-23 npm run db:reset`. `db:reset` reads the variable from your shell, not from `.env.local`.
- **Schema:** `SCHEMA_VERSION` is in `src/server/db/schema.ts` (currently 4: a quote's `expires_on` and the delivery `road_factor`). There are no migrations. The app refuses to open a database from another version ("… is incompatible with schema 4. Run npm run db:reset.").

### Chat: scripted mode and live mode

The chat mode is chosen in `src/server/chat/mode.ts`.

- **Scripted mode** runs when `ANTHROPIC_API_KEY` is unset or `QUERENT_SCRIPTED=1`. It plays a deterministic, offline Dana conversation, and CI and every E2E run use it. Its answers come from the same chat tools live mode uses (`src/server/chat/tools.ts`), so stock, SKUs, and access toggles are real. The script (`src/server/chat/scripted.ts`):
  1. "Do you have 1/2 in grade 8 hex bolts in stock?" gets stock at every branch.
  2. "Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels. We'll pick up at SLC." matches the bolts and asks "Type 1 or Type 27 cut-off wheels?".
  3. "Not sure" moves to round 2: the top 3 wheels as buttons, Brandi's contact, and Drop this line.
  4. "Type 1" (or a button) opens the item pop-up.
- **Live mode** runs when `ANTHROPIC_API_KEY` is set and `QUERENT_SCRIPTED` is not. Claude answers through seven typed tools over the customer-safe repository: `search_items`, `get_stock`, `get_price`, `get_order_history`, `get_order_status`, `get_account_summary`, and `propose_cart` (`src/server/chat/live.ts`, `definitions.ts`). There is no generated SQL. Each tool checks the customer's information-category toggle on the server:
  - Items & stock gates `search_items`, `get_stock`, and `propose_cart`.
  - Pricing gates `get_price`.
  - Orders & quotes gates both order tools.
  - Account gates `get_account_summary`.

  In live mode Claude also writes the wording of the "Suggested by Querent" chips (`src/server/upsells-writer/claude.ts`). Scripted mode uses template wording.

To use live mode, put your key in `.env.local`, which git ignores, and restart `npm run dev`. Never commit a key or paste it into docs or chat.

```sh
ANTHROPIC_API_KEY=<your key>
ANTHROPIC_MODEL=claude-sonnet-5
```

`ANTHROPIC_MODEL` is optional; `claude-sonnet-5` is the default.

### Environment variables

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_PATH` | `./data/querent.sqlite` | The SQLite file. On Railway use `/data/querent.sqlite`. |
| `QUERENT_SEED_DATE` | yesterday (UTC) | The seed date (`YYYY-MM-DD`) for `db:reset` and first-open seeding. `2026-09-23` matches the mockup. |
| `ANTHROPIC_API_KEY` | unset | Turns on live chat. Leave it unset for scripted mode. |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | The model live chat and the chip writer use. |
| `QUERENT_SCRIPTED` | unset | `1` forces scripted mode, even with a key. |
| `PORT` | `3000` | The port for `npm start`. |
| `QUERENT_E2E_RESET` | unset | **Tests only.** `1` enables `POST /api/test/reset` and `POST /api/test/rep-quotes`. Never set it on a shared deployment, because it lets anyone reset the demo. |
| `QUERENT_WEBSERVER`, `QUERENT_BASE_URL` | unset, `http://127.0.0.1:3000` | Playwright: whether it starts the server itself, and where the app is. |

## Tests

| Command | What it checks |
|---|---|
| `npm run typecheck` | `tsc --noEmit` over the codebase |
| `npm test` | Vitest: unit and component tests, plus the architecture guards (the repository boundary, the E2E guard, and the dead-CSS guard) |
| `npm run build` | `next build` |
| `npx playwright test` (or `npm run smoke`) | The Playwright specs in `e2e/`, in Chromium |

### Playwright

With `QUERENT_WEBSERVER=1`, or in CI, Playwright resets the database and starts the production server itself (`playwright.config.ts`), so run `npm run build` first. That server runs in scripted mode on the mockup's seed date (2026-09-23), with `QUERENT_E2E_RESET=1`.

```sh
npx playwright install chromium   # first time only
npm run build
QUERENT_WEBSERVER=1 QUERENT_BASE_URL=http://127.0.0.1:3100 npx playwright test
```

To run against a server you started yourself, start it with `QUERENT_SCRIPTED=1 QUERENT_E2E_RESET=1 QUERENT_SEED_DATE=2026-09-23`. Then run `QUERENT_BASE_URL=http://127.0.0.1:<port> npx playwright test <spec>`.

**Local Chromium override (cloud sandbox only):** the sandbox's preinstalled Chromium (`/opt/pw-browsers/chromium`) is older than the one Playwright 1.63 expects. Locally, set `use.launchOptions.executablePath` to `/opt/pw-browsers/chromium` in `playwright.config.ts`, and **never commit that change**. CI installs its own Chromium and needs no override.

### The E2E guard

`src/e2e-suite.test.ts` runs as part of `npm test`, so a switched-off E2E test fails CI before Playwright could quietly pass without it. It checks two things:

- **Nothing in any `e2e/*.spec.ts` switches a test or step off, focuses one, or expects one to fail.** This covers `test.skip` / `fixme` / `only` / `fail`, `test.step.skip`, `test.describe.*`, `testInfo.skip` / `fixme` / `fail`, bracket and destructured forms, annotations of type skip, fixme, or fail, and the word "fixme" anywhere.
- **The golden spec declares exactly the tests in `GOLDEN_TESTS`**, by title and tag and in order. These are the spec's tests 0–8, with test 6 split into its rep half and its customer half. The test numbers are the spec's own, not the workflow step numbers in [The golden flow](#the-golden-flow-workflow-steps-18). For example, spec test 6 (Approve & send, and Dana receiving the quote) is workflow step 7, and spec tests 7 and 8 are both workflow step 8. If you rename, add, or remove a golden test, edit `GOLDEN_TESTS` in the same change.

The guard has known gaps (see [Known limitations](#known-limitations)).

## CI

`.github/workflows/ci.yml` runs on every pull request and on every push to `main`. It uses Node 22 and runs these steps in order:

1. `npm ci`
2. Typecheck
3. Vitest
4. `next build` (with `.next/cache` restored)
5. Install Playwright Chromium
6. `npx playwright test` against `http://127.0.0.1:3000`, a server the config starts with `npm run db:reset && npm run start`

CI needs no secrets. It sets `QUERENT_SCRIPTED=1` and an empty `ANTHROPIC_API_KEY`, and the Playwright config forbids `test.only` in CI. When a run fails, it uploads `playwright-report/` and `test-results/` as an artifact that is kept for 14 days.

## Architecture

API routes run on the Node.js runtime and are never cached. The UI polls for changes, so the rep's changes reach Dana's screen without a refresh, and hidden tabs skip polling (`src/lib/use-poll.ts`).

| Path | What it is |
|---|---|
| `src/app/page.tsx` → `src/components/App.tsx` | The workspace chooser, then the customer workspace |
| `src/app/rep/` | The rep portal: `quotes`, `quotes/[id]`, `customers`, `orders`, `items`, `analytics`, `settings` |
| `src/app/api/` | API routes: `session`, `query/customer/*` (customer), `rep/*` (rep), `quotes/[id]/pdf` (both), and `test/*` (E2E only) |
| `src/components/customer/`, `src/features/chat/` | The customer layout, chat, item pop-up, and PDF preview modal |
| `src/components/rep/` | The rep portal shell and screens |
| `src/domain/` | Shared domain types |
| `src/server/repository/` | All data access (below) |
| `src/server/db/` | The connection, schema, and seed |
| `src/server/*` | The server logic, one folder per concern (below) |
| `scripts/reset-db.ts` | `npm run db:reset` |
| `e2e/` | Playwright specs |
| `docs/design/` | The mockup, screenshots, and [intentional differences](docs/design/README.md) |

### Repository layer and the customer-safe boundary

- **Data access:** every read and write is a typed function in `src/server/repository/`, with types in `src/domain/`. SQL appears only there and in `src/server/db/`. The ERP-sourced tables (`ERP_SOURCED_TABLES` in `src/server/db/schema.ts`: items, stock, prices, contracts, customers, orders, and more) carry `source`, `external_id`, and `synced_at`, so a future ERP sync can upsert into them.
- **Two repository modules:**
  - `@/server/repository` is the full internal API. Some of it returns cost and margin.
  - `@/server/repository/customer` is the **customer-safe** module. It never returns cost, margin, floors, Querent's pricing notes, or internal notes, and it always scopes customer data to one customer. `customer.test.ts` calls every export and fails on any cost-like field.
- **The boundary guard:** `src/server/repository/boundary.test.ts` enforces these rules as part of `npm test`:
  - No SQL appears outside the repository and db folders.
  - Only those folders and `scripts/` import the database.
  - Three kinds of code may use only the customer-safe module: LLM code (`src/server/pipeline.ts`, `src/server/chat/`, `src/server/upsells-writer/`), customer routes (`src/app/**/customer*`), and the customer-facing server logic (`src/server/customer/`). They may not import the services that read cost (pricing, floors, upsells, the quote service, intake, customer-response), and the guard follows imports and re-exports transitively, through helpers.
  - The test-database helpers are imported only from test files.
- **Two named exceptions:** customer routes, and only customer routes, may directly import these two modules:
  - `src/server/intake/quote-request`: Request quote prices the draft server-side.
  - `src/server/customer-response/service`: Accept and Request changes go through the quote service.

  Both take only customer-supplied fields and answer with customer-safe fields only, and their tests deep-scan every response for cost. Neither exception applies when it is reached through a helper.
- **Revision snapshots:** each sent revision stores a frozen, customer-only snapshot (`src/server/quotes/snapshot.ts`), so the PDF the customer saw can always be reproduced.

### Quote engine

| Folder | What it does |
|---|---|
| `src/server/matching/` | SKU match scoring. A line is confident only when the top score is at least 0.75 and at least 0.15 ahead of the next. "The usual" resolves from order history. |
| `src/server/chat/clarify.ts` | The clarification loop. From round 2, it offers the top 3 candidates, Drop this line, and the rep's contact. |
| `src/server/pricing/` | The price suggestion. An active contract price wins. Otherwise it takes the customer price, raised only by a fact: last paid higher, a broken case (a qty under a full case: customer price + 10%), or scarcity (customer price + 5%, off by default). The highest wins, capped at list. It also writes "Why this price?", the reasons behind the "?" next to the price, and the "+$X GP vs customer price" figure. |
| `src/server/floors/` | Margin is (price − cost) ÷ price. Each quote rep × product category has its own floor. 20% is the default, and it is also the fallback for a pair with no floor row. The seed sets three of Brandi's floors differently: Abrasives & Cutting 25%, Safety & PPE 30%, and Tools 18% (`src/server/db/seed/accounts.ts`). Below the floor only warns. |
| `src/server/freight/` | Freight by distance: a `DistanceProvider` (haversine × the road factor), the rates from `delivery_rates`, and a rep override with a reason. The seeded rates are $25 + $2.50/mi with a $35 minimum, "call for freight" beyond 75 mi, free from $1,500 (at or above it), and a 1.25 road factor; any rep can change all six on Settings > Pricing & delivery (`rates.ts` holds the limits). |
| `src/server/quotes/` | The lifecycle state machine (`lifecycle.ts`: ready_for_review → sent → accepted / changes_requested → sent rev n+1; sent → expired), send blockers (`send-check.ts`), snapshots, and the "quote is ready" chat message |
| `src/server/upsells/`, `src/server/upsells-writer/` | Deterministic upsell rules (matching nut and washer, full case, bought together), priced by the engine, and Claude's chip wording in live mode |
| `src/server/intake/`, `src/server/customer-response/` | Request quote, and the customer's Accept or Request changes |
| `src/server/pdf/`, `src/server/export/` | PDFs made with `@react-pdf/renderer` (no headless browser). The **Customer quote** is formal, black and white, with "via Querent" and "Sample data" marks. The **Internal worksheet** adds cost, margin, floors, Querent's reasoning, credit, and internal notes under a CONFIDENTIAL banner. There is also the Line items CSV. |
| `src/server/analytics/` | The Analytics tab's stat cards, trends, and query analytics |

### Rep portal

- **Access:** `src/app/rep/layout.tsx` admits only the supplier persona and sends anyone else back to `/`. Each page also checks with `signedInRepId()`.
- **Navigation:** Quotes / Customers / Orders / Items (filtered by one category dropdown, All by default) / Analytics / Settings. The header keeps the **Viewing** customer picker (`?customer=`), and Quotes has an unread badge (`GET /api/rep/badges`).
- **Quote detail:**
  - A line grid with a price-basis dropdown (Contract / Customer / List / Last paid / Custom), with Querent's pick in bold, and a "?" beside it whose tip lists why Querent suggests that price. A red floor warning appears above the price field when a line is below its floor, and each line has a "Why this price?" row.
  - Show cost, Undo, add item, "Suggested by Querent", and the margin bar with its blended-floor marker.
  - Side panels: Customer (with the credit bar), Pickup or delivery (with freight), Quote terms (any expiration date from tomorrow to a year out; 14 days after sending by default), Internal notes, and Activity.
  - The ⋯ menu (Duplicate, Reset sample quote, and a disabled "Open customer in ERP"), the Export menu, and Approve & send → Confirm send. Sending is blocked for an unfinished quote.
- **Settings:** Rep assignments (one rep per customer), Customer access toggles, Data sources, Delivery rates (editable), My margin floors, and Pricing (the scarcity toggle, and the fixed broken-case rule).
- **API:** every `/api/rep/*` route answers 401 without a session and 403 for the customer, and takes the rep's id from the session, never from the request. All of them go through `repRoute` (`src/server/rep/http.ts`), except `GET /api/rep/badges`, which makes the same check inline.

### Customer layout

`src/components/customer/CustomerLayout.tsx` has three columns:

- **Left:** the assigned rep at the top, then Customer Service, AR / Finance, and Warehouse / Will-call for each branch (`ContactsSidebar`).
- **Center:** the chat (`src/features/chat/Chat.tsx`).
- **Right:** one button per quote, "Quote · date · $total", with a status chip (`QuotesSidebar`).

A quote button, or the chat's "View quote", opens the **PDF preview modal** (`quote-preview/`). The modal has Download, and an Accept / Request changes bar that opens centered Confirm dialogs. Below 960px the three columns become Chat / Contacts / Quotes tabs. The customer API (`/api/query/customer/*`) serves only the session's customer. The customer can see only revisions the rep sent, never a draft or the internal worksheet.

### ERP integration

The MVP keeps all data in SQLite. [`docs/erp-integration-readiness.md`](docs/erp-integration-readiness.md) (task 7.2) covers the path to a real ERP: Epicor Prophet 21 with Epicor WMS, Eclipse, FACTS, and TIMS, including table mappings, sync jobs, and the step 9 order write-back.

## Deploy

**Deployment is manual.** No CI job or agent deploys. To put the demo on Railway:

1. Create a Railway service from this GitHub repository.
2. Use `npm run build` as the build command and `npm start` as the start command.
3. Add a persistent volume mounted at `/data`. Without it, the database resets on every deploy.
4. Set `DATABASE_PATH=/data/querent.sqlite`.
5. Optionally set `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`. Never set `QUERENT_E2E_RESET`.
6. Generate a public HTTPS domain.
7. **After a deploy that changes `SCHEMA_VERSION`** (now 4), the app refuses the old database on the volume. Run `npm run db:reset` once in the service's shell, with `DATABASE_PATH` set, to reseed the demo.

Railway's free credit is enough to experiment with, but whether it runs continuously for free depends on usage, and free and trial volume limits can change. Vercel cannot keep a local SQLite file, so a Vercel deployment would need a hosted database such as libSQL / Turso.

## Security and known limitations

This is a demo, not a product. Never put real customer, financial, or personal data into it. The Notion page **Querent MVP → Security & Limitations** has the same list.

### Security model

- **No authentication.** The workspace chooser sets an httpOnly cookie (`querent-persona`, `src/server/session.ts`). Anyone with the URL can act as either persona and change the shared demo state.
- **The customer-safe boundary** keeps cost, margin, floors, and internal notes away from customer routes and LLM code, with the two named exceptions above. `npm test` enforces it.
- **Rep-only APIs:** `/api/rep/*` and the internal worksheet PDF answer only the supplier persona. A rep sees only their own quotes, and another rep's quote reads as not found.
- **Idempotency is in memory.** Duplicate quote, Send, Accept, and Request changes replay a repeated `Idempotency-Key` from a store in the server process (`src/server/rep/idempotency.ts`, 10 minutes). That is fine for a single instance only. A restart forgets it, and a second instance wouldn't share it. Request quote's one-pop-up-one-quote guard is stored in the database.
- **Test-only routes** (`/api/test/*`) exist only with `QUERENT_E2E_RESET=1`.
- **Secrets:** keep `ANTHROPIC_API_KEY` in `.env.local` (git-ignored) or in Railway's variables. CI needs no secrets.

### Known limitations

These are still open from the build and waiting on a product decision:

- **Scope after a reassignment.** Reassigning a customer in Settings never moves its quotes: the old rep's Quotes list and badge keep them (`quotes.rep_id`). Analytics, however, follows the customer's current rep (`customer_rep`), so the two tabs disagree for that customer. Related defaults are flagged in the code: a rep sees only their own customers' quotes and analytics, and any rep may change Rep assignments and Customer access.
- **Q-24817's total vs the mockup.** The pricing engine prices the seeded quote at **$1,122.40**, against the mockup's **$1,109.50**. The open question is whether to keep the engine's prices or change the seed. `docs/design/README.md` lists the numbers that follow from it.
- **Exporting the customer's revision.** On a `changes_requested` quote, the Export menu exports the rep's draft of the next revision (marked "draft, not sent"), not the revision Dana answered. The PDF and CSV routes accept `?rev=N`, but the menu has no item for it.
- **E2E guard bypasses.** The guard reads only `e2e/*.spec.ts`, so three things still get past it: a skip taken from a helper file outside `*.spec.ts` (for example `export const later = test.skip`), `grepInvert` or `testIgnore` in `playwright.config.ts`, and an early `return` inside a test body. One suggested fix is to scan every file in `e2e/` and `playwright.config.ts`, or to have CI assert the golden spec's test count.

Also by design:

- Chat is limited to scripted mode without a key, and scripted wording matters.
- Everyone on a deployment shares one SQLite file, which can't run on serverless hosts or on more than one instance.

## Working on this repo

Work is planned and tracked in Notion (link above). To build or resume, run the `/querent-task-loop` skill. The implementer and verifier agents are in `.claude/agents/`, and the verification checklist is `/querent-verify`. This is Next.js 16: read `node_modules/next/dist/docs/` before changing framework code (see `AGENTS.md`).
