# Querent v3 plan

Tasks for the v3 build. The spec is `docs/plans/spec.md`; final decisions are in `docs/plans/decision-log.md`; status is in `docs/plans/status.md`. Every task is one reviewable PR titled `[<task-id>] <title>`, on branch `task/<task-id>-<slug>`, squash-merged.

## Claiming work

1. Before claiming, run `git worktree list` and `git branch -a`. If any worktree or branch name contains the task ID, skip that task: someone has it.
2. A task is claimable only when every task it is blocked by is merged to `main`.
3. Claim by creating a worktree and branch named `task/<task-id>-<slug>` from the latest `main`.
4. At most 3 agents work at once.
5. A PR merges only when ALL tests pass (typecheck, Vitest, build, the touched Playwright specs) AND the validation agent approves. Fix agents work on the same branch. Anything failing either gate stays unmerged (at most 3 fix-and-validate rounds, then label `blocked` and record why in `status.md`).
6. Test-driven: write failing tests first in every task, and show them fail.
7. After the PR merges, remove the worktree and the branch.

## Rules for every task

- Gates: `npm run typecheck && npm test && npm run build`, plus the touched Playwright specs against a production server on a free port with its own `DATABASE_PATH`.
- All SQL stays in `src/server/repository/` (and migrations in `src/server/db/`). Customer-facing code never touches cost or margin.
- New money math uses integer cents and `src/lib/money.ts` (after T1).
- Migrations: take the next free number on `main` when the PR is opened, and renumber when rebasing if `main` gained one. A table rebuild is written against `main`'s schema at merge time (all current columns). Migration ids must be contiguous (`001`…`N`); a test enforces it.
- Mark deferred work as `TODO(R-n)` with an ID from the decision log's registry.
- Keep the diff to the task. Unrelated issues go to `docs/plans/unrelated-issues.md`.

## Dependency graph

```
T0 ─ T1 ─┬─ A1 ─ A2 ─┐
         ├─ B1       ├─ D1 ─ D2 ─ D3 ─┐
         ├─ C1 ─ C2 ─┼──── C3         ├─ F1
         └─ E1 ──────┴────────────────┘
```

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
- **Tests first:** `migrate.test.ts` (fresh build, v4 fixture equality, adoption, refusal of other versions, rollback on failure, set-difference order, contiguous ids); `money.test.ts` (rounding table incl. 1.005, negative values, equality with the old helpers); `env-example.test.ts` (every key from decision 9 present, placeholders only, no `JEV_API_KEY`, `.env.example` not ignored).
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
