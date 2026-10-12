# Querent v3 decision log (FINAL, approved)

Source: customer meeting notes (Herrick, 10/14) after codebase discovery and a requirements interview with the product owner. These decisions are final. Do not re-ask them. Where this log is silent, pick the simplest option consistent with it and record the choice in `docs/plans/open-assumptions.md`.

Lettered items (A to L) and numbered requirements (1 to 5) refer to the original meeting notes.

## Codebase facts that shaped the decisions
- Next.js 16 (read `node_modules/next/dist/docs/` before Next code: `proxy.ts` replaces `middleware`, `params` and `cookies()` are async). TypeScript strict, React 19, zod 4, npm, Node 22.
- SQLite via better-sqlite3, raw SQL, all SQL only in `src/server/repository/`. A test enforces it. No ORM.
- Before this work there were no migrations: `SCHEMA_VERSION=4`, mismatch refuses to open, `npm run db:reset` wipes and reseeds.
- Money is stored as REAL dollars. The pricing engine uses integer cents internally. Three different rounding helpers exist (`quotes/snapshot.ts`, `freight/engine.ts`, `repository/sql.ts`).
- Statuses: `ready_for_review | sent | accepted | changes_requested | expired`. The pure state machine is `src/server/quotes/lifecycle.ts`. Expiry is computed lazily (`effectiveStatus`, `expireOverdueQuotes`). No scheduler exists.
- Auth is a demo cookie with two hard-coded personas in `src/server/session.ts` (Brandi, `supplier_admin`; Dana, `customer_user`). Rep API routes use `repRoute()` in `src/server/rep/http.ts`.
- The rep quote header box is `RequestPanel` in `src/components/rep/quote-detail/QuoteDetailView.tsx` and shows only `quotes.request_text`. The transcript lives in `conversations` and `messages`, linked by `quotes.conversation_id`.
- The item pop-up payload is `ItemPopupPayload` in `src/domain/chat.ts`. Customer-facing code must never touch cost or margin (`src/server/repository/boundary.test.ts`).
- Existing rep-side upsell chips: `src/server/upsells/`, `src/server/upsells-writer/`.
- Pricing & Delivery: `src/components/rep/settings/PricingDelivery.tsx`, storage in `settings` and `delivery_rates`, routes under `src/app/api/rep/settings/`.
- No ESLint or Prettier. Style is dense, compact TypeScript with spec-referencing header comments. Match it.
- Commit style: `[task-id] Title (#PR)`, squash-merged. Branches: `task/<task-id>-<slug>`.

## 1. Process and tooling
1. Notion is dropped as the source of truth. Remove all Notion references from `AGENTS.md`, the `querent-task-loop` skill, and the implementer and verifier agent files. Tasks live in `docs/plans/plan.md`.
2. Claim a task by creating a worktree and branch named `task/<task-id>-<slug>`. Before claiming, run `git worktree list` and `git branch -a` and skip any task whose ID already exists. A task is claimable only when everything it is blocked by is merged to `main`. At most 3 agents work at once.
3. Agents may push, open and merge PRs, but only when ALL tests pass (typecheck, vitest, build, touched Playwright specs) AND the validation agent approves. Fix agents work on the same branch. Anything failing either gate stays unmerged.
4. Test-driven: write failing tests first in every slice.
5. Delete the untracked `.agents/` and `.codex/` folders in T0 (they came from Codex).
6. Leave as they are, and register as TODOs: the demo-cookie auth (R-4), PII handling (R-5), the `/api/test/*` guard (R-6).

## 2. Foundations
7. One shared money helper (integer cents plus one rounding function) replaces the three rounding copies. All new money math uses integer cents.
8. Migration system: numbered SQL files in `src/server/db/migrations/` (for example `001_baseline.sql`), a `schema_migrations` table, applied in order inside transactions on app start. `001` equals the current v4 schema, and existing v4 databases are adopted as already at 001. No down migrations: rollback means restoring the volume backup. `npm run db:reset` stays for dev and E2E and builds through the same migrations, then reseeds. SQLite cannot alter a CHECK constraint, so the `declined` migration rebuilds the `quotes` table.
9. One real env file, `.env.local` (untracked). A committed `.env.example` has placeholders for every key: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `DATABASE_PATH`, `OILPRICEAPI_KEY`, `QUERENT_SEED_DATE`, `QUERENT_SCRIPTED`, `QUERENT_E2E_RESET`, `PORT`, with a `TODO(R-2)` about moving to user secrets. Remove `.env.example` from `.gitignore`. `db:reset` reads `.env.local`. Do not add or print the unused `JEV_API_KEY`. Never log, test with, or commit any key.
10. Store all times in UTC. Display times and bucket dates in the browser's time zone where possible.
11. Refresh the README (env table, migrations replace the "run db:reset after schema change" deploy step, roles, Team and decline features) and `docs/erp-integration-readiness.md`.

## 3. Lifecycle, decline and aging (A to C, K)
12. Add exactly one stored status: `declined`. Aging (ok, amber, red) is derived on read from the status and its clock, like `effectiveStatus`. No other new stored statuses.
13. `declined` is final (like `accepted` and `expired`). After a decline the customer asks for a new quote and the rep may use Duplicate.
14. Decline reasons: "Price too high", "Found other source", "Need it sooner than quoted", "Wrong items or quantity", and "Other" (free text, 250 characters, plain text, shown to the rep only, never in the customer PDF). The confirm button is labelled **Decline** and records the decline even with no reason chosen. A Cancel or X dismisses the dialog with no change. There is NO "no response" option.
15. On decline: the rep gets an unread badge and an activity entry, and the customer's quote chip reads "Declined".
16. Aging defaults, supplier-level settings editable by managers only, stored in `settings` with defaults in code:

| Status | Amber | Red | Clock starts at |
|---|---|---|---|
| `ready_for_review` | 4 h | 24 h | quote creation |
| `changes_requested` | 4 h | 24 h | `responded_at` |
| `sent` | 3 days | 7 days | `sent_at` |

Wall-clock hours, not business hours. A `sent` quote also turns amber 2 days before expiry and red on its last day.
17. Expiry stays selectable (7, 14, 30 or a custom date), with the existing default of 14 days.
18. Red and amber carry a text label and an icon in addition to colour. The "Needs attention" filter in the rep quote list shows amber and red quotes. The header badge counts red quotes only. Default sort: red before amber, then by quoted total descending, with a toggle for oldest first.
19. Everything else about reminders is DEFERRED (see the TODO registry): email and SMS reminders, scheduler or cron, Apollo and Twilio integrations (item I), reminder ladders, digests, snooze, auto-reassignment, auto-drafted follow-ups. Do not build any of it. No outbound messages are sent by this work.

## 4. Roles, reassignment, dashboard (requirements 3 and 4, D, F, L)
20. Two roles: `rep` and `manager` (supervisor and admin are merged). A manager sees all reps. Add a free-text `team` label per rep, used only as a filter. Brandi becomes the manager and keeps her own book. Mara and Eli become rep personas.
21. A manager can mark a rep inactive, but only after that rep's customers are reassigned (block deactivation until then). A manager can reassign quotes one at a time or in bulk (rep A to rep B, open quotes at minimum; closed quotes can also be reassigned). Each move writes a `quote_activity` row with who, from and to. `quotes.rep_id` becomes the current owner, and a new `original_rep_id` keeps history. Reassigning a customer's rep offers a checkbox "also move this customer's open quotes".
22. Managers get an "All reps" scope in `/rep/quotes`, with a Rep column and rep filter. They may open any quote **read-only**. Editing another rep's quote requires reassignment first.
23. New manager-only "Team" section (for example `/rep/team`): leaderboard table with one row per selected rep plus a totals row; a multi-select of reps (tick any set to compare or group); a team label filter; date presets (7, 30, 90 days) and a custom range; drill-down from any count or row to the filtered quote list (the decline reason and the "Other" text are shown); CSV export using `src/server/export/csv.ts`; live SQL queries, no materialized tables. Quotes created and decisions taken are bucketed by the browser's time zone.
24. Metric definitions. The cohort for rate metrics is **quote creation date** in the selected window.
    - Quote-to-order rate = accepted ÷ created. TODO(R-1): this is a stand-in until real orders are created from accepted quotes.
    - Unaccepted rate = (declined + expired) ÷ created. Open quotes are shown separately.
    - Decided win rate = accepted ÷ (accepted + declined + expired).
    - Counts per status, with open quotes split by ok, amber and red.
    - Time to send (created to sent), customer response time (sent to responded), and time in each status.
    - Total quoted value, accepted value, average quoted margin (existing GP fields), and freight recovered versus modelled freight cost.
    - Decline-reason breakdown, with the "Other" text listed.
    - Upsell suggestion acceptance rate.
25. "Why quotes went untouched" is inferred from events, never typed by reps. Add `last_rep_touch_at` and `customer_viewed_at`. Reasons: draft never opened; draft opened but never sent; changes requested but never revised; sent but never opened by the customer; sent and opened but no reply; expired with no response. Show counts per reason per rep.

## 5. Chat log (requirement 5)
26. Keep the compact "Customer request" box and add a **"View full chat"** button that opens a side drawer with the whole conversation (read via `conversation_id` from `messages`). Show a message count (for example "12 messages"). No AI summary. Customer messages are emphasized and assistant turns collapse to one line each. Load in pages of 50 messages. Only the owning rep and managers can see it.

## 6. Freight and pricing (A, J)
27. Ignore requirement 1. Quotes keep a Freight line that reads $0.00 when free delivery pricing is on.
28. There is exactly one new toggle on Pricing & Delivery: **free delivery pricing**. There is NO fuel toggle. Fuel is always part of the cost model.
29. Cost model is MODELLED per delivery (no delivery log exists). Round trip = 2 x distance. Components: fuel (round-trip miles ÷ MPG x fuel price), wear and tear per mile, depreciation per mile, driver wage x drive time, and an optional stop or unload time per delivery (default 0). Inputs entered manually by a manager on Pricing & Delivery: vehicle MPG, fuel type, wear $/mile, depreciation $/mile, driver $/hour, average speed mph, stop time. Distance = existing haversine x road factor behind the `DistanceProvider` seam, drive time from average speed. TODO(R-10) routing API. TODO(R-11) fleet onboarding.
30. Fuel price: OilPriceAPI (`https://api.oilpriceapi.com/v1`, header `Authorization: Token <key>`, NOT Bearer). Verified: state-level retail gasoline exists (for example code `GASOLINE_RETAIL_STATE_CA_USD`); state diesel is NOT confirmed; the free tier is 50 requests/day; EIA-sourced data is likely weekly. Behaviour: gasoline price by the delivering branch's state, one fetch per day per state, stored with an `as_of` time. On failure use the last stored price; if it is more than 14 days stale show a warning on Pricing & Delivery; if none ever existed require a manual price. A manual override always wins. Diesel is a manual price, and $0 if none exists. TODO(R-9). Show a visible warning whenever the fuel price is missing or zero. Key: `OILPRICEAPI_KEY`. Never log it or send it to the client. Tests use fakes only.
31. Recovery mechanism: **percentage pool**.
    - Rate = trailing 90-day modelled freight cost ÷ goods value of eligible accepted delivery quotes. The denominator uses the engine price before the freight uplift.
    - Eligible means accepted, fulfilment is delivery, and the quote carries recovery (so contract-priced lines and under-threshold quotes are excluded).
    - Recomputed daily, and the rate in force is frozen into each quote at creation.
    - Cold start: until there are at least 20 eligible quotes in the window, use a manual starting rate set by the manager.
    - Cap: a supplier-set maximum rate, default 8%.
    - One pool per deployment. There are no regions or zones.
32. Placement: apply the recovery AFTER the price suggestion engine runs, as a separate component stored per line in integer cents (`freight_recovery`).
    - Contract-priced lines are exempt.
    - The list cap does not apply to the recovery; a per-line cap does (default 8% over the engine price).
    - Will-call quotes and quotes under the existing free-delivery threshold carry no recovery.
    - Existing margin floors and suggestion logic are unchanged. Margin logic still suggests profitable margins and upsells, and freight is covered on top.
33. Allocation within a quote: **margin-weighted**. Target recovery = rate x quote goods value. Each line's share is proportional to its margin dollars (price minus cost). Lines with zero or negative margin get nothing. If every line has zero or negative margin, no recovery. Rounding remainders go to the highest-margin line. Worked example: bolts $20 (cost $19) and drill $180 (cost $150) with a $10 target give bolts +$0.32 and drill +$9.68.
34. A rep's explicit freight override wins: the recovery is dropped from that quote, and the quote is excluded from the pool. The override is logged in `quote_activity` as today.
35. Rollout safeguards: the toggle cannot be enabled until the manager has viewed an **impact preview** (estimated average line price change, by category, and the number of quotes affected over the last 90 days). A **ramp-in** applies the rate in steps (default 3 steps over 3 months, editable). The rate cap and per-line cap apply. When the toggle changes, draft quotes (`ready_for_review`, `changes_requested`) reprice on the next open or edit, and sent quotes stay frozen in their snapshot. While free delivery is on, the existing `free_threshold` and `min_charge` are ignored but kept.
36. Visibility: reps and managers see the recovery in the "Why this price?" panel (for example "Freight recovery +$2.40 (rate 5.0%, ramp step 2 of 3)") and the rate on the rep-side quote header. The customer and the customer PDF see only the final unit price and "Freight $0.00". Managers see the pool rate, ramp step, 90-day modelled cost and recovered amount on Pricing & Delivery.

## 7. Upsell (G). Checkout upselling (H) is out of scope.
37. Below the cart in the customer item pop-up, show "Frequently bought together" with at least 2 suggestions. The server builds a candidate pool (in the catalog, in stock at the chosen branch, not already in the cart, from the existing co-occurrence and fastener rules via a cost-free path). The LLM selects from the pool and writes a short reason, similar in style to the rep upsell chips. The server validates the output against the pool and drops anything not in it, so the model can never invent a SKU. The payload carries no prices or costs (the `boundary.test.ts` rule stays green). The customer can add a suggestion to the cart at qty 1. Record accepted suggestions through a line `added_by` value so acceptance feeds the Team dashboard. Scripted mode (CI and the demo) produces the same shape deterministically from the pool. If fewer than 2 candidates exist, show what exists.

## 8. Demo and docs
38. `docs/demo-script.md` plus one Playwright spec that walks the same steps. Run in scripted LLM mode. Five acts:
    1. Dana chats, sees 2 or more suggestions in the pop-up, and requests a quote.
    2. A rep opens the quote and uses "View full chat", sees an amber or red quote and the Needs-attention filter and badge, and sends the quote.
    3. A customer declines a different quote and picks a reason.
    4. The manager opens the Team dashboard, compares two reps, drills into decline reasons, and reassigns a quote.
    5. The manager opens Pricing & Delivery, turns on free delivery, and views the impact preview and the ramp.
39. Seed aging quotes with timestamps relative to the reset time, so every reset gives the same amber, red and fresh mix. Seed more than 20 accepted delivery quotes in the last 90 days across the three reps, so the computed pool rate shows next to the starting rate. Add rep personas to the workspace chooser, and seed quotes covering every status (including declined with reasons, and expired).
40. `docs/todo-registry.md` lists the TODOs below. Mark each in code as `TODO(R-n)`. Add a Vitest guard that every `TODO(R-n)` marker in `src/` matches an ID in the registry.

## 9. New UI (lane U, charcoal canvas)
Source: the product owner's lane U prompt (10/11). The frames in `docs/design/canvas-frames/` are the visual source of truth; `docs/design/new-ui-refactor-prompt.md` holds the only frame-to-route map. Do not re-ask these.
41. Customer quote actions: a notification bell. A quote notification opens the quote with Accept, Request changes and Decline.
42. The role switch for reps who are also managers is dropped. It is not built.
43. No phone or tablet layouts. No breakpoints, hamburger drawers or stacked-card tables; the old responsive CSS of every replaced page is deleted.
44. Send blockers: Approve and send is disabled while any blocker exists, with the first blocker named under it and "+N more"; clicking it jumps to the line or field; stock-short and low-confidence matches show as inline notes on their line. The server still refuses a blocked send.
45. Bulk reassign moves to Teams and Reps (row selection on the reps table). The Quotes table has no reassign.
46. Rename `/rep/items` to `/rep/stock` and `/rep/team` to `/rep/teams`, with permanent redirects from the old paths. Links, tests and docs are updated.
47. A parent team is grouping only. No permission inheritance (hierarchical visibility stays R-12).
48. Feature flags are environment variables read on the server: `FEATURE_FREE_DELIVERY_PRICING`, `FEATURE_RECOVERY_POOL`, `FEATURE_DELIVERY_COST_MODEL`, default off, listed in `.env.example`. No flags table (the Appendix C `feature_flags` migration is skipped). Their sections do not render and their settings routes reject writes while off.
49. Customer login, embed and auth are deferred to the Supabase work. The current demo auth and cookies stay untouched. The visitor screen is selected by having no session. No token handoff, embed script or anonymous public query route is built; the visitor box submits to one stub that always replies "Sign in to continue." and never calls the model or any tool, so no prices, orders, quotes or account data can come back through it. TODO(R-14).
50. Fidelity: every UI change traces to a frame id in the map. Exact values and copy come from the frame's own styles; no em-dashes, no added descriptions, helper text, icons or buttons. A screen, state or control without a frame gets the minimum needed to function in the same tokens and is listed under "No frame" in `docs/plans/status.md`. Placeholder data in the frames (Appendix G) is never copied into code. "FEATURE FLAG: HIDDEN" badges and dashed outlines are design markers and never render.
51. Viewport: frames are drawn at 1440 x 900; the product is built and verified at 1920 x 1080. The rail stays 216px and sticky at 100vh; the page area is fluid. Fixed widths in a frame stay fixed; flex and grid widths grow; no max-widths and no type scaling.
52. Hover, focus, loading and disabled states are built quietly per "States not drawn" in `docs/design/new-ui-style-guide.md`. Empty and error states are one plain line. Nothing else is built without a frame.
53. The demo workspace chooser moves, unchanged, from `/` (with no session) to `/demo`. From the stand-in header in C_CVE0 only the "Sign in" button is built; it links to `/demo`. Rail Sign out returns to `/`, which shows the visitor box. (Product owner, 10/11.)
54. The caution button border is `#E8A8A0` on every page. The nine Quotes table frames draw `#F1BEB8`; that one difference is explained by this decision. (Product owner, 10/11.)
55. Filter panel field boxes follow their own frame: transparent where the frame draws them transparent, white where it draws them white. (Product owner, 10/11.)
56. Customer site controls with no frame, kept as built in U10: a Sign out menu on the customer's account chip (returns to the visitor box); the conversation shown in the box once the customer asks, with a "New conversation" control that resets to the starter questions; an expired-quote bell notification reading "Quote <number> expired" / "It was valid until <date>."; and a 72px top strip holding the bell, account chip and Sign in at the frame's header positions, with nothing else from the stand-in header. (Product owner, 10/12.)
57. Further no-frame states kept as built: the opened list of a filter panel select (reuses the customer picker's rows); the customer picker without "Showing 5 of N" when it has 5 entries or fewer, and "0 matches" when a search finds nothing; the drop line on the left edge when a column is dragged to the front; and the visitor's question with the stub's "Sign in to continue." shown in the box. (Product owner, 10/12.)
58. Rep caution and bell dropdowns (no frame for these behaviours, kept as built in U2): clicking a row opens that quote (opening the dropdown itself never navigates); the bell names the quote's contact for events the frame does not sample, in the frame's pattern ("Q-24818 requested by Dana Ortiz", "declined by Dana Ortiz"). (Product owner, 10/12.)

## TODO registry contents
| ID | TODO |
|---|---|
| R-1 | Quote-to-order: create real orders from accepted quotes, then redefine the metric (today accepted ÷ created) |
| R-2 | Move API keys from `.env.local` to user secrets or a secrets manager |
| R-3 | Outreach: add idempotency and scheduling (when demo outreach is built, send once at quote creation) |
| R-4 | Replace the demo cookie auth with a third-party auth service |
| R-5 | PII removal layer for chat transcripts and `query_logs` |
| R-6 | Stricter guards on `/api/test/*` routes before deployment |
| R-7 | Deferred reminders: email and SMS, scheduler, Apollo and Twilio integrations (item I) |
| R-8 | Deferred lifecycle ideas: reminder ladders, digests, auto-reassignment, snooze, auto-drafted follow-ups |
| R-9 | Diesel price endpoint if OilPriceAPI has none (diesel is $0 until then) |
| R-10 | Routing API for real road miles and drive time |
| R-11 | Fleet onboarding to prefill MPG and vehicle inputs |
| R-12 | Hierarchical visibility (manager subtree), named groups, with real auth |
| R-13 | Tooling mismatches deliberately ignored for now (Supabase and Railway tooling in the dev environment) |
| R-14 | Real anonymous query route: public tool allow-list, rate limit, CORS, then Supabase auth and embed |

## Explicitly NOT in scope
Settings audit table and History tab. Price-shock monitor and auto-pause. Re-quote button. Freight what-if simulator. A dedicated accessibility pass beyond the text label and icon rule. Any outbound email, SMS or Apollo or Twilio code. Required rep reason codes. AI chat summaries. Per-customer uplift exemptions. Business-hours clocks. Checkout upselling (H).

## Slices (full detail goes in `docs/plans/plan.md`)
- **T0** tooling: remove Notion references, create the plan file, edit the task-loop skill and agents to use the claim rule, delete `.agents/` and `.codex/`.
- **T1** migrations, shared money helper, `.env` cleanup.
- **Lane A** (after T1): A1 `declined` status, decline API and pop-up; A2 aging, Needs-attention filter, header badge, `last_rep_touch_at`, `customer_viewed_at`.
- **Lane B** (after T1): B1 the chat transcript drawer and message count.
- **Lane C** (after T1): C1 cost model and pool rate (tests first); C2 margin-weighted allocation and quote integration; C3 Pricing & Delivery toggle, inputs, impact preview, ramp and the fuel price client.
- **Lane D** (after A1 and A2): D1 roles, `team` label, rep deactivation; D2 reassignment and the All-reps scope; D3 Team dashboard.
- **Lane E** (after T1): E1 the LLM suggestions in the pop-up.
- **F1** (last): personas, seed data, demo script, Playwright spec, docs refresh, TODO registry and guard.
- **Lane U** (new UI): U0 to U11, detailed at the end of `docs/plans/plan.md`.
