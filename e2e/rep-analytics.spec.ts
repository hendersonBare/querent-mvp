import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";

// Analytics (task 6.2; spec §4; plan U6) at desktop width (no phone layout, decision 43): the tabs per
// role, the five stat cards and the trends, the Team dashboard's leaderboard, decline reasons and
// untouched quotes (moved here from Teams and Reps, plan U6), and the customer questions.
//   - Brandi (the manager) reads the whole organization; her own Wasatch book carries the seed's history,
//     read through the page's own ?customer=.
//   - She compares two reps through the filter, reads the decline reasons with the Other text, exports
//     the leaderboard as CSV and drills from a count into her Quotes list.
//   - Mara (a rep) has My Analytics: no Rep leaderboard tab, her own numbers whatever the API is asked.
// The pixel proof against the frames is e2e/frames-analytics.spec.ts.
//
// beforeAll resets the database to the seed pinned to the mockup's day through the test-only
// POST /api/test/reset (the server needs QUERENT_E2E_RESET=1). The card figures don't depend on today's
// date; the weekly window does, so this spec doesn't pin its totals (src/server/analytics/service.test.ts
// does, at a fixed now). The demo book (task F1) is dated from the reset time, so the last 30 days always
// hold Mara's 13 quotes and Eli's 20, with declines of every reason (Mara's Other with a note).
//
// Set QUERENT_SHOTS_DIR to also save the screenshots as files.

const SEED_DATE = "2026-09-23";
const SHOTS = process.env.QUERENT_SHOTS_DIR;
const COOKIE = "querent-persona";
const OTHER_NOTE = "The general contractor is supplying the anchors on this job.";
const DESKTOP = { width: 1920, height: 1080 };

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }, testInfo) => {
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const response = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(response.status(), "POST /api/test/reset failed: start the server with QUERENT_E2E_RESET=1 (playwright.config.ts does this with QUERENT_WEBSERVER=1)").toBe(200);
  } finally {
    await api.dispose();
  }
});

/** Signs Brandi in, opens Analytics from the nav, then narrows it to one customer (Wasatch by default, null for the whole organization). */
async function openAnalytics(page: Page, customer: string | null = "wasatch") {
  await page.setViewportSize(DESKTOP);
  await page.goto("/demo");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
  await page.getByRole("navigation", { name: "Rep portal" }).getByRole("link", { name: "Analytics" }).click();
  await expect(page).toHaveURL(/\/rep\/analytics$/);
  if (customer) await page.goto(`/rep/analytics?customer=${customer}`);
  await expect(page.getByRole("heading", { name: "Median time to send" })).toBeVisible();
}
async function signInAsMara(browser: Browser, testInfo: TestInfo) {
  const context = await browser.newContext({ viewport: DESKTOP });
  await context.addCookies([{ name: COOKIE, value: "mara", url: String(testInfo.project.use.baseURL) }]);
  return context.newPage();
}
const card = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const infoButtons = (page: Page) => page.getByRole("button", { name: /^How .+ is calculated$/ });
const leaderboard = (page: Page) => page.getByRole("table", { name: "Leaderboard" });
const row = (page: Page, table: string, name: string) => page.getByRole("table", { name: table }).getByRole("row").filter({ has: page.getByRole("rowheader", { name, exact: true }) });

async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}
async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const body = await page.screenshot({ fullPage: true });
  await testInfo.attach(name, { body, contentType: "image/png" });
  if (SHOTS) await page.screenshot({ fullPage: true, path: `${SHOTS}/${name}.png` });
}

/**
 * Real Tab presses from the top of the page to each "i" in turn: each one shows its tip on focus, on
 * screen (verifier finding on 1b2e843: the scroll that focus causes used to hide the tip at once).
 */
async function tabThroughInfoTips(page: Page, topics: string[]) {
  await page.evaluate(() => { window.scrollTo(0, 0); (document.activeElement as HTMLElement | null)?.blur(); });
  for (const topic of topics) {
    const name = `How ${topic} is calculated`;
    let presses = 0;
    while (!(await page.evaluate((label) => document.activeElement?.getAttribute("aria-label") === label, name))) {
      await page.keyboard.press("Tab");
      expect(++presses, `Tab never reached "${name}"`).toBeLessThan(60);
    }
    const tip = page.getByRole("tooltip");
    await expect(tip, `the tip for ${topic}`).toBeVisible();
    await expect(tip).toContainText(/\w/);
    const box = (await tip.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(DESKTOP.height);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(DESKTOP.width);
  }
}

/**
 * The five cards read Brandi's Wasatch seed numbers: the 24 past quotes and the sample, plus the three
 * open aging quotes (task A2: two sent, one with changes requested, each first sent 93 minutes after the
 * request, so the median holds).
 */
async function expectSeedCards(page: Page) {
  await expect(card(page, "Median time to send")).toContainText("1 h 33 min");
  await expect(card(page, "Median time to send")).toContainText("From request to first send, 27 quotes");
  await expect(card(page, "Win rate")).toContainText("71%");
  await expect(card(page, "Win rate")).toContainText("17 won, 7 lost, 4 open");
  await expect(card(page, "Quoted vs accepted")).toContainText("$10,666quoted");
  await expect(card(page, "Quoted vs accepted")).toContainText("$7,008 accepted, 66%");
  await expect(card(page, "Hours saved")).toContainText("9.0hours");
  await expect(card(page, "Extra GP Querent found")).toContainText("+$10.20");
}

/** A placeholder customer: zeros, empty lines and "-" with nothing to divide; every number still explained. */
async function expectEmpty(page: Page) {
  await expect(card(page, "Median time to send")).toContainText("-No quotes sent yet");
  await expect(card(page, "Win rate")).toContainText("No quotes decided yet");
  await expect(card(page, "Quoted vs accepted")).toContainText("$0.00quoted");
  await expect(card(page, "Hours saved")).toContainText("0.0hours");
  await expect(card(page, "Extra GP Querent found")).toContainText("No accepted quotes yet");
  await expect(card(page, "Quotes and wins by week")).toContainText("No quotes requested in the last 26 weeks.");
  await expect(card(page, "Average margin vs floor")).toContainText("No quotes sent yet.");
  await expect(card(page, "Top requested items")).toContainText("No items requested yet.");
  await expect(infoButtons(page)).toHaveCount(5);
  await tab(page, "Customer questions").click();
  await expect(card(page, "Questions answered without a rep")).toContainText("0of 00% answered without a rep");
  await expect(card(page, "Query analytics")).toContainText("Total queriesi0Customer questions, all time");
  await tab(page, "Overview").click();
}

test("the manager: the whole organization, Brandi's Wasatch, then a placeholder customer", async ({ page }, testInfo) => {
  await openAnalytics(page, null);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Analytics");
  await expect(page.getByText("Quotes and customer questions for the whole organization")).toBeVisible();
  await expect(page.getByLabel("Viewing")).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveText(["Overview", "Rep leaderboard", "Decline reasons", "Untouched quotes", "Customer questions"]);
  await page.goto("/rep/analytics?customer=wasatch");
  await expect(page.getByText("Quotes and customer questions for Wasatch Mechanical Contractors")).toBeVisible();
  await expectSeedCards(page);
  // The five cards sit in one row at desktop width.
  const tops = await Promise.all(["Median time to send", "Win rate", "Quoted vs accepted", "Hours saved", "Extra GP Querent found"].map(async (name) => (await card(page, name).boundingBox())!.y));
  expect(new Set(tops).size).toBe(1);

  await expect(infoButtons(page)).toHaveCount(5);
  await page.getByRole("button", { name: "How win rate is calculated" }).hover();
  await expect(page.getByRole("tooltip")).toContainText("Accepted quotes divided by decided quotes: 17 of 24.");
  await shoot(page, testInfo, "u6-analytics-overview-tooltip");
  await page.mouse.move(1919, 1079);
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  const chart = card(page, "Quotes and wins by week");
  await expect(chart).toContainText(/\d+ quotes? requested in the last 26 weeks, \d+ won so far\./);
  await chart.getByRole("button", { name: "Show table" }).click();
  const weeks = chart.getByRole("table", { name: "Quotes and wins by week" });
  // Newest first: the chart ends at this week (Monday, UTC) on the server's clock, today's, not the seed day's.
  const today = new Date();
  const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - ((today.getUTCDay() + 6) % 7)));
  await expect(weeks.getByRole("row").nth(1).getByRole("rowheader")).toHaveText(monday.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }));
  await expect(weeks.getByRole("row")).toHaveCount(10);
  await chart.getByRole("button", { name: "Show 17 more weeks" }).click();
  await expect(weeks.getByRole("row")).toHaveCount(27);
  await chart.getByRole("button", { name: "Show chart" }).click();
  await expect(chart.getByRole("table")).toHaveCount(0);

  await expect(card(page, "Average margin vs floor")).toContainText("Safety & PPE");
  await expect(card(page, "Average margin vs floor")).toContainText("3 lines under the 30% floor");
  await expect(card(page, "Top requested items").getByRole("listitem").first()).toContainText("HCS-12-13-2G8");
  await noSidewaysScroll(page);
  await shoot(page, testInfo, "u6-analytics-overview-wasatch");

  // The old query analytics, on Customer questions.
  await tab(page, "Customer questions").click();
  await expect(card(page, "Questions answered without a rep")).toContainText("40of 40100% answered without a rep");
  await expect(page.getByRole("table", { name: "Queries by category" })).toBeVisible();
  await expect(card(page, "Query analytics")).toContainText("Total queriesi40Customer questions, all time");
  await expect(page.getByRole("link", { name: "Manage customer access" })).toHaveAttribute("href", "/rep/settings?tab=access&customer=wasatch");
  await shoot(page, testInfo, "u6-analytics-questions-wasatch");
  await tab(page, "Overview").click();

  await page.goto("/rep/analytics?customer=great-basin");
  await expect(page.getByText("Quotes and customer questions for Great Basin Fabrication")).toBeVisible();
  await expectEmpty(page);
  await noSidewaysScroll(page);

  // Another rep's customer: the manager reads it like any other (task U1), with no "another rep's" note.
  await page.goto("/rep/analytics?customer=canyon-ridge");
  await expect(page.getByText("Quotes and customer questions for Canyon Ridge Builders")).toBeVisible();
  await expect(page.getByRole("note")).toHaveCount(0);
});

test("keyboard: Tab to every \"i\" shows its tip on screen, on the Overview and on Customer questions", async ({ page }) => {
  await openAnalytics(page);
  await expectSeedCards(page);
  await tabThroughInfoTips(page, ["median time to send", "win rate", "dollars quoted and accepted", "hours saved", "extra GP Querent found"]);
  // Shift+Tab back shows the previous one.
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("tooltip")).toContainText("A fixed 20 minutes of rep time for each quote sent");
  await tab(page, "Customer questions").click();
  await tabThroughInfoTips(page, ["total queries", "estimated time saved"]);
});

test("Brandi compares two reps, reads the decline reasons, exports the CSV and drills into the quotes (the old Team dashboard, plan U6)", async ({ page }, testInfo) => {
  await openAnalytics(page, null);
  await tab(page, "Rep leaderboard").click();
  await expect(page.getByRole("radio", { name: "30 days" })).toHaveAttribute("aria-checked", "true");
  await expect(leaderboard(page).getByRole("rowheader")).toHaveText(["Brandi Gallegos", "Eli Porter", "Mara Jensen", "Nora Chen", "Total"]);
  // The leaderboard scrolls inside its own box; the page never scrolls sideways.
  await noSidewaysScroll(page);

  // Compare Mara and Eli: pick them in the filter.
  await page.getByRole("button", { name: "Filter" }).click();
  const filter = page.getByRole("dialog", { name: "Filter analytics" });
  await filter.getByText("Eli Porter", { exact: true }).click();
  await filter.getByText("Mara Jensen", { exact: true }).click();
  await filter.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("button", { name: "Filter, 2 applied" })).toBeVisible();
  await expect(leaderboard(page).getByRole("rowheader")).toHaveText(["Eli Porter", "Mara Jensen", "Total"]);
  await expect(row(page, "Leaderboard", "Mara Jensen").getByRole("link", { name: "13 created" })).toBeVisible();
  await expect(row(page, "Leaderboard", "Eli Porter").getByRole("link", { name: "20 created" })).toBeVisible();
  await expect(row(page, "Leaderboard", "Total").getByRole("link", { name: "33 created" })).toBeVisible();
  await shoot(page, testInfo, "u6-leaderboard-compare");

  // Export CSV: the same rows, one line per rep plus the totals.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
  expect(download.suggestedFilename()).toBe("rep-leaderboard.csv");
  const lines = readFileSync((await download.path())!, "utf8").replace(/^﻿/, "").trim().split("\r\n");
  expect(lines.map((l) => l.split(",")[0])).toEqual(["Rep", "Eli Porter", "Mara Jensen", "Total"]);
  expect(lines[0]).toContain("Quote-to-order rate (%)");

  // Decline reasons, every reason once, with the Other text in the customer's words.
  await tab(page, "Decline reasons").click();
  const declines = card(page, "Decline reasons");
  await expect(declines).toContainText("6 declined quotes in the window. Expired quotes are counted apart.");
  for (const reason of ["Price too high", "Found other source", "Need it sooner than quoted", "Wrong items or quantity", "Other", "No reason given"])
    await expect(row(page, "Decline reasons", reason)).toContainText(new RegExp(`^${reason}1`));
  await expect(declines.getByRole("table").getByRole("columnheader")).toHaveText([":: Reason", ":: Quotes", ":: Share", ":: Eli Porter", ":: Mara Jensen"]);
  const notes = declines.getByRole("list", { name: "Other, in the customer's words" });
  await expect(notes).toContainText(OTHER_NOTE);
  const otherQuote = (await notes.getByRole("link").first().textContent())!.trim();
  expect(otherQuote).toMatch(/^Q-\d+$/);
  await expect(notes).toContainText(`${otherQuote}, Mara Jensen`);
  await shoot(page, testInfo, "u6-decline-reasons");

  await tab(page, "Untouched quotes").click();
  await expect(page.getByRole("table", { name: "Why quotes went untouched" }).getByRole("rowheader")).toHaveText(["Eli Porter", "Mara Jensen", "Total"]);

  // Break the numbers down by team: one row per team label.
  await page.getByRole("button", { name: "Filter, 2 applied" }).click();
  await page.getByRole("button", { name: "Clear all" }).click();
  await page.getByRole("radio", { name: "Team" }).click();
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("table", { name: "Why quotes went untouched" }).getByRole("rowheader")).toHaveText(["Inside Sales", "Outside Sales", "Total"]);

  // Drill into Mara's declined count: the Quotes list (no ?scope=all, task U1), filtered to those quotes.
  await page.getByRole("button", { name: "Filter, 1 applied" }).click();
  await page.getByRole("button", { name: "Clear all" }).click();
  await page.getByRole("button", { name: "Apply filters" }).click();
  await tab(page, "Rep leaderboard").click();
  await row(page, "Leaderboard", "Mara Jensen").getByRole("link", { name: "3 declined" }).click();
  await expect(page).toHaveURL(/\/rep\/quotes\?rep=mara&from=.+&to=.+&status=declined$/);
  await expect(page.getByText(otherQuote, { exact: true }).first()).toBeVisible();
  await shoot(page, testInfo, "u6-drill-down");
});

test("Mara (a rep): My Analytics with her own numbers, no Rep leaderboard, whatever the API is asked", async ({ browser }, testInfo) => {
  const page = await signInAsMara(browser, testInfo);
  await page.goto("/rep/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My Analytics");
  await expect(page.getByText("Quotes and customer questions for your customers")).toBeVisible();
  await expect(page.getByRole("tab")).toHaveText(["Overview", "Decline reasons", "Untouched quotes", "Customer questions"]);
  await expect(page.getByRole("button", { name: "Export CSV" })).toHaveCount(0);
  await tab(page, "Untouched quotes").click();
  await expect(page.getByRole("table", { name: "Why quotes went untouched" }).getByRole("rowheader")).toHaveText(["Your quotes"]);
  await tab(page, "Decline reasons").click();
  await expect(card(page, "Decline reasons")).toContainText("3 declined quotes in the window.");
  await expect(card(page, "Decline reasons").getByRole("list", { name: "Other, in the customer's words" })).toContainText("Canyon Ridge Builders");

  // The API forces her own data: another rep, a team or a breakdown change nothing, and the CSV is the manager's.
  const own = await page.evaluate(() => fetch("/api/rep/analytics").then((r) => r.json()));
  const asked = await page.evaluate(() => fetch("/api/rep/analytics?reps=eli&teams=Outside%20Sales&breakdown=customer").then((r) => r.json()));
  expect(asked.groups.rows.map((r: { key: string }) => r.key)).toEqual(["mara"]);
  expect(asked.groups.totals.created).toBe(own.groups.totals.created);
  expect(asked.scope).toEqual(own.scope);
  expect((await page.request.get("/api/rep/analytics/csv")).status()).toBe(403);
  await page.context().close();
});
