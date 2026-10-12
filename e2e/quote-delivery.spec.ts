import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

// Quote delivery (task 5.1, spec §3): when Brandi sends a quote, Dana's chat gets "Quote Q-… is
// ready: $X, valid until …" with Brandi's message as plain text and View quote, which opens the
// PDF preview modal: the customer PDF drawn inline, Download at the top right (when Attach PDF was
// on), and the Accept / Request changes bar (task 5.2, e2e/quote-response.spec.ts). The bell's quote
// notifications open the same modal (plan U10, decision 41). Dana only ever sees her own quotes.
//
// Runs on the mockup's seed day through the test-only reset (see golden-quote-flow.spec.ts):
// start your own server with QUERENT_E2E_RESET=1, or let playwright.config.ts start one. Screenshots
// of the chat message and the modal at 1440px, and of the zoomed PDF at 1920px, go to this test's
// output folder.

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
  await page.goto("/demo");
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

/** Dana's bell row for a quote (one per quote: its latest news); the bell polls every 5 s. */
const bellRow = (number: string) => dana.getByRole("dialog", { name: "Notifications" }).locator("[data-read]", { hasText: number });
async function openBell() {
  if (!(await dana.getByRole("dialog", { name: "Notifications" }).isVisible())) await dana.getByRole("button", { name: "Notifications" }).click();
}

const notice = (page: Page, number: string) => page.getByRole("article", { name: new RegExp(`^Quote ${number} is ready: `) });
const preview = (page: Page, number: string) => page.getByRole("dialog", { name: `Quote ${number}` });

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
  // Nothing is in Dana's bell for it yet; the preview (opened as the chat's View quote does) says so too.
  await openBell();
  await expect(bellRow(SAMPLE)).toHaveCount(0);
  await dana.keyboard.press("Escape");
  await dana.evaluate((number) => window.dispatchEvent(new CustomEvent("querent:open-quote", { detail: { id: number, quote_number: number } })), SAMPLE);
  const modal = preview(dana, SAMPLE);
  await expect(modal).toBeVisible();
  await expect(modal.locator(".qp-state")).toHaveText("Awaiting rep");
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
  // The bell follows: ready to review, with the total.
  await openBell();
  await expect(bellRow(SAMPLE)).toContainText(`Quote ${SAMPLE} is ready to review${sentTotal}.`);
  await dana.keyboard.press("Escape");
  await card.scrollIntoViewIfNeeded();
  await dana.screenshot({ path: testInfo.outputPath("5.1-chat-message-1440.png") });
});

test("the message is still there after a reload", async () => {
  await dana.reload();
  await expect(notice(dana, SAMPLE)).toBeVisible();
  await expect(notice(dana, SAMPLE).locator(".qn-text")).toHaveText(MESSAGE);
});

test("View quote opens the preview: the customer PDF inline, Download at the top right, the action bar ready", async ({}, testInfo) => {
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
  await expect(modal.locator(".qp-state")).toHaveText("Sent");
  const download = modal.getByRole("link", { name: "Download" });
  const d = (await download.boundingBox())!;
  const m = (await modal.boundingBox())!;
  // At the right edge, just before the close button (C_CVL5: 32px padding, the 40px close button, a 12px gap).
  expect(m.x + m.width - (d.x + d.width)).toBeLessThan(90);
  expect(d.y - m.y).toBeLessThan(60);
  // Task 5.2 replaced the "reply to Brandi in chat" placeholder with the real actions.
  await expect(modal.getByRole("button", { name: "Accept" })).toBeEnabled();
  await expect(modal.getByRole("button", { name: "Request changes" })).toBeEnabled();
  await expect(modal.getByRole("group", { name: "Respond to this quote" })).toContainText("Accept it with a pickup time and your PO, or ask Brandi for changes.");
  await expect(modal.getByRole("group", { name: "Respond to this quote" })).not.toContainText("reply to Brandi in chat");
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

test("at 1920px, from the bell: Zoom in enlarges the real PDF page and the preview scrolls, not the page; Fit to width puts it back", async ({ browser }, testInfo) => {
  const wide = await newPage(browser, testInfo.project.use.baseURL!, { width: 1920, height: 1080 });
  await signInAsDana(wide);
  await wide.getByRole("button", { name: "Notifications" }).click();
  await wide.getByRole("dialog", { name: "Notifications" }).locator("[data-read]", { hasText: SAMPLE }).click();
  const modal = preview(wide, SAMPLE);
  const pdf = modal.getByRole("document", { name: `Quote ${SAMPLE}, revision 1` });
  await expect(pdf).toHaveAttribute("data-state", "ready");
  const sheet = pdf.locator("canvas.qp-sheet");
  const deskArea = modal.locator(".qp-desk");
  const pageScroll = () => wide.evaluate(() => document.documentElement.scrollWidth);
  const deskScroll = () => deskArea.evaluate((el) => el.scrollWidth - el.clientWidth);
  // Close sits right of Download, at the top right.
  const d = (await modal.getByRole("link", { name: "Download" }).boundingBox())!;
  expect((await modal.getByRole("button", { name: "Close" }).boundingBox())!.x).toBeGreaterThanOrEqual(d.x + d.width);

  // Fit to width: the page fits the preview's desk.
  await expect(pdf.getByRole("button", { name: "Zoom in" })).toHaveAttribute("aria-pressed", "false");
  const fit = (await sheet.boundingBox())!;
  const area = (await deskArea.boundingBox())!;
  expect(fit.x).toBeGreaterThanOrEqual(area.x);
  expect(fit.x + fit.width).toBeLessThanOrEqual(area.x + area.width);
  expect(await deskScroll()).toBeLessThanOrEqual(1);

  await test.step("Zoom in: the page is drawn wider than the desk; the desk scrolls sideways, the page doesn't", async () => {
    await pdf.getByRole("button", { name: "Zoom in" }).click();
    await expect(pdf).toHaveAttribute("data-zoom", "in");
    await expect(pdf.getByRole("button", { name: "Fit to width" })).toHaveAttribute("aria-pressed", "true");
    const zoomed = (await sheet.boundingBox())!;
    expect(zoomed.width).toBeGreaterThan(fit.width * 1.4);
    expect(zoomed.width).toBeGreaterThan(area.width);
    expect(await deskScroll()).toBeGreaterThan(100);
    expect(await pageScroll()).toBe(1920);
    await wide.screenshot({ path: testInfo.outputPath("5.1-modal-zoomed-1920.png") });
  });

  await test.step("Fit to width: back to the desk's width", async () => {
    await pdf.getByRole("button", { name: "Fit to width" }).click();
    await expect(pdf).toHaveAttribute("data-zoom", "fit");
    await expect(pdf.getByRole("button", { name: "Zoom in" })).toHaveAttribute("aria-pressed", "false");
    expect((await sheet.boundingBox())!.width).toBeCloseTo(fit.width, 0);
    expect(await deskScroll()).toBeLessThanOrEqual(1);
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

test("an expired quote from the bell: its PDF, no way to respond, and why", async () => {
  await openBell();
  const expired = dana.getByRole("dialog", { name: "Notifications" }).locator("[data-read]", { hasText: /^Quote Q-\d+ expired/ }).first();
  const number = /Q-\d+/.exec((await expired.textContent())!)![0];
  await expired.click();
  const modal = preview(dana, number);
  await expect(modal.locator(".qp-state")).toHaveText("Expired");
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

