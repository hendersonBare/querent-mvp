import { readFileSync } from "node:fs";
import { expect, test, type APIRequest, type Browser, type Page, type TestInfo } from "@playwright/test";

// The Team dashboard (v3 spec §6 Team, §7; decisions 23–25; task D3):
//   - Brandi (the manager) opens Team, ticks two reps to compare them, reads the decline reasons with
//     the Other text, drills from a count into the manager’s Quotes list, and exports the CSV.
//   - On a phone the leaderboard scrolls inside its own box; the page never scrolls sideways.
//   - Mara (a rep) has no Teams and Reps section: /rep/teams (and the old /rep/team) sends her to her
//     Quotes and the API answers 403. The page moved to /rep/teams in plan U2 (decision 46); U7 rebuilds it.
// Mara's session is the demo cookie set directly (her chooser button is walked in e2e/demo-script.spec.ts).
//
// beforeAll resets the database to the seed pinned to the mockup's day (POST /api/test/reset; the
// server needs QUERENT_E2E_RESET=1). The seed's demo book (task F1, src/server/db/seed/demo.ts) is
// dated from the reset time, so the last 30 days always hold Mara's 13 quotes and Eli's 20 (two of
// them moved from Mara): sends, accepted deliveries, declines with every reason (Mara's Other with a
// note), expired quotes and fresh, aging and overdue drafts.

const SEED_DATE = "2026-09-23";
const COOKIE = "querent-persona";
const OTHER_NOTE = "The general contractor is supplying the anchors on this job.";

test.describe.configure({ mode: "serial" });

async function resetDemo(request: APIRequest, testInfo: TestInfo) {
  const api = await request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const response = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(response.status(), "POST /api/test/reset failed: start the server with QUERENT_E2E_RESET=1").toBe(200);
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
  await page.getByRole("navigation", { name: "Rep portal" }).getByRole("link", { name: "Teams and Reps" }).click();
  await expect(page).toHaveURL(/\/rep\/teams$/);
  await expect(page.getByRole("heading", { name: "Teams and Reps", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  await expect(repRow(page, "Total")).toBeVisible();

  // Compare Mara and Eli: untick Brandi and Nora.
  await page.getByRole("checkbox", { name: "Brandi Gallegos" }).uncheck();
  await page.getByRole("checkbox", { name: "Nora Chen" }).uncheck();
  await expect(leaderboard(page).getByRole("rowheader")).toHaveText(["Eli Porter", "Mara Jensen", "Total"]);
  await expect(repRow(page, "Mara Jensen").getByRole("cell", { name: "13 created" })).toBeVisible();
  await expect(repRow(page, "Eli Porter").getByRole("cell", { name: "20 created" })).toBeVisible();
  await expect(repRow(page, "Total").getByRole("cell", { name: "33 created" })).toBeVisible();
  await screenshot(page, testInfo, "compare-two-reps");

  // Decline reasons, with the Other text in the customer's words.
  const declines = page.getByRole("region", { name: "Decline reasons" });
  await expect(declines.getByRole("row", { name: /Price too high 1/ })).toBeVisible();
  await expect(declines.getByRole("row", { name: /Other 1/ })).toBeVisible();
  const notes = declines.getByRole("list", { name: "Other reasons in their words" });
  await expect(notes).toContainText(OTHER_NOTE);
  const otherQuote = (await notes.getByRole("link").first().textContent())!.trim();
  expect(otherQuote).toMatch(/^Q-\d+$/);
  await expect(notes).toContainText(`${otherQuote}, Mara Jensen`);
  await expect(page.getByRole("table", { name: /Why quotes went untouched/ })).toBeVisible();
  await screenshot(page, testInfo, "decline-reasons");

  // Export CSV: the same rows, one line per rep plus the totals.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export CSV" }).click()]);
  expect(download.suggestedFilename()).toBe("team-metrics.csv");
  const lines = readFileSync((await download.path())!, "utf8").replace(/^﻿/, "").trim().split("\r\n");
  expect(lines.map((l) => l.split(",")[0])).toEqual(["Rep", "Eli Porter", "Mara Jensen", "Total"]);
  expect(lines[0]).toContain("Quote-to-order rate (%)");

  // Drill into Mara's declined count: the manager's Quotes list (no ?scope=all, task U1), filtered to those quotes.
  await repRow(page, "Mara Jensen").getByRole("link", { name: "3 declined" }).click();
  await expect(page).toHaveURL(/\/rep\/quotes\?rep=mara&from=.+&to=.+&status=declined$/);
  const rows = page.getByRole("table").getByRole("rowheader");
  await expect(rows).toHaveCount(3);
  await expect(page.getByRole("table").getByRole("link", { name: otherQuote, exact: true })).toBeVisible();
  await expect(page.getByText(/Created between/)).toBeVisible();
  await screenshot(page, testInfo, "drill-down");
});

test("Mara (a rep) cannot open the Team dashboard", async ({ browser }, testInfo) => {
  const page = await signInAsMara(browser, testInfo);
  expect((await page.request.get("/api/rep/team/metrics?from=2026-09-01T06:00:00.000Z&to=2026-10-01T06:00:00.000Z")).status()).toBe(403);
  expect((await page.request.get("/api/rep/team/metrics.csv?from=2026-09-01T06:00:00.000Z&to=2026-10-01T06:00:00.000Z")).status()).toBe(403);
  for (const path of ["/rep/teams", "/rep/team"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/rep\/quotes$/);
  }
  await expect(page.getByRole("navigation", { name: "Rep portal" }).getByRole("link", { name: "Teams and Reps" })).toHaveCount(0);
  await page.context().close();
});
