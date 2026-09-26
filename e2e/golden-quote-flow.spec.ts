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

test.fixme(
  "1. Dana asks about stock → answer",
  { tag: "@step1", annotation: { type: "task", description: "2.1 Tool-calling chat" } },
  async () => {
    const answer = await ask(dana, STOCK_QUESTION);
    await expect(answer).toContainText("HCS-12-13-2G8");
    await expect(answer).toContainText("64 at SLC");
  },
);

test.fixme(
  "2. Dana asks for goods with one vague line",
  { tag: "@step2", annotation: { type: "task", description: "2.2 Clarification loop" } },
  async () => {
    const answer = await ask(dana, REQUEST);
    // The bolts resolve; the cut-off wheels don't, so Querent asks instead of guessing a SKU.
    await expect(answer).toContainText("HCS-12-13-2G8");
    await expect(answer).toContainText(CLARIFYING_QUESTION);
    // TODO(2.2): assert the clarify UI (spec §3): the question, and after 2 unanswered rounds the
    // top 3 candidates as buttons plus Brandi's phone and email. No item pop-up yet.
  },
);

test.fixme(
  "3. Querent asks a clarifying question → Dana answers → item pop-up opens",
  { tag: "@step3", annotation: { type: "task", description: "2.3 Item pop-up → Request quote" } },
  async () => {
    await expect(dana.locator(".answer-bubble").last()).toContainText(CLARIFYING_QUESTION);
    const answer = await ask(dana, CLARIFICATION);
    await expect(answer).toContainText("Here is your list");
    await test.step("the item pop-up opens with every line matched", async () => {
      // TODO(2.3): the pop-up shows HCS-12-13-2G8 x 10 and CW-45-045-T1 x 6 with stock at SLC,
      // pickup at SLC preselected, qty editable, lines removable, and no prices anywhere.
    });
  },
);

test.fixme(
  "4. Dana presses Request quote → quote is ready_for_review",
  { tag: "@step4", annotation: { type: "task", description: "2.3 Item pop-up → Request quote" } },
  async () => {
    await test.step("Request quote creates the quote", async () => {
      // TODO(2.3): press Request quote; chat confirms "Sent to Brandi for review." with the new
      // quote number. Capture it: flow.quoteNumber = <Q-number from the confirmation>.
    });
    await test.step("the quote waits for Brandi in ready_for_review", async () => {
      // TODO(2.3): Dana's right sidebar lists it as "Awaiting rep" (2.4 builds the sidebar).
    });
  },
);

test.fixme(
  "5. Brandi opens it from the unread badge, switches a price basis, types a below-floor price → red warning",
  { tag: "@step5", annotation: { type: "task", description: "3.3 Quote detail" } },
  async () => {
    await test.step("open the quote from the unread badge", async () => {
      // TODO(3.3): Quotes nav shows the unread badge; open flow.quoteNumber from the list.
    });
    await test.step("switch a line's price basis", async () => {
      // TODO(3.3): the price-basis dropdown lists Contract / Customer / List / Last paid / Custom
      // with $ values, Querent's pick in bold; choosing another basis updates the line total.
    });
    await test.step("a below-floor price shows the red warning above the price field", async () => {
      // TODO(3.3): type a custom price below the floor → "Below Brandi's N% <category> floor"
      // appears directly above that price field. It never blocks.
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
