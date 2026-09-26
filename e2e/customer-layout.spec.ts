import { expect, test, type Locator, type Page } from "@playwright/test";

// Customer layout (task 2.4, spec §3): the assigned rep and the departments on the left, one
// button per quote on the right ("Quote · date · $total", newest first, with a status chip). At
// 390px the sidebars collapse into Chat / Contacts / Quotes tabs and the header still fits.
//
// Runs on the mockup's seed day through the test-only reset (see golden-quote-flow.spec.ts):
// start your own server with QUERENT_E2E_RESET=1, or let playwright.config.ts start one.

const SEED_DATE = "2026-09-23";

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
  await page.goto("/");
  await page.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
  await expect(page.locator(".customer-header")).toContainText("Wasatch Mechanical Contractors");
}

/** Records every "open quote" event (the PDF preview modal subscribes to it in task 5.1). */
async function recordOpenQuote(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { opened: unknown[] };
    w.opened = [];
    window.addEventListener("querent:open-quote", (event) => w.opened.push((event as CustomEvent).detail));
  });
  return () => page.evaluate(() => (window as unknown as { opened: unknown[] }).opened);
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, "element has no box").not.toBeNull();
  return b!;
}

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("desktop: rep and departments on the left, quotes newest first on the right", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAsDana(page);
  const contacts = page.getByRole("complementary", { name: "Contacts" });
  const quotes = page.getByRole("complementary", { name: "Quotes" });
  const chat = page.getByLabel("Ask a question");
  await expect(contacts).toBeVisible();
  await expect(quotes).toBeVisible();
  await expect(chat).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Workspace" })).toBeHidden();

  await test.step("contacts on the left, the chat in the middle, quotes on the right", async () => {
    const [left, center, right] = [await box(contacts), await box(chat), await box(quotes)];
    expect(left.x + left.width).toBeLessThanOrEqual(center.x);
    expect(center.x + center.width).toBeLessThanOrEqual(right.x);
  });

  await test.step("the assigned rep is at the very top, then the departments", async () => {
    await expect(contacts.getByRole("heading")).toHaveText([
      /Your rep/i,
      /Herrick Industrial Supply/i,
      "Customer Service",
      "Accounts Receivable / Finance",
      "Warehouse / Will-call",
    ]);
    const rep = contacts.getByRole("region", { name: "Your rep" });
    await expect(rep).toContainText("Brandi Gallegos");
    await expect(rep.getByRole("link", { name: "(801) 111-2222" })).toHaveAttribute("href", "tel:8011112222");
    await expect(rep.getByRole("link", { name: "brandi.gallegos@herrickindustrial.com" })).toBeVisible();
    await expect(contacts.getByRole("list", { name: "Warehouse / Will-call by branch" }).getByRole("listitem")).toHaveText([
      /SLC.*\(801\) 555-0120/,
      /Ogden.*\(801\) 555-0130/,
      /Provo.*\(801\) 555-0140/,
    ]);
  });

  await test.step("one button per quote, newest first, with a status chip", async () => {
    const buttons = quotes.getByRole("button", { name: /^Quote · / });
    await expect(buttons).toHaveCount(25);
    // Q-24817 has no total until Brandi's first send, so it reads "Awaiting rep" (task 0.3).
    await expect(buttons.first()).toContainText(`Quote · Sep 23 · Awaiting rep`);
    await expect(buttons.first()).toContainText("Q-24817");
    await expect(buttons.first().locator(".cx-chip")).toHaveText("Awaiting rep");
    await expect(buttons.nth(1)).toContainText(/Quote · Sep \d+ · \$\d[\d,]*\.\d\d/);
    await expect(buttons.nth(1)).toContainText("Q-24816");
    await expect(buttons.nth(1).locator(".cx-chip")).toHaveText("Accepted");
    await expect(quotes.locator(".cx-chip", { hasText: "Expired" })).not.toHaveCount(0);
    await expect(buttons.last()).toContainText(/Quote · \w{3} \d+, 2025 · \$/);
  });

  await test.step('clicking a quote emits "open quote"', async () => {
    const opened = await recordOpenQuote(page);
    await quotes.getByRole("button", { name: /Q-24816/ }).click();
    expect(await opened()).toEqual([{ id: "q-24816", quote_number: "Q-24816" }]);
  });

  await page.screenshot({ path: testInfo.outputPath("customer-desktop.png") });
});

test("390px: the header fits and the sidebars collapse into tabs", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsDana(page);
  const tabs = page.getByRole("tablist", { name: "Workspace" });
  const contacts = page.getByRole("complementary", { name: "Contacts" });
  const quotes = page.getByRole("complementary", { name: "Quotes" });
  const chat = page.getByLabel("Ask a question");

  await test.step("the company name doesn't overlap the Connected badge, and nothing scrolls sideways", async () => {
    const header = page.locator(".customer-header");
    const badge = header.locator(".status-pill");
    await expect(badge).toBeVisible();
    const name = await box(header.locator(".header-brand strong"));
    for (const other of [badge, header.locator(".status-time"), header.getByRole("button", { name: "Switch workspace" })])
      expect(overlaps(name, await box(other)), "company name overlaps the header actions").toBe(false);
    const headerBox = await box(header);
    expect((await box(header.getByRole("button", { name: "Switch workspace" }))).x + 1).toBeLessThanOrEqual(headerBox.x + headerBox.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath("customer-390-chat.png") });
  });

  await test.step("Chat is the first tab; the sidebars wait behind the other two", async () => {
    await expect(tabs.getByRole("tab")).toHaveText(["Chat", "Contacts", "Quotes"]);
    await expect(tabs.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    await expect(chat).toBeVisible();
    await expect(contacts).toBeHidden();
    await expect(quotes).toBeHidden();
  });

  await test.step("Contacts shows the rep first, full width", async () => {
    await tabs.getByRole("tab", { name: "Contacts" }).click();
    await expect(contacts).toBeVisible();
    await expect(chat).toBeHidden();
    await expect(quotes).toBeHidden();
    await expect(contacts.getByRole("heading").first()).toHaveText(/Your rep/i);
    await expect(contacts.getByRole("region", { name: "Your rep" })).toContainText("Brandi Gallegos");
    expect((await box(contacts)).width).toBeGreaterThan(380);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath("customer-390-contacts.png") });
  });

  await test.step("Quotes lists the buttons and opens a quote", async () => {
    await tabs.getByRole("tab", { name: "Quotes" }).click();
    await expect(quotes).toBeVisible();
    await expect(contacts).toBeHidden();
    const first = quotes.getByRole("button", { name: /^Quote · / }).first();
    await expect(first).toContainText("Quote · Sep 23 · Awaiting rep");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath("customer-390-quotes.png") });
    const opened = await recordOpenQuote(page);
    await first.click();
    expect(await opened()).toEqual([{ id: "q-24817", quote_number: "Q-24817" }]);
  });

  await test.step("back to Chat", async () => {
    await tabs.getByRole("tab", { name: "Chat" }).click();
    await expect(chat).toBeVisible();
    await expect(quotes).toBeHidden();
  });
});
