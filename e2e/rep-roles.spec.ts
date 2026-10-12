import { expect, test, type APIRequest, type Browser, type Page, type TestInfo } from "@playwright/test";

// Roles (v3 spec §5, §6 Settings, §8; decisions 16, 20, 21; task D1):
//   - Mara is a rep: Settings has no Reps or Aging tab for her, and every manager route answers 403.
//   - Brandi is the manager: she edits an aging threshold (the Quotes list follows it). Teams, the
//     active flag and deactivation (blocked while the rep has customers; an inactive rep's session is
//     refused) moved to Teams and Reps in plan U7: e2e/rep-teams.spec.ts.
//   - Scope is role based (task U1): Mara reads only her own customers, quotes, orders and analytics,
//     whatever ?scope= or ?customer= say; Brandi reads the whole organization. No nav link carries a query.
// Mara's session is the demo cookie set directly (her chooser button is walked in e2e/demo-script.spec.ts).
//
// beforeAll/afterAll reset the database to the seed pinned to the mockup's day (POST /api/test/reset;
// the server needs QUERENT_E2E_RESET=1, which playwright.config.ts sets for the server it starts).
// Seed: Brandi has Wasatch and Great Basin, Mara has Canyon Ridge, Nora has Uinta, Eli has Utah Valley
// Electric and Weber Basin Fabricators (the demo book, task F1).
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
  await page.goto("/demo");
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
/** A quote's card on the Quotes board (plan U3). */
const quoteCard = (page: Page, number: string) => page.getByRole("article", { name: number, exact: true });
async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

test("Mara (a rep) has no manager settings, and the manager APIs refuse her", async ({ browser }, testInfo) => {
  const page = await signInAsMara(browser, testInfo);
  await page.goto("/rep/settings");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
  // A rep has one tab, their own margin floors (plan U8, Appendix B); a typed ?tab= opens it.
  await expect(settingsTabs(page).getByRole("link")).toHaveText(["Margin floors"]);
  for (const tab of ["aging", "reps", "assignments", "access", "pricing", "sources"]) {
    await page.goto(`/rep/settings?tab=${tab}`);
    await expect(page.getByRole("heading", { name: "My margin floors" })).toBeVisible();
    for (const name of ["Aging thresholds", "Customer access", "Delivery rates", "Organization margin floors", "Rep margins"]) await expect(page.getByRole("heading", { name })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Reps", exact: true })).toHaveCount(0);
  }
  await screenshot(page, testInfo, "mara-settings");

  const api = page.request;
  expect((await api.get("/api/rep/settings/aging")).status()).toBe(403);
  expect((await api.put("/api/rep/settings/aging", { data: { rfrAmberH: 1, rfrRedH: 2, crAmberH: 1, crRedH: 2, sentAmberH: 1, sentRedH: 2 } })).status()).toBe(403);
  expect((await api.get("/api/rep/team/reps")).status()).toBe(403);
  expect((await api.put("/api/rep/team/reps/eli", { data: { active: false } })).status()).toBe(403);
  for (const [method, path] of [["get", "/api/rep/settings/sources"], ["get", "/api/rep/settings/access"], ["get", "/api/rep/settings/org-floors"], ["get", "/api/rep/settings/margins"], ["put", "/api/rep/settings/pricing"], ["put", "/api/rep/settings/delivery"], ["put", "/api/rep/settings/access"], ["put", "/api/rep/settings/org-floors"]] as const)
    expect((await api[method](path, method === "put" ? { data: {} } : undefined)).status(), `${method} ${path}`).toBe(403);
  // GET /api/rep/settings gives her own floors only (OA-69): no customer access, no other rep's floors.
  const settings = await (await api.get("/api/rep/settings")).json();
  expect(settings).toEqual({ rep_id: "mara", manager: null, mine: expect.objectContaining({ rep: expect.objectContaining({ id: "mara" }) }) });
  await page.context().close();
});

test("Scope is role based: Mara reads only her own records, Brandi the whole organization (task U1)", async ({ page, browser }, testInfo) => {
  const mara = await signInAsMara(browser, testInfo);
  // No "Viewing" picker, and nav links carry no ?customer= even when the page has one.
  await mara.goto("/rep/quotes?customer=wasatch&scope=all");
  await expect(mara.getByLabel("Viewing")).toHaveCount(0);
  const nav = mara.getByRole("navigation", { name: "Rep portal" }).getByRole("link");
  for (const href of await nav.evaluateAll((links) => links.map((l) => l.getAttribute("href")))) expect(href).not.toMatch(/\?/);
  // Her Quotes: her own only; Wasatch (Brandi's customer) is ignored, and Brandi's sample quote isn't there.
  await expect(mara.getByRole("combobox", { name: "Customer, All my customers" })).toBeVisible();
  await expect(mara.getByRole("article", { name: "Q-24817", exact: true })).toHaveCount(0);
  await mara.goto("/rep/quotes?view=table");
  await expect(mara.getByRole("columnheader", { name: ":: Rep" })).toHaveCount(0);
  await expect(mara.getByRole("table", { name: "Quotes" }).getByRole("button", { name: "Q-24817", exact: true })).toHaveCount(0);
  // Customers: Canyon Ridge only; Wasatch's page and orders are not found for her.
  await mara.goto("/rep/customers");
  await expect(mara.getByText("1 customer", { exact: true })).toBeVisible();
  await expect(mara.getByRole("link", { name: "Canyon Ridge Builders" })).toBeVisible();
  await mara.goto("/rep/customers/wasatch");
  await expect(mara.getByRole("heading", { name: "There’s no customer at that address" })).toBeVisible();
  await mara.goto("/rep/orders");
  await expect(mara.getByText("0 orders", { exact: true })).toBeVisible();
  await mara.goto("/rep/orders/SO-51223");
  await expect(mara.getByRole("heading", { name: "There’s no order with that number" })).toBeVisible();
  const api = mara.request;
  expect((await (await api.get("/api/rep/analytics?customer=wasatch")).json()).scope).toEqual({ customer: null, customer_ids: ["canyon-ridge"], rep_id: "mara" });
  // Her Analytics count the quotes she owns, the same as her Quotes list (OA-67).
  const { win_rate: winRate, quoted } = await (await api.get("/api/rep/analytics")).json();
  const { counts } = await (await api.get("/api/rep/quotes")).json();
  expect({ quotes: winRate.won + winRate.lost + winRate.open, won: winRate.won, accepted: quoted.accepted_count }).toEqual({ quotes: counts.all, won: counts.accepted, accepted: counts.accepted });
  expect((await api.get("/api/rep/badges?scope=all")).status()).toBe(200);
  expect((await api.get("/api/rep/quotes/Q-24817")).status()).toBe(404);
  await screenshot(mara, testInfo, "mara-customers-scope");
  await mara.context().close();

  // Brandi (the manager) reads every customer and every rep's quotes, with no switch.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsBrandi(page);
  // Mara's customer's quotes are on Brandi's board; the API names their rep.
  await expect(page.getByRole("article").filter({ hasText: "Canyon Ridge Builders" }).first()).toBeVisible();
  const reps = await page.evaluate(() => fetch("/api/rep/quotes").then((r) => r.json()).then((l) => [...new Set(l.rows.map((r: { rep_name: string }) => r.rep_name))]));
  expect(reps).toEqual(expect.arrayContaining(["Brandi Gallegos", "Mara Jensen", "Eli Porter"]));
  await page.goto("/rep/customers");
  await expect(page.getByText("6 customers", { exact: true })).toBeVisible();
  await page.goto("/rep/customers/canyon-ridge");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Canyon Ridge Builders");
});

test("Brandi edits an aging threshold, and the Quotes list follows it", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsBrandi(page);
  await expect(quoteCard(page, "Q-24789")).toContainText(/Aging$/);

  await page.goto("/rep/settings");
  await settingsTabs(page).getByRole("link", { name: "Aging", exact: true }).click();
  await expect(page).toHaveURL(/\/rep\/settings\?tab=aging$/);
  await expect(page.getByRole("heading", { name: "Aging thresholds" })).toBeVisible();
  const sentRed = page.getByRole("textbox", { name: "Sent red hours" });
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
  await expect(page.getByRole("textbox", { name: "Sent red hours" })).toHaveValue("96");

  // Sent 100 hours ago: now past the 96 h red threshold.
  await page.goto("/rep/quotes");
  await expect(quoteCard(page, "Q-24789")).toContainText(/Overdue$/);
});
