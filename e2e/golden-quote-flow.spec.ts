import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";

// Golden quote flow: workflow steps 1–8 of docs/design/querent-quote-flow.html, end to end
// (spec §1, §7 Definition of done item 3). One test per step, in order, sharing Dana's and
// Brandi's browser sessions. Every step started as `test.fixme`; the task named in its `task`
// annotation built the step, removed the fixme and made it pass. Since task 5.2 every step runs.
// Step 6 has a rep half (3.7) and a customer half (5.1), so it is two tests.
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
const flow = { quoteNumber: SAMPLE_QUOTE, /** The total Brandi sent in step 6 ("$1,122.40"). */ total: "" };

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

test(
  "6. Brandi Approve & send → Confirm (rep half)",
  { tag: "@step6", annotation: { type: "task", description: "3.7 Approve & send dialog" } },
  async () => {
    // Brandi is still on the quote from step 5, with the bolts priced below floor.
    await expect(brandi.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");
    await expect(brandi).toHaveURL(new RegExp(`/rep/quotes/${flow.quoteNumber}$`));
    const total = (await brandi.getByLabel("Quote totals").getByRole("definition").last().textContent())!.trim();
    flow.total = total;
    const sendQuote = brandi.getByRole("button", { name: "Send quote" });
    let sendQuoteBox: { x: number; y: number; width: number; height: number };

    await test.step("the send dialog: Querent chat only, Attach PDF on, an editable message", async () => {
      await brandi.getByRole("button", { name: "Approve & send" }).click();
      const dialog = brandi.getByRole("dialog", { name: "Send quote to Dana Ortiz" });
      await expect(dialog).toContainText(`2 items · ${total} before tax · Will call at SLC`);
      // The below-floor bolts only warn: Send quote stays enabled.
      await expect(dialog.getByText(/^Still open:/)).toContainText("below Brandi's 20% Fasteners floor");
      const via = dialog.getByRole("group", { name: "Send by" });
      await expect(via.getByRole("checkbox")).toHaveCount(2);
      await expect(via.getByRole("checkbox", { name: "Querent chat" })).toBeChecked();
      await expect(via.getByRole("checkbox", { name: "Querent chat" })).toBeDisabled();
      await expect(via.getByRole("checkbox", { name: "Attach PDF" })).toBeChecked();
      await dialog.getByRole("textbox", { name: "Message to Dana" }).fill(`Hi Dana, here is ${flow.quoteNumber}. Thanks, Brandi`);
      await expect(sendQuote).toBeEnabled();
      sendQuoteBox = (await sendQuote.boundingBox())!;
    });

    await test.step("Send quote → the centered Confirm send: red Cancel, Querent-green Send, away from Send quote", async () => {
      await sendQuote.click();
      const confirm = brandi.getByRole("alertdialog", { name: "Confirm send" });
      await expect(confirm).toContainText(`Quote${flow.quoteNumber} rev 1`);
      await expect(confirm).toContainText("ToDana Ortiz, Wasatch Mechanical Contractors");
      await expect(confirm).toContainText(`Total${total}before tax`);
      await expect(confirm).toContainText("Below floor1 line");
      const viewport = brandi.viewportSize()!;
      const box = (await confirm.boundingBox())!;
      expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
      expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2);
      await expect(confirm.getByRole("button", { name: "Cancel" })).toHaveCSS("background-color", "rgb(192, 57, 43)");
      const send = confirm.getByRole("button", { name: "Send", exact: true });
      await expect(send).toHaveCSS("background-color", "rgb(14, 124, 116)");
      const s = (await send.boundingBox())!;
      const overlaps =
        s.x < sendQuoteBox.x + sendQuoteBox.width && sendQuoteBox.x < s.x + s.width && s.y < sendQuoteBox.y + sendQuoteBox.height && sendQuoteBox.y < s.y + s.height;
      expect(overlaps, "Send sits where Send quote was").toBe(false);
      await send.click();
      await expect(confirm).toBeHidden();
    });

    await test.step("the quote is sent as rev 1", async () => {
      await expect(brandi.getByText(`Sent ${flow.quoteNumber} rev 1 to Dana in Querent chat`)).toBeVisible();
      await expect(brandi.getByText(/^Sent to Dana as rev 1 on /)).toBeVisible();
      await expect(brandi.locator("h1 + *")).toHaveText("Sent");
      await expect(brandi.getByRole("button", { name: "Approve & send" })).toBeDisabled();
      const detail = await brandi.evaluate((number) => fetch(`/api/rep/quotes/${number}`).then((r) => r.json()), flow.quoteNumber);
      expect(detail.quote).toMatchObject({ status: "sent", revision: 1 });
    });
  },
);

test(
  "6. Dana receives it and opens the PDF preview (customer half)",
  { tag: "@step6", annotation: { type: "task", description: "5.1 Quote delivery + PDF preview" } },
  async () => {
    const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Spec §3: "Quote Q-24817 is ready: $X, valid until Oct 7 — View quote". The send used today's
    // clock, so the day is whatever 14 days from now is.
    const headline = new RegExp(`^Quote ${flow.quoteNumber} is ready: ${escaped(flow.total)}, valid until [A-Z][a-z]{2} \\d{1,2}(, \\d{4})?$`);
    const notice = dana.getByRole("article", { name: headline });
    const preview = dana.getByRole("dialog", { name: `Quote ${flow.quoteNumber}` });
    const quotes = dana.getByRole("complementary", { name: "Quotes" });
    const button = quotes.getByRole("button").filter({ hasText: flow.quoteNumber });

    await test.step("the message arrives in Dana's chat without a reload: headline, Brandi's text, View quote", async () => {
      expect(flow.total, "step 6 (rep half) recorded the total it sent").toMatch(/^\$[\d,]+\.\d\d$/);
      await expect(notice).toBeVisible();
      await expect(notice.locator(".qn-text")).toHaveText(`Hi Dana, here is ${flow.quoteNumber}. Thanks, Brandi`);
      await expect(notice.getByRole("button", { name: "View quote" })).toBeVisible();
      // In the conversation Dana asked for it in, after the Request quote confirmation (step 4).
      const articles = dana.locator(".turns > article");
      await expect(articles.last()).toContainText(`Quote ${flow.quoteNumber} is ready`);
      await expect(articles.nth((await articles.count()) - 2)).toContainText("Sent to Brandi for review.");
      // The sidebar's button now reads Sent, with the total.
      await expect(button).toContainText(flow.total);
      await expect(button.locator(".cx-chip")).toHaveText("Sent");
    });

    await test.step("View quote opens the PDF preview: the customer PDF inline, Download at the top right", async () => {
      await notice.getByRole("button", { name: "View quote" }).click();
      await expect(preview).toBeVisible();
      const pdf = preview.getByRole("document", { name: `Quote ${flow.quoteNumber}, revision 1` });
      await expect(pdf).toHaveAttribute("data-state", "ready");
      await expect(pdf.locator("canvas.qp-sheet")).not.toHaveCount(0);
      // The pages' text (read to screen readers) is the customer PDF's: the quote, its total, no cost.
      await expect(pdf).toContainText("QUOTATION");
      await expect(pdf).toContainText(`${flow.quoteNumber} rev 1`);
      await expect(pdf).toContainText(flow.total);
      await expect(pdf).not.toContainText(/cost|margin|floor/i);
      const download = preview.getByRole("link", { name: "Download" });
      await expect(download).toBeVisible();
      const d = (await download.boundingBox())!;
      const p = (await preview.boundingBox())!;
      expect(p.x + p.width - (d.x + d.width), "Download sits at the right edge").toBeLessThan(80);
      expect(d.y - p.y, "Download sits at the top").toBeLessThan(60);
      // The action bar (5.2): Accept and Request changes are ready for steps 7 and 8.
      await expect(preview.getByRole("button", { name: "Accept" })).toBeEnabled();
      await expect(preview.getByRole("button", { name: "Request changes" })).toBeEnabled();
    });

    await test.step("Download saves the customer PDF", async () => {
      const [file] = await Promise.all([dana.waitForEvent("download"), preview.getByRole("link", { name: "Download" }).click()]);
      expect(file.suggestedFilename()).toBe(`Herrick Industrial Supply quote ${flow.quoteNumber} rev 1.pdf`);
      expect((await readFile((await file.path())!)).subarray(0, 5).toString()).toBe("%PDF-");
      const type = await dana.evaluate((url) => fetch(url).then((r) => r.headers.get("content-type")), file.url());
      expect(type).toBe("application/pdf");
    });

    await test.step("the sidebar's button opens the same preview", async () => {
      await preview.getByRole("button", { name: "Close" }).click();
      await expect(preview).toBeHidden();
      await button.click();
      await expect(preview.getByRole("document", { name: `Quote ${flow.quoteNumber}, revision 1` })).toHaveAttribute("data-state", "ready");
      await preview.getByRole("button", { name: "Close" }).click();
      await expect(preview).toBeHidden();
    });
  },
);

/** The note Dana sends with Request changes in step 7. */
const CHANGE_NOTE = "Can you make the bolts 12 boxes? Thanks, Dana";
/** Dana's PO in step 8. */
const PO = "WMC-7781";
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A weekday at least a day ahead in the branches' time zone (Mountain), as YYYY-MM-DD: always a valid pickup day. */
function pickupDay() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date());
  const day = new Date(`${today}T12:00:00.000Z`);
  do day.setUTCDate(day.getUTCDate() + 1);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6);
  return day.toISOString().slice(0, 10);
}
/** "Tue Sep 29" for a YYYY-MM-DD day. */
const weekdayDay = (day: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${day}T00:00:00.000Z`))
    .replace(",", "");

/** Spec §3's Confirm: centered on screen, with a red Cancel and a Querent-green Send (Confirm send's colours, step 6). */
async function expectCenteredConfirm(page: Page, confirm: Locator) {
  const viewport = page.viewportSize()!;
  const box = (await confirm.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2);
  await expect(confirm.getByRole("button", { name: "Cancel" })).toHaveCSS("background-color", "rgb(192, 57, 43)");
  await expect(confirm.getByRole("button", { name: "Send", exact: true })).toHaveCSS("background-color", "rgb(14, 124, 116)");
}

/** Brandi's Quotes badge, read in her page (the session cookie is Secure in production). */
const repBadge = () => brandi.evaluate(() => fetch("/api/rep/badges").then((r) => r.json()).then((b) => b.quotes as number));
/** The chat's "Quote … is ready" message for the latest send. */
const readyNotice = () => dana.getByRole("article", { name: new RegExp(`^Quote ${flow.quoteNumber} is ready: ${escaped(flow.total)}, `) });

test(
  "7. Dana Request changes (note) → Confirm → Brandi edits and sends rev 2",
  { tag: "@step7", annotation: { type: "task", description: "5.2 Accept / Request changes" } },
  async () => {
    const preview = dana.getByRole("dialog", { name: `Quote ${flow.quoteNumber}` });
    const button = dana.getByRole("complementary", { name: "Quotes" }).getByRole("button").filter({ hasText: flow.quoteNumber });
    const unread = await repBadge();

    await test.step("Dana requests changes with a note", async () => {
      await button.click();
      await expect(preview.getByRole("document", { name: `Quote ${flow.quoteNumber}, revision 1` })).toHaveAttribute("data-state", "ready");
      await preview.getByRole("button", { name: "Request changes" }).click();
      const form = preview.getByRole("form", { name: `Request changes to ${flow.quoteNumber} rev 1` });
      // The note is required.
      await form.getByRole("button", { name: "Review request" }).click();
      await expect(form.getByRole("alert")).toHaveText("Say what should change: a note is required.");
      await form.getByLabel("What should Brandi change?").fill(CHANGE_NOTE);
      await form.getByRole("button", { name: "Review request" }).click();
      const confirm = dana.getByRole("alertdialog", { name: "Confirm change request" });
      await expect(confirm).toContainText(`Send your change request for ${flow.quoteNumber} rev 1 to Brandi?`);
      await expect(confirm).toContainText(`Quote${flow.quoteNumber} rev 1`);
      await expect(confirm).toContainText("ToBrandi Gallegos");
      await expect(confirm).toContainText(`Note${CHANGE_NOTE}`);
      await expectCenteredConfirm(dana, confirm);
      await confirm.getByRole("button", { name: "Send", exact: true }).click();
      await expect(confirm).toBeHidden();
      await expect(preview.locator(".cx-chip")).toHaveText("Changes requested");
      await expect(preview.getByRole("group", { name: "Respond to this quote" })).toContainText("You asked for changes to rev 1. Brandi is revising the quote.");
      await expect(preview.getByRole("button", { name: "Accept" })).toBeDisabled();
      await expect(button.locator(".cx-chip")).toHaveText("Changes requested");
      await preview.getByRole("button", { name: "Close" }).click();
      await expect(preview).toBeHidden();
    });

    await test.step("Brandi edits the quote and sends rev 2", async () => {
      // The badge, and the Quotes list: the row highlighted, with Dana's note.
      await expect.poll(repBadge).toBe(unread + 1);
      await brandi.goto("/rep/quotes");
      const row = brandi.getByRole("table").getByRole("rowgroup").filter({ has: brandi.getByRole("link", { name: flow.quoteNumber, exact: true }) });
      await expect(row).toHaveAttribute("data-status", "changes_requested");
      await expect(row.getByRole("rowheader")).toHaveText(/^Unread: /);
      await expect(row.getByText(/^Dana Ortiz asked for changes · /)).toBeVisible();
      await expect(row.getByText(CHANGE_NOTE)).toBeVisible();
      await row.getByRole("link", { name: flow.quoteNumber, exact: true }).click();
      await expect(brandi).toHaveURL(new RegExp(`/rep/quotes/${flow.quoteNumber}$`));
      await expect(brandi.locator("h1 + *")).toHaveText("Changes requested");
      await expect(brandi.getByText(CHANGE_NOTE)).toBeVisible();
      // Editable again (1.5 canEditDraft): Brandi makes the bolts 12 boxes, as Dana asked.
      const qty = brandi.getByRole("textbox", { name: "Quantity for HCS-12-13-2G8" });
      await expect(qty).toBeEditable();
      await qty.fill("12");
      await qty.press("Tab");
      await expect(brandi.getByText("All changes saved")).toBeVisible();
      flow.total = (await brandi.getByLabel("Quote totals").getByRole("definition").last().textContent())!.trim();
      await brandi.getByRole("button", { name: "Approve & send" }).click();
      const dialog = brandi.getByRole("dialog", { name: "Send quote to Dana Ortiz" });
      await dialog.getByRole("textbox", { name: "Message to Dana" }).fill("Hi Dana, 12 boxes of bolts on rev 2. Thanks, Brandi");
      await dialog.getByRole("button", { name: "Send quote" }).click();
      const confirm = brandi.getByRole("alertdialog", { name: "Confirm send" });
      await expect(confirm).toContainText(`Quote${flow.quoteNumber} rev 2`);
      await expect(confirm).toContainText(`Total${flow.total}before tax`);
      await confirm.getByRole("button", { name: "Send", exact: true }).click();
      await expect(brandi.getByText(`Sent ${flow.quoteNumber} rev 2 to Dana in Querent chat`)).toBeVisible();
      await expect(brandi.locator("h1 + *")).toHaveText("Sent");
    });

    await test.step("Dana's chat and sidebar show rev 2", async () => {
      await expect(readyNotice()).toBeVisible();
      await expect(readyNotice().locator(".qn-text")).toHaveText("Hi Dana, 12 boxes of bolts on rev 2. Thanks, Brandi");
      await expect(button).toContainText(flow.total);
      await expect(button.locator(".cx-chip")).toHaveText("Sent");
    });
  },
);

test(
  "8. Dana Accept (pickup time, PO) → Confirm → Brandi sees Accepted; both PDFs download and validate",
  { tag: "@step8", annotation: { type: "task", description: "5.2 Accept / Request changes" } },
  async () => {
    const preview = dana.getByRole("dialog", { name: `Quote ${flow.quoteNumber}` });
    const day = pickupDay();
    const when = `${weekdayDay(day)}, 10:00 AM`;
    const unread = await repBadge();

    await test.step("Dana accepts with a pickup time and PO", async () => {
      await readyNotice().getByRole("button", { name: "View quote" }).click();
      await expect(preview.getByRole("document", { name: `Quote ${flow.quoteNumber}, revision 2` })).toHaveAttribute("data-state", "ready");
      await preview.getByRole("button", { name: "Accept" }).click();
      const form = preview.getByRole("form", { name: `Accept ${flow.quoteNumber} rev 2` });
      // Branch and pickup are locked to what Brandi approved.
      await expect(form.getByRole("radio", { name: "Pickup" })).toBeChecked();
      await expect(form.getByRole("radio", { name: "Pickup" })).toBeDisabled();
      await expect(form.getByRole("radio", { name: "Delivery" })).toBeDisabled();
      await expect(form.getByRole("combobox", { name: "Branch" })).toHaveValue("SLC");
      await expect(form.getByRole("combobox", { name: "Branch" })).toBeDisabled();
      // The day can't be in the past.
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date());
      expect((await form.getByLabel("Pickup day").getAttribute("min"))! >= today).toBe(true);
      await form.getByLabel("Pickup day").fill(day);
      await form.getByLabel("Pickup time").selectOption({ label: "10:00 AM" });
      await form.getByLabel("PO number").fill(PO);
      await form.getByRole("button", { name: "Review and accept" }).click();
      const confirm = dana.getByRole("alertdialog", { name: "Confirm acceptance" });
      await expect(confirm).toContainText(`Accept ${flow.quoteNumber} rev 2 for ${flow.total}, pickup ${when} at SLC, PO ${PO}?`);
      await expect(confirm).toContainText(`PO${PO}`);
      await expectCenteredConfirm(dana, confirm);
      await confirm.getByRole("button", { name: "Send", exact: true }).click();
      await expect(confirm).toBeHidden();
      await expect(preview.locator(".cx-chip")).toHaveText("Accepted");
      await expect(preview.getByRole("group", { name: "Respond to this quote" })).toContainText(`You accepted rev 2 with PO ${PO}: pickup ${when} at SLC.`);
      await expect(preview.getByRole("button", { name: "Accept" })).toBeDisabled();
      const button = dana.getByRole("complementary", { name: "Quotes" }).getByRole("button").filter({ hasText: flow.quoteNumber });
      await expect(button.locator(".cx-chip")).toHaveText("Accepted");
      await preview.getByRole("button", { name: "Close" }).click();
    });

    await test.step("Brandi sees Accepted", async () => {
      // Badge + activity entry; the status chip reads Accepted, with the PO and the pickup time.
      await expect.poll(repBadge).toBe(unread + 1);
      await brandi.goto(`/rep/quotes/${flow.quoteNumber}`);
      await expect(brandi.locator("h1 + *")).toHaveText("Accepted");
      await expect(brandi.getByText(new RegExp(`^Dana accepted rev 2 on [A-Z][a-z]{2} \\d{1,2} with PO ${PO}, pickup ${when} at SLC\\.`))).toBeVisible();
      await brandi.getByRole("group", { name: "Activity" }).locator("summary").click();
      await expect(brandi.getByRole("list", { name: "Activity, newest first" }).getByRole("listitem").first()).toContainText(
        `Dana accepted ${flow.quoteNumber} rev 2 (${flow.total}) with PO ${PO}, pickup at SLC`,
      );
      await expect(brandi.getByRole("group", { name: "Quote terms" }).locator("summary")).toContainText(`PO ${PO}`);
      await expect(brandi.getByRole("group", { name: "Pickup or delivery" }).locator("summary")).toContainText(when);
      await expect(brandi.getByRole("button", { name: "Approve & send" })).toBeDisabled();
    });

    await test.step("the Customer PDF and the Internal worksheet download and validate", async () => {
      const exports = [
        [/^Customer quote \(PDF\)/, "customer"],
        [/^Internal worksheet \(PDF\)/, "internal"],
      ] as const;
      for (const [item, variant] of exports) {
        await brandi.getByRole("button", { name: "Export" }).click();
        const menu = brandi.getByRole("menu", { name: "Export" });
        const [file] = await Promise.all([brandi.waitForEvent("download"), menu.getByRole("menuitem", { name: item }).click()]);
        expect(file.suggestedFilename(), variant).toContain(`${flow.quoteNumber} rev 2`);
        const body = await readFile((await file.path())!);
        expect(body.subarray(0, 5).toString(), variant).toBe("%PDF-");
        const { text } = await extractText(await getDocumentProxy(new Uint8Array(body)), { mergePages: true });
        expect(text, variant).toContain(flow.quoteNumber);
        if (variant === "internal") expect(text).toContain("CONFIDENTIAL");
        else expect(text).not.toMatch(/cost|margin|floor/i);
      }
    });
  },
);
