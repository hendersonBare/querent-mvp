import { expect, test, type Page, type TestInfo } from "@playwright/test";

// "Suggested by Querent" on the rep's quote detail (task 3.6; spec §4, §5.5; mockup .sugbox,
// screens 03-04 and 08). On the seeded sample Q-24817 the rules (task 1.6) offer five chips: the
// nut and the washer for the Grade 8 bolts, flap discs bought with the wheels, the wheels bumped
// to a full case, and safety glasses bought with the gloves. Scripted mode, so the wording is the
// deterministic template. Taking a chip is an autosaved edit: the totals and "Querent found"
// follow, the chip goes, and Undo brings both back.
//
// Before each test the database is reset to the seed pinned to the mockup's day
// (POST /api/test/reset), and POST /api/test/rep-quotes adds a sent, a changes_requested and an
// expired quote. Both hooks exist only with QUERENT_E2E_RESET=1 (playwright.config.ts sets it).

const SEED_DATE = "2026-09-23";
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

async function openQuote(page: Page, number = "Q-24817") {
  await page.goto("/");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
  await page.goto(`/rep/quotes/${number}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");
}
const suggested = (page: Page) => page.getByRole("group", { name: "Suggested by Querent" });
const header = (page: Page) => suggested(page).locator("summary");
const chips = (page: Page) => suggested(page).getByRole("listitem");
const items = (page: Page) => page.getByLabel("Quote totals");
const saved = (page: Page) => expect(page.getByText("All changes saved")).toBeVisible();
const qty = (page: Page, sku: string) => page.getByRole("textbox", { name: `Quantity for ${sku}` });
async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}
async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const body = await page.screenshot({ fullPage: true, path: testInfo.outputPath(`${name}.png`) });
  await testInfo.attach(name, { body, contentType: "image/png" });
}
/** Calls the API from the page, so the (Secure) session cookie goes with it. */
const api = (page: Page, path: string, method = "GET", body?: unknown) =>
  page.evaluate(
    async ([p, m, b]) => {
      const response = await fetch(p, { method: m, headers: { "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    [path, method, body] as const,
  );

/** Taking the nut as GET shows it on the sample: its id and the fingerprint it was shown with. */
const NUT = { upsellId: "matching_fastener:HN-12-13-G8", fingerprint: "matching_fastener:HN-12-13-G8|add 5|18.15" };

const FIVE = [
  "Hex nut 1/2-13, Grade 8, yellow zinc (box of 100)",
  "Flap disc 4.5 in, 60 grit zirconia (box of 10)",
  "Flat washer 1/2 in, Grade 8, yellow zinc (box of 100)",
  "Bump cut-off wheels to 8 boxes (2 full cases)",
  "Safety glasses, clear anti-fog (box of 12)",
];

test("Q-24817 at 1440px: the five chips from 1.6; take the nut and the wheels bump, then Undo both", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1057 });
  await openQuote(page);

  // Collapsed, as in screen 03: "Querent found" and the ideas.
  await expect(header(page)).toContainText("Querent found +$11.50 GP");
  await expect(header(page)).toContainText("5 ideas · up to +$162.95 gross profit");
  await expect(chips(page).first()).toBeHidden();
  await noSidewaysScroll(page);
  await screenshot(page, testInfo, "upsells-1440-collapsed");

  await header(page).click();
  await expect(chips(page)).toHaveCount(5);
  for (const [i, title] of FIVE.entries()) await expect(chips(page).nth(i)).toContainText(title);
  await expect(chips(page).nth(0)).toContainText("Matches the 1/2-13 Grade 8 bolts: 5 boxes of 100 cover all 500.");
  await expect(chips(page).nth(0)).toContainText("HN-12-13-G8 · 5 at $18.15 · 46.0% margin · +$41.75 GP");
  await expect(chips(page).nth(3)).toContainText("CW-45-045-T1 · 6 → 8 at $36.00 · 33.1% margin · +$23.80 GP");
  await suggested(page).scrollIntoViewIfNeeded();
  await screenshot(page, testInfo, "upsells-1440-open");

  // Take the nut: a new line, suggested by Querent; the totals and "Querent found" follow; the chip goes.
  await suggested(page).getByRole("button", { name: /^Add: Hex nut 1\/2-13/ }).click();
  const nut = page.getByRole("rowheader", { name: /HN-12-13-G8/ });
  await expect(nut).toContainText("Suggested");
  await expect(qty(page, "HN-12-13-G8")).toHaveValue("5");
  await expect(items(page)).toContainText("Items$1,213.15");
  await expect(header(page)).toContainText("Querent found +$19.75 GP");
  await expect(suggested(page).getByRole("button", { name: /^Add: Hex nut/ })).toHaveCount(0);
  await saved(page);
  // 5 boxes of nuts is a broken case (10 to a case), priced at customer + 10%: the full-case rule now offers the rest.
  await expect(header(page)).toContainText("5 ideas · up to +$146.45 gross profit");
  await expect(chips(page).nth(2)).toContainText("Bump hex nuts to 10 boxes (1 full case)");

  // Apply the wheels bump: the qty moves at once, on its contract price.
  await suggested(page).getByRole("button", { name: /^Apply: Bump cut-off wheels/ }).click();
  await expect(qty(page, "CW-45-045-T1")).toHaveValue("8");
  await expect(items(page)).toContainText("Items$1,285.15");
  await saved(page);
  await expect(header(page)).toContainText("4 ideas · up to +$122.65 gross profit");
  await expect(header(page)).toContainText("Querent found +$19.75 GP");
  await screenshot(page, testInfo, "upsells-1440-taken");

  // Both are saved.
  const detail = await api(page, "/api/rep/quotes/Q-24817");
  expect(detail.body.lines.map((l: { sku: string; qty: number; added_by: string }) => [l.sku, l.qty, l.added_by])).toEqual([
    ["HCS-12-13-2G8", 10, "querent"], ["CW-45-045-T1", 8, "querent"], ["GLV-N8-L-1000", 4, "querent"], ["RS-2-27-JH", 12, "querent"], ["HN-12-13-G8", 5, "upsell"],
  ]);

  // Undo the bump, then the nut: the lines, the totals, "Querent found" and the five chips come back.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(qty(page, "CW-45-045-T1")).toHaveValue("6");
  await saved(page);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(nut).toHaveCount(0);
  await expect(items(page)).toContainText("Items$1,122.40");
  await expect(header(page)).toContainText("Querent found +$11.50 GP");
  await expect(header(page)).toContainText("5 ideas · up to +$162.95 gross profit");
  await expect(chips(page)).toHaveCount(5);
  await page.reload();
  await expect(items(page)).toContainText("Items$1,122.40");
  await expect(header(page)).toContainText("5 ideas · up to +$162.95 gross profit");
});

test("a chip that changed in another tab is refused with a note, and the chips and lines refresh (no stale apply)", async ({ page }) => {
  await openQuote(page);
  await header(page).click();
  await expect(chips(page).first()).toContainText("HN-12-13-G8 · 5 at $18.15");
  // Another tab takes the bolts to 20 boxes: the nut chip now means 10 boxes at $16.50 (a full case at customer price).
  expect((await api(page, "/api/rep/quotes/Q-24817/lines/q-24817-1", "PATCH", { qty: 20 })).status).toBe(200);
  await suggested(page).getByRole("button", { name: /^Add: Hex nut 1\/2-13/ }).click();
  await expect(suggested(page).getByRole("alert")).toContainText("That suggestion changed since it was shown. Check the updated suggestions and try again.");
  await expect(page.getByRole("rowheader", { name: /HN-12-13-G8/ })).toHaveCount(0);
  await expect(qty(page, "HCS-12-13-2G8")).toHaveValue("20");
  await expect(chips(page).first()).toContainText("HN-12-13-G8 · 10 at $16.50");
  expect((await api(page, "/api/rep/quotes/Q-24817")).body.lines).toHaveLength(4);
  // Taken as it reads now, it applies as it reads.
  await suggested(page).getByRole("button", { name: /^Add: Hex nut 1\/2-13/ }).click();
  await expect(suggested(page).getByRole("alert")).toHaveCount(0);
  await expect(qty(page, "HN-12-13-G8")).toHaveValue("10");
  await saved(page);
});

test("sent, accepted and expired quotes offer no chips, and the API refuses to take one (409)", async ({ page }) => {
  await openQuote(page, made.sent);
  const box = page.getByRole("region", { name: "Suggested by Querent" });
  await expect(box).toContainText("Offered while the quote can be edited");
  await expect(box).toContainText(/Querent found \+\$[\d,.]+ GP/);
  await expect(box.getByRole("button")).toHaveCount(0);
  for (const number of [made.sent, made.overdue, "Q-24816"]) {
    expect(await api(page, `/api/rep/quotes/${number}/upsells`)).toMatchObject({ status: 200, body: { editable: false, upsells: [] } });
    expect((await api(page, `/api/rep/quotes/${number}/upsells`, "POST", NUT)).status).toBe(409);
  }
  // changes_requested is editable, so it gets chips.
  const revising = await api(page, `/api/rep/quotes/${made.changes_requested}/upsells`);
  expect(revising.body.editable).toBe(true);
});

test("rep-only: 401 without a session, 403 for Dana, 404 for another rep's quote", async ({ page, browser, baseURL, playwright }) => {
  await openQuote(page);
  expect((await api(page, `/api/rep/quotes/${made.other_rep}/upsells`)).status).toBe(404);
  expect((await api(page, `/api/rep/quotes/${made.other_rep}/upsells`, "POST", NUT)).status).toBe(404);
  expect((await api(page, "/api/rep/quotes/Q-24817/upsells", "POST", { upsellId: "" })).status).toBe(400);
  expect((await api(page, "/api/rep/quotes/Q-24817/upsells", "POST", { upsellId: NUT.upsellId })).status).toBe(400);
  expect((await api(page, "/api/rep/quotes/Q-24817/upsells", "POST", { ...NUT, qty: 50 })).status).toBe(400);

  const anonymous = await playwright.request.newContext({ baseURL });
  try {
    expect((await anonymous.get("/api/rep/quotes/Q-24817/upsells")).status()).toBe(401);
    expect((await anonymous.post("/api/rep/quotes/Q-24817/upsells", { data: { upsellId: "matching_fastener:HN-12-13-G8" } })).status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }
  const context = await browser.newContext({ baseURL });
  try {
    const dana = await context.newPage();
    await dana.goto("/");
    await dana.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
    await expect(dana.getByLabel("Ask a question")).toBeVisible();
    expect((await api(dana, "/api/rep/quotes/Q-24817/upsells")).status).toBe(403);
    expect((await api(dana, "/api/rep/quotes/Q-24817/upsells", "POST", NUT)).status).toBe(403);
  } finally {
    await context.close();
  }
  expect((await api(page, "/api/rep/quotes/Q-24817")).body.lines).toHaveLength(4);
});
