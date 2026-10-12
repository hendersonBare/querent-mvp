import { expect, test, type Locator, type Page } from "@playwright/test";

// The clarification loop (task 2.2, spec §3): Querent never guesses a SKU. A vague line gets the
// 1.4 clarifying question (round 1); a reply that settles nothing brings round 2, with the top 3
// candidates as buttons, Drop this line, and the assigned rep's name, phone and email. A button
// picks or drops the line; once every line is matched the item pop-up's list follows.
//
// Scripted chat on the mockup's seed day (see golden-quote-flow.spec.ts for the reset hook). Each
// test signs in with a fresh browser context, so it has its own conversation.

const SEED_DATE = "2026-09-23";
const REQUEST =
  "Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels. We'll pick up at SLC.";
const VAGUE_LINE = "6 boxes of cut-off wheels";
const CHOICES = `Choose the item for “${VAGUE_LINE}”`;

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
  await page.goto("/demo");
  await page.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
  await expect(page.getByLabel("Ask a question")).toBeVisible();
}

/** Sends one chat message as Dana and returns Querent's reply once it has arrived. */
async function ask(page: Page, text: string): Promise<Locator> {
  const answers = page.locator(".answer-bubble");
  const before = await answers.count();
  const box = page.getByLabel("Ask a question");
  await box.fill(text);
  await box.press("Enter");
  await expect(answers).toHaveCount(before + 1);
  return answers.last();
}

/** Presses a button in the latest reply and returns the reply to it. */
async function press(page: Page, button: Locator): Promise<Locator> {
  const answers = page.locator(".answer-bubble");
  const before = await answers.count();
  await button.click();
  await expect(answers).toHaveCount(before + 1);
  await expect(answers.last()).not.toBeEmpty();
  return answers.last();
}

/** Dana's request, then a reply that settles nothing: the wheels line is in round 2. */
async function roundTwo(page: Page) {
  await signInAsDana(page);
  const first = await ask(page, REQUEST);
  await expect(first).toContainText("Type 1 or Type 27 cut-off wheels?");
  await expect(first.getByRole("group", { name: CHOICES })).toHaveCount(0);
  const again = await ask(page, "not sure");
  await expect(again.getByRole("group", { name: CHOICES }).getByRole("button")).toHaveCount(3);
  return again;
}

test("a candidate button picks the wheel and opens the list with every line matched", async ({ page }) => {
  const again = await roundTwo(page);
  const reply = await press(page, again.getByRole("button", { name: /^Choose CW-45-090-T27\b/ }));
  // The pick shows as Dana's message; the buttons of the settled question are gone.
  await expect(page.locator(".question-bubble").last()).toHaveText("CW-45-090-T27 (Cut-off wheel 4.5 x .090 x 7/8 in, Type 27)");
  await expect(page.getByRole("group", { name: CHOICES })).toHaveCount(0);
  await expect(reply).toContainText("Here is your list");
  await expect(reply).toContainText("10 × HCS-12-13-2G8");
  await expect(reply).toContainText("6 × CW-45-090-T27");
  await expect(reply).toContainText("Pickup at SLC");
});

test("Drop this line leaves the wheels out, and the list opens with the bolts", async ({ page }) => {
  const again = await roundTwo(page);
  const reply = await press(page, again.getByRole("button", { name: `Drop this line: ${VAGUE_LINE}` }));
  await expect(page.locator(".question-bubble").last()).toHaveText(`Drop “${VAGUE_LINE}”`);
  await expect(reply).toContainText(`Dropped “${VAGUE_LINE}”`);
  await expect(reply).toContainText("10 × HCS-12-13-2G8");
  await expect(reply).not.toContainText("CW-45");
});

test("an answer that narrows without settling counts as a round: the two Type 27 wheels become the buttons", async ({ page }) => {
  await signInAsDana(page);
  await ask(page, REQUEST);
  const narrowed = await ask(page, "Type 27");
  await expect(narrowed).toContainText(".045 in or .090 in cut-off wheels?");
  const buttons = narrowed.getByRole("group", { name: CHOICES }).getByRole("button");
  await expect(buttons).toHaveCount(2);
  await expect(buttons).toContainText(["CW-45-045-T27", "CW-45-090-T27"]);
  await expect(narrowed.getByRole("region", { name: "Call your rep" })).toContainText("Brandi Gallegos");
  const reply = await ask(page, ".045");
  await expect(reply).toContainText("6 × CW-45-045-T27");
});

test("the buttons come back after a reload", async ({ page }) => {
  await roundTwo(page);
  await page.reload();
  await expect(page.getByRole("group", { name: CHOICES }).getByRole("button")).toHaveCount(3);
  await expect(page.getByRole("region", { name: "Call your rep" })).toContainText("(801) 111-2222");
});

test("at 390px the buttons and the rep fit the chat without scrolling sideways", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const again = await roundTwo(page);
  const group = again.getByRole("group", { name: CHOICES });
  await group.scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(() => {
    const last = [...document.querySelectorAll<HTMLElement>(".answer-bubble")].at(-1)!;
    return { page: document.documentElement.scrollWidth - window.innerWidth, bubble: last.scrollWidth - last.clientWidth };
  });
  expect(overflow).toEqual({ page: 0, bubble: 0 });
  const bubbleBox = (await page.locator(".answer-bubble").last().boundingBox())!;
  for (const button of await group.getByRole("button").all()) {
    const box = (await button.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(bubbleBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(bubbleBox.x + bubbleBox.width + 0.5);
  }
  await page.locator(".answer-bubble").last().screenshot({ path: testInfo.outputPath("clarify-390.png") });
});
