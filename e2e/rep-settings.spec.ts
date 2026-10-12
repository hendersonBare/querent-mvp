import { expect, test, type APIRequest, type Browser, type Page, type TestInfo } from "@playwright/test";

// Settings (task 6.1; plan U8; spec §4, §5.2, §6.3): the manager's Customer access, Margin floors, Pricing and
// delivery and Aging (e2e/rep-roles.spec.ts covers Aging), a rep's own floors, and what each change does
// elsewhere:
//   - a rep's own floor moves the "N lines below floor" warning on the Quotes board (task 3.2) and the red
//     warning above a line's price on the quote editor (task 3.3);
//   - turning a data type off for a customer makes Dana's chat refuse it and point her to her rep (task 2.1).
// e2e/frames-settings.spec.ts proves each tab against its frame; e2e/free-delivery.spec.ts the flagged sections.
//
// beforeAll/afterAll reset the database to the seed pinned to the mockup's day through the
// test-only POST /api/test/reset (the server needs QUERENT_E2E_RESET=1; playwright.config.ts sets
// it for the server it starts). Chat is scripted (QUERENT_SCRIPTED=1).

const SEED_DATE = "2026-09-23";
const SAMPLE = "Q-24817";
const COOKIE = "querent-persona";
const STOCK_QUESTION = "Do you have 1/2 in grade 8 hex bolts in stock?";
const TABS = ["Customer access", "Margin floors", "Pricing and delivery", "Aging"] as const;

test.describe.configure({ mode: "serial" });

async function resetDemo(request: APIRequest, testInfo: TestInfo) {
  const api = await request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const response = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(
      response.status(),
      "POST /api/test/reset failed: start the server with QUERENT_E2E_RESET=1 (playwright.config.ts does this with QUERENT_WEBSERVER=1)",
    ).toBe(200);
  } finally {
    await api.dispose();
  }
}
test.beforeAll(async ({ playwright }, testInfo) => resetDemo(playwright.request, testInfo));
test.afterAll(async ({ playwright }, testInfo) => resetDemo(playwright.request, testInfo));

async function signInAsBrandi(page: Page) {
  await page.goto("/demo");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
}
/** Dana at Wasatch, in her own browser context (her own session cookie). */
async function signInAsDana(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.goto("/demo");
  await page.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
  await expect(page.getByRole("button", { name: /Wasatch Mechanical Contractors/ })).toContainText("Signed in");
  return page;
}
/** Mara (a rep) in her own browser context, signed in through the demo cookie. */
async function signInAsMara(browser: Browser, testInfo: TestInfo) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addCookies([{ name: COOKIE, value: "mara", url: String(testInfo.project.use.baseURL) }]);
  return context.newPage();
}
async function ask(page: Page, question: string) {
  const answers = page.locator(".answer-bubble");
  const before = await answers.count();
  const box = page.getByLabel("Ask a question");
  await box.fill(question);
  await box.press("Enter");
  await expect(answers).toHaveCount(before + 1);
  return answers.last();
}

const portalNav = (page: Page) => page.getByRole("navigation", { name: "Rep portal" });
const settingsTabs = (page: Page) => page.getByRole("navigation", { name: "Settings sections" });
async function openSettings(page: Page, tab: (typeof TABS)[number]) {
  await portalNav(page).getByRole("link", { name: "Settings" }).click();
  await settingsTabs(page).getByRole("link", { name: tab, exact: true }).click();
  await expect(settingsTabs(page).getByRole("link", { name: tab, exact: true })).toHaveAttribute("aria-current", "page");
}
async function openQuotes(page: Page) {
  await portalNav(page).getByRole("link", { name: /^Quotes\b/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quotes");
}
/** The sample quote's card on the Quotes board (plan U3): "32.2%", plus "N lines below floor" when any are. */
const sampleMargin = (page: Page) => page.getByRole("article", { name: SAMPLE, exact: true });
/** Brandi's own floor (she keeps her own book, decision 20), through PUT /api/rep/settings/floors: the manager's tabs no longer edit it (plan U8). */
async function setBrandiFloor(page: Page, category_id: string, floor_pct: number) {
  const status = await page.evaluate(async (body) => (await fetch("/api/rep/settings/floors", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).status, { category_id, floor_pct });
  expect(status).toBe(200);
}
/** Opens the sample quote from the Quotes list. */
async function openSample(page: Page) {
  await openQuotes(page);
  // The card opens the preview (plan U3), whose Open quote goes to the editor.
  await sampleMargin(page).getByRole("button", { name: SAMPLE, exact: true }).click();
  await page.getByRole("dialog", { name: SAMPLE, exact: true }).getByRole("link", { name: "Open quote" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");
}
/** A line's unit price on the quote editor (plan U4): its red below-floor warning, directly above it, is its description. */
const priceField = (page: Page, sku: string) => page.getByRole("textbox", { name: `Unit price for ${sku}` });
/** The SKUs of the editor's lines whose price carries a below-floor warning. */
const warnedLines = (page: Page) =>
  page.locator('input[aria-label^="Unit price for "][aria-describedby]').evaluateAll((inputs) => inputs.map((i) => i.getAttribute("aria-label")!.replace("Unit price for ", "")));
async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test("tabs: the manager's four sections, with Customer access first; Data sources and the old Data browser are gone", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await signInAsBrandi(page);
  await portalNav(page).getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/rep\/settings$/);
  await expect(settingsTabs(page).getByRole("link")).toHaveText([...TABS]);
  await expect(page.getByRole("heading", { name: "Customer access" })).toBeVisible();
  for (const gone of ["Data browser", "Data sources", "Demo database"]) await expect(page.getByText(gone)).toHaveCount(0);
  // Rep assignments and Reps are on Teams and Reps now (plan U7).
  await expect(settingsTabs(page).getByRole("link", { name: "Rep assignments" })).toHaveCount(0);
  await expect(settingsTabs(page).getByRole("link", { name: "Reps", exact: true })).toHaveCount(0);
  await screenshot(page, testInfo, "settings-access");

  for (const tab of TABS.slice(1)) {
    await settingsTabs(page).getByRole("link", { name: tab, exact: true }).click();
    await expect(page).toHaveURL(/\/rep\/settings\?tab=\w+$/);
    await expect(settingsTabs(page).getByRole("link", { name: tab, exact: true })).toHaveAttribute("aria-current", "page");
  }
  // The old ?tab=sources opens Customer access.
  await page.goto("/rep/settings?tab=sources");
  await expect(page.getByRole("heading", { name: "Customer access" })).toBeVisible();
  // Settings API is rep-only: fetched from the page, which carries Brandi's session cookie.
  expect(await page.evaluate(() => fetch("/api/rep/settings").then((r) => r.status))).toBe(200);
  expect(await page.evaluate(() => fetch("/api/rep/settings/sources").then((r) => r.status))).toBe(200);
});

test("floors: a rep's own floor changes the below-floor warning on their quotes (Brandi keeps her own book)", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await signInAsBrandi(page);
  // Seeded: the gloves on Q-24817 (26.6%) are under Brandi's 30% Safety & PPE floor.
  await expect(sampleMargin(page)).toContainText("1 line below floor");

  // Lower the PPE floor under the gloves' margin: no line is below floor any more.
  await setBrandiFloor(page, "safety", 25);
  await page.reload();
  await expect(sampleMargin(page)).toContainText("32.2%");
  await expect(sampleMargin(page)).not.toContainText("below floor");
  // ...and the quote detail drops the gloves' red warning.
  await openSample(page);
  await expect(page.getByRole("rowheader", { name: /GLV-N8-L-1000/ })).toBeVisible();
  await expect(priceField(page, "GLV-N8-L-1000")).not.toHaveAttribute("aria-describedby");
  expect(await warnedLines(page)).toEqual([]);

  // Raise Fasteners over the bolts' 32.1% and put PPE back: two lines below floor.
  await setBrandiFloor(page, "fasteners", 35);
  await setBrandiFloor(page, "safety", 30);
  await openQuotes(page);
  await expect(sampleMargin(page)).toContainText("2 lines below floor");
  await screenshot(page, testInfo, "quotes-after-floor-change");
  // The quote detail warns above both prices, each with the floor that applies (spec §5.2).
  await openSample(page);
  await expect(priceField(page, "HCS-12-13-2G8")).toHaveAccessibleDescription("Below Brandi's 35% Fasteners floor");
  await expect(priceField(page, "GLV-N8-L-1000")).toHaveAccessibleDescription("Below Brandi's 30% Safety & PPE floor");
  expect(await warnedLines(page)).toEqual(["HCS-12-13-2G8", "GLV-N8-L-1000"]);
  await expect(page.getByText(/^Below Brandi's/)).toHaveCount(2);
  await screenshot(page, testInfo, "quote-detail-after-floor-change");
  await setBrandiFloor(page, "fasteners", 20);
});

test("floors: Mara edits her own margin floors on her one Settings tab, to 0.1 point, saved and kept", async ({ browser }, testInfo) => {
  const mara = await signInAsMara(browser, testInfo);
  await mara.goto("/rep/settings");
  await expect(settingsTabs(mara).getByRole("link")).toHaveText(["Margin floors"]);
  const card = mara.getByRole("region", { name: "My margin floors" });
  const field = (category: string) => card.getByRole("textbox", { name: `${category} floor`, exact: true });
  await expect(field("Fasteners")).toHaveValue("20.0");
  await field("Fasteners").fill("22.46");
  await card.getByRole("button", { name: "Save floors" }).click();
  await expect(card.getByRole("status")).toHaveText("Saved");
  await expect(field("Fasteners")).toHaveValue("22.5");
  await mara.reload();
  await expect(mara.getByRole("region", { name: "My margin floors" }).getByRole("textbox", { name: "Fasteners floor", exact: true })).toHaveValue("22.5");
  // Out of range: the field says so and Save stays off.
  await field("Tools").fill("100");
  await expect(field("Tools")).toHaveAttribute("aria-invalid", "true");
  await expect(card.getByRole("alert")).toHaveText("Enter a floor from 0 to 99.9.");
  await expect(card.getByRole("button", { name: "Save floors" })).toBeDisabled();
  await screenshot(mara, testInfo, "mara-floors");
  await field("Tools").fill("20");
  await field("Fasteners").fill("20");
  await card.getByRole("button", { name: "Save floors" }).click();
  await expect(card.getByRole("status")).toHaveText("Saved");
  await mara.context().close();
});

test("margin floors: the manager saves the organization floors, and reviews any rep's margins read-only", async ({ page, browser }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await signInAsBrandi(page);
  await openSettings(page, "Margin floors");
  const org = page.getByRole("region", { name: "Organization margin floors" });
  const field = (category: string) => org.getByRole("textbox", { name: `${category} floor`, exact: true });
  // Seeded: each category at the lowest floor any rep has in it.
  await expect(field("Safety & PPE")).toHaveValue("20.0");
  await expect(field("Tools")).toHaveValue("18.0");
  await field("Safety & PPE").fill("25");
  await org.getByRole("button", { name: "Save floors" }).click();
  await expect(org.getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByRole("region", { name: "Organization margin floors" }).getByRole("textbox", { name: "Safety & PPE floor", exact: true })).toHaveValue("25.0");
  await field("Janitorial/MRO").fill("abc");
  await expect(org.getByRole("alert")).toHaveText("Enter a floor from 0 to 99.9.");
  await expect(org.getByRole("button", { name: "Save floors" })).toBeDisabled();
  await field("Janitorial/MRO").fill("20");

  // Rep margins: Eli first (the first rep who is not Brandi), read-only, against the organization floor.
  const review = page.getByRole("region", { name: "Rep margins" });
  await expect(review).toContainText("Read-only. Each rep sets their own above your floors.");
  const eli = review.getByRole("table", { name: "Eli Porter’s margins" });
  await expect(eli.getByRole("row").filter({ hasText: "Safety & PPE" })).toHaveText("Safety & PPE20.0%25.0%");
  await expect(review.getByRole("textbox")).toHaveCount(0);
  await review.getByRole("combobox", { name: "Rep" }).click();
  await expect(review.getByRole("listbox", { name: "Reps" }).getByRole("option")).toHaveText(["Brandi Gallegos", "Eli Porter", "Mara Jensen", "Nora Chen"]);
  await review.getByRole("combobox", { name: "Rep" }).fill("mar");
  await review.getByRole("option", { name: "Mara Jensen" }).click();
  await expect(review.getByRole("table", { name: "Mara Jensen’s margins" }).getByRole("columnheader")).toHaveText([":: Category", ":: Mara", ":: Organization floor"]);
  await screenshot(page, testInfo, "settings-margin-floors");

  // A rep cannot read or set them (Appendix B).
  const mara = await signInAsMara(browser, testInfo);
  expect((await mara.request.get("/api/rep/settings/org-floors")).status()).toBe(403);
  expect((await mara.request.put("/api/rep/settings/org-floors", { data: { floors: [{ category_id: "safety", floor_pct: 1 }] } })).status()).toBe(403);
  expect((await mara.request.get("/api/rep/settings/margins")).status()).toBe(403);
  await mara.context().close();
  const reset = await page.evaluate(async () => (await fetch("/api/rep/settings/org-floors", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ floors: [{ category_id: "safety", floor_pct: 20 }] }) })).status);
  expect(reset).toBe(200);
});

test("access: turning Items and stock off for Wasatch makes Dana's chat refuse stock questions and point her to Brandi", async ({ page, browser }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await signInAsBrandi(page);
  await openSettings(page, "Customer access");
  // No search, no filter: one switch per data type for every customer.
  await expect(page.getByRole("region", { name: "Customer access" }).getByRole("switch")).toHaveCount(4);
  // A search lists the customers that match, one switch per data type each (C_S1b).
  await page.getByRole("searchbox", { name: "Search customers" }).fill("Wasatch");
  await expect(page.getByText("1 of 6 customers")).toBeVisible();
  const items = page.getByRole("switch", { name: "Items and stock for Wasatch Mechanical Contractors" });
  await expect(items).toHaveAttribute("aria-checked", "true");

  const dana = await signInAsDana(browser);
  await expect(await ask(dana, STOCK_QUESTION)).toContainText("64 at SLC");

  await items.click();
  await expect(items).toHaveAttribute("aria-checked", "false");
  await screenshot(page, testInfo, "settings-access-wasatch");

  const refused = await ask(dana, STOCK_QUESTION);
  await expect(refused).toContainText("Stock levels aren't available in chat for your account. Brandi Gallegos can check for you: (801) 111-2222");
  await expect(refused).not.toContainText("64 at SLC");
  await screenshot(dana, testInfo, "dana-stock-refused");

  // The filter finds her: Items and stock Not shared.
  await page.getByRole("searchbox", { name: "Search customers" }).fill("");
  await expect(page.getByRole("region", { name: "Customer access" })).toBeVisible();
  // With no search, the every-customer row shows the mix: only Wasatch changed.
  await expect(page.getByRole("switch", { name: "Items and stock", exact: true })).toHaveAccessibleDescription("On for some customers");
  await page.getByRole("button", { name: "Filter" }).click();
  const panel = page.getByRole("dialog", { name: "Filter customers" });
  await panel.getByRole("radiogroup").first().getByRole("radio", { name: "Not shared" }).click();
  await panel.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("1 of 6 customers")).toBeVisible();
  await expect(page.getByRole("button", { name: "Filter, 1 applied" })).toBeVisible();

  // Back on: Dana gets stock again.
  await page.getByRole("switch", { name: "Items and stock for Wasatch Mechanical Contractors" }).click();
  await expect(page.getByRole("switch", { name: "Items and stock for Wasatch Mechanical Contractors" })).toHaveAttribute("aria-checked", "true");
  await expect(await ask(dana, STOCK_QUESTION)).toContainText("64 at SLC");
  await dana.context().close();

  // Analytics' Manage customer access link opens it for one customer (?customer=).
  await page.goto("/rep/settings?tab=access&customer=wasatch");
  await expect(page.getByRole("searchbox", { name: "Search customers" })).toHaveValue("Wasatch Mechanical Contractors");
  await expect(page.getByRole("switch", { name: "Pricing for Wasatch Mechanical Contractors" })).toBeVisible();
  // A rep can't read or change it (Appendix B; OA-69).
  const mara = await signInAsMara(browser, testInfo);
  expect((await mara.request.get("/api/rep/settings/access")).status()).toBe(403);
  expect((await mara.request.put("/api/rep/settings/access", { data: { customer_id: null, category: "items_stock", enabled: false } })).status()).toBe(403);
  await mara.context().close();
});

test("pricing and delivery: the scarcity uplift is off by default and toggles; broken case is +10%; every delivery rate is editable", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await signInAsBrandi(page);
  await openSettings(page, "Pricing and delivery");
  const scarcity = page.getByRole("switch", { name: "Scarcity uplift" });
  await expect(scarcity).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("Off (default)")).toBeVisible();
  await expect(page.getByRole("region", { name: "Pricing", exact: true })).toContainText("suggest the customer price + 10%, never above list");

  const rates = page.getByRole("region", { name: "Delivery rates" });
  const field = (name: string) => rates.getByRole("textbox", { name });
  const SEEDED: [string, string][] = [
    ["Base fee", "25"], ["Per road mile", "2.5"], ["Minimum charge", "35"], ["Free delivery at items total of", "1500"],
    ["Delivery radius", "75"], ["Road miles per straight-line mile", "1.25"],
  ];
  for (const [name, value] of SEEDED) await expect(field(name)).toHaveValue(value);
  await expect(rates).toContainText("$25.00 + $2.50/mi x 15.0 mi = $62.50");
  await screenshot(page, testInfo, "settings-pricing");

  // Change the per-mile rate: the example follows, Save stores it, and draft quotes price freight with it.
  await field("Per road mile").fill("3");
  await expect(rates).toContainText("$25.00 + $3.00/mi x 15.0 mi = $70.00");
  await rates.getByRole("button", { name: "Save rates" }).click();
  await expect(rates.getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByRole("region", { name: "Delivery rates" }).getByRole("textbox", { name: "Per road mile" })).toHaveValue("3");
  const detail = await page.evaluate(async (path) => (await fetch(path)).json(), `/api/rep/quotes/${SAMPLE}`);
  expect(detail.delivery_rates).toMatchObject({ per_mile: 3, road_factor: 1.25 });
  // An impossible rate says why and doesn't save; then put the seed rate back.
  await field("Delivery radius").fill("0");
  await expect(rates.getByRole("alert")).toHaveText("Delivery radius must be from 1 to 1,000.");
  await expect(rates.getByRole("button", { name: "Save rates" })).toBeDisabled();
  await field("Delivery radius").fill("75");
  await field("Per road mile").fill("2.5");
  await rates.getByRole("button", { name: "Save rates" }).click();
  await expect(rates.getByRole("status")).toHaveText("Saved");
  await expect(rates).toContainText("$25.00 + $2.50/mi x 15.0 mi = $62.50");

  await scarcity.click();
  await expect(scarcity).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.getByRole("switch", { name: "Scarcity uplift" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("switch", { name: "Scarcity uplift" }).click();
  await expect(page.getByRole("switch", { name: "Scarcity uplift" })).toHaveAttribute("aria-checked", "false");
});
