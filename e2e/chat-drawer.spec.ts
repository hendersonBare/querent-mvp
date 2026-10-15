import { expect, test, type Page, type TestInfo } from "@playwright/test";

// The Chat icon button on the rep's quote editor (plan U4, C_QEBase, C_QE6; B1; decision 26; spec §6,
// §9): its name gives the message count, and it opens the "Full chat" drawer on the right with the
// whole conversation. Dana's messages are bold, Querent's turns are one line until expanded, notices
// (item pop-up, quote requested) are one muted line. Escape and the x close it. The drawer's look is
// proven against C_QE6 in e2e/frames-quote-editor.spec.ts. (No phone check: decision 43.)
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
  await page.goto("/demo");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
  await page.goto(`/rep/quotes/${SAMPLE}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");
}
async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

test("opens Dana's whole chat from the Chat button and closes it", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openQuote(page);
  // The Chat button sits with Save draft, Export and More under the total box (C_QEBase).
  const button = page.getByRole("button", { name: "Customer chat, 5 messages" });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("aria-haspopup", "dialog");
  const total = (await page.getByRole("region", { name: "Quote summary" }).boundingBox())!;
  expect((await button.boundingBox())!.y).toBeGreaterThan(total.y + total.height);
  await attachScreenshot(page, testInfo, "chat-button-1920");

  await button.click();
  const drawer = page.getByRole("dialog", { name: "Full chat" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Dana Ortiz, 5 messages, via Querent chat");
  expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  // The drawer sits on the right edge.
  const box = (await drawer.boundingBox())!;
  expect(Math.round(box.x + box.width)).toBe(1920);
  expect(box.x).toBeGreaterThan(1000);

  const items = drawer.getByRole("listitem");
  await expect(items).toHaveCount(5);
  // Dana's request, emphasised: her words in bold.
  const request = items.nth(0);
  await expect(request).toHaveAttribute("data-role", "customer");
  const words = request.locator('[data-role="customer"]').filter({ hasText: REQUEST });
  await expect(words).toBeVisible();
  expect(Number(await words.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(600);

  // Querent's answer: one line, then the whole turn on click, and back.
  const turn = items.nth(1).getByRole("button", { name: /Yes, the 1\/2-13 x 2 in Grade 8 hex cap screws are in stock/ });
  await expect(turn).toHaveAttribute("aria-expanded", "false");
  const oneLine = (await turn.boundingBox())!.height;
  expect(oneLine).toBeLessThan(30);
  await turn.click();
  await expect(turn).toHaveAttribute("aria-expanded", "true");
  await expect(turn).toContainText("30 ft with flat hooks?");
  expect((await turn.boundingBox())!.height).toBeGreaterThan(oneLine);
  await turn.press("Enter");
  await expect(turn).toHaveAttribute("aria-expanded", "false");

  // Notices: one muted line each.
  await expect(items.nth(3)).toHaveAttribute("data-kind", "item_popup");
  await expect(items.nth(3)).toContainText("Item pop-up: Here is your list.");
  await expect(items.nth(4)).toContainText("Quote requested: Thanks, Dana. Brandi Gallegos is pricing your request now.");
  await expect(drawer.getByRole("button", { name: "Load earlier" })).toHaveCount(0);
  await attachScreenshot(page, testInfo, "chat-drawer-1920");

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
