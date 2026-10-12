import { expect, test, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";

// Accept / Request changes (task 5.2, spec §3, §5.4): the PDF preview modal's action bar, the
// Accept form (a pickup or delivery time and a PO, branch and pickup/delivery locked), the Request
// changes form (a required note), and the centered Confirm dialogs (red Cancel, Querent-green Send)
// that repeat what will be sent. Then what Brandi sees, and what a crafted request can't do: change
// branch or pickup, answer an expired quote, an older revision or another customer's quote.
//
// Runs on the mockup's seed day through the test-only reset (see golden-quote-flow.spec.ts): start
// your own server with QUERENT_E2E_RESET=1, or let playwright.config.ts start one. Screenshots of
// the action bar, both forms and both Confirm dialogs at 1440px and 390px go to this test's output
// folder.

const SEED_DATE = "2026-09-23";
const SAMPLE = "Q-24817";
const PO = "WMC-7781";
const NOTE = "Can you make the gloves 6 cases, and add a box of flap discs?";

test.describe.configure({ mode: "serial" });

const contexts: BrowserContext[] = [];
let dana: Page;
let brandi: Page;
let made: { changes_requested: string; sent: string; overdue: string; other_rep: string };

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

/** Approve & send as Brandi (task 3.7's route), confirming the revision and total the send check shows. */
async function send(number: string) {
  const status = await brandi.evaluate(async (number) => {
    const detail = await fetch(`/api/rep/quotes/${number}`).then((r) => r.json());
    const { total, revision } = detail.send_check;
    const response = await fetch(`/api/rep/quotes/${number}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "", attach_pdf: true, revision, total }),
    });
    return response.status;
  }, number);
  expect(status, `sending ${number}`).toBe(200);
}
/** A fresh copy of a seeded quote, sent to Dana: its number. */
async function sentCopy(of = "Q-24816") {
  const copy = await brandi.evaluate((of) => fetch(`/api/rep/quotes/${of}/duplicate`, { method: "POST" }).then((r) => r.json()), of);
  await send(copy.quote_number);
  return copy.quote_number as string;
}
/** Opens the preview modal on `number` (the event the sidebar and View quote send), at revision `revision` if given. */
async function openPreview(page: Page, number: string, revision?: number) {
  await page.evaluate(({ number, revision }) => window.dispatchEvent(new CustomEvent("querent:open-quote", { detail: { id: number, quote_number: number, revision } })), {
    number,
    revision,
  });
  const modal = page.getByRole("dialog", { name: `Quote ${number}` });
  await expect(modal.getByRole("document")).toHaveAttribute("data-state", "ready");
  return modal;
}
const bar = (modal: Locator) => modal.getByRole("group", { name: "Respond to this quote" });
/** Brandi's view of the quote (task 3.3's route). */
const repDetail = (number: string) => brandi.evaluate((n) => fetch(`/api/rep/quotes/${n}`).then((r) => r.json()), number);
/** Dana's POST, from her page so her session goes with it. */
async function answer(action: "accept" | "request-changes", number: string, body: unknown, key?: string) {
  return dana.evaluate(
    async ({ action, number, body, key }) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (key) headers["idempotency-key"] = key;
      const response = await fetch(`/api/query/customer/quotes/${number}/${action}`, { method: "POST", headers, body: JSON.stringify(body) });
      return { status: response.status, json: await response.json() };
    },
    { action, number, body, key },
  );
}
/** A weekday at least a day ahead in Mountain time (YYYY-MM-DD), and a Saturday. */
function days() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date());
  const day = new Date(`${today}T12:00:00.000Z`);
  do day.setUTCDate(day.getUTCDate() + 1);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6);
  const saturday = new Date(day);
  while (saturday.getUTCDay() !== 6) saturday.setUTCDate(saturday.getUTCDate() + 1);
  return { weekday: day.toISOString().slice(0, 10), saturday: saturday.toISOString().slice(0, 10) };
}
const weekdayDay = (day: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00.000Z`)).replace(",", "");

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
/** Centered on screen, a red Cancel and a Querent-green Send, and Send clear of the button that opened it. */
async function expectConfirm(page: Page, confirm: Locator, opener: Box) {
  const viewport = page.viewportSize()!;
  const box = (await confirm.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  await expect(confirm.getByRole("button", { name: "Cancel" })).toHaveCSS("background-color", "rgb(192, 57, 43)");
  const send = confirm.getByRole("button", { name: "Send", exact: true });
  await expect(send).toHaveCSS("background-color", "rgb(14, 124, 116)");
  expect(overlaps((await send.boundingBox())!, opener), "Send sits where the form's button was").toBe(false);
}
async function noSideways(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
}
async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test.beforeAll(async ({ browser, playwright }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL!;
  const api = await playwright.request.newContext({ baseURL });
  try {
    const reset = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(reset.status(), "POST /api/test/reset failed: start the server with QUERENT_E2E_RESET=1").toBe(200);
    const fixture = await api.post("/api/test/rep-quotes");
    expect(fixture.status()).toBe(200);
    made = await fixture.json();
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

test("Accept at 1440px: the action bar, the form with branch and pickup locked, the centered Confirm, then Accepted for Dana and Brandi", async ({}, testInfo) => {
  await send(SAMPLE);
  const { weekday, saturday } = days();
  const when = `${weekdayDay(weekday)}, 10:00 AM`;
  const modal = await openPreview(dana, SAMPLE);

  await test.step("the action bar: Accept and Request changes, and how to answer", async () => {
    await expect(bar(modal).getByRole("button", { name: "Accept" })).toBeEnabled();
    await expect(bar(modal).getByRole("button", { name: "Request changes" })).toBeEnabled();
    await expect(bar(modal)).toContainText("Accept it with a pickup time and your PO, or ask Brandi for changes.");
    await screenshot(dana, testInfo, "5.2-action-bar-1440");
  });

  const form = modal.getByRole("form", { name: `Accept ${SAMPLE} rev 1` });
  await test.step("the Accept form: branch and pickup locked, a day that can't be in the past, a time and the PO", async () => {
    await bar(modal).getByRole("button", { name: "Accept" }).click();
    await expect(form.getByRole("radio", { name: "Pickup" })).toBeChecked();
    for (const control of [form.getByRole("radio", { name: "Pickup" }), form.getByRole("radio", { name: "Delivery" }), form.getByRole("combobox", { name: "Branch" })])
      await expect(control).toBeDisabled();
    await expect(form.getByRole("combobox", { name: "Branch" })).toHaveValue("SLC");
    await expect(form).toContainText("Set by Brandi on this quote. To change the branch or pickup, use Request changes.");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date());
    expect((await form.getByLabel("Pickup day").getAttribute("min"))! >= today).toBe(true);
    // A weekend day says why at once.
    await form.getByLabel("Pickup day").fill(saturday);
    await expect(form.getByRole("alert")).toHaveText("Pickup is Monday to Friday. Choose a weekday.");
    await form.getByLabel("Pickup day").fill(weekday);
    await expect(form.getByRole("alert")).toHaveCount(0);
    await form.getByLabel("Pickup time").selectOption({ label: "10:00 AM" });
    await form.getByLabel("PO number").fill(PO);
    await screenshot(dana, testInfo, "5.2-accept-form-1440");
  });

  const confirm = dana.getByRole("alertdialog", { name: "Confirm acceptance" });
  await test.step("the Confirm repeats what will be sent; Cancel goes back to the form as it was", async () => {
    const review = form.getByRole("button", { name: "Review and accept" });
    const opener = (await review.boundingBox())!;
    await review.click();
    await expect(confirm).toContainText(`Accept ${SAMPLE} rev 1 for $1,122.40, pickup ${when} at SLC, PO ${PO}?`);
    await expect(confirm).toContainText(`Quote${SAMPLE} rev 1`);
    await expect(confirm).toContainText("Total$1,122.40before tax");
    await expect(confirm).toContainText(`Pickup${when} at SLC`);
    await expect(confirm).toContainText(`PO${PO}`);
    await expect(confirm).toContainText("ToBrandi Gallegos");
    await expectConfirm(dana, confirm, opener);
    await screenshot(dana, testInfo, "5.2-accept-confirm-1440");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toBeHidden();
    await expect(form.getByLabel("PO number")).toHaveValue(PO);
  });

  await test.step("Send: Dana sees it accepted, and the sidebar follows", async () => {
    await form.getByRole("button", { name: "Review and accept" }).click();
    await confirm.getByRole("button", { name: "Send", exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect(modal.locator(".qp-state")).toHaveText("Accepted");
    await expect(bar(modal)).toContainText(`You accepted rev 1 with PO ${PO}: pickup ${when} at SLC.`);
    await expect(bar(modal).getByRole("button", { name: "Accept" })).toBeDisabled();
    const button = dana.getByRole("complementary", { name: "Quotes" }).getByRole("button").filter({ hasText: SAMPLE });
    await expect(button.locator(".cx-chip")).toHaveText("Accepted");
    await modal.getByRole("button", { name: "Close" }).click();
  });

  await test.step("Brandi: accepted, unread, with the PO and the time where she sees them", async () => {
    const detail = await repDetail(SAMPLE);
    expect(detail.quote).toMatchObject({ status: "accepted", customer_po: PO, fulfillment: "will_call", branch_code: "SLC", unread_for_rep: true });
    expect(detail.editable).toBe(false);
    await brandi.goto(`/rep/quotes/${SAMPLE}`);
    await expect(brandi.getByText(new RegExp(`with PO ${PO}, pickup ${when} at SLC\\.$`))).toBeVisible();
    await expect(brandi.getByRole("group", { name: "Pickup or delivery" }).locator("summary")).toContainText(`Will call · SLC · ${when}`);
    await expect(brandi.getByRole("group", { name: "Quote terms" }).locator("summary")).toContainText(`PO ${PO}`);
  });
});

test("Request changes at 1440px: a required note, the centered Confirm, and Brandi's list shows the note on an editable quote", async ({}, testInfo) => {
  const number = await sentCopy();
  const modal = await openPreview(dana, number);
  await bar(modal).getByRole("button", { name: "Request changes" }).click();
  const form = modal.getByRole("form", { name: `Request changes to ${number} rev 1` });
  const review = form.getByRole("button", { name: "Review request" });
  await review.click();
  await expect(form.getByRole("alert")).toHaveText("Say what should change: a note is required.");
  await form.getByLabel("What should Brandi change?").fill(NOTE);
  await screenshot(dana, testInfo, "5.2-changes-form-1440");
  const opener = (await review.boundingBox())!;
  await review.click();
  const confirm = dana.getByRole("alertdialog", { name: "Confirm change request" });
  await expect(confirm).toContainText(`Send your change request for ${number} rev 1 to Brandi?`);
  await expect(confirm).toContainText(`Note${NOTE}`);
  await expectConfirm(dana, confirm, opener);
  await screenshot(dana, testInfo, "5.2-changes-confirm-1440");
  await confirm.getByRole("button", { name: "Send", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(modal.locator(".qp-state")).toHaveText("Changes requested");
  await expect(bar(modal).locator(".qp-said")).toHaveText(NOTE);
  await modal.getByRole("button", { name: "Close" }).click();

  const detail = await repDetail(number);
  expect(detail.quote).toMatchObject({ status: "changes_requested", change_request_note: NOTE, unread_for_rep: true, branch_code: "SLC" });
  expect(detail.editable).toBe(true);
  await brandi.goto("/rep/quotes");
  const row = brandi.getByRole("table").getByRole("rowgroup").filter({ has: brandi.getByRole("link", { name: number, exact: true }) });
  await expect(row).toHaveAttribute("data-status", "changes_requested");
  await expect(row.getByText(NOTE)).toBeVisible();
});

test("what a crafted request can't do: change branch or pickup, answer twice, an older revision, an expired quote or another customer's quote", async () => {
  const { weekday } = days();
  const number = await sentCopy("Q-24815");
  const body = { revision: 1, day: weekday, time: "10:00", po: PO };

  await test.step("branch and pickup stay locked, and times in the past are refused", async () => {
    expect(await answer("accept", number, { ...body, branch_id: "ogden", fulfillment: "delivery" })).toMatchObject({
      status: 400,
      json: { code: "invalid_input", detail: "Branch and pickup are locked to what Brandi approved. To change them, use Request changes." },
    });
    expect(await answer("accept", number, { ...body, day: "2026-09-21" })).toMatchObject({ status: 400, json: { detail: expect.stringMatching(/^That day has passed\./) } });
    expect(await answer("request-changes", number, { revision: 1, note: "   " })).toMatchObject({ status: 400, json: { detail: "Say what should change: a note is required." } });
    expect((await repDetail(number)).quote).toMatchObject({ status: "sent", branch_code: "SLC", fulfillment: "will_call" });
  });

  await test.step("a double submit is one acceptance", async () => {
    // A fresh key per run: the server remembers keys for ten minutes, across a database reset.
    const key = `e2e-double-${Date.now()}`;
    const first = await answer("accept", number, body, key);
    expect(first).toMatchObject({ status: 200, json: { replayed: false, quote: { status: "accepted" } } });
    expect(await answer("accept", number, body, key)).toMatchObject({ status: 200, json: { replayed: true } });
    expect(await answer("accept", number, body)).toMatchObject({ status: 409, json: { code: "illegal_transition" } });
    const activity = (await repDetail(number)).panels.activity.filter((a: { kind: string }) => a.kind === "accepted");
    expect(activity).toHaveLength(1);
  });

  await test.step("an older revision: the bar is off, and the server says it is out of date", async () => {
    // made.changes_requested is at rev 1 with Dana's note: Brandi sends rev 2.
    await send(made.changes_requested);
    const modal = await openPreview(dana, made.changes_requested, 1);
    await expect(modal).toContainText("Revision 2 is the latest.");
    await expect(bar(modal).getByRole("button", { name: "Accept" })).toBeDisabled();
    await expect(bar(modal)).toContainText("Revision 2 replaced this one.");
    await modal.getByRole("button", { name: "Close" }).click();
    expect(await answer("accept", made.changes_requested, body)).toMatchObject({ status: 409, json: { code: "conflict" } });
  });

  await test.step("an expired quote: the bar is off and says why, and the server refuses", async () => {
    const modal = await openPreview(dana, made.overdue);
    await expect(modal.locator(".qp-state")).toHaveText("Expired");
    await expect(bar(modal).getByRole("button", { name: "Accept" })).toBeDisabled();
    await expect(bar(modal).getByRole("button", { name: "Request changes" })).toBeDisabled();
    await expect(bar(modal)).toContainText(/This quote expired: it was valid until .+\. Ask Brandi for a new one\./);
    await modal.getByRole("button", { name: "Close" }).click();
    expect(await answer("accept", made.overdue, body)).toMatchObject({ status: 409, json: { code: "expired" } });
    expect(await answer("request-changes", made.overdue, { revision: 1, note: "x" })).toMatchObject({ status: 409, json: { code: "expired" } });
  });

  await test.step("another customer's quote and an unknown one are not found", async () => {
    for (const id of [made.other_rep, "Q-99999"]) expect(await answer("accept", id, body), id).toMatchObject({ status: 404, json: { detail: "Quote not found." } });
  });
});

test("390px: the action bar, both forms and both Confirm dialogs fit the phone (a delivery quote)", async ({ browser }, testInfo) => {
  // Q-24814 is a delivery from Provo: the form and the Confirm say delivery, and where it goes.
  const number = await sentCopy("Q-24814");
  const phone = await newPage(browser, testInfo.project.use.baseURL!, { width: 390, height: 844 });
  await signInAsDana(phone);
  const { weekday } = days();
  const modal = await openPreview(phone, number);
  const inView = async (locator: Locator) => {
    const b = (await locator.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(390);
    expect(b.y + b.height).toBeLessThanOrEqual(844);
  };

  await inView(bar(modal).getByRole("button", { name: "Accept" }));
  await inView(bar(modal).getByRole("button", { name: "Request changes" }));
  await noSideways(phone);
  await screenshot(phone, testInfo, "5.2-action-bar-390");

  await bar(modal).getByRole("button", { name: "Accept" }).click();
  const form = modal.getByRole("form", { name: `Accept ${number} rev 1` });
  await expect(form.getByRole("radio", { name: "Delivery" })).toBeChecked();
  await expect(form.getByRole("radio", { name: "Delivery" })).toBeDisabled();
  await expect(form.getByRole("combobox", { name: "Branch" })).toHaveValue("Provo");
  await expect(form).toContainText("Delivers to 1800 W 10950 S, South Jordan, UT 84095.");
  await form.getByLabel("Delivery day").fill(weekday);
  await form.getByLabel("Delivery time").selectOption({ label: "9:30 AM" });
  await form.getByLabel("PO number").fill(PO);
  const review = form.getByRole("button", { name: "Review and accept" });
  await inView(review);
  await inView(form.getByLabel("PO number"));
  await noSideways(phone);
  await screenshot(phone, testInfo, "5.2-accept-form-390");
  const opener = (await review.boundingBox())!;
  await review.click();
  const accept = phone.getByRole("alertdialog", { name: "Confirm acceptance" });
  await expect(accept).toContainText(`delivery ${weekdayDay(weekday)}, 9:30 AM from Provo, PO ${PO}?`);
  await expect(accept).toContainText("to 1800 W 10950 S, South Jordan, UT 84095");
  await expectConfirm(phone, accept, opener);
  await noSideways(phone);
  await screenshot(phone, testInfo, "5.2-accept-confirm-390");
  await accept.getByRole("button", { name: "Cancel" }).click();
  await form.getByRole("button", { name: "Back" }).click();

  await bar(modal).getByRole("button", { name: "Request changes" }).click();
  const changes = modal.getByRole("form", { name: `Request changes to ${number} rev 1` });
  await changes.getByLabel("What should Brandi change?").fill(NOTE);
  const reviewChanges = changes.getByRole("button", { name: "Review request" });
  await inView(reviewChanges);
  await noSideways(phone);
  await screenshot(phone, testInfo, "5.2-changes-form-390");
  const changesOpener = (await reviewChanges.boundingBox())!;
  await reviewChanges.click();
  const confirm = phone.getByRole("alertdialog", { name: "Confirm change request" });
  await expectConfirm(phone, confirm, changesOpener);
  await noSideways(phone);
  await screenshot(phone, testInfo, "5.2-changes-confirm-390");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  // Nothing was sent.
  expect((await repDetail(number)).quote.status).toBe("sent");
});
