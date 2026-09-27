# Querent MVP

Querent is a fictional customer self-service demonstration. It is one full-stack Next.js application backed by a local SQLite file. There is no Supabase account, Python service, container, migration command, or login setup.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

Open <http://localhost:3000>. Choose the supplier persona (Herrick Industrial Supply, signed in as rep Brandi Gallegos) or the customer persona (Dana Ortiz at Wasatch Mechanical Contractors). All displayed companies, people, and records are fictional.

The database is created and seeded automatically at `./data/querent.sqlite`. State survives restarts. To return to the original seed:

```sh
npm run db:reset
```

Seeded dates are relative to a seed date, which defaults to yesterday so the demo stays current. Set `QUERENT_SEED_DATE=2026-09-23` before `npm run db:reset` to reproduce the design mockup's dates exactly. After a schema change (`SCHEMA_VERSION` in `src/server/db/schema.ts`), the app refuses to open an older database until you run `npm run db:reset`; there are no migrations.

All data access goes through typed functions in `src/server/repository/` (types in `src/domain/`). `@/server/repository` is the full internal API. Customer-facing code, customer routes and the chat tools use `@/server/repository/customer`, which never returns cost or margin. `npm test` fails if SQL appears anywhere else, if a customer route or chat code imports the internal repository, or if chat code imports a service that reads cost (pricing, floors, upsells).

Chat runs in **scripted mode** when `ANTHROPIC_API_KEY` is unset or `QUERENT_SCRIPTED=1`. Scripted mode is a deterministic, offline Dana conversation that CI and every E2E run use. It works like this:

1. Ask "Do you have 1/2 in grade 8 hex bolts in stock?"
2. Ask for bolts and cut-off wheels, for example "Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels."
3. Querent asks "Type 1 or Type 27 cut-off wheels?"
4. Answer it, and Querent returns the item pop-up's list.

Its answers come from the same chat tools live chat uses (`src/server/chat/tools.ts`).

With `ANTHROPIC_API_KEY` set (and `QUERENT_SCRIPTED` unset), chat runs in **live mode**: Claude answers through seven typed tools over the customer-safe repository (`search_items`, `get_stock`, `get_price`, `get_order_history`, `get_order_status`, `get_account_summary`, `propose_cart`), never generated SQL. The model is `ANTHROPIC_MODEL`, default `claude-sonnet-5` (`src/server/chat/live.ts`). Each tool checks the customer's information-category toggle on the server. Items & stock gates `search_items`, `get_stock` and `propose_cart`, Pricing gates `get_price`, Orders & quotes gates both order tools, and Account gates `get_account_summary`.

## End-to-end tests

`e2e/golden-quote-flow.spec.ts` walks workflow steps 1–8, and `e2e/mobile-flow.spec.ts` walks them again with both personas on 390×844 phones. Every step runs: `npm test` fails if an E2E test is switched off (`test.fixme`, `test.skip`) or focused (`test.only`). With `QUERENT_WEBSERVER=1` (or in CI), Playwright resets the database and starts the production server itself, so run `npm run build` first. The server runs in scripted mode on the mockup's seed date (2026-09-23) and enables the test-only `POST /api/test/reset` (`QUERENT_E2E_RESET=1`). The golden spec calls that endpoint before it runs.

```sh
npm run build
QUERENT_WEBSERVER=1 QUERENT_BASE_URL=http://127.0.0.1:3100 npx playwright test
```

To run against a server you started yourself, start it with `QUERENT_SCRIPTED=1 QUERENT_E2E_RESET=1 QUERENT_SEED_DATE=2026-09-23`. Never set `QUERENT_E2E_RESET` on a shared deployment, because it lets anyone reset the demo.

## Verify and run a production build

```sh
npm test
npm run typecheck
npm run build
npm start
```

## Railway

1. Push this directory to a GitHub repository and create a Railway service from it.
2. Use `npm run build` as the build command and `npm start` as the start command.
3. Add a persistent volume mounted at `/data`.
4. Set `DATABASE_PATH=/data/querent.sqlite`.
5. Optionally set `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`.
6. Generate a public HTTPS domain and open it from your phone.
7. After a deploy that changes `SCHEMA_VERSION` (task 7.1 moved it to 3), the app refuses the old database on the volume: run `npm run db:reset` once in the service's shell (with `DATABASE_PATH` set), which reseeds the demo.

Railway's free credit is suitable for experimentation, but continuous free operation depends on usage. Free and trial volume limits can also change. Vercel cannot durably persist this local SQLite file; a future Vercel deployment should replace it with remote libSQL/Turso.

## Security boundary

The workspace chooser is intentionally not authentication. Anyone with the URL can view and change fictional demo state. Do not put real customer, financial, or personal data in this version.
