import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

// The quote detail's side panels (task 3.4; spec §4, §5.3, §5.4; docs/design/screens/03, 04, 08):
// Customer with the credit bar, Pickup or delivery with distance freight and the override with
// its required reason, Quote terms, Internal notes and Activity. Every edit autosaves through the
// rep API, is logged in Activity, and keeps the totals and "things to check" in step; sent,
// accepted and expired quotes are read-only (409 from the API).
//
// Before each test the database is reset to the seed pinned to the mockup's day
// (POST /api/test/reset), and POST /api/test/rep-quotes adds a sent, a changes_requested and an
// expired quote. Both hooks exist only with QUERENT_E2E_RESET=1 (playwright.config.ts sets it).
// Wasatch: $18,420.00 open on a $50,000.00 limit. The sample Q-24817 totals $1,122.40.

const SEED_DATE = "2026-09-23";
const SAMPLE = "Q-24817";
const SHIP_TO = "1800 W 10950 S, South Jordan, UT 84095";
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

async function openQuote(page: Page, number = SAMPLE) {
  await page.goto("/");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
  await page.goto(`/rep/quotes/${number}?customer=wasatch`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");
}
const rail = (page: Page) => page.getByRole("complementary", { name: "Quote summary" });
const panel = (page: Page, name: string) => rail(page).getByRole("group", { name, exact: true });
const summaryOf = (page: Page, name: string) => panel(page, name).locator("summary");
/** Opens the panel (they start closed, as in screen 03) and returns it. */
async function open(page: Page, name: string) {
  const details = panel(page, name);
  if (!(await details.evaluate((el) => (el as HTMLDetailsElement).open))) await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
  return details;
}
const creditLine = (customer: Locator) => customer.getByTestId("credit-bar").locator("p").first();
const totals = (page: Page) => page.getByLabel("Quote totals");
const saved = (page: Page) => expect(page.getByText("All changes saved")).toBeVisible();
const chooseMode = (box: Locator, label: "Will call" | "Delivery") => box.getByRole("radiogroup", { name: "Pickup or delivery" }).getByText(label, { exact: true }).click();
async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}
async function attachScreenshot(page: Page, testInfo: TestInfo, name: string, target?: Locator) {
  await testInfo.attach(name, { body: await (target ?? page).screenshot(target ? {} : { fullPage: true }), contentType: "image/png" });
}
/** Calls the API from the page, so the (Secure) session cookie goes with it. */
const DAY_MS = 86_400_000;
/** YYYY-MM-DD `days` after `day`. */
const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
/** "Oct 29" (the header and panel summary), with the year when it isn't `today`'s. */
const shortDay = (day: string, today: string) =>
  new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }), timeZone: "UTC" });
/** "Oct 29, 2026" (Activity). */
const longDay = (day: string) => new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
/** Picks the expiration date `days` from the server's today (the picker's min is tomorrow). Returns it and today. */
async function pickExpiration(terms: Locator, days: number) {
  const picker = terms.getByLabel("Valid until");
  const today = addDays((await picker.getAttribute("min"))!, -1);
  const day = addDays(today, days);
  await picker.fill(day);
  return { day, today };
}

const api = (page: Page, path: string, method = "GET", body?: unknown) =>
  page.evaluate(
    async ([p, m, b]) => {
      const response = await fetch(p, { method: m, headers: { "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    [path, method, body] as const,
  );

test("1440px (screen 03): five closed panels under the summary card, then each opened", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1057 });
  await openQuote(page);
  const summaries = rail(page).locator("details > summary");
  await expect(summaries).toHaveText([
    /^Customer\s*Net 30 · 39% of credit$/,
    /^Pickup or delivery\s*Will call · SLC · Thu Sep 24$/,
    /^Quote terms\s*Valid until [A-Z][a-z]{2} \d{1,2}$/,
    /^Internal notes\s*None$/,
    /^Activity\s*3 events$/,
  ]);
  // The panels sit in the rail, beside the items and under the summary card.
  const card = (await page.getByRole("region", { name: "Quote summary" }).boundingBox())!;
  const first = (await panel(page, "Customer").boundingBox())!;
  const items = (await page.getByRole("heading", { name: /Items/ }).boundingBox())!;
  expect(first.y).toBeGreaterThan(card.y + card.height);
  expect(first.x).toBeGreaterThan(items.x + 600);
  await attachScreenshot(page, testInfo, "panels-1440-closed");

  const customer = await open(page, "Customer");
  await expect(customer).toContainText("Dana Ortiz");
  await expect(customer).toContainText("Purchasing · (801) 555-0142");
  await expect(customer.getByRole("button", { name: "Copy Dana Ortiz’s phone number" })).toBeVisible();
  await expect(customer.locator("dt")).toHaveText(["Account", "Terms", "Open balance", "Credit limit", "Last order", "Wins on quotes", "Tax status"]);
  // Wins on quotes counts the quotes requested in the 12 months before today. The seed is pinned to
  // Sep 23, 2026 but the server runs on today's clock, so the oldest seeded quotes leave that window
  // as days pass (17 of 25 on the seed day, with the fixture's overdue quote as lost; 16 of 24 once
  // Q-24793 of Sep 28, 2025 drops out). Read the counts the server used, and check the panel shows them.
  const { won, lost } = (await api(page, `/api/rep/quotes/${SAMPLE}`)).body.panels.customer.win_rate;
  expect(won + lost).toBeGreaterThan(0);
  await expect(customer.locator("dd")).toHaveText(["WAS-1142", "Net 30 · nothing past due", "$18,420.00", "$50,000.00", "Sep 9 · SO-51223", `${Math.round((won / (won + lost)) * 100)}% over 12 months`, "Taxable, UT"]);
  await expect(creditLine(customer)).toHaveText("Credit used, with this quote: 39%");
  const bar = customer.getByTestId("credit-bar");
  await expect(bar.locator('[data-segment="open"]')).toHaveAttribute("style", /width:\s*36\.84%/);
  await expect(bar.locator('[data-segment="quote"]')).toHaveAttribute("style", /width:\s*2\.24%/);
  await expect(bar.locator('[data-segment="over"]')).toHaveCount(0);

  const fulfillment = await open(page, "Pickup or delivery");
  await expect(fulfillment.getByRole("radio", { name: "Will call" })).toBeChecked();
  await expect(fulfillment.getByRole("combobox", { name: "Branch" })).toHaveValue("slc");
  await expect(fulfillment.getByRole("region", { name: "Freight" })).toContainText("Will call at SLC: no freight.");

  const terms = await open(page, "Quote terms");
  const picker = terms.getByLabel("Valid until");
  await expect(picker).toHaveAttribute("type", "date");
  const tomorrow = (await picker.getAttribute("min"))!;
  // By default a draft runs 14 days from the day it's sent; any day from tomorrow to a year out.
  await expect(picker).toHaveValue(addDays(tomorrow, 13));
  await expect(picker).toHaveAttribute("max", addDays(tomorrow, 364));
  await expect(terms).toContainText("Default: 14 days after it’s sent.");
  await expect(terms.getByRole("textbox", { name: "Customer PO number" })).toHaveValue("");

  const notes = await open(page, "Internal notes");
  await expect(notes).toContainText("Only your team sees these");
  const activity = await open(page, "Activity");
  await expect(activity.getByRole("listitem")).toHaveText([
    /Draft quote built and sent to Brandi for review$/,
    /Querent matched 4 items after 1 clarifying question$/,
    /Dana asked for bolts, cut-off wheels, gloves and straps in Querent chat$/,
  ]);
  await noSidewaysScroll(page);
  await attachScreenshot(page, testInfo, "panels-1440-open");
  await attachScreenshot(page, testInfo, "panels-1440-rail", rail(page));
});

test("pickup or delivery: delivery prices freight by distance; an override needs a reason, drives the totals, and is logged", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1057 });
  await openQuote(page);
  const box = await open(page, "Pickup or delivery");
  await chooseMode(box, "Delivery");
  await saved(page);
  const freight = box.getByRole("region", { name: "Freight" });
  await expect(freight).toContainText("$62.50");
  await expect(freight).toContainText("15.0 road mi from SLC");
  await expect(freight).toContainText("$25.00 + $2.50/mi × 15.0 mi = $62.50");
  await expect(box).toContainText(`Ship to ${SHIP_TO}`);
  await expect(totals(page)).toContainText("Freight (15.0 mi)$62.50");
  await expect(totals(page)).toContainText("Quote total$1,184.90");

  // The branch is the freight origin.
  await box.getByRole("combobox", { name: "Branch" }).selectOption("ogden");
  await saved(page);
  await expect(freight).toContainText(/road mi from Ogden/);
  await expect(page.getByRole("rowheader", { name: /HCS-12-13-2G8/ }).locator("xpath=ancestor::tbody[1]")).toContainText("22 at Ogden");
  await box.getByRole("combobox", { name: "Branch" }).selectOption("slc");
  await saved(page);
  await expect(freight).toContainText("15.0 road mi from SLC");

  await freight.getByRole("button", { name: "Set freight by hand" }).click();
  const form = freight.getByRole("form", { name: "Set freight by hand" });
  await expect(form.getByRole("textbox", { name: "Freight amount" })).toHaveValue("62.50");
  await form.getByRole("textbox", { name: "Freight amount" }).fill("80");
  await form.getByRole("button", { name: "Save freight" }).click();
  await expect(form.getByRole("alert")).toHaveText("Say why freight is set by hand.");
  await form.getByRole("textbox", { name: /Reason/ }).fill("Liftgate truck for the job site");
  await attachScreenshot(page, testInfo, "freight-override-form", rail(page));
  await form.getByRole("button", { name: "Save freight" }).click();
  await expect(form).toHaveCount(0);
  await expect(freight).toContainText("Freight (set by rep)$80.00");
  await expect(freight).toContainText("OverrideLiftgate truck for the job site");
  await expect(freight).toContainText("Distance-based freight would be $62.50.");
  await expect(totals(page)).toContainText("Freight (set by rep)$80.00");
  await expect(totals(page)).toContainText("Quote total$1,202.40");
  await expect(page.getByRole("region", { name: "Quote summary" })).toContainText("$1,202.40");
  const activity = await open(page, "Activity");
  await expect(activity.getByRole("listitem").first()).toContainText("Freight set to $80.00: Liftgate truck for the job site");
  await attachScreenshot(page, testInfo, "freight-override", rail(page));

  // Saved on the server: a reload shows the same.
  await page.reload();
  const again = await open(page, "Pickup or delivery");
  await expect(again.getByRole("radio", { name: "Delivery" })).toBeChecked();
  await expect(again.getByRole("region", { name: "Freight" })).toContainText("Freight (set by rep)$80.00");
  await expect(summaryOf(page, "Activity")).toContainText("7 events");
  const detail = await api(page, `/api/rep/quotes/${SAMPLE}`);
  expect(detail.body.freight).toMatchObject({ amount: 80, source: "override", override: { amount: 80, reason: "Liftgate truck for the job site" } });
  expect(detail.body.send_check.total).toBe(1202.4);

  await again.getByRole("button", { name: "Use distance-based freight" }).click();
  await saved(page);
  await expect(again.getByRole("region", { name: "Freight" })).toContainText("15.0 road mi from SLC");
  await expect(totals(page)).toContainText("Quote total$1,184.90");
  await chooseMode(again, "Will call");
  await saved(page);
  await expect(totals(page)).toContainText("Freight (will call)$0.00");
});

test("the credit bar follows the total live, and over the limit it warns without blocking", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1057 });
  await openQuote(page);
  const customer = await open(page, "Customer");
  const gloves = page.getByRole("textbox", { name: "Unit price for GLV-N8-L-1000" });
  await gloves.fill("790");
  // Typed, not yet saved: 18,420.00 + 3,966.40 = 44.8% of 50,000.00.
  await expect(creditLine(customer)).toHaveText("Credit used, with this quote: 45%");
  await expect(summaryOf(page, "Customer")).toContainText("Net 30 · 45% of credit");
  await gloves.fill("9000");
  await gloves.press("Tab");
  await saved(page);
  // 18,420.00 + 36,806.40 = 55,226.40: over by 5,226.40.
  const bar = customer.getByTestId("credit-bar");
  await expect(bar).toHaveAttribute("data-over", "true");
  await expect(creditLine(customer)).toHaveText("Credit used, with this quote: 110%");
  await expect(bar).toContainText("Over limit by $5,226.40");
  await expect(bar.locator('[data-segment="over"]')).toBeVisible();
  const track = (await bar.getByRole("img").boundingBox())!;
  const grey = (await bar.locator('[data-segment="quote"]').boundingBox())!;
  expect(Math.round(grey.x + grey.width)).toBeLessThanOrEqual(Math.round(track.x + track.width));
  await expect(page.getByRole("button", { name: "Approve & send" })).toBeEnabled();
  await attachScreenshot(page, testInfo, "credit-over-limit", rail(page));
});

test("quote terms, internal notes and Activity: saved, logged newest first, and kept after a reload", async ({ page }) => {
  await openQuote(page);
  const terms = await open(page, "Quote terms");
  // Any expiration date, not just 7, 14 or 30 days: 45 days out.
  const picked = await pickExpiration(terms, 45);
  await saved(page);
  const untilPicked = shortDay(picked.day, picked.today);
  await expect(terms).toContainText("45 days from today.");
  // The header's valid-until moves with it.
  await expect(page.getByText(new RegExp(`^Q-24817 · .* · Valid until ${untilPicked}$`))).toBeVisible();
  await expect(summaryOf(page, "Quote terms")).toContainText(`Valid until ${untilPicked}`);
  await terms.getByRole("textbox", { name: "Customer PO number" }).fill("7781");
  await terms.getByRole("textbox", { name: "Customer PO number" }).press("Enter");
  await expect(summaryOf(page, "Quote terms")).toContainText(`Valid until ${untilPicked} · PO 7781`);
  await terms.getByRole("textbox", { name: "Note printed on the quote" }).fill("Straps not in stock at SLC will ship from Ogden.");
  await terms.getByRole("textbox", { name: "Note printed on the quote" }).blur();
  await saved(page);

  const notes = await open(page, "Internal notes");
  await notes.getByRole("button", { name: "Add note" }).click();
  await expect(notes.getByRole("alert")).toHaveText("Write a note first.");
  await notes.getByRole("textbox", { name: "Only your team sees these" }).fill("Dana will push back on the glove price.");
  await notes.getByRole("button", { name: "Add note" }).click();
  await expect(notes.getByRole("list", { name: "Internal notes" })).toContainText("Dana will push back on the glove price.");
  await expect(summaryOf(page, "Internal notes")).toContainText("1 note");

  const activity = await open(page, "Activity");
  await expect(activity.getByRole("listitem")).toHaveText([
    /Brandi added an internal note$/,
    /Brandi updated the note printed on the quote$/,
    /Brandi added customer PO 7781$/,
    new RegExp(`Brandi set the quote to expire ${longDay(picked.day)}$`),
    /Draft quote built and sent to Brandi for review$/,
    /Querent matched 4 items after 1 clarifying question$/,
    /Dana asked for bolts, cut-off wheels, gloves and straps in Querent chat$/,
  ]);

  await page.reload();
  const reloaded = await open(page, "Quote terms");
  await expect(reloaded.getByLabel("Valid until")).toHaveValue(picked.day);
  await expect(reloaded.getByRole("textbox", { name: "Customer PO number" })).toHaveValue("7781");
  await expect(reloaded.getByRole("textbox", { name: "Note printed on the quote" })).toHaveValue("Straps not in stock at SLC will ship from Ogden.");
  await expect((await open(page, "Internal notes")).getByRole("list", { name: "Internal notes" })).toContainText("Dana will push back on the glove price.");
});

test("Reset sample quote (⋯ menu, task 3.5) puts every panel back to the seed after its reload", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1057 });
  await openQuote(page);
  const seededUntil = (await summaryOf(page, "Quote terms").textContent())!.match(/Valid until (.+)$/)![1];

  // Edit every panel through the UI: delivery with a freight override, terms, PO, an internal note.
  const box = await open(page, "Pickup or delivery");
  await chooseMode(box, "Delivery");
  await saved(page);
  await box.getByRole("button", { name: "Set freight by hand" }).click();
  await box.getByRole("textbox", { name: "Freight amount" }).fill("80");
  await box.getByRole("textbox", { name: /Reason/ }).fill("Liftgate truck for the job site");
  await box.getByRole("button", { name: "Save freight" }).click();
  await expect(box.getByRole("region", { name: "Freight" })).toContainText("Freight (set by rep)$80.00");
  const terms = await open(page, "Quote terms");
  const picked = await pickExpiration(terms, 30);
  await saved(page);
  await terms.getByRole("textbox", { name: "Customer PO number" }).fill("7781");
  await terms.getByRole("textbox", { name: "Customer PO number" }).press("Enter");
  await expect(summaryOf(page, "Quote terms")).toContainText("PO 7781");
  const notes = await open(page, "Internal notes");
  await notes.getByRole("textbox", { name: "Only your team sees these" }).fill("Dana will push back on the glove price.");
  await notes.getByRole("button", { name: "Add note" }).click();
  await expect(summaryOf(page, "Internal notes")).toContainText("1 note");
  // The printed note is still being typed when the rep opens the menu: leaving the field saves it,
  // and Reset waits for that save, so nothing lands on the sample after its reset.
  await terms.getByRole("textbox", { name: "Note printed on the quote" }).fill("Straps ship from Ogden.");
  await expect(summaryOf(page, "Pickup or delivery")).toContainText("Delivery · SLC");
  await expect(summaryOf(page, "Activity")).not.toContainText("3 events");

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menu", { name: "More actions" }).getByRole("menuitem", { name: "Reset sample quote" }).click();
  await expect(page.getByText("Sample quote reset")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/rep/quotes/${SAMPLE}\\?customer=wasatch$`));

  // After the reload, every panel shows the seed again.
  await expect(rail(page).locator("details > summary")).toHaveText([
    /^Customer\s*Net 30 · 39% of credit$/,
    /^Pickup or delivery\s*Will call · SLC · Thu Sep 24$/,
    new RegExp(`^Quote terms\\s*Valid until ${seededUntil}$`),
    /^Internal notes\s*None$/,
    /^Activity\s*3 events$/,
  ]);
  const fulfillment = await open(page, "Pickup or delivery");
  await expect(fulfillment.getByRole("radio", { name: "Will call" })).toBeChecked();
  await expect(fulfillment.getByRole("region", { name: "Freight" })).toContainText("Freight$0.00");
  await expect(fulfillment.getByRole("region", { name: "Freight" })).not.toContainText("set by rep");
  const reset = await open(page, "Quote terms");
  await expect(reset.getByLabel("Valid until")).toHaveValue(addDays(picked.today, 14));
  await expect(reset.getByRole("textbox", { name: "Customer PO number" })).toHaveValue("");
  await expect(reset.getByRole("textbox", { name: "Note printed on the quote" })).toHaveValue("");
  await expect((await open(page, "Internal notes")).getByRole("list", { name: "Internal notes" })).toHaveCount(0);
  await expect(creditLine(await open(page, "Customer"))).toHaveText("Credit used, with this quote: 39%");
  await expect(totals(page)).toContainText("Freight (will call)$0.00");
  await expect(totals(page)).toContainText("Quote total$1,122.40");
  await attachScreenshot(page, testInfo, "panels-after-reset", rail(page));
  // The server has the seed too.
  const detail = (await api(page, `/api/rep/quotes/${SAMPLE}`)).body;
  expect(detail.quote).toMatchObject({ fulfillment: "will_call", branch_id: "slc", freight_override: null, freight_override_reason: null, valid_days: 14, expires_on: null, customer_po: null, customer_note: null });
  expect(detail.panels.notes).toEqual([]);
  expect(detail.panels.activity).toHaveLength(3);
});

test("sent, accepted and expired quotes: panels read-only and every panel edit refused (409); changes_requested is editable", async ({ page }) => {
  await openQuote(page, made.sent);
  const box = await open(page, "Pickup or delivery");
  for (const radio of await box.getByRole("radio").all()) await expect(radio).toBeDisabled();
  await expect(box.getByRole("combobox", { name: "Branch" })).toBeDisabled();
  await expect(box.getByRole("region", { name: "Freight" }).getByRole("button")).toHaveCount(0);
  const terms = await open(page, "Quote terms");
  await expect(terms.getByLabel("Valid until")).toBeDisabled();
  await expect(terms.getByRole("textbox", { name: "Customer PO number" })).toBeDisabled();
  await expect((await open(page, "Internal notes")).getByRole("textbox")).toHaveCount(0);

  const edits: [string, string, unknown][] = [
    ["fulfillment", "PATCH", { fulfillment: "delivery" }],
    ["freight", "PUT", { amount: 10, reason: "x" }],
    ["freight", "DELETE", undefined],
    ["terms", "PATCH", { customerPo: "1" }],
    ["notes", "POST", { body: "x" }],
  ];
  for (const number of ["Q-24816", made.sent, made.overdue]) {
    const before = (await api(page, `/api/rep/quotes/${number}`)).body;
    for (const [path, method, body] of edits) {
      const response = await api(page, `/api/rep/quotes/${number}/${path}`, method, body);
      expect(response.status, `${method} ${number}/${path}`).toBe(409);
      expect(response.body.code).toBe("illegal_transition");
    }
    const after = (await api(page, `/api/rep/quotes/${number}`)).body;
    expect(after.quote).toEqual(before.quote);
    expect(after.panels.notes).toEqual(before.panels.notes);
    expect(after.panels.activity).toEqual(before.panels.activity);
  }

  await page.goto(`/rep/quotes/${made.changes_requested}?customer=wasatch`);
  await expect(page.getByText("Changes requested", { exact: true })).toBeVisible();
  const editable = await open(page, "Pickup or delivery");
  await chooseMode(editable, "Will call");
  await saved(page);
  await expect(editable.getByRole("radio", { name: "Will call" })).toBeChecked();
  expect((await api(page, `/api/rep/quotes/${made.changes_requested}`)).body.quote.fulfillment).toBe("will_call");
});

test("rep-only: customers get 403, another rep's quote is 404, and bodies are validated server-side", async ({ page, browser, baseURL }) => {
  await openQuote(page);
  for (const [path, method, body] of [
    ["freight", "PUT", { amount: 80 }],
    ["freight", "PUT", { amount: 80, reason: "   " }],
    ["freight", "PUT", { amount: -5, reason: "x" }],
    ["fulfillment", "PATCH", { branchId: "moab" }],
    ["terms", "PATCH", { validDays: 21 }],
    ["terms", "PATCH", { expiresOn: "2020-01-01" }],
    ["terms", "PATCH", { expiresOn: "2026-02-30" }],
    ["notes", "POST", { body: "" }],
  ] as const) {
    expect((await api(page, `/api/rep/quotes/${SAMPLE}/${path}`, method, body)).status, `${method} ${path} ${JSON.stringify(body)}`).toBe(400);
  }
  expect((await api(page, `/api/rep/quotes/${made.other_rep}/notes`, "POST", { body: "hello" })).status).toBe(404);
  expect((await api(page, `/api/rep/quotes/${made.other_rep}/freight`, "PUT", { amount: 1, reason: "x" })).status).toBe(404);

  const context = await browser.newContext({ baseURL });
  try {
    const dana = await context.newPage();
    await dana.goto("/");
    await dana.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
    await expect(dana.getByLabel("Ask a question")).toBeVisible();
    expect((await api(dana, `/api/rep/quotes/${SAMPLE}/notes`, "POST", { body: "hi" })).status).toBe(403);
    expect((await api(dana, `/api/rep/quotes/${SAMPLE}/freight`, "PUT", { amount: 0, reason: "free" })).status).toBe(403);
    expect((await api(dana, `/api/rep/quotes/${SAMPLE}/fulfillment`, "PATCH", { fulfillment: "delivery" })).status).toBe(403);
    expect((await api(dana, `/api/rep/quotes/${SAMPLE}/terms`, "PATCH", { customerPo: "1" })).status).toBe(403);
  } finally {
    await context.close();
  }
  const detail = (await api(page, `/api/rep/quotes/${SAMPLE}`)).body;
  expect(detail.quote).toMatchObject({ fulfillment: "will_call", freight_override: null, customer_po: null });
  expect(detail.panels.notes).toEqual([]);
});
