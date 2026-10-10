import { expect, test, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";

// Decline (task A1; v3 spec §2.1, §6; decisions 13 to 15): the PDF preview modal's Decline opens a
// centered dialog with five reasons (no "no response"), a 250-character field for Other, a red
// Cancel, an X and a confirm button labelled Decline that works with no reason. Afterwards Dana's
// chip reads Declined and the bar is off; Brandi gets an unread badge, the Declined filter and chip,
// and the reason (and the Other note, hers only) in the quote header and Activity.
//
// Runs on the mockup's seed day through the test-only reset (see golden-quote-flow.spec.ts): start
// your own server with QUERENT_E2E_RESET=1, or let playwright.config.ts start one. Screenshots of the
// dialog at 1440px and 390px go to this test's output folder.

const SEED_DATE = "2026-09-23";
const NOTE = "Our crew found the same bolts at the yard next door.";

test.describe.configure({ mode: "serial" });

const contexts: BrowserContext[] = [];
let dana: Page;
let brandi: Page;
let made: { changes_requested: string; sent: string; overdue: string; other_rep: string };

async function newPage(browser: Browser, baseURL: string, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ baseURL, viewport });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto("/");
  return page;
}

/** Approve & send as Brandi, confirming the revision and total the send check shows. */
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
async function openPreview(page: Page, number: string) {
  await page.evaluate((number) => window.dispatchEvent(new CustomEvent("querent:open-quote", { detail: { id: number, quote_number: number } })), number);
  const modal = page.getByRole("dialog", { name: `Quote ${number}` });
  await expect(modal.getByRole("document")).toHaveAttribute("data-state", "ready");
  return modal;
}
const bar = (modal: Locator) => modal.getByRole("group", { name: "Respond to this quote" });
const sidebarChip = (number: string) => dana.getByRole("complementary", { name: "Quotes" }).getByRole("button").filter({ hasText: number }).locator(".cx-chip");
const repBadge = () => brandi.evaluate(() => fetch("/api/rep/badges").then((r) => r.json()).then((b) => b.quotes as number));
const repDetail = (number: string) => brandi.evaluate((n) => fetch(`/api/rep/quotes/${n}`).then((r) => r.json()), number);
/** Dana's POST, from her page so her session goes with it. */
async function decline(number: string, body: unknown) {
  return dana.evaluate(
    async ({ number, body }) => {
      const response = await fetch(`/api/query/customer/quotes/${number}/decline`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return { status: response.status, json: await response.json() };
    },
    { number, body },
  );
}
async function expectCentered(page: Page, dialog: Locator) {
  const viewport = page.viewportSize()!;
  const box = (await dialog.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
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
  await dana.getByRole("button", { name: /Wasatch Mechanical Contractors/ }).click();
  await expect(dana.getByLabel("Ask a question")).toBeVisible();
});

test.afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
});

test("Decline with a reason at 1440px: the centered dialog, Cancel and X change nothing, then Declined for Dana and Brandi", async ({}, testInfo) => {
  const number = await sentCopy();
  const before = await repBadge();
  const modal = await openPreview(dana, number);
  const dialog = dana.getByRole("alertdialog", { name: "Decline quote" });

  await test.step("the bar offers Decline next to Request changes and Accept", async () => {
    await expect(bar(modal).getByRole("button")).toHaveText(["Decline", "Request changes", "Accept"]);
    await expect(bar(modal).getByRole("button", { name: "Decline" })).toBeEnabled();
  });

  await test.step("the dialog: centered, five reasons and no “no response”, a red Cancel, an X and Decline", async () => {
    await bar(modal).getByRole("button", { name: "Decline" }).click();
    await expect(dialog).toContainText(`Decline ${number} rev 1? Telling Brandi why is optional.`);
    await expect(dialog.getByRole("radio")).toHaveCount(5);
    for (const reason of ["Price too high", "Found other source", "Need it sooner than quoted", "Wrong items or quantity", "Other"])
      await expect(dialog.getByRole("radio", { name: reason, exact: true })).not.toBeChecked();
    await expect(dialog.getByText(/no response/i)).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Cancel" })).toHaveCSS("background-color", "rgb(192, 57, 43)");
    await expect(dialog.getByRole("button", { name: "Decline", exact: true })).toHaveCSS("background-color", "rgb(14, 124, 116)");
    await expectCentered(dana, dialog);
    await screenshot(dana, testInfo, "a1-decline-dialog-1440");
  });

  await test.step("Cancel and the X close it with no change", async () => {
    await dialog.getByRole("radio", { name: "Price too high" }).check();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await bar(modal).getByRole("button", { name: "Decline" }).click();
    await expect(dialog.getByRole("radio", { name: "Price too high" })).not.toBeChecked();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    await expect(modal.locator(".cx-chip")).toHaveText("Sent");
    expect((await repDetail(number)).quote.status).toBe("sent");
  });

  await test.step("Decline with Price too high: Dana sees it declined, the bar is off, and the sidebar chip reads Declined", async () => {
    await bar(modal).getByRole("button", { name: "Decline" }).click();
    await dialog.getByRole("radio", { name: "Price too high" }).check();
    await dialog.getByRole("button", { name: "Decline", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(modal.locator(".cx-chip")).toHaveText("Declined");
    await expect(bar(modal)).toContainText("You declined rev 1. Ask Brandi for a new quote if you still need these items.");
    for (const name of ["Decline", "Request changes", "Accept"]) await expect(bar(modal).getByRole("button", { name, exact: true })).toBeDisabled();
    await expect(sidebarChip(number)).toHaveText("Declined");
    await modal.getByRole("button", { name: "Close" }).click();
  });

  await test.step("Brandi: an unread badge, the Declined filter and chip, the reason in the header and Activity", async () => {
    expect(await repBadge()).toBe(before + 1);
    expect((await repDetail(number)).quote).toMatchObject({ status: "declined", decline_reason: "price_too_high", decline_note: null, unread_for_rep: true });
    await brandi.goto("/rep/quotes?status=declined");
    await expect(brandi.getByRole("navigation", { name: "Rep portal" }).getByRole("link", { name: /^Quotes\b/ })).toHaveAccessibleName(`Quotes ${before + 1} unread`);
    await expect(brandi.getByRole("navigation", { name: "Filter by status" }).locator("[aria-current=page]")).toHaveText(/^Declined\d+$/);
    const row = brandi.getByRole("table").getByRole("rowgroup").filter({ has: brandi.getByRole("link", { name: number, exact: true }) });
    await expect(row).toHaveAttribute("data-status", "declined");
    await expect(row).toHaveAttribute("data-unread", "true");
    await expect(row.getByText("Declined", { exact: true })).toBeVisible();
    await row.getByRole("link", { name: number, exact: true }).click();
    await expect(brandi.getByText(/^Dana declined rev 1 on .+: Price too high\.$/)).toBeVisible();
    const activity = brandi.getByRole("group", { name: "Activity" });
    await activity.locator("summary").click();
    await expect(activity.getByRole("list", { name: "Activity, newest first" }).getByRole("listitem").first()).toContainText(`Dana declined ${number} rev 1: Price too high`);
    await expect(brandi.getByRole("button", { name: "Approve & send" })).toBeDisabled();
  });
});

test("Decline with Other at 390px: the 250-character note reaches Brandi only", async ({}, testInfo) => {
  const number = await sentCopy("Q-24815");
  await dana.setViewportSize({ width: 390, height: 844 });
  try {
    const modal = await openPreview(dana, number);
    await bar(modal).getByRole("button", { name: "Decline" }).click();
    const dialog = dana.getByRole("alertdialog", { name: "Decline quote" });
    await dialog.getByRole("radio", { name: "Other", exact: true }).check();
    const field = dialog.getByRole("textbox", { name: "Tell Brandi more (optional)" });
    await expect(field).toHaveAttribute("maxlength", "250");
    await field.fill(NOTE);
    await expect(dialog).toContainText(`${NOTE.length}/250`);
    await expectCentered(dana, dialog);
    expect(await dana.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await screenshot(dana, testInfo, "a1-decline-other-390");
    await dialog.getByRole("button", { name: "Decline", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(modal.locator(".cx-chip")).toHaveText("Declined");
    await expect(bar(modal).getByRole("button", { name: "Decline" })).toBeDisabled();
    await expect(modal).not.toContainText(NOTE);
    // What Dana's own API says about the quote never carries the note or the reason.
    const mine = await dana.evaluate((n) => fetch(`/api/query/customer/quotes/${n}`).then((r) => r.text()), number);
    expect(mine).not.toContain(NOTE);
    expect(mine).not.toContain("decline_reason");
    await modal.getByRole("button", { name: "Close" }).click();
  } finally {
    await dana.setViewportSize({ width: 1440, height: 900 });
  }

  expect((await repDetail(number)).quote).toMatchObject({ status: "declined", decline_reason: "other", decline_note: NOTE });
  await brandi.goto(`/rep/quotes/${number}`);
  await expect(brandi.getByText(/^Dana declined rev 1 on .+: Other\.$/)).toBeVisible();
  await expect(brandi.getByText(NOTE, { exact: true })).toBeVisible();
  const activity = brandi.getByRole("group", { name: "Activity" });
  await activity.locator("summary").click();
  await expect(activity.getByRole("listitem").first()).toContainText(`Dana declined ${number} rev 1: Other: "${NOTE}"`);
});

test("Decline with no reason is recorded; a second decline and an expired quote are refused", async () => {
  const number = await sentCopy("Q-24814");
  const modal = await openPreview(dana, number);
  await bar(modal).getByRole("button", { name: "Decline" }).click();
  await dana.getByRole("alertdialog", { name: "Decline quote" }).getByRole("button", { name: "Decline", exact: true }).click();
  await expect(modal.locator(".cx-chip")).toHaveText("Declined");
  await modal.getByRole("button", { name: "Close" }).click();
  expect((await repDetail(number)).quote).toMatchObject({ status: "declined", decline_reason: null, decline_note: null, unread_for_rep: true });
  expect(await decline(number, { revision: 1, reason: "price_too_high" })).toMatchObject({ status: 409, json: { code: "illegal_transition", detail: `You already declined ${number}.` } });
  expect(await decline(made.overdue, { revision: 1 })).toMatchObject({ status: 409, json: { code: "expired" } });
  expect(await decline(made.other_rep, {})).toMatchObject({ status: 404 });
});
