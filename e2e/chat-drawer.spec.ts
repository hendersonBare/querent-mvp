import { expect, test, type Page, type TestInfo } from "@playwright/test";

// "View full chat" on the rep's quote detail (B1; decision 26; spec §6, §9): the compact Customer
// request box stays, with a button that shows the message count and opens a side drawer with the
// whole conversation. Dana's messages are emphasised, Querent's turns are one line until expanded,
// notices (item pop-up, quote requested) are one muted line. Escape and the X close it. (No phone
// check: the rep portal has no phone layout, decision 43, plan U2.)
//
// Before each test the database is reset to the seed pinned to the mockup's day (POST
// /api/test/reset, only with QUERENT_E2E_RESET=1, which playwright.config.ts sets).

const SEED_DATE = "2026-09-23";
const SAMPLE = "Q-24817";
const REQUEST = /^Do you have the 1\/2 in grade 8 hex bolts in stock\?/;

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ playwright }, testInfo) => {
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const reset = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(reset.status(), "start the server with QUERENT_E2E_RESET=1").toBe(200);
  } finally {
    await api.dispose();
  }
});

async function openQuote(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
  await page.goto(`/rep/quotes/${SAMPLE}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");
}
async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

test("opens Dana's whole chat from the Customer request box and closes it", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1057 });
  await openQuote(page);
  // The compact box is unchanged: collapsed, with the request snippet.
  await expect(page.getByText("Customer request")).toBeVisible();
  await expect(page.locator("details").filter({ hasText: "Customer request" })).not.toHaveAttribute("open", "");
  const button = page.getByRole("button", { name: "View full chat, 5 messages" });
  await expect(button).toBeVisible();
  await expect(button).toContainText("5 messages");
  await attachScreenshot(page, testInfo, "request-box-1440");

  await button.click();
  const drawer = page.getByRole("dialog", { name: "Full chat" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Dana Ortiz · 5 messages");
  expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  // The drawer sits on the right.
  const box = (await drawer.boundingBox())!;
  expect(box.x + box.width).toBeGreaterThan(1430);
  expect(box.x).toBeGreaterThan(700);

  const items = drawer.getByRole("listitem");
  await expect(items).toHaveCount(5);
  // Dana's request, emphasised: bold with a Querent-green left accent.
  const request = items.nth(0);
  await expect(request).toHaveAttribute("data-role", "customer");
  const words = request.locator("strong").filter({ hasText: REQUEST });
  await expect(words).toBeVisible();
  expect(Number(await words.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(600);
  expect(await request.evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe("rgb(14, 124, 116)");

  // Querent's answer: one line, then the whole turn on click, and back.
  const turn = items.nth(1).getByRole("button", { name: /Yes, the 1\/2-13 x 2 in Grade 8 hex cap screws are in stock/ });
  await expect(turn).toHaveAttribute("aria-expanded", "false");
  const oneLine = (await turn.locator("[data-text]").boundingBox())!.height;
  expect(oneLine).toBeLessThan(30);
  await turn.click();
  await expect(turn).toHaveAttribute("aria-expanded", "true");
  await expect(turn).toContainText("30 ft with flat hooks?");
  expect((await turn.locator("[data-text]").boundingBox())!.height).toBeGreaterThan(oneLine);
  await turn.press("Enter");
  await expect(turn).toHaveAttribute("aria-expanded", "false");

  // Notices: one muted line each.
  await expect(items.nth(3)).toHaveAttribute("data-kind", "item_popup");
  await expect(items.nth(3)).toContainText("Item pop-up: Here is your list.");
  await expect(items.nth(4)).toContainText("Quote requested: Thanks, Dana. Brandi Gallegos is pricing your request now.");
  await expect(drawer.getByRole("button", { name: "Load earlier" })).toHaveCount(0);
  await attachScreenshot(page, testInfo, "chat-drawer-1440");

  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(button).toBeFocused();
  await button.click();
  await drawer.getByRole("button", { name: "Close chat" }).click();
  await expect(drawer).toHaveCount(0);
});

test("the messages API serves only the owning rep, and never a payload", async ({ page }) => {
  await openQuote(page);
  const get = (path: string) =>
    page.evaluate(async (p) => {
      const response = await fetch(p);
      return { status: response.status, body: await response.json().catch(() => null) };
    }, path);
  const own = await get(`/api/rep/quotes/${SAMPLE}/messages`);
  expect(own.status).toBe(200);
  expect(own.body.total).toBe(5);
  expect(own.body.next_before).toBeNull();
  expect(JSON.stringify(own.body)).not.toMatch(/payload|cost|margin|"lines"/i);
  expect((await get("/api/rep/quotes/Q-99999/messages")).status).toBe(404);
});
