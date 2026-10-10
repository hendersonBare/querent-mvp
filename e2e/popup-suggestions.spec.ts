import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

// "Frequently bought together" in the item pop-up (decision 37, spec §6 and §10, task E1). Scripted
// chat on the mockup's seed day: Dana asks for the Grade 8 bolts and the Type 1 wheels, and below
// the cart the pop-up suggests the matching nut and washer and the flap discs she buys with the
// wheels, each with a reason and no price. She adds the nut (qty 1), requests the quote, and Brandi
// sees the line on the draft, tagged as picked from a chat suggestion (added_by 'suggestion').

const SEED_DATE = "2026-09-23";
const REQUEST =
  "Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels. We'll pick up at SLC.";
const contexts: BrowserContext[] = [];

test.beforeAll(async ({ playwright }, testInfo) => {
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const response = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(response.status(), "POST /api/test/reset failed: start the server with QUERENT_E2E_RESET=1").toBe(200);
  } finally {
    await api.dispose();
  }
});
test.afterAll(async () => {
  for (const context of contexts) await context.close();
});

async function signIn(browser: Browser, baseURL: string, workspace: RegExp) {
  const context = await browser.newContext({ baseURL });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: workspace }).click();
  return page;
}

async function ask(page: Page, text: string): Promise<Locator> {
  const answers = page.locator(".answer-bubble");
  const before = await answers.count();
  const box = page.getByLabel("Ask a question");
  await box.fill(text);
  await box.press("Enter");
  await expect(answers).toHaveCount(before + 1);
  return answers.last();
}

test("Dana adds a suggested nut from the pop-up, and Brandi sees it on the draft as a chat suggestion", async ({ browser }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL!;
  const dana = await signIn(browser, baseURL, /Wasatch Mechanical Contractors/);
  await expect(dana.getByLabel("Ask a question")).toBeVisible();
  await expect(await ask(dana, REQUEST)).toContainText("Type 1 or Type 27 cut-off wheels?");
  await expect(await ask(dana, "Type 1")).toContainText("Here is your list");

  const popup = dana.getByRole("dialog", { name: "Review your list" });
  const suggestions = popup.getByRole("region", { name: "Frequently bought together" });
  const cart = popup.getByRole("list", { name: "Items" });

  await test.step("below the cart: at least two suggestions with a reason each, and no prices", async () => {
    await expect(cart.getByRole("listitem").filter({ hasText: "HCS-12-13-2G8" })).toContainText("64 at SLC");
    await expect(suggestions).toBeVisible();
    const adds = suggestions.getByRole("button", { name: /^Add .* to your list$/ });
    expect(await adds.count()).toBeGreaterThanOrEqual(2);
    await expect(suggestions).toContainText("Hex nut 1/2-13, Grade 8, yellow zinc");
    await expect(suggestions).toContainText("Box of 100");
    await expect(suggestions).toContainText("Matches the 1/2-13 Grade 8 bolts on your list.");
    await expect(popup).not.toContainText("$");
  });

  await test.step("Add puts the nut in the cart at qty 1 and takes it out of the suggestions", async () => {
    await suggestions.getByRole("button", { name: "Add HN-12-13-G8 to your list" }).click();
    await expect(popup.getByLabel("Qty for HN-12-13-G8")).toHaveValue("1");
    await expect(cart.getByRole("listitem").filter({ hasText: "HN-12-13-G8" })).toContainText("75 at SLC");
    await expect(suggestions).not.toContainText("Hex nut 1/2-13");
    await expect(popup).toContainText("3 items");
  });

  let quoteNumber = "";
  await test.step("Request quote sends it with the matched lines", async () => {
    await popup.getByRole("button", { name: "Request quote" }).click();
    await expect(popup).toBeHidden();
    const confirmation = dana.locator(".answer-bubble").last();
    await expect(confirmation).toContainText("Sent to Brandi for review.");
    await expect(dana.locator(".question-bubble").last()).toHaveText(
      "Request quote: 10 × HCS-12-13-2G8, 6 × CW-45-045-T1, 1 × HN-12-13-G8 (pickup at SLC).",
    );
    quoteNumber = (await confirmation.textContent())!.match(/Q-\d+/)![0];
  });

  await test.step("Brandi sees the nut on the draft, added from a chat suggestion", async () => {
    const brandi = await signIn(browser, baseURL, /Herrick Industrial Supply/);
    await expect(brandi).toHaveURL(/\/rep\/quotes$/);
    const detail = await brandi.evaluate((number) => fetch(`/api/rep/quotes/${number}`).then((r) => r.json()), quoteNumber);
    const lines = (detail.lines as { sku: string; qty: number; added_by: string }[]).map((l) => [l.sku, l.qty, l.added_by]);
    expect(lines).toEqual([
      ["HCS-12-13-2G8", 10, "querent"],
      ["CW-45-045-T1", 6, "querent"],
      ["HN-12-13-G8", 1, "suggestion"],
    ]);
    await brandi.goto(`/rep/quotes/${quoteNumber}`);
    const nut = brandi.getByRole("row").filter({ hasText: "HN-12-13-G8" });
    await expect(nut).toContainText("Chat suggestion");
  });
});

test("at 390px the suggestions fit the bottom sheet, and Add works", async ({ browser }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL!;
  const dana = await signIn(browser, baseURL, /Wasatch Mechanical Contractors/);
  await dana.setViewportSize({ width: 390, height: 844 });
  await expect(await ask(dana, REQUEST)).toContainText("Type 1 or Type 27 cut-off wheels?");
  await expect(await ask(dana, "Type 1")).toContainText("Here is your list");
  const popup = dana.getByRole("dialog", { name: "Review your list" });
  const suggestions = popup.getByRole("region", { name: "Frequently bought together" });
  await expect.poll(async () => (await popup.boundingBox())!.x).toBe(0);
  const add = suggestions.getByRole("button", { name: "Add FD-45-60Z to your list" });
  await add.scrollIntoViewIfNeeded();
  await expect(add).toBeInViewport();
  // The Add button sits at the right of its suggestion, beside the description (not on a row of its own).
  const button = (await add.boundingBox())!;
  const name = (await suggestions.getByText("Flap disc 4.5 in, 60 grit zirconia").boundingBox())!;
  expect(button.x + button.width).toBeLessThanOrEqual(390);
  expect(button.x).toBeGreaterThan(name.x + 150);
  expect(button.y).toBeLessThan(name.y + name.height + 40);
  expect(await popup.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
  expect(await dana.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await add.click();
  await expect(popup.getByLabel("Qty for FD-45-60Z")).toHaveValue("1");
  await expect(popup.getByRole("button", { name: "Request quote" })).toBeInViewport();
});
