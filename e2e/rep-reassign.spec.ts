import { expect, test, type APIRequest, type Browser, type Page, type TestInfo } from "@playwright/test";

// Reassignment and role-based scope (v3 spec §5, §6 Quotes list and Quote detail, §8; decisions
// 21, 22; tasks D2, U1):
//   - Brandi (the manager) sees every rep's quotes by default (no All reps switch) and opens Mara's
//     quote: a read-only banner, every edit control disabled. She reassigns it to herself and can
//     edit it after; Activity says who moved it.
//   - Brandi ticks two quotes and reassigns them to Eli in bulk; the rep filter shows them as Eli's.
//   - On Teams and Reps (decision 45, plan U7) she selects Mara's row and moves all her open quotes to Nora.
//   - Mara (a rep) can't reassign, ?scope=all does nothing for her, and she sees only her own quotes.
// Mara's session is the demo cookie set directly (her chooser button is walked in e2e/demo-script.spec.ts).
//
// beforeAll resets the database to the seed pinned to the mockup's day (POST /api/test/reset; the
// server needs QUERENT_E2E_RESET=1), then POST /api/test/rep-quotes adds, among others, a fresh
// quote for Canyon Ridge (Mara's customer) and a sent quote and a change request of Brandi's.

const SEED_DATE = "2026-09-23";
const COOKIE = "querent-persona";
type Fixture = { changes_requested: string; sent: string; overdue: string; other_rep: string };
let fixture: Fixture;

test.describe.configure({ mode: "serial" });

async function resetDemo(request: APIRequest, testInfo: TestInfo, withQuotes: boolean) {
  const api = await request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const response = await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } });
    expect(response.status(), "POST /api/test/reset failed: start the server with QUERENT_E2E_RESET=1").toBe(200);
    if (withQuotes) fixture = await (await api.post("/api/test/rep-quotes")).json();
  } finally {
    await api.dispose();
  }
}
test.beforeAll(async ({ playwright }, testInfo) => resetDemo(playwright.request, testInfo, true));
test.afterAll(async ({ playwright }, testInfo) => resetDemo(playwright.request, testInfo, false));

async function signInAsBrandi(page: Page) {
  await page.goto("/demo");
  await page.getByRole("button", { name: /Herrick Industrial Supply/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes$/);
}
async function signInAsMara(browser: Browser, testInfo: TestInfo) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: COOKIE, value: "mara", url: String(testInfo.project.use.baseURL) }]);
  return context.newPage();
}
const quoteRow = (page: Page, number: string) =>
  page.getByRole("table").getByRole("rowgroup").filter({ has: page.getByRole("link", { name: number, exact: true }) });
async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

test("Brandi opens Mara's quote read-only, reassigns it to herself, and can edit it after", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsBrandi(page);
  // Her list is the whole organization by default: no switch, and Mara's quote shows with its rep.
  await expect(page.getByRole("navigation", { name: "Whose quotes" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Rep" })).toBeVisible();
  await expect(quoteRow(page, fixture.other_rep)).toContainText("Mara Jensen");
  await screenshot(page, testInfo, "all-reps");

  await quoteRow(page, fixture.other_rep).getByRole("link", { name: fixture.other_rep, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/rep/quotes/${fixture.other_rep}$`));
  const banner = page.getByRole("region", { name: "Read only" });
  await expect(banner).toHaveText(/Read only: Mara Jensen’s quote\. Reassign it to edit\./);
  for (const name of ["Save draft", "Approve & send"]) await expect(page.getByRole("button", { name })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Unit price for GLV-N8-L-1000" })).toBeDisabled();
  await screenshot(page, testInfo, "read-only");

  await banner.getByRole("button", { name: "Reassign…" }).click();
  const dialog = page.getByRole("dialog", { name: `Reassign ${fixture.other_rep}` });
  await expect(dialog.getByRole("combobox", { name: "New rep" })).toHaveValue("brandi");
  await dialog.getByRole("button", { name: "Reassign" }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve & send" })).toBeEnabled();

  // Hers now: she edits a price, and it saves.
  const price = page.getByRole("textbox", { name: "Unit price for GLV-N8-L-1000" });
  await price.fill("84");
  await price.press("Tab");
  await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
  const activity = page.getByRole("group", { name: "Activity" });
  await activity.locator("summary").click();
  const entries = activity.getByRole("list", { name: "Activity, newest first" }).getByRole("listitem");
  // Newest first: her price change, then the move.
  await expect(entries.nth(0)).toContainText("Brandi changed Nitrile disposable gloves");
  await expect(entries.nth(1)).toContainText(`Brandi Gallegos reassigned ${fixture.other_rep} from Mara Jensen to Brandi Gallegos`);
  await screenshot(page, testInfo, "reassigned-to-brandi");

  // Her own quotes (the Rep filter) list it now.
  await page.goto("/rep/quotes?rep=brandi");
  await expect(quoteRow(page, fixture.other_rep)).toHaveCount(1);
  await expect(quoteRow(page, fixture.other_rep)).toContainText("Brandi Gallegos");
});

test("Brandi reassigns two quotes to Eli in bulk from her Quotes list", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsBrandi(page);
  await page.getByRole("checkbox", { name: `Select ${fixture.sent}` }).check();
  await page.getByRole("checkbox", { name: `Select ${fixture.changes_requested}` }).check();
  const bar = page.getByRole("region", { name: "Selected quotes" });
  await expect(bar).toContainText("2 selected");
  await bar.getByRole("button", { name: "Reassign…" }).click();
  const dialog = page.getByRole("dialog", { name: "Reassign 2 quotes" });
  await dialog.getByRole("combobox", { name: "New rep" }).selectOption("eli");
  await screenshot(page, testInfo, "bulk-dialog");
  await dialog.getByRole("button", { name: "Reassign" }).click();
  await expect(page.getByRole("status", { name: "Reassignment" })).toHaveText("Reassigned 2 quotes to Eli Porter.");
  await expect(quoteRow(page, fixture.sent)).toContainText("Eli Porter");

  await page.getByRole("combobox", { name: "Rep" }).selectOption("eli");
  await expect(page).toHaveURL(/rep=eli/);
  // Eli's own demo book (task F1) and the two just moved.
  for (const number of [fixture.sent, fixture.changes_requested]) await expect(quoteRow(page, number)).toContainText("Eli Porter");
  await expect(page.getByRole("table").getByRole("rowheader").filter({ hasText: /Q-\d+/ })).not.toHaveCount(0);
  expect(await page.getByRole("table").getByRole("rowgroup").filter({ hasText: "Mara Jensen" }).count()).toBe(0);
  await screenshot(page, testInfo, "filtered-eli");
  // No phone check: the portal has no phone layout (decision 43, plan U2).
});

test("Brandi selects Mara on Teams and Reps and reassigns all her open quotes to Nora in bulk (decision 45)", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await signInAsBrandi(page);
  await page.goto("/rep/teams");
  const board = async () => page.evaluate(async () => (await fetch("/api/rep/teams")).json());
  const open: { quote_number: string }[] = (await board()).reps.find((r: { id: string }) => r.id === "mara").open_quotes;
  expect(open.length).toBeGreaterThan(0);
  // A row is selected by clicking it (no frame draws the selection: the minimum, listed under "No frame").
  const reps = page.getByRole("region", { name: "Reps" });
  const mara = reps.getByRole("row").filter({ has: page.getByText("Mara Jensen", { exact: true }) }).first();
  await mara.getByText("Mara Jensen", { exact: true }).click();
  await expect(mara).toHaveAttribute("aria-selected", "true");
  const bar = page.getByRole("region", { name: "Selected reps" });
  await expect(bar).toContainText("Mara Jensen");
  await bar.getByRole("button", { name: "Reassign open quotes" }).click();
  const dialog = page.getByRole("dialog", { name: open.length === 1 ? `Reassign ${open[0].quote_number}` : `Reassign ${open.length} quotes` });
  await expect(dialog.getByRole("combobox", { name: "New rep" }).locator("option")).not.toContainText(["Mara Jensen"]);
  await dialog.getByRole("combobox", { name: "New rep" }).selectOption("nora");
  await screenshot(page, testInfo, "teams-bulk-dialog");
  await dialog.getByRole("button", { name: "Reassign" }).click();
  await expect(dialog).toHaveCount(0);
  expect((await board()).reps.find((r: { id: string }) => r.id === "mara").open_quotes).toEqual([]);
  // Each move writes an Activity row: who, from and to (decision 21); the first owner is kept.
  for (const { quote_number: number } of open) {
    const detail = await page.evaluate(async (n) => (await fetch(`/api/rep/quotes/${n}`)).json(), number);
    expect(detail.quote).toMatchObject({ rep_id: "nora", original_rep_id: "mara" });
    expect(JSON.stringify(detail)).toContain(`Brandi Gallegos reassigned ${number} from Mara Jensen to Nora Chen`);
  }
});

test("Mara (a rep) can't reassign, ?scope=all does nothing for her, and she sees only her own quotes", async ({ browser }, testInfo) => {
  const page = await signInAsMara(browser, testInfo);
  const api = page.request;
  const scoped = await api.get("/api/rep/quotes?scope=all");
  expect(scoped.status()).toBe(200);
  const list = await scoped.json();
  expect(list).toMatchObject({ scope: "mine", manager: null });
  expect(list.rows.every((row: { rep_id: string }) => row.rep_id === "mara")).toBe(true);
  expect((await api.post("/api/rep/quotes/reassign", { data: { quoteIds: ["Q-24817"], toRepId: "mara" } })).status()).toBe(403);
  expect((await api.put("/api/rep/settings/assignments", { data: { customer_id: "wasatch", rep_id: "mara" } })).status()).toBe(403);

  await page.goto("/rep/quotes?scope=all");
  await expect(page.getByRole("heading", { name: "Quotes", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Whose quotes" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Rep" })).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(quoteRow(page, "Q-24817")).toHaveCount(0);

  // Brandi's quote is not found for her, and Teams and Reps (where customers and quotes are reassigned, plan U7) is not hers.
  await page.goto("/rep/quotes/Q-24817");
  await expect(page.getByRole("button", { name: "Approve & send" })).toHaveCount(0);
  await page.goto("/rep/teams");
  await expect(page).toHaveURL(/\/rep\/quotes$/);
  expect((await api.get("/api/rep/teams")).status()).toBe(403);
  await screenshot(page, testInfo, "mara-no-teams");
  await page.context().close();
});
