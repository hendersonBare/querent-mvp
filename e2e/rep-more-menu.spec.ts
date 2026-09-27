import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

// The quote detail's ⋯ menu (task 3.5; spec §4, §5.4; docs/design/screens/06 without "Reassign
// to another rep"): Duplicate quote makes a new ready_for_review quote and opens it (keeping
// ?customer=), Reset sample quote restores Q-24817 to its seed state, and Open customer in ERP
// is disabled with the tooltip "Available after ERP integration".
//
// Before each test the database is reset to the seed pinned to the mockup's day
// (POST /api/test/reset), and POST /api/test/rep-quotes adds a sent, a changes_requested, an
// expired and another rep's quote. Both hooks exist only with QUERENT_E2E_RESET=1
// (playwright.config.ts sets it).

const SEED_DATE = "2026-09-23";
const SAMPLE = "Q-24817";
const ERP_TOOLTIP = "Available after ERP integration";
/** The seeded sample's lines: SKU and unit price (the 1.1 engine's prices, task 3.3). */
const SEEDED_LINES: [string, string][] = [
  ["HCS-12-13-2G8", "31.50"],
  ["CW-45-045-T1", "36.00"],
  ["GLV-N8-L-1000", "79.00"],
  ["RS-2-27-JH", "22.95"],
];
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

async function openQuote(page: Page, number = SAMPLE, query = "?customer=wasatch") {
  await page.goto("/");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
  await page.goto(`/rep/quotes/${number}${query}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");
}
const moreButton = (page: Page) => page.getByRole("button", { name: "More actions" });
async function openMenu(page: Page) {
  await moreButton(page).click();
  const menu = page.getByRole("menu", { name: "More actions" });
  await expect(menu).toBeVisible();
  return menu;
}
const price = (page: Page, sku: string) => page.getByRole("textbox", { name: `Unit price for ${sku}` });
const saved = (page: Page) => expect(page.getByText("All changes saved")).toBeVisible();
const quotesNav = (page: Page) => page.getByRole("navigation", { name: "Rep portal" }).getByRole("link", { name: /^Quotes\b/ });
/** Calls the API from the page, so the (Secure) session cookie goes with it. */
const api = (page: Page, path: string, method = "GET", headers: Record<string, string> = {}) =>
  page.evaluate(
    async ([p, m, h]) => {
      const response = await fetch(p, { method: m, headers: h });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    [path, method, headers] as const,
  );
const quoteNumbers = async (page: Page) =>
  ((await api(page, "/api/rep/quotes")).body.rows as { quote_number: string }[]).map((r) => r.quote_number);
const badge = async (page: Page) => (await api(page, "/api/rep/badges")).body.quotes as number;
async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}
/** Saves a screenshot in the test's output folder and attaches it to the report. */
async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}
/** Waits for the copy of `from` to open (keeping ?customer=wasatch) and returns its number. */
async function copyOpened(page: Page, from: string) {
  await page.waitForURL((url) => /^\/rep\/quotes\/Q-\d+$/.test(url.pathname) && !url.pathname.endsWith(`/${from}`) && url.search === "?customer=wasatch");
  return page.url().match(/Q-\d+/)![0];
}
async function inViewport(page: Page, locator: Locator) {
  const box = (await locator.boundingBox())!;
  const width = page.viewportSize()!.width;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
}

test("screen 06 at 1440px: Duplicate, Open customer in ERP (disabled, with its tooltip) and Reset sample; no Reassign", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openQuote(page);
  const menu = await openMenu(page);
  await expect(menu.getByRole("menuitem")).toHaveText(["Duplicate quote", "Open customer in ERP", "Reset sample quote"]);
  await expect(menu.getByText(/Reassign/)).toHaveCount(0);
  await expect(menu.getByRole("separator")).toHaveCount(1);
  await expect(menu.getByRole("menuitem", { name: "Duplicate quote" })).toBeFocused();
  await screenshot(page, testInfo, "more-menu-1440");

  const erp = menu.getByRole("menuitem", { name: "Open customer in ERP" });
  await expect(erp).toHaveAttribute("aria-disabled", "true");
  await expect(erp).toHaveAccessibleDescription(ERP_TOOLTIP);
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeHidden();
  await erp.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText(ERP_TOOLTIP);
  await inViewport(page, tooltip);
  await screenshot(page, testInfo, "more-menu-1440-erp-tooltip");

  // Choosing it does nothing: no request, same page, the menu stays open.
  const posts: string[] = [];
  page.on("request", (r) => r.method() === "POST" && posts.push(r.url()));
  // force: Playwright won't click an aria-disabled item, but a person can.
  await erp.click({ force: true });
  await expect(menu).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/rep/quotes/${SAMPLE}\\?customer=wasatch$`));
  expect(posts).toEqual([]);

  // Keyboard: the arrow keys reach it, and focus shows the tooltip.
  await page.mouse.move(0, 0);
  await menu.getByRole("menuitem", { name: "Duplicate quote" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(erp).toBeFocused();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(moreButton(page)).toBeFocused();
});

test("Duplicate creates a new ready_for_review quote from the latest draft, opens it keeping ?customer=, and lists it", async ({ page }, testInfo) => {
  await openQuote(page);
  const unread = await badge(page);
  // An edit still saving when Duplicate is chosen is in the copy.
  await price(page, "HCS-12-13-2G8").fill("33.00");
  await price(page, "HCS-12-13-2G8").press("Tab");
  const before = await quoteNumbers(page);

  await (await openMenu(page)).getByRole("menuitem", { name: "Duplicate quote" }).click();
  const copy = await copyOpened(page, SAMPLE);
  expect(before).not.toContain(copy);
  await expect(page.getByText(`Duplicated ${SAMPLE} as ${copy}`)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");
  await expect(page.getByText("Draft ready")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText(new RegExp(`Quotes\\s*/\\s*${copy}$`));
  await screenshot(page, testInfo, "more-menu-duplicated");
  // Copied as-is: the draft's prices, lines and request, not re-priced.
  await expect(price(page, "HCS-12-13-2G8")).toHaveValue("33.00");
  await expect(page.getByRole("rowheader")).toHaveText(SEEDED_LINES.map(([sku]) => new RegExp(sku)));
  // Only the sample can be reset.
  await expect((await openMenu(page)).getByRole("menuitem")).toHaveText(["Duplicate quote", "Open customer in ERP"]);
  await page.keyboard.press("Escape");

  // The rep made it, so the badge doesn't move, and it is in their Quotes list.
  expect(await badge(page)).toBe(unread);
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Quotes" }).click();
  await expect(page).toHaveURL(/\/rep\/quotes\?customer=wasatch$/);
  const row = page.getByRole("table").getByRole("rowgroup").filter({ has: page.getByRole("link", { name: copy, exact: true }) });
  await expect(row).toContainText("Draft ready");
  await expect(row.getByRole("rowheader")).not.toHaveText(/^Unread: /);
});

test("Duplicate works in any status: an expired quote becomes a new editable draft", async ({ page }) => {
  await openQuote(page, made.overdue);
  await expect(page.getByText("Expired", { exact: true })).toBeVisible();
  await (await openMenu(page)).getByRole("menuitem", { name: "Duplicate quote" }).click();
  const copy = await copyOpened(page, made.overdue);
  await expect(page.getByText(`Duplicated ${made.overdue} as ${copy}`)).toBeVisible();
  await expect(page.getByText("Draft ready")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve & send" })).toBeEnabled();
  await expect(page.getByRole("combobox", { name: "Add item by SKU or name" })).toBeVisible();
});

test("a double click, or choosing Duplicate again while it runs, makes one copy", async ({ page }) => {
  await openQuote(page);
  const before = (await quoteNumbers(page)).length;
  const duplicates: string[] = [];
  page.on("request", (r) => r.url().endsWith("/duplicate") && duplicates.push(r.headers()["idempotency-key"]));
  // Hold the answer, so the second choice lands while the first is still running.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/rep/quotes/*/duplicate", async (route) => {
    await held;
    await route.continue();
  });

  await (await openMenu(page)).getByRole("menuitem", { name: "Duplicate quote" }).dblclick();
  await expect(page.getByText(`Duplicating ${SAMPLE}…`)).toBeVisible();
  const busy = (await openMenu(page)).getByRole("menuitem", { name: "Duplicating…" });
  await expect(busy).toHaveAttribute("aria-disabled", "true");
  await busy.click({ force: true });
  release();
  const copy = await copyOpened(page, SAMPLE);
  expect(duplicates).toHaveLength(1);
  expect(await quoteNumbers(page)).toHaveLength(before + 1);

  // The server replays a repeated Idempotency-Key (a retried request) instead of copying again.
  const key = { "idempotency-key": "e2e-retry-1" };
  const first = await api(page, `/api/rep/quotes/${copy}/duplicate`, "POST", key);
  const again = await api(page, `/api/rep/quotes/${copy}/duplicate`, "POST", key);
  expect(first.status).toBe(201);
  expect(again).toEqual({ status: 201, body: { ...first.body, replayed: true } });
  expect(await quoteNumbers(page)).toHaveLength(before + 2);
});

test("Reset sample quote restores the seed state after edits, keeps other quotes working, and the badge stays right", async ({ page }, testInfo) => {
  await openQuote(page);
  // A copy of the sample, made before the reset: it shares the sample's chat.
  await (await openMenu(page)).getByRole("menuitem", { name: "Duplicate quote" }).click();
  const copy = await copyOpened(page, SAMPLE);

  await page.goto(`/rep/quotes/${SAMPLE}?customer=wasatch`);
  await expect(page.getByText("Draft ready")).toBeVisible();
  // Edit: a below-floor price, a removed line and an added one.
  await price(page, "HCS-12-13-2G8").fill("22.00");
  await price(page, "HCS-12-13-2G8").press("Tab");
  await page.getByRole("button", { name: "Remove Ratchet strap 2 in x 27 ft" }).click();
  const box = page.getByRole("combobox", { name: "Add item by SKU or name" });
  await box.fill("FD-45-60Z");
  await expect(page.getByRole("listbox", { name: "Matching items" }).getByRole("option").first()).toContainText("FD-45-60Z");
  await box.press("Enter");
  await saved(page);
  await page.reload();
  await expect(page.getByRole("rowheader")).toHaveText([/HCS-12-13-2G8/, /CW-45-045-T1/, /GLV-N8-L-1000/, /FD-45-60Z/]);
  await expect(price(page, "HCS-12-13-2G8")).toHaveValue("22.00");
  // On screen, so read: the badge counts the other unread quotes only.
  await expect.poll(() => api(page, "/api/rep/quotes").then((r) => r.body.rows.find((q: { quote_number: string }) => q.quote_number === SAMPLE).unread)).toBe(false);
  const unread = await badge(page);

  await (await openMenu(page)).getByRole("menuitem", { name: "Reset sample quote" }).click();
  await expect(page.getByText("Sample quote reset")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/rep/quotes/${SAMPLE}\\?customer=wasatch$`));
  await expect(page.getByRole("rowheader")).toHaveText(SEEDED_LINES.map(([sku]) => new RegExp(sku)));
  for (const [sku, value] of SEEDED_LINES) await expect(price(page, sku)).toHaveValue(value);
  await expect(page.getByLabel("Quote totals")).toContainText("$1,122.40");
  await expect(page.getByText("Draft ready")).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "2 things to check before sending" })).toBeVisible();
  await screenshot(page, testInfo, "more-menu-reset");
  // The server has the seed too.
  const detail = (await api(page, `/api/rep/quotes/${SAMPLE}`)).body;
  expect(detail.lines.map((l: { sku: string; unit_price: number }) => [l.sku, l.unit_price.toFixed(2)])).toEqual(SEEDED_LINES);
  // The reset sample is unread again, as seeded, and the page on screen reads it: the badge
  // and the list agree, and end where they were.
  await expect.poll(() => badge(page)).toBe(unread);
  await expect(quotesNav(page)).toHaveAccessibleName(unread ? `Quotes ${unread} unread` : "Quotes");
  const list = (await api(page, "/api/rep/quotes")).body;
  expect(list.unread).toBe(await badge(page));

  // The copy and the other quotes still open, unchanged.
  for (const number of [copy, made.changes_requested, made.sent]) {
    await page.goto(`/rep/quotes/${number}?customer=wasatch`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(number);
  }
  await page.goto(`/rep/quotes/${copy}?customer=wasatch`);
  await expect(page.getByRole("rowheader")).toHaveText(SEEDED_LINES.map(([sku]) => new RegExp(sku)));
});

test("phone (390px): the open menu fits the screen, and a tap on Open customer in ERP shows why it is disabled", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openQuote(page);
  const menu = await openMenu(page);
  await expect(menu.getByRole("menuitem")).toHaveText(["Duplicate quote", "Open customer in ERP", "Reset sample quote"]);
  await inViewport(page, menu);
  await noSidewaysScroll(page);
  await screenshot(page, testInfo, "more-menu-390");
  await menu.getByRole("menuitem", { name: "Open customer in ERP" }).click({ force: true });
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText(ERP_TOOLTIP);
  await inViewport(page, tooltip);
  await noSidewaysScroll(page);
  await screenshot(page, testInfo, "more-menu-390-erp-tooltip");
});

test("rep-only: visitors 401, customers 403, another rep's quote 404, and only the sample resets (409)", async ({ page, browser, baseURL, playwright }) => {
  await openQuote(page);
  const before = await quoteNumbers(page);
  expect((await api(page, `/api/rep/quotes/${made.other_rep}/duplicate`, "POST")).status).toBe(404);
  expect((await api(page, `/api/rep/quotes/${made.other_rep}/reset`, "POST")).status).toBe(404);
  const refused = await api(page, `/api/rep/quotes/${made.sent}/reset`, "POST");
  expect(refused).toEqual({ status: 409, body: { detail: `Only the sample quote can be reset. ${made.sent} isn’t sample data.`, code: "illegal_transition" } });
  expect((await api(page, `/api/rep/quotes/${SAMPLE}/duplicate`, "POST", { "idempotency-key": "not a key" })).status).toBe(400);

  const visitor = await playwright.request.newContext({ baseURL });
  try {
    expect((await visitor.post(`/api/rep/quotes/${SAMPLE}/duplicate`)).status()).toBe(401);
    expect((await visitor.post(`/api/rep/quotes/${SAMPLE}/reset`)).status()).toBe(401);
  } finally {
    await visitor.dispose();
  }
  const context = await browser.newContext({ baseURL });
  try {
    const dana = await context.newPage();
    await dana.goto("/");
    await dana.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
    await expect(dana.getByLabel("Ask a question")).toBeVisible();
    expect((await api(dana, `/api/rep/quotes/${SAMPLE}/duplicate`, "POST")).status).toBe(403);
    expect((await api(dana, `/api/rep/quotes/${SAMPLE}/reset`, "POST")).status).toBe(403);
  } finally {
    await context.close();
  }
  expect(await quoteNumbers(page)).toEqual(before);
});
