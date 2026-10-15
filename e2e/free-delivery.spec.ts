import { expect, test, type APIRequest, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";

// Free delivery pricing (v3 spec §4.3, §4.6, §4.7, §6 Settings; decisions 28–36, 48; tasks C3, U8):
//   - Runs with the three feature flags on (FEATURE_FREE_DELIVERY_PRICING, FEATURE_RECOVERY_POOL,
//     FEATURE_DELIVERY_COST_MODEL; playwright.config.ts sets them for the server it starts): with a flag off its
//     section does not render and its writes are refused (e2e/frames-settings.spec.ts, the route tests).
//   - Mara (a rep) has no Pricing and delivery tab and no free delivery pricing sections, and their routes answer 403.
//   - Dana asks for a delivery over the $1,500 free-delivery threshold.
//   - Brandi (the manager) opens Settings > Pricing and delivery: the toggle is locked until she views
//     the impact preview (quotes affected, the change per category); she turns it on and sees the
//     ramp (step 1 of 3) and the pool panel (the computed pool rate next to the starting rate, eligible
//     quotes, cap, 90-day cost).
//   - Dana's draft reprices on Brandi's next open: the "Freight recovery 0.5%" chip in the quote header
//     (decision 64) and the line's "Freight recovery +$… (rate 0.5%, …)" in Line details, "Why this
//     price?". Brandi sends it; Dana's PDF says Freight $0.00
//     and nothing about recovery, and her quote API carries no recovery field.
// Mara's session is the demo cookie set directly, as in rep-roles.spec.ts.
//
// beforeAll/afterAll reset the database to the seed pinned to the mockup's day (POST /api/test/reset;
// the server needs QUERENT_E2E_RESET=1, which playwright.config.ts sets for the server it starts).
// No fuel price API is called: the server runs without OILPRICEAPI_KEY and uses the seeded UT price.
// The seed's 22 eligible pilot quotes (task F1, src/server/db/seed/demo.ts) put the computed pool rate
// in force: 1.6% (157 bp) instead of the 3.0% starting rate, so step 1 of 3 is 0.5% (52 bp).

const SEED_DATE = "2026-09-23";
const COOKIE = "querent-persona";
const REQUEST = "Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels. We'll pick up at SLC.";
const RECOVERY = /recover|freight_rate|ramp|modelled|pool/i;

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

async function newPage(browser: Browser, testInfo: TestInfo, cookie?: string) {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 1440, height: 1000 } });
  contexts.push(context);
  if (cookie) await context.addCookies([{ name: COOKIE, value: cookie, url: String(testInfo.project.use.baseURL) }]);
  return context.newPage();
}

async function ask(page: Page, text: string) {
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

const card = (page: Page, name: string) => page.getByRole("region", { name });
const toggle = (page: Page) => page.getByRole("switch", { name: "Free delivery pricing" });

test.beforeAll(async ({ browser, playwright }, testInfo) => {
  await resetDemo(playwright.request, testInfo);
  brandi = await newPage(browser, testInfo);
  await brandi.goto("/demo");
  await brandi.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(brandi).toHaveURL(/\/rep\/quotes$/);
  dana = await newPage(browser, testInfo);
  await dana.goto("/demo");
  await dana.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
  await expect(dana.getByLabel("Ask a question")).toBeVisible();
});

test.afterAll(async ({ playwright }, testInfo) => {
  await Promise.all(contexts.map((context) => context.close()));
  await resetDemo(playwright.request, testInfo);
});

test("Mara (a rep) sees no free delivery pricing sections, and their routes refuse her", async ({ browser }, testInfo) => {
  const mara = await newPage(browser, testInfo, "mara");
  await mara.goto("/rep/settings?tab=pricing");
  // A rep's Settings tabs are Margins, Profile and Notifications (plan U9, Appendix B): no Pricing and delivery.
  await expect(mara.getByRole("heading", { name: "Your margins" })).toBeVisible();
  for (const name of ["Delivery rates", "Free delivery pricing", "Recovery pool", "Delivery cost model"]) await expect(mara.getByRole("heading", { name })).toHaveCount(0);
  expect((await mara.request.get("/api/rep/settings/freight")).status()).toBe(403);
  expect((await mara.request.put("/api/rep/settings/freight", { data: { enabled: true } })).status()).toBe(403);
  expect((await mara.request.get("/api/rep/settings/freight/preview")).status()).toBe(403);
  expect((await mara.request.put("/api/rep/settings/delivery", { data: { base_fee: 1 } })).status()).toBe(403);
  await screenshot(mara, testInfo, "mara-settings");
});

test("Dana asks for a delivery over the free-delivery threshold", async () => {
  await expect(await ask(dana, REQUEST)).toContainText("Type 1 or Type 27 cut-off wheels?");
  await expect(await ask(dana, "Type 1")).toContainText("Here is your list");
  const popup = dana.getByRole("dialog", { name: "Review your list" });
  await expect(popup).toBeVisible();
  await popup.getByLabel("Qty for HCS-12-13-2G8").fill("60");
  await popup.getByRole("radio", { name: "Delivery" }).check();
  await popup.getByRole("button", { name: "Request quote" }).click();
  await expect(popup).toBeHidden();
  const answer = dana.locator(".answer-bubble").last();
  await expect(answer).toContainText("Sent to Brandi for review.");
  quoteNumber = (await answer.textContent())!.match(/Q-\d+/)![0];
});

test("Brandi views the impact preview, turns free delivery pricing on, and sees the ramp and the pool", async ({}, testInfo) => {
  const flags = (await brandi.evaluate(() => fetch("/api/rep/settings").then((r) => r.json()))).manager.flags;
  expect(flags, "this spec runs with the three feature flags on (playwright.config.ts sets them for the server it starts)").toEqual({ freeDeliveryPricing: true, recoveryPool: true, deliveryCostModel: true });
  await brandi.goto("/rep/settings?tab=pricing");
  const free = card(brandi, "Free delivery pricing");
  await expect(free.getByRole("heading", { name: "Free delivery pricing" })).toBeVisible();
  // Locked until the preview is viewed.
  await expect(toggle(brandi)).toBeDisabled();
  await expect(toggle(brandi)).toHaveAttribute("aria-checked", "false");
  await expect(free).toContainText("View the impact preview before turning it on.");
  // The Pricing and Delivery rates cards stay above them.
  await expect(brandi.getByRole("heading", { name: "Delivery rates" })).toBeVisible();
  // The pool panel and the fuel price before enabling: the starting rate, and the seeded UT price.
  const pool = card(brandi, "Recovery pool");
  await expect(pool).toContainText("Pool rate 1.6% from 22 eligible quotes (starting rate 3.0%)");
  await expect(pool).toContainText("Rate cap8.0%");
  await expect(pool).toContainText("Rate in forceOff");
  await expect(card(brandi, "Delivery cost model")).toContainText("UT gasoline$3.40/gal, seeded price");
  await expect(brandi.getByRole("textbox", { name: "Vehicle MPG" })).toHaveValue("10");
  await screenshot(brandi, testInfo, "pricing-delivery-locked");

  await free.getByRole("button", { name: "View impact preview" }).click();
  // The preview opens over the page (plan U8, C_S7): per category, the delivery quotes it touches and the
  // average line price change in dollars at step 1 and at the full rate.
  const preview = brandi.getByRole("dialog", { name: "Impact preview" });
  const table = preview.getByRole("table", { name: "Average change per line price" });
  await expect(table).toBeVisible();
  await expect(preview).toContainText(/Based on the last [1-9]\d* delivery quotes\./);
  await expect(table.getByRole("row").first()).toHaveText(":: Category:: Quotes affected:: Step 1 (0.5%):: Full rate (1.6%)");
  await expect(table.getByRole("row").filter({ hasText: "Fasteners" })).toHaveText(/Fasteners[1-9]\d* of \d+\+\$\d+\.\d\d\+\$\d+\.\d\d/);
  await screenshot(brandi, testInfo, "impact-preview");
  await preview.getByRole("button", { name: "Close" }).click();
  await expect(preview).toHaveCount(0);

  await expect(toggle(brandi)).toBeEnabled();
  await toggle(brandi).click();
  await expect(toggle(brandi)).toHaveAttribute("aria-checked", "true");
  await expect(free).toContainText(/On since/);
  const ramp = free.getByRole("table", { name: "Ramp-in schedule" });
  await expect(ramp.getByRole("row")).toHaveCount(4);
  await expect(ramp.getByRole("row").nth(1)).toContainText("Step 1 of 3");
  await expect(ramp.getByRole("row").nth(1)).toContainText("NOW");
  await expect(ramp.getByRole("row").nth(1)).toContainText("0.5%");
  await expect(ramp.getByRole("row").nth(3)).toContainText("1.6%");
  await expect(pool).toContainText("Rate in force0.5%, ramp step 1 of 3");
  await expect(pool).toContainText(/eligible quotes/);
  await expect(pool).toContainText(/Modelled delivery cost, last 90 days\$[\d,]+\.\d\d/);
  await expect(pool).toContainText(/Recovered in prices, last 90 days\$[\d,]+\.\d\d/);
  await screenshot(brandi, testInfo, "pricing-delivery-on");

  // It stays on after a reload.
  await brandi.reload();
  await expect(toggle(brandi)).toHaveAttribute("aria-checked", "true");

});

test("the delivery draft reprices on Brandi's open: the recovery chip and the line's recovery in Line details", async ({}, testInfo) => {
  await brandi.goto(`/rep/quotes/${quoteNumber}`);
  // Decision 64 (decision 36): the header keeps the quote's frozen rate as a small chip beside the facts;
  // the rate and ramp step also show with each line's recovery in Line details (C_QE9, Why this price?).
  await expect(brandi.getByRole("group", { name: "Quote facts" }).getByText("Freight recovery 0.5%", { exact: true })).toBeVisible();
  await brandi.getByRole("button", { name: "Line details for Hex cap screw 1/2-13 x 2 in" }).click();
  const details = brandi.getByRole("region", { name: "Line details for Hex cap screw 1/2-13 x 2 in" });
  await expect(details.getByText(/^Freight recovery \+\$\d+\.\d\d \(rate 0\.5%, ramp step 1 of 3\)$/)).toBeVisible();
  await screenshot(brandi, testInfo, "quote-recovery");
});

test("the customer sees only the final unit price and Freight $0.00: nothing about recovery", async ({}, testInfo) => {
  const result = await brandi.evaluate(async (number) => {
    const detail = await fetch(`/api/rep/quotes/${number}`).then((r) => r.json());
    const { total, revision } = detail.send_check;
    const response = await fetch(`/api/rep/quotes/${number}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: `Hi Dana, here is ${number}. Thanks, Brandi`, attach_pdf: true, revision, total }),
    });
    return { status: response.status };
  }, quoteNumber);
  expect(result.status).toBe(200);
  // Quote ids follow their numbers (q-24818 for Q-24818).
  const id = `q-${quoteNumber.slice(2)}`;

  const card = dana.getByRole("article", { name: new RegExp(`^Quote ${quoteNumber} is ready: `) });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "View quote" }).click();
  const modal = dana.getByRole("dialog", { name: `Quote ${quoteNumber}` });
  await expect(modal.getByRole("document", { name: `Quote ${quoteNumber}, revision 1` })).toHaveAttribute("data-state", "ready");
  await expect(modal).not.toContainText(RECOVERY);
  await screenshot(dana, testInfo, "customer-preview");

  const { status, pdf, json } = await dana.evaluate(async (id) => {
    const pdfResponse = await fetch(`/api/quotes/${id}/pdf?variant=customer`);
    const json = await fetch(`/api/query/customer/quotes/${id}`).then((r) => r.text());
    return { status: pdfResponse.status, pdf: Array.from(new Uint8Array(await pdfResponse.arrayBuffer())), json };
  }, id);
  expect(status).toBe(200);
  expect(json).toContain(quoteNumber);
  const document = await getDocumentProxy(new Uint8Array(pdf));
  const text = (await extractText(document, { mergePages: true })).text.replace(/\s+/g, " ");
  expect(text).toMatch(/Freight [^$]*\$0\.00/);
  expect(text).not.toMatch(RECOVERY);
  expect(json).not.toMatch(RECOVERY);
});
