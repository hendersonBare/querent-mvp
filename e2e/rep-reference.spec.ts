import { expect, test, type APIRequestContext, type Browser, type Page, type TestInfo } from "@playwright/test";

// The rep portal's read-only reference pages (task 3.8, spec §4): Customers, Orders and Items,
// each a list and a detail page, at desktop width and at 390px, following the "Viewing" picker
// (?customer=). Placeholder customers (spec §2) show empty states. Nothing shows cost or margin.
//
// Runs on the mockup's seed day through the test-only reset (see golden-quote-flow.spec.ts):
// start your own server with QUERENT_E2E_RESET=1, or let playwright.config.ts start one.

const SEED_DATE = "2026-09-23";

test.describe.configure({ mode: "serial" });

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
  await page.goto("/");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
}
const portalNav = (page: Page) => page.getByRole("navigation", { name: "Rep portal" });
const section = (page: Page, label: string) => portalNav(page).getByRole("link", { name: new RegExp(`^${label}\\b`) });
const title = (page: Page) => page.getByRole("heading", { level: 1 });
const viewing = (page: Page) => page.getByLabel("Viewing");
const panel = (page: Page, name: string) => page.getByRole("region", { name });
/** A table row by the text of its row header (the first cell). */
const row = (page: Page, name: string | RegExp) => page.getByRole("row").filter({ has: page.getByRole("rowheader", { name }) });
const bodyRows = (page: Page) => page.locator("main tbody tr");

async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}
async function noCostOrMargin(page: Page) {
  await expect(page.locator("main")).not.toContainText(/\bcost\b|margin/i);
}
async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

test("customers: every account with its rep, and a detail page with account, rep, orders and quotes", async ({ page }, testInfo) => {
  await signInAsBrandi(page);
  await section(page, "Customers").click();
  await expect(page).toHaveURL(/\/rep\/customers$/);
  await expect(title(page)).toHaveText("Customers");
  await expect(page.getByText("Viewing All customers · 4 customers")).toBeVisible();
  await expect(bodyRows(page)).toHaveCount(4);
  await expect(row(page, /Wasatch Mechanical Contractors/)).toContainText("Brandi Gallegos");
  await expect(row(page, /Wasatch Mechanical Contractors/)).toContainText("Net 30");
  await expect(row(page, /Wasatch Mechanical Contractors/)).toContainText("Sep 9, 2026");
  // Other reps' customers are listed with their rep (task 3.2 decides whose quotes Brandi sees).
  await expect(row(page, /Canyon Ridge Builders/)).toContainText("Mara Jensen");
  await expect(row(page, /Uinta Facility Services/)).toContainText("Nora Chen");
  // Placeholders: a name, account number and rep only.
  await expect(row(page, /Great Basin Fabrication/)).toContainText("Not on file");
  await expect(row(page, /Great Basin Fabrication/)).toContainText("No orders yet");
  await noCostOrMargin(page);
  await attachScreenshot(page, testInfo, "customers-desktop");

  await page.getByRole("link", { name: "Wasatch Mechanical Contractors" }).click();
  await expect(page).toHaveURL(/\/rep\/customers\/wasatch$/);
  await expect(title(page)).toHaveText("Wasatch Mechanical Contractors");
  await expect(page).toHaveTitle("Wasatch Mechanical Contractors · Querent");
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
  await expect(orders.locator("tbody tr")).toHaveCount(5);
  await expect(orders.locator("tbody tr").first()).toContainText("SO-51223");
  const quotes = panel(page, "Recent quotes");
  await expect(quotes.locator("tbody tr").first()).toContainText("Q-24817");
  await expect(quotes.locator("tbody tr").first()).toContainText("Draft ready");
  await expect(quotes.getByRole("link", { name: "Q-24817" })).toHaveAttribute("href", "/rep/quotes/Q-24817");
  await expect(quotes.getByRole("link", { name: "View all 25 quotes" })).toHaveAttribute("href", "/rep/quotes?customer=wasatch");
  await noCostOrMargin(page);
  await attachScreenshot(page, testInfo, "customer-wasatch-desktop");

  // "View all" opens this customer's orders: the picker follows.
  await orders.getByRole("link", { name: "View all 23 orders" }).click();
  await expect(page).toHaveURL(/\/rep\/orders\?customer=wasatch$/);
  await expect(viewing(page)).toHaveValue("wasatch");

  // A placeholder customer's page: its rep, and empty states.
  await page.goto("/rep/customers/great-basin");
  await expect(title(page)).toHaveText("Great Basin Fabrication");
  await expect(panel(page, "Account")).toContainText("aren’t on file for Great Basin Fabrication yet");
  await expect(panel(page, "Rep")).toContainText("Brandi Gallegos");
  await expect(panel(page, "Recent orders").getByRole("heading", { name: "No orders yet" })).toBeVisible();
  await expect(panel(page, "Recent quotes").getByRole("heading", { name: "No quotes yet" })).toBeVisible();
  await attachScreenshot(page, testInfo, "customer-great-basin-desktop");

  await page.goto("/rep/customers/nobody");
  await expect(title(page)).toHaveText("Customer not found");
});

test("customers: the picker narrows the list and switches the customer page", async ({ page }) => {
  await signInAsBrandi(page);
  await section(page, "Customers").click();
  // Wait for the page before picking: the picker keeps whatever page is current (router.replace).
  await expect(page).toHaveURL(/\/rep\/customers$/);
  await expect(bodyRows(page)).toHaveCount(4);
  await viewing(page).selectOption("great-basin");
  await expect(page).toHaveURL(/\/rep\/customers\?customer=great-basin$/);
  await expect(bodyRows(page)).toHaveCount(1);
  await expect(page.getByText("Showing Great Basin Fabrication only.")).toBeVisible();

  await page.getByRole("link", { name: "Great Basin Fabrication" }).click();
  await expect(page).toHaveURL(/\/rep\/customers\/great-basin\?customer=great-basin$/);
  await viewing(page).selectOption("wasatch");
  await expect(page).toHaveURL(/\/rep\/customers\/wasatch\?customer=wasatch$/);
  await expect(title(page)).toHaveText("Wasatch Mechanical Contractors");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Customers" })).toHaveAttribute("href", "/rep/customers?customer=wasatch");

  // All customers keeps the page.
  await viewing(page).selectOption("all");
  await expect(page).toHaveURL(/\/rep\/customers\/wasatch$/);
  await expect(title(page)).toHaveText("Wasatch Mechanical Contractors");
});

test("orders: the list follows the picker, and the detail shows the lines at the prices paid", async ({ page }, testInfo) => {
  await signInAsBrandi(page);
  await section(page, "Orders").click();
  await expect(page).toHaveURL(/\/rep\/orders$/);
  await expect(title(page)).toHaveText("Orders");
  await expect(page.getByText("Viewing All customers · 23 orders")).toBeVisible();
  await expect(bodyRows(page)).toHaveCount(23);
  await expect(page.getByRole("columnheader", { name: "Customer" })).toBeVisible();
  await expect(bodyRows(page).first()).toContainText("SO-51223");
  await expect(bodyRows(page).first()).toContainText("Wasatch Mechanical Contractors");
  await expect(bodyRows(page).first()).toContainText("$698.22");
  await attachScreenshot(page, testInfo, "orders-desktop");

  await viewing(page).selectOption("great-basin");
  await expect(page).toHaveURL(/\/rep\/orders\?customer=great-basin$/);
  await expect(page.getByRole("heading", { name: "No orders for Great Basin Fabrication yet" })).toBeVisible();
  await viewing(page).selectOption("wasatch");
  await expect(bodyRows(page)).toHaveCount(23);
  await expect(page.getByRole("columnheader", { name: "Customer" })).toHaveCount(0);

  await page.getByRole("link", { name: "SO-51223" }).click();
  await expect(page).toHaveURL(/\/rep\/orders\/SO-51223\?customer=wasatch$/);
  await expect(title(page)).toHaveText("SO-51223");
  await expect(page).toHaveTitle("SO-51223 · Querent");
  const lines = panel(page, "Items");
  await expect(lines.locator("tbody tr")).toHaveCount(3);
  await expect(row(page, /Cut-off wheel 4\.5 x \.045/)).toContainText("$36.00");
  await expect(row(page, /Nitrile disposable gloves/)).toContainText("$79.00");
  await expect(lines).toContainText("Order total$698.22");
  const facts = panel(page, "Order");
  await expect(facts).toContainText("7777");
  await expect(facts.getByRole("link", { name: "Q-24816" })).toHaveAttribute("href", "/rep/quotes/Q-24816?customer=wasatch");
  await noCostOrMargin(page);
  await attachScreenshot(page, testInfo, "order-desktop");

  // Picking a customer the order isn't for goes to that customer's orders.
  await viewing(page).selectOption("great-basin");
  await expect(page).toHaveURL(/\/rep\/orders\?customer=great-basin$/);
  await expect(title(page)).toHaveText("Orders");

  await page.goto("/rep/orders/SO-99999");
  await expect(title(page)).toHaveText("Order not found");
});

test("items: the catalog with stock per branch, list price and category, and an item page", async ({ page }, testInfo) => {
  await signInAsBrandi(page);
  await section(page, "Items").click();
  await expect(page).toHaveURL(/\/rep\/items$/);
  await expect(title(page)).toHaveText("Items");
  await expect(page.getByRole("columnheader")).toHaveText(["Item", "Category", "List price", "SLC", "Ogden", "Provo", "Total"]);
  await expect(bodyRows(page)).toHaveCount(62);
  const bolts = row(page, /HCS-12-13-2G8/);
  await expect(bolts.getByRole("cell")).toHaveText(["Fasteners", "$38.95", "64", "22", "8", "94"]);
  await noCostOrMargin(page);
  await attachScreenshot(page, testInfo, "items-desktop");

  const categories = page.getByRole("navigation", { name: "Filter by category" });
  await categories.getByRole("link", { name: /^Fasteners/ }).click();
  await expect(page).toHaveURL(/\/rep\/items\?category=fasteners$/);
  await expect(bodyRows(page)).toHaveCount(14);
  await expect(categories.getByRole("link", { name: /^Fasteners/ })).toHaveAttribute("aria-current", "page");

  await page.getByRole("link", { name: "Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc" }).click();
  await expect(page).toHaveURL(/\/rep\/items\/HCS-12-13-2G8$/);
  await expect(title(page)).toHaveText("Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc");
  await expect(page).toHaveTitle("HCS-12-13-2G8 · Querent");
  await expect(row(page, /Salt Lake City/).getByRole("cell").first()).toHaveText("64");
  await expect(panel(page, "Item")).toContainText("$38.95");
  const sales = panel(page, "Recent orders");
  await expect(sales.locator("tbody tr")).toHaveCount(5);
  await expect(sales.locator("tbody tr").first()).toContainText("SO-51221");
  await expect(sales.locator("tbody tr").first()).toContainText("$31.50");
  await noCostOrMargin(page);
  await attachScreenshot(page, testInfo, "item-desktop");

  // Recent orders follow the picker; the catalog itself is the same for everyone.
  await viewing(page).selectOption("great-basin");
  await expect(page).toHaveURL(/\/rep\/items\/HCS-12-13-2G8\?customer=great-basin$/);
  await expect(sales.getByRole("heading", { name: "Great Basin Fabrication hasn’t ordered this item" })).toBeVisible();
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Items" }).click();
  await expect(page).toHaveURL(/\/rep\/items\?customer=great-basin$/);
  await expect(bodyRows(page)).toHaveCount(62);

  await page.goto("/rep/items/NOPE-1");
  await expect(title(page)).toHaveText("Item not found");
});

test("phone (390px): each list and detail fits, with the picker, and nothing scrolls sideways", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsBrandi(page);
  const pages: [string, string][] = [
    ["/rep/customers", "Customers"],
    ["/rep/customers/wasatch", "Wasatch Mechanical Contractors"],
    ["/rep/customers/great-basin", "Great Basin Fabrication"],
    ["/rep/orders", "Orders"],
    ["/rep/orders/SO-51223", "SO-51223"],
    ["/rep/items", "Items"],
    ["/rep/items/HCS-12-13-2G8", "Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc"],
  ];
  for (const [path, heading] of pages) {
    await page.goto(path);
    await expect(title(page)).toHaveText(heading);
    await expect(title(page)).toBeInViewport();
    await noSidewaysScroll(page);
    await attachScreenshot(page, testInfo, `390${path.replaceAll("/", "-")}`);
  }

  // The picker at 390px: Orders narrows to Wasatch, and the list still fits.
  await page.goto("/rep/orders");
  await expect(bodyRows(page)).toHaveCount(23);
  await viewing(page).selectOption("wasatch");
  await expect(page).toHaveURL(/\/rep\/orders\?customer=wasatch$/);
  await expect(page.getByText("Viewing Wasatch Mechanical Contractors · 23 orders")).toBeVisible();
  await expect(bodyRows(page).first().getByRole("link", { name: "SO-51223" })).toBeInViewport();
  await expect(bodyRows(page).first()).toContainText("$698.22");
  await noSidewaysScroll(page);
  await attachScreenshot(page, testInfo, "390-rep-orders-wasatch");
  await bodyRows(page).first().getByRole("link", { name: "SO-51223" }).click();
  await expect(page).toHaveURL(/\/rep\/orders\/SO-51223\?customer=wasatch$/);
  await noSidewaysScroll(page);
});

/**
 * Every reference route, and one string only its page renders: record data, never in the URL or
 * in the portal frame (whose picker lists every customer's name), and one text node in both the
 * HTML and the RSC payload. A rep's raw response must carry it; a customer's or an anonymous one must not.
 */
const ROUTES: [path: string, pageText: string][] = [
  ["/rep/customers", "Not on file"],
  ["/rep/customers?customer=wasatch", "Viewing Wasatch Mechanical Contractors · 1 customer"],
  ["/rep/customers/wasatch", "$18,420.00"],
  ["/rep/customers/great-basin", "No contacts on file."],
  ["/rep/orders", "Viewing All customers · 23 orders"],
  ["/rep/orders?customer=wasatch", "Viewing Wasatch Mechanical Contractors · 23 orders"],
  ["/rep/orders/SO-51223", "Price paid"],
  ["/rep/items", "Wedge anchor 1/2 x 4-1/4 in, zinc plated"],
  ["/rep/items?category=fasteners", "Hex nut 1/2-13, Grade 8, yellow zinc"],
  ["/rep/items/HCS-12-13-2G8", "Stock by branch"],
  ["/rep/items/HCS-12-13-2G8?customer=wasatch", "SO-51221"],
];
/** Record data from any of those pages: names, account numbers, balances, order numbers, item names and panel headings. */
const RECORD_DATA =
  /Canyon Ridge|Wasatch Mechanical|Great Basin Fabrication|Uinta Facility|WAS-1142|GBF-2207|18,420|SO-5122[0-2]|Price paid|Stock by branch|Recent orders|Hex cap screw|Hex nut|Wedge anchor|\$38\.95|\$698\.22|Brandi Gallegos|Net 30/;

/** The persona cookie ("querent-persona=<id>") a workspace sign-in sets, read from a throwaway browser context. */
async function personaCookie(browser: Browser, baseURL: string, workspace: RegExp, signedIn: (page: Page) => Promise<void>) {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/");
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
    expect(page.locator(".customer-header")).toContainText("Wasatch Mechanical Contractors"));
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
  await page.goto("/");
  await page.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
  await expect(page.locator(".customer-header")).toContainText("Wasatch Mechanical Contractors");
  for (const [path] of ROUTES) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".customer-header")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/18,420|SO-51223|Stock by branch|Price paid/);
  }

  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const anonymous = await context.newPage();
    await anonymous.goto("/rep/customers/wasatch");
    await expect(anonymous).toHaveURL(/\/$/);
    await expect(anonymous.getByText("Who would you like to explore as?")).toBeVisible();
  } finally {
    await context.close();
  }
});
