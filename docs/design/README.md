# Design reference

The visual source of truth for Querent v2 ("Query to Quote"). The spec, plan and task list live in `docs/plans/`.

| File | What it is |
|---|---|
| `querent-quote-flow.html` | The interactive mockup (flowchart + rep portal). Open it in the browser pane (`file://…/docs/design/querent-quote-flow.html`) and click through it. The claude.ai host runtime was stripped; it still loads Google Fonts and jsPDF from a CDN. |
| `screens/01-flowchart-mvp.png` | Workflow, MVP scope (steps 1–8) |
| `screens/02-flowchart-end-to-end.png` | Workflow, full end-to-end (steps 9+ are out of scope) |
| `screens/03-quote-detail.png` | Rep portal, quote detail (cost hidden) |
| `screens/04-quote-detail-show-cost.png` | Quote detail with Show cost on |
| `screens/05-export-menu.png` | Export menu (Customer PDF, Internal PDF, CSV, Copy summary) |
| `screens/06-more-menu.png` | ⋯ menu |
| `screens/07-send-dialog.png` | Approve & send dialog |
| `screens/08-quote-detail-mobile.png` | Quote detail at 390px |

> **Superseded for visuals.** The new UI (charcoal) in `canvas-frames/` replaces this mockup for every screen it covers. Palette, type and sizes: `new-ui-style-guide.md`. Build instructions and the frame-to-route map: `new-ui-refactor-prompt.md`. The mockup remains only for flows the new frames do not redraw.

Old mockup brand (retired by the new UI): "Querent green" teal primary, Archivo / IBM Plex Sans / IBM Plex Mono. New: accent `#14803C`, Albert Sans / Geist Mono.

## Intentional differences from the mockup

The build follows the mockup except where the spec decided otherwise. Verifiers: these are **not** defects.

**Rep portal**
- **Type (lane U, U0):** the portal renders in Albert Sans and Geist Mono (the new UI's fonts), not the mockup's Archivo and IBM Plex, while each page keeps the mockup's layout until its lane U task rebuilds it on the charcoal frames.
- **Shell (lane U, U2):** the mockup's top app bar (brand, nav, search, Needs attention badge, bell, avatar menu with "Switch workspace") is replaced by the charcoal frames' **216px left rail** (logo, Herrick, nav with icons, the user's short name and role, **Sign out** with its confirm dialog, C_QOB9) and a page header whose right end holds the **caution** and **bell** dropdowns (C_QOB3, C_QOB4). Nav: Quotes / Customers / Orders / **Stock** / Analytics (**My Analytics** for a rep) / **Teams and Reps** (manager) / Settings, at `/rep/stock` and `/rep/teams` (decision 46). There is no search, no nav count and no header customer picker (task U1): scope is role based, and pages that need a customer filter it themselves with `?customer=`. The frames' user names ("Brian G.", "Brandi G.") are placeholders; the rail shows the signed-in rep. Page bodies keep the mockup's layout until their own lane U task (U3 to U9).
- Shell rows with no frame (decision 58, listed in `docs/plans/status.md`): choosing a caution or bell row opens that quote, and an empty bell says "No notifications". The dropdown rows are real data in the frames' sentence patterns: caution lines as C_QOB3 ("Dana Ortiz asked to move pickup to Ogden.", "Draft has 1 line below the margin floor.", "Sent Oct 6, no reply yet."), bell rows as C_QOB4 ("Dana Ortiz replied on Q-24790", "Q-24763 accepted by Canyon Ridge", "Q-24815 expired" over its day), except that "accepted by" prints the customer's full name ("accepted by Wasatch Mechanical Contractors", decision 59); a row title too long for the panel stays on one line, ends with an ellipsis and shows the full text as a tooltip (decision 60); a quote with no contact is named by the customer's full name too. Bell events the frame does not sample name the contact ("Q-24818 requested by Dana Ortiz", decision 58).
- Each line has a **price-basis dropdown** (Contract / Customer / List / Last paid / Custom) showing each option's dollar value. Querent's pick is **bold**. The rep can type any price.
- A **red warning sits directly above the price field** when a line is below the floor for (quote rep × product category). It never blocks.
- Each line has a collapsed **"Why this price?"** row with Querent's explanation, including "+$X GP vs customer price". The quote shows "Querent found +$Y GP".
- A small **"?"** sits beside each line's price-basis dropdown. Hovering, focusing or tapping it shows why Querent suggests that price: the deciding fact, every other fact it checked (contract, last paid, broken case, scarcity, the list ceiling), the GP over customer price, and that price's margin against the rep's floor. The mockup has no such button.
- The **credit bar** is Querent green for the open balance, with a **grey segment** for this quote that updates live. Over the limit, the end turns red with "Over limit by $X" (a warning only).
- **Freight is priced by distance** from the selected branch (see `docs/plans/spec.md`), shows the miles and the formula, and can be overridden with a reason.
- ⋯ menu: **Duplicate quote**, **Reset sample quote**, and **Open customer in ERP (disabled, tooltip "Available after ERP integration")**. **"Reassign to another rep" is the manager's only** (v3 task D2): a rep's menu doesn't have it. On another rep's quote the manager's page is read-only, with a "Read only: Mara Jensen’s quote. Reassign it to edit." banner; Duplicate is disabled and Reset isn't offered there.
- Send dialog: **Querent chat is the only channel** (Email and Text are not built). Attach PDF is on by default. "Send quote" opens a second **centered Confirm send** dialog: a **red Cancel** and a **Querent-green Send**, positioned away from the first button. Sending is **blocked** when the quote is unfinished: no lines, a zero qty or missing price, unresolved "call for freight", or delivery with no ship-to.
- No manager-approval step. No email of the accepted quote to customer service; acceptance ends the MVP.
- The mockup's page frame (the "Querent quote-to-order" title and the Flowchart / Rep portal switch) belongs to the mockup. The app is the portal inside it.
- The price-basis dropdown under each price takes the place of the mockup's "Last paid $31.50" or "New item for them" line. Last paid is one of its options, with its price, whenever there is one.
- The margin bar's floor marker is the quote's **blended floor** ("Marker is the 23.8% blended floor"): each line's rep × category floor, weighted by line revenue. The mockup shows a fixed 20% floor, but floors differ by category (spec §5.2).
- Customer panel: "Last order" adds the order number ("Sep 9 · SO-51223"). "Wins on quotes" reads "71% over 12 months" as in the mockup.
- Quote terms: **"Valid until" is a date picker**, not a choice of 7, 14 or 30 days. The rep can pick any day from tomorrow to a year out; until they do, a draft runs 14 days from the day it is sent, and a note under the field says so. Send is blocked if the picked day has passed.
- Send dialog: besides Attach PDF there is a **Preview PDF** link (the draft as the Customer PDF), and a line under the message shows how it will read in the customer's chat. The default message is built from the quote ("… pickup at SLC on Thu, Sep 24 … Thanks, Brandi"), so its wording differs slightly from the mockup's.
- "Things to check before sending": a STOCK check names what is on order and where ("20 at Ogden. 24 on order at SLC, due Sep 26"), where the mockup has "PO due Sep 26".
- Export menu: there is no "File downloads aren't available in this view" note. The mockup ran in a sandbox, and downloads work in the app.
- Activity logs what happens to the quote: the request, matching, the draft, edits, sends and the customer's answers. It does not log the rep opening it. The mockup adds "You opened the quote" on every load, so its sample shows **4 events** where the build's shows **3**.
- No phone or tablet layout for the shell (decision 43): the rail is always 216px and the old scrolling nav strip is gone. The page bodies' old phone rules go with each page's own lane U task.

**Sample data, not layout**
- The seeded Q-24817 is priced by the pricing engine (task 1.1), so its numbers differ from the mockup's hand-made sample: **$1,122.40** instead of **$1,109.50** (bolts $31.50 last paid, straps $22.95). **Awaiting Henderson's decision**: keep the engine's prices, or change the seed so the demo matches the mockup. Two more numbers follow from the same prices, and would change with that decision:
  - The summary card's **$361.40 gross profit, 32.2% margin**, and each line's margin and total, follow the same prices (mockup: $348.50, 31.4%).
  - The summary card reads **"Same as what they paid last time"** where the mockup has **"+$4.50 vs. what they paid last time"**. The engine suggests the bolts at their last-paid $31.50, while the mockup priced them at $31.95 (+$0.45 × 10). Every other line with a last-paid price is also at it.
  - "Suggested by Querent" shows **"5 ideas · up to +$162.95"** where the mockup has **"4 ideas · up to +$164.10"**. The chips come from the deterministic upsell rules (task 1.6) over the seeded order history, priced by the engine: matching nuts and matching washers for the bolts, a flap disc and safety glasses (bought with the wheels and the gloves in Wasatch's orders), and bumping the wheels to 2 full cases. The mockup hand-picked 4 (flap disc, nuts, edge protectors, a bolt quantity break). The 5 boxes of nuts and of washers are each a broken case (10 to a case), so the engine prices them at customer price + 10% ($18.15 and $14.25).
- Brandi's seeded floors differ by category (spec §5.2: "a few of Brandi's differ so the warning is easy to demo"): Safety & PPE is 30%, so the gloves (26.6%) show the red **"Below Brandi's 30% Safety & PPE floor"** above their price, which the mockup's all-20% sample doesn't.
- The seeded customer request is Dana's whole chat message, which goes on to the ratchet straps ("… Also need 2 in ratchet straps, maybe 12"), so it runs longer than the mockup's before the ellipsis.
- With those prices and floors, "things to check before sending" shows the gloves' below-floor MARGIN check. The straps were matched with 0.90 confidence, so there is no MATCH check or "Confirm match" tag on them. Both appear for any line matched below 0.75.
- "Valid until" on a draft follows the day it is read (the quote's valid days from now), and the bell's dropdown lists what is unread at the time, so neither matches the mockup's fixed Oct 7 and "3".

**Rep pages the mockup doesn't show**
- **Stock** (was Items): the category filter is **one dropdown, "All categories" by default**, and it is the only way to filter by category (an item's page shows its category as plain text, not a link).
- **Settings > Pricing & delivery:** the Pricing card lists the scarcity switch and the fixed broken-case rule (customer price + 10%). **Every delivery rate is editable** (base fee, per mile, minimum, free-delivery threshold, radius and the road-miles factor), with a worked example that follows the typing and one Save for all six.

**Analytics (lane U task U6: canvas frames C_ANBase to C_AN8 and C_RAN1 to C_RAN5 are the source; the old mockup does not apply)**
- `/rep/analytics` has tabs: **Overview** (five stat cards, quotes and wins by week with **Show table**, average margin vs floor, top requested items), **Rep leaderboard** (manager only, with **Export CSV** in the header and the window, 7 / 30 / 90 days or Custom, in its title bar), **Decline reasons**, **Untouched quotes** and **Customer questions** (questions answered without a rep, then the old query analytics). The Team dashboard's content moved here from Teams and Reps; the old dashboard stays on `/rep/teams` until U7 rebuilds that page.
- The manager's **Filter** picks any mix of reps and teams (the free-text team labels until U7), a customer, and "Break the numbers down by" Whole organization, Rep, Team or Customer. A rep's **My Analytics** has no leaderboard, its filter picks one of their own customers and a period, and its tables drop the per-rep columns and the totals; Customer questions has no Assigned rep and no "Manage customer access".
- Every number is real data (Appendix G): the frames' figures, names and dates are placeholders, and their sentences ("From request to first send, 47 quotes", "Quotes created Sep 12, 2026 to Oct 11, 2026, ...") are filled from the data. A value with nothing to divide by reads "-" as C_AN6 draws it (no em-dash). The "i" beside a number keeps its explanation as a tip on hover or focus; the other cards' "i"s, the chart's hover read-out and the query analytics' old look are gone, as the frames draw them.
- Built with no frame (listed under "No frame" in `docs/plans/status.md`, to ask): the Custom window's two days, what the breakdown does to the rows, the columns picker's extra leaderboard columns, the empty lines, and the zero-data sentences.

**Customer view (lane U task U10: canvas frames C_CVE0 to C_CVL5 are the source; the old mockup does not apply)**
- `/` is the Querent box on the supplier's site. Only the box, the Orders and My rep sheets, the bell and the account chip are built; the frames' Herrick header, nav and page are a stand-in. With no session it is the visitor box with the public starter questions and a **Sign in** button to the demo chooser at `/demo`; every visitor question is answered "Sign in to continue." (decision 49, R-14).
- Signed in: **Orders** and **My rep** open side sheets; the **notification bell** with its unread count is how the customer finds a quote, and a quote notification opens the **PDF preview** with Decline, Request changes and Accept. Each action still gets its centered dialog (no frame).
- The contacts and quotes sidebars, the three panes, the phone tabs, the ERP indicator and "Switch workspace" are gone, and there is no phone layout (decision 43).
- Built with no frame (listed under "No frame" in `docs/plans/status.md`): the account chip's Sign out menu, the conversation once it has turns (and New conversation beside Orders), the expired-quote notification's wording, and one-line empty states.
- The **item pop-up** before quoting shows matched items, qty, and stock at the branch, but **no prices**, plus a pickup/delivery and branch choice, and a **Request quote** button.

**Exports**
- The Customer PDF is **formal and black and white**, like a document from an established distributor, with a small "via Querent" in the footer. It must not look AI-generated.

**Out of scope for this MVP (shown in the mockup but not built):** email/text sending, manager approval, substitutes and branch-transfer suggestions for short items, market reference price, and steps 9+ (writing the order to the ERP, invoicing, payment).
