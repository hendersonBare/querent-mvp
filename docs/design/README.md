# Design reference

The visual source of truth for Querent v3 ("Query to Quote") is the charcoal design canvas (lane U). The spec, plan and task list live in `docs/plans/`.

| File | What it is |
|---|---|
| `canvas-frames/C_<id>.dc.html` | The 89 canvas frames, indexed by `canvas.json`, with their runtime `support.js`. Each frame is one screen or one opened state at 1440x900; the product is built and checked at 1920x1080 (decision 51). Read them as live DOM with `npm run frames -- list`, `dump` and `compare` (`scripts/frames/`); the `e2e/frames-*.spec.ts` specs diff every frame against the running app. |
| `new-ui-refactor-prompt.md` | The frame-to-route map (the only one) and the lane U build prompt. |
| `new-ui-implementation-prompt.md` | Behaviour, roles, data model, API and copy rules (Parts 1 and 2, Appendices A to H). Its Part 3 is superseded by lane U in `docs/plans/plan.md`. |
| `new-ui-style-guide.md` | The token sheet (palette, type, sizes, "States not drawn"). Where it and a frame disagree, the frame wins. |
| `canvas-build/` | The scripts that built the canvas, and its handoff notes. Reference only. |
| `logo/` | The Querent logo. |
| `querent-quote-flow.html`, `screens/*.png` | The old v2 mockup (teal, Archivo and IBM Plex) and its screenshots. **Superseded** by the frames for every screen; kept only for the workflow flowchart whose step numbers (1 to 8) the golden flow uses. |

Brand: accent `#14803C`, Albert Sans (400 to 800) and Geist Mono (400, 500), the charcoal rail `#1F2422`.

## Intentional differences

The build reproduces the frames. These are the places it differs on purpose, each settled by a decision in `docs/plans/decision-log.md` or approved under "No frame" in `docs/plans/status.md`. Verifiers: these are **not** defects. The frame ledger in `status.md` records, per frame, every difference a frame spec explains.

**Everywhere**
- Names, numbers, dates, counts and samples in the frames are placeholders (Appendix G); the app shows real data in the frames' sentence patterns.
- "FEATURE FLAG: HIDDEN" badges and dashed outlines are design markers and never render (decision 50).
- Built at 1920x1080: fixed widths stay as drawn and flex or grid widths grow; there are no max-widths, no type scaling, and no phone or tablet layout (decisions 43, 51).
- Hover, focus, loading and disabled states follow "States not drawn" in the style guide; an empty or error state is one plain line (decision 52). Opened dropdowns and sheets take focus, keep Tab inside and give focus back when they close.
- Spans the frames draw as controls (switches, Cancel, Send) are real buttons with the same computed styles.

**Rep portal**
- **Shell (U2):** the 216px rail (logo, Herrick, nav with icons, the user's short name and role, **Sign out** with its confirm dialog, C_QOB9) and a page header ending with the **caution** and **bell** dropdowns (C_QOB3, C_QOB4). Nav: Quotes / Customers / Orders / **Stock** / Analytics (**My Analytics** for a rep) / **Teams and Reps** (manager) / Settings, at `/rep/stock` and `/rep/teams` (decision 46). No search, no nav count, no header customer picker: scope is role based (U1), and pages that need a customer filter it with `?customer=`. The frames' user names ("Brian G.", "Brandi G.") are placeholders.
- The frames disagree on the nav label: 61 page frames draw it as one block span, the 22 Quotes frames wrap the text in a second, inline span. The rail draws the majority form (U11); against the Quotes frames the label's `display` (inline there, block here) is the one explained difference (`e2e/frames-shell.spec.ts`).
- The caution button's border is `#E8A8A0` on every page; the nine Quotes table frames draw `#F1BEB8` (decision 54).
- Caution and bell rows (decisions 58 to 60): choosing a row opens that quote; an empty bell says "No notifications". Caution lines follow C_QOB3's sentences ("Dana Ortiz asked to move pickup to Ogden.", "Draft has 1 line below the margin floor.", "Sent Oct 6, no reply yet."), bell rows C_QOB4's patterns, with "accepted by" naming the customer's full name; a row too long for the panel ends with an ellipsis and a tooltip. Events the frame does not sample name the contact ("Q-24818 requested by Dana Ortiz").
- **Quotes (U3):** status is plain text with one red line ("Overdue", "Aging", "1 line below floor"), red for Aging too and with no icon, as the frames draw it (decision 50 over decision 18's icon). Needs attention is the header caution plus Only show Overdue and Aging in Filter; there is no bulk reassign here (decision 45). Send reply posts the reply into the customer's conversation and records it on Activity (decision 63). Rows with no frame are listed in `status.md`.
- **Quote editor (U4):** a quote that carries freight recovery keeps a small "Freight recovery N%" chip in the header, in the CONTRACT tag's look: the one explained addition to C_QEBase (decision 64). No status banners: what they said is in the header Status and Quote details.
- Send blockers (decision 44, no frame): Approve and send is disabled while anything blocks a send, with the first blocker in red under it and "+N more"; clicking it jumps to the line or field. Stock short at the branch ("Short 5 at SLC. 20 at Ogden. 24 on order at SLC, due Sep 26") and a match below 0.75 show as notes on their line and never block. The server refuses a blocked send too.
- On another rep's quote the manager's editor is read-only, with "Read only: Mara Jensen's quote. Reassign it to edit." under Approve and send and Reassign in More actions (decision 22); "Reassign to another rep" is the manager's only.
- Lines tagged ADDED, SUGGESTED and CHAT SUGGESTION use the CONTRACT tag's style (decision 64). A "?" beside each line's price-basis dropdown explains Querent's pick. A red warning sits directly above a price below the floor (rep × category) and never blocks.
- The total box's margin floor is the quote's **blended floor**: each line's rep × category floor, weighted by line revenue.
- Quote terms: "Valid until" is a date picker (tomorrow to a year out); until one is picked a draft runs 14 days from the day it is sent. Activity logs what happens to the quote, not the rep opening it.
- Send dialog: Querent chat is the only channel (Email and Text are not built); Attach PDF is on by default; Send quote opens a centered **Confirm send** with a red Cancel and a green Send (decision 64). No manager-approval step.
- **Freight** is priced by distance from the selected branch, shows the miles and the formula, and can be overridden with a reason (Quote details).

**Sample data, not layout**
- The seeded Q-24817 is priced by the pricing engine (task 1.1), so its numbers differ from the mockup's hand-made sample: **$1,122.40** instead of **$1,109.50** (bolts $31.50 last paid, straps $22.95). **Decision 72**: the demo keeps the engine's prices. Two more numbers follow from the same prices:
  - The total box's **$361.40 gross profit, 32.2% margin**, and each line's margin and total, follow the same prices (mockup: $348.50, 31.4%).
  - "Suggested by Querent" shows **"5 ideas, up to +$162.95"** where the mockup has **"4 ideas · up to +$164.10"**. The chips come from the deterministic upsell rules (task 1.6) over the seeded order history, priced by the engine: matching nuts and matching washers for the bolts, a flap disc and safety glasses (bought with the wheels and the gloves in Wasatch's orders), and bumping the wheels to 2 full cases. The mockup hand-picked 4 (flap disc, nuts, edge protectors, a bolt quantity break). The 5 boxes of nuts and of washers are each a broken case (10 to a case), so the engine prices them at customer price + 10% ($18.15 and $14.25).
- Brandi's seeded floors differ by category (spec §5.2: "a few of Brandi's differ so the warning is easy to demo"): Safety & PPE is 30%, so the gloves (26.6%) show the red **"Below Brandi's 30% Safety & PPE floor"** above their price, which the mockup's all-20% sample doesn't.
- The seeded customer request is Dana's whole chat message, which goes on to the ratchet straps ("… Also need 2 in ratchet straps, maybe 12"), so it runs longer than the mockup's before the ellipsis.
- With those prices and floors, the gloves show the red below-floor note above their price, and the straps a stock-short note. The straps were matched with 0.90 confidence, so there is no "Confirm the match" note on them; it appears for any line matched below 0.75.
- "Valid until" on a draft follows the day it is read (the quote's valid days from now), and the bell's dropdown lists what is unread at the time.

**Customers, Orders, Stock (U5: canvas frames C_CUBase to C_ST3)**
- Lists have the page's own search or customer picker, the **Filter** panel (Stock's holds the category), the count, the columns picker and "Show N more"; record pages have no breadcrumb. **Add to quote** works from a Stock row and the item page and adds to one of the rep's own drafts. Built with no frame (listed in `docs/plans/status.md`): the applied-filter chips only on Customers (C_CU2), the Orders and Stock badge only; "Low stock" as less than one full case at a branch; the Recent orders table on a customer page; the Closed and Open order chips; opening the quote after Add to quote, the refused-add line, and the disabled "Start a new quote" button.

**Settings (U8 and U9: canvas frames C_S1 to C_S8 and C_RS1 to C_RS4)**
- The manager's tabs are **Customer access**, **Margin floors**, **Pricing and delivery** and **Aging**. **Data sources** is gone from the UI; Rep assignments and Reps are on Teams and Reps.
- **Customer access** has a search and a **Filter** (each data type Any, Querent answers, Not shared): with neither, one switch per data type for every customer; with either, a table of the matching customers with one switch per type. A type that differs between customers reads "On for some customers" (decision 68).
- **Margin floors** holds the **Organization margin floors** (the hard stop per category) and the read-only, searchable **Rep margins** review.
- **Pricing and delivery:** inputs are right-aligned with their units under the label; every delivery rate stays editable with its worked example, saved from the title bar. **Free delivery pricing**, **Recovery pool** and **Delivery cost model** render only while their feature flags are on (decision 48); the frames' "FEATURE FLAG: HIDDEN" badges and dashed outlines are never drawn. The impact preview opens as a dialog over the page.
- **Aging** has no descriptions; the "1 day" style conversions stay.
- A rep's Settings has **Margins**, **Profile** and **Notifications** (U9). Margins edits the rep's own margin per category against the organization floor, which the server enforces (the row turns red with the real floor and Save is disabled); Profile's picture, name, phone and email are what customers see in My rep and on quotes; Notifications holds in-app switches only, which the caution and bell dropdowns follow. The manager's Settings ends with her own **Profile** tab after her four (decision 69), the same component in C_RS2's layout, because customers see her in My rep.

**Analytics (U6: canvas frames C_ANBase to C_AN8 and C_RAN1 to C_RAN5)**
- `/rep/analytics` has tabs: **Overview** (five stat cards, quotes and wins by week with **Show table**, average margin vs floor, top requested items), **Rep leaderboard** (manager only, with **Export CSV** in the header and the window, 7 / 30 / 90 days or Custom, in its title bar), **Decline reasons**, **Untouched quotes** and **Customer questions** (questions answered without a rep, then the query analytics).
- The manager's **Filter** picks any mix of reps and teams (team entities since U7: a team takes in the reps of the teams inside it), a customer, and "Break the numbers down by" Whole organization, Rep, Team or Customer. A rep's **My Analytics** has no leaderboard, its filter picks one of their own customers and a period, and its tables drop the per-rep columns and the totals; Customer questions has no Assigned rep and no "Manage customer access".
- Every number is real data (Appendix G): the frames' figures, names and dates are placeholders, and their sentences ("From request to first send, 47 quotes", "Quotes created Sep 12, 2026 to Oct 11, 2026, ...") are filled from the data. A value with nothing to divide by reads "-" as C_AN6 draws it (no em-dash). The "i" beside a number keeps its explanation as a tip on hover or focus.
- Built with no frame (listed under "No frame" in `docs/plans/status.md`, to ask): the Custom window's two days, what the breakdown does to the rows, the columns picker's extra leaderboard columns, the empty lines, and the zero-data sentences.

**Teams and Reps (U7: canvas frames C_TRBase to C_TR7)**
- `/rep/teams` (manager only) is the reps and teams page, with no analytics (they are on Analytics). The **Reps** card lists the reps (managers are not listed) with Customers, Role (the rep's title), Team and an Active switch; **Save** stores the switches, and the server refuses to deactivate a rep who still has customers. The count button opens a rep's customers: the **x** disconnects one and asks for the new rep in the same step; **+ Connect a customer** searches the others and asks to confirm a move, counting the open quotes that would move. The **Teams** card lists the teams with their rep counts, **Create team**, and for a picked team **Add to team**, **Remove from team**, **Move into other team**.
- Rep assignments, deactivation and bulk reassign (decision 45) are done here, not in Settings.
- Teams are entities with an optional parent; a parent counts the reps of the teams inside it, for grouping and filters only (decision 47).
- Names, roles, counts and team names in the frames are placeholders (Appendix G); the frames draw Brandi as a listed rep, but she is the manager and the card lists no managers.
- Built with no frame (listed under "No frame" in `docs/plans/status.md`, to ask): the two Filter panels, picking rep rows for **Reassign open quotes**, the Add to team and Remove from team dialogs, a team inside another indented in the list, the opened "Inside another team" list, and the empty and error lines.

**Customer view (U10: canvas frames C_CVE0 to C_CVL5)**
- `/` is the Querent box on the supplier's site. Only the box, the Orders and My rep sheets, the bell and the account chip are built; the frames' Herrick header, nav and page are a stand-in. With no session it is the visitor box with the public starter questions and a **Sign in** button to the demo chooser at `/demo`; every visitor question is answered "Sign in to continue." (decision 49, R-14).
- Signed in: **Orders** and **My rep** open side sheets; the **notification bell** with its unread count is how the customer finds a quote, and a quote notification opens the **PDF preview** with Decline, Request changes and Accept. Each action still gets its centered dialog (no frame).
- Built with no frame (listed under "No frame" in `docs/plans/status.md`): the account chip's Sign out menu, the conversation once it has turns (and New conversation beside Orders), the expired-quote notification's wording, and one-line empty states.
- The **item pop-up** before quoting shows matched items, qty, and stock at the branch, but **no prices**, plus a pickup/delivery and branch choice, and a **Request quote** button.

**Exports**
- The Customer PDF is **formal and black and white**, like a document from an established distributor, with a small "via Querent" in the footer. It must not look AI-generated.

**Out of scope for this MVP (not built):** email/text sending, manager approval, substitutes and branch-transfer suggestions for short items, market reference price, and steps 9+ (writing the order to the ERP, invoicing, payment).
