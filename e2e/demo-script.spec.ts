import { expect, test, type APIRequest, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";

// The demo script (v3 decision 38; docs/demo-script.md; task F1): the five acts, in order, in scripted
// LLM mode on a fresh reset.
//   1. Dana chats, sees two or more suggestions in the item pop-up, and requests a quote.
//   2. Brandi opens it with View full chat, sees an amber and a red quote, the Needs attention
//      filter and badge, and sends the quote.
//   3. Dana declines a different quote and picks a reason.
//   4. Brandi (the manager) opens Team, compares Mara and Eli, drills into the decline reasons, and
//      reassigns one of Mara's overdue quotes to Eli.
//   5. Brandi opens Pricing & delivery, views the impact preview, turns free delivery pricing on and
//      sees the ramp, with the computed pool rate next to the starting rate.
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
const quoteRow = (page: Page, number: string) =>
  page.getByRole("table").getByRole("rowgroup").filter({ has: page.getByRole("link", { name: number, exact: true }) });
const repDetail = (number: string) => brandi.evaluate((n) => fetch(`/api/rep/quotes/${n}`).then((r) => r.json()), number);
const leaderboard = (page: Page) => page.getByRole("table", { name: /Leaderboard/ });
const repRow = (page: Page, name: string) => leaderboard(page).getByRole("row").filter({ has: page.getByRole("rowheader", { name }) });

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

test("Act 2: Brandi opens it, uses View full chat, sees the aging quotes, the Needs attention filter and badge, and sends it", async ({}, testInfo) => {
  // The chooser offers the rep personas next to Brandi, each with its role.
  await expect(brandi.getByRole("button", { name: /Herrick Industrial Supply.*Manager/ })).toBeVisible();
  const reps = brandi.getByRole("group", { name: "Herrick reps" });
  await expect(reps.getByRole("button", { name: /Mara Jensen.*Rep · Inside Sales/ })).toBeVisible();
  await expect(reps.getByRole("button", { name: /Eli Porter.*Rep · Outside Sales/ })).toBeVisible();
  await screenshot(brandi, testInfo, "act2-chooser");
  await brandi.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(brandi).toHaveURL(/\/rep\/quotes$/);

  // The red badge counts overdue quotes only (every rep's: Brandi is the manager, task U1), and opens
  // Needs attention: red first, then amber.
  const badge = brandi.getByRole("banner").getByRole("link", { name: /^Needs attention:/ });
  await expect(badge).toHaveAccessibleName(/^Needs attention: \d+ overdue quotes$/);
  const overdue = Number((await badge.getAttribute("aria-label"))!.match(/\d+/)![0]);
  expect(overdue).toBeGreaterThanOrEqual(2);
  await badge.click();
  await expect(brandi).toHaveURL(/\/rep\/quotes\?attention=1$/);
  await expect(brandi.getByRole("table").locator('[data-level="red"]')).toHaveCount(overdue);
  await expect(brandi.getByRole("navigation", { name: "Filter by status" }).getByRole("link", { name: /^Needs attention/ })).toHaveAttribute("aria-current", "page");
  await expect(quoteRow(brandi, "Q-24790").locator('[data-level="red"]')).toHaveText(/^Overdue/);
  await expect(quoteRow(brandi, "Q-24789").locator('[data-level="amber"]')).toHaveText(/^Aging/);
  await screenshot(brandi, testInfo, "act2-needs-attention");

  // Dana's new quote, unread, from All.
  await brandi.getByRole("navigation", { name: "Filter by status" }).getByRole("link", { name: /^All/ }).click();
  await quoteRow(brandi, quoteNumber).getByRole("link", { name: quoteNumber, exact: true }).click();
  await expect(brandi).toHaveURL(new RegExp(`/rep/quotes/${quoteNumber}$`));
  await expect(brandi.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");

  const viewChat = brandi.getByRole("button", { name: /^View full chat, \d+ messages$/ });
  await viewChat.click();
  const drawer = brandi.getByRole("dialog", { name: "Full chat" });
  await expect(drawer.locator('[data-role="customer"]').first()).toContainText(REQUEST);
  await screenshot(brandi, testInfo, "act2-full-chat");
  await drawer.getByRole("button", { name: "Close chat" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(brandi.getByRole("row").filter({ hasText: "HN-12-13-G8" })).toContainText("Chat suggestion");

  await brandi.getByRole("button", { name: "Approve & send" }).click();
  const send = brandi.getByRole("dialog", { name: "Send quote to Dana Ortiz" });
  await send.getByRole("button", { name: "Send quote" }).click();
  const confirm = brandi.getByRole("alertdialog", { name: "Confirm send" });
  await confirm.getByRole("button", { name: "Send", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(brandi.getByText(`Sent ${quoteNumber} rev 1 to Dana in Querent chat`)).toBeVisible();
  expect((await repDetail(quoteNumber)).quote).toMatchObject({ status: "sent", revision: 1 });
});

test("Act 3: Dana declines a different quote and picks a reason", async ({}, testInfo) => {
  const sidebar = dana.getByRole("complementary", { name: "Quotes" });
  await sidebar.getByRole("button").filter({ hasText: "Q-24791" }).click();
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
  await expect(sidebar.getByRole("button").filter({ hasText: "Q-24791" }).locator(".cx-chip")).toHaveText("Declined");
  expect((await repDetail("Q-24791")).quote).toMatchObject({ status: "declined", decline_reason: "price_too_high", unread_for_rep: true });
});

test("Act 4: Brandi compares Mara and Eli on Team, drills into the decline reasons, and reassigns a quote", async ({}, testInfo) => {
  await brandi.getByRole("navigation", { name: "Rep portal" }).getByRole("link", { name: "Team" }).click();
  await expect(brandi).toHaveURL(/\/rep\/team$/);
  await expect(brandi.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");

  // Compare Mara and Eli: untick Brandi and Nora. Their books are dated from the reset time.
  await brandi.getByRole("checkbox", { name: "Brandi Gallegos" }).uncheck();
  await brandi.getByRole("checkbox", { name: "Nora Chen" }).uncheck();
  await expect(leaderboard(brandi).getByRole("rowheader")).toHaveText(["Eli Porter", "Mara Jensen", "Total"]);
  await expect(repRow(brandi, "Mara Jensen").getByRole("cell", { name: "13 created" })).toBeVisible();
  await expect(repRow(brandi, "Eli Porter").getByRole("cell", { name: "20 created" })).toBeVisible();
  await expect(repRow(brandi, "Total").getByRole("cell", { name: "33 created" })).toBeVisible();
  await screenshot(brandi, testInfo, "act4-compare");

  // Every reason once, a decline with none, and the Other note in the customer's words.
  const declines = brandi.getByRole("region", { name: "Decline reasons" });
  for (const reason of ["Price too high", "Found other source", "Need it sooner than quoted", "Wrong items or quantity", "Other", "No reason given"])
    await expect(declines.getByRole("row", { name: new RegExp(`^${reason} 1 `) })).toBeVisible();
  await expect(declines.getByRole("list", { name: "Other reasons in their words" })).toContainText(OTHER_NOTE);
  await screenshot(brandi, testInfo, "act4-decline-reasons");
  await declines.getByRole("link", { name: "6 declined quotes" }).click();
  await expect(brandi).toHaveURL(/\/rep\/quotes\?(rep=[^&]+&)?from=.+status=declined/);
  expect(brandi.url()).not.toContain("scope=");
  await expect(brandi.getByRole("table").getByRole("rowheader")).toHaveCount(6);
  await screenshot(brandi, testInfo, "act4-declined-quotes");

  // Mara's overdue quotes, from her row: move her overdue draft to Eli.
  await brandi.goto("/rep/team");
  await repRow(brandi, "Mara Jensen").getByRole("link", { name: "2 overdue" }).click();
  await expect(brandi).toHaveURL(/\/rep\/quotes\?rep=mara&.*aging=red/);
  const draft = brandi.getByRole("table").getByRole("rowgroup").filter({ hasText: "Draft ready" });
  await expect(draft).toHaveCount(1);
  const number = (await draft.getByRole("rowheader").getByRole("link").textContent())!.match(/Q-\d+/)![0];
  await brandi.getByRole("checkbox", { name: `Select ${number}` }).check();
  await brandi.getByRole("region", { name: "Selected quotes" }).getByRole("button", { name: "Reassign…" }).click();
  const dialog = brandi.getByRole("dialog", { name: /^Reassign / });
  await dialog.getByRole("combobox", { name: "New rep" }).selectOption("eli");
  await screenshot(brandi, testInfo, "act4-reassign");
  await dialog.getByRole("button", { name: "Reassign" }).click();
  await expect(brandi.getByRole("status", { name: "Reassignment" })).toContainText("Eli Porter");
  const moved = await repDetail(number);
  expect(moved.quote).toMatchObject({ rep_id: "eli", original_rep_id: "mara" });
  expect(JSON.stringify(moved)).toContain(`Brandi Gallegos reassigned ${number} from Mara Jensen to Eli Porter`);
});

test("Act 5: Brandi views the impact preview, turns free delivery pricing on, and sees the ramp", async ({}, testInfo) => {
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
  await expect(free.getByRole("table", { name: "Average line price change by category" })).toBeVisible();
  await expect(free).toContainText(/[1-9]\d* of \d+ delivery quotes from the last 90 days would carry freight recovery\./);
  await screenshot(brandi, testInfo, "act5-preview");

  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  const ramp = free.getByRole("table", { name: "Ramp-in schedule" });
  await expect(ramp.getByRole("row")).toHaveCount(4);
  await expect(ramp.getByRole("row").nth(1)).toContainText("Step 1 of 3");
  await expect(ramp.getByRole("row").nth(1)).toContainText("Now");
  await expect(pool).toContainText(/Rate in force\d+\.\d%, ramp step 1 of 3/);
  await screenshot(brandi, testInfo, "act5-ramp");
});
