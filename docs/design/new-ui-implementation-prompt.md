# New UI: what changed, and the prompt to build it

Source of truth for the design: the 89 frames in `docs/design/canvas-frames/` (copy of canvas **New UI (Charcoal)**, https://claude.ai/artifact/9JknKAyWrdWdjZpgvLAnHj). The old link X1xFhCZjpdF2vBH9Nnb597 is the earlier version. Rules and tokens: `docs/design/new-ui-style-guide.md`. Requirements the design was built from: `UI and Feature Changes (1).pdf`. The scripts that generate every frame are in `docs/design/canvas-build/`.

"Current" below means what the repo does today (read from `src/`). Where I inferred behaviour from code comments rather than running it, it says so. Nothing here has been implemented yet.

Part 1 lists every change with its logic. Part 2 is the decisions (two made, two recommended, the rest open). The appendices give the frame index, permissions, data model, API, copy rules, unchanged areas, placeholder data and a test checklist. Part 3 is the prompt to paste.

---

## Decisions made (override Part 2 and Part 3 below)

The prompt to use is `docs/design/new-ui-refactor-prompt.md`; Part 3 here is superseded.
- Route renames: `/rep/items` -> `/rep/stock`, `/rep/team` -> `/rep/teams`, with redirects (decision 6).
- Bulk reassign lives on Teams and Reps, not the Quotes table (decision 5).
- Parent team is grouping only, no permission inheritance (decision 7).
- Feature flags are environment variables (decision 8).
- Customer login, embed and auth are out of scope; Supabase auth comes later (decision 9). Keep the current demo auth. Build the customer UI against the existing session.
- No phone or tablet layouts (decision 3 dropped). Verify at 1920 x 1080.
- Hover, focus and loading states are built quietly (decision 10), per the style guide.
- Send blockers: as recommended (decision 4).

---

## Part 1. Everything that changed

### 1. Shell and navigation

| Area | Current | New UI | Logic and data impact |
|---|---|---|---|
| Frame | Top app bar (`RepShell`): brand, nav links, search, Needs attention badge, bell, avatar menu. The customer picker ("Viewing") sits under it. | Fixed 216px left rail, charcoal, sticky as the page scrolls. Logo, supplier name, 7 nav items with icons, user block (name, role, **Sign out**) at the bottom. | New `Rail` component replaces `RepHeader`. Remove `PortalSearch`. Phone layout: recommended breakpoints in Part 2, decision 3. |
| Nav labels | Quotes, Customers, Orders, Items, Analytics, Team (manager), Settings | Quotes, Customers, Orders, **Stock**, Analytics, **Teams and Reps** (manager), Settings. Reps see **My Analytics** and no Teams and Reps. | `REP_SECTIONS` in `scope.ts`. Decide whether `/rep/items` is renamed or only relabelled. |
| Page header | `RepPageHeader` title plus description | Title, then a page-local picker or search, then **Filter**, then caution icon and bell on the right. No global search bar. | Each page owns its search and filter. |
| Customer scope | Header "Viewing" picker writes `?customer=` and every nav link carries it. | Gone. Customer choice is a search/dropdown on each page that needs it (Quotes, Customers, Settings customer access). Dropdown shows the first 5 and scrolls, search narrows. | Remove `SCOPE_PARAM` propagation from nav links. Keep `?customer=` only as a per-page filter param. |
| Manager scope | "My quotes / All reps" switch (`?scope=all`) plus a Rep column and rep/team filters in All reps. | No switch. A manager sees the whole organization by default. A rep sees only their own customers, quotes and analytics. | `REPS_PARAM` and `isAllReps` go away. Scoping becomes purely role-based on the server. |
| Needs attention | Red button in the header that links to a filtered list | A red caution icon that opens a short dropdown of what needs attention. It does not redirect. | `/api/rep/badges` must return short summaries (id, label, one line), not only counts. |
| Bell | Link to the Quotes list with an unread dot | Bell that opens a dropdown of short notification summaries. It does not redirect. | Same endpoint family. Respect the rep's notification preferences (section 9). |
| Account menu | Avatar menu with "Switch workspace" | Rail user block with role and **Sign out**. | `signOut` already clears the cookie. Keep "Switch workspace" for the demo personas only if wanted. |
| Roles | `rep` and `manager` (`RepRole`), customer principal separate | Three user types: Customer, Rep, Manager. A manager is not listed as a rep. The role switch for a rep who is also a manager is **dropped for now** (decision: not in this release). | `reps.role` already merged supervisor/admin into manager (decision 20). No new role value needed. |

### 2. Design system

- **Fonts:** Albert Sans (UI) and Geist Mono (numbers, codes). Current app loads Archivo, IBM Plex Sans and IBM Plex Mono in `rep/layout.tsx`. Replace in `next/font`.
- **Palette (charcoal option B):** rail `#1F2422`, card title bars `#2A302D`, page `#E9EBEA`, cards `#fff`, table and board headers light gray `#E8EAE9` with `#3A403D` text, neutral borders `#D6D9D7`, text `#1B1F1D`, secondary `#585F5B`, muted `#767D79`. **One accent green `#14803C`** for primary buttons, active nav, links, toggles, chart bars. Red `#C92A1C` only for Overdue, Aging or a problem. Yellow note button `#FBE7A1` on `#5C4300`.
- **Sizes (the audit standard):** card title bar 12x20 padding with a 15.5px bold title; panel buttons 38px high; table header row 10x20 padding, 12.5px bold, `::` drag handle on every column; table body row 14x20; board column header 12x16; page title 32px bold; page padding 24x32; card radius 14; control radius 9 to 10; caution and bell buttons 40px.
- **Shared components to build once:** `Rail`, `PageHeader`, `FilterButton` plus filter panel (checkbox groups, segmented controls, "Clear all", "Apply filters", count badge when active), `DataTable` (gray header, `::` handles, columns picker icon at the end of the header row, drag to reorder, "Show N more"), `Toggle`, `StatusText`, `ViewNoteButton`, `Sheet` (slide-over), `Popover`, `Dropdown`, `FeatureFlag` wrapper.
- **Rules:** no em-dashes. Status is plain text, one signal per row. Descriptions only where a new user could misread a setting. No arrow buttons inside inputs. Feature descriptions removed from the pages listed in section 8 and 9.
- **Logic:** column order and visibility are per user. Store per user per table (`ui_table_prefs`). "Show N more" pages the list, about one screen of rows first.

### 3. Quotes: board and table

- **New:** Board and Table views share one toolbar (customer picker, Filter, Board/Table toggle). Board columns are Draft ready, Changes requested, Sent, Accepted, Expired, Declined, each with a count and "Show N more". Column headers are draggable.
- **Table columns:** `:: Quote, Customer, Requested, Status, Total, Margin`, plus a columns picker. A manager also sees Rep.
- **Filter panel:** status checkboxes, Rep (manager only), Customer, Requested from/to, and "Only show" Overdue, Aging, Below margin floor.
- **Opened buttons drawn:** customer picker, filter, caution dropdown, bell dropdown, quote preview, View note, Show more, reorder columns, sign out.
- **Current to change:** `QuotesList` has a status filter strip, the "My quotes / All reps" switch, a Needs attention filter and bulk "Reassign…". Needs attention becomes the caution dropdown plus the "Overdue/Aging" filter. Bulk reassign still exists, now under the manager's table selection (confirm the placement in Part 2).
- **Notes:** a quote with a note shows a yellow "View note" button instead of the note text.

### 4. Quote editor

- **Header:** only customer name, quote number, status (state plus Overdue/Aging time frame), purchasing agent, requested date, valid until. Everything else above the quote is removed.
- **Removed:** the "x things to check before sending" box, the "Add item by SKU or name" search box, the totals under the lines, the "same as quote margin" text, the five dropdowns under the total box, and the separate Available column.
- **Added:**
  - **Total box** holds the total, gross profit and margin (with floor) and the green **Approve and send** button.
  - Save draft, Export, Chat and More are icon buttons under the total box.
  - One **Quote details** dropdown (terms, fulfillment and so on, all the old info).
  - **Show cost and stock** toggle. Off: Item, Qty, Unit price, Margin, Total. On: Available and Cost columns appear between Qty and Unit price, nothing else moves. Column widths are fixed in all frames (Qty 60, Unit price 118, Margin 78, Total 82).
  - **+ Add item** row under the last line. Typing opens a results dropdown that drops down over the page (SKU, name, branch stock, price, "Add" or "Already on quote").
  - **Suggested by Querent** bar with the GP found.
  - **Line details** (Details link) expand to three columns: Why this price? (with What the customer asked for stacked under it), Price options (Customer, List, Last paid with "Use"), Stock by branch (Branch, On hand, On order on one line).
- **Logic you must keep when the checks box goes:** the old checks include "freight is still call for freight" (blocks send) and below-floor lines. The design shows below-floor inline on the line (red input, "Below Brandi's 30% Safety & PPE floor"). Every blocker and warning stays: Approve and send is disabled with the first blocker named under it, and stock-short and match warnings become inline notes (Part 2, decision 4).
- **Alignment rule:** text cells and inputs in an item row share a 34px centre line. The item name's first line sits on the same centre line.
- **Rep editor:** identical to the manager's, with the rep's own data (Orders, Stock, customer page, order page and the editor were not redrawn for reps).

### 5. Customers, Orders, Stock

- **Customers list:** columns Customer (name and account code), Rep, Terms, Open balance (with credit limit), Last order, Orders, Quotes. Search, Filter (Rep, Terms, Open balance range, Only show: Has open quotes, Over 80% of credit limit, Never ordered), "6 customers" count, columns picker. A rep's list has no Rep column or rep filter and shows only their customers.
- **Customer page and Order page:** restyled, same data. Detail tables have no filter and no columns picker.
- **Orders list:** Order, Customer, Rep, Ordered, Fulfillment, Status, Lines, Total, Filter, "Show N more". Read-only (ERP).
- **Stock:** Items is renamed Stock. The category dropdown becomes the Filter button next to the search. Item page and "Add to quote" work from the list or the item page.

### 6. Analytics

- **Manager Analytics** has 5 tabs. The Team dashboard moves here:
  - Overview (stat cards, quotes and wins by week with a table toggle, average margin vs floor, top requested items)
  - Rep leaderboard (what `Leaderboard` shows, with Export CSV)
  - Decline reasons (`DeclineReasons`)
  - Untouched quotes (`UntouchedTable`)
  - Customer questions (`QueryAnalytics`)
- **Filter:** any mix of reps and teams, a customer, and "break the numbers down by" Whole organization, Rep, Team or Customer. Default is the whole organization.
- **Rep My Analytics:** own data only. No Rep leaderboard tab, no rep or team filter. Filter offers customer (own customers only) and a period (7, 30, 90 days, Custom). Decline reasons and Untouched quotes drop their per-rep columns. The "Manage customer access" link on Customer questions is removed.
- **Logic:** the `Team` page and nav item are removed. `server/analytics` and `server/team` metrics gain rep, team and customer filters and a breakdown dimension. Rep requests are forced to their own `rep_id`.

### 7. Teams and Reps (new page, manager only)

- **Replaces:** the Team dashboard nav item and the Settings tabs Rep assignments and Reps. No analytics on this page.
- **Left: Reps** card with a Filter, a columns picker and a **Save** button. Columns: Rep name, **Customers** (a count button that expands the rep's customers), Role, Team, Active toggle. Managers are not listed.
- **Customer list under a rep:** each customer has an X. Disconnecting opens a dialog that **requires picking the new rep** in the same step (no customer is ever left without a rep) and offers "Also move this customer's open quotes". A **+ Connect a customer** search at the bottom. If the customer already has another rep, a second dialog asks to confirm moving it (and shows how many open quotes move).
- **Right: Teams** card with Filter, Create team, a checkbox list of teams with rep counts. With a team selected: **Add to team**, **Remove from team**, **Move into other team**.
- **Data model:** today `team` is a free-text label on `reps` (`TeamRep.team`). A team now needs to be an entity with a name, members and an optional **parent team** (Move into other team). Reps can belong to a team and, through a parent, count in the parent as well ("Reps in Field Sales stay in it, and also count in the team you pick"). Hierarchical visibility is deferred (TODO R-12), so a parent only affects grouping and filters, not permissions.
- **Existing logic to keep:** one rep per customer (`customer_rep`), reassignment of open quotes with an Activity entry (D2), deactivation (D1), `GET/PATCH /api/rep/settings/assignments` and `/api/rep/team/reps` as the backing routes (rename as needed).

### 8. Settings: manager

- **Tabs:** Customer access, Margin floors, Pricing and delivery, Aging. **Data sources is removed** (tab, page, `DataSources.tsx`, `/api/rep/settings/sources` route usage in the UI) from every manager settings frame. Rep assignments and Reps moved to Teams and Reps.
- **Customer access:** search box plus **Filter** (per data type: Items and stock, Pricing, Orders and quotes, Account; each Any / Querent answers / Not shared). With no filter: the organization-wide toggles. With a filter applied: a table of matching customers with one toggle per data type, so access is set per customer. No descriptions anywhere on this tab.
- **Margin floors:** **Organization margin floors** are hard stops per category that reps cannot go below (a new org-level table). Below it, **Rep margins**: a read-only, searchable review of any rep's margins against the floor. Managers do not set their own floors. No descriptions.
- **Pricing and delivery:** every input is aligned right. Units move under the label (for example "Delivery radius / Miles. Farther is call for freight"). **Feature flags (hidden for now, kept on the page):** Free delivery pricing, Recovery pool, Delivery cost model. In the design they carry a "FEATURE FLAG: HIDDEN" badge and a dashed outline. In the product they must not render until the flag is on.
- **Aging:** thresholds table with no descriptions (keep the "1 day" style conversions).

### 9. Settings: rep (new)

- **Tabs:** Margins, Profile, Notifications. Nothing else.
- **Margins:** a rep edits their own margin per category. The server rejects a value below the organization floor, and the UI shows the row in red with "Below the 30.0% organization floor. Pick 30.0% or higher." and disables Save. The bar legend (organization floor tick, own margin tick) stays at the bottom. No other description.
- **Profile:** picture, name, phone, email. These appear to customers (rep contact in the site's My rep sheet, and on quotes).
- **Notifications:** In app toggles only (no email) for two groups that feed the caution dropdown (Quote overdue, Quote aging, Below margin floor, Change requested) and the bell dropdown (Quote accepted, Quote declined, Quote expired, Customer chat needs a rep). No descriptions.

### 10. Customer experience (Querent on the customer's own site)

- **Concept change:** Querent is a quoting tool living on the supplier's own website. It is not a website inside a website and it does not replace theirs.
- **Base box (not logged in):** the whole page is one query box. A Herrick header with a Sign in button, a heading ("Ask about stock, items and branches."), four public starter questions, the input and "Powered by Querent". Public mode may only use catalog, stock, branch hours, delivery area and how-to-open-an-account answers. No prices, orders, quotes or account data.
- **Logged in:** the same box, plus two buttons that open a side sheet: **Orders** (previous orders: order number, date, fulfillment, status, total, the quote it came from, Show more) and **My rep** (name, title, phone, email). The header shows a **notification bell** with an unread count, then an account chip.
- **The bell is how a customer finds and acts on a quote.** It opens a dropdown of short notifications (a quote is ready to review, changes were made, an order shipped). Clicking a quote notification opens the quote document with **Accept**, **Request changes** and **Decline** (the existing quote preview and its three routes). The Quotes button and quotes sidebar stay out.
- **Removed from the customer app:** the left contacts sidebar (departments, branches), the right quotes sidebar, the three-pane layout and the mobile Chat/Contacts/Quotes tabs, the ERP indicator, "Switch workspace".
- **Logic:**
  - Two entry modes: anonymous and signed-in. Anonymous needs a public query route with a restricted tool allow-list, rate limiting and no customer context.
  - Signed-in reuses the existing customer tools and `api/query/customer/*`. Add an orders list endpoint scoped to the customer and reuse `customer/contacts` for the rep only.
  - Embedding: host the box so a supplier can drop it into their site (script or component), take their login (token handoff or SSO) to start a signed-in session, and style it from tokens. The auth model is TODO R-4.
  - Customer notifications are new. Derive them from quote activity (sent, revised after changes requested, expired) and order status changes, with a read state per customer. Add `GET /api/query/customer/notifications` and a mark-read route, and poll it like the rep badges. Keep `QuoteNoticeCard` in the chat as the in-conversation twin of the same events.

---

## Part 2. Decisions and gaps before you start

1. **Customer quote actions: decided.** The notification bell. A quote notification opens the quote with Accept, Request changes and Decline. Frames: bell opened, quote opened from the bell.
2. **Role switch for reps who are managers: dropped for now.** Not built in this release. If it returns, add it to the rail user block.
3. **Phone and tablet layout: recommended, please confirm.** Three breakpoints: 1200px and wider is the design as drawn; 960 to 1199px collapses the rail to a 72px icon strip (labels in a tooltip); under 960px the rail becomes a hamburger drawer with the page title in a top bar. Tables: under 960px each row becomes a stacked card (customer or quote number first, status, total, then a "Details" row) and the columns picker is hidden. The board becomes a status tab strip with one column visible at a time. The quote editor's total box becomes a sticky bottom bar with Approve and send. Slide-over sheets become full screen. The customer site box is already a single column, so it only needs the starter questions to stack. This keeps the current app's phone support without redrawing every frame.
4. **Blocking checks in the editor: recommended, please confirm.** See the explanation below the list.
5. **Bulk reassign** from the manager's table: confirm it stays on the Quotes table (row selection) or moves to Teams and Reps.
6. **Route names:** rename `/rep/items` to `/rep/stock` and `/rep/team` to `/rep/teams`? Redirects needed if so.
7. **Teams data model:** confirm the parent-team idea (Move into other team) is grouping only, not permission inheritance.
8. **Feature flag mechanism:** env, database table, or per-supplier setting? Needed for the three hidden pricing sections.
9. **Embed and auth** for the customer site (script tag or component, how the host passes the logged-in customer). TODO R-4 already says demo cookie auth is temporary.
10. **Not designed:** hover, focus, loading, empty and error states; the rep view of Orders, Stock, the customer page and the quote editor (they use the manager frames with the rep's data); the notifications dropdown frame (B4) is missing its header buttons; "Show N more" expanded states; a customer view of "View all quotes".
11. **Placeholder numbers in the frames** (not product data): rep Analytics, the Settings impact preview table, rep margins, the weekly chart, the quote counts on the board and table, the Provo hours, the Herrick site around Querent.

**Explanation of decision 4.** Today the editor has a box called "things to check before sending". It lists two kinds of problems, built in `quoteChecks()` in `server/rep/quote-math.ts`:
- **Blockers**, which stop Send. These come from `sendBlockers()` in `server/quotes/send-check.ts`: the quote has no lines, a line has quantity 0, a line has no price or a price below $0, delivery has no ship-to address, freight is still "call for freight", or the expiration date has already passed. The server also refuses the send (`send_blocked`, 422).
- **Warnings**, which do not stop Send: a line's margin is below the floor, stock is short at the quote branch, or a SKU match is below the confident score.

The new design removes the box. Below-floor warnings now show on the line itself (red margin input and a note). Nothing in the design shows the blockers or the stock and match warnings, and the server will still refuse a blocked send, so the rep would see a failed button with no reason. Recommended fix, which needs no new frame beyond one small state: (a) the green Approve and send button is disabled while any blocker exists, with one line of red text under it naming the first blocker and "+2 more" when there are several; (b) clicking that text scrolls to and highlights the line or field at fault (the blocker already carries a `line_id`, or null for quote-level ones, which open Quote details); (c) stock-short and low-confidence match warnings show as small inline notes on their line, like the below-floor note. That keeps every check, removes the box, and costs one disabled-button state and one inline note style.

---

## Appendix A. Frame index (what to open in the canvas)

Page **New UI (Charcoal)**. Each group is one row; the first frame is the page, the others are opened buttons. The page **New UI** has the same frames in the earlier green palette (plus three colour options for the quote editor, `QEV1` to `QEV3`, from which option B was chosen).

**1. Shared (rep and manager)**
- Quotes board: board, customer picker, filter, needs attention, notifications, quote preview, view note, show more, reorder columns, sign out.
- Quotes table: table, filter, columns, quote preview, view note, show more, reorder columns, customer search.
- Quote editing: base editor, approve and send, export, more actions, quote details, suggested by Querent, customer chat, show cost and stock, add item, line details, price source, draft saved.
- Customers: list, filter open, filter applied, customer page.
- Orders: list, filter open, order page.
- Stock: list, filter open, item page, add to quote.

**2. Manager only**
- Analytics: overview, overview scrolled, overview show table, overview filter open, rep leaderboard, decline reasons, untouched quotes, customer questions, customer questions scrolled.
- Teams and Reps: base, rep customers expanded, disconnect a customer, connect a customer, move approval, team selected, create team, move team.
- Settings: customer access, filter open, filter applied, margin floors, review a rep, aging, pricing and delivery, pricing with free delivery, pool and cost model, impact preview.

**3. Rep view** (drawn for Brandi Gallegos)
- Rep quotes: board, customer picker, filter, table.
- Rep customers: list, filter.
- My Analytics: overview, filter, decline reasons, untouched quotes, customer questions.
- Rep settings: margins, profile, margin below floor, notifications.

**4. Customer site**
- Base box (not logged in), logged in, orders opened, my rep opened, notification bell opened, quote opened from the bell.

## Appendix B. Who can do what

| Capability | Visitor (not logged in) | Customer | Rep | Manager |
|---|---|---|---|---|
| Ask the public query box (stock, items, branches, hours, delivery area, open an account) | Yes | Yes | n/a | n/a |
| Ask about own prices, orders, quotes, account | No | Yes | n/a | n/a |
| See own previous orders and own rep | No | Yes | n/a | n/a |
| Notification bell: quote ready, updated, order shipped; Accept, Request changes, Decline | No | Yes | n/a | n/a |
| Quotes, Customers, Orders, Stock | No | No | Own customers only | Whole organization |
| Quote editor | No | No | Own quotes | Any quote |
| Analytics | No | No | My Analytics, own data | Whole organization, filter by rep, team, customer |
| Teams and Reps | No | No | Hidden | Yes |
| Settings tabs | No | No | Margins, Profile, Notifications | Customer access, Margin floors, Pricing and delivery, Aging |
| Set organization margin floors | No | No | No (reads them) | Yes |
| Reassign customers or quotes | No | No | No | Yes |
| Hidden pricing sections (feature flags) | No | No | No | Only when the flag is on |

## Appendix C. Data model changes (migrations)

- **teams**: id, name, parent_team_id (nullable). Reps belong to one team; a team's members also count in its parent for grouping and filters only. Migrate the free-text `team` label on reps into rows.
- **org_margin_floors**: category_id, floor. Rep margins stay per rep per category and must be at or above the organization floor (enforced on write). Managers no longer have their own floors.
- **rep profile**: picture (stored file or URL), phone, email, on the rep record. Name already exists.
- **rep_notification_prefs**: rep_id, event key, in_app boolean. Event keys: quote_overdue, quote_aging, below_margin_floor, change_requested, quote_accepted, quote_declined, quote_expired, customer_chat_needs_rep. No email column.
- **ui_table_prefs**: user, table id, column order, hidden columns.
- **feature_flags**: key, enabled (and scope if per supplier). Seed `free_delivery_pricing`, `recovery_pool`, `delivery_cost_model` as off.
- **customer_notifications**: id, customer_id, kind (quote_ready, quote_updated, order_shipped), ref (quote or order id), created_at, read_at. Or derive from `quote_activity` and order status with a per-customer read marker.
- **customer access**: the existing per-customer, per-category records. No new table, but a query to list customers by access state for the Filter.
- Remove from the UI (data can stay): Data sources.

## Appendix D. API changes

- **Changed:** `GET /api/rep/badges` returns counts plus short summaries for the caution and bell dropdowns (respecting notification preferences). `GET /api/rep/analytics` takes rep, team, customer, breakdown and period and absorbs `GET /api/rep/team/metrics` and its CSV. `GET /api/rep/quotes` loses `?scope=all` and filters by role. Reassign routes keep their behaviour.
- **New (rep):** teams create, rename, delete; add or remove members; move a team under another team. `GET/PUT` rep profile and picture. `GET/PUT` notification preferences. `GET/PUT` organization margin floors (manager). `GET` any rep's margins (manager, read-only). `GET` customers by access state. `GET/PUT` table preferences. `GET` feature flags.
- **Changed (rep):** own margins `PUT` is rejected below the organization floor with a field-level error. `GET /api/rep/settings/sources` is no longer used by the UI.
- **New (customer):** `GET /api/query/customer/orders` (own previous orders), `GET /api/query/customer/notifications` and a mark-read route. `GET /api/query/customer/contacts` is trimmed to the rep for the My rep sheet (departments stay available to the chat's answers).
- **New (public):** an anonymous query route with a tool allow-list (catalog, stock, branch hours, delivery area, account opening), rate limiting, no customer context and CORS for the supplier site.
- **Kept as is:** `customer/quotes/[id]`, `accept`, `decline`, `request-changes`, `quote-requests`, `item-popup`.

## Appendix E. Copy and description rules

- No em-dashes anywhere. Statuses are plain text. Red only for Overdue, Aging or a problem.
- **Descriptions removed:** all of manager Customer access, Organization margin floors, Rep margins (including the "Type to search" hint), Aging thresholds and the per-status notes under it, rep Margins and Profile and Notifications (header text and row text). Keep the legend under the rep margin bars. Keep the "1 day" and "3 days" conversions beside Aging hours.
- **Descriptions kept** (a new user could misread them): units under labels in Pricing and delivery (for example "Miles. Farther is call for freight"), "Percent of goods value", "Percent over a line's price, at most", and similar.
- **Right-aligned inputs** in Pricing and delivery and in the hidden pool and cost model sections. Unit text moves under the label.
- **Feature flag badge** in the design ("FEATURE FLAG: HIDDEN" and a dashed outline) is a design marker only. In the product the sections do not render while the flag is off.
- **Starter questions:** public (stock, branch hours, delivery to Ogden, how to open an account) versus logged in (stock, last price paid, last order shipped, open balance).

## Appendix F. Unchanged (do not touch)

Quote pricing, price basis and margin math. Freight, the delivery cost model and the pool rate (only their settings UI is hidden). SKU matching, upsell and companion logic. PDF export. ERP sync and its status data. Aging thresholds and their rules. The chat's tools for a signed-in customer. Reassignment rules and the Activity entries. Declined status and decline reasons. The demo personas, seed data and `/api/test/*` routes.

## Appendix G. Placeholder data in the frames (not product data)

Rep Analytics numbers. The Settings impact preview table. Rep margins in the review. Roles and team names. The counts on the quote board and table (17 accepted, 6 expired, 28 quotes). The weekly chart values. Provo branch hours. The notifications and orders listed in the customer site frames. The Herrick website around the Querent box (logo, nav, page content), which is a stand-in for the supplier's real site.

## Appendix H. Test and acceptance checklist

- Unit tests per task, written first. Update the existing tests that name old UI text (Switch workspace, Items, Team, things to check, Add item by SKU or name, Needs attention button).
- A rep can never read another rep's customers, quotes, orders or analytics through any route (add a test per route family).
- A rep cannot save a margin below the organization floor (server rejects, UI shows the error and disables Save).
- No customer can be left without a rep (disconnect requires choosing a new rep in the same step).
- Moving a customer from one rep to another asks for confirmation and offers to move open quotes.
- Approve and send is disabled for every blocker in `sendBlockers()`, names the first, and the server still refuses a blocked send.
- Hidden feature-flag sections never render while their flag is off.
- The anonymous query route cannot return prices, orders, quotes or account data.
- Customer notifications: a sent quote, a revised quote and a shipped order each create one; opening a quote from the bell can Accept, Request changes or Decline; unread count updates.
- Playwright: one pass per role (visitor, customer, rep, manager) across the pages in Appendix A; a screenshot compared against each canvas frame for layout, spacing and the standards in Part 1 section 2.
- Accessibility: every icon-only button has a label, dropdowns and sheets trap and restore focus, `::` drag handles have a keyboard alternative (move left and right).

---

## Part 3. The prompt

Paste everything below into a new session. It assumes the Querent task-loop process in `AGENTS.md`.

```text
You are implementing the Querent new UI. Read these first, in order, and treat them as the spec:

1. AGENTS.md and docs/plans/decision-log.md (decisions win), docs/plans/plan.md, docs/plans/status.md.
2. docs/design/new-ui-implementation-prompt.md (Part 1 is the full list of changes and logic, Part 2 the decisions, Appendices A to H the frame index, permissions, data model, API, copy rules, unchanged areas, placeholder data and the test checklist).
3. docs/design/new-ui-style-guide.md and the canvas "New UI (Charcoal)" page at https://claude.ai/artifact/X1xFhCZjpdF2vBH9Nnb597. Every frame is one page or one opened button. The frame names match the section names in Part 1.
4. The repo as it is today: src/components/rep, src/components/customer, src/server, src/app/api, src/domain.

Process:
- Run /querent-task-loop as the orchestrator. First, add a new lane "U" to docs/plans/plan.md with the tasks below, each with its dependencies, acceptance criteria and test-first notes. Add every new rule to docs/plans/decision-log.md before you code it. Update docs/plans/spec.md where the spec describes the old UI.
- One worktree and branch per task (task/U<n>-<slug>). Tests first. Do not merge without every gate passing and the verifier approving.
- Part 2 decisions 1 and 2 are made (bell for customer quotes; role switch dropped). Build 3 and 4 as recommended unless I say otherwise. Ask me before guessing on anything else listed in Part 2 of the implementation doc. Record my answers in the decision log.
- No em-dashes in code, copy or docs. Descriptions only where a new user could misread a setting.

Tasks (in this order, merge each before the next unless noted):

U0  Tokens and primitives. Replace fonts with Albert Sans and Geist Mono. Add the palette and sizes from the style guide as CSS variables. Build Rail, PageHeader, FilterButton and filter panel, DataTable (gray header, :: handles, columns picker, drag to reorder, per-user column prefs, Show N more), Toggle, Sheet, Popover, Dropdown, StatusText, ViewNoteButton. Storybook-style test page or unit tests for each.

U1  Scope and roles refactor. Remove the header Viewing picker and the ?scope=all switch. Server scoping becomes role based: a rep only ever sees their own customers, quotes, orders and analytics; a manager sees the whole organization. Keep ?customer= as a page-local filter only. Add tests that a rep cannot read another rep's data through any /api/rep route. Update repAccess and the badges route.

U2  New shell. Replace RepShell and RepHeader with the left Rail (nav labels Quotes, Customers, Orders, Stock, Analytics, Teams and Reps, Settings; My Analytics and no Teams and Reps for reps), the user block with role and Sign out, and the per-page header with picker/search, Filter, caution and bell. Build the caution and bell dropdowns: extend /api/rep/badges to return short summaries and respect notification preferences (see U9). No redirects from the dropdowns.

U3  Quotes list. Board and Table views sharing one toolbar, status columns with counts, the filter panel fields from Part 1 section 3, View note button, customer picker dropdown (first 5, scroll, search), quote preview, Show more. Bulk reassign per decision 5.

U4  Quote editor. Minimal header, total box with Approve and send, icon buttons, Quote details dropdown, Show cost and stock toggle with fixed column widths, + Add item row with dropdown results, Suggested by Querent bar, three-column line details, 34px centre line alignment. Remove the checks box, the Add item search box, the totals under lines, and the same-as-quote-margin text. Keep every send blocker and warning: disabled Approve and send with the first blocker named under it, click to jump to the line or field, inline notes for stock-short and low-confidence matches (decision 4). Update QuoteDetailView tests.

U5  Customers, Orders, Stock. New tables and filters, Items renamed Stock, rep versions without Rep column or rep filter, detail pages restyled.

U6  Analytics. Move Leaderboard, DeclineReasons, UntouchedTable and QueryAnalytics into five Analytics tabs; remove the Team page and nav item. Add rep, team and customer filters and the breakdown dimension to the server metrics. Rep gets My Analytics with own data only. Keep Export CSV on the leaderboard.

U7  Teams and Reps. New page and data model: teams as entities with members and optional parent team; Reps table with Customers count column, Role, Team, Active; expandable customer list with disconnect-and-reassign dialog (no customer without a rep) and connect-customer confirmation with open-quote move; Create team, Add to team, Remove from team, Move into other team. Migrate the old team label into teams. Remove the Settings tabs Rep assignments and Reps.

U8  Manager Settings. Customer access with search plus Filter and the per-customer table, organization margin floors (new org table) with the read-only rep review, Aging without descriptions, Pricing and delivery with right-aligned inputs. Remove Data sources everywhere. Add the feature flag mechanism (per decision 8) and hide Free delivery pricing, Recovery pool and Delivery cost model unless their flags are on.

U9  Rep Settings. Margins (server-side rejection below the organization floor, inline error, Save disabled), Profile (picture upload, name, phone, email, used by the customer's My rep sheet and by quotes), Notifications (in-app toggles per event, stored per rep and used by U2's dropdowns).

U10 Customer site. Base box for anonymous visitors (public query route with a tool allow-list, rate limit, no account data) and the logged-in box with Orders and My rep side sheets and a notification bell. Remove the contacts and quotes sidebars and the three-pane layout. Add a customer orders endpoint and customer notifications (derived from quote activity and order status, read state per customer, polled); a quote notification opens the existing quote preview with Accept, Request changes and Decline. Provide the embed approach per decision 9.

U11 Cleanup and proof. Walk Appendix H. Update the Playwright e2e and docs/demo-script.md, refresh docs/architecture-explainer.html and docs/codebase-structure.html if the shell changed, add a visual check of each frame in the canvas against the running app, run typecheck, unit tests, build and Playwright, and record anything deferred in docs/todo-registry.md.

For each task, finish by writing what changed and what is still open into docs/plans/status.md. Never end a session with work in flight unless its branch is pushed and status.md says where it stands.
```
