# BOXT Quote Creation Tool (branch `boxt/quote-tool`)

An internal tool for BOXT Packaging's sales reps. A rep pastes a customer's product list or uploads it as a
PDF (up to 200 lines, PDFs up to 4 MB). Claude reads it into lines, and each line is matched against BOXT's
catalog (1,555 items from boxtpackaging.com). A line is **matched** only when the packaging-aware scorer
clears the strictness threshold with a clear lead **and** a Claude judge, choosing only from the scorer's
candidates, agrees; the judge is asked only about lines the scorer clears, and never matches a line on its
own. At **Strict** (the default) the scorer also requires total accounting: every part of the line is read
and confirmed by the item, and everything that defines the item is stated. Anything less is **No match**,
with the closest items offered as near-misses ("Use this item"): a wrong item on a quote costs more than a
line the rep matches by hand. The rep reviews the result, types every price (prices are never prefilled),
and saves the quote. Each line is priced in its item's pricing unit (each, case, roll, coil); the
customer's quantity is converted only when that is exact, and is otherwise kept and flagged "Check
quantity". What reps can expect is in
[OPERATIONS.md, matching](docs/boxt/OPERATIONS.md#matching-what-to-expect).

- Left rail: **Quote creation tool**, **Quotes**, **Settings** (match strictness: Strict by default).
- Sign-in with email and password only. There is no sign-up: the owner creates accounts in Supabase.
- Every page and API needs a session; row-level security on every table.
- No analytics or trackers. Customer lists and PDFs are processed in memory and never logged. The only
  outside service that sees customer text is the Anthropic API.

Stack: Next.js 16 (App Router, React 19, TypeScript), Supabase (Postgres and Auth), the Anthropic API.
Hosting: Vercel and a Supabase project.

| Document | What it covers |
|---|---|
| [docs/boxt/DEPLOY.md](docs/boxt/DEPLOY.md) | Putting it live: Supabase project, migrations and seed, Auth settings, users, Vercel, environment variables, go-live checklist, data flow |
| [docs/boxt/OPERATIONS.md](docs/boxt/OPERATIONS.md) | Running it: logs, activity reports, users, key rotation, catalog refresh, backups, follow-ups |
| [docs/boxt/plan.md](docs/boxt/plan.md) | Product rules, architecture, tasks and their verification (the source of truth on this branch) |
| [src/eval/README.md](src/eval/README.md) | The matching evaluation suite and the strictness calibration |

## Run locally

Requires Node.js 22 or newer and Docker (the Supabase CLI runs the local stack in containers).

```sh
npm ci
npm run db:start   # local Supabase stack: API :54321, Postgres :54322, Mailpit :54324
npm run db:env     # writes .env.local from the running stack (other lines kept), with QUERENT_SCRIPTED=1
npm run db:reset   # local stack only: migrations, catalog and example quote, the two dev users
npm run dev        # http://127.0.0.1:3000
```

Sign in as `rep@boxt.test` or `rep2@boxt.test` with the password `boxt-local-dev-only` (or
`QUERENT_DEV_PASSWORD` if you set it). These users and this password exist only on the local stack
(`scripts/lib/dev-users.ts`); `db:reset` refuses to run against anything but `127.0.0.1` or `localhost`.

- **Password-reset emails** land in Mailpit at <http://127.0.0.1:54324>. Their links point at
  `http://127.0.0.1:3000` (the local Site URL in `supabase/config.toml`), so open the app at that address
  rather than `localhost`, or the sign-in cookie will not be there.
- **Fixture or live Claude.** `QUERENT_SCRIPTED=1` (which `db:env` writes) uses the fixture parser and judge
  and never calls the network; so does a missing `ANTHROPIC_API_KEY`. To try the real thing, put
  `ANTHROPIC_API_KEY` in `.env.local` and empty `QUERENT_SCRIPTED` (running `db:env` again sets it back to
  `1`). `ANTHROPIC_MODEL` is optional; the default is in `src/server/llm/client.ts`.
- `npm run db:stop` stops the stack. `npm run build && npm start` runs the production build (`PORT`
  changes the port).

Every variable is listed in `.env.example` and explained in
[DEPLOY.md, environment variables](docs/boxt/DEPLOY.md#7-environment-variables). `.env.local` is
git-ignored; never commit a real key.

## Tests

| Command | What it checks |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest: unit and component tests, the architecture guards (database access only in the repository layer, no secrets in the repository, no skipped or focused tests, including the Playwright specs), the pricing-unit test (fails on a catalog pack shape it does not know), and the matching evaluation gate, which fails if a must-not-match line matches (at Strict, or at the level the case names, with the recorded or an always-agreeing judge) or Strict recall drops below 90%. No network, no database. |
| `npm run test:eval` | The evaluation suite alone |
| `npm run eval:report` | Precision, recall and no-match rate per strictness level (`npm run eval:report -- --markdown` for the table only, `-- --cases` for every case) |
| `npm run eval:record` | Re-records the judge verdicts with the live judge (needs `ANTHROPIC_API_KEY` in the shell). The current verdicts are hand-written: record them before relying on Balanced or Lenient ([OPERATIONS.md](docs/boxt/OPERATIONS.md#match-strictness)). |
| `npm run test:db` | Against the local stack: repository round trips, row-level security (the public key alone reads nothing), auth (sign-up refused), the example-quote guard. Run `npm run db:reset` first. |
| `npm run build` | `next build`. Needs no Supabase settings (they are read when the app runs). |
| `npm run e2e` (or `npm run smoke`, `npx playwright test`) | The Playwright specs in `e2e/` (access control, sign-in and password reset, quote tool, quotes, settings) against the production build: run `npm run build` first. It **resets the local database** first and starts its own server on a free port with the fixture parser and judge. How to run one spec or use another Chromium: [e2e/README.md](e2e/README.md). |

CI (`.github/workflows/ci.yml`) runs on pull requests and on pushes to `main`, with the fixture parser and
judge and no secrets: install, typecheck, `npm test` (with the evaluation gate), `npm run build` with no
Supabase settings at all, then a local Supabase stack (`npx supabase start`), `npm run db:env` and
`npm run db:reset`, `npm run test:db`, and the Playwright suite in Chromium. It keeps the Playwright report
and traces when something fails, and the screenshots of every run.

Other scripts: `npm run db:seed:boxt` (catalog and example quote into any `DATABASE_URL`, idempotent),
`npm run db:types` (regenerates the database types from the local stack),
`npx tsx scripts/fetch-boxt-catalog.ts` (refreshes `data/boxt-catalog.json` from boxtpackaging.com).

## Where things are

| Path | What |
|---|---|
| `src/app/` | Routes: `/quote-tool`, `/quotes`, `/quotes/[id]`, `/settings`, the auth pages, and `/api/*` |
| `src/proxy.ts`, `src/features/auth/` | Session refresh and the sign-in gate; login, password reset, sign-out |
| `src/features/quote-tool/` | Input, the match pipeline (parse, retrieve, judge, decide), the review dialog, save |
| `src/features/quotes/`, `src/features/settings/` | Quotes list and detail; match strictness |
| `src/server/matching/` | The pure, packaging-aware scorer and the `decide` rule |
| `src/server/llm/` | The Claude parser and judge, and their fixtures |
| `src/server/repository/` | The only place that queries the database |
| `src/eval/` | The matching evaluation suite |
| `e2e/` | The Playwright specs ([e2e/README.md](e2e/README.md)) |
| `supabase/` | Local stack config, the four migrations, the reset-password email template |
| `scripts/` | Database reset, seed, env and catalog scripts |

## Earlier Querent demo: not on this branch

This repository started as Querent, a demo for a fictional industrial distributor (personas, chat, a
pricing engine, SQLite, Railway). That app was removed on this branch. Its documents (`docs/plans/`,
`docs/design/` and the other files under `docs/` outside `docs/boxt/`) describe it, not this tool; where
they disagree with `docs/boxt/plan.md`, the BOXT plan wins on this branch. The earlier demo stays on `main`
until the BOXT pull request is merged.
