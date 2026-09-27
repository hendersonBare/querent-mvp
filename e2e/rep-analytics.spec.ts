import { expect, test, type Page, type TestInfo } from "@playwright/test";

// Analytics (task 6.2; spec §4): the five stat cards, the trends and the old query analytics,
// for Brandi's customers and a placeholder customer, at desktop width and at 390px.
//
// beforeAll resets the database to the seed pinned to the mockup's day through the test-only
// POST /api/test/reset (the server needs QUERENT_E2E_RESET=1; playwright.config.ts sets it for the
// server it starts). The card figures don't depend on today's date; the weekly window does, so
// this spec doesn't pin its totals (src/server/analytics/service.test.ts does, at a fixed now).
//
// Set QUERENT_SHOTS_DIR to also save the screenshots as files.

const SEED_DATE = "2026-09-23";
const SHOTS = process.env.QUERENT_SHOTS_DIR;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }, testInfo) => {
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const response = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(
      response.status(),
      "POST /api/test/reset failed: start the server with QUERENT_E2E_RESET=1 (playwright.config.ts does this with QUERENT_WEBSERVER=1)",
    ).toBe(200);
  } finally {
    await api.dispose();
  }
});

async function openAnalytics(page: Page, customer?: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
  await page.getByRole("navigation", { name: "Rep portal" }).getByRole("link", { name: "Analytics" }).click();
  await expect(page).toHaveURL(/\/rep\/analytics$/);
  if (customer) {
    await page.getByLabel("Viewing").selectOption(customer);
    await expect(page).toHaveURL(new RegExp(`/rep/analytics\\?customer=${customer}$`));
  }
}
const card = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const infoButtons = (page: Page) => page.getByRole("button", { name: /^How .+ is calculated$/ });

async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}
async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const body = await page.screenshot({ fullPage: true });
  await testInfo.attach(name, { body, contentType: "image/png" });
  if (SHOTS) await page.screenshot({ fullPage: true, path: `${SHOTS}/${name}.png` });
}

/** The five cards read Brandi's seed numbers (All customers or Wasatch). */
async function expectSeedCards(page: Page) {
  await expect(card(page, "Median time to send")).toContainText("1 h 33 min");
  await expect(card(page, "Median time to send")).toContainText("From request to first send, 24 quotes");
  await expect(card(page, "Win rate")).toContainText("71%");
  await expect(card(page, "Win rate")).toContainText("17 won, 7 lost, 1 open");
  await expect(card(page, "Quoted vs accepted")).toContainText("$9,045 quoted");
  await expect(card(page, "Quoted vs accepted")).toContainText("$7,008 accepted, 77%");
  await expect(card(page, "Hours saved")).toContainText("8.0 hours");
  await expect(card(page, "Extra GP Querent found")).toContainText("+$10.20");
}

/** A placeholder customer: zeros and empty states everywhere, every number still explained. */
async function expectEmpty(page: Page) {
  await expect(card(page, "Median time to send")).toContainText("No quotes sent yet");
  await expect(card(page, "Win rate")).toContainText("No quotes decided yet");
  await expect(card(page, "Quoted vs accepted")).toContainText("$0.00 quoted");
  await expect(card(page, "Hours saved")).toContainText("0.0 hours");
  await expect(card(page, "Extra GP Querent found")).toContainText("No accepted quotes yet");
  await expect(card(page, "Quotes and wins by week")).toContainText("No quotes requested in the last 26 weeks.");
  await expect(card(page, "Average margin vs floor")).toContainText("No quotes sent yet.");
  await expect(card(page, "Top requested items")).toContainText("No items requested yet.");
  await expect(card(page, "Questions answered without a rep")).toContainText("No customer questions yet.");
  await expect(page.locator(".metric").filter({ hasText: "Total queries" }).locator("strong")).toHaveText("0");
  await expect(infoButtons(page)).toHaveCount(12);
}

test("desktop: all of Brandi's customers, then a placeholder customer", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openAnalytics(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Analytics");
  await expect(page.getByText("Quotes and customer questions for all your customers")).toBeVisible();
  await expectSeedCards(page);
  // The five cards sit in one row at desktop width.
  const tops = await Promise.all(
    ["Median time to send", "Win rate", "Quoted vs accepted", "Hours saved", "Extra GP Querent found"].map(async (name) => (await card(page, name).boundingBox())!.y),
  );
  expect(new Set(tops).size).toBe(1);

  await expect(infoButtons(page)).toHaveCount(12);
  await page.getByRole("button", { name: "How win rate is calculated" }).hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await expect(page.getByRole("tooltip")).toContainText("Accepted quotes divided by decided quotes: 17 of 24.");
  await shoot(page, testInfo, "6.2-analytics-desktop-tooltip");
  await page.mouse.move(0, 0);
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  const chart = card(page, "Quotes and wins by week");
  await expect(chart).toContainText(/\d+ quotes requested in the last 26 weeks, \d+ won so far\./);
  await chart.getByRole("group").focus();
  await expect(chart.getByRole("status")).toContainText("Week of Sep 21");
  await chart.getByRole("button", { name: "Show table" }).click();
  await expect(chart.getByRole("table").getByRole("row")).toHaveCount(27);
  await chart.getByRole("button", { name: "Show table" }).click();

  await expect(card(page, "Average margin vs floor")).toContainText("Safety & PPE");
  await expect(card(page, "Average margin vs floor")).toContainText("3 lines under the 30% floor");
  await expect(card(page, "Top requested items").getByRole("listitem").first()).toContainText("HCS-12-13-2G8");
  await expect(card(page, "Questions answered without a rep")).toContainText("40 of 40");
  // The old query analytics stay at the bottom.
  await expect(page.getByRole("heading", { name: "Queries by category" })).toBeVisible();
  await expect(page.locator(".metric").filter({ hasText: "Total queries" }).locator("strong")).toHaveText("40");
  await noSidewaysScroll(page);
  await shoot(page, testInfo, "6.2-analytics-desktop-all");

  await page.getByLabel("Viewing").selectOption("great-basin");
  await expect(page).toHaveURL(/\/rep\/analytics\?customer=great-basin$/);
  await expect(page.getByText("Quotes and customer questions for Great Basin Fabrication")).toBeVisible();
  await expectEmpty(page);
  await expect(page.getByRole("note")).toHaveCount(0);
  await noSidewaysScroll(page);
  await shoot(page, testInfo, "6.2-analytics-desktop-great-basin");

  // Another rep's customer: empty, and the page says why.
  await page.getByLabel("Viewing").selectOption("canyon-ridge");
  await expect(page.getByRole("note")).toContainText("Canyon Ridge Builders is Mara Jensen’s customer.");
  await expect(card(page, "Hours saved")).toContainText("0.0 hours");

  // Wasatch holds all of the seed's data.
  await page.getByLabel("Viewing").selectOption("wasatch");
  await expectSeedCards(page);
});

test("phone (390px): the cards and charts fit, tooltips stay on screen, nothing scrolls sideways", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAnalytics(page);
  await expectSeedCards(page);
  await noSidewaysScroll(page);
  for (const name of ["Median time to send", "Extra GP Querent found", "Quotes and wins by week", "Average margin vs floor"]) {
    const box = (await card(page, name).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  await shoot(page, testInfo, "6.2-analytics-390-all");

  // Tap the "i" on the right-hand card: the tip is clamped inside the screen.
  const info = page.getByRole("button", { name: "How win rate is calculated" });
  await info.click();
  const tip = page.getByRole("tooltip");
  await expect(tip).toBeVisible();
  const box = (await tip.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(16);
  expect(box.x + box.width).toBeLessThanOrEqual(390 - 16);
  await noSidewaysScroll(page);
  await shoot(page, testInfo, "6.2-analytics-390-tooltip");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  await page.getByLabel("Viewing").selectOption("great-basin");
  await expect(page).toHaveURL(/\/rep\/analytics\?customer=great-basin$/);
  await expectEmpty(page);
  await noSidewaysScroll(page);
  await shoot(page, testInfo, "6.2-analytics-390-great-basin");
});
