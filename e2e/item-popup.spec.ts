import { expect, test, type Locator, type Page } from "@playwright/test";

// The item pop-up and Request quote (task 2.3, spec §3): once every line is matched, Dana reviews
// the list (item, SKU, qty, stock at the chosen branch, no prices), edits it, chooses pickup or
// delivery and the branch, and presses Request quote. Querent drafts a ready_for_review quote for
// Brandi and says so in the chat. One pop-up makes one quote, whatever the clicks.
//
// Scripted chat on the mockup's seed day (see golden-quote-flow.spec.ts for the reset hook). Each
// test signs in with a fresh browser context, so it has its own conversation.

const SEED_DATE = "2026-09-23";
const REQUEST =
  "Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels. We'll pick up at SLC.";

test.beforeAll(async ({ playwright }, testInfo) => {
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const response = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(response.status(), "POST /api/test/reset failed: start the server with QUERENT_E2E_RESET=1").toBe(200);
  } finally {
    await api.dispose();
  }
});

async function ask(page: Page, text: string): Promise<Locator> {
  const answers = page.locator(".answer-bubble");
  const before = await answers.count();
  const box = page.getByLabel("Ask a question");
  await box.fill(text);
  await box.press("Enter");
  await expect(answers).toHaveCount(before + 1);
  return answers.last();
}

/** Dana signs in, asks for the bolts and wheels, and answers "Type 1": the pop-up opens. */
async function openPopup(page: Page): Promise<Locator> {
  await page.goto("/");
  await page.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
  await expect(page.getByLabel("Ask a question")).toBeVisible();
  await expect(await ask(page, REQUEST)).toContainText("Type 1 or Type 27 cut-off wheels?");
  await expect(await ask(page, "Type 1")).toContainText("Here is your list");
  const popup = page.getByRole("dialog", { name: "Review your list" });
  await expect(popup).toBeVisible();
  await expect(popup.getByRole("listitem").filter({ hasText: "HCS-12-13-2G8" })).toContainText("64 at SLC");
  return popup;
}

test("Dana edits the list, switches to delivery from Ogden, and one double-clicked Request quote makes one quote", async ({ page }) => {
  const popup = await openPopup(page);
  const bolts = popup.getByRole("listitem").filter({ hasText: "HCS-12-13-2G8" });

  await test.step("qty, a removed line, delivery and another branch, with stock for that branch", async () => {
    await popup.getByLabel("Qty for HCS-12-13-2G8").fill("30");
    await popup.getByRole("button", { name: "Remove CW-45-045-T1" }).click();
    await expect(popup.getByRole("listitem")).toHaveCount(1);
    await expect(popup).toContainText("1 item");
    await popup.getByRole("radio", { name: "Delivery" }).check();
    await expect(popup.getByRole("radio", { name: "Pickup" })).not.toBeChecked();
    await expect(popup).toContainText("Delivers to 1800 W 10950 S, South Jordan, UT 84095.");
    await popup.getByRole("combobox", { name: "Branch" }).selectOption("ogden");
    // 22 on hand at Ogden against 30 asked for.
    await expect(bolts).toContainText("22 at Ogden");
    await expect(bolts).toContainText("Short 8");
    await expect(popup).not.toContainText("$");
  });

  await test.step("a double click on Request quote makes one quote", async () => {
    const answers = page.locator(".answer-bubble");
    const before = await answers.count();
    await popup.getByRole("button", { name: "Request quote" }).dblclick();
    await expect(popup).toBeHidden();
    await expect(answers).toHaveCount(before + 1);
    await expect(answers.last()).toContainText("Sent to Brandi for review.");
    await expect(page.locator(".question-bubble").last()).toHaveText("Request quote: 30 × HCS-12-13-2G8 (delivery from Ogden).");
    const quoteNumber = (await answers.last().textContent())!.match(/Q-\d+/)![0];
    const quotes = page.getByRole("complementary", { name: "Quotes" });
    await expect(quotes.getByRole("button").filter({ hasText: quoteNumber })).toContainText("Awaiting rep");
    const sent = await page.evaluate(() => fetch("/api/query/customer/quotes").then((r) => r.json()));
    expect(sent.filter((q: { status: string; requested_at: string }) => q.status === "ready_for_review" && q.requested_at > "2026-09-24")).toHaveLength(1);
    // The same list again replays that quote.
    const again = await page.evaluate(
      async (conversationId) =>
        (
          await fetch("/api/query/customer/quote-requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversation_id: conversationId, fulfillment: "delivery", branch_id: "ogden", lines: [{ sku: "HCS-12-13-2G8", qty: 30 }] }),
          })
        ).json(),
      await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith("querent-conversation-"))![1]),
    );
    expect(again).toMatchObject({ replayed: true, quote: { quote_number: quoteNumber } });
  });

  await test.step("reopening the chat shows the list as requested, with no pop-up", async () => {
    await page.reload();
    await expect(page.getByText(/^Quote Q-\d+ requested$/)).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Review list and request quote" })).toHaveCount(0);
  });
});

test("the server refuses a price in the request", async ({ page }) => {
  await openPopup(page);
  const response = await page.evaluate(async () => {
    const conversationId = Object.entries(localStorage).find(([key]) => key.startsWith("querent-conversation-"))![1];
    const r = await fetch("/api/query/customer/quote-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId, fulfillment: "will_call", branch_id: "slc", lines: [{ sku: "HCS-12-13-2G8", qty: 10, unit_price: 0.01 }] }),
    });
    return { status: r.status, body: await r.json() };
  });
  expect(response.status).toBe(422);
  expect(response.body.detail).toContain("Your rep sets the prices.");
});

test("at 390px the pop-up is a bottom sheet that fits the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const popup = await openPopup(page);
  // Once the opening animation settles: full width, anchored to the bottom.
  await expect.poll(async () => (await popup.boundingBox())!.x).toBe(0);
  const box = (await popup.boundingBox())!;
  expect(box.width).toBe(390);
  expect(Math.round(box.y + box.height)).toBe(844);
  await expect(popup.getByRole("button", { name: "Request quote" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await popup.getByRole("button", { name: "Request quote" }).click();
  await expect(page.locator(".answer-bubble").last()).toContainText("Sent to Brandi for review.");
});
