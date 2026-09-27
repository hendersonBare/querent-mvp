# Design reference

The visual source of truth for Querent v2 ("Query to Quote"). The full plan and task list live in Notion:
**Querent HQ → Querent v2: Query to Quote**.

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

Brand: "Querent green" is the mockup's teal primary (Approve & send button, margin bar). Fonts: Archivo (headings), IBM Plex Sans (body), IBM Plex Mono (SKUs).

## Intentional differences from the mockup

The build follows the mockup except where the spec decided otherwise. Verifiers: these are **not** defects.

**Rep portal**
- Nav is `Quotes / Customers / Orders / Items / Analytics / Settings`. The **customer picker** ("Viewing") stays in the header. The rep is **Brandi Gallegos (BG)**, not "JP"/Jordan.
- Each line has a **price-basis dropdown** (Contract / Customer / List / Last paid / Custom) showing each option's dollar value. Querent's pick is **bold**. The rep can type any price.
- A **red warning sits directly above the price field** when a line is below the floor for (quote rep × product category). It never blocks.
- Each line has a collapsed **"Why this price?"** row with Querent's explanation, including "+$X GP vs customer price". The quote shows "Querent found +$Y GP".
- The **credit bar** is Querent green for the open balance, with a **grey segment** for this quote that updates live. Over the limit, the end turns red with "Over limit by $X" (a warning only).
- **Freight is priced by distance** from the selected branch (see Notion spec §Freight), shows the miles and the formula, and can be overridden with a reason.
- ⋯ menu: **Duplicate quote**, **Reset sample quote**, and **Open customer in ERP (disabled, tooltip "Available after ERP integration")**. **No "Reassign to another rep."**
- Send dialog: **Querent chat is the only channel** (Email and Text are not built). Attach PDF is on by default. "Send quote" opens a second **centered Confirm send** dialog: a **red Cancel** and a **Querent-green Send**, positioned away from the first button. Sending is **blocked** when the quote is unfinished: no lines, a zero qty or missing price, unresolved "call for freight", or delivery with no ship-to.
- No manager-approval step. No email of the accepted quote to customer service; acceptance ends the MVP.
- The mockup's page frame (the "Querent quote-to-order" title and the Flowchart / Rep portal switch) belongs to the mockup. The app is the portal inside it.
- The price-basis dropdown under each price takes the place of the mockup's "Last paid $31.50" or "New item for them" line. Last paid is one of its options, with its price, whenever there is one.
- The margin bar's floor marker is the quote's **blended floor** ("Marker is the 23.8% blended floor"): each line's rep × category floor, weighted by line revenue. The mockup shows a fixed 20% floor, but floors differ by category (spec §5.2).
- Customer panel: "Last order" adds the order number ("Sep 9 · SO-51223"). "Wins on quotes" reads "71% over 12 months" as in the mockup.
- Send dialog: besides Attach PDF there is a **Preview PDF** link (the draft as the Customer PDF), and a line under the message shows how it will read in the customer's chat.
- Export menu: there is no "File downloads aren't available in this view" note. The mockup ran in a sandbox, and downloads work in the app.
- Phone (390px, screen 08): the section nav is a scrolling strip under the logo, with the Viewing picker below it. Each line is a card that keeps its price, price basis, margin, total and remove button, so a rep can price a quote on a phone. The mockup's phone view shows only the item and qty.

**Sample data, not layout**
- The seeded Q-24817 is priced by the pricing engine (task 1.1), so its numbers differ from the mockup's hand-made sample: **$1,122.40** instead of **$1,109.50** (bolts $31.50 last paid, straps $22.95). **Awaiting Henderson's decision**: keep the engine's prices, or change the seed so the demo matches the mockup.
- With those prices, "things to check before sending" shows the gloves' below-floor MARGIN check. The straps were matched with 0.90 confidence, so there is no MATCH check or "Confirm match" tag on them. Both appear for any line matched below 0.75.
- "Valid until" on a draft follows the day it is read (the quote's valid days from now), and the unread badge counts what is unread at the time, so neither matches the mockup's fixed Oct 7 and "3".

**Customer view (not in the mockup)**
- **Left sidebar:** the assigned rep as its own section at the very top, then departments (Customer Service, AR/Finance, Warehouse/Will-call per branch). This is static seed data.
- **Right sidebar:** quote buttons labelled "Quote · date · $total" with a status chip. Clicking one opens a **PDF preview modal** with Download at the top right and an **Accept / Request changes** action bar. Each action gets a **centered Confirm dialog** (red Cancel, Querent-green Send).
- The **item pop-up** before quoting shows matched items, qty, and stock at the branch, but **no prices**, plus a pickup/delivery and branch choice, and a **Request quote** button.

**Exports**
- The Customer PDF is **formal and black and white**, like a document from an established distributor, with a small "via Querent" in the footer. It must not look AI-generated.

**Out of scope for this MVP (shown in the mockup but not built):** email/text sending, manager approval, substitutes and branch-transfer suggestions for short items, market reference price, and steps 9+ (writing the order to the ERP, invoicing, payment).
