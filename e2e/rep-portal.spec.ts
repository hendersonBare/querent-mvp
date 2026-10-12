import { expect, test, type Page, type TestInfo } from "@playwright/test";

// Rep portal shell (task 3.1; spec §4; docs/design/screens/03): the section nav and the Quotes
// unread badge. Scope is role based (task U1): there is no "Viewing" customer picker, ?customer= is
// each page's own filter, and no nav link carries it.
//
// beforeAll resets the database to the seed pinned to the mockup's day through the test-only
// POST /api/test/reset, so the badge starts at the seeded count: Q-24817 is unread for Brandi.
// That hook exists only when the server runs with QUERENT_E2E_RESET=1 (playwright.config.ts sets
// it for the server it starts: CI, or locally with QUERENT_WEBSERVER=1).

const SEED_DATE = "2026-09-23";
const SECTIONS = [
  ["Quotes", "/rep/quotes"],
  ["Customers", "/rep/customers"],
  ["Orders", "/rep/orders"],
  ["Items", "/rep/items"],
  ["Analytics", "/rep/analytics"],
  // Brandi is the manager: Team is hers alone (v3 spec §6, task D3).
  ["Team", "/rep/team"],
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
const sectionLink = (page: Page, label: string) =>
  portalNav(page).getByRole("link", { name: new RegExp(`^${label}\\b`) });
const pageTitle = (page: Page) => page.getByRole("heading", { level: 1 });
/** Analytics' "Total queries" number. */
const totalQueries = (page: Page) => page.locator(".metric").filter({ hasText: "Total queries" }).locator("strong");
async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}
async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

test("nav: the header matches mockup 03 and every section opens its own page", async ({ page }, testInfo) => {
  await signInAsBrandi(page);
  const banner = page.getByRole("banner");
  await expect(banner).toContainText("Querent");
  await expect(banner).toContainText("Herrick Industrial Supply");
  await expect(page.getByRole("searchbox", { name: "Search the portal" })).toHaveAttribute(
    "placeholder",
    "Search quotes, customers, SKUs",
  );
  await expect(page.getByRole("link", { name: /^Notifications/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Account: Brandi Gallegos" })).toHaveText("BG");
  await expect(portalNav(page).getByRole("link")).toHaveText([/^Quotes/, "Customers", "Orders", "Items", "Analytics", "Team", "Settings"]);
  await attachScreenshot(page, testInfo, "rep-portal-desktop-quotes");

  for (const [label, path] of SECTIONS) {
    await sectionLink(page, label).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(pageTitle(page)).toHaveText(label);
    await expect(page).toHaveTitle(`${label} · Querent`);
    await expect(sectionLink(page, label)).toHaveAttribute("aria-current", "page");
    await expect(portalNav(page).locator('[aria-current="page"]')).toHaveCount(1);
  }

  // The old supplier sections live on: query analytics under Analytics, the rest under Settings
  // (task 6.1; e2e/rep-settings.spec.ts covers each tab).
  await sectionLink(page, "Analytics").click();
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

test("nav: search is sample-only, and the account menu switches workspace", async ({ page }) => {
  await signInAsBrandi(page);
  await page.getByRole("searchbox", { name: "Search the portal" }).fill("Q-24817");
  await page.getByRole("searchbox", { name: "Search the portal" }).press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Search isn’t available yet" })).toBeVisible();

  await page.getByRole("button", { name: "Account: Brandi Gallegos" }).click();
  const menu = page.getByRole("menu", { name: "Account" });
  await expect(menu).toContainText("Brandi Gallegos");
  await expect(menu).toContainText("Inside Sales · Herrick Industrial Supply");
  await menu.getByRole("menuitem", { name: "Switch workspace" }).click();
  await expect(page.getByText("Who would you like to explore as?")).toBeVisible();
  // Without the supplier persona, the portal sends you back to the chooser.
  await page.goto("/rep/settings");
  await expect(page).toHaveURL(/\/$/);
});

test("customer filter: ?customer= narrows one page, and no nav link carries it (task U1)", async ({ page }) => {
  await signInAsBrandi(page);
  await expect(page.getByLabel("Viewing")).toHaveCount(0);

  await sectionLink(page, "Analytics").click();
  await expect(totalQueries(page)).not.toHaveText("");
  const all = Number(await totalQueries(page).textContent());
  expect(all).toBeGreaterThan(0);

  // A placeholder customer has no chat history (spec §2).
  await page.goto("/rep/analytics?customer=great-basin");
  await expect(totalQueries(page)).toHaveText("0");
  await expect(page.getByText("Quotes and customer questions for Great Basin Fabrication")).toBeVisible();

  // No section link carries the filter, and following one drops it.
  for (const [label, path] of SECTIONS) await expect(sectionLink(page, label)).toHaveAttribute("href", path);
  await sectionLink(page, "Orders").click();
  await expect(page).toHaveURL(/\/rep\/orders$/);
  await expect(page.getByText("Viewing All customers")).toBeVisible();

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
  await expect(totalQueries(page)).toHaveText(String(all));
});

test("badge: Quotes shows the rep's unread count, whatever a page filters by", async ({ page }) => {
  await signInAsBrandi(page);
  // The seed has one quote unread for Brandi: the sample Q-24817 (ready_for_review).
  // Fetched from the page: the production session cookie is Secure, which the browser sends to
  // 127.0.0.1 over http but Playwright's own request client does not.
  // attention (task A2) counts her red quotes; e2e/rep-aging.spec.ts checks it.
  expect(await page.evaluate(() => fetch("/api/rep/badges").then((r) => r.json()))).toEqual({ quotes: 1, attention: expect.any(Number) });
  await expect(sectionLink(page, "Quotes")).toHaveAccessibleName("Quotes 1 unread");
  await expect(page.getByRole("link", { name: "Notifications: 1 unread quote" })).toBeVisible();
  await expect(page.getByText("Viewing All customers · 1 unread quote")).toBeVisible();

  await page.goto("/rep/customers?customer=great-basin");
  await expect(sectionLink(page, "Quotes")).toHaveAccessibleName("Quotes 1 unread");
});

test("phone (390px): the nav scrolls, the badge fits, and nothing scrolls sideways", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsBrandi(page);
  await expect(page.getByRole("searchbox", { name: "Search the portal" })).toBeHidden();
  await expect(sectionLink(page, "Quotes")).toHaveAccessibleName("Quotes 1 unread");
  await expect(page.getByLabel("Viewing")).toHaveCount(0);
  await noSidewaysScroll(page);
  await attachScreenshot(page, testInfo, "rep-portal-390-quotes");

  for (const [label, path] of SECTIONS) {
    await sectionLink(page, label).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(pageTitle(page)).toHaveText(label);
    await expect(sectionLink(page, label)).toBeInViewport({ ratio: 1 });
    await noSidewaysScroll(page);
  }
  await page.goto("/rep/settings?tab=access&customer=wasatch");
  await expect(accessCustomer(page)).toHaveValue("wasatch");
  await noSidewaysScroll(page);
  await attachScreenshot(page, testInfo, "rep-portal-390-settings");
});
