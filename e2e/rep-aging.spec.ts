import { expect, test, type Page, type TestInfo } from "@playwright/test";

// Aging (v3 spec §3, §6; decisions 16 and 18; task A2): the Aging / Overdue markers with their text
// labels, the Needs attention filter and its sort toggle, and the red header badge.
//
// beforeAll resets the database to the seed pinned to the mockup's day (POST /api/test/reset). The
// seed's aging quotes are dated from the reset time, so on any day the list holds:
//   Q-24789  sent 100 h ago, $360.80                    Aging (amber), "Sent 4 days ago"
//   Q-24790  changes requested 30 h ago, sent $1,164.00  Overdue (red)
//   Q-24791  sent 20 h ago                               no marker
//   Q-24817  the sample, requested on the pinned day      Overdue (red): weeks old on the server's clock
// The reset hook exists only when the server runs with QUERENT_E2E_RESET=1 (playwright.config.ts).
// Brandi is the manager: her list and red badge cover every rep (task U1), so the list checks narrow
// it to her own quotes with the Rep filter (?rep=brandi); Mara's badge counts her own.

const SEED_DATE = "2026-09-23";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }, testInfo) => {
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const reset = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(
      reset.status(),
      "POST /api/test/reset failed: start the server with QUERENT_E2E_RESET=1 (playwright.config.ts does this with QUERENT_WEBSERVER=1)",
    ).toBe(200);
  } finally {
    await api.dispose();
  }
});

async function signInAsBrandi(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
}
const quotesTable = (page: Page) => page.getByRole("table");
const quote = (page: Page, number: string) =>
  quotesTable(page).getByRole("rowgroup").filter({ has: page.getByRole("link", { name: number, exact: true }) });
/** The Status cell: a manager's rows start with the checkbox and carry a Rep cell (tasks D2, U1). */
const statusCell = (page: Page, number: string) => quote(page, number).getByRole("cell").nth(4);
/** Every rep's red quotes, as the manager's Needs attention view lists them (the header badge's count, task U1). */
const everyRepRed = (page: Page) =>
  page.evaluate(() => fetch("/api/rep/quotes?attention=1").then((r) => r.json()).then((b) => b.rows.filter((r: { aging: { level: string } }) => r.aging.level === "red").length));
const listed = (page: Page) => quotesTable(page).getByRole("rowheader").getByRole("link");
const statusFilter = (page: Page) => page.getByRole("navigation", { name: "Filter by status" });
const sortToggle = (page: Page) => page.getByRole("navigation", { name: "Sort quotes needing attention" });
const attentionBadge = (page: Page) => page.getByRole("banner").getByRole("link", { name: /^Needs attention:/ });
async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}
async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

test("markers: Aging and Overdue rows carry a word and an icon, with the reason as the tooltip", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsBrandi(page);

  const amber = statusCell(page, "Q-24789").locator('[data-level="amber"]');
  await expect(amber).toHaveText(/^Aging/);
  await expect(amber).toHaveAttribute("title", "Sent 4 days ago");
  await expect(amber.locator("svg")).toBeVisible();
  await expect(statusCell(page, "Q-24789")).toHaveText(/^Sent\s*Aging/);

  const red = statusCell(page, "Q-24790").locator('[data-level="red"]');
  await expect(red).toHaveText(/^Overdue/);
  await expect(red).toHaveAttribute("title", /^Changes requested (29|30) hours ago$/);
  await expect(red.locator("svg")).toBeVisible();
  await expect(statusCell(page, "Q-24817").locator('[data-level="red"]')).toHaveAttribute("title", /^Requested \d+ days ago$/);

  // Colour is not the only signal: amber and red differ in colour too.
  const color = async (level: string) => statusCell(page, level === "amber" ? "Q-24789" : "Q-24790").locator(`[data-level="${level}"]`).evaluate((el) => getComputedStyle(el).color);
  expect(await color("amber")).not.toBe(await color("red"));

  // A fresh open quote and a final one carry no marker.
  await expect(statusCell(page, "Q-24791")).toHaveText("Sent");
  await expect(statusCell(page, "Q-24816")).toHaveText("Accepted");
  await attachScreenshot(page, testInfo, "aging-markers-1440");
});

test("Needs attention filter: amber and red open quotes, red first then by total, with an Oldest first toggle", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsBrandi(page);
  await page.goto("/rep/quotes?rep=brandi");
  const filter = statusFilter(page).getByRole("link", { name: /^Needs attention/ });
  await expect(filter).toHaveText(/^Needs attention\s*3$/);
  await filter.click();
  await expect(page).toHaveURL(/\/rep\/quotes\?attention=1&rep=brandi$/);
  await expect(filter).toHaveAttribute("aria-current", "page");

  // Most urgent: red (Q-24790 was sent at $1,164.00, the sample is $1,122.40), then amber.
  await expect(listed(page)).toHaveText(["Q-24790", "Q-24817", "Q-24789"]);
  await expect(sortToggle(page).getByRole("link", { name: "Most urgent" })).toHaveAttribute("aria-current", "page");
  await attachScreenshot(page, testInfo, "needs-attention-1440");

  await sortToggle(page).getByRole("link", { name: "Oldest first" }).click();
  await expect(page).toHaveURL(/\/rep\/quotes\?attention=1&sort=oldest&rep=brandi$/);
  await expect(listed(page)).toHaveText(["Q-24817", "Q-24789", "Q-24790"]);
  await expect(sortToggle(page).getByRole("link", { name: "Oldest first" })).toHaveAttribute("aria-current", "page");

  // The page's own customer filter keeps the view; another filter goes back to newest request first.
  await page.goto("/rep/quotes?attention=1&sort=oldest&customer=wasatch");
  await expect(listed(page)).toHaveText(["Q-24817", "Q-24789", "Q-24790"]);
  await statusFilter(page).getByRole("link", { name: /^Sent/ }).click();
  await expect(listed(page)).toHaveText(["Q-24791", "Q-24789"]);
  await expect(sortToggle(page)).toHaveCount(0);
});

test("header badge: counts red quotes only, beside the unread badge, and opens Needs attention", async ({ page, browser }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsBrandi(page);
  // The manager's badge counts every rep's red quotes (task U1): her own two and other reps'.
  const red = await everyRepRed(page);
  expect(red).toBeGreaterThan(2);
  await expect(attentionBadge(page)).toHaveAccessibleName(`Needs attention: ${red} overdue quotes`);
  await expect(attentionBadge(page)).toHaveText(new RegExp(`Needs attention\\s*${red}`));
  // Unread stays her own: the sample.
  await expect(page.getByRole("navigation", { name: "Rep portal" }).getByRole("link", { name: /^Quotes\b/ })).toHaveAccessibleName("Quotes 1 unread");
  await page.goto("/rep/analytics");
  await attentionBadge(page).click();
  await expect(page).toHaveURL(/\/rep\/quotes\?attention=1$/);
  for (const number of ["Q-24790", "Q-24817", "Q-24789"]) await expect(quote(page, number)).toHaveCount(1);

  // A rep's badge counts their own red quotes: Mara's Overdue draft and change request.
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: "querent-persona", value: "mara", url: String(testInfo.project.use.baseURL) }]);
  const mara = await context.newPage();
  await mara.goto("/rep/quotes");
  await expect(attentionBadge(mara)).toHaveAccessibleName("Needs attention: 2 overdue quotes");
  await context.close();
});

test("quote detail: the header shows the marker next to the status chip", async ({ page }) => {
  await signInAsBrandi(page);
  await page.goto("/rep/quotes/Q-24790");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");
  const header = page.getByRole("heading", { level: 1 }).locator("..");
  await expect(header.getByText("Changes requested", { exact: true })).toBeVisible();
  await expect(header.locator('[data-level="red"]')).toHaveText(/^Overdue/);
  await page.goto("/rep/quotes/Q-24789");
  await expect(page.getByRole("heading", { level: 1 }).locator("..").locator('[data-level="amber"]')).toHaveAttribute("title", "Sent 4 days ago");
  await page.goto("/rep/quotes/Q-24791");
  await expect(page.getByRole("heading", { level: 1 }).locator("..").locator("[data-level]")).toHaveCount(0);
});

test("phone (390px): the badge keeps its icon and count, and Needs attention never scrolls sideways", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsBrandi(page);
  await expect(attentionBadge(page)).toBeVisible();
  await expect(attentionBadge(page)).toHaveAccessibleName(`Needs attention: ${await everyRepRed(page)} overdue quotes`);
  await attentionBadge(page).click();
  await expect(page).toHaveURL(/\/rep\/quotes\?attention=1$/);
  await expect(quote(page, "Q-24790").getByText("Overdue")).toBeVisible();
  await expect(sortToggle(page)).toBeVisible();
  await noSidewaysScroll(page);
  await attachScreenshot(page, testInfo, "needs-attention-390");
});
