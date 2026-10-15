import { expect, test, type APIRequest, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";

// The demo script (v3 decision 38; docs/demo-script.md; task F1): the five acts, in order, in scripted
// LLM mode on a fresh reset.
//   1. Dana chats, sees two or more suggestions in the item pop-up, and requests a quote.
//   2. Brandi sees an amber and a red quote in the header caution's Needs attention dropdown and in the
//      Quotes filter's Only show Overdue and Aging, opens Dana's quote from the bell, reads the full chat, and sends it.
//   3. Dana declines a different quote and picks a reason.
//   4. Brandi (the manager) opens Analytics (the leaderboard moved there from Teams and Reps, plans U6 and
//      U7), compares Mara and Eli, drills into the decline reasons, and reassigns one of Mara's overdue quotes to Eli.
//   5. Brandi opens Pricing and delivery, views the impact preview, turns free delivery pricing on and
//      sees the ramp, with the computed pool rate next to the starting rate. Its sections show only with
//      FEATURE_FREE_DELIVERY_PRICING and FEATURE_RECOVERY_POOL on (decision 48; playwright.config.ts turns
//      the flags on for the server it starts).
//
// beforeAll and afterAll reset the database to the seed pinned to the mockup's day (POST
// /api/test/reset; the server needs QUERENT_E2E_RESET=1 and QUERENT_SCRIPTED=1, which
// playwright.config.ts sets for the server it starts). The aging quotes and Mara's and Eli's books
// are dated from the reset time (src/server/db/seed/aging.ts, demo.ts), so every count below holds
// on any day.

const SEED_DATE = "2026-09-23";
const REQUEST = "Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels. We'll pick up at SLC.";
const OTHER_NOTE = "The general contractor is supplying the anchors on this job.";

test.describe.configure({ mode: "serial" });

const contexts: BrowserContext[] = [];
let dana: Page;
let brandi: Page;
let quoteNumber = "";

async function resetDemo(request: APIRequest, testInfo: TestInfo) {
  const api = await request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const response = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(response.status(), "POST /api/test/reset failed: start the server with QUERENT_E2E_RESET=1").toBe(200);
  } finally {
    await api.dispose();
  }
}
async function newPage(browser: Browser, testInfo: TestInfo) {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 1440, height: 1000 } });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto("/demo");
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
async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}
/** A quote's card on the Quotes board (plan U3). */
const quoteCard = (page: Page, number: string) => page.getByRole("article", { name: number, exact: true });
const laneCards = (page: Page, label: string) => page.locator(`section[data-lane][aria-label="${label}"] [role=article]`);
const repDetail = (number: string) => brandi.evaluate((n) => fetch(`/api/rep/quotes/${n}`).then((r) => r.json()), number);
const leaderboard = (page: Page) => page.getByRole("table", { name: "Leaderboard" });
const repRow = (page: Page, name: string) => leaderboard(page).getByRole("row").filter({ has: page.getByRole("rowheader", { name, exact: true }) });

test.beforeAll(async ({ browser, playwright }, testInfo) => {
  await resetDemo(playwright.request, testInfo);
  dana = await newPage(browser, testInfo);
  brandi = await newPage(browser, testInfo);
});
test.afterAll(async ({ playwright }, testInfo) => {
  await Promise.all(contexts.map((context) => context.close()));
  await resetDemo(playwright.request, testInfo);
});

test("Act 1: Dana chats, sees two or more suggestions in the pop-up, and requests a quote", async ({}, testInfo) => {
  // Step 1: / with no session is the visitor box; Sign in opens the chooser at /demo (decision 53).
  await dana.goto("/");
  await expect(await ask(dana, "Do you have 1/2 in grade 8 hex bolts in stock?")).toHaveText("Sign in to continue.");
  await dana.getByRole("button", { name: "Sign in" }).click();
  await expect(dana).toHaveURL(/\/demo$/);
  await dana.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
  await expect(dana.getByLabel("Ask a question")).toBeVisible();
  await expect(await ask(dana, REQUEST)).toContainText("Type 1 or Type 27 cut-off wheels?");
  await expect(await ask(dana, "Type 1")).toContainText("Here is your list");

  const popup = dana.getByRole("dialog", { name: "Review your list" });
  const suggestions = popup.getByRole("region", { name: "Frequently bought together" });
  const adds = suggestions.getByRole("button", { name: /^Add .* to your list$/ });
  await expect(adds.first()).toBeVisible();
  expect(await adds.count()).toBeGreaterThanOrEqual(2);
  await expect(popup).not.toContainText("$");
  await screenshot(dana, testInfo, "act1-suggestions");
  await suggestions.getByRole("button", { name: "Add HN-12-13-G8 to your list" }).click();
  await expect(popup.getByLabel("Qty for HN-12-13-G8")).toHaveValue("1");

  await popup.getByRole("button", { name: "Request quote" }).click();
  await expect(popup).toBeHidden();
  const confirmation = dana.locator(".answer-bubble").last();
  await expect(confirmation).toContainText("Sent to Brandi for review.");
  quoteNumber = (await confirmation.textContent())!.match(/Q-\d+/)![0];
  expect(quoteNumber).toBe("Q-24818");
});

test("Act 2: Brandi sees the aging quotes in the caution dropdown and Only show Overdue and Aging, opens it from the bell, reads the full chat, and sends it", async ({}, testInfo) => {
  // The chooser offers the rep personas next to Brandi, each with its role.
  await expect(brandi.getByRole("button", { name: /Herrick Industrial Supply.*Manager/ })).toBeVisible();
  const reps = brandi.getByRole("group", { name: "Herrick reps" });
  await expect(reps.getByRole("button", { name: /Mara Jensen.*Rep · Inside Sales/ })).toBeVisible();
  await expect(reps.getByRole("button", { name: /Eli Porter.*Rep · Outside Sales/ })).toBeVisible();
  await screenshot(brandi, testInfo, "act2-chooser");
  await brandi.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(brandi).toHaveURL(/\/rep\/quotes$/);

  // The caution's label counts overdue quotes only (every rep's: Brandi is the manager, task U1); its
  // dropdown lists the amber and red quotes, red first, in place (plan U2, C_QOB3).
  const caution = brandi.getByRole("button", { name: /^Needs attention/ });
  await expect(caution).toHaveAccessibleName(/^Needs attention, \d+ items$/);
  const overdue = Number((await caution.getAttribute("aria-label"))!.match(/\d+/)![0]);
  expect(overdue).toBeGreaterThanOrEqual(2);
  await caution.click();
  await expect(brandi).toHaveURL(/\/rep\/quotes$/);
  const attention = brandi.getByRole("dialog", { name: /need your attention$/ });
  await expect(attention.getByRole("button", { name: /^Q-24790\s*Overdue/ })).toHaveCount(1);
  await expect(attention.getByRole("button", { name: /^Q-24817\s*Overdue/ })).toHaveCount(1);
  await expect(attention.getByRole("button", { name: /^Q-24789\s*Aging/ })).toHaveCount(1);
  await expect(attention.getByRole("button").filter({ hasText: "Overdue" })).toHaveCount(overdue);
  await screenshot(brandi, testInfo, "act2-caution");
  await brandi.keyboard.press("Escape");

  // The Quotes filter's Only show Overdue and Aging holds the same quotes (plan U3: the old Needs attention view).
  await brandi.locator("header [data-ui=filter] > button").click();
  const panel = brandi.getByRole("dialog", { name: "Filter quotes" });
  await panel.locator("label").filter({ hasText: /^Overdue$/ }).click();
  await panel.locator("label").filter({ hasText: /^Aging$/ }).click();
  await panel.getByRole("button", { name: "Apply filters" }).click();
  await expect(brandi).toHaveURL(/\/rep\/quotes\?only=overdue%2Caging$/);
  const shown = await brandi.evaluate(() => fetch("/api/rep/quotes?only=overdue,aging").then((r) => r.json()));
  expect(shown.rows.filter((r: { aging: { level: string } }) => r.aging.level === "red")).toHaveLength(overdue);
  await expect(quoteCard(brandi, "Q-24790")).toContainText(/Overdue$/);
  await expect(quoteCard(brandi, "Q-24789")).toContainText(/Aging$/);
  await screenshot(brandi, testInfo, "act2-needs-attention");

  // Dana's new quote, unread: the bell lists it and opens it.
  await brandi.getByRole("button", { name: "Notifications" }).click();
  await brandi.getByRole("dialog", { name: "Notifications" }).getByRole("button", { name: new RegExp(`^${quoteNumber} requested by Dana Ortiz`) }).click();
  await expect(brandi).toHaveURL(new RegExp(`/rep/quotes/${quoteNumber}$`));
  await expect(brandi.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");

  // The Chat button under the total box (plan U4, C_QEBase) opens the full chat (C_QE6).
  const viewChat = brandi.getByRole("button", { name: /^Customer chat, \d+ messages$/ });
  await viewChat.click();
  const drawer = brandi.getByRole("dialog", { name: "Full chat" });
  await expect(drawer.locator('[data-role="customer"]').first()).toContainText(REQUEST);
  await screenshot(brandi, testInfo, "act2-full-chat");
  await drawer.getByRole("button", { name: "Close chat" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(brandi.getByRole("row").filter({ hasText: "HN-12-13-G8" })).toContainText("CHAT SUGGESTION");

  await brandi.getByRole("button", { name: "Approve and send" }).click();
  const send = brandi.getByRole("dialog", { name: "Send quote to Dana Ortiz" });
  await send.getByRole("button", { name: "Send quote" }).click();
  const confirm = brandi.getByRole("alertdialog", { name: "Confirm send" });
  await confirm.getByRole("button", { name: "Send", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(brandi.getByText(`Sent ${quoteNumber} rev 1 to Dana in Querent chat`)).toBeVisible();
  expect((await repDetail(quoteNumber)).quote).toMatchObject({ status: "sent", revision: 1 });
});

test("Act 3: Dana declines a different quote and picks a reason", async ({}, testInfo) => {
  // The bell is how Dana finds a quote (plan U10, decision 41).
  const bell = dana.getByRole("button", { name: "Notifications" });
  const row = dana.getByRole("dialog", { name: "Notifications" }).locator("[data-read]", { hasText: "Q-24791" });
  await bell.click();
  await row.click();
  const modal = dana.getByRole("dialog", { name: "Quote Q-24791" });
  await expect(modal.getByRole("document")).toHaveAttribute("data-state", "ready");
  await modal.getByRole("group", { name: "Respond to this quote" }).getByRole("button", { name: "Decline" }).click();
  const dialog = dana.getByRole("alertdialog", { name: "Decline quote" });
  await expect(dialog.getByRole("radio")).toHaveCount(5);
  await dialog.getByRole("radio", { name: "Price too high" }).check();
  await screenshot(dana, testInfo, "act3-decline");
  await dialog.getByRole("button", { name: "Decline", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(modal.locator(".qp-state")).toHaveText("Declined");
  await modal.getByRole("button", { name: "Close" }).click();
  await bell.click();
  await expect(row).toHaveAttribute("data-read", "true");
  await dana.keyboard.press("Escape");
  expect((await repDetail("Q-24791")).quote).toMatchObject({ status: "declined", decline_reason: "price_too_high", unread_for_rep: true });
});

test("Act 4: Brandi compares Mara and Eli on Analytics, drills into the decline reasons, and reassigns a quote", async ({}, testInfo) => {
  // Act 3's decline is in Brandi's bell.
  await brandi.getByRole("button", { name: "Notifications" }).click();
  await expect(brandi.getByRole("dialog", { name: "Notifications" }).getByRole("button", { name: /^Q-24791 declined by Dana Ortiz/ })).toHaveCount(1);
  await brandi.keyboard.press("Escape");
  // The leaderboard moved from Teams and Reps to Analytics (plans U6, U7).
  await brandi.getByRole("navigation", { name: "Rep portal" }).getByRole("link", { name: "Analytics" }).click();
  await expect(brandi).toHaveURL(/\/rep\/analytics$/);
  await brandi.getByRole("tab", { name: "Rep leaderboard", exact: true }).click();
  await expect(brandi.getByRole("radio", { name: "30 days" })).toHaveAttribute("aria-checked", "true");

  // Compare Mara and Eli: pick them in the filter. Their books are dated from the reset time.
  await brandi.getByRole("button", { name: "Filter" }).click();
  const filter = brandi.getByRole("dialog", { name: "Filter analytics" });
  await filter.getByText("Eli Porter", { exact: true }).click();
  await filter.getByText("Mara Jensen", { exact: true }).click();
  await filter.getByRole("button", { name: "Apply filters" }).click();
  await expect(leaderboard(brandi).getByRole("rowheader")).toHaveText(["Eli Porter", "Mara Jensen", "Total"]);
  await expect(repRow(brandi, "Mara Jensen").getByRole("link", { name: "13 created" })).toBeVisible();
  await expect(repRow(brandi, "Eli Porter").getByRole("link", { name: "20 created" })).toBeVisible();
  await expect(repRow(brandi, "Total").getByRole("link", { name: "33 created" })).toBeVisible();
  await screenshot(brandi, testInfo, "act4-compare");

  // Every reason once, a decline with none, and the Other note in the customer's words.
  await brandi.getByRole("tab", { name: "Decline reasons", exact: true }).click();
  const declines = brandi.getByRole("region", { name: "Decline reasons", exact: true });
  for (const reason of ["Price too high", "Found other source", "Need it sooner than quoted", "Wrong items or quantity", "Other", "No reason given"])
    await expect(brandi.getByRole("table", { name: "Decline reasons" }).getByRole("row").filter({ has: brandi.getByRole("rowheader", { name: reason, exact: true }) })).toContainText(new RegExp(`^${reason}1`));
  await expect(declines.getByRole("list", { name: "Other, in the customer's words" })).toContainText(OTHER_NOTE);
  await screenshot(brandi, testInfo, "act4-decline-reasons");
  await declines.getByRole("link", { name: "6 declined quotes" }).click();
  await expect(brandi).toHaveURL(/\/rep\/quotes\?(rep=[^&]+&)?from=.+status=declined/);
  expect(brandi.url()).not.toContain("scope=");
  await expect(laneCards(brandi, "Declined")).toHaveCount(6);
  await screenshot(brandi, testInfo, "act4-declined-quotes");

  // Mara's overdue quotes, from her leaderboard row: open her overdue draft and move it to Eli from the
  // quote page (the Quotes page has no bulk reassign; Teams and Reps moves all of a rep's open quotes, decision 45).
  await brandi.goto("/rep/analytics");
  await brandi.getByRole("tab", { name: "Rep leaderboard", exact: true }).click();
  await repRow(brandi, "Mara Jensen").getByRole("link", { name: "2 overdue" }).click();
  await expect(brandi).toHaveURL(/\/rep\/quotes\?rep=mara&.*aging=red/);
  const draft = laneCards(brandi, "Draft ready");
  await expect(draft).toHaveCount(1);
  const number = (await draft.getAttribute("aria-label"))!;
  await draft.getByRole("button", { name: number, exact: true }).click();
  await brandi.getByRole("dialog", { name: number, exact: true }).getByRole("link", { name: "Open quote" }).click();
  await expect(brandi).toHaveURL(new RegExp(`/rep/quotes/${number}$`));
  // Reassign is in the editor's More actions (plan U4, C_QE1).
  await brandi.getByRole("button", { name: "More actions" }).click();
  await brandi.getByRole("menu", { name: "More actions" }).getByRole("menuitem", { name: "Reassign to another rep" }).click();
  const dialog = brandi.getByRole("dialog", { name: `Reassign ${number}` });
  await dialog.getByRole("combobox", { name: "New rep" }).selectOption("eli");
  await screenshot(brandi, testInfo, "act4-reassign");
  await dialog.getByRole("button", { name: "Reassign" }).click();
  await expect(brandi.getByText("Read only: Eli Porter's quote. Reassign it to edit.", { exact: true })).toBeVisible();
  const moved = await repDetail(number);
  expect(moved.quote).toMatchObject({ rep_id: "eli", original_rep_id: "mara" });
  expect(JSON.stringify(moved)).toContain(`Brandi Gallegos reassigned ${number} from Mara Jensen to Eli Porter`);
});

test("Act 5: Brandi views the impact preview, turns free delivery pricing on, and sees the ramp", async ({}, testInfo) => {
  const flags = (await brandi.evaluate(() => fetch("/api/rep/settings").then((r) => r.json()))).manager.flags;
  expect(flags, "Act 5 needs FEATURE_FREE_DELIVERY_PRICING=1 and FEATURE_RECOVERY_POOL=1 on the server (playwright.config.ts sets them)").toMatchObject({ freeDeliveryPricing: true, recoveryPool: true });
  await brandi.goto("/rep/settings?tab=pricing");
  const free = brandi.getByRole("region", { name: "Free delivery pricing" });
  const pool = brandi.getByRole("region", { name: "Recovery pool" });
  const toggle = brandi.getByRole("switch", { name: "Free delivery pricing" });
  // The computed pool rate, from the seed's 22 eligible quotes, next to the 3.0% starting rate.
  await expect(pool).toContainText(/Pool rate \d+\.\d% from 22 eligible quotes \(starting rate 3\.0%\)/);
  await expect(pool).toContainText("Rate in forceOff");
  await expect(toggle).toBeDisabled();
  await screenshot(brandi, testInfo, "act5-pool");

  await free.getByRole("button", { name: "View impact preview" }).click();
  // The preview opens over the page (plan U8, C_S7): per category, the delivery quotes it touches and the change in dollars.
  const preview = brandi.getByRole("dialog", { name: "Impact preview" });
  await expect(preview.getByRole("table", { name: "Average change per line price" })).toBeVisible();
  await expect(preview).toContainText(/Based on the last [1-9]\d* delivery quotes\./);
  await expect(preview.getByRole("row").filter({ hasText: "Fasteners" })).toHaveText(/Fasteners[1-9]\d* of \d+\+\$\d+\.\d\d\+\$\d+\.\d\d/);
  await screenshot(brandi, testInfo, "act5-preview");
  await preview.getByRole("button", { name: "Close" }).click();

  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  const ramp = free.getByRole("table", { name: "Ramp-in schedule" });
  await expect(ramp.getByRole("row")).toHaveCount(4);
  await expect(ramp.getByRole("row").nth(1)).toContainText("Step 1 of 3");
  await expect(ramp.getByRole("row").nth(1)).toContainText("NOW");
  await expect(pool).toContainText(/Rate in force\d+\.\d%, ramp step 1 of 3/);
  await screenshot(brandi, testInfo, "act5-ramp");
});
