import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

// The rep's quote detail (task 3.3; spec §4, §5.1, §5.2, §5.4; docs/design/screens/03-04, 08):
// the header, the request and "things to check" panels, the line grid (price-basis dropdown with
// Querent's pick in bold, the red below-floor warning above the price field, "Why this price?"),
// add / remove / Undo with autosave, totals and the summary card, read-only states, and the
// rep-only API. The seeded sample Q-24817 prices to $1,122.40 with the 1.1 engine (the mockup's
// $1,109.50 used older prices).
//
// Before each test the database is reset to the seed pinned to the mockup's day
// (POST /api/test/reset), and POST /api/test/rep-quotes adds a sent, a changes_requested and an
// expired quote. Both hooks exist only with QUERENT_E2E_RESET=1 (playwright.config.ts sets it).

const SEED_DATE = "2026-09-23";
const SAMPLE = "Q-24817";
let made: { changes_requested: string; sent: string; overdue: string; other_rep: string };

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ playwright }, testInfo) => {
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const reset = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(reset.status(), "start the server with QUERENT_E2E_RESET=1").toBe(200);
    const fixture = await api.post("/api/test/rep-quotes");
    expect(fixture.status()).toBe(200);
    made = await fixture.json();
  } finally {
    await api.dispose();
  }
});

async function openQuote(page: Page, number = SAMPLE, query = "") {
  await page.goto("/");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
  await page.goto(`/rep/quotes/${number}${query}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");
}
const line = (page: Page, sku: string) => page.getByRole("rowheader", { name: new RegExp(sku) }).locator("xpath=ancestor::tbody[1]");
const price = (page: Page, sku: string) => page.getByRole("textbox", { name: `Unit price for ${sku}` });
const qty = (page: Page, sku: string) => page.getByRole("textbox", { name: `Quantity for ${sku}` });
const total = (row: Locator) => row.getByRole("cell").nth(5);
const totals = (page: Page) => page.getByLabel("Quote totals");
const summary = (page: Page) => page.getByRole("region", { name: "Quote summary" });
const saved = (page: Page) => expect(page.getByText("All changes saved")).toBeVisible();
async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}
async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}
/** Calls the API from the page, so the (Secure) session cookie goes with it. */
const api = (page: Page, path: string, method = "GET", body?: unknown) =>
  page.evaluate(
    async ([p, m, b]) => {
      const response = await fetch(p, { method: m, headers: { "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    [path, method, body] as const,
  );

test("screen 03 at 1440px: header, panels, line grid, totals and summary card", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1057 });
  await openQuote(page, SAMPLE, "?customer=wasatch");
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs).toHaveText(/Quotes\s*\/\s*Q-24817\s*Sample data/);
  await expect(crumbs.getByRole("link", { name: "Quotes" })).toHaveAttribute("href", "/rep/quotes?customer=wasatch");
  await expect(page.getByText("Draft ready")).toBeVisible();
  await expect(page.getByText(/^Q-24817 · Dana Ortiz, Purchasing · Requested Wed Sep 23, 10:14 AM · Valid until /)).toBeVisible();
  for (const name of ["Save draft", "Export", "More actions", "Approve & send"]) await expect(page.getByRole("button", { name })).toBeVisible();

  await expect(page.getByText("Customer request")).toBeVisible();
  const checks = page.getByRole("region", { name: "2 things to check before sending" });
  await expect(checks.getByRole("listitem")).toHaveText([
    /^Margin\s*Nitrile disposable gloves: 26\.6% margin, below Brandi's 30% Safety & PPE floor/,
    /^Stock\s*Ratchet strap 2 in x 27 ft: short 5 at SLC\. 20 at Ogden\. 24 on order at SLC, due Sep 2\d/,
  ]);

  await expect(page.getByRole("columnheader")).toHaveText(["Why this price?", "Item", "Qty", "Available", "Unit price", "Margin", "Total", "Remove"]);
  const expected: [string, string, string, string, string][] = [
    ["HCS-12-13-2G8", "10", "31.50", "Last paid", "$315.00"],
    ["CW-45-045-T1", "6", "36.00", "Contract", "$216.00"],
    ["GLV-N8-L-1000", "4", "79.00", "Last paid", "$316.00"],
    ["RS-2-27-JH", "12", "22.95", "Customer", "$275.40"],
  ];
  for (const [sku, q, p, basis, t] of expected) {
    await expect(qty(page, sku)).toHaveValue(q);
    await expect(price(page, sku)).toHaveValue(p);
    await expect(page.getByRole("button", { name: `Price basis for ${sku}: ${basis}` })).toBeVisible();
    await expect(total(line(page, sku))).toHaveText(t);
  }
  await expect(line(page, "RS-2-27-JH").getByRole("cell").nth(2)).toHaveText(/7 at SLC\s*Short 5/);
  // The one line under its floor carries the warning.
  await expect(page.getByRole("note")).toHaveCount(1);
  await expect(line(page, "GLV-N8-L-1000").getByRole("note")).toHaveText("Below Brandi's 30% Safety & PPE floor");

  await expect(totals(page)).toHaveText(/Items\s*\$1,122\.40\s*Freight \(will call\)\s*\$0\.00\s*Sales tax\s*Added on invoice\s*Quote total\s*\$1,122\.40/);
  await expect(summary(page)).toContainText("$1,122.40Quote total, before tax");
  await expect(summary(page)).toContainText("$361.40Gross profit");
  await expect(summary(page)).toContainText("32.2%Margin");
  await expect(summary(page)).toContainText("Bar shows quote margin. Marker is the 23.8% blended floor.");
  await expect(summary(page)).toContainText("Querent found +$11.50 GP");
  await noSidewaysScroll(page);
  await attachScreenshot(page, testInfo, "quote-detail-1440");

  // Screen 04: Show cost adds the Cost column.
  await page.getByRole("switch", { name: "Show cost" }).check();
  await expect(page.getByRole("columnheader", { name: "Cost" })).toBeVisible();
  await expect(line(page, "HCS-12-13-2G8").getByRole("cell").nth(3)).toHaveText("$21.40");
  await attachScreenshot(page, testInfo, "quote-detail-1440-show-cost");
});

test("the price-basis dropdown lists every basis with its $ value and Querent's pick in bold; switching autosaves", async ({ page }) => {
  await openQuote(page);
  const basis = page.getByRole("button", { name: "Price basis for GLV-N8-L-1000: Last paid" });
  await basis.click();
  const options = page.getByRole("listbox", { name: "Price basis for GLV-N8-L-1000" }).getByRole("option");
  await expect(options).toHaveText(["Contract—", "Customer$77.50", "List$94.00", /^Last paid\s*Querent’s pick\s*Paid Sep 9\s*\$79\.00$/, "CustomType a price"]);
  await expect(options.nth(0)).toHaveAttribute("aria-disabled", "true");
  await expect(options.nth(3).locator("strong")).toHaveText(["Last paid", "$79.00"]);
  await expect(options.nth(2).locator("strong")).toHaveCount(0);
  // List clears the gloves' floor: the warning goes, the total and summary follow.
  await options.nth(2).click();
  await expect(price(page, "GLV-N8-L-1000")).toHaveValue("94.00");
  await expect(total(line(page, "GLV-N8-L-1000"))).toHaveText("$376.00");
  await expect(page.getByRole("note")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "1 thing to check before sending" })).toBeVisible();
  await expect(summary(page)).toContainText("$1,182.40");
  await saved(page);
  await page.reload();
  await expect(page.getByRole("button", { name: "Price basis for GLV-N8-L-1000: List" })).toBeVisible();
  await expect(totals(page)).toContainText("$1,182.40");
});

test("a typed below-floor price warns directly above its field, live, and never blocks", async ({ page }) => {
  await openQuote(page);
  const bolts = price(page, "HCS-12-13-2G8");
  await bolts.fill("22");
  // Live while typing, before the save.
  const warning = line(page, "HCS-12-13-2G8").getByRole("note");
  await expect(warning).toHaveText("Below Brandi's 20% Fasteners floor");
  await expect(page.getByRole("textbox", { name: "Margin for HCS-12-13-2G8" })).toHaveValue("2.7");
  await bolts.press("Enter");
  await expect(bolts).toHaveValue("22.00");
  const w = (await warning.boundingBox())!;
  const p = (await bolts.boundingBox())!;
  expect(w.y + w.height).toBeLessThanOrEqual(p.y);
  expect(p.y - (w.y + w.height)).toBeLessThan(16);
  await expect(page.getByRole("button", { name: "Price basis for HCS-12-13-2G8: Custom" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve & send" })).toBeEnabled();
  await saved(page);
  // The margin field sets a price too: 30% on $21.40 is $30.57, above the floor again.
  const margin = page.getByRole("textbox", { name: "Margin for HCS-12-13-2G8" });
  await margin.fill("30");
  await margin.press("Tab");
  await expect(bolts).toHaveValue("30.57");
  await expect(warning).toHaveCount(0);
});

test('"Why this price?" opens per line with Querent\'s explanation, the options and stock', async ({ page }) => {
  await openQuote(page);
  const toggle = page.getByRole("button", { name: "Why this price? Hex cap screw 1/2-13 x 2 in" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const why = page.locator(`#${await toggle.getAttribute("aria-controls")}`);
  await expect(why).toContainText("Last paid $31.50 on Aug 12, above customer price $30.95. +$5.50 GP vs customer price.");
  await expect(why).toContainText("Brandi’s 20% Fasteners floor");
  await expect(why).toContainText("What Dana asked for“1/2 in grade 8 hex bolts, 10 boxes”");
  await why.getByRole("button", { name: "Use Customer for HCS-12-13-2G8" }).click();
  await expect(price(page, "HCS-12-13-2G8")).toHaveValue("30.95");
  await expect(why).toContainText("You priced it at Customer, $30.95.");
  await toggle.click();
  await expect(why).toBeHidden();
});

test("add an item by SKU, change its qty, remove a line, and Undo each, all autosaved", async ({ page }) => {
  await openQuote(page);
  const box = page.getByRole("combobox", { name: "Add item by SKU or name" });
  await box.fill("FD-45-60Z");
  const results = page.getByRole("listbox", { name: "Matching items" });
  await expect(results.getByRole("option").first()).toContainText("FD-45-60Z");
  await box.press("Enter");
  await expect(qty(page, "FD-45-60Z")).toBeFocused();
  await expect(line(page, "FD-45-60Z").getByRole("rowheader")).toContainText("Added");
  await expect(page.getByText("5 items")).toBeVisible();
  await page.keyboard.type("4");
  await page.keyboard.press("Enter");
  await saved(page);
  const discs = Number((await price(page, "FD-45-60Z").inputValue()));
  await expect(total(line(page, "FD-45-60Z"))).toHaveText(`$${(discs * 4).toFixed(2)}`);

  await page.getByRole("button", { name: "Remove Ratchet strap 2 in x 27 ft" }).click();
  await expect(page.getByRole("rowheader", { name: /RS-2-27-JH/ })).toHaveCount(0);
  await expect(page.getByText("Removed Ratchet strap 2 in x 27 ft")).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(page.getByRole("rowheader", { name: /RS-2-27-JH/ })).toHaveCount(0);
  await expect(page.getByRole("rowheader", { name: /FD-45-60Z/ })).toBeVisible();

  // Undo takes back the most recent edit: the gloves come back in their place, before the discs.
  await page.getByRole("button", { name: "Remove Nitrile disposable gloves" }).click();
  await expect(page.getByRole("rowheader", { name: /GLV-N8-L-1000/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("rowheader")).toHaveText([/HCS-12-13-2G8/, /CW-45-045-T1/, /GLV-N8-L-1000/, /FD-45-60Z/]);
  await saved(page);
  await page.reload();
  await expect(page.getByRole("rowheader", { name: /GLV-N8-L-1000/ })).toBeVisible();
  await expect(line(page, "GLV-N8-L-1000").getByRole("note")).toHaveText("Below Brandi's 30% Safety & PPE floor");
});

test("a qty below a full case re-picks list, and Undo puts the qty and price back", async ({ page }) => {
  await openQuote(page);
  const bolts = qty(page, "HCS-12-13-2G8");
  await bolts.fill("5");
  await bolts.press("Enter");
  // 5 boxes is a broken case (10 to a case): Querent's pick moves to list and the line follows it.
  await expect(price(page, "HCS-12-13-2G8")).toHaveValue("38.95");
  await expect(page.getByRole("button", { name: "Price basis for HCS-12-13-2G8: List" })).toBeVisible();
  await saved(page);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(bolts).toHaveValue("10");
  await expect(price(page, "HCS-12-13-2G8")).toHaveValue("31.50");
  await saved(page);
  await page.reload();
  await expect(price(page, "HCS-12-13-2G8")).toHaveValue("31.50");
});

test("sent, accepted and expired quotes are read-only; changes_requested is editable (spec §5.4)", async ({ page }) => {
  await openQuote(page, made.sent);
  await expect(page.getByText("Sent", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Sent to Dana as rev 1 on /)).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Add item by SKU or name" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /^Unit price for / }).first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Approve & send" })).toBeDisabled();

  await page.goto(`/rep/quotes/${made.overdue}`);
  await expect(page.getByText("Expired", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Unit price for / }).first()).toBeDisabled();

  await page.goto("/rep/quotes/Q-24816");
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Dana accepted rev 1/)).toBeVisible();

  // A direct API call can't edit them either (the repository doesn't check status).
  const accepted = await api(page, "/api/rep/quotes/Q-24816");
  const acceptedLine = accepted.body.lines[0].id;
  const refused = await api(page, `/api/rep/quotes/Q-24816/lines/${acceptedLine}`, "PATCH", { unitPrice: 0.01 });
  expect(refused).toEqual({ status: 409, body: { code: "illegal_transition", detail: "Q-24816 was accepted, so it can't be edited. Duplicate it to quote again." } });
  expect((await api(page, `/api/rep/quotes/Q-24816/lines/${acceptedLine}`, "DELETE")).status).toBe(409);
  expect((await api(page, "/api/rep/quotes/Q-24816/lines", "POST", { itemId: "FD-45-60Z" })).status).toBe(409);
  const sent = await api(page, `/api/rep/quotes/${made.sent}`);
  expect((await api(page, `/api/rep/quotes/${made.sent}/lines/${sent.body.lines[0].id}`, "PATCH", { qty: 1 })).status).toBe(409);
  expect((await api(page, "/api/rep/quotes/Q-24816")).body.lines[0].unit_price).toBe(accepted.body.lines[0].unit_price);

  // Changes requested: the rep revises it, with Dana's note on top.
  await page.goto(`/rep/quotes/${made.changes_requested}`);
  await expect(page.getByText("Can you make the gloves 6 cases, and hold it for pickup at SLC instead?")).toBeVisible();
  const first = page.getByRole("textbox", { name: /^Quantity for / }).first();
  await expect(first).toBeEnabled();
  await first.fill("6");
  await first.press("Enter");
  await saved(page);
  await page.reload();
  await expect(page.getByRole("textbox", { name: /^Quantity for / }).first()).toHaveValue("6");
});

test("rep-only: customers get 403, another rep's quote is not found, and prices are validated server-side", async ({ page, browser, baseURL }) => {
  await openQuote(page);
  for (const body of [{ unitPrice: -1 }, { unitPrice: 12.345 }, { qty: 2.5 }, { basis: "contract" }]) {
    const response = await api(page, "/api/rep/quotes/Q-24817/lines/q-24817-1", "PATCH", body);
    expect(response.status).toBe(400);
  }
  expect((await api(page, `/api/rep/quotes/${made.other_rep}`)).status).toBe(404);
  await page.goto(`/rep/quotes/${made.other_rep}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quote not found");

  const context = await browser.newContext({ baseURL });
  try {
    const dana = await context.newPage();
    await dana.goto("/");
    await dana.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
    await expect(dana.getByLabel("Ask a question")).toBeVisible();
    expect((await api(dana, "/api/rep/quotes/Q-24817")).status).toBe(403);
    expect((await api(dana, "/api/rep/quotes/Q-24817/lines/q-24817-1", "PATCH", { unitPrice: 1 })).status).toBe(403);
    expect((await api(dana, "/api/rep/quotes/Q-24817/items?q=strap")).status).toBe(403);
    await dana.goto("/rep/quotes/Q-24817");
    await expect(dana).toHaveURL(/\/$/);
  } finally {
    await context.close();
  }
  expect((await api(page, "/api/rep/quotes/Q-24817")).body.lines[0].unit_price).toBe(31.5);
});

test("phone (390px, screen 08): lines stack as cards, prices stay editable, nothing scrolls sideways", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openQuote(page);
  await expect(qty(page, "HCS-12-13-2G8")).toBeInViewport();
  await noSidewaysScroll(page);
  await attachScreenshot(page, testInfo, "quote-detail-390");
  const gloves = price(page, "GLV-N8-L-1000");
  await gloves.scrollIntoViewIfNeeded();
  await expect(gloves).toBeInViewport();
  const warning = line(page, "GLV-N8-L-1000").getByRole("note");
  const w = (await warning.boundingBox())!;
  const p = (await gloves.boundingBox())!;
  expect(w.y + w.height).toBeLessThanOrEqual(p.y);
  await page.getByRole("button", { name: "Price basis for GLV-N8-L-1000: Last paid" }).click();
  const list = page.getByRole("listbox", { name: "Price basis for GLV-N8-L-1000" });
  await expect(list).toBeInViewport();
  const box = (await list.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await list.getByRole("option", { name: /^List/ }).click();
  await expect(gloves).toHaveValue("94.00");
  await noSidewaysScroll(page);
  await expect(summary(page)).toContainText("$1,182.40");
});
