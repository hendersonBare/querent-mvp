# Querent v3 plan

Tasks for the v3 build. The spec is `docs/plans/spec.md`; final decisions are in `docs/plans/decision-log.md`; status is in `docs/plans/status.md`. Every task is one reviewable PR titled `[<task-id>] <title>`, on branch `task/<task-id>-<slug>`, squash-merged.

## Claiming work

1. Before claiming, run `git worktree list` and `git branch -a`. If any worktree or branch name contains the task ID, skip that task: someone has it. Also skip any task that `docs/plans/status.md` lists as merged (its branch is deleted after merge, step 7).
2. A task is claimable only when every task it is blocked by is merged to `main`.
3. Claim by creating a worktree and branch named `task/<task-id>-<slug>` from the latest `main`.
4. At most 3 agents work at once.
5. A PR merges only when ALL tests pass (typecheck, Vitest, build, the touched Playwright specs) AND the validation agent approves. Fix agents work on the same branch. Anything failing either gate stays unmerged (at most 3 fix-and-validate rounds, then label `blocked` and record why in `status.md`).
6. Test-driven: write failing tests first in every task, and show them fail.
7. After the PR merges, record the task as merged in `docs/plans/status.md`, then remove the worktree and the branch.

## Rules for every task

- Gates: `npm run typecheck && npm test && npm run build`, plus the touched Playwright specs against a production server on a free port with its own `DATABASE_PATH`.
- All SQL stays in `src/server/repository/` (and migrations in `src/server/db/`). Customer-facing code never touches cost or margin.
- New money math uses integer cents and `src/lib/money.ts` (after T1).
- Migrations: take the next free number on `main` when the PR is opened, and renumber when rebasing if `main` gained one. A table rebuild is written against `main`'s schema at merge time (all current columns). Migration ids must be contiguous (`001`…`N`); a test enforces it.
- Mark deferred work as `TODO(R-n)` with an ID from the decision log's registry. Planned placements: R-2 in `.env.example` and beside each key read in `src/` (T1); R-3, R-7, R-8 in `src/server/quotes/aging.ts` (A2, deferred reminders); R-10, R-11 in `src/server/freight/cost-model.ts` (C1); R-9 in `src/server/freight/fuel-price.ts` (C3); R-12 in `src/server/rep/http.ts` (D1); R-1 in `src/server/team/metrics.ts` (D3); R-4, R-5, R-6 in `src/server/session.ts`, `src/server/repository/chat.ts`, `src/app/api/test/*` (F1); R-13 in the registry only (tooling, nothing in `src/`).
- Keep the diff to the task. Unrelated issues go to `docs/plans/unrelated-issues.md`.

## Dependency graph

The table is authoritative. Lanes A, B, C and E start after T1; D starts after A2; C3 waits for D1; D3 waits for D2, C1 and E1; F1 is last.

| ID | Lane | Blocked by |
|---|---|---|
| T0 | T | none |
| T1 | T | T0 |
| A1 | A | T1 |
| A2 | A | A1 |
| B1 | B | T1 |
| C1 | C | T1 |
| C2 | C | C1 |
| C3 | C | C2, D1 (OA-14) |
| D1 | D | A1, A2 |
| D2 | D | D1 |
| D3 | D | D2, C1, E1 |
| E1 | E | T1 |
| F1 | F | every other task |
| U0 | U | none |
| U1 | U | none |
| U2 | U | U0, U1 |
| U3 | U | U2 |
| U4 | U | U2 |
| U5 | U | U2 |
| U6 | U | U2 |
| U7 | U | U6 |
| U8 | U | U7 |
| U9 | U | U8 |
| U10 | U | U0 |
| U11 | U | every other U task |

Lane U (the new UI, decisions 41 to 62) is detailed in its own part at the end of this file.

---

## T0: Tooling without Notion

- **Scope:** Remove Notion from the agent tooling and point it at `docs/plans/plan.md` with the claim rule.
- **Blocked by:** none. **Lane:** T.
- **Files:** `AGENTS.md`, `README.md` (the "Working on this repo" and Notion lines only), `docs/design/README.md` (Notion lines only), `.claude/skills/querent-task-loop/SKILL.md`, `.claude/skills/querent-verify/SKILL.md`, `.claude/agents/implementer.md`, `.claude/agents/verifier.md`, `.gitignore` (`.agents/`, `.codex/`), `src/tooling.test.ts` (new).
- **Tests first:** `src/tooling.test.ts`: no file under `AGENTS.md`, `.claude/agents/`, `.claude/skills/querent-*` mentions "Notion" or `notion`; the task-loop skill contains the claim rule text (`git worktree list`, `git branch -a`, `task/<task-id>-<slug>`).
- **Migration:** none.
- **Rollback:** revert the PR.
- **Acceptance:** no Notion references in the four agent/skill files or `AGENTS.md`; the task loop reads tasks from `plan.md`, claims by worktree + branch, runs at most 3 agents, merges only on both gates, fixes on the same branch; the verifier records its verdict on the PR only; `.agents/` and `.codex/` are deleted if present and ignored.

## T1: Migrations, shared money helper, env cleanup

- **Scope:** Numbered SQL migrations with adoption of v4 databases, one money helper replacing three rounding copies, `.env.example`.
- **Blocked by:** T0. **Lane:** T.
- **Files:** `src/server/db/migrate.ts` (new), `src/server/db/migrations/001_baseline.sql` (new), `src/server/db/index.ts`, `src/server/db/schema.ts` (keep the exported constants, drop the DDL and `SCHEMA_VERSION`), `src/server/repository/erp.ts`, `src/lib/money.ts` (new), `src/server/quotes/snapshot.ts`, `src/server/freight/engine.ts`, `src/server/repository/sql.ts`, `scripts/reset-db.ts`, `.env.example` (new), `.gitignore`, tests beside each.
- **Tests first:** `migrate.test.ts` (fresh build, v4 fixture equality, adoption, refusal of other versions, rollback on failure, set-difference order, contiguous ids); `money.test.ts` (rounding table incl. 1.005, negative values, equality with the old helpers); `env-example.test.ts` (every key from decision 9 present, placeholders only, no `JEV_API_KEY`, `.env.example` not ignored); `secrets-guard.test.ts` (the names `ANTHROPIC_API_KEY` and `OILPRICEAPI_KEY` appear in `src/` only in an allow-listed set of key-reading modules; no `console.*` call logs a key variable).
- **Migration:** `001_baseline.sql` = v4. Existing v4 databases are adopted as already at 001.
- **Rollback:** revert the PR; a database touched by it only gained a `schema_migrations` table, which the old code ignores (it checks `meta.schema_version`, still 4). Restore the volume backup otherwise.
- **Acceptance:** app starts on a fresh DB and on a v4 DB; `db:reset` builds through migrations and reads `.env.local`; one rounding function is used by snapshot, freight and repository; all existing tests green; README deploy step updated to "migrations run on start; back up the volume first".

## A1: Declined status, decline API and dialog

- **Scope:** The `declined` status, its transition, the customer decline API and dialog, rep unread + activity, and the "Declined" chip.
- **Blocked by:** T1. **Lane:** A.
- **Files:** next migration (`002_declined.sql`), `src/domain/quotes.ts`, `src/server/quotes/lifecycle.ts`, `src/server/customer-response/service.ts`, `src/server/quotes/service.ts`, `src/server/repository/quotes.ts`, `src/app/api/query/customer/quotes/[id]/decline/route.ts` (new), `src/components/customer/quote-preview/ResponseBar.tsx` (+ dialog), customer quotes sidebar chip, rep quote list filter/chip, rep quote header + activity, `e2e/decline.spec.ts` (new).
- **Tests first:** lifecycle (decline only from sent, final, label); migration rebuild test (rows, FKs, every column kept, new CHECK rejects bad reason/long note); service (each reason, Other 250 limit, no reason, idempotency, expired → 409, activity row, unread); route test deep-scans for cost and for the note; component test for the dialog (Cancel/X no change, Decline with no reason); Playwright: customer declines a sent quote with a reason, chip reads Declined, rep sees unread badge and reason.
- **Migration:** rebuild `quotes` (spec 1.2).
- **Rollback:** restore the volume backup (a rebuilt table cannot be un-migrated); revert the PR.
- **Acceptance:** decision 13–15 hold; the note never reaches the customer or the PDF; `boundary.test.ts` green.

## A2: Aging, Needs attention, badge, touch and view clocks

- **Scope:** Derived aging levels, the Needs-attention filter and sort, the red header badge, `last_rep_touch_at`, `customer_viewed_at`.
- **Blocked by:** A1. **Lane:** A.
- **Files:** next migration (`003_quote_touch.sql`), `src/server/quotes/aging.ts` (new), `src/server/repository/quotes.ts`, `src/server/repository/settings.ts` (aging getters with defaults), `src/server/rep/quotes.ts`, `src/server/rep/badges.ts`, `src/app/api/rep/quotes/route.ts`, `src/app/api/rep/badges/route.ts`, rep quote GET/edit paths (touch), customer quote read path (view), `src/components/rep/quotes/QuotesList.tsx`, `src/components/rep/RepShell.tsx`, quote header marker, seed (a few aged quotes), `e2e/rep-aging.spec.ts` (new).
- **Tests first:** `aging.test.ts` (every boundary, expiry rule, worse wins, final null, overrides); repository tests for touch/view writes (owner open touches; customer view sets); list filter + sort; badge counts red only; component test for icon + text label; Playwright: aged quotes show Aging/Overdue, Needs attention filter, badge count.
- **Migration:** add two nullable columns.
- **Rollback:** revert the PR; the extra columns are harmless to old code.
- **Acceptance:** decision 16 and 18 hold with defaults; settings overrides honoured by the pure function (edit UI comes in D1).

## B1: Chat transcript drawer

- **Scope:** "View full chat" with message count and a paged side drawer on the rep quote detail.
- **Blocked by:** T1. **Lane:** B.
- **Files:** `src/server/repository/chat.ts`, `src/app/api/rep/quotes/[id]/messages/route.ts` (new), `src/components/rep/quote-detail/QuoteDetailView.tsx` (`RequestPanel`), `src/components/rep/quote-detail/chat-drawer/*` (new), `e2e/chat-drawer.spec.ts` (new).
- **Tests first:** repository paging (50, `before`, count, order); route (owner 200, other rep 404, customer 403); component (customer emphasis, assistant collapsed to one line and expands, Load earlier); Playwright: open Q-24817, see "N messages", open drawer, see Dana's request.
- **Migration:** none.
- **Rollback:** revert the PR.
- **Acceptance:** decision 26 holds; no AI summary; compact box unchanged.

## C1: Delivery cost model and pool rate

- **Scope:** Pure modelled delivery cost, pure pool-rate and ramp math, the repository query for pool inputs, the settings getters, and the recovery columns.
- **Blocked by:** T1. **Lane:** C.
- **Files:** next migration (`004_freight_recovery.sql`), `src/server/freight/cost-model.ts` (new), `src/server/freight/pool.ts` (new), `src/server/repository/freight.ts` (new: pool inputs, cached pool rate), `src/server/repository/settings.ts` (freight getters), `src/domain/` types, tests.
- **Tests first:** cost-model worked examples (4213¢, 4838¢ with stop), zero fuel, diesel; pool (eligibility, cold start < 20, cap, ramp days 0/29/30/60/200, rounding to bp, worked examples in spec 4.4); repository pool query on fixtures; daily cache.
- **Migration:** add nullable/defaulted columns only.
- **Rollback:** revert the PR; added columns are ignored by old code.
- **Acceptance:** spec 4.2 and 4.4 reproduced to the cent/bp; no price changes yet.

## C2: Margin-weighted allocation and quote integration

- **Scope:** Allocate recovery per line, freeze the rate at creation, the $0 freight line under free delivery pricing, totals/snapshot using the customer-facing price, override drops recovery, draft repricing, "Why this price?" text.
- **Blocked by:** C1. **Lane:** C.
- **Files:** `src/server/freight/recovery.ts` (new), `src/server/freight/engine.ts` (free-delivery rule), `src/server/intake/quote-request.ts`, `src/server/rep/quote-math.ts`, `src/server/rep/quote-edits.ts`, `src/server/rep/quote-panel-edits.ts`, `src/server/quotes/snapshot.ts`, `src/server/repository/quotes.ts`, `src/components/rep/quote-detail/LineGrid.tsx` (recovery line), quote header chip, tests.
- **Tests first:** allocation (decision-log example, qty rounding, all-zero margins, contract exempt, cap, tie), engine rule (on → $0 with radius kept; off → unchanged), integration: intake freezes rate, override zeroes recovery and logs, toggle change reprices drafts on next open, sent quotes unchanged, snapshot unit price includes recovery, customer payload has no recovery fields.
- **Migration:** none.
- **Rollback:** revert the PR; with the toggle off (default) behaviour is unchanged, so the toggle being off is also the immediate mitigation.
- **Acceptance:** spec 4.1, 4.5, 4.6 hold; with the toggle off every existing test and price is unchanged.

## C3: Pricing & Delivery controls, impact preview, ramp, fuel price client

- **Scope:** Manager-only settings UI and routes for the toggle, cost inputs, rates, caps and ramp; the impact preview gate; the OilPriceAPI client with daily caching and fallbacks; pool panel.
- **Blocked by:** C2, D1. **Lane:** C.
- **Files:** next migration (`005_fuel_prices.sql`), `src/server/freight/fuel-price.ts` (new), `src/server/freight/preview.ts` (new), `src/server/repository/freight.ts`, `src/app/api/rep/settings/freight/route.ts` + `preview/route.ts` (new), `src/components/rep/settings/PricingDelivery.tsx` (+ new cards), seed (UT gasoline price), `e2e/free-delivery.spec.ts` (new).
- **Tests first:** fuel client with a fake source (one fetch per state per day, `Token` header shape asserted on the fake request, failure → last price, stale warning, none → manual, manual wins, diesel never fetched, key never in responses/logs); preview math on fixtures; enable refused without a recent preview; manager-only (rep 403); component tests; Playwright: manager views preview, enables, sees ramp and pool.
- **Migration:** new table.
- **Rollback:** turn the toggle off (immediate); revert the PR.
- **Acceptance:** decisions 28, 30, 35, 36 hold; no real API call in any test; key never sent to the client.

## D1: Roles, team label, deactivation, aging settings

- **Scope:** `rep`/`manager` roles, `managerRoute`, Mara/Eli server personas, team label, inactive reps (blocked while they have customers), manager-only aging thresholds card.
- **Blocked by:** A1, A2. **Lane:** D.
- **Files:** next migration (`006_roles.sql`), `src/server/session.ts`, `src/lib/contracts.ts` (`rep_role`), `src/server/rep/http.ts` (`managerRoute`), `src/server/repository/accounts.ts`, `src/app/api/rep/team/reps/*` (new), `src/app/api/rep/settings/aging/route.ts` (new), `src/components/rep/settings/*` (Reps card, Aging card), `e2e/rep-roles.spec.ts` (new).
- **Tests first:** managerRoute (manager 200, rep 403, customer 403, none 401); deactivate refused with customers, allowed after reassignment; team label; aging settings validation; personas; Playwright: Mara cannot see manager settings, Brandi can.
- **Migration:** add columns; Brandi → manager.
- **Rollback:** revert the PR; added columns ignored by old code.
- **Acceptance:** decision 20, 21 (deactivation) and 16 (manager-only edit) hold.

## D2: Reassignment and All-reps scope

- **Scope:** Single and bulk quote reassignment with activity, `original_rep_id`, customer reassignment with "also move open quotes", All-reps scope with Rep column and filters, manager read-only view of any quote (including the chat drawer).
- **Blocked by:** D1. **Lane:** D.
- **Files:** next migration (`007_original_rep.sql`), `src/server/repository/quotes.ts`, `src/server/repository/accounts.ts`, `src/server/rep/quotes.ts`, `src/app/api/rep/quotes/reassign/route.ts` (new), `src/app/api/rep/quotes/route.ts`, `src/app/api/rep/quotes/[id]/route.ts` + messages route (manager read), `src/app/api/rep/settings/assignments/route.ts`, `src/components/rep/quotes/QuotesList.tsx`, quote detail read-only mode, settings assignments, `e2e/rep-reassign.spec.ts` (new).
- **Tests first:** reassign single/bulk (activity who/from/to, `original_rep_id` unchanged, inactive target refused, rep 403); customer move with/without checkbox; every write route refuses a manager on another rep's quote; manager GETs succeed read-only; list scope/filters; Playwright: Brandi opens Mara's quote read-only, reassigns it, edits after.
- **Migration:** add `original_rep_id`, backfill.
- **Rollback:** revert the PR; the column is ignored by old code.
- **Acceptance:** decisions 21 and 22 hold; reps still see only their own quotes.

## D3: Team dashboard

- **Scope:** Manager-only `/rep/team`: leaderboard, rep multi-select, team filter, date presets and custom range, drill-down, untouched reasons, CSV.
- **Blocked by:** D2, C1, E1. **Lane:** D.
- **Files:** `src/server/repository/team.ts` (new), `src/server/team/metrics.ts` (new), `src/app/api/rep/team/metrics/route.ts` + `metrics.csv/route.ts` (new), `src/app/rep/team/page.tsx` (new), `src/components/rep/team/*` (new), `src/components/rep/RepShell.tsx` (nav), `e2e/team-dashboard.spec.ts` (new).
- **Tests first:** each metric on a fixed fixture (spec 7), null denominators, window edges, untouched reasons, CSV columns via `export/csv.ts`, manager-only; component (totals row, multi-select); Playwright: compare two reps, drill into decline reasons.
- **Migration:** none.
- **Rollback:** revert the PR.
- **Acceptance:** decisions 23–25 hold; live SQL only.

## E1: "Frequently bought together" in the item pop-up

- **Scope:** Server-built cost-free candidate pool, LLM selection validated against the pool (scripted deterministic), payload without prices, add at qty 1 with `added_by='suggestion'`, offered count recorded.
- **Blocked by:** T1. **Lane:** E.
- **Files:** next migration (`008_suggestion_lines.sql`), `src/server/customer/suggestions.ts` (new), cost-free rule helper extracted from `src/server/upsells/rules.ts` only if needed, `src/server/repository/customer.ts`, `src/domain/chat.ts`, item-popup route, `src/components/customer/ItemPopup.tsx`, `src/server/intake/quote-request.ts` (accept `added_by` for suggestion lines), `e2e/popup-suggestions.spec.ts` (new).
- **Tests first:** pool filter (stock at branch, not in cart, in catalog); validator drops invented SKUs; scripted determinism; payload deep-scan (no price/cost keys); `boundary.test.ts` green; migration rebuild test; Playwright: scripted chat → pop-up shows ≥ 2 suggestions → add one → request quote → line is `suggestion`.
- **Migration:** rebuild `quote_lines` and `quote_removed_lines`.
- **Rollback:** restore the volume backup; revert the PR.
- **Acceptance:** decision 37 holds; the model can never introduce a SKU.

## F1: Personas, seed, demo script, docs, TODO registry

- **Scope:** Chooser personas, the full demo seed, `docs/demo-script.md` with its Playwright spec, README and ERP doc refresh, `docs/todo-registry.md` and its guard.
- **Blocked by:** every other task. **Lane:** F.
- **Files:** workspace chooser component, `src/server/db/seed/*`, `docs/demo-script.md` (new), `e2e/demo-script.spec.ts` (new), `README.md`, `docs/erp-integration-readiness.md`, `docs/todo-registry.md` (new), `src/todo-registry.test.ts` (new), `TODO(R-4/5/6)` markers.
- **Tests first:** seed test (aging mix relative to reset time, > 20 eligible accepted delivery quotes in 90 days across three reps, every status incl. declined with reasons and expired); registry guard; Playwright demo spec (five acts, scripted mode).
- **Migration:** none.
- **Rollback:** revert the PR.
- **Acceptance:** decisions 11, 38–40 hold; every reset gives the same amber/red/fresh mix; the computed pool rate shows next to the starting rate.

---

# Lane U: the new UI (charcoal canvas)

Reproduce the approved design canvas. Do not improve or reinterpret it. Decisions 41 to 62 in `docs/plans/decision-log.md` govern this lane; the decision log wins over everything except the product owner's answers in chat.

## Sources, in order of authority

1. **Canvas frames** `docs/design/canvas-frames/C_<id>.dc.html` (89, indexed by `canvas.json`, runtime `support.js`). Read them as live DOM with the tools in `scripts/frames/`: `npm run frames -- list`, `npm run frames -- dump <id> [--text=...] [--selector=...]` (exact sizes, colours, copy), `npm run frames -- compare <id> <app-url> --cookie=querent-persona=<persona>` (frame at 1440x900 vs the app at 1920x1080; widths ignored unless `--width`). In tests import `startFrameServer`, `openFrame`, `measureAll`, `diffMeasures`, `STYLE_PROPS` from `scripts/frames/lib.mjs` and assert against the frame's live values, never hard-coded numbers. Frames are static: each opened control is its own frame, so drive the app into that state with Playwright, then compare. There are no screenshots and screenshots are not evidence.
2. `docs/design/new-ui-implementation-prompt.md` Parts 1 and 2 and Appendices A to H (behaviour, roles, data model, API, copy rules). Its Part 3 is superseded by this lane.
3. `docs/design/new-ui-refactor-prompt.md`, section "Frame-to-route map": the only frame-to-route mapping.
4. `docs/design/new-ui-style-guide.md`: the token sheet. Where it conflicts with a frame, the frame wins and the guide is fixed in the same PR.
5. `AGENTS.md` and the decision log. Read `node_modules/next/dist/docs/` before routing, layout, data fetching or font code.

## Rules for every lane U task

- **Fidelity.** Every UI change traces to a frame id in the map. Exact values (px, hex, type size and weight, radius, gaps, fixed column widths, copy) come from the frame's own styles; no eyeballing, no Tailwind or library defaults. Copy is literal: no em-dashes, no added descriptions, helper text, icons or buttons.
- **No frame, no invention.** A screen, state or control without a frame gets the minimum needed to function in the same tokens, is listed in `docs/plans/status.md` under "No frame", and is raised with the orchestrator, who asks the product owner.
- **Placeholder data** (Appendix G: analytics numbers, impact preview table, rep margins, board counts, weekly chart, Provo hours, the Herrick site, notification and order samples) is not product data. Wire real data; never copy a placeholder number into code.
- **Design markers** ("FEATURE FLAG: HIDDEN" badges, dashed outlines) are never rendered.
- **Viewport.** Build and verify at 1920x1080. The rail is 216px, `position: sticky; top: 0; height: 100vh`. The page area is fluid. Sizes come from the frames; widths the frame sets by flex or grid grow; fixed widths (for example editor columns Qty 60, Unit price 118, Margin 78, Total 82) stay. No max-widths, no type scaling, no stretched controls. Scrolled frames (C_AN1, C_AN5) are one long page.
- **No phone or tablet layouts** (decision 43). No breakpoints, hamburger drawers or stacked-card tables. Delete the old responsive CSS of every page a task replaces, and the old specs that only test it.
- **Untouched areas** (Appendix F): pricing and margin math, freight, SKU matching, PDF export, ERP sync, aging rules, reassignment rules, customer chat tools, demo personas and seed data (new tables may get seed rows for their own data), `/api/test/*`. Demo auth and cookies stay as they are (decision 49).
- **Hover, focus, loading, disabled, empty, error:** only as "States not drawn" in the style guide. Nothing else without a frame.
- **Docs.** Each task updates the parts of `docs/plans/spec.md` and the "Intentional differences" in `docs/design/README.md` that describe the old UI it replaces, and updates existing tests that name old UI text (Appendix H).
- **Frame proof (verifier gate).** For every frame the task maps: a Playwright spec (`e2e/frames-<area>.spec.ts`) signs in as the right persona at 1920x1080, drives the app into the frame's state, and diffs it against the frame with `scripts/frames/lib.mjs`. It also asserts the rail is 216px wide and that extra width goes only to fluid regions. The PR body and the verifier record, per frame, PASS (zero unexplained differences, no missing elements) or each difference with the frame value and the app value and why it is explained (placeholder data per Appendix G, viewport height, a decision). An unexplained difference fails the task.
- **Status.** Each task adds its frames to the "Lane U frame ledger" in `docs/plans/status.md` (PASS, deferred with reason, or no-frame) and anything under "No frame".
- Personas for the gate: manager = cookie `querent-persona=supplier` (Brandi), rep = `mara`, customer = `customer` (Dana), visitor = no cookie. The frames draw the rep views for "Brandi Gallegos"; names and numbers in the frames are placeholders.

## U0: Tokens and primitives

- **Scope:** Albert Sans (400 to 800) and Geist Mono (400, 500) through `next/font`, replacing Archivo and IBM Plex. The charcoal palette and sizes as CSS variables. Shared primitives built once: `PageHeader` (title, slot for picker or search, `FilterButton`, slot for caution and bell), `FilterButton` and filter panel (checkbox groups, segmented controls, "Clear all", "Apply filters", count badge when active), `DataTable` (gray header, `::` drag handle on every column, columns picker at the end of the header row, drag to reorder with a keyboard alternative, "Show N more" paging), `Toggle`, `StatusText`, `ViewNoteButton`, `Sheet`, `Popover`, `Dropdown`, `CustomerPicker` (first 5, scroll, search narrows). Per-user column order and visibility: table `ui_table_prefs` with `GET/PUT` routes. Thin 8px scrollbars.
- **Frames (acceptance):** C_QOB2 (filter panel pattern), C_QOB1 (customer picker), C_QOT2 (columns picker), C_QOB8 / C_QOT6 (reorder) as the component-level reference. Their page-level proof is in U3.
- **Blocked by:** none. **Lane:** U.
- **Files:** `src/app/layout.tsx`, `src/app/rep/layout.tsx` (fonts only), `src/app/tokens.css` (new) or `globals.css`, `src/components/ui/*` (new), next migration (`009_ui_table_prefs.sql`), `src/server/repository/table-prefs.ts` (new), `src/app/api/rep/table-prefs/route.ts` (new), tests beside each. A test-only fixture page that renders the primitives for Playwright is allowed if it returns 404 unless `QUERENT_E2E_RESET=1` (list it under "No frame" as test tooling).
- **Tests first:** token values equal the frames' computed values (read through `scripts/frames/lib.mjs` in a Playwright spec, not typed by hand); component tests per primitive (filter panel Clear all and Apply, count badge, picker first 5 plus search, columns picker hides and restores, reorder by keyboard, Show N more); table prefs repository and route (per user, per table; a rep cannot write another user's prefs); migration test.
- **Migration:** add `ui_table_prefs(user_id, table_id, column_order, hidden_columns, PRIMARY KEY(user_id, table_id))`.
- **Rollback:** revert the PR; the table is ignored by old code.
- **Acceptance:** fonts and tokens match the frames; each primitive's computed styles match its frame element; no page is restyled yet beyond fonts.

## U1: Scope and roles

- **Scope:** Remove the header "Viewing" picker and `SCOPE_PARAM` propagation from nav links, and the "My quotes / All reps" switch (`?scope=all`, `REPS_PARAM`, `isAllReps`). Server scoping becomes purely role based: a rep only ever reads their own customers, quotes, orders and analytics; a manager reads the whole organization. `?customer=` stays only as a page-local filter. Managers still edit only their own quotes and open other reps' quotes read-only (decision 22). Role switch is not built (decision 42).
- **Frames:** none (server and scope). The picker removal is proven visually in U2.
- **Blocked by:** none. **Lane:** U.
- **Files:** `src/components/rep/scope.ts`, `src/server/rep/access.ts`, `src/server/rep/quotes.ts`, `src/app/api/rep/**` (quotes, analytics, badges, customers or orders reads), `src/app/rep/**/page.tsx` server reads, `src/components/rep/quotes/QuotesList.tsx` (switch removal only), tests.
- **Tests first:** one test per `/api/rep` route family and per rep server page read proving a rep cannot read another rep's customers, quotes, orders or analytics, and a manager reads all; `?scope=all` is ignored; nav links no longer carry `?customer=`.
- **Migration:** none.
- **Rollback:** revert the PR.
- **Acceptance:** Appendix B scoping holds through every route; existing reassign and read-only rules unchanged.

## U2: Shell

- **Scope:** Replace `RepShell` and `RepHeader` with the left `Rail` (216px charcoal, logo, supplier name, nav with icons, user block with name, role and **Sign out**). Manager nav: Quotes, Customers, Orders, Stock, Analytics, Teams and Reps, Settings. Rep nav: Quotes, Customers, Orders, Stock, My Analytics, Settings. Remove `PortalSearch` and the avatar menu. The page header on every rep route uses `PageHeader` with the caution (Needs attention) and bell dropdowns; neither redirects. `GET /api/rep/badges` returns counts plus short summaries (id, label, one line) for both dropdowns. Route renames (decision 46): move `/rep/items` to `/rep/stock` and `/rep/team` to `/rep/teams` unchanged in content, with permanent redirects from the old paths (including `/rep/items/[id]`), and update links, tests and docs.
- **Frames (acceptance):** the rail as drawn on every page frame (prove on C_QOBoard for M and C_RQBoard for R, `--selector=aside` or equivalent), C_QOB3 (caution open), C_QOB4 (bell open), C_QOB9 (sign out).
- **Blocked by:** U0, U1. **Lane:** U.
- **Files:** `src/components/rep/Rail.tsx` (new), `src/components/rep/RepShell.tsx` (replaced), `src/app/rep/layout.tsx`, `src/server/rep/badges.ts`, `src/app/api/rep/badges/route.ts`, `src/app/rep/stock/**` and `src/app/rep/teams/**` (moved), `next.config.ts` or `proxy.ts` (redirects), `e2e/frames-shell.spec.ts` (new), affected e2e specs.
- **Tests first:** Rail nav per role (manager sees Teams and Reps and Analytics; rep sees My Analytics and not Teams and Reps); Sign out clears the session; badges summaries shape and counts (caution: red and amber, bell: unread events); old paths answer 308 to the new ones; frame spec for the rail, QOB3, QOB4, QOB9.
- **Migration:** none.
- **Rollback:** revert the PR.
- **Acceptance:** every rep page renders in the new shell; rail is 216px and sticky at 100vh; the dropdowns never navigate on open.

## U3: Quotes list

- **Scope:** `/rep/quotes` Board and Table views sharing one toolbar (customer picker, Filter, Board/Table toggle). Board columns Draft ready, Changes requested, Sent, Accepted, Expired, Declined with counts and "Show N more", draggable column headers. Table columns Quote, Customer, Requested, Status, Total, Margin, plus Rep for a manager, columns picker, per-user prefs. Filter: status, Rep (manager only), Customer, Requested from and to, Only show Overdue, Aging, Below margin floor. Quote preview, View note, Show more. No bulk reassign on this page (decision 45): remove it.
- **Frames (acceptance):** C_QOBoard, C_QOB1, C_QOB2, C_QOB5, C_QOB6, C_QOB7, C_QOB8, C_QOTable, C_QOT1 to C_QOT7 (manager); C_RQBoard, C_RQB1, C_RQB2, C_RQTable (rep).
- **Blocked by:** U2. **Lane:** U.
- **Files:** `src/components/rep/quotes/*` (rewritten), `src/app/rep/quotes/page.tsx`, `src/app/api/rep/quotes/route.ts` (filters), `e2e/frames-quotes.spec.ts` (new), `e2e/rep-quotes.spec.ts`, `e2e/rep-aging.spec.ts`, `e2e/rep-reassign.spec.ts` (bulk part moves to U7).
- **Tests first:** filters (each field, Only show), board counts from real data, Show N more paging, picker search, view note, preview, column prefs persist per user, rep sees no Rep column or Rep filter; frame spec per frame.
- **Migration:** none.
- **Rollback:** revert the PR.
- **Acceptance:** every mapped frame PASS; Needs attention lives in the caution dropdown plus the Overdue and Aging filter.

## U4: Quote editor

- **Scope:** `/rep/quotes/[id]` per the frames: minimal header (customer, quote number, status with Overdue or Aging time frame, purchasing agent, requested, valid until); total box with total, gross profit, margin with floor, and **Approve and send**; Save draft, Export, Chat and More icon buttons; Quote details dropdown; Show cost and stock toggle (Available and Cost appear between Qty and Unit price; fixed widths Qty 60, Unit price 118, Margin 78, Total 82); + Add item row with results dropdown; Suggested by Querent bar; three-column Line details; 34px centre line. Remove the checks box, the Add item search box, the totals under the lines, the same-as-quote-margin text, the five dropdowns under the total box and the separate Available column. Send blockers per decision 44: Approve and send disabled while any `sendBlockers()` entry exists, the first blocker named under it in red with "+N more", clicking it jumps to the line or field (quote-level blockers open Quote details); stock-short and low-confidence matches show as inline notes on their line. The server still refuses a blocked send. Read-only manager view of another rep's quote keeps working.
- **Frames (acceptance):** C_QEBase, C_QE1 to C_QE11. No frame: the blocked-send state (list under "No frame").
- **Blocked by:** U2. **Lane:** U.
- **Files:** `src/components/rep/quote-detail/**`, `src/app/rep/quotes/[id]/page.tsx`, `e2e/frames-quote-editor.spec.ts` (new), quote-detail e2e specs and `e2e/golden-quote-flow.spec.ts` steps that name old UI (keep every step's intent), `src/e2e-suite.test.ts` titles only if a step title names removed UI.
- **Tests first:** every blocker disables the button and is named first, "+N more", jump target per blocker type, inline notes for stock-short and match below 0.75, server still 422 on a blocked send, column set with the toggle on and off, Add item dropdown (Add, Already on quote); frame spec per frame.
- **Migration:** none.
- **Rollback:** revert the PR.
- **Acceptance:** every mapped frame PASS; Appendix H "Approve and send" line holds; pricing math untouched.

## U5: Customers, Orders, Stock

- **Scope:** Customers list (Customer with account code, Rep, Terms, Open balance with credit limit, Last order, Orders, Quotes; search, Filter with Rep, Terms, Open balance range, Only show Has open quotes, Over 80% of credit limit, Never ordered; count; columns picker), customer page. Orders list (Order, Customer, Rep, Ordered, Fulfillment, Status, Lines, Total; Filter; Show N more; read-only), order page. Stock list (search plus Filter replacing the category dropdown), item page, Add to quote from the list or the item page. Rep versions without the Rep column or rep filter, own customers only. Detail tables have no filter and no columns picker.
- **Frames (acceptance):** C_CUBase, C_CU1, C_CU2, C_CU3, C_RCUBase, C_RCU1, C_ORBase, C_OR1, C_OR2, C_STBase, C_ST1, C_ST2, C_ST3. Orders, Stock, the customer page and the order page were drawn for the manager only; the rep sees the same layout with own data (Part 1 section 4).
- **Blocked by:** U2. **Lane:** U.
- **Files:** `src/components/rep/customers/*`, `src/components/rep/orders/*`, `src/components/rep/items/*` (rename to `stock`), `src/app/rep/customers/**`, `src/app/rep/orders/**`, `src/app/rep/stock/**`, repository reads for the new columns and filters, `e2e/frames-records.spec.ts` (new), `e2e/rep-reference.spec.ts`.
- **Tests first:** each filter and Only show rule, count, Show N more, rep scoping, Add to quote from list and item page; frame spec per frame.
- **Migration:** none.
- **Rollback:** revert the PR.
- **Acceptance:** every mapped frame PASS.

## U6: Analytics

- **Scope:** Manager Analytics with 5 tabs: Overview (stat cards, quotes and wins by week with a table toggle, average margin vs floor, top requested items), Rep leaderboard (with Export CSV), Decline reasons, Untouched quotes, Customer questions. Filter: any mix of reps and teams (team labels until U7), a customer, and "break the numbers down by" Whole organization, Rep, Team or Customer (default whole organization). Rep "My Analytics": own data only, no leaderboard tab, filter offers own customers and a period (7, 30, 90 days, Custom); Decline reasons and Untouched quotes drop per-rep columns; no "Manage customer access" link. `GET /api/rep/analytics` takes rep, team, customer, breakdown and period and absorbs the team metrics and CSV; rep requests are forced to their own `rep_id`. The old Team dashboard content moves into these tabs; do not edit `src/app/rep/teams/**` (U7 replaces it).
- **Frames (acceptance):** C_ANBase, C_AN1, C_AN3, C_AN4, C_AN6, C_AN7, C_AN8, C_AN2, C_AN5 (manager); C_RAN1 to C_RAN5 (rep).
- **Blocked by:** U2. **Lane:** U.
- **Files:** `src/components/rep/analytics/*`, components moved from `src/components/rep/team/*`, `src/server/analytics/*`, `src/server/team/metrics.ts` (filters and breakdown only, metric definitions unchanged), `src/app/api/rep/analytics/**`, `src/app/rep/analytics/page.tsx`, `e2e/frames-analytics.spec.ts` (new), `e2e/rep-analytics.spec.ts`, `e2e/team-dashboard.spec.ts`.
- **Tests first:** filter and breakdown math on fixtures, rep forced to own id (a rep passing another rep's id gets own data or 403), CSV columns, tabs per role; frame spec per frame.
- **Migration:** none.
- **Rollback:** revert the PR.
- **Acceptance:** every mapped frame PASS; decisions 23 to 25 metrics unchanged.

## U7: Teams and Reps

- **Scope:** Manager-only `/rep/teams` replacing the old dashboard there. Left Reps card (Filter, columns picker, Save; Rep name, Customers count button that expands the rep's customers, Role, Team, Active toggle; managers not listed; row selection for bulk reassign of a rep's quotes, decision 45). Under a rep: each customer has an X; disconnecting opens a dialog that requires the new rep in the same step and offers "Also move this customer's open quotes"; + Connect a customer search; connecting a customer who has another rep asks to confirm the move and shows how many open quotes move. Right Teams card (Filter, Create team, checkbox list with rep counts; with a team selected Add to team, Remove from team, Move into other team). Teams become entities with an optional parent; a parent is grouping only (decision 47). Migrate the free-text team label into teams. Remove the Settings tabs Rep assignments and Reps. Update U6's team filter to read team entities (members of a child count in the parent).
- **Frames (acceptance):** C_TRBase, C_TR1 to C_TR7.
- **Blocked by:** U6. **Lane:** U.
- **Files:** next migration (`teams`, rep membership), `src/server/repository/teams.ts` (new), `src/server/repository/accounts.ts`, `src/app/api/rep/teams/**` (new), `src/app/api/rep/team/reps/*` and `settings/assignments` (kept or renamed as backing routes), `src/app/rep/teams/page.tsx`, `src/components/rep/teams/*` (new), `src/components/rep/settings/*` (remove two tabs), `e2e/frames-teams.spec.ts` (new), `e2e/rep-reassign.spec.ts`, `e2e/rep-roles.spec.ts`.
- **Tests first:** migration of labels into teams; create, rename, delete, add and remove members, move under a parent (no cycles); parent counts children for grouping and filters only; no customer left without a rep; move confirm with open-quote count; bulk reassign activity rows; deactivation still blocked with customers; manager only (rep 403); frame spec per frame.
- **Migration:** add `teams(id, name, parent_team_id)` and rep membership; backfill from `reps.team`.
- **Rollback:** restore the volume backup; revert the PR.
- **Acceptance:** every mapped frame PASS; decisions 21, 45, 47 hold.

## U8: Manager settings

- **Scope:** Tabs Customer access, Margin floors, Pricing and delivery, Aging. Remove Data sources everywhere in the UI. Customer access: search plus Filter (per data type: Items and stock, Pricing, Orders and quotes, Account; each Any, Querent answers, Not shared); no filter shows the organization-wide toggles; a filter shows a table of matching customers with one toggle per data type. Margin floors: Organization margin floors (new org table, hard stops reps cannot go below) and the read-only, searchable Rep margins review. Pricing and delivery: inputs right-aligned, units under the label. Aging without descriptions (keep the "1 day" conversions). Feature flags per decision 48: `FEATURE_FREE_DELIVERY_PRICING`, `FEATURE_RECOVERY_POOL`, `FEATURE_DELIVERY_COST_MODEL`, read on the server, default off, added to `.env.example`; their sections do not render and their settings routes reject writes while off.
- **Frames (acceptance):** C_S1, C_S1a, C_S1b, C_S2, C_S3, C_S4, C_S5 (flag on), C_S6 (flags on), C_S7, C_S8.
- **Blocked by:** U7. **Lane:** U.
- **Files:** `src/components/rep/settings/*`, `src/app/rep/settings/page.tsx`, `src/app/api/rep/settings/**`, next migration (`org_margin_floors`), `src/server/repository/settings.ts`, `src/server/flags.ts` (new), `.env.example`, `src/env-example.test.ts`, `e2e/frames-settings.spec.ts` (new), `e2e/rep-settings.spec.ts`, `e2e/free-delivery.spec.ts` (run with the flag on).
- **Tests first:** flags default off, sections absent while off, writes rejected while off (each route); customer access filter query and per-customer toggles; org floors manager-only and validated; rep margins review read-only; frame spec per frame (S5, S6 with the flags on).
- **Migration:** add `org_margin_floors(category_id PRIMARY KEY, floor)`.
- **Rollback:** revert the PR; the table is ignored by old code.
- **Acceptance:** every mapped frame PASS; no feature-flag section renders while its flag is off.

## U9: Rep settings

- **Scope:** Rep `/rep/settings` tabs Margins, Profile, Notifications. Margins: the rep edits their own margin per category; the server rejects a value below the organization floor with a field error; the row turns red with "Below the 30.0% organization floor. Pick 30.0% or higher." (the number is the real floor) and Save is disabled; the bar legend stays. Profile: picture, name, phone, email, used by the customer's My rep sheet and quotes. Notifications: in-app toggles for Quote overdue, Quote aging, Below margin floor, Change requested (caution) and Quote accepted, Quote declined, Quote expired, Customer chat needs a rep (bell), stored per rep and applied by `GET /api/rep/badges`.
- **Frames (acceptance):** C_RS1, C_RS2, C_RS3, C_RS4.
- **Blocked by:** U8. **Lane:** U.
- **Files:** `src/components/rep/settings/*` (rep tabs), next migration (rep profile columns, `rep_notification_prefs`), `src/server/repository/accounts.ts`, `src/app/api/rep/profile/**`, `src/app/api/rep/notification-prefs/route.ts`, `src/server/rep/badges.ts`, `e2e/frames-rep-settings.spec.ts` (new).
- **Tests first:** below-floor rejected by the server and shown inline with Save disabled; profile read and write (picture upload size and type limits); prefs filter the dropdowns; frame spec per frame.
- **Migration:** add profile columns and `rep_notification_prefs(rep_id, event_key, in_app)`.
- **Rollback:** revert the PR.
- **Acceptance:** every mapped frame PASS; Appendix H margin line holds.

## U10: Customer site

- **Scope:** `/` builds only the Querent box, sheets and bell (the Herrick header and page around it are a stand-in). Visitor (no session): the base box with the public starter questions; it submits to the R-14 stub that always replies "Sign in to continue." and never calls the model or a tool (decision 49, R-14). Logged-in customer: the same box with Orders and My rep buttons opening side sheets, and a notification bell with an unread count; a quote notification opens the existing quote preview with Accept, Request changes and Decline (decision 41). Remove the contacts and quotes sidebars and the three-pane layout. Add `GET /api/query/customer/orders` and customer notifications (derived from quote activity and order status, read state per customer, polled) with a mark-read route. Keep `QuoteNoticeCard` in the chat. Demo auth and cookies stay (decision 49). The workspace chooser moves unchanged to `/demo`, and the frame's "Sign in" button (the only part of the stand-in header that is built) links to it (decision 53).
- **Frames (acceptance):** C_CVE0 (visitor), C_CVL1 to C_CVL5 (customer).
- **Blocked by:** U0. **Lane:** U.
- **Files:** `src/components/App.tsx`, `src/features/chat/*`, `src/components/customer/*`, `src/app/customer.css`, `src/app/api/query/customer/orders/route.ts` (new), `.../notifications/**` (new), the stub route (new, `TODO(R-14)`), next migration if a read marker table is used, `docs/todo-registry.md` (R-14), `src/todo-registry.test.ts` (R-1 to R-14), `e2e/frames-customer.spec.ts` (new), `e2e/customer-layout.spec.ts`, `e2e/mobile-flow.spec.ts` (deleted with the phone layout).
- **Tests first:** the stub returns only "Sign in to continue." for any input and never imports the model or tools; orders endpoint scoped to the customer with no cost or margin (`boundary.test.ts` green); notifications created for a sent quote, a revised quote and a shipped order, unread count, mark read; bell opens a quote and each action works; frame spec per frame.
- **Migration:** a customer notification read marker if needed.
- **Rollback:** revert the PR.
- **Acceptance:** every mapped frame PASS; the visitor path can return no prices, orders, quotes or account data; R-14 registered and marked.

## U11: Cleanup and proof

- **Scope:** Walk Appendix H. Recompute the frame count from `canvas.json` (89) and prove every frame id is in the "Lane U frame ledger" in `docs/plans/status.md` as PASS, deferred (with reason) or no-frame. Run every `e2e/frames-*.spec.ts` together. Remove dead old-UI code, CSS and tests. Update `docs/demo-script.md` and its spec, `docs/architecture-explainer.html` and `docs/codebase-structure.html` if the shell changed, README, spec and `docs/design/README.md`.
- **Frames (acceptance):** all 89.
- **Blocked by:** every other U task. **Lane:** U.
- **Files:** `docs/plans/status.md`, `src/frames-ledger.test.ts` (new: every canvas.json board appears once in the ledger), docs, dead code.
- **Tests first:** the ledger guard test, then the cleanup.
- **Migration:** none.
- **Rollback:** revert the PR.
- **Acceptance:** typecheck, Vitest, build and the full Playwright suite pass; ledger complete; no old-UI code remains.
