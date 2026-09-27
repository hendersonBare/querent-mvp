import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

// Golden quote flow: workflow steps 1–8 of docs/design/querent-quote-flow.html, end to end
// (spec §1, §7 Definition of done item 3). One test per step, in order, sharing Dana's and
// Brandi's browser sessions. Every step starts as `test.fixme`; the task named in its `task`
// annotation builds the step, removes the fixme and makes it pass. Step 6 has a rep half (3.7)
// and a customer half (5.1), so it is two tests.
//
// Chat runs in scripted mode (spec §6.5): deterministic and offline, the same in CI and locally.
// Before the spec, beforeAll resets the database to the seed pinned to the mockup's day through
// the test-only POST /api/test/reset. That hook exists only when the server runs with
// QUERENT_E2E_RESET=1, which playwright.config.ts sets for the server it starts (CI, or locally
// with QUERENT_WEBSERVER=1). Against your own server, start it with
// QUERENT_E2E_RESET=1 QUERENT_SCRIPTED=1.

const SEED_DATE = "2026-09-23";
/** The seeded sample quote (spec §2): ready_for_review with Brandi's unread badge set. */
const SAMPLE_QUOTE = "Q-24817";

// The scripted Dana conversation (src/server/chat/scripted.ts).
const STOCK_QUESTION = "Do you have 1/2 in grade 8 hex bolts in stock?";
const REQUEST =
  "Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels. We'll pick up at SLC.";
const CLARIFYING_QUESTION = "Type 1 or Type 27 cut-off wheels?";
/** The request's vague line, as Dana said it. */
const VAGUE_LINE = "6 boxes of cut-off wheels";
/** A reply that settles nothing: the next round (src/server/chat/clarify.ts). */
const UNSURE = "Not sure";
const CLARIFICATION = "Type 1";

test.describe.configure({ mode: "serial" });

let dana: Page;
let brandi: Page;
const contexts: BrowserContext[] = [];
let reset: { ok: boolean; seed_date: string; chat_mode: string };
/**
 * The quote steps 5–8 work on: the one Dana requests in step 4. Until step 4 runs, later steps
 * use the seeded sample quote, which is in the same state (ready_for_review, unread for Brandi).
 */
const flow = { quoteNumber: SAMPLE_QUOTE };

async function signIn(browser: Browser, baseURL: string, workspace: string) {
  const context = await browser.newContext({ baseURL });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(workspace) }).click();
  return page;
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

test.beforeAll(async ({ browser, playwright }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL!;
  const api = await playwright.request.newContext({ baseURL });
  try {
    const response = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(
      response.status(),
      "POST /api/test/reset failed: start the server with QUERENT_E2E_RESET=1 (playwright.config.ts does this with QUERENT_WEBSERVER=1)",
    ).toBe(200);
    reset = await response.json();
  } finally {
    await api.dispose();
  }
  dana = await signIn(browser, baseURL, "Wasatch Mechanical Contractors");
  brandi = await signIn(browser, baseURL, "Herrick Industrial Supply");
});

test.afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
});

test("0. Setup: fresh seed on the mockup's day, scripted chat, both personas signed in", async () => {
  expect(reset).toEqual({ ok: true, seed_date: SEED_DATE, chat_mode: "scripted" });
  await expect(dana.getByLabel("Ask a question")).toBeVisible();
  await expect(dana.locator(".customer-header")).toContainText("Wasatch Mechanical Contractors");
  await expect(brandi.getByRole("button", { name: "Account: Brandi Gallegos" })).toHaveText("BG");
});

test(
  "1. Dana asks about stock → answer",
  { tag: "@step1", annotation: { type: "task", description: "2.1 Tool-calling chat" } },
  async () => {
    const answer = await ask(dana, STOCK_QUESTION);
    // Stock at every branch, from the get_stock tool (spec §1 step 2).
    await expect(answer).toContainText("HCS-12-13-2G8");
    await expect(answer).toContainText("64 at SLC, 22 at Ogden and 8 at Provo");
  },
);

test(
  "2. Dana asks for goods with one vague line",
  { tag: "@step2", annotation: { type: "task", description: "2.2 Clarification loop" } },
  async () => {
    const answer = await ask(dana, REQUEST);
    // The bolts resolve; the cut-off wheels don't, so Querent asks instead of guessing a SKU.
    await expect(answer).toContainText("HCS-12-13-2G8");
    await expect(answer).toContainText(CLARIFYING_QUESTION);
    await test.step("round 1: the question only; no candidate buttons, no rep card, no item pop-up", async () => {
      await expect(answer.getByRole("group", { name: /^Choose the item/ })).toHaveCount(0);
      await expect(answer.getByRole("region", { name: "Call your rep" })).toHaveCount(0);
      await expect(answer).not.toContainText("Here is your list");
    });
    await test.step("round 2: a reply that settles nothing brings the top 3 candidates as buttons and Brandi's phone and email", async () => {
      const again = await ask(dana, UNSURE);
      await expect(again).toContainText(CLARIFYING_QUESTION);
      const choices = again.getByRole("group", { name: `Choose the item for “${VAGUE_LINE}”` });
      await expect(choices.getByRole("button")).toHaveCount(3);
      await expect(choices.getByRole("button")).toContainText(["CW-45-045-T1", "CW-45-045-T27", "CW-45-090-T27"]);
      // Candidate buttons show identity only: no price (Pricing is not asked for here) and no cost.
      await expect(choices).not.toContainText("$");
      await expect(again).toContainText("Not sure? Call Brandi Gallegos.");
      const rep = again.getByRole("region", { name: "Call your rep" });
      await expect(rep).toContainText("Brandi Gallegos");
      await expect(rep.getByRole("link", { name: /\(801\) 111-2222/ })).toHaveAttribute("href", "tel:8011112222");
      await expect(rep.getByRole("link", { name: "brandi.gallegos@herrickindustrial.com" })).toHaveAttribute(
        "href",
        "mailto:brandi.gallegos@herrickindustrial.com",
      );
      await expect(again.getByRole("button", { name: `Drop this line: ${VAGUE_LINE}` })).toBeVisible();
      await expect(again).not.toContainText("Here is your list");
    });
  },
);

test(
  "3. Querent asks a clarifying question → Dana answers → item pop-up opens",
  { tag: "@step3", annotation: { type: "task", description: "2.3 Item pop-up → Request quote" } },
  async () => {
    await expect(dana.locator(".answer-bubble").last()).toContainText(CLARIFYING_QUESTION);
    const answer = await ask(dana, CLARIFICATION);
    await expect(answer).toContainText("Here is your list");
    await test.step("the item pop-up opens with every line matched", async () => {
      const popup = dana.getByRole("dialog", { name: "Review your list" });
      await expect(popup).toBeVisible();
      const line = (sku: string) => popup.getByRole("listitem").filter({ hasText: sku });
      await expect(popup.getByRole("listitem")).toHaveCount(2);
      // Qty as Dana asked, editable; stock read now at the chosen branch (SLC).
      await expect(popup.getByLabel("Qty for HCS-12-13-2G8")).toHaveValue("10");
      await expect(popup.getByLabel("Qty for HCS-12-13-2G8")).toBeEditable();
      await expect(popup.getByLabel("Qty for CW-45-045-T1")).toHaveValue("6");
      await expect(line("HCS-12-13-2G8")).toContainText("Hex cap screw 1/2-13 x 2 in, Grade 8");
      await expect(line("HCS-12-13-2G8")).toContainText("64 at SLC");
      await expect(line("CW-45-045-T1")).toContainText("140 at SLC");
      // Pickup at SLC preselected, from "We'll pick up at SLC".
      await expect(popup.getByRole("radio", { name: "Pickup" })).toBeChecked();
      await expect(popup.getByRole("combobox", { name: "Branch" })).toHaveValue("slc");
      await expect(popup.getByRole("button", { name: "Remove HCS-12-13-2G8" })).toBeEnabled();
      await expect(popup.getByRole("button", { name: "Remove CW-45-045-T1" })).toBeEnabled();
      // No prices anywhere: Brandi prices the quote.
      await expect(popup).not.toContainText("$");
      await expect(dana.locator(".answer-bubble").last()).not.toContainText("$");
    });
  },
);

test(
  "4. Dana presses Request quote → quote is ready_for_review",
  { tag: "@step4", annotation: { type: "task", description: "2.3 Item pop-up → Request quote" } },
  async () => {
    // Read in Brandi's page: the session cookie is Secure in production, which the request API won't send over http.
    const badge = () => brandi.evaluate(() => fetch("/api/rep/badges").then((r) => r.json()).then((b) => b.quotes as number));
    const unread = await badge();
    await test.step("Request quote creates the quote", async () => {
      const popup = dana.getByRole("dialog", { name: "Review your list" });
      const answers = dana.locator(".answer-bubble");
      const before = await answers.count();
      await popup.getByRole("button", { name: "Request quote" }).click();
      await expect(popup).toBeHidden();
      await expect(answers).toHaveCount(before + 1);
      const confirmation = answers.last();
      await expect(confirmation).toContainText("Sent to Brandi for review.");
      const quoteNumber = (await confirmation.textContent())?.match(/Q-\d+/)?.[0];
      expect(quoteNumber, "the confirmation names the new quote").toBeTruthy();
      // A new quote: the seeded sample Q-24817 stays as it is (spec §2).
      expect(quoteNumber).not.toBe(SAMPLE_QUOTE);
      flow.quoteNumber = quoteNumber!;
      await expect(answers.nth(before - 1)).toContainText(`Quote ${flow.quoteNumber} requested`);
    });
    await test.step("the quote waits for Brandi in ready_for_review", async () => {
      const quotes = dana.getByRole("complementary", { name: "Quotes" });
      const button = quotes.getByRole("button").filter({ hasText: flow.quoteNumber });
      await expect(button).toContainText("Awaiting rep");
      // Newest first.
      await expect(quotes.getByRole("button").first()).toContainText(flow.quoteNumber);
      // Brandi's Quotes badge counts it (unread_for_rep).
      await expect.poll(badge).toBe(unread + 1);
    });
  },
);

test(
  "5. Brandi opens it from the unread badge, switches a price basis, types a below-floor price → red warning",
  { tag: "@step5", annotation: { type: "task", description: "3.3 Quote detail" } },
  async () => {
    // The bolts are on both the sample and the quote Dana requests in step 4.
    const SKU = "HCS-12-13-2G8";
    const line = () => brandi.getByRole("rowheader", { name: new RegExp(SKU) }).locator("xpath=ancestor::tbody[1]");
    const price = () => line().getByRole("textbox", { name: `Unit price for ${SKU}` });
    const basis = () => line().getByRole("button", { name: new RegExp(`^Price basis for ${SKU}: `) });
    const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

    await test.step("open the quote from the unread badge", async () => {
      await brandi.goto("/rep/quotes");
      const quotes = brandi.getByRole("navigation", { name: "Rep portal" }).getByRole("link", { name: /^Quotes\b/ });
      await expect(quotes).toHaveAccessibleName(/^Quotes \d+ unread$/);
      const unread = Number((await quotes.textContent())!.match(/\d+/)![0]);
      await quotes.click();
      const row = brandi.getByRole("table").getByRole("rowgroup").filter({ has: brandi.getByRole("link", { name: flow.quoteNumber, exact: true }) });
      await expect(row.getByRole("rowheader")).toHaveText(/^Unread: /);
      await row.getByRole("link", { name: flow.quoteNumber, exact: true }).click();
      await expect(brandi).toHaveURL(new RegExp(`/rep/quotes/${flow.quoteNumber}$`));
      await expect(brandi.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");
      await expect(brandi.getByText("Draft ready")).toBeVisible();
      // Opening it cleared its unread flag, so the badge dropped by one.
      await expect(quotes).toHaveAccessibleName(unread > 1 ? `Quotes ${unread - 1} unread` : "Quotes");
    });

    await test.step("switch a line's price basis", async () => {
      await basis().click();
      const list = brandi.getByRole("listbox", { name: `Price basis for ${SKU}` });
      const options = list.getByRole("option");
      await expect(options).toHaveText([/^Contract/, /^Customer.*\$\d/, /^List.*\$\d/, /^Last paid.*\$\d/, /^Custom/]);
      // Querent's pick is bold, and it is the only bold option.
      const pick = options.filter({ has: brandi.locator("strong") });
      await expect(pick).toHaveCount(1);
      await expect(pick).toContainText("Querent’s pick");
      // Switch to another basis (List, unless List is already the line's basis).
      const current = (await basis().innerText()).trim();
      const target = options.filter({ hasText: current === "List" ? /^Customer/ : /^List/ });
      const targetPrice = Number((await target.innerText()).match(/\$([\d,]+\.\d\d)/)![1].replace(/,/g, ""));
      await target.click();
      await expect(list).toHaveCount(0);
      await expect(price()).toHaveValue(targetPrice.toFixed(2));
      const qty = Number(await line().getByRole("textbox", { name: `Quantity for ${SKU}` }).inputValue());
      await expect(line().getByRole("cell").nth(5)).toHaveText(usd(qty * targetPrice));
      await expect(brandi.getByText("All changes saved")).toBeVisible();
    });

    await test.step("a below-floor price shows the red warning above the price field", async () => {
      await expect(line().getByRole("note")).toHaveCount(0);
      await price().fill("22.00");
      await price().press("Tab");
      const warning = line().getByRole("note");
      await expect(warning).toHaveText("Below Brandi's 20% Fasteners floor");
      await expect(basis()).toHaveAccessibleName(`Price basis for ${SKU}: Custom`);
      await expect(price()).toHaveAttribute("aria-describedby", (await warning.getAttribute("id"))!);
      // Directly above the price field: its bottom edge just over the field, and overlapping it sideways.
      const w = (await warning.boundingBox())!;
      const p = (await price().boundingBox())!;
      expect(w.y + w.height).toBeLessThanOrEqual(p.y);
      expect(p.y - (w.y + w.height)).toBeLessThan(16);
      expect(w.x).toBeLessThan(p.x + p.width);
      expect(w.x + w.width).toBeGreaterThan(p.x);
      // It never blocks: Approve & send stays available, and the price is saved.
      await expect(brandi.getByRole("button", { name: "Approve & send" })).toBeEnabled();
      await expect(brandi.getByText("All changes saved")).toBeVisible();
      await brandi.reload();
      await expect(price()).toHaveValue("22.00");
      await expect(line().getByRole("note")).toHaveText("Below Brandi's 20% Fasteners floor");
    });
  },
);

test.fixme(
  "6. Brandi Approve & send → Confirm (rep half)",
  { tag: "@step6", annotation: { type: "task", description: "3.7 Approve & send dialog" } },
  async () => {
    // TODO(3.7): Approve & send → send dialog (Querent chat only, Attach PDF on) → Send quote →
    // centered Confirm send dialog (red Cancel, Querent-green Send) → Send. Status becomes sent (rev 1).
  },
);

test.fixme(
  "6. Dana receives it and opens the PDF preview (customer half)",
  { tag: "@step6", annotation: { type: "task", description: "5.1 Quote delivery + PDF preview" } },
  async () => {
    // TODO(5.1): Dana's chat shows "Quote <flow.quoteNumber> is ready: $X, valid until … — View quote";
    // View quote opens the PDF preview modal with the Customer PDF inline and Download top right.
  },
);

test.fixme(
  "7. Dana Request changes (note) → Confirm → Brandi edits and sends rev 2",
  { tag: "@step7", annotation: { type: "task", description: "5.2 Accept / Request changes" } },
  async () => {
    await test.step("Dana requests changes with a note", async () => {
      // TODO(5.2): Request changes → required note → centered Confirm dialog → Send.
    });
    await test.step("Brandi edits the quote and sends rev 2", async () => {
      // TODO(5.2): the Quotes list highlights changes_requested with Dana's note; Brandi edits a
      // line, then Approve & send → Confirm; Dana's chat and sidebar show rev 2.
    });
  },
);

test.fixme(
  "8. Dana Accept (pickup time, PO) → Confirm → Brandi sees Accepted; both PDFs download and validate",
  { tag: "@step8", annotation: { type: "task", description: "5.2 Accept / Request changes" } },
  async () => {
    await test.step("Dana accepts with a pickup time and PO", async () => {
      // TODO(5.2): Accept (branch and pickup/delivery locked) → pickup time + PO → centered
      // Confirm ("Accept <quote> rev 2 for $X, pickup … at SLC, PO …?") → Send.
    });
    await test.step("Brandi sees Accepted", async () => {
      // TODO(5.2): badge + activity entry; the quote's status chip reads Accepted.
    });
    await test.step("the Customer PDF and the Internal worksheet download and validate", async () => {
      // TODO(5.2): download both (Export menu, 4.3) and check each starts with "%PDF-" and
      // names flow.quoteNumber.
    });
  },
);
