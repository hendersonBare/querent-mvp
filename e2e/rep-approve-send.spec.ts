import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

// Approve and send (task 3.7; plan U4, C_QE1; spec §4, §5.4; decision 44) at 1920x1080: the send
// dialog (Querent chat only, Attach PDF on, editable message, what is still open), then a separate
// Confirm send centered on screen with a red Cancel and a green Send away from the first dialog's
// button, then the send: rev 1, status sent, the Activity entry, and the customer PDF of rev 1.
// Blockers disable Approve and send (named under it), the server refuses a blocked send, and a double
// click sends once. The send dialog's look is proven against C_QE1 in e2e/frames-quote-editor.spec.ts.
//
// Before each test the database is reset to the seed pinned to the mockup's day
// (POST /api/test/reset, which exists only with QUERENT_E2E_RESET=1; playwright.config.ts sets it).

const SEED_DATE = "2026-09-23";
const SAMPLE = "Q-24817";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ playwright }, testInfo) => {
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const reset = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(reset.status(), "start the server with QUERENT_E2E_RESET=1").toBe(200);
  } finally {
    await api.dispose();
  }
});

async function openQuote(page: Page, number = SAMPLE) {
  await page.goto("/demo");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
  await page.goto(`/rep/quotes/${number}?customer=wasatch`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");
}
/** Calls the rep API from the page, so the (Secure) session cookie goes with it. */
const api = (page: Page, path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
  page.evaluate(
    async ([p, m, b, h]) => {
      const response = await fetch(p, { method: m, headers: { "content-type": "application/json", ...h }, body: b === undefined ? undefined : JSON.stringify(b) });
      const type = response.headers.get("content-type") ?? "";
      return { status: response.status, type, body: type.includes("json") ? await response.json() : (await response.text()).slice(0, 5) };
    },
    [path, init.method ?? "GET", init.body, init.headers ?? {}] as const,
  );
/** A colour token of the new UI (src/app/tokens.css) as the browser computes it, "rgb(…)". */
const token = (page: Page, name: string) =>
  page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, name);
/** The total in the total box (C_QEBase), e.g. "$1,122.40". */
const quoteTotal = async (page: Page) => (await page.getByRole("region", { name: "Quote summary" }).getByText(/^\$[\d,]+\.\d\d$/).first().textContent())!.trim();
const approve = (page: Page) => page.getByRole("button", { name: "Approve and send" });
const sendDialog = (page: Page) => page.getByRole("dialog", { name: "Send quote to Dana Ortiz" });
const confirmDialog = (page: Page) => page.getByRole("alertdialog", { name: "Confirm send" });
const shoot = (page: Page, testInfo: TestInfo, name: string) => page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
const boxOf = async (locator: Locator) => (await locator.boundingBox())!;
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Walks Approve and send → Send quote → Confirm send → Send on the sample, checking both dialogs and saving screenshots. */
async function sendSample(page: Page, testInfo: TestInfo, label: string) {
  await openQuote(page);
  const total = await quoteTotal(page);
  await approve(page).click();

  const dialog = sendDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`4 items, ${total} before tax. Will call at SLC`);
  await expect(dialog.getByText(/^Still open:/)).toContainText("Nitrile disposable gloves: 26.6% margin, below Brandi's 30% Safety & PPE floor");
  await expect(dialog.getByText(/^Still open:/)).toContainText("You can send anyway.");
  const via = dialog.getByRole("group", { name: "Send by" });
  await expect(via.getByRole("checkbox", { name: "Querent chat" })).toBeChecked();
  await expect(via.getByRole("checkbox", { name: "Querent chat" })).toBeDisabled();
  await expect(via.getByRole("checkbox")).toHaveCount(2);
  await expect(via.getByRole("checkbox", { name: "Attach PDF" })).toBeChecked();
  const message = dialog.getByRole("textbox", { name: "Message to Dana" });
  await expect(message).toHaveValue(new RegExp(`^Hi Dana, your quote is ready: 4 items, ${total.replace(/[$.]/g, "\\$&")} before tax, pickup at SLC`));
  await expect(message).toBeFocused();
  await shoot(page, testInfo, `send-dialog-${label}`);

  const sendQuote = dialog.getByRole("button", { name: "Send quote" });
  const first = await boxOf(sendQuote);
  await sendQuote.click();
  await expect(dialog).toBeHidden();

  const confirm = confirmDialog(page);
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText(`Quote${SAMPLE} rev 1`);
  await expect(confirm).toContainText("ToDana Ortiz, Wasatch Mechanical ContractorsQuerent chat, PDF attached");
  await expect(confirm).toContainText(`Total${total}before tax`);
  await expect(confirm).toContainText("Below floor1 linea warning only");
  // Centered on screen.
  const viewport = page.viewportSize()!;
  const box = await boxOf(confirm);
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2);
  // Red Cancel, green Send (the new UI's tokens), and Send is nowhere near where Send quote was.
  const cancel = confirm.getByRole("button", { name: "Cancel" });
  const send = confirm.getByRole("button", { name: "Send", exact: true });
  await expect(cancel).toHaveCSS("background-color", await token(page, "--q-red"));
  await expect(send).toHaveCSS("background-color", await token(page, "--q-accent"));
  expect(overlap(first, await boxOf(send)), "Send sits where Send quote was").toBe(false);
  await shoot(page, testInfo, `confirm-send-${label}`);
  // No sideways scroll at this width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await send.click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText(`Sent ${SAMPLE} rev 1 to Dana in Querent chat`)).toBeVisible();
  return total;
}

async function expectSent(page: Page, total: string) {
  // The header's status (C_QEBase); there is no "Sent to Dana" banner (plan U4), the send is in Activity.
  await expect(page.getByRole("group", { name: "Status" })).toHaveText(/^Status\s*Sent$/);
  await expect(approve(page)).toBeDisabled();
  const detail = await api(page, `/api/rep/quotes/${SAMPLE}`);
  expect(detail.body.quote).toMatchObject({ status: "sent", revision: 1 });
  expect(detail.body.panels.activity.filter((a: { kind: string }) => a.kind === "sent")).toHaveLength(1);
  expect(detail.body.panels.activity.at(-1).message).toBe(`Brandi Gallegos sent ${SAMPLE} rev 1 to Dana (${total})`);
  // The frozen revision renders as the customer PDF.
  const pdf = await api(page, `/api/quotes/${SAMPLE}/pdf?variant=customer&rev=1`);
  expect(pdf).toMatchObject({ status: 200, type: "application/pdf", body: "%PDF-" });
}

test.describe("desktop (1920px)", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("Approve and send → Send quote → centered Confirm send → Send: the quote goes out as rev 1", async ({ page }, testInfo) => {
    const total = await sendSample(page, testInfo, "1920");
    await expectSent(page, total);
    await shoot(page, testInfo, "sent-1920");
  });

  test("Cancel in Confirm send goes back with the message kept; Cancel in the send dialog sends nothing", async ({ page }) => {
    await openQuote(page);
    await approve(page).click();
    const message = sendDialog(page).getByRole("textbox", { name: "Message to Dana" });
    await message.fill("Hi Dana, here is the updated quote.");
    await sendDialog(page).getByRole("button", { name: "Send quote" }).click();
    await confirmDialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(confirmDialog(page)).toBeHidden();
    await expect(message).toHaveValue("Hi Dana, here is the updated quote.");
    await sendDialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(sendDialog(page)).toBeHidden();
    expect((await api(page, `/api/rep/quotes/${SAMPLE}`)).body.quote).toMatchObject({ status: "ready_for_review", revision: 0 });
  });

  test("blockers (decision 44): the reason shows under Approve and send, which is disabled, and the server refuses", async ({ page }, testInfo) => {
    await openQuote(page);
    const cleared = await api(page, `/api/rep/quotes/${SAMPLE}/lines/q-24817-4`, { method: "PATCH", body: { unitPrice: null } });
    expect(cleared.status).toBe(200);
    await page.reload();
    await expect(approve(page)).toBeDisabled();
    await expect(approve(page)).toHaveAccessibleDescription("Line 4 (RS-2-27-JH) has no price.");
    const reason = page.getByRole("button", { name: "Line 4 (RS-2-27-JH) has no price.", exact: true });
    await expect(reason).toBeVisible();
    await expect(sendDialog(page)).toHaveCount(0);
    await expect(confirmDialog(page)).toHaveCount(0);
    // Pressing the reason goes to the line's price field.
    await reason.click();
    await expect(page.getByRole("textbox", { name: "Unit price for RS-2-27-JH" })).toBeFocused();
    await shoot(page, testInfo, "send-blocked-1920");
    // The server re-checks: a direct send is refused too.
    const direct = await api(page, `/api/rep/quotes/${SAMPLE}/send`, { method: "POST", body: { revision: 1, total: 847 } });
    expect(direct).toMatchObject({ status: 422, body: { code: "send_blocked", blockers: [{ code: "no_price", line_id: "q-24817-4" }] } });
  });

  test("a double click on Send sends once", async ({ page }) => {
    await openQuote(page);
    await approve(page).click();
    await sendDialog(page).getByRole("button", { name: "Send quote" }).click();
    await confirmDialog(page).getByRole("button", { name: "Send", exact: true }).dblclick();
    await expect(page.getByText(`Sent ${SAMPLE} rev 1 to Dana in Querent chat`)).toBeVisible();
    const detail = await api(page, `/api/rep/quotes/${SAMPLE}`);
    expect(detail.body.quote.revision).toBe(1);
    expect(detail.body.panels.activity.filter((a: { kind: string }) => a.kind === "sent")).toHaveLength(1);
  });

  test("Preview PDF opens the draft as the customer PDF", async ({ page }) => {
    await openQuote(page);
    await approve(page).click();
    const preview = sendDialog(page).getByRole("link", { name: "Preview PDF" });
    await expect(preview).toHaveAttribute("href", "/api/quotes/q-24817/pdf?variant=customer&rev=draft");
    await expect(preview).toHaveAttribute("target", "_blank");
    const pdf = await api(page, "/api/quotes/q-24817/pdf?variant=customer&rev=draft");
    expect(pdf).toMatchObject({ status: 200, type: "application/pdf", body: "%PDF-" });
  });
});
