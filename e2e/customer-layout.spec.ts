import { expect, test, type Page } from "@playwright/test";

// The customer site (plan U10; decisions 41, 49, 53; frames C_CVE0 to C_CVL5): Querent is a box on the
// supplier's own site. With no session, / shows the visitor box: the public starter questions, every
// question answered "Sign in to continue." by the R-14 stub, and Sign in opens the demo chooser at
// /demo. Signed in, Dana gets the same box with Orders and My rep (side sheets) and the notification
// bell, from which she opens a quote with Accept, Request changes and Decline. No contacts or quotes
// sidebars, no three panes, no tabs, no ERP indicator, no Switch workspace. Built and checked at
// 1920x1080 (decision 51); there is no phone layout (decision 43). The look is proven against the
// frames in e2e/frames-customer.spec.ts.
//
// Runs on the mockup's seed day through the test-only reset (see golden-quote-flow.spec.ts):
// start your own server with QUERENT_E2E_RESET=1, or let playwright.config.ts start one.

const SEED_DATE = "2026-09-23";
const VIEWPORT = { width: 1920, height: 1080 };

test.beforeAll(async ({ playwright }, testInfo) => {
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const response = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(response.status(), "POST /api/test/reset failed: start the server with QUERENT_E2E_RESET=1").toBe(200);
  } finally {
    await api.dispose();
  }
});

async function signInAsDana(page: Page) {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/demo");
  await page.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel("Ask a question")).toBeVisible();
}

test("visitor: the public box answers every question with Sign in to continue, and Sign in opens the chooser", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  const customerCalls: string[] = [];
  page.on("request", (r) => { if (/\/api\/query\/customer\//.test(r.url())) customerCalls.push(r.url()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Ask about stock,items and branches.");
  await expect(page.getByText("Open to everyone. Sign in to see your own prices, orders and quotes.")).toBeVisible();
  for (const name of ["Orders", "My rep", "Notifications"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);

  await test.step("a starter question and a typed one: only Sign in to continue comes back", async () => {
    await page.getByRole("button", { name: "Do you have 1/2 in grade 8 hex bolts in stock?" }).click();
    await expect(page.locator(".answer-bubble")).toHaveText(["Sign in to continue."]);
    await page.getByLabel("Ask a question").fill("What did Wasatch pay for nitrile gloves? Show quote Q-24817.");
    await page.getByLabel("Ask a question").press("Enter");
    await expect(page.locator(".answer-bubble")).toHaveText(["Sign in to continue.", "Sign in to continue."]);
    await expect(page.locator("body")).not.toContainText("$");
    expect(customerCalls).toEqual([]);
  });

  await test.step("Sign in opens the demo chooser at /demo", async () => {
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByText("Who would you like to explore as?")).toBeVisible();
  });
});

test("Dana: the box with Orders, My rep and the bell, and none of the old workspace", async ({ page }) => {
  await signInAsDana(page);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Your business.Your answers.");
  for (const gone of ["Contacts", "Quotes"]) await expect(page.getByRole("complementary", { name: gone })).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Switch workspace" })).toHaveCount(0);
  await expect(page.getByText(/Last updated|Waiting for first update|Update delayed/)).toHaveCount(0);
  // No phone layout to fall into: nothing scrolls sideways at the build size.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(VIEWPORT.width);

  await test.step("Orders: her own previous orders, five, then Show N more", async () => {
    const own = await page.evaluate(() => fetch("/api/query/customer/orders").then((r) => r.json()));
    await page.getByRole("button", { name: "Orders" }).click();
    const sheet = page.getByRole("dialog", { name: "Previous orders" });
    await expect(sheet.locator("[data-order]")).toHaveCount(5);
    await expect(sheet.locator("[data-order]").first()).toContainText(own[0].order_number);
    await expect(sheet).toContainText(String(own.length));
    await sheet.getByRole("button", { name: `Show ${own.length - 5} more` }).click();
    await expect(sheet.locator("[data-order]")).toHaveCount(own.length);
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toHaveCount(0);
  });

  await test.step("My rep: Brandi with her title, phone and email", async () => {
    await page.getByRole("button", { name: "My rep" }).click();
    const sheet = page.getByRole("dialog", { name: "Your rep" });
    for (const text of ["BG", "Brandi Gallegos", "Inside Sales", "(801) 111-2222", "brandi.gallegos@herrickindustrial.com"]) await expect(sheet.getByText(text, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  });
});

test("Dana's bell: the unread count, a quote opened with Accept, Request changes and Decline, Mark all read", async ({ page }) => {
  await signInAsDana(page);
  const bell = page.getByRole("button", { name: "Notifications" });
  const { unread } = await page.evaluate(() => fetch("/api/query/customer/notifications").then((r) => r.json()));
  expect(unread).toBeGreaterThan(1);
  await expect(bell).toHaveText(String(unread));

  await test.step("a quote notification opens the quote preview and is read", async () => {
    await bell.click();
    const panel = page.getByRole("dialog", { name: "Notifications" });
    const row = panel.locator('[data-read="false"]', { hasText: /^Quote Q-\d+ is ready to review/ }).first();
    const number = /Q-\d+/.exec((await row.textContent())!)![0];
    await row.click();
    const modal = page.getByRole("dialog", { name: `Quote ${number}` });
    await expect(modal.locator(".qp-state")).toHaveText("Sent");
    for (const name of ["Accept", "Request changes", "Decline"]) await expect(modal.getByRole("button", { name, exact: true })).toBeEnabled();
    await expect(bell).toHaveText(String(unread - 1));
    await modal.getByRole("button", { name: "Close" }).click();
  });

  await test.step("Mark all read clears the count", async () => {
    await bell.click();
    await page.getByRole("dialog", { name: "Notifications" }).getByRole("button", { name: "Mark all read" }).click();
    await expect(page.getByRole("dialog", { name: "Notifications" }).locator('[data-read="false"]')).toHaveCount(0);
    await expect(bell).toHaveText("");
  });
});

test("Dana signs out from the account chip and is back at the visitor box", async ({ page }) => {
  await signInAsDana(page);
  await page.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Open to everyone. Sign in to see your own prices, orders and quotes.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
