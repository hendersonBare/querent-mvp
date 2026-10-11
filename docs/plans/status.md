# Querent v3 build status

## Lane U (new UI)

Plan: "Lane U" in `plan.md`. Decisions 41 to 52. Started 2026-10-11.

| Task | PR | State |
|---|---|---|
| U0 | | not started |
| U1 | | not started |
| U2 | | not started |
| U3 | | not started |
| U4 | | not started |
| U5 | | not started |
| U6 | | not started |
| U7 | | not started |
| U8 | | not started |
| U9 | | not started |
| U10 | | not started |
| U11 | | not started |

### No frame
Screens, states or controls built with no frame (decision 50). Each is the minimum needed to function, in the same tokens, and is raised with the product owner.

| What | Task | Why it exists | Asked |
|---|---|---|---|
| Blocked-send state: disabled Approve and send with the first blocker named under it and "+N more" | U4 | Decision 44 | made (decision 44) |
| Settings > Customer access: a plain "Customer" select (All customers, then the customers the signed-in rep may read) in place of the removed header "Viewing" picker | U1 | Per-customer access must stay settable once the picker is gone; replaced by the Customer access frames (C_S1, C_S1a, C_S1b) in U8 (OA-69) | not yet |

### Deferred: auth
| What | Task | Reason |
|---|---|---|
| Real anonymous query route (the visitor box answers "Sign in to continue." from a stub) | U10 | Decision 49, TODO(R-14) |
| Customer login, embed script, token handoff, SSO | none | Decision 49: comes with the Supabase work |

### Lane U frame ledger
Every board in `canvas.json` (89). State is PASS (frame spec diff with zero unexplained differences), deferred (with reason) or no-frame. The rail on every page frame is proven in U2.

| Frame | Task | State |
|---|---|---|
| C_QOB3 | U2 | pending |
| C_QOB4 | U2 | pending |
| C_QOB9 | U2 | pending |
| C_QOB1 | U3 | pending |
| C_QOB2 | U3 | pending |
| C_QOB5 | U3 | pending |
| C_QOB6 | U3 | pending |
| C_QOB7 | U3 | pending |
| C_QOB8 | U3 | pending |
| C_QOBoard | U3 | pending |
| C_QOT1 | U3 | pending |
| C_QOT2 | U3 | pending |
| C_QOT3 | U3 | pending |
| C_QOT4 | U3 | pending |
| C_QOT5 | U3 | pending |
| C_QOT6 | U3 | pending |
| C_QOT7 | U3 | pending |
| C_QOTable | U3 | pending |
| C_RQB1 | U3 | pending |
| C_RQB2 | U3 | pending |
| C_RQBoard | U3 | pending |
| C_RQTable | U3 | pending |
| C_QE1 | U4 | pending |
| C_QE10 | U4 | pending |
| C_QE11 | U4 | pending |
| C_QE2 | U4 | pending |
| C_QE3 | U4 | pending |
| C_QE4 | U4 | pending |
| C_QE5 | U4 | pending |
| C_QE6 | U4 | pending |
| C_QE7 | U4 | pending |
| C_QE8 | U4 | pending |
| C_QE9 | U4 | pending |
| C_QEBase | U4 | pending |
| C_CU1 | U5 | pending |
| C_CU2 | U5 | pending |
| C_CU3 | U5 | pending |
| C_CUBase | U5 | pending |
| C_OR1 | U5 | pending |
| C_OR2 | U5 | pending |
| C_ORBase | U5 | pending |
| C_RCU1 | U5 | pending |
| C_RCUBase | U5 | pending |
| C_ST1 | U5 | pending |
| C_ST2 | U5 | pending |
| C_ST3 | U5 | pending |
| C_STBase | U5 | pending |
| C_AN1 | U6 | pending |
| C_AN2 | U6 | pending |
| C_AN3 | U6 | pending |
| C_AN4 | U6 | pending |
| C_AN5 | U6 | pending |
| C_AN6 | U6 | pending |
| C_AN7 | U6 | pending |
| C_AN8 | U6 | pending |
| C_ANBase | U6 | pending |
| C_RAN1 | U6 | pending |
| C_RAN2 | U6 | pending |
| C_RAN3 | U6 | pending |
| C_RAN4 | U6 | pending |
| C_RAN5 | U6 | pending |
| C_TR1 | U7 | pending |
| C_TR2 | U7 | pending |
| C_TR3 | U7 | pending |
| C_TR4 | U7 | pending |
| C_TR5 | U7 | pending |
| C_TR6 | U7 | pending |
| C_TR7 | U7 | pending |
| C_TRBase | U7 | pending |
| C_S1 | U8 | pending |
| C_S1a | U8 | pending |
| C_S1b | U8 | pending |
| C_S2 | U8 | pending |
| C_S3 | U8 | pending |
| C_S4 | U8 | pending |
| C_S5 | U8 | pending |
| C_S6 | U8 | pending |
| C_S7 | U8 | pending |
| C_S8 | U8 | pending |
| C_RS1 | U9 | pending |
| C_RS2 | U9 | pending |
| C_RS3 | U9 | pending |
| C_RS4 | U9 | pending |
| C_CVE0 | U10 | pending |
| C_CVL1 | U10 | pending |
| C_CVL2 | U10 | pending |
| C_CVL3 | U10 | pending |
| C_CVL4 | U10 | pending |
| C_CVL5 | U10 | pending |

## v3 (lanes T to F)

| Task | PR | State |
|---|---|---|
| P3 (spec + plan) | [#35](https://github.com/hendersonBare/querent-mvp/pull/35) | merged |
| T0 | [#36](https://github.com/hendersonBare/querent-mvp/pull/36) | merged |
| T1 | [#37](https://github.com/hendersonBare/querent-mvp/pull/37) | merged |
| C1 | [#38](https://github.com/hendersonBare/querent-mvp/pull/38) | merged (1 fix round) |
| B1 | [#39](https://github.com/hendersonBare/querent-mvp/pull/39) | merged |
| A1 | [#40](https://github.com/hendersonBare/querent-mvp/pull/40) | merged (1 fix round) |
| E1 | [#41](https://github.com/hendersonBare/querent-mvp/pull/41) | merged |
| C2 | [#42](https://github.com/hendersonBare/querent-mvp/pull/42) | merged (1 fix round) |
| A2 | [#43](https://github.com/hendersonBare/querent-mvp/pull/43) | merged |
| D1 | [#44](https://github.com/hendersonBare/querent-mvp/pull/44) | merged |
| D2 | [#45](https://github.com/hendersonBare/querent-mvp/pull/45) | merged |
| D3 | [#46](https://github.com/hendersonBare/querent-mvp/pull/46) | merged |
| C3 | [#47](https://github.com/hendersonBare/querent-mvp/pull/47) | merged (1 fix round) |
| F1 | [#48](https://github.com/hendersonBare/querent-mvp/pull/48) | merged (1 fix round) |

## Final summary

### What shipped
Every slice in `plan.md` merged to `main` through a PR that passed both gates: typecheck, Vitest, build and Playwright, plus approval from a validation agent with fresh context. Every merged PR also had green GitHub CI. Five PRs needed one fix round each; none needed more.

- **T0:** Notion removed from the agent tooling. The task loop, implementer and verifier now work from `plan.md` with the worktree-and-branch claim rule.
- **T1:** numbered SQL migrations (`001`–`008`), applied on start with v4 adoption. One shared money helper (`src/lib/money.ts`). A committed `.env.example` and a secrets guard test.
- **A1:** the `declined` status, the decline API, and a customer dialog with five reasons. The rep gets an unread badge, an activity entry, and the reason and note (rep-only).
- **A2:** aging derived on read (amber/red, text label and icon). Needs-attention filter and sort, a red header badge, and the `last_rep_touch_at` and `customer_viewed_at` clocks.
- **B1:** "View full chat" drawer with a message count and paging by 50.
- **C1–C3:** modelled delivery cost, percentage-pool rate with cold start, cap and ramp, and margin-weighted per-line recovery. Also a $0.00 freight line under free delivery pricing, manager-only Pricing & delivery controls, an impact-preview gate, and the OilPriceAPI fuel client. The fuel client is lazy, fetches at most once per state per day, and is tested only with fakes.
- **D1–D3:** rep and manager roles with database-checked `managerRoute`, team labels, and deactivation blocked while a rep still has customers. Manager-only aging thresholds. Single and bulk reassignment with activity rows and `original_rep_id`. An All-reps scope with read-only manager view. The manager-only Team dashboard with metrics, drill-down and CSV.
- **E1:** "Frequently bought together" in the item pop-up. The LLM picks from a server-built, cost-free pool, and anything outside it is dropped. Lines added from it get `added_by='suggestion'`.
- **F1:** rep personas in the chooser and a deterministic demo seed. The seed has an aging mix and 22 eligible pool quotes (pool 1.6% shown next to the 3.0% starting rate). F1 also added `docs/demo-script.md` with `e2e/demo-script.spec.ts`, the TODO registry and its guard, and refreshed README and ERP docs.

Final check on `main` (9d2323c and the docs commit after it): typecheck pass, Vitest 206 files / 2446 tests pass, build pass, full Playwright suite 153 passed (local Chromium, scripted mode, fresh reset).

### Blocked
Nothing is blocked.

### Open assumptions
There are 66 entries (OA-1 to OA-66) in `docs/plans/open-assumptions.md`. These ones need the product owner's attention:
- **OA-3:** under-threshold quotes carry no recovery (literal reading of decision 32).
- **OA-45:** the threshold check includes contract lines.
- **OA-38:** the pool rate can be 1 bp off because it is rounded twice.
- **OA-58:** Team "why untouched" counts are not yet drill-down links, and decline-reason counts link to all declines.
- **OA-63:** the demo seed's "ended pilot" explains why old quotes carry recovery.
- **OA-32:** merged remote branches could not be deleted because the git proxy refuses branch deletion with 403. Worktrees and local branches were removed.

### Unrelated issues
There are 19 entries in `docs/plans/unrelated-issues.md`. None is fixed; all are small. The most notable:
- `next-env.d.ts` flips between dev and build.
- Further private rounding helpers remain outside the three that decision 7 named.
- A global `input{width:100%}` CSS rule.
- `POST /api/session` uses `in` instead of `Object.hasOwn`.
- Two `/api/query/*` routes still answer an inactive rep.

### TODO registry
`docs/todo-registry.md` lists R-1 to R-13 with the decision log's wording. `src/todo-registry.test.ts` checks that every `TODO(R-n)` in `src/` is registered, that every ID placed in code has a marker, and that the wording matches. Markers in `src/`:

| ID | Count |
|---|---|
| R-1 | 2 |
| R-2 | 8 |
| R-3 | 1 |
| R-4 | 1 |
| R-5 | 3 |
| R-6 | 2 |
| R-7 | 1 |
| R-8 | 1 |
| R-9 | 2 |
| R-10 | 1 |
| R-11 | 1 |
| R-12 | 1 |

R-2 is also marked in `.env.example`. R-13 lives in the registry only. Nothing deferred was built: no outbound messaging, scheduler, Apollo or Twilio code.
