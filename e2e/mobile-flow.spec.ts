import { expect, test, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";

// The quote flow on a phone (task 7.1 mobile pass; spec §3, §4; docs/design/screens/08): Dana at
// 390×844 and Brandi at her desk (1920×1080: the rep portal has no phone layout, decision 43, plan
// U2) walk workflow steps 1–8 with the page's own controls. Every action is
// scrolled to, fully on screen and pressed without force (so nothing covers it), and no page,
// sheet or dialog scrolls sideways at any point:
//   - Dana: chat, the clarifying buttons, the item pop-up (Request quote), the quote notice, the
//     PDF preview modal (Download, Close), Request changes and Accept, each through its Confirm;
//   - Brandi: the Quotes list, the quote detail (price basis, a typed price, qty, the side panels,
//     Export and ⋯), Approve & send, and Confirm send, for rev 1 and rev 2.
// The per-screen 390px tests in the other specs check each layout in detail; this one proves the
// customer's whole flow can be done on a phone. Screenshots of each screen go to this test's output folder.
//
// beforeAll resets the database to the seed pinned to the mockup's day through the test-only
// POST /api/test/reset (QUERENT_E2E_RESET=1, set by playwright.config.ts). Chat is scripted.

const SEED_DATE = "2026-09-23";
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1920, height: 1080 };
const STOCK_QUESTION = "Do you have 1/2 in grade 8 hex bolts in stock?";
const REQUEST = "Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels. We'll pick up at SLC.";
const CHANGE_NOTE = "Can you make the bolts 12 boxes? Thanks, Dana";
const PO = "WMC-7790";

test.describe.configure({ mode: "serial" });

let dana: Page;
let brandi: Page;
const contexts: BrowserContext[] = [];
const flow = { quoteNumber: "", total: "" };

async function phone(browser: Browser, baseURL: string, workspace: RegExp, viewport = PHONE) {
  const context = await browser.newContext({ baseURL, viewport });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: workspace }).click();
  return page;
}

test.beforeAll(async ({ browser, playwright }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL!;
  const api = await playwright.request.newContext({ baseURL });
  try {
    const response = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(response.status(), "start the server with QUERENT_E2E_RESET=1").toBe(200);
  } finally {
    await api.dispose();
  }
  dana = await phone(browser, baseURL, /Wasatch Mechanical Contractors/);
  brandi = await phone(browser, baseURL, /Herrick Industrial Supply/, DESK);
});
test.afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
});

/** Scrolls `control` into view and checks it is wholly on screen: the caller then presses or fills it without force. */
async function reach(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
  await expect(control).toBeInViewport({ ratio: 1 });
  const box = (await control.boundingBox())!;
  expect(box.x, "starts on screen").toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, "ends on screen").toBeLessThanOrEqual(control.page().viewportSize()!.width);
  return control;
}
/** Nothing scrolls sideways: the page, and any open dialog or sheet. */
async function noSideways(page: Page) {
  const wide = await page.evaluate(() => {
    const over = (el: Element) => el.scrollWidth - el.clientWidth > 1;
    const found = over(document.documentElement) ? ["page"] : [];
    for (const el of document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'))
      if (over(el)) found.push(el.getAttribute("aria-label") ?? el.getAttribute("role")!);
    return found;
  });
  expect(wide, "scrolls sideways").toEqual([]);
}
async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`7.1-mobile-${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}
/** A Confirm dialog: centered on the screen, with Cancel and Send both reachable. */
async function expectConfirm(page: Page, confirm: Locator) {
  await expect(confirm).toBeVisible();
  const box = (await confirm.boundingBox())!;
  const screen = page.viewportSize()!;
  expect(Math.abs(box.x + box.width / 2 - screen.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - screen.height / 2)).toBeLessThan(2);
  await reach(confirm.getByRole("button", { name: "Cancel" }));
  await reach(confirm.getByRole("button", { name: "Send", exact: true }));
  await noSideways(page);
}
async function ask(text: string) {
  const answers = dana.locator(".answer-bubble");
  const before = await answers.count();
  await (await reach(dana.getByLabel("Ask a question"))).fill(text);
  await (await reach(dana.getByRole("button", { name: "Send question" }))).click();
  await expect(answers).toHaveCount(before + 1);
  return answers.last();
}
const tab = (name: "Chat" | "Contacts" | "Quotes") => dana.getByRole("tablist", { name: "Workspace" }).getByRole("tab", { name });
const preview = () => dana.getByRole("dialog", { name: `Quote ${flow.quoteNumber}` });
const quoteButton = () => dana.getByRole("complementary", { name: "Quotes" }).getByRole("button").filter({ hasText: flow.quoteNumber });

/** Brandi opens `number` from the Quotes list on her phone. */
async function openFromList(number: string) {
  await brandi.goto("/rep/quotes");
  await expect(brandi.getByRole("heading", { level: 1 })).toHaveText("Quotes");
  await noSideways(brandi);
  await (await reach(brandi.getByRole("link", { name: number, exact: true }))).click();
  await expect(brandi).toHaveURL(new RegExp(`/rep/quotes/${number}$`));
  await expect(brandi.getByRole("heading", { level: 1 })).toHaveText("Wasatch Mechanical Contractors");
  await noSideways(brandi);
}
/** Approve & send → Send quote → Confirm send → Send, all on the phone. */
async function approveAndSend(testInfo: TestInfo, message: string, revision: number) {
  await (await reach(brandi.getByRole("button", { name: "Approve & send" }))).click();
  const dialog = brandi.getByRole("dialog", { name: "Send quote to Dana Ortiz" });
  await expect(dialog).toBeVisible();
  await (await reach(dialog.getByRole("textbox", { name: "Message to Dana" }))).fill(message);
  await expect(await reach(dialog.getByRole("checkbox", { name: "Attach PDF" }))).toBeChecked();
  await noSideways(brandi);
  if (revision === 1) await shoot(brandi, testInfo, "rep-send-dialog");
  await (await reach(dialog.getByRole("button", { name: "Send quote" }))).click();
  const confirm = brandi.getByRole("alertdialog", { name: "Confirm send" });
  await expect(confirm).toContainText(`Quote${flow.quoteNumber} rev ${revision}`);
  await expectConfirm(brandi, confirm);
  if (revision === 1) await shoot(brandi, testInfo, "rep-confirm-send");
  await confirm.getByRole("button", { name: "Send", exact: true }).click();
  await expect(brandi.getByText(`Sent ${flow.quoteNumber} rev ${revision} to Dana in Querent chat`)).toBeVisible();
  await expect(brandi.locator("h1 + *")).toHaveText("Sent");
}

test("Dana on her phone: chat, the clarifying buttons and the item pop-up (steps 1–4)", async ({}, testInfo) => {
  await expect(tab("Chat")).toHaveAttribute("aria-selected", "true");
  const stock = await ask(STOCK_QUESTION);
  await expect(stock).toContainText("64 at SLC, 22 at Ogden and 8 at Provo");
  await noSideways(dana);

  await expect(await ask(REQUEST)).toContainText("Type 1 or Type 27 cut-off wheels?");
  const round2 = await ask("Not sure");
  const choices = round2.getByRole("group", { name: /^Choose the item for/ });
  for (const choice of await choices.getByRole("button").all()) await reach(choice);
  await reach(round2.getByRole("button", { name: /^Drop this line/ }));
  await reach(round2.getByRole("link", { name: /\(801\) 111-2222/ }));
  await noSideways(dana);
  await shoot(dana, testInfo, "customer-clarify");
  await (await reach(choices.getByRole("button", { name: /CW-45-045-T1/ }))).click();

  const popup = dana.getByRole("dialog", { name: "Review your list" });
  await expect(popup).toBeVisible();
  for (const sku of ["HCS-12-13-2G8", "CW-45-045-T1"]) {
    await reach(popup.getByLabel(`Qty for ${sku}`));
    await reach(popup.getByRole("button", { name: `Remove ${sku}` }));
  }
  await reach(popup.getByRole("radio", { name: "Pickup" }));
  await reach(popup.getByRole("radio", { name: "Delivery" }));
  await reach(popup.getByRole("combobox", { name: "Branch" }));
  await noSideways(dana);
  await shoot(dana, testInfo, "customer-item-popup");
  await (await reach(popup.getByRole("button", { name: "Request quote" }))).click();
  await expect(popup).toBeHidden();
  const confirmation = dana.locator(".answer-bubble").last();
  await expect(confirmation).toContainText("Sent to Brandi for review.");
  flow.quoteNumber = (await confirmation.textContent())!.match(/Q-\d+/)![0];
  await noSideways(dana);
});

test("Brandi at her desk: the quote detail, Approve & send and Confirm send (steps 5–6)", async ({}, testInfo) => {
  await openFromList(flow.quoteNumber);
  const SKU = "HCS-12-13-2G8";
  // Every header action is on screen: Save draft, Export, More actions, Approve & send.
  for (const name of ["Save draft", "Export", "More actions", "Approve & send"]) await reach(brandi.getByRole("button", { name, exact: true }));
  await shoot(brandi, testInfo, "rep-quote-detail");

  await (await reach(brandi.getByRole("button", { name: /^Price basis for HCS-12-13-2G8: / }))).click();
  const list = brandi.getByRole("listbox", { name: `Price basis for ${SKU}` });
  await reach(list);
  await noSideways(brandi);
  await (await reach(list.getByRole("option", { name: /^List/ }))).click();
  const price = await reach(brandi.getByRole("textbox", { name: `Unit price for ${SKU}` }));
  await price.fill("22.00");
  await price.press("Tab");
  const line = brandi.getByRole("rowheader", { name: new RegExp(SKU) }).locator("xpath=ancestor::tbody[1]");
  await expect(line.getByRole("note")).toHaveText("Below Brandi's 20% Fasteners floor");
  await reach(line.getByRole("note"));
  await reach(brandi.getByRole("textbox", { name: `Quantity for ${SKU}` }));
  await expect(brandi.getByText("All changes saved")).toBeVisible();
  await noSideways(brandi);

  // The side panels open and fit.
  for (const name of ["Customer", "Pickup or delivery", "Quote terms", "Internal notes", "Activity"]) {
    await (await reach(brandi.getByRole("group", { name }).locator("summary"))).click();
    await noSideways(brandi);
  }
  await reach(brandi.getByRole("button", { name: "Set freight by hand" }));
  await reach(brandi.getByRole("button", { name: "Add note" }));
  await shoot(brandi, testInfo, "rep-panels");

  // Export and ⋯ open on screen.
  for (const name of ["Export", "More actions"]) {
    await (await reach(brandi.getByRole("button", { name, exact: true }))).click();
    const menu = brandi.getByRole("menu", { name });
    for (const item of await menu.getByRole("menuitem").all()) await reach(item);
    await noSideways(brandi);
    await brandi.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  }

  flow.total = (await brandi.getByLabel("Quote totals").getByRole("definition").last().textContent())!.trim();
  await approveAndSend(testInfo, `Hi Dana, here is ${flow.quoteNumber}. Thanks, Brandi`, 1);
  await noSideways(brandi);
});

test("Dana on her phone: the quote notice, the PDF preview and Request changes (steps 6–7)", async ({}, testInfo) => {
  const notice = dana.getByRole("article", { name: new RegExp(`^Quote ${flow.quoteNumber} is ready: `) });
  await expect(notice).toBeVisible();
  await (await reach(notice.getByRole("button", { name: "View quote" }))).click();
  await expect(preview().getByRole("document", { name: `Quote ${flow.quoteNumber}, revision 1` })).toHaveAttribute("data-state", "ready");
  const modal = (await preview().boundingBox())!;
  expect(modal).toEqual({ x: 0, y: 0, ...PHONE });
  for (const name of ["Accept", "Request changes"]) await reach(preview().getByRole("button", { name }));
  await reach(preview().getByRole("link", { name: "Download" }));
  await reach(preview().getByRole("button", { name: "Close" }));
  await noSideways(dana);
  await shoot(dana, testInfo, "customer-pdf-preview");

  await preview().getByRole("button", { name: "Request changes" }).click();
  const form = preview().getByRole("form", { name: `Request changes to ${flow.quoteNumber} rev 1` });
  await (await reach(form.getByLabel("What should Brandi change?"))).fill(CHANGE_NOTE);
  await reach(form.getByRole("button", { name: "Back" }));
  await noSideways(dana);
  await shoot(dana, testInfo, "customer-request-changes");
  await (await reach(form.getByRole("button", { name: "Review request" }))).click();
  const confirm = dana.getByRole("alertdialog", { name: "Confirm change request" });
  await expect(confirm).toContainText(`Note${CHANGE_NOTE}`);
  await expectConfirm(dana, confirm);
  await shoot(dana, testInfo, "customer-confirm-changes");
  await confirm.getByRole("button", { name: "Send", exact: true }).click();
  await expect(preview().locator(".cx-chip")).toHaveText("Changes requested");
  await (await reach(preview().getByRole("button", { name: "Close" }))).click();
  await expect(preview()).toBeHidden();
  await noSideways(dana);
});

test("Brandi at her desk: edits and sends rev 2 (step 7)", async ({}, testInfo) => {
  await openFromList(flow.quoteNumber);
  await expect(brandi.locator("h1 + *")).toHaveText("Changes requested");
  await reach(brandi.getByText(CHANGE_NOTE));
  const qty = await reach(brandi.getByRole("textbox", { name: "Quantity for HCS-12-13-2G8" }));
  await qty.fill("12");
  await qty.press("Tab");
  await expect(brandi.getByText("All changes saved")).toBeVisible();
  flow.total = (await brandi.getByLabel("Quote totals").getByRole("definition").last().textContent())!.trim();
  await approveAndSend(testInfo, "Hi Dana, 12 boxes of bolts on rev 2. Thanks, Brandi", 2);
});

test("Dana on her phone: opens rev 2 from the Quotes tab and accepts it (step 8)", async ({}, testInfo) => {
  await (await reach(tab("Quotes"))).click();
  await expect(quoteButton().locator(".cx-chip")).toHaveText("Sent");
  await noSideways(dana);
  await (await reach(quoteButton())).click();
  await expect(preview().getByRole("document", { name: `Quote ${flow.quoteNumber}, revision 2` })).toHaveAttribute("data-state", "ready");
  await (await reach(preview().getByRole("button", { name: "Accept" }))).click();
  const form = preview().getByRole("form", { name: `Accept ${flow.quoteNumber} rev 2` });
  const day = await reach(form.getByLabel("Pickup day"));
  await day.fill((await day.getAttribute("min"))!);
  await (await reach(form.getByLabel("Pickup time"))).selectOption({ index: 1 });
  await (await reach(form.getByLabel("PO number"))).fill(PO);
  await reach(form.getByRole("button", { name: "Back" }));
  await noSideways(dana);
  await shoot(dana, testInfo, "customer-accept");
  await (await reach(form.getByRole("button", { name: "Review and accept" }))).click();
  const confirm = dana.getByRole("alertdialog", { name: "Confirm acceptance" });
  await expect(confirm).toContainText(`Accept ${flow.quoteNumber} rev 2 for ${flow.total}, pickup `);
  await expectConfirm(dana, confirm);
  await shoot(dana, testInfo, "customer-confirm-accept");
  await confirm.getByRole("button", { name: "Send", exact: true }).click();
  await expect(preview().locator(".cx-chip")).toHaveText("Accepted");
  await reach(preview().getByRole("group", { name: "Respond to this quote" }).getByText(`You accepted rev 2 with PO ${PO}:`));
  await (await reach(preview().getByRole("button", { name: "Close" }))).click();
  await expect(quoteButton().locator(".cx-chip")).toHaveText("Accepted");
  await noSideways(dana);
});

test("Brandi at her desk: sees it accepted (step 8)", async ({}, testInfo) => {
  await openFromList(flow.quoteNumber);
  await expect(brandi.locator("h1 + *")).toHaveText("Accepted");
  await reach(brandi.getByText(new RegExp(`^Dana accepted rev 2 on .* with PO ${PO}`)));
  await noSideways(brandi);
  await shoot(brandi, testInfo, "rep-accepted");
});
