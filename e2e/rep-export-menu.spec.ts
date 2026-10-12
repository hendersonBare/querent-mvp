import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";

// The quote detail's Export menu (task 4.3; spec §4, §6.7; docs/design/screens/05): Customer
// quote (PDF), Internal worksheet (PDF), Line items (CSV) and Copy quote summary. Each export
// reads the quote as it is on screen: the draft while Brandi can edit it (ready_for_review, or
// changes_requested: then the draft of the next revision), else the latest sent revision.
// Downloads are checked for content type, filename and content; the summary on the clipboard.
//
// Before each test the database is reset to the seed pinned to the mockup's day
// (POST /api/test/reset), and POST /api/test/rep-quotes adds a sent, a changes_requested, an
// expired and another rep's quote. Both hooks exist only with QUERENT_E2E_RESET=1
// (playwright.config.ts sets it).

const SEED_DATE = "2026-09-23";
const SAMPLE = "Q-24817";
/** The seeded sample as the Line items CSV writes it (the 1.1 engine's prices, task 3.3). */
const SAMPLE_CSV_ROWS = [
  "Line,SKU,Description,Qty,Unit,Unit price,Extended",
  '1,HCS-12-13-2G8,"Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc",10,Box of 50,31.50,315.00',
  '2,CW-45-045-T1,"Cut-off wheel 4.5 x .045 x 7/8 in, Type 1",6,Box of 25,36.00,216.00',
  '3,GLV-N8-L-1000,"Nitrile disposable gloves, 8 mil, black, size L",4,"Case of 1,000",79.00,316.00',
  '4,RS-2-27-JH,"Ratchet strap 2 in x 27 ft, 3,333 lb WLL, J-hooks",12,Each,22.95,275.40',
  "",
  ",,Subtotal,,,,1122.40",
  ',,"Freight, will call at SLC",,,,0.00',
  ",,Sales tax,,,,Added on invoice",
  ",,Total before tax,,,,1122.40",
  "",
];
/** Unit costs of the sample's lines, and their line totals: never on the customer quote, the CSV or the summary. */
const SAMPLE_COSTS = ["21.40", "214.00", "24.10", "144.60", "58.00", "232.00", "14.20", "170.40"];
let made: { changes_requested: string; sent: string; overdue: string; other_rep: string };

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ playwright }, testInfo) => {
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const reset = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(reset.status(), "start the server with QUERENT_E2E_RESET=1").toBe(200);
    const fixture = await api.post("/api/test/rep-quotes");
    expect(fixture.status()).toBe(200);
    made = await fixture.json();
  } finally {
    await api.dispose();
  }
});

/** Signs in as Brandi and opens quote `number`. */
async function openQuote(page: Page, number = SAMPLE) {
  await page.goto("/");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
  await showQuote(page, number);
}
/** Opens quote `number` in a page already signed in as Brandi. */
async function showQuote(page: Page, number: string) {
  await page.goto(`/rep/quotes/${number}?customer=wasatch`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");
}
async function openExport(page: Page) {
  await page.getByRole("button", { name: "Export" }).click();
  const menu = page.getByRole("menu", { name: "Export" });
  await expect(menu).toBeVisible();
  return menu;
}
/** Chooses an export and waits for its request and its download; returns the response, the file name and bytes. */
async function download(page: Page, item: RegExp, url: string) {
  const menu = await openExport(page);
  const [response, file] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(url)),
    page.waitForEvent("download"),
    menu.getByRole("menuitem", { name: item }).click(),
  ]);
  const body = await readFile(await file.path());
  await expect(page.getByText(`Exported ${file.suggestedFilename()}`)).toBeVisible();
  return { response, filename: file.suggestedFilename(), body };
}
async function pdfText(body: Buffer) {
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  const pdf = await getDocumentProxy(new Uint8Array(body));
  const { text } = await extractText(pdf, { mergePages: true });
  return text.replace(/\s+/g, " ");
}
/** The CSV's bytes: a UTF-8 BOM, then CRLF rows. */
function csvRows(body: Buffer) {
  expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  return body.subarray(3).toString("utf8").split("\r\n");
}
/** Calls the API from the page, so the (Secure) session cookie goes with it. */
const status = (page: Page, path: string) => page.evaluate(async (p) => (await fetch(p)).status, path);
async function inViewport(page: Page, locator: Locator) {
  const box = (await locator.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
}
async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}
/** Saves a screenshot in the test's output folder and attaches it to the report. */
async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test("screen 05 at 1440px: the four exports with the mockup's hints, Copy set apart", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openQuote(page);
  const menu = await openExport(page);
  const items = menu.getByRole("menuitem");
  await expect(items).toHaveText([
    "Customer quote (PDF)What Dana sees. No cost or margin.",
    "Internal worksheet (PDF)Adds cost, margin, last paid and open checks",
    "Line items (CSV)Opens in Excel or Google Sheets",
    "Copy quote summaryPlain text for an email or text message",
  ]);
  // The divider sits between the files and Copy quote summary.
  await expect(menu.locator("hr")).toHaveCount(1);
  await expect(menu.locator("hr + [role=menuitem]")).toHaveText(/^Copy quote summary/);
  await expect(items.first()).toBeFocused();
  await inViewport(page, menu);
  await noSidewaysScroll(page);
  await screenshot(page, testInfo, "export-menu-1440");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.getByRole("button", { name: "Export" })).toBeFocused();
});

test("Customer quote (PDF) downloads the draft preview Dana would get: no cost or margin", async ({ page }) => {
  await openQuote(page);
  const { response, filename, body } = await download(page, /^Customer quote \(PDF\)/, `/api/quotes/q-24817/pdf?variant=customer&rev=draft`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect(filename).toBe("Herrick Industrial Supply quote Q-24817 rev 1 draft.pdf");
  const text = await pdfText(body);
  for (const field of ["QUOTATION", "Q-24817 · Rev 1", "DRAFT PREVIEW · NOT SENT", "Wasatch Mechanical Contractors", "HCS-12-13-2G8", "Total $1,122.40"]) expect(text).toContain(field);
  for (const cost of SAMPLE_COSTS) expect(text).not.toContain(cost);
  expect(text).not.toMatch(/\bcosts?\b|margin|\bfloors?\b|%/i);
});

test("Internal worksheet (PDF) downloads the same draft with cost and margin, marked confidential", async ({ page }) => {
  await openQuote(page);
  const { response, filename, body } = await download(page, /^Internal worksheet \(PDF\)/, `/api/quotes/q-24817/pdf?variant=internal&rev=draft`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect(filename).toBe("Herrick Industrial Supply quote Q-24817 rev 1 draft - internal worksheet.pdf");
  const text = await pdfText(body);
  for (const field of ["CONFIDENTIAL — INTERNAL", "Q-24817", "Last paid $21.40 32.1% 20%", "Last paid $58.00 26.6% 30%"]) expect(text).toContain(field);
});

test("Line items (CSV) downloads a UTF-8 spreadsheet of the customer quote's lines and totals", async ({ page }) => {
  await openQuote(page);
  const { response, filename, body } = await download(page, /^Line items \(CSV\)/, `/api/rep/quotes/q-24817/lines.csv?rev=draft`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("text/csv; charset=utf-8");
  expect(response.headers()["content-disposition"]).toMatch(/^attachment; filename="Q-24817 rev 1 draft line items\.csv"/);
  expect(filename).toBe("Q-24817 rev 1 draft line items.csv");
  const rows = csvRows(body);
  expect(rows).toEqual(SAMPLE_CSV_ROWS);
  const text = rows.join("\n");
  for (const cost of SAMPLE_COSTS) expect(text).not.toContain(cost);
  expect(text).not.toMatch(/cost|margin|floor|%|basis/i);
});

test("an edit still saving is in the export: the CSV waits for it", async ({ page }) => {
  await openQuote(page);
  // Hold the qty save for a moment before it reaches the server, so the export is chosen while it
  // is still in flight: only a download that waits for the save (ExportMenu's flush) sees qty 12.
  let saved = 0;
  await page.route("**/api/rep/quotes/q-24817/lines/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const response = await route.fetch();
    saved = Date.now(); // the server has the new qty; the page hears so next
    await route.fulfill({ response });
  });
  let requested = 0;
  page.on("request", (r) => {
    if (r.url().includes("/lines.csv")) requested = Date.now();
  });
  const bolts = page.getByRole("textbox", { name: "Quantity for HCS-12-13-2G8" });
  await bolts.fill("12");
  await bolts.press("Enter");
  // Straight to the menu, while the save is held.
  await expect(page.getByText("Saving…")).toBeVisible();
  const { body } = await download(page, /^Line items \(CSV\)/, `/api/rep/quotes/q-24817/lines.csv?rev=draft`);
  expect(saved, "the qty save never finished").toBeGreaterThan(0);
  expect(requested, "the CSV was requested before the save finished").toBeGreaterThanOrEqual(saved);
  expect(csvRows(body)[1]).toMatch(/^1,HCS-12-13-2G8,"Hex cap screw 1\/2-13 x 2 in, Grade 8, yellow zinc",12,Box of 50,/);
});

test("Copy quote summary puts plain text on the clipboard, with no cost or margin, and says so", async ({ page, baseURL }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  await openQuote(page);
  const menu = await openExport(page);
  await menu.getByRole("menuitem", { name: /^Copy quote summary/ }).click();
  await expect(page.getByText("Quote summary copied")).toBeVisible();
  await expect(menu).toBeHidden();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  // The draft runs 14 days from today (UTC), as it would if sent now.
  const now = new Date();
  const validUntil = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 14))
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  expect(copied).toBe(
    [
      "Quote Q-24817 rev 1 (draft, not sent) for Wasatch Mechanical Contractors (Dana Ortiz)",
      `Valid until ${validUntil} · Net 30 · Will call at SLC`,
      "",
      "10 x HCS-12-13-2G8 Hex cap screw 1/2-13 x 2 in (Box of 50) @ $31.50 = $315.00",
      "6 x CW-45-045-T1 Cut-off wheel 4.5 x .045 x 7/8 in (Box of 25) @ $36.00 = $216.00",
      "4 x GLV-N8-L-1000 Nitrile disposable gloves (Case of 1,000) @ $79.00 = $316.00",
      "12 x RS-2-27-JH Ratchet strap 2 in x 27 ft @ $22.95 = $275.40",
      "",
      "Items $1,122.40 · Freight $0.00 · Total $1,122.40 before tax",
    ].join("\n"),
  );
  for (const cost of SAMPLE_COSTS) expect(copied).not.toContain(cost);
  expect(copied).not.toMatch(/cost|margin|floor|%|basis|querent/i);
});

test("a sent quote exports its latest revision; one with changes requested exports the draft of the next", async ({ page }) => {
  await openQuote(page, made.sent);
  const sentPdf = await download(page, /^Customer quote \(PDF\)/, `/pdf?variant=customer&rev=1`);
  expect(sentPdf.filename).toBe(`Herrick Industrial Supply quote ${made.sent} rev 1.pdf`);
  expect(await pdfText(sentPdf.body)).not.toMatch(/draft preview/i);
  const sentCsv = await download(page, /^Line items \(CSV\)/, `/lines.csv?rev=1`);
  expect(sentCsv.filename).toBe(`${made.sent} rev 1 line items.csv`);
  expect(csvRows(sentCsv.body)[0]).toBe("Line,SKU,Description,Qty,Unit,Unit price,Extended");

  // Decision (task 4.3): Dana has rev 1; Brandi is editing the draft of rev 2, and the menu exports what is on screen.
  await showQuote(page, made.changes_requested);
  const revising = await download(page, /^Customer quote \(PDF\)/, `/pdf?variant=customer&rev=draft`);
  expect(revising.filename).toBe(`Herrick Industrial Supply quote ${made.changes_requested} rev 2 draft.pdf`);
  expect(await pdfText(revising.body)).toContain(`${made.changes_requested} · Rev 2`);
});

test("the CSV route is rep-only: visitors 401, customers 403, another rep's quote 404 (the manager reads it)", async ({ page, browser, baseURL, playwright }) => {
  await openQuote(page);
  // Brandi is the manager: she reads any rep's quote (task D2). Another rep (Eli) gets 404.
  expect(await status(page, `/api/rep/quotes/${made.other_rep}/lines.csv?rev=draft`)).toBe(200);
  const eliContext = await browser.newContext({ baseURL });
  try {
    const eli = await eliContext.newPage();
    await eli.goto("/");
    expect(await eli.evaluate(async () => (await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ persona: "eli" }) })).status)).toBe(200);
    expect(await status(eli, `/api/rep/quotes/${made.other_rep}/lines.csv?rev=draft`)).toBe(404);
  } finally {
    await eliContext.close();
  }
  expect(await status(page, `/api/rep/quotes/Q-99999/lines.csv`)).toBe(404);
  expect(await status(page, `/api/rep/quotes/${SAMPLE}/lines.csv?rev=draft`)).toBe(200);

  const visitor = await playwright.request.newContext({ baseURL });
  try {
    expect((await visitor.get(`/api/rep/quotes/${SAMPLE}/lines.csv?rev=draft`)).status()).toBe(401);
  } finally {
    await visitor.dispose();
  }
  const context = await browser.newContext({ baseURL });
  try {
    const dana = await context.newPage();
    await dana.goto("/");
    await dana.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
    await expect(dana.getByLabel("Ask a question")).toBeVisible();
    expect(await status(dana, `/api/rep/quotes/${SAMPLE}/lines.csv?rev=draft`)).toBe(403);
    expect(await status(dana, `/api/rep/quotes/Q-24816/lines.csv`)).toBe(403);
  } finally {
    await context.close();
  }
});
