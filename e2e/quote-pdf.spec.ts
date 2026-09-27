import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";

// Customer quote PDF (task 4.1, spec §6.7): GET /api/quotes/:id/pdf?variant=customer&rev=n on the
// production server (next build + next start, where @react-pdf/renderer is a server external).
// Dana gets only quotes Brandi sent; Brandi can also preview the unsent draft (rev=draft).
//
// Requests are made from signed-in browser pages, as the PDF preview modal (5.1) will: the session
// cookie is Secure under next start, and the browser treats 127.0.0.1 as a secure origin.
//
// Runs on the mockup's seed day through the test-only reset (see golden-quote-flow.spec.ts):
// start your own server with QUERENT_E2E_RESET=1, or let playwright.config.ts start one.

const SEED_DATE = "2026-09-23";
const contexts: BrowserContext[] = [];
let dana: Page;
let brandi: Page;
let nobody: Page;

async function signIn(browser: Browser, baseURL: string, persona?: "customer" | "supplier") {
  const context = await browser.newContext({ baseURL });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto("/");
  if (persona) {
    const status = await page.evaluate(async (id) => (await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ persona: id }) })).status, persona);
    expect(status).toBe(200);
  }
  return page;
}

/** GET from inside the page, with its cookies, as the browser would load the PDF. */
async function get(page: Page, url: string) {
  const response = await page.evaluate(async (u) => {
    const r = await fetch(u);
    return { status: r.status, headers: Object.fromEntries(r.headers.entries()), body: Array.from(new Uint8Array(await r.arrayBuffer())) };
  }, url);
  const body = Buffer.from(response.body);
  return { ...response, body, json: () => JSON.parse(body.toString()) };
}

async function pdfText(body: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(body));
  const { text } = await extractText(pdf, { mergePages: true });
  return text.replace(/\s+/g, " ");
}

test.beforeAll(async ({ browser, playwright }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL!;
  const api = await playwright.request.newContext({ baseURL });
  try {
    const response = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(response.status(), "POST /api/test/reset failed: start the server with QUERENT_E2E_RESET=1").toBe(200);
  } finally {
    await api.dispose();
  }
  dana = await signIn(browser, baseURL, "customer");
  brandi = await signIn(browser, baseURL, "supplier");
  nobody = await signIn(browser, baseURL);
});

test.afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
});

test("Dana gets the PDF of a quote Brandi sent: formal fields, freight with miles, no cost or margin", async () => {
  const response = await get(dana, "/api/quotes/Q-24816/pdf?variant=customer");
  expect(response.status).toBe(200);
  expect(response.headers["content-type"]).toBe("application/pdf");
  expect(response.headers["content-disposition"]).toContain('inline; filename="Herrick Industrial Supply quote Q-24816 rev 1.pdf"');
  expect(response.body.subarray(0, 5).toString()).toBe("%PDF-");
  const text = await pdfText(response.body);
  for (const field of [
    "Herrick Industrial Supply", "Salt Lake City branch", "Phone (801) 555-0120", "QUOTATION", "Q-24816 · Rev 1",
    "Wasatch Mechanical Contractors", "Account WAS-1142", "Customer PO", "Valid until", "Terms Net 30",
    "CW-45-045-T1", "Freight Delivery from SLC, 15.0 mi $62.50", "Sales tax Added on invoice", "Total $655.25",
    "Brandi Gallegos", "(801) 111-2222", "via Querent",
  ]) expect(text).toContain(field);
  expect(text).toMatch(/sample data/i);
  expect(text).not.toMatch(/\bcosts?\b|margin|\bfloors?\b|\bGP\b|%|why this price|suggest/i);
});

test("Dana can't get an unsent quote, a draft, or anything that isn't hers; no session gets 401", async () => {
  for (const url of [
    "/api/quotes/Q-24817/pdf?variant=customer",
    "/api/quotes/Q-24817/pdf?variant=customer&rev=draft",
    "/api/quotes/Q-24817/pdf?rev=1",
    "/api/quotes/Q-24816/pdf?rev=2",
    "/api/quotes/q-nope/pdf",
  ]) {
    const response = await get(dana, url);
    expect(response.status, url).toBe(404);
    expect(response.json()).toEqual({ detail: "Quote not found." });
  }
  expect((await get(nobody, "/api/quotes/Q-24816/pdf")).status).toBe(401);
});

test("Brandi previews the unsent Q-24817 draft with rev=draft; without rev there is nothing sent yet", async () => {
  const draft = await get(brandi, "/api/quotes/Q-24817/pdf?variant=customer&rev=draft");
  expect(draft.status).toBe(200);
  const text = await pdfText(draft.body);
  expect(text).toMatch(/draft preview · not sent/i);
  expect(text).toContain("Q-24817 · Rev 1");
  expect(text).toContain("Total $1,122.40");
  expect(text).not.toMatch(/\bcosts?\b|margin|\bGP\b|%|last paid/i);
  expect((await get(brandi, "/api/quotes/Q-24817/pdf")).status).toBe(404);
});
