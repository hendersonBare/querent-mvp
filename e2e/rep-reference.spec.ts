import { expect, test, type APIRequestContext, type Browser, type Page, type TestInfo } from "@playwright/test";

// The rep portal's read-only reference pages (task 3.8, spec §4; plan U5 rebuilds them on the frames):
// Customers, Orders and Stock (was Items, decision 46), each a list and a detail page, at 1920x1080 (no
// phone layout, decision 43). Lists search and filter on the page; Orders and Customers also follow
// their own ?customer=, and no link carries it to another page except a customer page's "View all"
// (task U1). Brandi is the manager, so she reads every customer and order; Mara reads her own. Add to
// quote adds an item to one of the signed-in rep's own drafts through the existing add-line route.
// Placeholder customers (spec §2) show one-line empty states. Nothing shows cost or margin. The frames
// themselves are proven in e2e/frames-records.spec.ts.
//
// Runs on the mockup's seed day through the test-only reset (see golden-quote-flow.spec.ts):
// start your own server with QUERENT_E2E_RESET=1, or let playwright.config.ts start one.

const SEED_DATE = "2026-09-23";
const APP_SIZE = { width: 1920, height: 1080 };

test.describe.configure({ mode: "serial" });
test.use({ viewport: APP_SIZE });

test.beforeAll(async ({ playwright }, testInfo) => {
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const response = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(response.status(), "POST /api/test/reset failed: start the server with QUERENT_E2E_RESET=1").toBe(200);
  } finally {
    await api.dispose();
  }
});

async function signInAsBrandi(page: Page) {
  await page.goto("/demo");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
}
async function signInAsMara(page: Page) {
  await page.context().addCookies([{ name: "querent-persona", value: "mara", url: String(test.info().project.use.baseURL) }]);
}
const portalNav = (page: Page) => page.getByRole("navigation", { name: "Rep portal" });
const section = (page: Page, label: string) => portalNav(page).getByRole("link", { name: new RegExp(`^${label}\\b`) });
const title = (page: Page) => page.getByRole("heading", { level: 1 });
const panel = (page: Page, name: string) => page.getByRole("region", { name });
/** A list's or card's body rows (role=row, the header row left out). */
const bodyRows = (scope: Page | ReturnType<Page["locator"]>, table: string) =>
  scope.getByRole("table", { name: table }).getByRole("row").filter({ hasNot: ("page" in scope ? scope.page() : scope).locator('[role="columnheader"]') });
/** A row by a link in it (a record's name or number). */
const row = (page: Page, link: string | RegExp) => page.getByRole("row").filter({ has: page.getByRole("link", { name: link }) });
const count = (page: Page) => page.locator("main header span").filter({ hasText: /^\d+ (customers?|orders?|items?)/ });
const openFilter = async (page: Page) => {
  await page.locator("main header").getByRole("button", { name: /^Filter/ }).click();
  return page.getByRole("dialog", { name: /^Filter / });
};

async function noCostOrMargin(page: Page) {
  await expect(page.locator("main")).not.toContainText(/\bcost\b|margin/i);
}
async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

test("customers: every account with its rep, and a detail page with orders, quotes, account, rep and contacts", async ({ page }, testInfo) => {
  await signInAsBrandi(page);
  await section(page, "Customers").click();
  await expect(page).toHaveURL(/\/rep\/customers$/);
  await expect(title(page)).toHaveText("Customers");
  await expect(count(page)).toHaveText("6 customers");
  await expect(bodyRows(page, "Customers")).toHaveCount(6);
  await expect(page.getByRole("columnheader")).toHaveText([":: Customer", ":: Rep", ":: Terms", ":: Open balance", ":: Last order", ":: Orders", ":: Quotes"]);
  await expect(row(page, "Wasatch Mechanical Contractors")).toContainText("Brandi Gallegos");
  await expect(row(page, "Wasatch Mechanical Contractors")).toContainText("Net 30");
  await expect(row(page, "Wasatch Mechanical Contractors")).toContainText("Sep 9, 2026");
  await expect(row(page, "Wasatch Mechanical Contractors")).toContainText("$18,420.00of $50,000.00");
  // Brandi is the manager: other reps' customers are listed with their rep (task U1; a rep sees only their own, below and e2e/rep-roles.spec.ts).
  await expect(row(page, "Canyon Ridge Builders")).toContainText("Mara Jensen");
  await expect(row(page, "Uinta Facility Services")).toContainText("Nora Chen");
  // Mara's and Eli's books (task F1): terms and quotes, no orders yet.
  await expect(row(page, "Utah Valley Electric")).toContainText("Eli Porter");
  await expect(row(page, "Weber Basin Fabricators")).toContainText("Net 45");
  // Placeholders: a name, account number and rep only.
  await expect(row(page, "Great Basin Fabrication")).toContainText("Not on file");
  await expect(row(page, "Great Basin Fabrication")).toContainText("No orders yet");
  await noCostOrMargin(page);
  await attachScreenshot(page, testInfo, "customers-1920");

  await page.getByRole("link", { name: "Wasatch Mechanical Contractors" }).click();
  await expect(page).toHaveURL(/\/rep\/customers\/wasatch$/);
  await expect(title(page)).toHaveText("Wasatch Mechanical Contractors");
  await expect(page).toHaveTitle("Wasatch Mechanical Contractors · Querent");
  await expect(page.locator("main header")).toContainText("WAS-1142, rep Brandi Gallegos, Net 30");
  const account = panel(page, "Account");
  await expect(account).toContainText("Net 30");
  await expect(account).toContainText("$50,000.00");
  await expect(account).toContainText("$18,420.00");
  await expect(account).toContainText("71%"); // 17 of 24 decided quotes won
  await expect(account.getByRole("img", { name: "Credit used: 37% of $50,000.00" })).toBeVisible();
  await expect(panel(page, "Rep")).toContainText("Brandi Gallegos");
  await expect(panel(page, "Rep")).toContainText("(801) 111-2222");
  await expect(panel(page, "Contacts")).toContainText("Dana Ortiz");
  const orders = panel(page, "Recent orders");
  await expect(bodyRows(orders, "Wasatch Mechanical Contractors’s newest orders")).toHaveCount(5);
  await expect(bodyRows(orders, "Wasatch Mechanical Contractors’s newest orders").first()).toContainText("SO-51223");
  const quotes = panel(page, "Recent quotes");
  const quoteRows = bodyRows(quotes, "Wasatch Mechanical Contractors’s newest quotes");
  // The seed's three aging quotes (task A2) are dated from the reset time, so they come before the sample.
  await expect(quoteRows.first()).toContainText("Q-24791");
  await expect(quoteRows.nth(3)).toContainText("Q-24817");
  await expect(quoteRows.nth(3)).toContainText("Draft ready");
  await expect(quotes.getByRole("link", { name: "Q-24817" })).toHaveAttribute("href", "/rep/quotes/Q-24817");
  await expect(quotes.getByRole("link", { name: "View all 28 quotes" })).toHaveAttribute("href", "/rep/quotes?customer=wasatch");
  // Detail tables have no filter and no columns picker.
  await expect(page.getByRole("button", { name: "Choose columns" })).toHaveCount(0);
  await expect(page.locator("main").getByRole("button", { name: /^Filter/ })).toHaveCount(0);
  await noCostOrMargin(page);
  await attachScreenshot(page, testInfo, "customer-wasatch-1920");

  // "View all" opens the Orders list filtered to this customer (its picker shows it); the nav doesn't carry the filter.
  await orders.getByRole("link", { name: "View all 23 orders" }).click();
  await expect(page).toHaveURL(/\/rep\/orders\?customer=wasatch$/);
  await expect(page.getByRole("combobox", { name: "Customer, Wasatch Mechanical Contractors" })).toBeVisible();
  await expect(count(page)).toHaveText("23 orders");
  await expect(section(page, "Orders")).toHaveAttribute("href", "/rep/orders");

  // A placeholder customer's page: its rep, and one-line empty states.
  await page.goto("/rep/customers/great-basin");
  await expect(title(page)).toHaveText("Great Basin Fabrication");
  await expect(panel(page, "Account")).toContainText("aren’t on file for Great Basin Fabrication yet");
  await expect(panel(page, "Rep")).toContainText("Brandi Gallegos");
  await expect(panel(page, "Recent orders")).toContainText("No orders yetOrders Great Basin Fabrication places with Herrick show up here, read-only from the ERP.");
  await expect(panel(page, "Recent quotes")).toContainText("No quotes yet");
  await attachScreenshot(page, testInfo, "customer-great-basin-1920");

  await page.goto("/rep/customers/nobody");
  await expect(title(page)).toHaveText("Customer not found");
});

test("customers: search, Filter and its Only show rules, the count and the chips (C_CU1, C_CU2)", async ({ page }) => {
  await signInAsBrandi(page);
  await page.goto("/rep/customers");
  await page.getByRole("searchbox", { name: "Search customers" }).fill("uve");
  await expect(bodyRows(page, "Customers")).toHaveCount(1);
  await expect(count(page)).toHaveText("1 customer");
  await page.getByRole("searchbox", { name: "Search customers" }).fill("");

  let filter = await openFilter(page);
  await expect(filter).toContainText("Pick one rep or several to see their customers together.");
  await filter.getByRole("checkbox", { name: /^Eli Porter/ }).check({ force: true });
  await filter.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.locator("main header").getByRole("button", { name: "Filter, 1 applied" })).toBeVisible();
  await expect(page.getByText("Rep: Eli Porter")).toBeVisible();
  await expect(bodyRows(page, "Customers")).toHaveCount(2);
  await expect(count(page)).toHaveText("2 customers");
  await page.getByRole("button", { name: "Remove Rep: Eli Porter" }).click();
  await expect(bodyRows(page, "Customers")).toHaveCount(6);

  // Has open quotes: Canyon Ridge, Utah Valley, Wasatch and Weber Basin have drafts or sent quotes.
  filter = await openFilter(page);
  await filter.getByRole("checkbox", { name: "Has open quotes" }).check({ force: true });
  await filter.getByRole("button", { name: "Apply filters" }).click();
  await expect(bodyRows(page, "Customers")).toHaveCount(4);
  await expect(page.getByText("Only show: Has open quotes")).toBeVisible();
  // And Never ordered: Wasatch drops out (23 orders).
  filter = await openFilter(page);
  await filter.getByRole("checkbox", { name: "Never ordered" }).check({ force: true });
  await filter.getByRole("button", { name: "Apply filters" }).click();
  await expect(bodyRows(page, "Customers")).toHaveCount(3);
  await expect(row(page, "Wasatch Mechanical Contractors")).toHaveCount(0);
  await expect(page.getByText("Only show: Has open quotes, Never ordered")).toBeVisible();
  // Over 80% of credit limit: no seeded customer is (Wasatch, the highest, is at 37%).
  filter = await openFilter(page);
  await filter.getByRole("button", { name: "Clear all" }).click();
  await filter.getByRole("checkbox", { name: "Over 80% of credit limit" }).check({ force: true });
  await filter.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("No customers match.")).toBeVisible();
  await expect(count(page)).toHaveText("0 customers");
  // Terms and the open balance range.
  filter = await openFilter(page);
  await filter.getByRole("button", { name: "Clear all" }).click();
  await filter.getByRole("checkbox", { name: "Net 45" }).check({ force: true });
  await filter.getByRole("button", { name: "Apply filters" }).click();
  await expect(bodyRows(page, "Customers")).toHaveCount(1);
  await expect(row(page, "Weber Basin Fabricators")).toBeVisible();
  filter = await openFilter(page);
  await filter.getByRole("button", { name: "Clear all" }).click();
  await filter.getByRole("textbox", { name: "Open balance from" }).fill("5000");
  await filter.getByRole("button", { name: "Apply filters" }).click();
  await expect(bodyRows(page, "Customers")).toHaveCount(2); // Wasatch $18,420 and Canyon Ridge $9,650
  await expect(page.getByText("Open balance: from $5,000.00")).toBeVisible();
  await page.locator("main").getByRole("button", { name: "Clear all" }).click();
  await expect(bodyRows(page, "Customers")).toHaveCount(6);
});

test("customers: ?customer= narrows the list; a customer page ignores it", async ({ page }) => {
  await signInAsBrandi(page);
  await page.goto("/rep/customers?customer=great-basin");
  await expect(bodyRows(page, "Customers")).toHaveCount(1);
  await expect(count(page)).toHaveText("1 customer");

  await page.getByRole("link", { name: "Great Basin Fabrication" }).click();
  await expect(page).toHaveURL(/\/rep\/customers\/great-basin$/);
  // A customer page no longer follows a filter: ?customer= neither redirects nor sticks to its links.
  await page.goto("/rep/customers/wasatch?customer=great-basin");
  await expect(page).toHaveURL(/\/rep\/customers\/wasatch\?customer=great-basin$/);
  await expect(title(page)).toHaveText("Wasatch Mechanical Contractors");
  // The way back is the rail (the frame draws no breadcrumb, C_CU3); it carries no filter.
  await expect(section(page, "Customers")).toHaveAttribute("href", "/rep/customers");

  await page.goto("/rep/customers?customer=wasatch");
  await section(page, "Customers").click();
  await expect(page).toHaveURL(/\/rep\/customers$/);
  await expect(bodyRows(page, "Customers")).toHaveCount(6);
});

test("customers, as a rep: own customers only, no Rep column or Rep filter (C_RCUBase, C_RCU1)", async ({ page }) => {
  await signInAsMara(page);
  await page.goto("/rep/customers");
  await expect(count(page)).toHaveText("1 customer");
  await expect(page.getByRole("columnheader")).toHaveText([":: Customer", ":: Terms", ":: Open balance", ":: Last order", ":: Orders", ":: Quotes"]);
  await expect(row(page, "Canyon Ridge Builders")).toBeVisible();
  const filter = await openFilter(page);
  await expect(filter).toContainText("Narrow your customers by terms, balance or open quotes.");
  await expect(filter.getByRole("group", { name: "Rep" })).toHaveCount(0);
  // Her Has open quotes counts her own: 5 of Canyon Ridge's 7 open quotes.
  await filter.getByRole("checkbox", { name: "Has open quotes" }).check({ force: true });
  await filter.getByRole("button", { name: "Apply filters" }).click();
  await expect(bodyRows(page, "Customers")).toHaveCount(1);
});

test("orders: newest first with Show N more, the picker and Filter; the detail shows the lines at the prices paid", async ({ page }, testInfo) => {
  await signInAsBrandi(page);
  await section(page, "Orders").click();
  await expect(page).toHaveURL(/\/rep\/orders$/);
  await expect(title(page)).toHaveText("Orders");
  await expect(count(page)).toHaveText("23 orders");
  await expect(page.getByRole("combobox", { name: "Customer, All customers" })).toBeVisible();
  // About one screen first (C_ORBase: ten), then the rest.
  await expect(bodyRows(page, "Orders")).toHaveCount(10);
  await page.getByRole("button", { name: "Show 13 more orders" }).click();
  await expect(bodyRows(page, "Orders")).toHaveCount(23);
  await expect(page.getByRole("columnheader", { name: "Customer" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Rep" })).toBeVisible();
  await expect(bodyRows(page, "Orders").first()).toContainText("SO-51223");
  await expect(bodyRows(page, "Orders").first()).toContainText("Wasatch Mechanical Contractors");
  await expect(bodyRows(page, "Orders").first()).toContainText("Delivery, SLC");
  await expect(bodyRows(page, "Orders").first()).toContainText("$698.22");
  await attachScreenshot(page, testInfo, "orders-1920");

  // Filter: will-call orders only, then Shipped only.
  let filter = await openFilter(page);
  await filter.getByRole("checkbox", { name: "Will call" }).check({ force: true });
  await filter.getByRole("button", { name: "Apply filters" }).click();
  await expect(count(page)).toHaveText("12 orders");
  await expect(page.locator("main header").getByRole("button", { name: "Filter, 1 applied" })).toBeVisible();
  filter = await openFilter(page);
  await filter.getByRole("button", { name: "Clear all" }).click();
  await filter.getByRole("checkbox", { name: "Shipped" }).check({ force: true });
  await filter.getByRole("button", { name: "Apply filters" }).click();
  await expect(count(page)).toHaveText("1 order");
  filter = await openFilter(page);
  await filter.getByRole("button", { name: "Clear all" }).click();
  await filter.getByLabel("Ordered from").fill("2026-09-01");
  await filter.getByRole("button", { name: "Apply filters" }).click();
  await expect(bodyRows(page, "Orders")).toHaveCount(1);

  // The picker loads the page for one customer (its own ?customer=).
  const picker = page.getByRole("combobox", { name: "Customer, All customers" });
  await picker.click();
  await page.getByRole("option", { name: /Great Basin Fabrication/ }).click();
  await expect(page).toHaveURL(/\/rep\/orders\?customer=great-basin$/);
  await expect(page.getByText("No orders for Great Basin Fabrication yet.")).toBeVisible();
  await page.goto("/rep/orders?customer=wasatch");
  await expect(count(page)).toHaveText("23 orders");

  await page.getByRole("link", { name: "SO-51223" }).click();
  await expect(page).toHaveURL(/\/rep\/orders\/SO-51223$/);
  await expect(title(page)).toHaveText("SO-51223");
  await expect(page).toHaveTitle("SO-51223 · Querent");
  const lines = panel(page, "Items");
  await expect(bodyRows(lines, "SO-51223 lines with the prices paid")).toHaveCount(3);
  await expect(row(page, /Cut-off wheel 4\.5 x \.045/)).toContainText("$36.00");
  await expect(row(page, /Nitrile disposable gloves/)).toContainText("$79.00");
  await expect(panel(page, "Order total")).toContainText("$698.22");
  const facts = panel(page, "Order details");
  await expect(facts).toContainText("7777");
  await expect(facts).toContainText("Brandi Gallegos");
  await expect(facts.getByRole("link", { name: "Q-24816" })).toHaveAttribute("href", "/rep/quotes/Q-24816");
  await noCostOrMargin(page);
  await attachScreenshot(page, testInfo, "order-1920");

  // An order page ignores ?customer=: no redirect to another customer's orders.
  await page.goto("/rep/orders/SO-51223?customer=great-basin");
  await expect(title(page)).toHaveText("SO-51223");

  await page.goto("/rep/orders/SO-99999");
  await expect(title(page)).toHaveText("Order not found");
});

test("stock: the catalog with stock per branch, search and Filter (no category dropdown), and an item page", async ({ page }, testInfo) => {
  await signInAsBrandi(page);
  await section(page, "Stock").click();
  await expect(page).toHaveURL(/\/rep\/stock$/);
  await expect(title(page)).toHaveText("Stock");
  await expect(count(page)).toHaveText("62 items, stock at SLC, Ogden and Provo");
  await expect(page.getByRole("columnheader")).toHaveText([":: Item", ":: Category", ":: List price", ":: SLC", ":: Ogden", ":: Provo", ":: Total"]);
  await expect(bodyRows(page, "Stock")).toHaveCount(9);
  await page.getByRole("button", { name: "Show 53 more items" }).click();
  await expect(bodyRows(page, "Stock")).toHaveCount(62);
  const bolts = row(page, "Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc");
  await expect(bolts.getByRole("cell")).toHaveText(["Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zincHCS-12-13-2G8, Box of 50", "Fasteners", "$38.95", "64", "22", "8", "94", "Add to quote"]);
  await noCostOrMargin(page);
  await attachScreenshot(page, testInfo, "stock-1920");

  // Filter replaces the category dropdown.
  await expect(page.getByRole("combobox", { name: "Category" })).toHaveCount(0);
  let filter = await openFilter(page);
  await expect(filter).toContainText("62 items across 6 categories.");
  await filter.getByRole("checkbox", { name: /^Fasteners/ }).check({ force: true });
  await filter.getByRole("button", { name: "Apply filters" }).click();
  await expect(count(page)).toHaveText("14 items, stock at SLC, Ogden and Provo");
  filter = await openFilter(page);
  await filter.getByRole("checkbox", { name: "On order" }).check({ force: true });
  await filter.getByRole("button", { name: "Apply filters" }).click();
  await expect(count(page)).toHaveText("0 items, stock at SLC, Ogden and Provo");
  filter = await openFilter(page);
  await filter.getByRole("button", { name: "Clear all" }).click();
  await filter.getByRole("checkbox", { name: "On order" }).check({ force: true });
  await filter.getByRole("button", { name: "Apply filters" }).click();
  await expect(count(page)).toHaveText("2 items, stock at SLC, Ogden and Provo"); // the two ratchet straps with stock on order
  filter = await openFilter(page);
  await filter.getByRole("button", { name: "Clear all" }).click();
  await filter.getByRole("button", { name: "Apply filters" }).click();
  // Search by SKU or name.
  await page.getByRole("searchbox", { name: "Search SKU or item name" }).fill("hcs-12-13");
  await expect(count(page)).toHaveText("4 items, stock at SLC, Ogden and Provo");
  // The old category links (/rep/items?category=, now /rep/stock?category=) start the Filter on that category.
  await page.goto("/rep/stock?category=fasteners");
  await expect(count(page)).toHaveText("14 items, stock at SLC, Ogden and Provo");

  await page.getByRole("link", { name: "Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc" }).click();
  await expect(page).toHaveURL(/\/rep\/stock\/HCS-12-13-2G8$/);
  await expect(title(page)).toHaveText("Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc");
  await expect(page).toHaveTitle("HCS-12-13-2G8 · Querent");
  await expect(panel(page, "Stock by branch").getByRole("row", { name: /Salt Lake City/ })).toContainText("64");
  await expect(panel(page, "Item details")).toContainText("$38.95");
  await expect(panel(page, "List price")).toContainText("List price per box of 50");
  const sales = panel(page, "Recent orders");
  await expect(bodyRows(sales, "Recent orders of HCS-12-13-2G8, newest first, with the prices paid")).toHaveCount(5);
  await expect(bodyRows(sales, "Recent orders of HCS-12-13-2G8, newest first, with the prices paid").first()).toContainText("SO-51221");
  await expect(bodyRows(sales, "Recent orders of HCS-12-13-2G8, newest first, with the prices paid").first()).toContainText("$31.50");
  await noCostOrMargin(page);
  await attachScreenshot(page, testInfo, "item-1920");

  // Recent orders are every customer's for the manager (a rep's own customers' otherwise, task U1); the catalog is the same for everyone.
  await expect(panel(page, "Recent orders")).toContainText("All customers");
  await section(page, "Stock").click();
  await expect(page).toHaveURL(/\/rep\/stock$/);
  await expect(count(page)).toHaveText("62 items, stock at SLC, Ogden and Provo");

  await page.goto("/rep/stock/NOPE-1");
  await expect(title(page)).toHaveText("Item not found");
});

/** The quote's lines as the rep's API reads them (from the page: the production session cookie is Secure). */
const linesOf = (page: Page, quote: string) => page.evaluate(async (q) => (await (await fetch(`/api/rep/quotes/${q}`)).json()).lines as { sku: string; qty: number; unit_price: number | null; added_by: string }[], quote);

test("Add to quote, from a Stock row and from the item page: the rep's own drafts, priced by the engine (C_ST3)", async ({ page }) => {
  await signInAsBrandi(page);
  await page.goto("/rep/stock");
  const before = (await linesOf(page, "Q-24817")).length;
  await row(page, "Wedge anchor 1/2 x 4-1/4 in, zinc plated").getByRole("button", { name: "Add to quote" }).click();
  let dialog = page.getByRole("dialog", { name: "Add to quote" });
  await expect(dialog).toContainText("ANC-12-414-W, Box of 25, list price $31.50");
  // Brandi's own drafts only (decision 22), newest quote first; the first is picked.
  await expect(dialog.getByRole("radio")).toHaveText([/^Q-24817, Wasatch Mechanical Contractors/, /^Q-24790, Wasatch Mechanical Contractors/, "+Start a new quote"]);
  await expect(dialog.getByRole("radio").first()).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("textbox", { name: "Quantity" }).fill("2");
  await dialog.getByRole("button", { name: "Add to Q-24817" }).click();
  await expect(page).toHaveURL(/\/rep\/quotes\/Q-24817$/);
  const lines = await linesOf(page, "Q-24817");
  expect(lines).toHaveLength(before + 1);
  expect(lines.at(-1)).toMatchObject({ sku: "ANC-12-414-W", qty: 2, added_by: "rep" });
  expect(lines.at(-1)!.unit_price).toBeGreaterThan(0);

  // From the item page, into the other draft.
  await page.goto("/rep/stock/FW-12-G8");
  await page.locator("main").getByRole("button", { name: "Add to quote" }).click();
  dialog = page.getByRole("dialog", { name: "Add to quote" });
  await dialog.getByRole("radio", { name: /^Q-24790/ }).click();
  await dialog.getByRole("button", { name: "Add to Q-24790" }).click();
  await expect(page).toHaveURL(/\/rep\/quotes\/Q-24790$/);
  expect((await linesOf(page, "Q-24790")).at(-1)).toMatchObject({ sku: "FW-12-G8", qty: 1 });

  // Start a new quote is drawn, but no route starts a quote from Stock yet: its button stays disabled (to ask).
  await page.goto("/rep/stock/FW-12-G8");
  await page.locator("main").getByRole("button", { name: "Add to quote" }).click();
  await dialog.getByRole("radio", { name: /Start a new quote/ }).click();
  await expect(dialog.getByRole("button", { name: "Start a new quote" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("Add to quote, as a rep: only her own drafts", async ({ page }) => {
  await signInAsMara(page);
  await page.goto("/rep/stock/FW-12-G8");
  await page.locator("main").getByRole("button", { name: "Add to quote" }).click();
  const dialog = page.getByRole("dialog", { name: "Add to quote" });
  const choices = await dialog.getByRole("radio").allTextContents();
  expect(choices.at(-1)).toBe("+Start a new quote");
  expect(choices.length).toBeGreaterThan(1);
  for (const choice of choices.slice(0, -1)) expect(choice).toMatch(/^Q-\d+, Canyon Ridge Builders/);
  expect(choices.join(" ")).not.toContain("Q-24817");
});

/**
 * Every reference route, and one string only its page renders: record data, never in the URL or
 * in the portal frame, and one text node in both the
 * HTML and the RSC payload. A rep's raw response must carry it; a customer's or an anonymous one must not.
 */
const ROUTES: [path: string, pageText: string][] = [
  ["/rep/customers", "Uinta Facility Services"],
  ["/rep/customers?customer=wasatch", "WAS-1142"],
  ["/rep/customers/wasatch", "$18,420.00"],
  ["/rep/customers/great-basin", "No contacts on file."],
  ["/rep/orders", "SO-51223"],
  ["/rep/orders?customer=wasatch", "SO-51222"],
  ["/rep/orders/SO-51223", "Price paid"],
  ["/rep/stock", "Wedge anchor 1/2 x 4-1/4 in, zinc plated"],
  ["/rep/stock?category=fasteners", "Hex nut 1/2-13, Grade 8, yellow zinc"],
  ["/rep/stock/HCS-12-13-2G8", "Stock by branch"],
  ["/rep/stock/HCS-12-13-2G8?customer=wasatch", "SO-51221"],
];
/** Record data from any of those pages: names, account numbers, balances, order numbers, item names and panel headings. */
const RECORD_DATA =
  /Canyon Ridge|Wasatch Mechanical|Great Basin Fabrication|Uinta Facility|WAS-1142|GBF-2207|18,420|SO-5122[0-2]|Price paid|Stock by branch|Recent orders|Hex cap screw|Hex nut|Wedge anchor|\$38\.95|\$698\.22|Brandi Gallegos|Net 30/;

/** The persona cookie ("querent-persona=<id>") a workspace sign-in sets, read from a throwaway browser context. */
async function personaCookie(browser: Browser, baseURL: string, workspace: RegExp, signedIn: (page: Page) => Promise<void>) {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/demo");
    await page.getByRole("button", { name: workspace }).click();
    await signedIn(page);
    const cookie = (await context.cookies()).find((c) => c.name === "querent-persona");
    expect(cookie, "signing in sets the persona cookie").toBeDefined();
    return `${cookie!.name}=${cookie!.value}`;
  } finally {
    await context.close();
  }
}

/**
 * The raw response to GET `path`, redirects not followed: the HTML a full load gets, or with
 * `rsc` the RSC payload a client-side navigation fetches. The cookie goes in by hand because the
 * production session cookie is Secure, which Playwright's request client won't send over http.
 */
async function raw(api: APIRequestContext, path: string, { cookie, rsc = false }: { cookie?: string; rsc?: boolean }) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (rsc) headers.RSC = "1";
  let response = await api.get(path, { headers, maxRedirects: 0 });
  // Next first redirects an RSC request to the same URL with its _rsc cache-busting param; take that one hop only.
  const location = response.headers().location ?? "";
  if (rsc && response.status() === 307 && /[?&]_rsc\b/.test(location)) response = await api.get(location, { headers, maxRedirects: 0 });
  return { status: response.status(), location: response.headers().location ?? null, body: await response.text() };
}
/** How an RSC payload redirects: the client router follows a NEXT_REDIRECT digest (the HTTP status stays 200). */
const RSC_REDIRECT_HOME = /NEXT_REDIRECT;(?:replace|push);\/;30[78];/;

test("access: every reference route answers a customer or no session with a redirect that carries no record data", async ({ browser, playwright }, testInfo) => {
  // A redirect in the rep layout alone doesn't stop a page segment from rendering and streaming its
  // records in the redirect's body (node_modules/next/dist/docs/01-app/02-guides/authentication.md),
  // so each page must check the rep session itself. This reads the raw responses to prove it.
  const baseURL = testInfo.project.use.baseURL!;
  const dana = await personaCookie(browser, baseURL, /Wasatch Mechanical Contractors/, (page) =>
    expect(page.getByRole("button", { name: /Wasatch Mechanical Contractors/ })).toContainText("Signed in"));
  const brandi = await personaCookie(browser, baseURL, /Herrick Industrial Supply/, (page) => expect(page).toHaveURL(/\/rep\/quotes$/));
  const api = await playwright.request.newContext({ baseURL });
  try {
    for (const [path, pageText] of ROUTES) {
      for (const rsc of [false, true]) {
        const as = `${path}${rsc ? " (RSC payload)" : ""}`;
        // The rep gets the page, so its text is a fair probe.
        const rep = await raw(api, path, { cookie: brandi, rsc });
        expect(rep.status, `${as} as Brandi`).toBe(200);
        expect(rep.body, `${as} as Brandi`).not.toMatch(RSC_REDIRECT_HOME);
        expect(rep.body, `${as} as Brandi`).toContain(pageText);
        expect(rep.body, `${as} as Brandi`).toMatch(RECORD_DATA);
        // Dana and no session: a redirect to the workspace chooser, and nothing from the page.
        for (const [who, cookie] of [["Dana", dana], ["no session", undefined]] as const) {
          const denied = await raw(api, path, { cookie, rsc });
          if (rsc) {
            expect(denied.body, `${as} as ${who}`).toMatch(RSC_REDIRECT_HOME);
          } else {
            expect(denied.status, `${as} as ${who}`).toBe(307);
            expect(denied.location, `${as} as ${who}`).toMatch(/^(https?:\/\/[^/]+)?\/$/);
          }
          expect(denied.body, `${as} as ${who}`).not.toContain(pageText);
          expect(denied.body, `${as} as ${who}`).not.toMatch(RECORD_DATA);
        }
      }
    }
  } finally {
    await api.dispose();
  }
});

test("access: in the browser, Dana and a visitor with no session are sent back to / from every route", async ({ page, browser }, testInfo) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
  await expect(page.getByRole("button", { name: /Wasatch Mechanical Contractors/ })).toContainText("Signed in");
  for (const [path] of ROUTES) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "Notifications" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/18,420|SO-51223|Stock by branch|Price paid/);
  }

  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const anonymous = await context.newPage();
    await anonymous.goto("/rep/customers/wasatch");
    await expect(anonymous).toHaveURL(/\/$/);
    // / with no session is the visitor box (decision 53).
    await expect(anonymous.getByRole("button", { name: "Sign in" })).toBeVisible();
  } finally {
    await context.close();
  }
});
