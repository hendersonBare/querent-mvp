import { expect, test, type Page, type TestInfo } from "@playwright/test";

// Rep portal shell (plan U2; spec §4): the rail's nav, Sign out, and the header bell listing the
// rep's unread quotes. Scope is role based (task U1): there is no "Viewing" customer picker,
// ?customer= is each page's own filter, and no nav link carries it. e2e/frames-shell.spec.ts diffs
// the rail and the dropdowns with the frames. No phone layout (decision 43).
//
// beforeAll resets the database to the seed pinned to the mockup's day through the test-only
// POST /api/test/reset, so the bell starts with the seeded unread quote: Q-24817 for Brandi.
// That hook exists only when the server runs with QUERENT_E2E_RESET=1 (playwright.config.ts sets
// it for the server it starts: CI, or locally with QUERENT_WEBSERVER=1).

const SEED_DATE = "2026-09-23";
const SECTIONS = [
  ["Quotes", "/rep/quotes"],
  ["Customers", "/rep/customers"],
  ["Orders", "/rep/orders"],
  ["Stock", "/rep/stock"],
  ["Analytics", "/rep/analytics"],
  // Brandi is the manager: Teams and Reps is hers alone (v3 spec §6, task D3; decision 46).
  ["Teams and Reps", "/rep/teams"],
  ["Settings", "/rep/settings"],
] as const;
const CUSTOMERS = [
  "All customers",
  "Canyon Ridge Builders",
  "Great Basin Fabrication",
  "Uinta Facility Services",
  "Utah Valley Electric",
  "Wasatch Mechanical Contractors",
  "Weber Basin Fabricators",
];
const accessCustomer = (page: Page) => page.getByRole("combobox", { name: "Customer" });

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

async function signInAsBrandi(page: Page) {
  await page.goto("/demo");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
}
const portalNav = (page: Page) => page.getByRole("navigation", { name: "Rep portal" });
const sectionLink = (page: Page, label: string) => portalNav(page).getByRole("link", { name: label, exact: true });
const pageTitle = (page: Page) => page.getByRole("heading", { level: 1 });
/** Analytics' "Total queries" number. */
/** Total queries on Analytics > Customer questions (plan U6: the old query analytics moved to that tab). */
async function totalQueries(page: Page) {
  const tab = page.getByRole("tab", { name: "Customer questions" });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
  return page.getByTestId("total-queries");
}
async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

test("nav: the rail names every section, with an icon, and each opens its own page", async ({ page }, testInfo) => {
  await signInAsBrandi(page);
  const rail = page.getByRole("complementary").first();
  await expect(rail.getByRole("img", { name: "Querent" })).toBeVisible();
  await expect(rail).toContainText("Herrick Industrial Supply");
  await expect(rail).toContainText("Brandi G.");
  await expect(rail).toContainText("Manager");
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Account/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Needs attention, \d+ items?$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Notifications" })).toBeVisible();
  await expect(portalNav(page).getByRole("link")).toHaveText(["Quotes", "Customers", "Orders", "Stock", "Analytics", "Teams and Reps", "Settings"]);
  await expect(portalNav(page).locator("a svg")).toHaveCount(SECTIONS.length);
  await attachScreenshot(page, testInfo, "rep-portal-desktop-quotes");

  for (const [label, path] of SECTIONS) {
    await sectionLink(page, label).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(pageTitle(page)).toHaveText(label);
    await expect(page).toHaveTitle(`${label} · Querent`);
    await expect(sectionLink(page, label)).toHaveAttribute("aria-current", "page");
    await expect(portalNav(page).locator('[aria-current="page"]')).toHaveCount(1);
  }

  // The old supplier sections live on: query analytics under Analytics > Customer questions (plan U6),
  // the rest under Settings (task 6.1; e2e/rep-settings.spec.ts covers each tab).
  await sectionLink(page, "Analytics").click();
  await page.getByRole("tab", { name: "Customer questions" }).click();
  await expect(page.getByRole("heading", { name: "Queries by category" })).toBeVisible();
  await sectionLink(page, "Settings").click();
  const tabs = page.getByRole("navigation", { name: "Settings sections" });
  // Brandi is the manager: Reps and Aging are hers alone (task D1).
  await expect(tabs.getByRole("link")).toHaveText(["Rep assignments", "Reps", "Customer access", "Margin floors", "Pricing & delivery", "Aging", "Data sources"]);
  await tabs.getByRole("link", { name: "Customer access" }).click();
  await expect(page.getByRole("switch", { name: "Pricing" })).toBeVisible();
  await tabs.getByRole("link", { name: "Data sources" }).click();
  await expect(page.getByRole("heading", { name: "Herrick Industrial Supply ERP" })).toBeVisible();

  // /rep opens Quotes.
  await page.goto("/rep");
  await expect(page).toHaveURL(/\/rep\/quotes$/);
});

test("Sign out asks first, then ends the session and returns to /", async ({ page }) => {
  await signInAsBrandi(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  const dialog = page.getByRole("dialog", { name: "Sign out of Querent?" });
  await expect(dialog).toContainText("You are signed in as Brandi G., Manager at Herrick Industrial Supply.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/rep\/quotes$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  // Signed out, / shows the visitor box; its Sign in opens the chooser (decision 53).
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  // Without the supplier persona, the portal sends you back to /.
  await page.goto("/rep/settings");
  await expect(page).toHaveURL(/\/$/);
});

test("customer filter: ?customer= narrows one page, and no nav link carries it (task U1)", async ({ page }) => {
  await signInAsBrandi(page);
  await expect(page.getByLabel("Viewing")).toHaveCount(0);

  await sectionLink(page, "Analytics").click();
  await expect(await totalQueries(page)).not.toHaveText("");
  const all = Number(await (await totalQueries(page)).textContent());
  expect(all).toBeGreaterThan(0);

  // A placeholder customer has no chat history (spec §2).
  await page.goto("/rep/analytics?customer=great-basin");
  await expect(await totalQueries(page)).toHaveText("0");
  await expect(page.getByText("Quotes and customer questions for Great Basin Fabrication")).toBeVisible();

  // No section link carries the filter, and following one drops it.
  for (const [label, path] of SECTIONS) await expect(sectionLink(page, label)).toHaveAttribute("href", path);
  await sectionLink(page, "Orders").click();
  await expect(page).toHaveURL(/\/rep\/orders$/);
  // The Orders picker (plan U5, C_ORBase) shows every customer again.
  await expect(page.getByRole("combobox", { name: "Customer, All customers" })).toBeVisible();

  // Settings > Customer access picks its own customer.
  await sectionLink(page, "Settings").click();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "Customer access" }).click();
  await expect(page).toHaveURL(/\/rep\/settings\?tab=access$/);
  await expect(accessCustomer(page).locator("option")).toHaveText(CUSTOMERS);
  await accessCustomer(page).selectOption("great-basin");
  await expect(page).toHaveURL(/\/rep\/settings\?tab=access&customer=great-basin$/);
  await expect(page.getByText("What Querent answers in chat for Great Basin Fabrication.")).toBeVisible();
  await accessCustomer(page).selectOption("wasatch");
  await expect(page).toHaveURL(/\/rep\/settings\?tab=access&customer=wasatch$/);
  await expect(page.getByText("What Querent answers in chat for Wasatch Mechanical Contractors.")).toBeVisible();

  // A reload keeps the page's filter; leaving the page drops it.
  await page.reload();
  await expect(accessCustomer(page)).toHaveValue("wasatch");
  await sectionLink(page, "Analytics").click();
  await expect(page).toHaveURL(/\/rep\/analytics$/);
  await expect(await totalQueries(page)).toHaveText(String(all));
});

test("bell: lists the rep's unread quotes, whatever a page filters by, and opens in place", async ({ page }) => {
  await signInAsBrandi(page);
  // The seed has one quote unread for Brandi: the sample Q-24817 (ready_for_review).
  // Fetched from the page: the production session cookie is Secure, which the browser sends to
  // 127.0.0.1 over http but Playwright's own request client does not.
  const badges = await page.evaluate(() => fetch("/api/rep/badges").then((r) => r.json()));
  expect(badges).toMatchObject({ quotes: 1, attention: expect.any(Number) });
  expect(badges.bell.map((b: { label: string }) => b.label)).toEqual(["Q-24817 requested by Dana Ortiz"]);
  await expect(page.getByText("Viewing All customers · 1 unread quote")).toBeVisible();
  for (const path of ["/rep/quotes", "/rep/customers?customer=great-basin"]) {
    await page.goto(path);
    await page.getByRole("button", { name: "Notifications" }).click();
    const bell = page.getByRole("dialog", { name: "Notifications" });
    await expect(bell.getByRole("button")).toHaveText([/^Q-24817 requested by Dana Ortiz/]);
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(path);
    await page.keyboard.press("Escape");
    await expect(bell).toHaveCount(0);
  }
});
