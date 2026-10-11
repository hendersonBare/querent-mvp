import { expect, test, type Page, type TestInfo } from "@playwright/test";

// The rep's Quotes list (task 3.2; spec §4, §5.4): the table, the status filter, the page's own
// customer filter (?customer=), the changes_requested highlight, unread clearing on open and the
// empty states. Brandi is the manager, whose list is every rep's quotes by default (task U1), so
// these checks narrow it to her own with the Rep filter (?rep=brandi) unless they say otherwise.
//
// beforeAll resets the database to the seed pinned to the mockup's day (POST /api/test/reset),
// then POST /api/test/rep-quotes adds what the seed lacks, through the real quote services:
// a changes_requested quote (unread), a sent one, one sent 20 days ago (overdue, so Expired) and a
// quote for Mara's customer Canyon Ridge. Both hooks exist only when the server runs with
// QUERENT_E2E_RESET=1 (playwright.config.ts sets it for the server it starts).
//
// The seed also has three open aging quotes dated from the reset time (task A2, e2e/rep-aging.spec.ts):
// Q-24789 and Q-24791 sent, Q-24790 changes requested. They are read, so the unread counts hold, and
// the sample Q-24817, weeks old on the server's clock, carries the Overdue marker. The demo book
// (task F1) adds three accepted Canyon Ridge quotes Brandi covered for Mara, so her own list has 34.

const SEED_DATE = "2026-09-23";
const SAMPLE = "Q-24817";
let made: { changes_requested: string; sent: string; overdue: string; other_rep: string };

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }, testInfo) => {
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const reset = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(
      reset.status(),
      "POST /api/test/reset failed: start the server with QUERENT_E2E_RESET=1 (playwright.config.ts does this with QUERENT_WEBSERVER=1)",
    ).toBe(200);
    const fixture = await api.post("/api/test/rep-quotes");
    expect(fixture.status()).toBe(200);
    made = await fixture.json();
  } finally {
    await api.dispose();
  }
});

async function signInAsBrandi(page: Page, { own = true }: { own?: boolean } = {}) {
  await page.goto("/");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
  if (own) {
    await page.goto(MINE);
    await expect(page.getByRole("combobox", { name: "Rep" })).toHaveValue("brandi");
  }
}
/** Brandi's own quotes: the manager's list narrowed by the Rep filter. */
const MINE = "/rep/quotes?rep=brandi";
/** The manager's columns (task D2): the row checkbox, then the quote's cells with a Rep column. */
const COLUMNS = ["Select", "Quote", "Customer", "Rep", "Requested", "Status", "Total", "Margin"];
/** Cell indexes in a manager's row (the checkbox is cell 0). */
const CELL = { customer: 1, rep: 2, requested: 3, status: 4, total: 5, margin: 6 } as const;
const quotesNavLink = (page: Page) =>
  page.getByRole("navigation", { name: "Rep portal" }).getByRole("link", { name: /^Quotes\b/ });
const statusFilter = (page: Page) => page.getByRole("navigation", { name: "Filter by status" });
const quotesTable = (page: Page) => page.getByRole("table");
/** One quote in the list: its row, plus the customer's note when they asked for changes. */
const quote = (page: Page, number: string) =>
  quotesTable(page).getByRole("rowgroup").filter({ has: page.getByRole("link", { name: number, exact: true }) });
const listed = (page: Page) => quotesTable(page).getByRole("rowheader").getByRole("link");
async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}
async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

test("table: each quote with its number and revision, customer, requested date, status, total and margin", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsBrandi(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quotes");
  await expect(page.getByText("Viewing All customers · 2 unread quotes")).toBeVisible();
  await expect(quotesTable(page).getByRole("columnheader")).toHaveText(COLUMNS);

  // The sample quote: a draft Brandi hasn't opened, totalled live, with the gloves under her 30% PPE floor.
  const sample = quote(page, SAMPLE);
  await expect(sample.getByRole("rowheader")).toHaveText(/Unread: Q-24817\s*Not sent\s*Sample data/);
  await expect(sample.getByRole("cell")).toHaveText([
    "", /Wasatch Mechanical Contractors\s*WAS-1142/, /Brandi Gallegos$/, /Sep 23$/, /^Draft ready\s*Overdue/, /\$1,122\.40\s*Draft/, /^32\.2%.*1 line below floor$/,
  ]);
  // A sent quote's total is the revision the customer saw.
  await expect(quote(page, made.sent).getByRole("cell").nth(CELL.status)).toHaveText("Sent");
  await expect(quote(page, made.sent).getByRole("rowheader")).toHaveText(/rev 1/);
  // Expiry is lazy: the quote sent 20 days ago (valid 14) lists as Expired, not Sent.
  await expect(quote(page, made.overdue).getByRole("cell").nth(CELL.status)).toHaveText("Expired");
  await expect(quote(page, "Q-24816").getByRole("cell").nth(CELL.status)).toHaveText("Accepted");
  await expect(listed(page)).toHaveCount(34);
  await attachScreenshot(page, testInfo, "quotes-1440");
});

test("filter: by status, with counts, kept in ?status= next to the page's own customer filter", async ({ page }) => {
  await signInAsBrandi(page);
  await expect(statusFilter(page).getByRole("link")).toHaveText([
    // Needs attention: the sample, the seed's Q-24789 and Q-24790, and this fixture's change request (asked a day ago: red at 24 h).
    /^All\s*34$/, /^Needs attention\s*4$/, /^Draft ready\s*1$/, /^Changes requested\s*2$/, /^Sent\s*3$/, /^Accepted\s*20$/, /^Expired\s*8$/, /^Declined\s*0$/,
  ]);
  await statusFilter(page).getByRole("link", { name: /^Expired/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes\?status=expired&rep=brandi$/);
  await expect(listed(page)).toHaveCount(8);
  await expect(quote(page, made.overdue)).toBeVisible();
  await expect(statusFilter(page).getByRole("link", { name: /^Expired/ })).toHaveAttribute("aria-current", "page");

  await statusFilter(page).getByRole("link", { name: /^Draft ready/ }).click();
  await expect(page).toHaveURL(/\?status=ready_for_review&rep=brandi$/);
  await expect(listed(page)).toHaveText([SAMPLE]);

  // The page's own customer filter keeps the status filter, and the status links keep it.
  await page.goto("/rep/quotes?status=ready_for_review&rep=brandi&customer=wasatch");
  await expect(listed(page)).toHaveText([SAMPLE]);
  await statusFilter(page).getByRole("link", { name: /^All/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes\?rep=brandi&customer=wasatch$/);
  await expect(listed(page)).toHaveCount(31);
  await expect(page.getByText("Viewing Wasatch Mechanical Contractors", { exact: false })).toBeVisible();
  // No nav link carries it (task U1).
  await expect(quotesNavLink(page)).toHaveAttribute("href", "/rep/quotes");

  // A link straight to a filtered list opens filtered (newest request first: the seed's Q-24791, this fixture's, then Q-24789).
  await page.goto("/rep/quotes?status=sent&customer=wasatch");
  await expect(listed(page)).toHaveText(["Q-24791", made.sent, "Q-24789"]);
});

test("changes_requested: highlighted, with the customer's note under the row", async ({ page }) => {
  await signInAsBrandi(page);
  const changes = quote(page, made.changes_requested);
  await expect(changes).toHaveAttribute("data-status", "changes_requested");
  await expect(changes.getByRole("rowheader")).toHaveText(/^Unread: /);
  // Asked a day ago, so it is Overdue too (task A2: red at 24 h).
  await expect(changes.getByRole("cell").nth(CELL.status)).toHaveText(/^Changes requested\s*Overdue/);
  await expect(changes.getByText(/^Dana Ortiz asked for changes · /)).toBeVisible();
  await expect(changes.getByText("Can you make the gloves 6 cases, and hold it for pickup at SLC instead?")).toBeVisible();
  // The highlight is the amber of the mockup's warning chips, on the row and its note alone.
  const background = (number: string) => quote(page, number).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await background(made.changes_requested)).not.toBe(await background(made.sent));
  await expect(quote(page, made.sent).getByText(/asked for changes/)).toHaveCount(0);

  await statusFilter(page).getByRole("link", { name: /^Changes requested/ }).click();
  await expect(listed(page)).toHaveText(["Q-24790", made.changes_requested]);
});

test("scope: the manager's list is every rep's quotes; the Rep filter and ?customer= narrow it (task U1)", async ({ page }) => {
  await signInAsBrandi(page, { own: false });
  // No All reps switch: Mara's customer's new quote is in Brandi's list by default, with its rep.
  await expect(page.getByRole("navigation", { name: "Whose quotes" })).toHaveCount(0);
  await expect(quote(page, made.other_rep).getByRole("cell").nth(CELL.rep)).toHaveText(/Mara Jensen$/);
  const every = await listed(page).count();
  expect(every).toBeGreaterThan(34);

  // Her own quotes: the Rep filter.
  await page.goto(MINE);
  await expect(listed(page)).toHaveCount(34);
  await expect(quote(page, made.other_rep)).toHaveCount(0);

  // Mara's customer: every rep's Canyon Ridge quotes, or with the Rep filter only the three Brandi covered (task F1).
  await page.goto("/rep/quotes?customer=canyon-ridge");
  await expect(quote(page, made.other_rep)).toHaveCount(1);
  await page.goto("/rep/quotes?rep=brandi&customer=canyon-ridge");
  await expect(listed(page)).toHaveCount(3);
  for (const status of await quotesTable(page).getByRole("rowgroup").filter({ has: page.getByRole("rowheader") }).all())
    await expect(status.getByRole("cell").nth(CELL.status)).toHaveText("Accepted");
  // ?scope=all changes nothing.
  await page.goto("/rep/quotes?scope=all");
  await expect(listed(page)).toHaveCount(every);

  // Brandi is the manager: opening another rep's quote shows it read-only (task D2;
  // e2e/rep-reassign.spec.ts covers it, and another rep's not-found).
  await page.goto(`/rep/quotes/${made.other_rep}`);
  await expect(page.getByRole("region", { name: "Read only" })).toContainText("Mara Jensen’s quote");
});

test("empty state: a placeholder customer has no quotes yet", async ({ page }) => {
  await signInAsBrandi(page, { own: false });
  await page.goto("/rep/quotes?customer=great-basin");
  await expect(page.getByRole("heading", { name: "No quotes for Great Basin Fabrication yet" })).toBeVisible();
  await expect(page.getByText(/presses Request quote/)).toBeVisible();
  await expect(quotesTable(page)).toHaveCount(0);
  await expect(statusFilter(page)).toHaveCount(0);
  await expect(page.getByText("Viewing Great Basin Fabrication", { exact: true })).toBeVisible();
});

test("rep-only: a customer can't read the list or open the page", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
    await expect(page.getByLabel("Ask a question")).toBeVisible();
    // Fetched from the page: the session cookie is Secure, which Playwright's own client won't send over http.
    const status = (path: string, method = "GET") =>
      page.evaluate(([p, m]) => fetch(p, { method: m }).then((r) => r.status), [path, method] as const);
    expect(await status("/api/rep/quotes")).toBe(403);
    expect(await status(`/api/rep/quotes/${SAMPLE}/read`, "POST")).toBe(403);
    await page.goto("/rep/quotes");
    await expect(page).toHaveURL(/\/$/);
  } finally {
    await context.close();
  }
});

test("unread: opening a quote clears its dot and the Quotes badge", async ({ page }) => {
  await signInAsBrandi(page);
  await expect(quotesNavLink(page)).toHaveAccessibleName("Quotes 2 unread");

  // Open the sample from its number.
  await quote(page, SAMPLE).getByRole("link", { name: SAMPLE, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/rep/quotes/${SAMPLE}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");
  await expect(page.getByText("Draft ready")).toBeVisible();
  await expect(quotesNavLink(page)).toHaveAccessibleName("Quotes 1 unread");
  await expect(quotesNavLink(page)).toHaveAttribute("aria-current", "page");

  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Quotes" }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
  await page.goto(MINE);
  await expect(quote(page, SAMPLE).getByRole("rowheader")).not.toHaveText(/Unread/);
  await expect(page.getByText("Viewing All customers · 1 unread quote")).toBeVisible();

  // Anywhere on a row opens it: here, the customer's note.
  await quote(page, made.changes_requested).getByText(/Can you make the gloves/).click({ force: true });
  await expect(page).toHaveURL(new RegExp(`/rep/quotes/${made.changes_requested}$`));
  await expect(quotesNavLink(page)).toHaveAccessibleName("Quotes");
  await page.goBack();
  await expect(quote(page, made.changes_requested).getByRole("rowheader")).not.toHaveText(/Unread/);
  await expect(page.getByText("Viewing All customers", { exact: true })).toBeVisible();
});

test("phone (390px): each quote is a card, the note wraps, and nothing scrolls sideways", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsBrandi(page);
  const changes = quote(page, made.changes_requested);
  // The manager's rep and team filters sit above the list (task U1), so scroll the note into view first.
  const note = changes.getByText("Can you make the gloves 6 cases, and hold it for pickup at SLC instead?");
  await note.scrollIntoViewIfNeeded();
  await expect(note).toBeInViewport({ ratio: 1 });
  await expect(quote(page, SAMPLE).getByText("Requested Sep 23")).toBeVisible();
  await expect(quote(page, SAMPLE).getByText("32.2% margin")).toBeVisible();
  await noSidewaysScroll(page);
  await attachScreenshot(page, testInfo, "quotes-390");
  await page.goto("/rep/quotes?customer=great-basin");
  await expect(page.getByRole("heading", { name: "No quotes for Great Basin Fabrication yet" })).toBeVisible();
  await noSidewaysScroll(page);
});
