import { readFileSync } from "node:fs";
import { expect, test, type APIRequest, type Browser, type Page, type TestInfo } from "@playwright/test";

// The Team dashboard (v3 spec §6 Team, §7; decisions 23–25; task D3):
//   - Brandi (the manager) opens Team, ticks two reps to compare them, reads the decline reasons with
//     the Other text, drills from a count into the All reps Quotes list, and exports the CSV.
//   - On a phone the leaderboard scrolls inside its own box; the page never scrolls sideways.
//   - Mara (a rep) has no Team section: /rep/team sends her to her Quotes and the API answers 403.
// Mara has no chooser button yet (F1, OA-18), so her session is the demo cookie set directly.
//
// beforeAll resets the database to the seed pinned to the mockup's day (POST /api/test/reset; the
// server needs QUERENT_E2E_RESET=1), then POST /api/test/team-quotes adds quotes for Mara and Nora
// made in the last few days through the real services: sends, declines (one with an Other note),
// drafts, and one of Mara's moved to Eli.

const SEED_DATE = "2026-09-23";
const COOKIE = "querent-persona";
type Fixture = { declined_other: string; declined_price: string; other_note: string; moved: string };
let fixture: Fixture;

test.describe.configure({ mode: "serial" });

async function resetDemo(request: APIRequest, testInfo: TestInfo, withQuotes: boolean) {
  const api = await request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const response = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(response.status(), "POST /api/test/reset failed: start the server with QUERENT_E2E_RESET=1").toBe(200);
    if (withQuotes) {
      const added = await api.post("/api/test/team-quotes");
      expect(added.status()).toBe(200);
      fixture = await added.json();
    }
  } finally {
    await api.dispose();
  }
}
test.beforeAll(async ({ playwright }, testInfo) => resetDemo(playwright.request, testInfo, true));
test.afterAll(async ({ playwright }, testInfo) => resetDemo(playwright.request, testInfo, false));

async function signInAsBrandi(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
}
async function signInAsMara(browser: Browser, testInfo: TestInfo) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: COOKIE, value: "mara", url: String(testInfo.project.use.baseURL) }]);
  return context.newPage();
}
const leaderboard = (page: Page) => page.getByRole("table", { name: /Leaderboard/ });
const repRow = (page: Page, name: string) => leaderboard(page).getByRole("row").filter({ has: page.getByRole("rowheader", { name }) });
async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

test("Brandi compares two reps, reads the decline reasons, drills into the quotes and exports the CSV", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsBrandi(page);
  await page.getByRole("navigation", { name: "Rep portal" }).getByRole("link", { name: "Team" }).click();
  await expect(page).toHaveURL(/\/rep\/team$/);
  await expect(page.getByRole("heading", { name: "Team", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  await expect(repRow(page, "Total")).toBeVisible();

  // Compare Mara and Nora: untick Brandi and Eli.
  await page.getByRole("checkbox", { name: "Brandi Gallegos" }).uncheck();
  await page.getByRole("checkbox", { name: "Eli Porter" }).uncheck();
  await expect(leaderboard(page).getByRole("rowheader")).toHaveText(["Mara Jensen", "Nora Chen", "Total"]);
  await expect(repRow(page, "Mara Jensen").getByRole("cell", { name: "2 created" })).toBeVisible();
  await expect(repRow(page, "Nora Chen").getByRole("cell", { name: "2 created" })).toBeVisible();
  await expect(repRow(page, "Total").getByRole("cell", { name: "4 created" })).toBeVisible();
  await screenshot(page, testInfo, "compare-two-reps");

  // Decline reasons, with the Other text in the customer's words.
  const declines = page.getByRole("region", { name: "Decline reasons" });
  await expect(declines.getByRole("row", { name: /Price too high 1/ })).toBeVisible();
  await expect(declines.getByRole("row", { name: /Other 1/ })).toBeVisible();
  const notes = declines.getByRole("list", { name: "Other reasons in their words" });
  await expect(notes).toContainText(fixture.other_note);
  await expect(notes.getByRole("link", { name: fixture.declined_other })).toBeVisible();
  await expect(page.getByRole("table", { name: /Why quotes went untouched/ })).toBeVisible();
  await screenshot(page, testInfo, "decline-reasons");

  // Export CSV: the same rows, one line per rep plus the totals.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export CSV" }).click()]);
  expect(download.suggestedFilename()).toBe("team-metrics.csv");
  const lines = readFileSync((await download.path())!, "utf8").replace(/^﻿/, "").trim().split("\r\n");
  expect(lines.map((l) => l.split(",")[0])).toEqual(["Rep", "Mara Jensen", "Nora Chen", "Total"]);
  expect(lines[0]).toContain("Quote-to-order rate (%)");

  // Drill into Mara's declined count: the All reps Quotes list, filtered to those quotes.
  await repRow(page, "Mara Jensen").getByRole("link", { name: "1 declined" }).click();
  await expect(page).toHaveURL(/\/rep\/quotes\?scope=all&rep=mara&from=.+&to=.+&status=declined$/);
  const rows = page.getByRole("table").getByRole("rowheader");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(fixture.declined_other);
  await expect(page.getByText(/Created between/)).toBeVisible();
  await screenshot(page, testInfo, "drill-down");
});

test("On a phone the leaderboard scrolls inside its own box", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsBrandi(page);
  await page.goto("/rep/team");
  await expect(repRow(page, "Total")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  const box = page.getByRole("region", { name: "Leaderboard" });
  expect(await box.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await screenshot(page, testInfo, "team-390");
});

test("Mara (a rep) cannot open the Team dashboard", async ({ browser }, testInfo) => {
  const page = await signInAsMara(browser, testInfo);
  expect((await page.request.get("/api/rep/team/metrics?from=2026-09-01T06:00:00.000Z&to=2026-10-01T06:00:00.000Z")).status()).toBe(403);
  expect((await page.request.get("/api/rep/team/metrics.csv?from=2026-09-01T06:00:00.000Z&to=2026-10-01T06:00:00.000Z")).status()).toBe(403);
  await page.goto("/rep/team");
  await expect(page).toHaveURL(/\/rep\/quotes$/);
  await expect(page.getByRole("navigation", { name: "Rep portal" }).getByRole("link", { name: "Team" })).toHaveCount(0);
  await page.context().close();
});
