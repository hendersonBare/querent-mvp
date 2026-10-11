# New UI refactor: cloud session prompt and frame-to-route map

Paste the block under "The prompt" into a new Claude Code cloud session (Opus 5.5). The map below it is part of the prompt. Do not edit one without the other.

Source frames: `docs/design/canvas-frames/C_<id>.dc.html` (89 files plus `canvas.json`), committed copies of https://claude.ai/artifact/9JknKAyWrdWdjZpgvLAnHj (page "New UI (Charcoal)"). The older link in `new-ui-implementation-prompt.md` (X1xF...) is the same design before this copy; the committed frames win.

## The prompt

```text
You are refactoring the whole Querent UI to match a finished design canvas. The design is done and approved. Your job is to reproduce it, not to improve or reinterpret it.

SOURCES, in order of authority
1. Canvas frames: docs/design/canvas-frames/C_<id>.dc.html, indexed by canvas.json. Each file is plain HTML with inline styles inside <x-dc> (the support.js runtime is not included). To view one, build a small script in U0 that strips the x-dc, helmet and script wrappers, inlines the helmet <style> and font <link>, and screenshots at 1440x900 into docs/design/canvas-frames/png/ (commit the PNGs). Do not work from the prose docs alone.
2. docs/design/new-ui-implementation-prompt.md Parts 1 and 2 and Appendices A to H: behaviour, roles, data model, API, copy rules. Part 3 of that file is superseded by this prompt.
3. docs/design/new-ui-refactor-prompt.md (this file): the frame-to-route map. It is the only mapping you may use.
4. docs/design/new-ui-style-guide.md is the charcoal token sheet read from the frames. Where it conflicts with a frame, the frame wins; fix the guide.
5. AGENTS.md and docs/plans/decision-log.md. The decision log wins over everything except my answers in chat. AGENTS.md says this Next.js has breaking changes: read the relevant guide in node_modules/next/dist/docs/ before writing routing, layout, data fetching or font code.

FIDELITY RULES (anti-drift)
- Every UI change is traced to a frame id from the map. If a screen, state or control has no frame, do not invent it: build the minimum needed to function in the same tokens, list it in docs/plans/status.md under "No frame", and ask me.
- Take exact values (px, hex, font size and weight, radius, gaps, column widths, copy) from the frame's own inline styles. Do not eyeball from screenshots and do not substitute Tailwind or library defaults.
- Copy is literal. Use the frame's labels and wording. No em-dashes. No added descriptions, helper text, icons or buttons.
- Placeholder data in frames (Appendix G: rep analytics numbers, impact preview table, rep margins, board counts, weekly chart, Provo hours, Herrick site, notification and order samples) is NOT product data. Wire real data. Never copy a placeholder number into code.
- "FEATURE FLAG: HIDDEN" badges and dashed outlines are design markers. Do not render them. Sections C_S5 and C_S6 render only when their flag is on.
- VIEWPORT: frames are drawn at 1440 x 900, but you build and verify at 1920 x 1080. The rail stays 216px and sticky at 100vh; the page area is fluid and fills the rest. Take sizes (padding, type, radii, control heights, column widths in px) from the frames; let widths that the frame sets by flex or grid grow. Do not add max-widths, do not scale type, do not stretch controls. Where a frame sets a fixed width (for example the editor columns Qty 60, Unit price 118, Margin 78, Total 82) keep it. Scrolled frames (C_AN1, C_AN5) show a long page, not a different page.
- NO phone or tablet layouts. Do not build breakpoints, hamburger drawers or stacked-card tables. Delete the old responsive CSS for pages you replace.
- AUTH IS OUT OF SCOPE. Customer login, embed and SSO will come later with Supabase. Keep the current demo auth and cookies untouched. Build the visitor and logged-in customer screens against the existing session; the visitor state (C_CVE0) is selected by having no session. Do not build token handoff, embed scripts or an anonymous public query route beyond a stub that returns a fixed "sign in to continue" reply; list it under "Deferred: auth".
- HOVER, FOCUS, LOADING: build them quietly per "States not drawn" in docs/design/new-ui-style-guide.md. Nothing else without a frame.
- Do not touch Appendix F areas (pricing and margin math, freight, SKU matching, PDF export, ERP sync, aging rules, reassignment rules, customer chat tools, demo personas and seed data, /api/test/*).
- Empty and error states have no frames either: one plain line per the style guide. Do not redesign anything.

PROCESS
- Run /querent-task-loop as orchestrator. First add lane "U" to docs/plans/plan.md using the task list below. Each task lists its frame ids as acceptance criteria. Add any new rule to docs/plans/decision-log.md before coding it. Update docs/plans/spec.md and docs/design/README.md ("Intentional differences") where they describe the old UI.
- One worktree and branch per task (task/U<n>-<slug>), tests first, merge only when every gate passes and the verifier approves.
- Verifier gate for every UI task: run the app, open the page at 1920x1080 as the right role, and compare it frame by frame with the mapped frames (the committed PNG at 1440x900). Because the viewport differs, compare the rail, header, card title bars, controls, table rows and type by measured px and colour, and check that extra width goes to the fluid regions only. Record per frame: PASS, or each measured difference with the frame value and the app value. A task with an unexplained difference fails. Then run typecheck, unit tests, build and Playwright.
- DECISIONS ARE MADE. Record each in docs/plans/decision-log.md as the first commit, then do not ask again:
  1. Customer quote actions: notification bell, quote opens with Accept, Request changes, Decline.
  2. Role switch for reps who are managers: dropped.
  3. No phone or tablet layouts.
  4. Send blockers: disabled Approve and send, first blocker named under it with "+N more", click jumps to the line or field, inline notes for stock-short and low-confidence matches. The server still refuses a blocked send.
  5. Bulk reassign moves to Teams and Reps (not the Quotes table).
  6. Rename /rep/items -> /rep/stock and /rep/team -> /rep/teams, with permanent redirects from the old paths. Update links, tests and docs.
  7. Parent team is grouping only. No permission inheritance.
  8. Feature flags are environment variables read on the server: FEATURE_FREE_DELIVERY_PRICING, FEATURE_RECOVERY_POOL, FEATURE_DELIVERY_COST_MODEL (default off). Add them to .env.example. No flags table; skip the feature_flags migration in Appendix C. Sections do not render and their settings routes reject writes while off.
  9. Customer login, embed and auth: deferred to the Supabase work. See AUTH IS OUT OF SCOPE above.
  Ask me only about something not on this list.
- Never end a session with work in flight unless the branch is pushed and docs/plans/status.md says where it stands.

TASKS (U0 to U11 as in docs/design/new-ui-implementation-prompt.md Part 3, with the frame ids from the map below as the acceptance criteria for each)
U0 tokens and primitives. U1 scope and roles. U2 shell. U3 quotes list. U4 quote editor. U5 customers, orders, stock. U6 analytics. U7 teams and reps. U8 manager settings. U9 rep settings. U10 customer site. U11 cleanup and proof.
U0 also: build the frame render script and PNGs described in SOURCES. U7 also: bulk reassign (decision 5) is part of the Teams and Reps frames C_TR2 to C_TR4 plus a row selection on the reps table; the Quotes table has no reassign. U8 also: env-var flags (decision 8). U10 also: build the screens only, per AUTH IS OUT OF SCOPE; the orders and notifications endpoints stay.
For U11 also: every frame id in the map must appear in docs/plans/status.md as PASS, deferred (with reason) or no-frame. Nothing may be missing.

FRAME-TO-ROUTE MAP (every frame, no others)
<paste the map table from this file here>
```

## Frame-to-route map

"Page" frames are the screen. "Overlay" frames are the same screen with one control opened; build them as the control's open state on that route, not as separate routes.

Role column: M = manager, R = rep, C = customer, V = visitor.

### Shell (appears in every page frame, role-specific nav)

| Frame | What it defines | Code target | Task |
|---|---|---|---|
| any page frame, left edge | Rail: 216px charcoal, logo, supplier name, nav, user block with role and Sign out. M: Quotes, Customers, Orders, Stock, Analytics, Teams and Reps, Settings. R: same with My Analytics and no Teams and Reps | replaces `RepShell` and `RepHeader` in `src/components/rep` | U2 |
| C_QOB3 | Needs attention (caution) dropdown | page header, all rep routes | U2 |
| C_QOB4 | Notifications (bell) dropdown | page header, all rep routes | U2 |
| C_QOB9 | Sign out | Rail user block | U2 |
| C_QOB1 | Customer picker dropdown (first 5, scroll, search) | shared picker used by quotes and settings | U0/U3 |
| C_QOB2 | Filter panel pattern | shared `FilterButton` and panel | U0 |
| C_QOB8 | Reorder columns (board headers) | board column drag | U3 |

### Quotes: `/rep/quotes` (M and R)

| Frame | Kind | Notes | Task |
|---|---|---|---|
| C_QOBoard | page | Board view | U3 |
| C_QOB1 to C_QOB9 | overlays | B1 picker, B2 filter, B3 caution, B4 bell, B5 quote preview, B6 view note, B7 show more, B8 reorder, B9 sign out | U2/U3 |
| C_QOTable | page | Table view | U3 |
| C_QOT1 to C_QOT7 | overlays | T1 filter, T2 columns, T3 quote preview, T4 view note, T5 show more, T6 reorder, T7 customer search | U3 |
| C_RQBoard | page (R) | Rep board: no rep filter, own customers | U3 |
| C_RQB1, C_RQB2 | overlays (R) | Customer picker, Filter | U3 |
| C_RQTable | page (R) | Rep table: no Rep column | U3 |

### Quote editor: `/rep/quotes/[id]` (M and R, same layout, rep data)

| Frame | Kind | Task |
|---|---|---|
| C_QEBase | page | U4 |
| C_QE1 Approve and send, C_QE2 Export, C_QE3 More actions, C_QE4 Quote details, C_QE5 Suggested by Querent, C_QE6 Customer chat, C_QE7 Show cost and stock, C_QE8 Add item, C_QE9 Line details, C_QE10 Price source, C_QE11 Draft saved | overlays and states | U4 |

No frame: the blocked-send state (disabled Approve and send with first blocker named). Build per decision 4 and list under "No frame".

### Customers: `/rep/customers`, `/rep/customers/[id]`

| Frame | Kind | Task |
|---|---|---|
| C_CUBase | page (M), list | U5 |
| C_CU1 | overlay, filter open | U5 |
| C_CU2 | overlay, filter applied | U5 |
| C_CU3 | page, customer detail (`/rep/customers/[id]`) | U5 |
| C_RCUBase | page (R), list without Rep column | U5 |
| C_RCU1 | overlay (R), filter | U5 |

### Orders: `/rep/orders`, `/rep/orders/[id]`

| Frame | Kind | Task |
|---|---|---|
| C_ORBase | page, list | U5 |
| C_OR1 | overlay, filter open | U5 |
| C_OR2 | page, order detail | U5 |

### Stock: `/rep/stock`, `/rep/stock/[id]` (renamed from items)

| Frame | Kind | Task |
|---|---|---|
| C_STBase | page, list | U5 |
| C_ST1 | overlay, filter open | U5 |
| C_ST2 | page, item detail | U5 |
| C_ST3 | overlay, Add to quote | U5 |

### Analytics: `/rep/analytics`

| Frame | Kind | Role | Task |
|---|---|---|---|
| C_ANBase | page, Overview | M | U6 |
| C_AN1 | scrolled Overview | M | U6 |
| C_AN3 | Overview with table toggle on | M | U6 |
| C_AN4 | Overview, filter open | M | U6 |
| C_AN6 | tab Rep leaderboard | M | U6 |
| C_AN7 | tab Decline reasons | M | U6 |
| C_AN8 | tab Untouched quotes | M | U6 |
| C_AN2 | tab Customer questions | M | U6 |
| C_AN5 | Customer questions scrolled | M | U6 |
| C_RAN1 | My Analytics, Overview | R | U6 |
| C_RAN2 | filter | R | U6 |
| C_RAN3 | Decline reasons | R | U6 |
| C_RAN4 | Untouched quotes | R | U6 |
| C_RAN5 | Customer questions | R | U6 |

The old `/rep/team` page and nav item are removed; its content lives in these tabs.

### Teams and Reps: `/rep/teams` (M only)

| Frame | Kind | Task |
|---|---|---|
| C_TRBase | page | U7 |
| C_TR1 | rep customers expanded | U7 |
| C_TR2 | disconnect a customer dialog | U7 |
| C_TR3 | connect a customer | U7 |
| C_TR4 | move approval (second confirm dialog) | U7 |
| C_TR5 | team selected | U7 |
| C_TR6 | create team | U7 |
| C_TR7 | move team | U7 |

### Settings (M): `/rep/settings`

| Frame | Tab or state | Task |
|---|---|---|
| C_S1 | Customer access | U8 |
| C_S1a | Customer access, filter open | U8 |
| C_S1b | Customer access, filter applied | U8 |
| C_S2 | Margin floors | U8 |
| C_S3 | Margin floors, review a rep | U8 |
| C_S4 | Pricing and delivery (flags off, the real default) | U8 |
| C_S5 | Pricing with Free delivery pricing (flag on only) | U8 |
| C_S6 | Pool and cost model (flag on only) | U8 |
| C_S7 | Impact preview (opens from Pricing and delivery; placeholder table) | U8 |
| C_S8 | Aging | U8 |

### Settings (R): `/rep/settings`

| Frame | Tab or state | Task |
|---|---|---|
| C_RS1 | Margins | U9 |
| C_RS2 | Profile | U9 |
| C_RS3 | Margins, a value below the organization floor | U9 |
| C_RS4 | Notifications | U9 |

### Customer site: `/` (`src/app/page.tsx`, V and C)

| Frame | State | Task |
|---|---|---|
| C_CVE0 | Visitor base box | U10 |
| C_CVL1 | Logged in with Orders, My rep and bell | U10 |
| C_CVL2 | Orders sheet open | U10 |
| C_CVL3 | My rep sheet open | U10 |
| C_CVL4 | Bell dropdown open | U10 |
| C_CVL5 | Quote opened from the bell (Accept, Request changes, Decline) | U10 |

Everything around the Querent box in these frames (the Herrick header, nav and page) is a stand-in for the supplier's site. Build only the Querent box, sheets and bell.

### Count check

Boards in canvas.json: 89. Frames mapped above: shell 0 (shared), QOB 10 (QOBoard + 9), QOT 8, RQ 4, QE 12, CU 4 + RCU 2, OR 3, ST 4, AN 9 + RAN 5, TR 8, S 10 (S1, S1a, S1b, S2 to S8), RS 4, CV 6. U11 recomputes this from canvas.json and must reach 89 with none unmapped.
