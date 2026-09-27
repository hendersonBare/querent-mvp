import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

// Quote delivery (task 5.1, spec §3): when Brandi sends a quote, Dana's chat gets "Quote Q-… is
// ready: $X, valid until …" with Brandi's message as plain text and View quote, which opens the
// PDF preview modal: the customer PDF drawn inline, Download at the top right (when Attach PDF was
// on), and the Accept / Request changes bar for 5.2, disabled for now. The right sidebar's quote
// buttons open the same modal. Dana only ever sees her own quotes.
//
// Runs on the mockup's seed day through the test-only reset (see golden-quote-flow.spec.ts):
// start your own server with QUERENT_E2E_RESET=1, or let playwright.config.ts start one. Screenshots
// of the chat message and the modal at 1440px and 390px go to this test's output folder.

const SEED_DATE = "2026-09-23";
const SAMPLE = "Q-24817";
/** What Brandi types: HTML and Markdown that must show as typed. */
const MESSAGE = 'Hi Dana, here is Q-24817.\n\n<b>Bold?</b> **Stars?** <img src=x onerror="window.__pwned=1"> [a link](javascript:alert(1))\nThanks, Brandi';

test.describe.configure({ mode: "serial" });

const contexts: BrowserContext[] = [];
let dana: Page;
let brandi: Page;
let sentTotal = "";

async function newPage(browser: Browser, baseURL: string, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ baseURL, viewport });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto("/");
  return page;
}

async function signInAsDana(page: Page) {
  await page.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
  await expect(page.getByLabel("Ask a question")).toBeVisible();
}

/** Approve & send as Brandi (POST /api/rep/quotes/<n>/send, task 3.7), confirming the revision and total the send check shows. */
async function send(number: string, message: string, attachPdf: boolean) {
  const result = await brandi.evaluate(
    async ({ number, message, attachPdf }) => {
      const detail = await fetch(`/api/rep/quotes/${number}`).then((r) => r.json());
      const { total, revision } = detail.send_check;
      const response = await fetch(`/api/rep/quotes/${number}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, attach_pdf: attachPdf, revision, total }),
      });
      return { status: response.status, total: total as number };
    },
    { number, message, attachPdf },
  );
  expect(result.status, `sending ${number}`).toBe(200);
  return result.total.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const notice = (page: Page, number: string) => page.getByRole("article", { name: new RegExp(`^Quote ${number} is ready: `) });
const preview = (page: Page, number: string) => page.getByRole("dialog", { name: `Quote ${number}` });
const noSideways = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

test.beforeAll(async ({ browser, playwright }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL!;
  const api = await playwright.request.newContext({ baseURL });
  try {
    const response = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(response.status(), "POST /api/test/reset failed: start the server with QUERENT_E2E_RESET=1").toBe(200);
  } finally {
    await api.dispose();
  }
  brandi = await newPage(browser, baseURL);
  const status = await brandi.evaluate(async () => (await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ persona: "supplier" }) })).status);
  expect(status).toBe(200);
  dana = await newPage(browser, baseURL);
  await signInAsDana(dana);
});

test.afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
});

test("before Brandi sends: the Awaiting rep quote opens a preview that says she is pricing it, with no PDF", async () => {
  const quotes = dana.getByRole("complementary", { name: "Quotes" });
  await quotes.getByRole("button").filter({ hasText: SAMPLE }).click();
  const modal = preview(dana, SAMPLE);
  await expect(modal).toBeVisible();
  await expect(modal.locator(".cx-chip")).toHaveText("Awaiting rep");
  await expect(modal).toContainText("Brandi is pricing this quote");
  await expect(modal.getByRole("document")).toHaveCount(0);
  await expect(modal.getByRole("link", { name: "Download" })).toHaveCount(0);
  await expect(modal.getByRole("button", { name: "Accept" })).toBeDisabled();
  // The customer PDF doesn't exist before the first send: the route says so too.
  expect(await dana.evaluate(() => fetch("/api/quotes/q-24817/pdf?variant=customer").then((r) => r.status))).toBe(404);
  await dana.keyboard.press("Escape");
  await expect(modal).toBeHidden();
});

test("Brandi sends: Dana's chat shows the message without a reload, her text as plain text", async ({}, testInfo) => {
  expect(await dana.evaluate(() => document.querySelectorAll(".quote-notice").length)).toBe(0);
  sentTotal = await send(SAMPLE, MESSAGE, true);
  // Q-24817 was asked for in the seeded conversation, not the one on Dana's screen: it still reaches
  // her, because it waits for her answer. The chat looks every 5 s.
  const card = notice(dana, SAMPLE);
  await expect(card).toBeVisible();
  await expect(card.locator(".qn-headline")).toHaveText(new RegExp(`^Quote ${SAMPLE} is ready: ${sentTotal.replace(/[$.]/g, "\\$&")}, valid until [A-Z][a-z]{2} \\d{1,2}(, \\d{4})?$`));
  await expect(card.locator(".qn-text")).toHaveText(MESSAGE);
  for (const tag of ["b", "strong", "img", "a", "script"]) await expect(card.locator(`.qn-text ${tag}`)).toHaveCount(0);
  expect(await dana.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  await expect(card.getByRole("button", { name: "View quote" })).toBeVisible();
  // The sidebar follows: Sent, with the total.
  const button = dana.getByRole("complementary", { name: "Quotes" }).getByRole("button").filter({ hasText: SAMPLE });
  await expect(button).toContainText(sentTotal);
  await expect(button.locator(".cx-chip")).toHaveText("Sent");
  await card.scrollIntoViewIfNeeded();
  await dana.screenshot({ path: testInfo.outputPath("5.1-chat-message-1440.png") });
});

test("the message is still there after a reload", async () => {
  await dana.reload();
  await expect(notice(dana, SAMPLE)).toBeVisible();
  await expect(notice(dana, SAMPLE).locator(".qn-text")).toHaveText(MESSAGE);
});

test("View quote opens the preview: the customer PDF inline, Download at the top right, the action bar disabled", async ({}, testInfo) => {
  await notice(dana, SAMPLE).getByRole("button", { name: "View quote" }).click();
  const modal = preview(dana, SAMPLE);
  await expect(modal).toBeVisible();
  const pdf = modal.getByRole("document", { name: `Quote ${SAMPLE}, revision 1` });
  await expect(pdf).toHaveAttribute("data-state", "ready");
  await expect(pdf.locator("canvas.qp-sheet")).toHaveCount(1);
  // The canvas really has the page on it: not blank.
  expect(await pdf.locator("canvas.qp-sheet").evaluate((c: HTMLCanvasElement) => {
    const { data } = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 128) dark++;
    return dark;
  })).toBeGreaterThan(1000);
  await expect(pdf).toContainText(`${SAMPLE} rev 1`);
  await expect(pdf).toContainText(sentTotal);
  await expect(modal.locator(".qp-facts")).toContainText(`Total${sentTotal}`);
  await expect(modal.locator(".cx-chip")).toHaveText("Sent");
  const download = modal.getByRole("link", { name: "Download" });
  const d = (await download.boundingBox())!;
  const m = (await modal.boundingBox())!;
  expect(m.x + m.width - (d.x + d.width)).toBeLessThan(80);
  expect(d.y - m.y).toBeLessThan(60);
  await expect(modal.getByRole("button", { name: "Accept" })).toBeDisabled();
  await expect(modal.getByRole("button", { name: "Request changes" })).toBeDisabled();
  await expect(modal.getByRole("group", { name: "Respond to this quote" })).toContainText("reply to Brandi in chat");
  await dana.screenshot({ path: testInfo.outputPath("5.1-modal-1440.png") });

  await test.step("Download saves the customer PDF, named for the quote", async () => {
    const [file] = await Promise.all([dana.waitForEvent("download"), download.click()]);
    expect(file.suggestedFilename()).toBe(`Herrick Industrial Supply quote ${SAMPLE} rev 1.pdf`);
    expect((await readFile((await file.path())!)).subarray(0, 5).toString()).toBe("%PDF-");
    const headers = await dana.evaluate((url) => fetch(url).then((r) => ({ type: r.headers.get("content-type"), disposition: r.headers.get("content-disposition") })), file.url());
    expect(headers.type).toBe("application/pdf");
    expect(headers.disposition).toContain(`filename="Herrick Industrial Supply quote ${SAMPLE} rev 1.pdf"`);
  });
  await modal.getByRole("button", { name: "Close" }).click();
  await expect(modal).toBeHidden();
});

test("with Attach PDF off the preview shows the PDF but offers no Download", async () => {
  const copy = await brandi.evaluate(() => fetch("/api/rep/quotes/Q-24816/duplicate", { method: "POST" }).then((r) => r.json()));
  await send(copy.quote_number, "", false);
  const card = notice(dana, copy.quote_number);
  await expect(card).toBeVisible();
  // No message typed: the headline and View quote only.
  await expect(card.locator(".qn-text")).toHaveCount(0);
  await card.getByRole("button", { name: "View quote" }).click();
  const modal = preview(dana, copy.quote_number);
  await expect(modal.getByRole("document", { name: `Quote ${copy.quote_number}, revision 1` })).toHaveAttribute("data-state", "ready");
  await expect(modal.getByRole("link", { name: "Download" })).toHaveCount(0);
  await modal.getByRole("button", { name: "Close" }).click();
});

test("an expired quote from the sidebar: its PDF, no way to respond, and why", async () => {
  const quotes = dana.getByRole("complementary", { name: "Quotes" });
  const expired = quotes.getByRole("button").filter({ has: dana.locator(".cx-chip", { hasText: "Expired" }) }).first();
  const number = (await expired.locator(".cx-quote-number").textContent())!;
  await expired.click();
  const modal = preview(dana, number);
  await expect(modal.locator(".cx-chip")).toHaveText("Expired");
  await expect(modal.getByRole("document")).toHaveAttribute("data-state", "ready");
  await expect(modal.getByRole("button", { name: "Accept" })).toBeDisabled();
  await expect(modal.getByRole("group", { name: "Respond to this quote" })).toContainText(/This quote expired: it was valid until .+\. Ask Brandi for a new one\./);
  await modal.getByRole("button", { name: "Close" }).click();
});

test("own quotes only: a tampered quote id is not found, in the preview and the PDF", async () => {
  const statuses = await dana.evaluate(async () => {
    const status = (url: string) => fetch(url).then((r) => r.status);
    return {
      preview: await status("/api/query/customer/quotes/q-99999"),
      pdf: await status("/api/quotes/q-99999/pdf?variant=customer"),
      internal: await status("/api/quotes/q-24817/pdf?variant=internal"),
      unsentRevision: await status("/api/query/customer/quotes/q-24817?rev=2"),
    };
  });
  expect(statuses).toEqual({ preview: 404, pdf: 404, internal: 403, unsentRevision: 404 });
  await dana.evaluate(() => window.dispatchEvent(new CustomEvent("querent:open-quote", { detail: { id: "q-99999", quote_number: "Q-99999" } })));
  const modal = preview(dana, "Q-99999");
  await expect(modal.getByRole("alert")).toContainText("Quote not found.");
  await expect(modal.getByRole("document")).toHaveCount(0);
  await expect(modal.getByRole("link", { name: "Download" })).toHaveCount(0);
  await modal.getByRole("button", { name: "Close" }).click();
});

test("390px: the message fits the chat, and the preview fills the screen with Download at the top right", async ({ browser }, testInfo) => {
  const phone = await newPage(browser, testInfo.project.use.baseURL!, { width: 390, height: 844 });
  await signInAsDana(phone);
  const card = notice(phone, SAMPLE);
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await noSideways(phone);
  const c = (await card.locator(".qn-card").boundingBox())!;
  expect(c.x + c.width).toBeLessThanOrEqual(390);
  await phone.screenshot({ path: testInfo.outputPath("5.1-chat-message-390.png") });

  await card.getByRole("button", { name: "View quote" }).click();
  const modal = preview(phone, SAMPLE);
  const pdf = modal.getByRole("document", { name: `Quote ${SAMPLE}, revision 1` });
  await expect(pdf).toHaveAttribute("data-state", "ready");
  const m = (await modal.boundingBox())!;
  expect(m).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  const download = modal.getByRole("link", { name: "Download" });
  const d = (await download.boundingBox())!;
  expect(d.y).toBeLessThan(60);
  expect(390 - (d.x + d.width)).toBeLessThan(70);
  const close = (await modal.getByRole("button", { name: "Close" }).boundingBox())!;
  expect(close.x).toBeGreaterThanOrEqual(d.x + d.width);
  // The page fits the width; both actions stay on screen.
  const sheet = (await pdf.locator("canvas.qp-sheet").boundingBox())!;
  expect(sheet.x).toBeGreaterThanOrEqual(0);
  expect(sheet.x + sheet.width).toBeLessThanOrEqual(390);
  for (const name of ["Accept", "Request changes"]) {
    const b = (await modal.getByRole("button", { name }).boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(844);
  }
  await noSideways(phone);
  await phone.screenshot({ path: testInfo.outputPath("5.1-modal-390.png") });

  await test.step("Zoom in makes the page wider than the phone; the preview scrolls, the page doesn't", async () => {
    await pdf.getByRole("button", { name: "Zoom in" }).click();
    expect((await pdf.locator("canvas.qp-sheet").boundingBox())!.width).toBeGreaterThan(700);
    await noSideways(phone);
    await pdf.getByRole("button", { name: "Fit to width" }).click();
  });
});
