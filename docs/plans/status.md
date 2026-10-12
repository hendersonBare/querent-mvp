# Querent v3 build status

## Lane U (new UI)

Plan: "Lane U" in `plan.md`. Decisions 41 to 65. Started 2026-10-11.

| Task | PR | State |
|---|---|---|
| U0 | [#52](https://github.com/hendersonBare/querent-mvp/pull/52) | merged |
| U1 | [#53](https://github.com/hendersonBare/querent-mvp/pull/53) | merged (1 fix round) |
| U2 | [#55](https://github.com/hendersonBare/querent-mvp/pull/55) | merged (3 fix rounds) |
| U3 | [#57](https://github.com/hendersonBare/querent-mvp/pull/57) | fix round 1 (verifier FAIL: native date fields add copy and an icon; manager offered Send reply on another rep's quote; decision 63 reply to chat) |
| U4 | [#58](https://github.com/hendersonBare/querent-mvp/pull/58) | in review |
| U5 | [#56](https://github.com/hendersonBare/querent-mvp/pull/56) | merged |
| U6 | [#59](https://github.com/hendersonBare/querent-mvp/pull/59) | in review |
| U7 | | not started |
| U8 | | not started |
| U9 | | not started |
| U10 | [#54](https://github.com/hendersonBare/querent-mvp/pull/54) | merged (1 fix round) |
| U11 | | not started |

### No frame
Screens, states or controls built with no frame (decision 50). Each is the minimum needed to function, in the same tokens, and is raised with the product owner.

| What | Task | Why it exists | Asked |
|---|---|---|---|
| Blocked-send state: disabled Approve and send with the first blocker named under it and "+N more" | U4 | Decision 44 | made (decision 44) |
| `/test/ui` fixture page: renders the tokens and primitives for `e2e/frames-primitives.spec.ts`; 404 unless `QUERENT_E2E_RESET=1` | U0 | Test tooling, not a product screen | not needed (test tooling) |
| Opened list of a filter panel select (C_QOB2 "Rep", "Customer"): the frame draws the closed field only; the list reuses the customer picker's rows | U0 | A select must open to work | approved (decision 57) |
| Customer picker with 5 entries or fewer: no "Showing 5 of N" line (C_QOB1 draws it for a longer list); "0 matches" when a search finds nothing (C_QOT7 draws "2 matches") | U0 | Minimum to function | approved (decision 57) |
| Reorder states the frames do not draw: the drop line on the left edge of the first column when a header is dragged to the start (C_QOT6 draws the line on a right edge); dragging a row in the columns picker has no lifted look | U0 | Minimum to function | approved (decision 57) |
| Caution and bell rows open their quote (`/rep/quotes/<number>`): C_QOB3 and C_QOB4 draw the rows as plain boxes, not links. Opening a dropdown never navigates | U2 | A list of quotes must lead to them | approved (decision 58) |
| Bell row wording for events C_QOB4 does not sample: "Q-24818 requested by Dana Ortiz" and "Q-24791 declined by Dana Ortiz", by analogy with its "Dana Ortiz replied on Q-24790" and "Q-24763 accepted by Canyon Ridge" | U2 | The frames' rows are samples (Appendix G); the words come from real data | approved (decision 58) |
| Caution lines for reasons C_QOB3 has no sentence for (its three: "Dana Ortiz asked to move pickup to Ogden.", "Draft has 1 line below the margin floor.", "Sent Oct 6, no reply yet."): a draft waiting with no line below the floor reads "Requested Sep 23, not sent yet." (after the sent sentence); a sent quote marked by the expiry rule (expires today or tomorrow) keeps "Sent Sep 23, no reply yet." with no word about the expiry; a change request note that does not read as a request reads "Dana Ortiz asked for changes: the size is wrong.", an empty one "Dana Ortiz asked for changes." | U2 | Every quote in the caution needs a line; closest frame sentence | approved (decision 59) |
| How C_QOB3's and C_QOB4's sentences are filled from real data: a change request is the note's first line and sentence without its polite opening ("Can you", "Please"), trimmed to one row (48 characters) at a comma or a word with "…" ("Dana Ortiz asked to hold the anchors for pickup…"); "accepted by" names the customer by its full name ("Q-24830 accepted by Wasatch Mechanical Contractors"), and so does a row whose quote has no contact; an expired row's day is the day the quote expired (the day after valid until); dates are UTC days, like the Quotes list | U2 | The frames' rows are samples (Appendix G) | approved (decision 59) |
| A bell or caution title too long for one row (C_QOB4 draws each title on one row): at 1920x1080 "Q-24830 accepted by Wasatch Mechanical Contractors", the longest seeded customer name (decision 59: the full name), stays on one 17px row and ends with an ellipsis at the panel edge; the full text is its `title` tooltip. `e2e/frames-shell.spec.ts` checks it, and C_QOB4 matches with no height difference | U2 | Decision 59's full name does not fit the 360px panel | approved (decision 60) |
| Empty dropdowns: the caution shows only its heading ("0 need your attention"); the bell shows "No notifications" (decision 52: one plain line) | U2 | Minimum to function | not needed (decision 52) |
| Customer account chip menu: the chip (C_CVL1) opens a one-item menu, Sign out, which returns to the visitor box | U10 | The customer has no other way to sign out once "Switch workspace" is gone | approved (decision 56) |
| Customer conversation once it has turns: the turns in the box's column (scrolling), and New conversation beside Orders and My rep (the Orders button's tokens) | U10 | The frames draw the box before the first question only | approved (decision 56) |
| Visitor conversation: the question and the stub's "Sign in to continue." in the same column | U10 | Minimum to show the R-14 stub's answer | approved (decision 57) |
| Bell copy for an expired quote ("Quote Q-24815 expired", "It was valid until Oct 3."), "N min ago" and "Today" time labels | U10 | The frames draw ready, updated and shipped notices only; the task asks for expired notices too | approved (decision 56) |
| Empty and error lines in the bell, the Orders and My rep sheets ("No notifications yet.", "No orders yet.", "No rep is assigned yet.") | U10 | Decision 52: one plain line | not needed (decision 52) |
| The strip that holds the bell, the account chip and Sign in: the frames' 72px header with its bottom rule, without the stand-in Herrick logo | U10 | The controls the task builds sit in it, and the sheets open under it (C_CVL2, C_CVL3) | approved (decision 56) |
| Customers, Orders, Stock list states the frames do not draw: one plain line when nothing matches ("No customers match.", "No orders match.", "No items match."; "No orders for Great Basin Fabrication yet." for a picked customer with none); "Show fewer …" after "Show N more" (the U0 table's) | U5 | Decision 52: one plain line | not needed (decision 52) |
| The applied state of the Orders and Stock filters: the Filter button's count badge only (C_CU2's chip row is drawn for Customers only) | U5 | Minimum to function | approved (decision 62) |
| Customers chips for groups C_CU2 does not sample, in its "Rep: Brandi Gallegos, Eli Porter" pattern: "Terms: Net 30, Not on file", "Open balance: $0.00 to $5,000.00" ("from $1,000.00", "up to $5,000.00"), "Only show: Has open quotes, Never ordered" | U5 | Every applied group needs a chip | approved (decision 62) |
| Filter field hints: "Open balance to" shows the highest credit limit in the list (C_CU1 "$50,000.00", which the seed matches), "List price to" the highest list price ($121.00 where C_ST1 samples $500.00); the from fields show "$0.00"; Ordered from and to are native date fields (C_OR1 samples "Jan 1, 2026" and "Oct 10, 2026") | U5 | The frames' values are samples; the fields must take any amount or day | approved (decision 62) |
| "Low stock" (C_ST1 Only show): less than one full case (case_qty packs) on hand at some branch. No spec or frame defines it | U5 | The filter needs a rule | approved (decision 62) |
| The Rep filter on Orders lists every rep with customers the manager reads (C_OR1 lists reps beyond those with orders) | U5 | Closest to the frame | approved (decision 62) |
| Customer page: the Recent orders table when the customer has orders (C_CU3 draws the card empty for Canyon Ridge), drawn as its Recent quotes table with Order, Ordered, Fulfillment, Status, Total; a contact's phone and email, drawn as the rep card's; "No quotes yet" with the old line, in the frame's empty style; the not-on-file account line; "No rep is assigned to this customer." | U5 | Real data the sample customer lacks | approved (decision 62) |
| Order statuses the frames do not draw: Open as plain text (600) in the list; the Closed (muted) and Open chips on the order page (C_OR2 draws Shipped); "Picked up" for a will-call order, "Direct order" with no quote, "-" with no PO (the page's old words) | U5 | Real statuses and orders | approved (decision 62) |
| Add to quote after the frame (C_ST3): the quote opens after adding (POST /api/rep/quotes/<number>/lines); a refused add shows the server's reason in one red line and the dialog stays; the drafts are the rep's own (decision 22), newest quote first; the quantity starts at 1 (C_ST3 samples 2) and takes whole numbers of 1 or more | U5 | Minimum to function | approved (decision 62) |
| "Start a new quote" in Add to quote: drawn and selectable, but no route starts a quote from Stock (quotes start from a customer's request or a duplicate), so its button reads "Start a new quote" and stays disabled; its picked look (2px dashed accent on the picked grey) has no frame | U5 | Product decision: what a rep-started quote needs (customer, fulfillment, branch) | approved (decision 62) |
| Not found pages for a customer, order or item: the page title, one line and the way back, in the new tokens | U5 | Decision 52 | not needed (decision 52) |
| Settings > Customer access: a plain "Customer" select (All customers, then the customers the signed-in rep may read) in place of the removed header "Viewing" picker | U1 | Per-customer access must stay settable once the picker is gone; replaced by the Customer access frames (C_S1, C_S1a, C_S1b) in U8 (OA-69) | not yet |

### Deferred: auth
| What | Task | Reason |
|---|---|---|
| Real anonymous query route (the visitor box answers "Sign in to continue." from the stub `POST /api/query/visitor/chat`, which imports nothing) | U10 | Decision 49, TODO(R-14) in `src/app/api/query/visitor/chat/route.ts` |
| Customer login, embed script, token handoff, SSO | none | Decision 49: comes with the Supabase work |

### Lane U frame ledger
Every board in `canvas.json` (89). State is PASS (frame spec diff with zero unexplained differences), deferred (with reason) or no-frame. The rail on every page frame is proven in U2.

Rail (every page frame's left edge): PASS in U2 (`e2e/frames-shell.spec.ts`) against C_QOBoard as the manager and C_RQBoard as a rep, scoped to the `aside`: every element and computed style, both directions (nothing missing, nothing added), 216px wide, sticky at the top at 100vh after scrolling a long page, the page area taking the rest of the width; every rep route renders in the shell. The frames' user names (Brian G., Brandi G.) are placeholders.

| Frame | Task | State |
|---|---|---|
| C_QOB3 | U2 | PASS (`e2e/frames-shell.spec.ts`, header controls and dropdown; rows are real data, Appendix G, worded in the frame's sentence per status, each one row tall) |
| C_QOB4 | U2 | PASS (`e2e/frames-shell.spec.ts`, header controls and dropdown; rows are real data, Appendix G, worded in the frame's patterns: the contact who replied, the customer who accepted, by its full name (decision 59); no differences: a title too long for the panel stays on one row with an ellipsis and a tooltip, decision 60) |
| C_QOB9 | U2 | PASS (`e2e/frames-shell.spec.ts`; the overlay is `position: fixed` where the frame's one-viewport root uses `absolute`) |
| C_QOB1 | U3 | pending (component level PASS in U0, `e2e/frames-primitives.spec.ts`) |
| C_QOB2 | U3 | pending (component level PASS in U0, `e2e/frames-primitives.spec.ts`) |
| C_QOB5 | U3 | pending |
| C_QOB6 | U3 | pending |
| C_QOB7 | U3 | pending |
| C_QOB8 | U3 | pending (component level PASS in U0, `e2e/frames-primitives.spec.ts`) |
| C_QOBoard | U3 | pending |
| C_QOT1 | U3 | pending |
| C_QOT2 | U3 | pending (component level PASS in U0, `e2e/frames-primitives.spec.ts`) |
| C_QOT3 | U3 | pending |
| C_QOT4 | U3 | pending |
| C_QOT5 | U3 | pending |
| C_QOT6 | U3 | pending (component level PASS in U0, `e2e/frames-primitives.spec.ts`) |
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
| C_CU1 | U5 | PASS (`e2e/frames-records.spec.ts`; Brandi and Eli picked as drawn; the seed's four reps pair with the frame's three by name, Brandi's count 2 for the sample 3, Appendix G) |
| C_CU2 | U5 | PASS (`e2e/frames-records.spec.ts`; chip "Rep: Brandi Gallegos, Eli Porter" literal; the frame's Canyon Ridge row is drawn as Brandi's, Mara Jensen's in the seed, so 4 customers for the sample 5) |
| C_CU3 | U5 | PASS (`e2e/frames-records.spec.ts`; Canyon Ridge's rep is Mara Jensen in the seed (the frame draws Brandi); the open quotes' requested days follow the clock, compared by place) |
| C_CUBase | U5 | PASS (`e2e/frames-records.spec.ts`; Canyon Ridge's rep is Mara Jensen in the seed; search 320px) |
| C_OR1 | U5 | PASS (`e2e/frames-records.spec.ts`; Delivery and SLC picked as drawn; Ordered from and to are native date fields; a fourth rep, Mara Jensen, in the seed) |
| C_OR2 | U5 | PASS (`e2e/frames-records.spec.ts`; side column 340px) |
| C_ORBase | U5 | PASS (`e2e/frames-records.spec.ts`; ten orders then "Show 13 more orders"; the seed links SO-51214 to Q-24806, which the frame's sample omits; customer names fit on one line at 1920) |
| C_RCU1 | U5 | PASS (`e2e/frames-records.spec.ts`; Mara's one customer for the frame rep's three, so Terms offers Net 30 only and Open balance to reads $40,000.00) |
| C_RCUBase | U5 | PASS (`e2e/frames-records.spec.ts`; Mara's book is Canyon Ridge with 18 of its quotes, the frame's rep has three customers) |
| C_ST1 | U5 | PASS (`e2e/frames-records.spec.ts`; Fasteners picked as drawn; category names are catalog data ("&", "/" where the frame writes "and"); List price to $121.00 for the sample $500.00) |
| C_ST2 | U5 | PASS (`e2e/frames-records.spec.ts`; side column 340px) |
| C_ST3 | U5 | PASS (`e2e/frames-records.spec.ts`; Brandi's own drafts Q-24817 and Q-24790 (decision 22) for the frame's three; quantity starts at 1; 580px, 120px from the top, centred) |
| C_STBase | U5 | PASS (`e2e/frames-records.spec.ts`; nine items then "Show 53 more items"; search 340px, Add to quote 108px in the 124px track) |
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
| C_CVE0 | U10 | PASS (`e2e/frames-customer.spec.ts`; placeholders per Appendix G listed in the U10 PR) |
| C_CVL1 | U10 | PASS (`e2e/frames-customer.spec.ts`; placeholders per Appendix G listed in the U10 PR) |
| C_CVL2 | U10 | PASS (`e2e/frames-customer.spec.ts`; placeholders per Appendix G listed in the U10 PR) |
| C_CVL3 | U10 | PASS (`e2e/frames-customer.spec.ts`; placeholders per Appendix G listed in the U10 PR) |
| C_CVL4 | U10 | PASS (`e2e/frames-customer.spec.ts`; placeholders per Appendix G listed in the U10 PR) |
| C_CVL5 | U10 | PASS (`e2e/frames-customer.spec.ts`; placeholders per Appendix G listed in the U10 PR) |

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
