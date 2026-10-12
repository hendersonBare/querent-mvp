import { expect, test, type Page, type TestInfo } from "@playwright/test";

// The Quotes page (task 3.2, plan U3; spec §4, §5.4; frames C_QOBoard, C_QOTable): the board and the table
// with their real counts and lazy expiry, the filter panel (status, Rep, Customer, requested days, Only
// show), the page's own customer filter (?customer=), the customer's change request note behind View note,
// the quote preview and Open quote (which marks the quote read), the empty lane, and rep-only access.
// Brandi is the manager, whose list is every rep's quotes by default (task U1), so these checks narrow it
// to her own with the Rep filter (?rep=brandi) unless they say otherwise. Desktop only (decision 43).
// e2e/frames-quotes.spec.ts proves the look against the frames; this spec walks the behaviour.
//
// beforeAll resets the database to the seed pinned to the mockup's day (POST /api/test/reset),
// then POST /api/test/rep-quotes adds what the seed lacks, through the real quote services:
// a changes_requested quote (unread), a sent one, one sent 20 days ago (overdue, so Expired) and a
// quote for Mara's customer Canyon Ridge. Both hooks exist only when the server runs with
// QUERENT_E2E_RESET=1 (playwright.config.ts sets it for the server it starts).
//
// The seed also has three open aging quotes dated from the reset time (task A2, e2e/rep-aging.spec.ts):
// Q-24789 and Q-24791 sent, Q-24790 changes requested. They are read, so the unread counts hold, and
// the sample Q-24817, weeks old on the server's clock, is Overdue. The demo book (task F1) adds three
// accepted Canyon Ridge quotes Brandi covered for Mara, so her own list has 34.

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

async function signInAsBrandi(page: Page, path = MINE) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/demo");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
  if (path !== "/rep/quotes") await page.goto(path);
}
/** Brandi's own quotes: the manager's list narrowed by the Rep filter. */
const MINE = "/rep/quotes?rep=brandi";
const quotesNavLink = (page: Page) => page.getByRole("navigation", { name: "Rep portal" }).getByRole("link", { name: "Quotes", exact: true });
/** The header bell's rows (plan U2): the signed-in rep's unread quotes. */
const bellRows = (page: Page) => page.evaluate(() => fetch("/api/rep/badges").then((r) => r.json()).then((b) => b.bell.map((n: { quote_number: string }) => n.quote_number) as string[]));
const lane = (page: Page, label: string) => page.locator(`section[data-lane][aria-label="${label}"]`);
const laneCount = (page: Page, label: string) => lane(page, label).locator("[data-ui=count]");
const card = (page: Page, number: string) => page.getByRole("article", { name: number, exact: true });
const table = (page: Page) => page.getByRole("table", { name: "Quotes" });
/** One quote's row in the table. */
const row = (page: Page, number: string) => table(page).getByRole("row").filter({ has: page.getByRole("button", { name: number, exact: true }) });
/** The quote numbers the table lists, after "Show N more quotes". */
async function listed(page: Page) {
  await expect(table(page)).toBeVisible();
  const more = page.locator("[data-ui=table] [data-ui=more]");
  if (await more.count() && /more/.test(await more.textContent() ?? "")) await more.click();
  return table(page).getByRole("row").getByRole("button").filter({ hasText: /^Q-\d+$/ }).allTextContents();
}
const filterPanel = (page: Page) => page.getByRole("dialog", { name: "Filter quotes" });
async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

test("table: each quote with its number, customer, requested day, status, total and margin; lazy expiry", async ({ page }, testInfo) => {
  await signInAsBrandi(page, `${MINE}&view=table`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quotes");
  await expect(table(page).getByRole("columnheader")).toHaveText([":: Quote", ":: Customer", ":: Requested", ":: Status", ":: Total", ":: Margin"]);
  expect(await listed(page)).toHaveLength(34);

  // The sample quote: a draft totalled live, Overdue, with the gloves under Brandi's 30% PPE floor.
  await expect(row(page, SAMPLE).getByRole("cell")).toHaveText([SAMPLE, "Wasatch Mechanical Contractors", "Sep 23", "Draft readyOverdue. 1 line below floor", "$1,122.40", "32.2%"]);
  // A sent quote's total is the revision the customer saw.
  await expect(row(page, made.sent).getByRole("cell").nth(3)).toHaveText("Sent");
  // Expiry is lazy: the quote sent 20 days ago (valid 14) lists as Expired, not Sent.
  await expect(row(page, made.overdue).getByRole("cell").nth(3)).toHaveText("Expired");
  await expect(row(page, "Q-24816").getByRole("cell").nth(3)).toHaveText("Accepted");
  // Newest request first.
  const days = await page.evaluate(() => fetch("/api/rep/quotes?rep=brandi").then((r) => r.json()).then((l) => l.rows.map((r: { requested_at: string }) => r.requested_at)));
  expect(days).toEqual([...days].sort().reverse());
  await attachScreenshot(page, testInfo, "quotes-table-1920");
});

test("board: a lane per status with its count; the filter panel narrows it, kept in the URL with the page's own customer filter", async ({ page }) => {
  await signInAsBrandi(page);
  const counts = { "Draft ready": "1", "Changes requested": "2", Sent: "3", Accepted: "20", Expired: "8", Declined: "0" };
  for (const [label, count] of Object.entries(counts)) await expect(laneCount(page, label), label).toHaveText(count);
  await expect(lane(page, "Declined")).toContainText("No quotes here");

  // Only the Expired status: the board keeps its lane.
  await page.locator("header [data-ui=filter] > button").click();
  for (const label of ["Draft ready", "Changes requested", "Sent", "Accepted", "Declined"])
    await filterPanel(page).locator("label").filter({ hasText: new RegExp(`^${label}$`) }).click();
  await filterPanel(page).getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/\/rep\/quotes\?status=expired&rep=brandi$/);
  await expect(page.locator("section[data-lane]")).toHaveCount(1);
  await expect(laneCount(page, "Expired")).toHaveText("8");
  await lane(page, "Expired").locator("[data-ui=more]").click();
  await expect(card(page, made.overdue)).toBeVisible();
  await expect(page.getByRole("button", { name: "Filter, 2 applied" })).toBeVisible();

  // Needs attention is Only show Overdue and Aging (the caution dropdown replaced the view, plan U2):
  // the sample, the seed's Q-24789 and Q-24790, and this fixture's change request (asked a day ago: red at 24 h).
  const attention = ["Q-24789", "Q-24790", SAMPLE, made.changes_requested].sort();
  await page.goto(`${MINE}&only=overdue,aging&view=table`);
  expect((await listed(page)).sort()).toEqual(attention);
  // The old Needs attention link still opens that list.
  await page.goto("/rep/quotes?attention=1&rep=brandi&view=table");
  expect((await listed(page)).sort()).toEqual(attention);

  // The page's own customer filter keeps the other filters; no nav link carries it (task U1).
  await page.goto("/rep/quotes?status=ready_for_review&rep=brandi&customer=wasatch&view=table");
  expect(await listed(page)).toEqual([SAMPLE]);
  await expect(page.getByRole("combobox", { name: "Customer, Wasatch Mechanical Contractors" })).toBeVisible();
  await expect(quotesNavLink(page)).toHaveAttribute("href", "/rep/quotes");
  await page.getByRole("button", { name: "Board" }).click();
  await expect(page).toHaveURL(/\/rep\/quotes\?customer=wasatch&status=ready_for_review&rep=brandi$/);

  // A link straight to a filtered list opens filtered (newest request first: the seed's Q-24791, this fixture's, then Q-24789).
  await page.goto("/rep/quotes?status=sent&customer=wasatch&view=table");
  expect(await listed(page)).toEqual(["Q-24791", made.sent, "Q-24789"]);
  // Requested from and to: the days given, both included.
  const day = await page.evaluate((n) => fetch("/api/rep/quotes").then((r) => r.json())
    .then((l) => l.rows.find((r: { quote_number: string }) => r.quote_number === n).requested_at.slice(0, 10)), made.sent);
  await page.goto(`/rep/quotes?rep=brandi&requested_from=${day}&requested_to=${day}&view=table`);
  expect(await listed(page)).toContain(made.sent);
});

test("changes requested: View note shows the customer's note; the preview shows it too", async ({ page }) => {
  await signInAsBrandi(page);
  // Newest request first: the seed's Q-24790, then this fixture's.
  await expect(lane(page, "Changes requested").getByRole("article")).toHaveText([/^Q-24790/, new RegExp(`^${made.changes_requested}`)]);
  const changes = card(page, made.changes_requested);
  // Asked a day ago, so it is Overdue too (task A2: red at 24 h).
  await expect(changes).toContainText("Overdue");
  await changes.getByRole("button", { name: "View note" }).click();
  const note = page.getByRole("dialog", { name: `Note on ${made.changes_requested}` });
  await expect(note).toContainText('"Can you make the gloves 6 cases, and hold it for pickup at SLC instead?"');
  await expect(note).toContainText(/Dana Ortiz, [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} (AM|PM)/);
  await note.getByRole("button", { name: "Close" }).last().click();
  await expect(note).toHaveCount(0);
  await changes.getByRole("button", { name: made.changes_requested }).click();
  const sheet = page.getByRole("dialog", { name: made.changes_requested, exact: true });
  await expect(sheet).toContainText("Status: Changes requested");
  await expect(sheet).toContainText("Can you make the gloves 6 cases");
  await page.keyboard.press("Escape");
  // Only a change request carries a note.
  await expect(card(page, made.sent).getByRole("button", { name: "View note" })).toHaveCount(0);
});

test("scope: the manager's list is every rep's quotes; the Rep filter and ?customer= narrow it (task U1)", async ({ page }) => {
  await signInAsBrandi(page, "/rep/quotes");
  // No All reps switch: Mara's customer's new quote is in Brandi's list by default.
  await expect(page.getByRole("navigation", { name: "Whose quotes" })).toHaveCount(0);
  await expect(card(page, made.other_rep)).toBeVisible();
  const every = await page.evaluate(() => fetch("/api/rep/quotes").then((r) => r.json()));
  expect(every.rows.length).toBeGreaterThan(34);
  expect(every.rows.find((r: { quote_number: string }) => r.quote_number === made.other_rep).rep_name).toBe("Mara Jensen");

  // Her own quotes: the Rep filter in the panel.
  await page.locator("header [data-ui=filter] > button").click();
  await filterPanel(page).getByRole("button", { name: "Rep: All reps" }).click();
  await filterPanel(page).getByRole("option", { name: "Brandi Gallegos" }).click();
  await filterPanel(page).getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/\/rep\/quotes\?rep=brandi$/);
  await expect(card(page, made.other_rep)).toHaveCount(0);

  // Mara's customer: every rep's Canyon Ridge quotes, or with the Rep filter only the three Brandi covered (task F1).
  await page.goto("/rep/quotes?customer=canyon-ridge&view=table");
  expect(await listed(page)).toContain(made.other_rep);
  await page.goto("/rep/quotes?rep=brandi&customer=canyon-ridge&view=table");
  expect(await listed(page)).toHaveLength(3);
  for (const quote of await table(page).getByRole("row").filter({ has: page.getByRole("cell") }).all())
    await expect(quote.getByRole("cell").nth(3)).toHaveText("Accepted");
  // ?scope=all changes nothing.
  await page.goto("/rep/quotes?scope=all&view=table");
  expect(await listed(page)).toHaveLength(every.rows.length);

  // Brandi is the manager: opening another rep's quote shows it read-only (task D2;
  // e2e/rep-reassign.spec.ts covers it, and another rep's not-found).
  await page.goto(`/rep/quotes/${made.other_rep}`);
  await expect(page.getByRole("region", { name: "Read only" })).toContainText("Mara Jensen’s quote");
});

test("empty: a placeholder customer has no quotes yet, and every lane says so", async ({ page }) => {
  await signInAsBrandi(page, "/rep/quotes?customer=great-basin");
  await expect(page.getByRole("combobox", { name: "Customer, Great Basin Fabrication" })).toBeVisible();
  await expect(page.locator("section[data-lane] [data-ui=count]")).toHaveText(["0", "0", "0", "0", "0", "0"]);
  await expect(page.locator("section[data-lane]").getByText("No quotes here")).toHaveCount(6);
  await page.goto("/rep/quotes?customer=great-basin&view=table");
  await expect(table(page)).toContainText("No quotes here");
});

test("rep-only: a customer can't read the list or open the page", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/demo");
    await page.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
    await expect(page.getByLabel("Ask a question")).toBeVisible();
    // Fetched from the page: the session cookie is Secure, which Playwright's own client won't send over http.
    const status = (path: string, method = "GET") =>
      page.evaluate(([p, m]) => fetch(p, { method: m }).then((r) => r.status), [path, method] as const);
    expect(await status("/api/rep/quotes")).toBe(403);
    expect(await status(`/api/rep/quotes/${SAMPLE}/read`, "POST")).toBe(403);
    expect(await status(`/api/rep/quotes/${SAMPLE}/reply`, "POST")).toBe(403);
    await page.goto("/rep/quotes");
    await expect(page).toHaveURL(/\/$/);
  } finally {
    await context.close();
  }
});

test("unread: opening a quote from the preview clears its row in the bell", async ({ page }) => {
  await signInAsBrandi(page);
  expect((await bellRows(page)).sort()).toEqual([made.changes_requested, SAMPLE].sort());

  // The preview never marks a quote read; Open quote does.
  await card(page, SAMPLE).getByRole("button", { name: SAMPLE }).click();
  const sheet = page.getByRole("dialog", { name: SAMPLE, exact: true });
  await expect(sheet).toBeVisible();
  expect((await bellRows(page)).sort()).toEqual([made.changes_requested, SAMPLE].sort());
  await sheet.getByRole("link", { name: "Open quote" }).click();
  await expect(page).toHaveURL(new RegExp(`/rep/quotes/${SAMPLE}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");
  await expect.poll(() => bellRows(page)).toEqual([made.changes_requested]);
  await expect(quotesNavLink(page)).toHaveAttribute("aria-current", "page");

  // From the table: a click anywhere on the row opens the preview.
  await page.goto(`${MINE}&view=table`);
  await listed(page);
  await row(page, made.changes_requested).getByRole("cell").nth(1).click();
  await page.getByRole("dialog", { name: made.changes_requested, exact: true }).getByRole("link", { name: "Open quote" }).click();
  await expect(page).toHaveURL(new RegExp(`/rep/quotes/${made.changes_requested}$`));
  await expect.poll(() => bellRows(page)).toEqual([]);
});

test("reply: the rep replies from the preview and the customer sees it in the Querent box; another rep's quote has no reply controls (decisions 22, 63)", async ({ page, browser, baseURL }) => {
  await signInAsBrandi(page);
  await card(page, made.changes_requested).getByRole("button", { name: made.changes_requested }).click();
  const sheet = page.getByRole("dialog", { name: made.changes_requested, exact: true });
  await sheet.getByRole("button", { name: "Reply to Dana" }).click();
  const note = page.getByRole("dialog", { name: `Note on ${made.changes_requested}` });
  await note.getByRole("textbox", { name: "Reply to Dana" }).fill("Six cases is fine. We will hold it at SLC.");
  const posted = page.waitForResponse((r) => r.url().endsWith(`/api/rep/quotes/${made.changes_requested}/reply`));
  await note.getByRole("button", { name: "Send reply" }).click();
  expect((await posted).status()).toBe(201);
  await expect(note).toHaveCount(0);

  // Dana, in a new browser (a new conversation), sees it in the box while the change request is open.
  const customer = await browser.newContext({ baseURL, viewport: { width: 1920, height: 1080 } });
  try {
    await customer.addCookies([{ name: "querent-persona", value: "customer", url: String(baseURL) }]);
    const box = await customer.newPage();
    await box.goto("/");
    const reply = box.getByRole("article", { name: `Brandi Gallegos replied about ${made.changes_requested}` });
    await expect(reply).toBeVisible();
    await expect(reply).toContainText("Six cases is fine. We will hold it at SLC.");
  } finally {
    await customer.close();
  }

  // The manager reads Mara's change request read-only: the note, no reply box, no Send reply, no Reply in the preview.
  const theirs = await page.evaluate(() => fetch("/api/rep/quotes?rep=mara&status=changes_requested").then((r) => r.json())
    .then((l) => l.rows.map((r: { quote_number: string }) => r.quote_number) as string[]));
  expect(theirs.length).toBeGreaterThan(0);
  await page.goto("/rep/quotes?rep=mara&status=changes_requested");
  await card(page, theirs[0]).getByRole("button", { name: "View note" }).click();
  const read = page.getByRole("dialog", { name: `Note on ${theirs[0]}` });
  await expect(read).toBeVisible();
  await expect(read.getByRole("textbox")).toHaveCount(0);
  await expect(read.getByRole("button", { name: "Send reply" })).toHaveCount(0);
  await read.getByRole("button", { name: "Close" }).last().click();
  await card(page, theirs[0]).getByRole("button", { name: theirs[0] }).click();
  const preview = page.getByRole("dialog", { name: theirs[0], exact: true });
  await expect(preview.getByRole("link", { name: "Open quote" })).toBeVisible();
  await expect(preview.getByRole("button", { name: /^Reply to/ })).toHaveCount(0);
});
