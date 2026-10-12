import { expect, test, type Page, type TestInfo } from "@playwright/test";

// Aging (v3 spec §3, §6; decisions 16 and 18; tasks A2, U3): the Overdue and Aging words on the Quotes
// page's cards and rows, Only show Overdue and Aging (which replaced the Needs attention view, plan U3), the
// API's Needs attention order, and the header caution (plan U2, C_QOB3). The frames draw the words in red
// with no icon (C_QOBoard, C_QOTable), and the frames win (decision 50).
//
// beforeAll resets the database to the seed pinned to the mockup's day (POST /api/test/reset). The
// seed's aging quotes are dated from the reset time, so on any day the list holds:
//   Q-24789  sent 100 h ago, $360.80                    Aging (amber), "Sent 4 days ago"
//   Q-24790  changes requested 30 h ago, sent $1,164.00  Overdue (red)
//   Q-24791  sent 20 h ago                               no word
//   Q-24817  the sample, requested on the pinned day      Overdue (red): weeks old on the server's clock
// The reset hook exists only when the server runs with QUERENT_E2E_RESET=1 (playwright.config.ts).
// Brandi is the manager: her list and caution cover every rep (task U1), so the list checks narrow
// it to her own quotes with the Rep filter (?rep=brandi); Mara's caution counts her own.

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
  await page.goto("/demo");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
}
const card = (page: Page, number: string) => page.getByRole("article", { name: number, exact: true });
const table = (page: Page) => page.getByRole("table", { name: "Quotes" });
/** The Status cell of one quote's table row. */
const statusCell = (page: Page, number: string) => table(page).getByRole("row").filter({ has: page.getByRole("button", { name: number, exact: true }) }).getByRole("cell").nth(3);
/** Every rep's red quotes, as the API's Needs attention view lists them (the caution's count, task U1). */
const everyRepRed = (page: Page) =>
  page.evaluate(() => fetch("/api/rep/quotes?attention=1").then((r) => r.json()).then((b) => b.rows.filter((r: { aging: { level: string } }) => r.aging.level === "red").length));
async function listed(page: Page) {
  const more = page.locator("[data-ui=table] [data-ui=more]");
  if (await more.count() && /more/.test(await more.textContent() ?? "")) await more.click();
  return table(page).getByRole("row").getByRole("button").filter({ hasText: /^Q-\d+$/ }).allTextContents();
}
const caution = (page: Page) => page.getByRole("button", { name: /^Needs attention/ });
async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

test("words: Aging and Overdue on a card and a row, in red as the frames draw them; fine and final quotes carry none", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await signInAsBrandi(page);
  await page.goto("/rep/quotes?rep=brandi");
  const red = async (number: string, word: string) => {
    const flag = card(page, number).getByText(word, { exact: true });
    await expect(flag).toBeVisible();
    expect(await flag.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(201, 42, 28)");
  };
  await red("Q-24789", "Aging");
  await red("Q-24790", "Overdue");
  await red("Q-24817", "Overdue. 1 line below floor");
  await expect(card(page, "Q-24791")).not.toContainText(/Overdue|Aging/);
  await attachScreenshot(page, testInfo, "aging-board-1920");

  // The same words in the table's Status cell, under the status.
  await page.goto("/rep/quotes?rep=brandi&view=table");
  await listed(page);
  await expect(statusCell(page, "Q-24789")).toHaveText("SentAging");
  await expect(statusCell(page, "Q-24790")).toHaveText(/^Changes requestedOverdue/);
  await expect(statusCell(page, "Q-24817")).toHaveText("Draft readyOverdue. 1 line below floor");
  await expect(statusCell(page, "Q-24791")).toHaveText("Sent");
  await expect(statusCell(page, "Q-24816")).toHaveText("Accepted");
  // Each quote's aging, with the reason the server gives (the caution dropdown shows it, plan U2).
  const rows = await page.evaluate(() => fetch("/api/rep/quotes?rep=brandi").then((r) => r.json()).then((l) => l.rows));
  const aging = (n: string) => rows.find((r: { quote_number: string }) => r.quote_number === n).aging;
  expect(aging("Q-24789")).toMatchObject({ level: "amber", reason: "Sent 4 days ago" });
  expect(aging("Q-24790")).toMatchObject({ level: "red", reason: expect.stringMatching(/^Changes requested (29|30) hours ago$/) });
  expect(aging("Q-24817")).toMatchObject({ level: "red", reason: expect.stringMatching(/^Requested \d+ days ago$/) });
  expect(aging("Q-24816")).toBeNull();
});

test("Only show Overdue and Aging: the amber and red open quotes; the API keeps the Needs attention order", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await signInAsBrandi(page);
  await page.goto("/rep/quotes?rep=brandi");
  await page.locator("header [data-ui=filter] > button").click();
  const panel = page.getByRole("dialog", { name: "Filter quotes" });
  await panel.locator("label").filter({ hasText: /^Overdue$/ }).click();
  await panel.locator("label").filter({ hasText: /^Aging$/ }).click();
  await panel.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/\/rep\/quotes\?rep=brandi&only=overdue%2Caging$/);
  await expect(page.getByRole("button", { name: "Filter, 3 applied" })).toBeVisible();
  // Each in its lane: the sample a draft, Q-24790 a change request, Q-24789 sent.
  await expect(page.locator('section[data-lane][aria-label="Draft ready"] [role=article]')).toHaveText([/^Q-24817/]);
  await expect(page.locator('section[data-lane][aria-label="Changes requested"] [role=article]')).toHaveText([/^Q-24790/]);
  await expect(page.locator('section[data-lane][aria-label="Sent"] [role=article]')).toHaveText([/^Q-24789/]);
  await expect(page.locator('section[data-lane][aria-label="Accepted"] [data-ui=count]')).toHaveText("0");
  await attachScreenshot(page, testInfo, "only-overdue-aging-1920");
  // Overdue alone, from the table; the page's own customer filter keeps it.
  await page.goto("/rep/quotes?only=overdue&customer=wasatch&view=table");
  expect((await listed(page)).sort()).toEqual(["Q-24790", "Q-24817"]);

  // GET /api/rep/quotes?attention=1 still sorts most urgent first (red, then the largest total: Q-24790 was
  // sent at $1,164.00, the sample is $1,122.40, then amber), or oldest first with &sort=oldest (decision 18, OA-9).
  const order = (query: string) => page.evaluate((q) => fetch(`/api/rep/quotes?${q}`).then((r) => r.json()).then((l) => l.rows.map((r: { quote_number: string }) => r.quote_number)), query);
  expect(await order("attention=1&rep=brandi")).toEqual(["Q-24790", "Q-24817", "Q-24789"]);
  expect(await order("attention=1&sort=oldest&rep=brandi")).toEqual(["Q-24817", "Q-24789", "Q-24790"]);
});

test("header caution: its label counts red quotes only; its dropdown lists the amber and red quotes in place", async ({ page, browser }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsBrandi(page);
  // The manager's caution counts every rep's red quotes (task U1): her own two and other reps'.
  const red = await everyRepRed(page);
  expect(red).toBeGreaterThan(2);
  await expect(caution(page)).toHaveAccessibleName(`Needs attention, ${red} items`);
  // Unread stays her own: the sample, in the bell.
  expect(await page.evaluate(() => fetch("/api/rep/badges").then((r) => r.json()).then((b) => b.quotes))).toBe(1);
  await page.goto("/rep/analytics");
  await caution(page).click();
  // It opens in place (C_QOB3): the page does not change.
  await expect(page).toHaveURL(/\/rep\/analytics$/);
  const attention = await page.evaluate(() => fetch("/api/rep/quotes?attention=1").then((r) => r.json()).then((b) => b.rows.length));
  const list = page.getByRole("dialog", { name: `${attention} need your attention` });
  await expect(list.getByRole("button")).toHaveCount(attention);
  for (const [number, tag] of [["Q-24790", "Overdue"], ["Q-24817", "Overdue"], ["Q-24789", "Aging"]])
    await expect(list.getByRole("button", { name: new RegExp(`^${number}\\s*${tag}`) })).toHaveCount(1);
  // Each row's line in C_QOB3's sentence for its status, from the quote's data.
  const sentAt = await page.evaluate(() => fetch("/api/rep/quotes?attention=1").then((r) => r.json())
    .then((b) => b.rows.find((r: { quote_number: string }) => r.quote_number === "Q-24789").sent_at as string));
  const sentDay = new Date(sentAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  await expect(list.getByRole("button", { name: /^Q-24789\s*Aging/ })).toHaveText(`Q-24789AgingSent ${sentDay}, no reply yet.`);
  await expect(list.getByRole("button", { name: /^Q-24790\s*Overdue/ })).toHaveText("Q-24790OverdueDana Ortiz asked to hold the anchors for pickup…");
  await expect(list.getByRole("button", { name: /^Q-24817\s*Overdue/ })).toHaveText("Q-24817OverdueDraft has 1 line below the margin floor.");
  // Red first.
  const tags = await list.getByRole("button").evaluateAll((rows) => rows.map((r) => (r.textContent!.includes("Overdue") ? "red" : "amber")));
  expect(tags).toEqual([...tags].sort((a, b) => (a === "red" ? 0 : 1) - (b === "red" ? 0 : 1)));

  // A rep's caution counts their own red quotes: Mara's Overdue draft and change request.
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: "querent-persona", value: "mara", url: String(testInfo.project.use.baseURL) }]);
  const mara = await context.newPage();
  await mara.goto("/rep/quotes");
  await expect(caution(mara)).toHaveAccessibleName("Needs attention, 2 items");
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
