import { expect, test, type APIRequest, type Browser, type Page, type TestInfo } from "@playwright/test";

// Settings (task 6.1; spec §4, §5.2, §6.3): Rep assignments, Customer access, My margin floors,
// Pricing & delivery and Data sources, and what each change does elsewhere:
//   - a floor moves the "N lines below floor" warning on the Quotes list (task 3.2);
//   - turning a category off makes Dana's chat refuse it and point her to her rep (task 2.1);
//   - reassigning a customer moves Dana's rep card, but never Brandi's existing quotes.
//
// beforeAll/afterAll reset the database to the seed pinned to the mockup's day through the
// test-only POST /api/test/reset (the server needs QUERENT_E2E_RESET=1; playwright.config.ts sets
// it for the server it starts). Chat is scripted (QUERENT_SCRIPTED=1).

const SEED_DATE = "2026-09-23";
const SAMPLE = "Q-24817";
const STOCK_QUESTION = "Do you have 1/2 in grade 8 hex bolts in stock?";
const TABS = ["Rep assignments", "Customer access", "Margin floors", "Pricing & delivery", "Data sources"] as const;

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
  await page.goto("/");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
}
/** Dana at Wasatch, in her own browser context (her own session cookie). */
async function signInAsDana(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
  await expect(page.locator(".customer-header")).toContainText("Wasatch Mechanical Contractors");
  return page;
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
/** The sample quote's Margin cell on the Quotes list: "32.2% margin", plus "N lines below floor" when any are. */
const sampleMargin = (page: Page) =>
  page
    .getByRole("table")
    .getByRole("rowgroup")
    .filter({ has: page.getByRole("link", { name: SAMPLE, exact: true }) })
    .getByRole("cell")
    .nth(4);
const floorField = (page: Page, category: string) => page.getByRole("textbox", { name: `${category} floor`, exact: true });
async function saveFloor(page: Page, category: string, value: string) {
  const field = floorField(page, category);
  await field.fill(value);
  const row = page.getByRole("listitem").filter({ has: field });
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByRole("status")).toHaveText("Saved");
}
async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}
async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test("tabs: every Settings section, with Rep assignments first; the old Data browser is gone", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsBrandi(page);
  await portalNav(page).getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/rep\/settings$/);
  await expect(settingsTabs(page).getByRole("link")).toHaveText([...TABS]);
  await expect(page.getByRole("heading", { name: "Rep assignments" })).toBeVisible();
  await expect(page.getByText("Data browser")).toHaveCount(0);

  // Placeholders are listed with their one rep; Brandi is "(you)".
  for (const [customer, rep] of [
    ["Canyon Ridge Builders", "Mara Jensen"],
    ["Great Basin Fabrication", "Brandi Gallegos (you)"],
    ["Uinta Facility Services", "Nora Chen"],
    ["Wasatch Mechanical Contractors", "Brandi Gallegos (you)"],
  ])
    await expect(page.getByRole("combobox", { name: `Rep for ${customer}` }).locator("option:checked")).toHaveText(rep);
  await expect(page.getByRole("row", { name: /Wasatch Mechanical Contractors/ })).toContainText("25 with Brandi Gallegos");
  await expect(page.getByRole("row", { name: /Great Basin Fabrication/ })).toContainText("Placeholder");
  await screenshot(page, testInfo, "settings-assignments-1440");

  for (const tab of TABS.slice(1)) {
    await settingsTabs(page).getByRole("link", { name: tab, exact: true }).click();
    await expect(page).toHaveURL(/\/rep\/settings\?tab=\w+$/);
    await expect(settingsTabs(page).getByRole("link", { name: tab, exact: true })).toHaveAttribute("aria-current", "page");
  }
  await expect(page.getByRole("heading", { name: "Demo database" })).toBeVisible();
  await expect(page.getByText("Sep 23, 2026")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Herrick Industrial Supply ERP" })).toBeVisible();
  await expect(page.getByText(/^Last sync: ERP connection refreshed/)).toBeVisible();
  await expect(page.getByText(/^(Connected|Update delayed)$/)).toBeVisible();
  await screenshot(page, testInfo, "settings-sources-1440");

  // Settings API is rep-only: fetched from the page, which carries Brandi's session cookie.
  expect(await page.evaluate(() => fetch("/api/rep/settings").then((r) => r.status))).toBe(200);
});

test("floors: changing Brandi's floor changes the below-floor warning on her quotes", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsBrandi(page);
  // Seeded: the gloves on Q-24817 (26.6%) are under Brandi's 30% Safety & PPE floor.
  await expect(sampleMargin(page)).toContainText("1 line below floor");

  await openSettings(page, "Margin floors");
  await expect(page.getByRole("heading", { name: "My margin floors" })).toBeVisible();
  await expect(page.getByText("like “Below Brandi’s 30% Safety & PPE floor”")).toBeVisible();
  await expect(floorField(page, "Safety & PPE")).toHaveValue("30.0");
  await expect(floorField(page, "Fasteners")).toHaveValue("20.0");
  // Other reps' floors are read-only.
  const others = page.getByRole("region", { name: "Other reps’ floors" });
  await expect(others.getByRole("columnheader")).toHaveText(["Category", "Eli Porter", "Mara Jensen", "Nora Chen"]);
  await expect(others.getByRole("textbox")).toHaveCount(0);
  await screenshot(page, testInfo, "settings-floors-1440");

  // Lower the PPE floor under the gloves' margin: no line is below floor any more.
  await saveFloor(page, "Safety & PPE", "25");
  await expect(floorField(page, "Safety & PPE")).toHaveValue("25.0");
  await openQuotes(page);
  await expect(sampleMargin(page)).toContainText("32.2%");
  await expect(sampleMargin(page)).not.toContainText("below floor");

  // Raise Fasteners over the bolts' 32.1% and put PPE back: two lines below floor.
  await openSettings(page, "Margin floors");
  await saveFloor(page, "Fasteners", "35");
  await saveFloor(page, "Safety & PPE", "30");
  await openQuotes(page);
  await expect(sampleMargin(page)).toContainText("2 lines below floor");
  await screenshot(page, testInfo, "quotes-after-floor-change-1440");

  // Saved floors survive a reload; 0.1 point is the precision.
  await openSettings(page, "Margin floors");
  await page.reload();
  await expect(floorField(page, "Fasteners")).toHaveValue("35.0");
  await saveFloor(page, "Fasteners", "20.04");
  await expect(floorField(page, "Fasteners")).toHaveValue("20.0");
  await openQuotes(page);
  await expect(sampleMargin(page)).toContainText("1 line below floor");

  // Out of range: the field says so and Save stays off.
  await openSettings(page, "Margin floors");
  await floorField(page, "Tools").fill("100");
  await expect(floorField(page, "Tools")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter a floor from 0 to 99.9.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ has: floorField(page, "Tools") }).getByRole("button", { name: "Save" })).toBeDisabled();
});

test("access: turning Items & stock off for Wasatch makes Dana's chat refuse stock questions and point her to Brandi", async ({ page, browser }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsBrandi(page);
  await page.getByLabel("Viewing").selectOption("wasatch");
  await openSettings(page, "Customer access");
  await expect(page).toHaveURL(/\/rep\/settings\?tab=access&customer=wasatch$/);
  await expect(page.getByText("Viewing Wasatch Mechanical Contractors")).toBeVisible();
  const items = page.getByRole("switch", { name: "Items & stock" });
  await expect(items).toHaveAttribute("aria-checked", "true");

  const dana = await signInAsDana(browser);
  await expect(await ask(dana, STOCK_QUESTION)).toContainText("64 at SLC");

  await items.click();
  await expect(items).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("Off: chat refers them to Brandi Gallegos")).toBeVisible();
  await screenshot(page, testInfo, "settings-access-1440");

  const refused = await ask(dana, STOCK_QUESTION);
  await expect(refused).toContainText("Stock levels aren't available in chat for your account. Brandi Gallegos can check for you: (801) 111-2222");
  await expect(refused).not.toContainText("64 at SLC");
  await screenshot(dana, testInfo, "dana-stock-refused-1440");

  // All customers shows the mix; only Wasatch changed.
  await page.getByLabel("Viewing").selectOption("all");
  await expect(page).toHaveURL(/\/rep\/settings\?tab=access$/);
  await expect(page.getByText("On for some customers")).toBeVisible();

  // Back on: Dana gets stock again.
  await page.getByLabel("Viewing").selectOption("wasatch");
  await page.getByRole("switch", { name: "Items & stock" }).click();
  await expect(page.getByRole("switch", { name: "Items & stock" })).toHaveAttribute("aria-checked", "true");
  await expect(await ask(dana, STOCK_QUESTION)).toContainText("64 at SLC");
  await dana.context().close();
});

test("assignments: reassigning Wasatch moves Dana's rep, never Brandi's existing quotes", async ({ page, browser }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsBrandi(page);
  await openSettings(page, "Rep assignments");
  const wasatch = page.getByRole("combobox", { name: "Rep for Wasatch Mechanical Contractors" });
  await wasatch.selectOption("mara");
  await expect(page.getByRole("status").filter({ hasText: "is now" })).toHaveText(
    "Wasatch Mechanical Contractors is now Mara Jensen’s customer. New quote requests go to Mara Jensen. Its 25 existing quotes stay with Brandi Gallegos.",
  );
  await expect(page.getByRole("row", { name: /Wasatch Mechanical Contractors/ })).toContainText("25 with Brandi Gallegos");
  await screenshot(page, testInfo, "settings-assignments-reassigned-1440");
  // The "Viewing" picker's rep follows.
  await page.getByLabel("Viewing").selectOption("wasatch");
  await expect(page.getByRole("banner")).toContainText("WAS-1142 · Rep Mara Jensen");

  // Dana's rep card and chat's "call your rep" name Mara now.
  const dana = await signInAsDana(browser);
  const rep = dana.getByRole("complementary", { name: "Contacts" }).getByRole("region", { name: "Your rep" });
  await expect(rep).toContainText("Mara Jensen");
  await expect(rep).toContainText("(801) 555-0102");

  // Brandi keeps Q-24817: quotes are never reassigned.
  await openQuotes(page);
  await expect(page.getByRole("link", { name: SAMPLE, exact: true })).toBeVisible();
  await expect(sampleMargin(page)).toContainText("1 line below floor");

  // Back to Brandi.
  await openSettings(page, "Rep assignments");
  await page.getByRole("combobox", { name: "Rep for Wasatch Mechanical Contractors" }).selectOption("brandi");
  await expect(page.getByRole("status").filter({ hasText: "is now" })).toContainText("is now Brandi Gallegos’s customer");
  await dana.reload();
  await expect(rep).toContainText("Brandi Gallegos");
  await dana.context().close();
});

test("pricing & delivery: the scarcity uplift is off by default and toggles; delivery rates are read-only", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsBrandi(page);
  await openSettings(page, "Pricing & delivery");
  const scarcity = page.getByRole("switch", { name: "Scarcity uplift" });
  await expect(scarcity).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("Off (default)")).toBeVisible();

  const rates = page.getByRole("region", { name: "Delivery rates" });
  for (const text of ["$25.00", "$2.50", "$35.00", "Items total $1,500.00 or more", "75 road miles; farther is call for freight", "Straight-line miles × 1.25"])
    await expect(rates).toContainText(text);
  await expect(rates).toContainText("$25.00 + $2.50/mi × 15.0 mi = $62.50");
  await expect(rates.getByRole("textbox")).toHaveCount(0);
  await expect(rates.getByRole("switch")).toHaveCount(0);
  await screenshot(page, testInfo, "settings-pricing-1440");

  await scarcity.click();
  await expect(scarcity).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.getByRole("switch", { name: "Scarcity uplift" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("switch", { name: "Scarcity uplift" }).click();
  await expect(page.getByRole("switch", { name: "Scarcity uplift" })).toHaveAttribute("aria-checked", "false");
});

test("phone (390px): every Settings tab fits, the current tab is in view, and nothing scrolls sideways", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsBrandi(page);
  await portalNav(page).getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/rep\/settings$/);
  const slug: Record<(typeof TABS)[number], string> = {
    "Rep assignments": "assignments",
    "Customer access": "access",
    "Margin floors": "floors",
    "Pricing & delivery": "pricing",
    "Data sources": "sources",
  };
  for (const tab of TABS) {
    await page.goto(`/rep/settings?tab=${slug[tab]}`);
    const link = settingsTabs(page).getByRole("link", { name: tab, exact: true });
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(link).toBeInViewport({ ratio: 1 });
    await noSidewaysScroll(page);
    await screenshot(page, testInfo, `settings-${slug[tab]}-390`);
  }
  await page.goto("/rep/settings?tab=floors");
  await saveFloor(page, "Tools", "19");
  await saveFloor(page, "Tools", "18");
  await noSidewaysScroll(page);
});
