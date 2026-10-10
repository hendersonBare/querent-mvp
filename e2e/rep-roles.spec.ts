import { expect, test, type APIRequest, type Browser, type Page, type TestInfo } from "@playwright/test";

// Roles (v3 spec §5, §6 Settings, §8; decisions 16, 20, 21; task D1):
//   - Mara is a rep: Settings has no Reps or Aging tab for her, and every manager route answers 403.
//   - Brandi is the manager: she edits an aging threshold (the Quotes list follows it) and a team
//     label, and can mark a rep inactive only once that rep's customers are reassigned. An inactive
//     rep's session is refused.
// Mara has no chooser button yet (F1, OA-18), so her session is the demo cookie set directly.
//
// beforeAll/afterAll reset the database to the seed pinned to the mockup's day (POST /api/test/reset;
// the server needs QUERENT_E2E_RESET=1, which playwright.config.ts sets for the server it starts).
// Seed: Brandi has Wasatch and Great Basin, Mara has Canyon Ridge, Nora has Uinta, Eli has none.
// Q-24789 was sent 100 hours before the reset, so it is Aging (amber) under the 72 h / 168 h defaults.

const SEED_DATE = "2026-09-23";
const COOKIE = "querent-persona";

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
/** Mara in her own browser context, signed in through the demo cookie. */
async function signInAsMara(browser: Browser, testInfo: TestInfo) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: COOKIE, value: "mara", url: String(testInfo.project.use.baseURL) }]);
  return context.newPage();
}
const settingsTabs = (page: Page) => page.getByRole("navigation", { name: "Settings sections" });
const quoteStatus = (page: Page, number: string) =>
  page.getByRole("table").getByRole("rowgroup").filter({ has: page.getByRole("link", { name: number, exact: true }) }).getByRole("cell").nth(2);
async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}
async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

test("Mara (a rep) has no manager settings, and the manager APIs refuse her", async ({ browser }, testInfo) => {
  const page = await signInAsMara(browser, testInfo);
  await page.goto("/rep/settings");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
  await expect(settingsTabs(page).getByRole("link")).toHaveText(["Rep assignments", "Customer access", "Margin floors", "Pricing & delivery", "Data sources"]);
  // A typed ?tab= falls back to Rep assignments.
  for (const tab of ["aging", "reps"]) {
    await page.goto(`/rep/settings?tab=${tab}`);
    await expect(page.getByRole("heading", { name: "Rep assignments" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Aging thresholds" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Reps", exact: true })).toHaveCount(0);
  }
  await screenshot(page, testInfo, "mara-settings");

  const api = page.request;
  expect((await api.get("/api/rep/settings/aging")).status()).toBe(403);
  expect((await api.put("/api/rep/settings/aging", { data: { rfrAmberH: 1, rfrRedH: 2, crAmberH: 1, crRedH: 2, sentAmberH: 1, sentRedH: 2 } })).status()).toBe(403);
  expect((await api.get("/api/rep/team/reps")).status()).toBe(403);
  expect((await api.put("/api/rep/team/reps/eli", { data: { active: false } })).status()).toBe(403);
  const settings = await (await api.get("/api/rep/settings")).json();
  expect(settings.rep_id).toBe("mara");
  expect(settings.manager).toBeNull();
  await page.context().close();
});

test("Brandi edits an aging threshold, and the Quotes list follows it", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsBrandi(page);
  await expect(quoteStatus(page, "Q-24789").locator('[data-level="amber"]')).toHaveText(/^Aging/);

  await page.goto("/rep/settings");
  await settingsTabs(page).getByRole("link", { name: "Aging", exact: true }).click();
  await expect(page).toHaveURL(/\/rep\/settings\?tab=aging$/);
  await expect(page.getByRole("heading", { name: "Aging thresholds" })).toBeVisible();
  const sentRed = page.getByRole("spinbutton", { name: "Sent red hours" });
  await expect(sentRed).toHaveValue("168");
  await sentRed.fill("72");
  // (The page also has Next's empty route announcer, an alert: look inside the card.)
  await expect(page.getByRole("region", { name: "Aging thresholds" }).getByRole("alert")).toHaveText("Sent: amber must come before red.");
  await expect(page.getByRole("button", { name: "Save thresholds" })).toBeDisabled();
  await sentRed.fill("96");
  await page.getByRole("button", { name: "Save thresholds" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await screenshot(page, testInfo, "brandi-aging");
  await page.reload();
  await expect(page.getByRole("spinbutton", { name: "Sent red hours" })).toHaveValue("96");

  // Sent 100 hours ago: now past the 96 h red threshold.
  await page.goto("/rep/quotes");
  await expect(quoteStatus(page, "Q-24789").locator('[data-level="red"]')).toHaveText(/^Overdue/);
});

test("Brandi sets a team label, and can mark Mara inactive only after reassigning her customer", async ({ page, browser }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsBrandi(page);
  await page.goto("/rep/settings?tab=reps");
  await expect(page.getByRole("heading", { name: "Reps", exact: true })).toBeVisible();

  // Team label.
  const label = page.getByRole("textbox", { name: "Team label for Eli Porter" });
  await expect(label).toHaveValue("Outside Sales");
  await label.fill("Field Sales");
  const eliRow = page.getByRole("row", { name: /Eli Porter/ });
  await eliRow.getByRole("button", { name: "Save" }).click();
  await expect(eliRow.getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Team label for Eli Porter" })).toHaveValue("Field Sales");

  // Mara still has Canyon Ridge: the switch is off-limits, and the API says why.
  const mara = page.getByRole("switch", { name: "Mara Jensen active" });
  await expect(mara).toBeDisabled();
  await expect(mara).toHaveAccessibleDescription("Reassign 1 customer in Rep assignments first");
  // From the page itself: the production session cookie is Secure, which Playwright's request client won't send over http.
  const refused = await page.evaluate(async () => {
    const response = await fetch("/api/rep/team/reps/mara", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: false }) });
    return { status: response.status, body: await response.json() };
  });
  expect(refused).toMatchObject({ status: 409, body: { code: "has_customers" } });
  await expect(page.getByRole("switch", { name: "Brandi Gallegos active" })).toBeDisabled();
  await screenshot(page, testInfo, "brandi-reps");

  // Reassign Canyon Ridge to Eli, then Mara can be marked inactive.
  await settingsTabs(page).getByRole("link", { name: "Rep assignments", exact: true }).click();
  await page.getByRole("combobox", { name: "Rep for Canyon Ridge Builders" }).selectOption("eli");
  await expect(page.getByRole("status").filter({ hasText: "Canyon Ridge Builders is now Eli Porter’s customer" })).toBeVisible();
  await settingsTabs(page).getByRole("link", { name: "Reps", exact: true }).click();
  await expect(mara).toBeEnabled();
  await mara.click();
  await expect(mara).toHaveAttribute("aria-checked", "false");
  await expect(mara).toHaveAccessibleDescription("Inactive");

  // Mara's session is refused now, and she can't be given a customer.
  const maraPage = await signInAsMara(browser, testInfo);
  expect((await maraPage.request.get("/api/rep/badges")).status()).toBe(403);
  // The portal sends her back to the workspace chooser, which reads her session as signed out.
  await maraPage.goto("/rep/quotes");
  await expect(maraPage).toHaveURL(/\/$/);
  await expect(maraPage.getByRole("heading", { name: "Who would you like to explore as?" })).toBeVisible();
  await maraPage.context().close();
  await settingsTabs(page).getByRole("link", { name: "Rep assignments", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Rep for Canyon Ridge Builders" }).locator("option")).not.toContainText(["Mara Jensen"]);

  // Phone: the Reps card fits.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/rep/settings?tab=reps");
  await expect(page.getByRole("switch", { name: "Mara Jensen active" })).toBeVisible();
  await noSidewaysScroll(page);
  await page.goto("/rep/settings?tab=aging");
  await expect(page.getByRole("spinbutton", { name: "Sent red hours" })).toBeVisible();
  await noSidewaysScroll(page);
  await screenshot(page, testInfo, "brandi-aging-390");
});
