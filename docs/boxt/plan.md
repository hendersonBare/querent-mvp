# BOXT Quote Creation Tool: plan and status

Branch `boxt/quote-tool` (off `main`). One PR to `main` at the end; nobody merges it but the owner.
This file is the single source of truth for this branch's tasks, their dependencies and their status.
The build prompt that started it is summarized in "Product rules" below; where this file and older
docs (`docs/plans/*`, `docs/design/*`) disagree, this file wins on this branch.

## Process

- The orchestrator (main session) claims a task by creating its worktree and sub-branch from the latest
  `boxt/quote-tool`: `git worktree add ../wt/<id> -b boxt/task/<id>-<slug> origin/boxt/quote-tool`, and
  records it as `in progress` below. At most 3 implementers run at once, only on tasks whose
  dependencies are `merged`.
- Implementers (`.claude/agents/implementer.md`, adapted by the orchestrator's prompt) work **test-first**
  in their worktree, commit and push their sub-branch often, and report back. They do not open PRs and do
  not merge.
- A task merges into `boxt/quote-tool` (`git merge --no-ff`) only when, on the sub-branch head,
  `npm run typecheck`, `npm test` and `npm run build` pass **and** the `verifier` agent recorded PASS in
  "Verification log" below with evidence. Otherwise a fix round runs on the same sub-branch (max 3).
- Never leave work only on disk: push the sub-branch and update the status table.

## Product rules (from the build prompt; they win over everything else on this branch)

1. **Prefer false negatives over false positives.** When unsure, the line is "No match" and the rep decides.
2. Left rail: **Quote creation tool**, **Quotes**, **Settings**. Nothing else is reachable.
3. Pipeline per submission (≤ 200 lines, PDF ≤ 4 MB): **Parse** (Claude, tool use, PDFs as document
   blocks) → **Retrieve** (pure scorer, description only, top ~8) → **Judge** (Claude, may only pick from
   the candidate list or say none; validated server-side) → **Decide** (Matched only if the scorer clears
   the threshold and lead AND the judge agrees; never on the judge alone) → **Near-misses** (top 3 to 5 for
   No-match lines; "Use this item" promotes one, `matched_by='rep'`).
4. No follow-up questions to anyone. Every parsed line gets exactly one outcome.
5. Prices are never imported or prefilled. The catalog's public list price is only a reference label.
6. A BOXT quote is: customer name, reference, lines (item, qty, unit price, matched_by, original text,
   unmatched flag, near-miss snapshot), total. No statuses, revisions, expiry, notes, PDFs, margins, email.
7. Supabase Auth, email + password, no sign-up anywhere. Every page and API needs a session (proxy.ts and
   again in each handler). RLS on every table, authenticated only.
8. Confidential data: no analytics or trackers; never log quote contents, customer text or PDFs. The only
   external data flow is the Anthropic API (parse and judge).

## Architecture and contracts (every task follows these)

### Layout
| Path | What |
|---|---|
| `src/proxy.ts` | Session refresh + gate: pages without a session → 307 `/login?next=…`; `/api/*` → 401 JSON. Public: `/login`, `/reset-password`, `/auth/confirm`, `/update-password`, static assets. |
| `src/features/auth/` | Supabase SSR clients (`server.ts`, `browser.ts`), `requireUser()` (pages: redirect) and `requireApiUser()` (APIs: 401), login, reset, update-password, sign-out. |
| `src/features/quote-tool/` | Input (paste/upload), match orchestration (`pipeline.ts`), `QuoteReviewDialog`, save. |
| `src/features/quotes/` | Quotes list and detail (view, edit qty/price, delete). |
| `src/features/settings/` | `strictness.ts` (the single config module: level → `{minScore,minLead}`), Settings page. |
| `src/features/shell/` | The rail (Quote creation tool, Quotes, Settings, "BOXT Packaging", Sign out) and page frame. |
| `src/server/matching/` | Pure scorer. No BOXT, database, Supabase or LLM imports. Catalog and config are arguments. |
| `src/server/llm/` | `client.ts` (the only place reading `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`; the one default model constant), `parser.ts`, `judge.ts`, interfaces in `types.ts`, scripted implementations and `fixtures/`. |
| `src/server/repository/` | The only place Supabase queries (`.from(`, `.rpc(`) and SQL live. Every function takes the request's user-scoped Supabase client as its first argument. |
| `src/server/catalog.ts` | Loads the catalog through the repository and caches it in memory (TTL 10 min). |
| `supabase/` | `config.toml` (local stack; sign-ups off), `migrations/*.sql`, `templates/recovery.html`. |
| `scripts/` | `db-reset.ts` (local only), `seed-boxt.ts` (`db:seed:boxt`, any `DATABASE_URL`), `fetch-boxt-catalog.ts`, `supabase-env.ts`. Only scripts may read `SUPABASE_SERVICE_ROLE_KEY`. |
| `data/boxt-catalog.json` | 1,555 public-site rows from `origin/boxt-demo` (prices there are web list prices, reference only). |

### Environment variables
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (app), `SUPABASE_SERVICE_ROLE_KEY` (scripts only),
`DATABASE_URL` (seed/migrations), `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `QUERENT_SCRIPTED` (`1` = fixture
LLMs, never the network; also the behaviour when no key is set), `PORT`. Removed: `DATABASE_PATH`,
`OILPRICEAPI_KEY`, `FEATURE_*`, `QUERENT_SEED_DATE`, `QUERENT_E2E_RESET`.

### Database (Supabase Postgres, `supabase/migrations/`)
- `catalog_items(id, sku unique, description, category, pack, case_qty, list_price, keywords, source, external_id, synced_at, search tsvector, created_at, updated_at)`; authenticated may select only.
- `quotes(id uuid, customer_name, reference, is_example, match_strictness, created_by default auth.uid(), created_by_email default jwt email, created_at, updated_at)`.
- `quote_lines(id uuid, quote_id → quotes on delete cascade, position, sku, description, pack, list_price, quantity, unit, quantity_unclear, customer_quantity (B10), unit_price, matched_by ('auto'|'rep'|null), original_text, unmatched, match_score, near_misses jsonb, created_at, updated_at)`.
- `quote_summaries` view (`security_invoker`): line count, unmatched count, total = Σ round(qty × unit_price, 2).
- `org_settings(id=1, match_strictness 'strict'|'balanced'|'lenient' default 'strict', updated_at, updated_by)`.
- `activity_log(id, user_id default auth.uid(), action, metadata jsonb, created_at)`; actions: `login`, `logout`, `match_run`, `quote_create`, `quote_update`, `quote_delete`, `settings_change`. Metadata holds counts, scores and thresholds, never customer text.
- RLS on every table; policies `to authenticated` only; `anon` has no grants. The example quote (`is_example`) cannot be updated or deleted (policy + trigger). Quote create/update go through security-invoker RPCs so a quote and its lines save atomically.

### Matching contract (`src/server/matching`)
- `retrieve(description, catalog, {minScore, minLead, candidateLimit=8, nearMissLimit=5})` →
  `{candidates: ScoredItem[] (best first, ≤ candidateLimit), top, lead, clears, nearMisses}`.
  `clears` = top score ≥ minScore and lead ≥ minLead, where the lead is measured against the best
  candidate of a **different product group** (pricing-tier variants such as "…, bundle pricing" and
  "…, pallet pricing" of one box are one group).
- Typed-SKU matching is **off** (description only). The seam for a future supplier-SKU → BOXT-SKU table is
  `SupplierSkuMap` in `src/features/quote-tool/sku-map.ts` (a null implementation today).
- Packaging-aware scoring: positional dimension tuples (12x10x8 ≠ 12x8x10), ECT/mil/gauge/lb attributes,
  stated pack quantities ("500/case") contradict a different pack, kraft/white/colour contradictions.
- `decide(retrieval, verdict)` in `src/server/matching/decide.ts` (pure): `matched` only when
  `retrieval.clears` and the judge's SKU is in the top candidate's product group; the pipeline and the
  evaluation suite both use it, so they cannot disagree.
- `src/features/settings/strictness.ts`: `LEVELS = {strict, balanced, lenient}` → `{minScore, minLead}`,
  `DEFAULT_LEVEL='strict'`, calibrated by the evaluation suite (`src/eval/`: cases, the recorded judge
  verdicts `judge-recording.json`, the runner and its test; it may import the BOXT catalog, the matching
  library cannot).

### LLM contract (`src/server/llm`)
```ts
type ParseInput = {kind:'text';text:string} | {kind:'pdf';data:Uint8Array;filename?:string};
interface ParsedRow {rawText:string;description:string;quantity:number|null;unit:string|null;suppliersSku:string|null;quantityUnclear:boolean}
type ParseResult = {ok:true;rows:ParsedRow[]} | {ok:false;error:string};
interface Parser {parse(input:ParseInput):Promise<ParseResult>}
interface JudgeCandidate {sku:string;description:string;pack?:string|null;category?:string|null}
type JudgeVerdict = {sku:string|null;reason:string};   // null = none; anything not in the list becomes null
interface Judge {judge(line:{description:string;rawText:string},candidates:JudgeCandidate[]):Promise<JudgeVerdict>}
```
Both use tool use with a JSON schema (`tool_choice: auto` with `disable_parallel_tool_use`, because the default thinking model rejects a forced tool choice; a reply without the tool call fails closed) and are validated with zod; a malformed judge answer is `null`
(No match); a malformed parse is a clear user-facing error. `QUERENT_SCRIPTED=1` (or no key) selects the
scripted parser (deterministic line splitter; PDFs by fixture hash) and the scripted judge (recorded
verdicts in `src/server/llm/fixtures/judge.json`, else the first candidate). Judging runs with bounded
concurrency (4), a per-call timeout, and a failed call degrades that line to No match.

### API
| Route | |
|---|---|
| `POST /api/quote-tool/match` | multipart (`text` or `file`); streams NDJSON: `{type:'progress',stage,done,total}` … `{type:'result',run}` or `{type:'error',message}`. Writes one `match_run` activity row. |
| `GET /api/catalog/search?q=` | For "swap item" in the review dialog (top 10 by score). |
| `GET/POST /api/quotes`, `GET/PATCH/DELETE /api/quotes/[id]` | List, create, read, edit qty/price/customer/reference, delete (example refused). |
| `GET/PUT /api/settings` | Match strictness. |
| `POST /api/auth/login`, `POST /api/auth/signout`, `POST /api/auth/reset`, `POST /api/auth/update-password` | Auth (login/reset/update are the only public APIs). |

### Tests
- `npm test` (Vitest): unit and component tests, no network, no database.
- `npm run test:db` (Vitest, `vitest.db.config.ts`): repository, RLS (anon key sees nothing) and auth
  checks against the local Supabase stack (`npm run db:start && npm run db:reset`).
- `npm run test:eval`: the false-positive evaluation suite (also part of `npm test`: a must-not-match
  line that matches fails the build).
- Playwright (`e2e/`): fixture LLM mode, local Supabase, production server.

## Tasks

| ID | Task | Blocked by | Status |
|---|---|---|---|
| B0 | Strip to the shell; new stack scaffolding | none (must not touch `src/server/matching/`, `src/server/llm/`) | merged |
| B1 | Supabase schema, RLS, seed, repository | B0 | merged |
| B2 | Auth (login, reset, proxy, guards) | B1 | merged |
| B3 | Packaging-aware matching, strictness levels, evaluation suite | none (owns `src/server/matching/`) | superseded by B3b (blocked after 3 fix rounds) |
| B3b | Strict total-accounting hardening (fresh implementer, all verifier probe lines as held-out eval) | B3 branch | merged |
| B4 | LLM parser and judge with fixtures | none (owns `src/server/llm/`) | merged |
| B5 | Quote creation tool (pipeline, input, review dialog, save) | B1, B2, B3, B4 | in progress (`boxt/task/B5-quote-tool`, B3 branch merged in for its API) |
| B6 | Quotes list and detail | B1, B2 | merged |
| B7 | Settings (match strictness) | B1, B2, B3 | in progress (`boxt/task/B7-settings`, B3 branch merged in for `strictness.ts`) |
| B8 | E2E, access control, CI | B5, B6, B7 | in progress (`boxt/task/B8-e2e-ci`, staged on B5 + B7) |
| B10 | Price-unit correctness and UI polish (from B8 verification) | B5, B7, B8 (staged on the B8 head) | blocked after 3 verifier FAILs; continued as B10b on the same branch |
| B10b | Fail-closed quantity conversion (any pack wording not fully understood, or more than one pack, flags) | B10 branch | in progress (`boxt/task/B10-price-unit-polish`) |
| B9 | DEPLOY.md, OPERATIONS.md, README | B8 | final accuracy pass done (`eab30e2`, B10 merged in); to verify after B10b |

### B0: Strip to the shell; new stack scaffolding
- Delete the SQLite data layer (`src/server/db`, `better-sqlite3`), every feature, route, component, test,
  e2e spec and script not needed by this product: customer site and chat, `/demo`, `/test/ui`, visitor box,
  Customers, Orders, Stock, Analytics, Teams, quote lifecycle/revisions/expiry/notes/activity/upsells/PDF/
  pricing engine/floors/freight, persona cookie (`querent-persona`, R-4), `/api/test/*`, frames tooling.
- Keep: design tokens and fonts, the UI primitives still used, the rail look (rebuilt as
  `src/features/shell/` with exactly Quote creation tool / Quotes / Settings and "BOXT Packaging"),
  `src/server/matching/` and its tests, guard tests adapted (secrets guard, env example, disabled-test guard).
- Placeholder pages `/quote-tool`, `/quotes`, `/settings`; `/` redirects to `/quote-tool`.
- Add deps `@supabase/supabase-js`, `@supabase/ssr`, `pg`, dev `supabase` (CLI) and `@types/pg`; remove unused
  deps. `.env.example` and its test move to the variable list above.
- Bring `data/boxt-catalog.json` and `scripts/fetch-boxt-catalog.ts` from `origin/boxt-demo` (nothing else).
- Acceptance: typecheck, tests and build green; only the three rail items exist; `git grep` finds no
  `better-sqlite3`, `querent-persona`, `OILPRICEAPI`, `FEATURE_`, `DATABASE_PATH` outside docs.

### B1: Supabase schema, RLS, seed, repository
- `supabase/config.toml` (sign-ups off, site URL `http://127.0.0.1:3000`, redirect URLs, recovery template),
  migrations per "Database" above, `scripts/seed-boxt.ts` (`npm run db:seed:boxt`, idempotent upsert of the
  catalog and the example quote into `DATABASE_URL`), `scripts/db-reset.ts` (`npm run db:reset`: local
  stack only: `supabase db reset`, seed, local dev users), `npm run db:start|db:stop|db:env`.
- Repository modules (catalog, quotes, settings, activity) + `src/server/catalog.ts` cache.
- Boundary test adapted: Supabase queries and SQL only in `src/server/repository/`, migrations and scripts;
  service-role key only in `scripts/`.
- `npm run test:db`: repository round-trips; RLS: anon key reads nothing from every table; example quote
  cannot be deleted/updated; activity rows carry no customer text.

### B2: Auth
- `@supabase/ssr` server/browser clients, `src/proxy.ts`, `requireUser`/`requireApiUser`, `/login`,
  `/reset-password`, `/auth/confirm` (both `token_hash`+`type` via `verifyOtp` and `code` via
  `exchangeCodeForSession`), `/update-password`, sign-out in the rail. Logs `login`/`logout` activity.
- No sign-up route, link or call; no OTP/magic-link sign-in.
- Tests: unit (proxy decisions for every route class), `test:db` (signUp refused by the local stack),
  Playwright later in B8.

### B3: Packaging-aware matching, strictness levels, evaluation suite
- Extend the pure scorer per "Matching contract"; keep existing tests passing or update them where the
  Herrick behaviour no longer applies (state why in the commit).
- `src/eval/`: ≥ 30 hand-written Uline-style lines (`cases.ts`) grouped `must-match`
  (expected BOXT SKU) and `must-not-match` (near-identical wrong sizes, wrong materials, wrong pack
  quantities, items BOXT does not carry), run against the real catalog through the real scorer plus the
  judge fixture. Fails if any must-not-match line matches at the configured level. `npm run eval:report`
  prints precision and no-match rate per level; calibrate `LEVELS` with it (Strict = 0 false positives,
  also with an always-agreeing judge).

### B4: LLM parser and judge with fixtures
- Per "LLM contract". Uses the `claude-api` skill. PDFs as `document` blocks (base64), processed in memory.
- Scripted parser/judge; zod validation; fail closed; bounded concurrency helper with timeout.
- Tests: schema validation, out-of-list SKU dropped, malformed → null, scripted fixtures, concurrency.

### B5: Quote creation tool
- `pipeline.ts` (parse → retrieve → judge → decide, progress callback), `/api/quote-tool/match` stream,
  `/api/catalog/search`, `/api/quotes` POST, the `/quote-tool` page (textarea, PDF upload, 200-line cap,
  4 MB cap, progress) and `QuoteReviewDialog` (ItemPopup's visual language).
- Review dialog: matched lines (customer's original text, description, SKU, pack, qty editable and flagged
  if unclear, empty price input, "Web list: $0.84/each" label, line total, Swap, Remove); unmatched lines
  ("Could not detect a match", expandable near-misses with "Use this item"); customer name, reference,
  total; Save disabled until every matched line has a price and quantity. Saves unmatched lines flagged.

### B6: Quotes list and detail
- `/quotes`: customer, reference, lines, total, created by, created at; example quote marked. `/quotes/[id]`:
  lines (item, SKU, qty, unit price, line total), unmatched lines with original text, total; edit qty/price,
  customer, reference; delete with confirm (not on the example).

### B7: Settings
- `/settings`: Match strictness (Strict / Balanced / Lenient, default Strict) with a short description of each,
  saved to `org_settings`, `settings_change` activity; "Other settings coming soon."

### B8: E2E, access control, CI
- Playwright: login; reset-password request (email lands in Mailpit, link sets a new password); paste →
  match → review → price → save; PDF upload (fixture PDF); unmatched → near-miss → Use this item; edit and
  delete a quote; example quote not deletable. Access control: every page and API rejects unauthenticated
  requests; `/signup` does not exist; RLS anon test. Screenshots for the final report.
- `.github/workflows/ci.yml`: install, typecheck, unit tests, build, start local Supabase, db:reset,
  test:db, Playwright.

### B10: Price-unit correctness and UI polish
- One pricing unit per line: quantity and unit price are both in the item's list-price unit (each, case, roll, coil...), labelled next to both inputs ("each", "per each") and matching the "Web list: $x/each" label; the customer's stated unit is converted when the pack makes it exact (10 bundles of 25 → 250 each, shown as "Customer asked for 10 bundles = 250 each") and otherwise flagged "Check quantity". Same unit shown on the Quotes detail page.
- Querent green accent everywhere (no teal); near-miss scores labelled consistently in the dialog and on the detail page, without implying a match on unmatched lines; plural units; "Not set" instead of "None"; the example quote's creator shown as "Example"; one Settings badge; consistent page widths.
- B8 test findings: strengthen `e2e/quotes.spec.ts:43`, non-empty function list and anon UPDATE/42501 checks in `e2e/access.spec.ts`, remove `isStaticAsset`'s top-level file allowance (only the matcher's explicit public files), scan `*.setup.ts` in the skip guard, edit customer/reference in the spec.

### B9: Docs
- `docs/boxt/DEPLOY.md`, `docs/boxt/OPERATIONS.md`, README section; verified against a local stack.

## Verification log

| Task | Sub-branch head | Verdict | Evidence |
|---|---|---|---|
| B3b | `c0f7271` | FAIL (B3b round 2) | Gates pass; memory flat; long inputs bounded; exact same-unit sizes; fractions; recall 37/37 new lines. 24 Strict FP from one class: defining choices the line leaves unsaid (hand/machine strapping, cast/blown film) and a missing size are not charged against the item, so Strict rested on the lead; 0.2% tolerance applied yd↔ft. Fix: item-side accounting of choices and full size at Strict. |
| B3b | `3a23f0d` | FAIL (B3b round 3) | Gates pass; structure, memory, long input, typed SKUs, attacked exceptions held; recall 90/97 new lines, no wrong item. 10 Strict FP, one cause: an item material the line leaves unsaid is skipped (foam rolls, foam-in-bag "Expandable Bags"); also "1/2 mil" parsed as 2 mil (wrong item at Balanced/Lenient); a few lines rest on the lead via unstated defaults (single wall, colourless mailers). Limit reached; one documented final fix round granted because the misses narrowed to one cause (35 → 14 → 24 → 10). |
| B3b | `70f33dd` | FAIL (final round, two scoped defects) | Gates pass except `npm test` flaky (eval test at the 5 s default timeout, 3 of 5 runs). Strict 0 FP on 405 new must-not lines and both mutation sweeps (190,736 word-add and 7,483 word-drop variants) except one defect: "thick" right after a size tuple is stripped as filler (13 lines, incl. plain IQRT40 for "18 x 24" Thick" while BOXT sells Extra Thick IQRT60). Recall 152/157 new lines. Material implications, defaults/variants, fraction parser, stand-ins all held. Decision: fix only these two mechanical defects and re-check with the verifier's own sweep scripts plus a scoped verifier, instead of another open-ended round. |
| B3b | `97677a0` | PASS (scoped, after the documented final fix) | typecheck 0; `npm test` 5/5 consecutive (770); build 0; eval: Strict 0 FP with recorded and always-agree judges on 1,035 lines, recall 95%; previous verifier's probes: 11 → 0 and 4 → 2 (the 2 accepted earlier as correct); self and drop-word sweeps identical; extra-word sweep 15,387 → 13,664 with no new match, all 200 non-filler matches inspected and benign; 92 new thickness attacks: 0 FP, 18/18 must-match. Notes accepted: "1/2\" thick bubble" names the 1/2\" bubble roll; gaylord "Pallet" lines pick the bundle-pricing tier (rep sets the price). |
| B10b | `4f60542` | FAIL (B10b round 1) | All earlier silent rows flag; gates, Playwright 22/22 twice, regression OK. Still silent under-quotes where pack wording is not recognised: label words ("pack size 50", "carton # 500"), "50 x 4 bundles" read as a size, number words and non-ASCII digits next to weak pack words. Realistic Uline lines: 19/40 flag (all differing-pack lines flag). Fix: two-part total accounting (scorer accounts the description against the chosen item; nothing but quantity phrase and SKU left in the raw line), independent of vocabulary. |
| B10 | `484d0c5` | FAIL (round 3) | Round-2 defect fixed for the reported lines; gates + Playwright 21/21 twice; regression holds. Blocking: pack phrases the parser does not read convert silently ("bdl/50", "cs/500", "case qty 500", "case (500)", "500 pc. per case", "master case", "in a case"), and only the first of two packs is read ("100/box 10 boxes/case, 2 cases" → 10x under-quote, saved unflagged). Blocked; B10b opened with a fail-closed rule. |
| B10 | `3c0b210` | FAIL (round 2) | All 7 round-1 findings fixed (cartons = cases; fractions flagged; unit required on save; flag shown after save via new `customer_quantity` column (additive migration, grants consistent, length-checked, anon 42501); KN100 per case of 12; E2E for flag and Swap; plurals; palette guard on all CSS; "Picked by rep"); gates + Playwright 20/20 twice. New blocking defect: a customer-stated pack size ("50/bundle, 2 bundles") is ignored after "Use this item" on a bundle-of-25 item (shown as exact 50 each). Auto-matching at Strict is safe (pack conflicts stay unmatched). |
| B10 | `ba429e0` | FAIL (round 1) | Core fix holds (qty unit, "per" label and web-list unit agree incl. after Swap/Use this item; server refuses wrong units; totals consistent; all B8 test findings fixed; gates + Playwright 19/19 twice). Blocking: "2 cartons" of a box sold in bundles of 25 silently saved as 2 each (carton treated as a piece noun). Also: fractional conversions shown as exact (62.5 each), server accepts a missing unit, saved flag not shown on detail, KN100 catalog anomaly, lost E2E for the flag, cosmetic plurals, narrow palette guard, inconsistent rep-pick wording. |
| B8 | `5392334` | PASS (merge after B3b) | typecheck 0; `npm test` 52 / 867; build with and without Supabase env; F1 runtime without env fails closed (307/401/500); `test:db` 60; Playwright 19/19 twice; probes: unguarded route caught by `guards.test.ts`, proxy-public unguarded route caught by the access spec, `test.skip` caught; RLS spec enumerates 5 tables, 1 view, 2 RPCs at run time. Findings go to B10: weak assertion `quotes.spec.ts:43`, function loop without non-empty check, `isStaticAsset` still allows top-level `/<name>.png` without session, setup files not scanned by the skip guard, edit spec lacks customer/reference; visual issues incl. a **price unit mismatch** (qty in bundles, price per bundle, web list per each). |
| B3b | `612506c` | FAIL (B3b round 1) | Gates pass; eval 430 lines Strict 0 FP; held-out 36 → 0. New attacks: 14 Strict FP in 3 classes: item head noun never required (Gaylord → Gaylord Lid, Paper → Paper Mailers, Hand Tape → Tape Dispensers); 0.5% tolerance on same-unit sizes (12.05x10x8 → 12x10x8); improper fractions (16/2 → 8). Cache ~1 MB/line (OOM at ~2,000 lines) and shared mutable objects; slow on 5,000+ digit numbers. Recall 35/39 on new lines. Unicode, units, labels, joining words, second values, glued tokens, keyword claims all held. |
| B7 | `0039b85` | PASS (scope B7; merge waits for B3b) | typecheck 0; `npm test` 43 / 657; build 0; `test:db` 55; 307/401 unauthenticated, cross-origin PUT 403, 10 bad bodies 400; UI change persists and is shared across users; activity `{from,to}` enums only; no strictness numbers duplicated. Notes: level descriptions are long (B3b owns them); pipeline must read the level per run (B5 does). |
| B5 | `d871e4a` | PASS (scope B5; merge waits for B3b) | typecheck 0; `npm test` 40 / 523; build 0; `test:db` 48; judge only on clearing lines and never alone (`decide`); one outcome per row; save re-reads catalog (forged description/list price ignored); caps before streaming (201 lines → 413, 4 MB+1 → 413, fake PDF → 400); stream ends with exactly one result/error; UI walkthrough (matched/unmatched, near-miss Use this item → rep, Save gating with reason, DB rows correct). Follow-up round: focus after Use, octet-stream PDFs, shared limits module. |
| B6 | `6e55b92` | PASS (round 2) | Round 1 (`ad546d0`) FAIL: quantity decimals not limited to `numeric(14,3)`. Fixed with `src/features/quotes/limits.ts`. Round 2: typecheck 0; `npm test` 38 files / 556; build 0; `test:db` 51; API: qty 1.2345/0.0001/0.0005 and price 0.12345 → 400 with field messages, exact storage for 1.235 and 0.1235; UI shows field errors and disables Save; edit-mode totals equal saved totals; example 409 on PATCH/DELETE; 307/401 unauthenticated; create → edit → delete flow. |
| B3 | `cd43017` | FAIL (round 3) | Gates pass; Strict FP with an always-agree judge: round 1: 12 (unexplained qualifiers), round 2: 22 (pack counts vs sides, L/W/H order, negation, single letters, units, bare sizes), round 3: 35 of 58 new lines (stop words drop "for … item"; extra sizes absorbed in any position; only first of repeated values kept; second closure/adhesive dropped; labelled bag sizes re-sorted length first; "-free"/"non-" claims pass; stated pack count ignored when catalog gives none; keywords confirm product type). Recall 94-97%. Blocked; B3b opened. |
| B2 | `0ff8c5c` | PASS | typecheck 0; `npm test` 30 files / 367; build 0 (with env); `test:db` 43; curl: every page → 307 `/login?next=`, every API → 401, cross-origin POST → 403, no open redirect (20+ attack `next` values), identical errors for unknown vs wrong password; reset end to end via Mailpit (link reuse → expired); Supabase signup → 422; `getUser()` everywhere, every page re-checks. Follow-ups: F1 build fails without Supabase env (call `connection()` first); F2 proxy matcher skips paths ending `.png` etc. (handlers still check); F3 stack-level magic link for existing users (document; app cannot complete it); F4 password change needs no old password (Supabase default). |
| B1 | `d2ee06f` | PASS | typecheck 0; `npm test` 25 files / 276; build 0; stack restarted from checkout; `db:reset` 1,555 rows + example + 2 dev users; `test:db` 32 pass; psql: RLS on all 5 tables, policies `authenticated` only, anon has no table/view/sequence/function privilege, view `security_invoker`; anon REST → 42501; signup → 422 `signup_disabled`; example quote refused for authenticated and service_role; bad line in `create_quote`/`update_quote` writes nothing; seed idempotent; planted boundary violations caught. Notes: metadata keys must come from a fixed list in app code; one misleading RPC error wording. |
| B4 | `6509674` | PASS | typecheck 0; `npm test` 21 files / 244 tests offline; build 0; only `client.ts` names a model or reads the key; probes: case/space-variant SKU → null, empty candidates → no call, 201 rows refused, 4 MB+1 PDF refused, `judgeAll` ≤ 2 in flight with concurrency 2, timeouts abort. Follow-ups for B5: bound the parse time to fit the route's `maxDuration`; consider `strict` tools after an SDK upgrade. |
| B0 | `90a07a5` | PASS | typecheck 0; `npm test` 13 files / 147 tests; build routes only `/`, `/quote-tool`, `/quotes`, `/settings`; acceptance grep empty; curl: `/` 307 → `/quote-tool`, old routes 404; planted skip/key violations fail the guards; matching/llm untouched. Notes: Dialog.module.css kept for B5; `catalog.test.ts` excluded until B3; sign-out endpoint pending B2. |

## Follow-ups
- F1 (B2): `createSupabaseServerClient` reads env before `cookies()`, so `next build` fails without Supabase env. Fix in B8 (call `connection()`/`cookies()` first; CI also sets env).
- F2 (B2): `src/proxy.ts` matcher excludes any path ending in an image extension, including `/api/...png`. Fix in B8 (exclude only `/_next/*` and real public files).
- F3 (B2): the hosted Auth server can still send a magic link to an existing user via its own API; the app has no way to complete it. Document in DEPLOY/OPERATIONS (B9).
- F4 (B2): `secure_password_change` off; document as a follow-up with MFA (B9).

## Open assumptions
- "The rep can edit … and delete their quotes": every signed-in user can edit or delete any quote (one
  company, all users equal); only the example quote is protected.
- The example quote is read-only as well as non-deletable, so it stays a clean example.
- The judge is only called for lines whose scorer result clears the threshold (a line that does not clear is
  No match whatever the judge says), which saves API calls without changing any outcome.
- No real judge recording is possible in the build session (no API key); the judge fixture is hand-written
  to mimic a conservative judge, and `npm run eval:record` re-records it with a real key. Strict is also
  required to give zero false positives with an always-agreeing judge, so it does not rely on the fixture.
