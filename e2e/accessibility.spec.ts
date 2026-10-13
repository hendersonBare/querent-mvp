import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";

// Appendix H accessibility (plan U11), one pass per role across the pages in Appendix A at 1920x1080:
//   - every icon-only control has a name: each visible button, link, switch, tab and role=button, and
//     every field, has an accessible name (aria-label, aria-labelledby, its text, a label, a title or a
//     labelled image inside), so a control drawn as an icon is never silent;
//   - an opened dropdown and a side sheet take focus, keep Tab inside and give focus back when closed;
//   - the "::" drag handles have a keyboard alternative (Alt+Arrow on a header or lane, plan U0).
// The components' own tests cover the same rules one by one (src/components/ui/primitives.test.tsx,
// DataTable.test.tsx); this checks them on the real pages.

const SEED_DATE = "2026-09-23";
const VIEWPORT = { width: 1920, height: 1080 };
const COOKIE = "querent-persona";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }, testInfo) => {
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    expect((await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } })).status(), "POST /api/test/reset needs QUERENT_E2E_RESET=1").toBe(200);
  } finally {
    await api.dispose();
  }
});

async function as(browser: Browser, testInfo: TestInfo, persona: string | null) {
  const baseURL = String(testInfo.project.use.baseURL);
  const context = await browser.newContext({ viewport: VIEWPORT, baseURL });
  if (persona) await context.addCookies([{ name: COOKIE, value: persona, url: baseURL }]);
  return context.newPage();
}

/** Every visible control on the page with no accessible name, described by its tag, classes and place. */
function unnamed(page: Page) {
  return page.evaluate(() => {
    const SELECTOR = 'button,a[href],[role="button"],[role="switch"],[role="tab"],[role="checkbox"],[role="menuitem"],[role="option"],input:not([type="hidden"]),select,textarea';
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
    const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
    const nameOf = (el: HTMLElement) => {
      const label = el.getAttribute("aria-label")?.trim();
      if (label) return label;
      const by = el.getAttribute("aria-labelledby");
      if (by) { const t = by.split(/\s+/).map((id) => text(document.getElementById(id))).join(" ").trim(); if (t) return t; }
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        const labels = el.labels ? [...el.labels].map(text).join(" ").trim() : "";
        if (labels) return labels;
        if (el instanceof HTMLInputElement && ["button", "submit", "reset"].includes(el.type) && el.value) return el.value;
        if ("placeholder" in el && el.placeholder) return el.placeholder;
      } else {
        const own = text(el);
        if (own) return own;
        const img = el.querySelector('img[alt]:not([alt=""]),svg[aria-label],[role="img"][aria-label]');
        if (img) return img.getAttribute("alt") || img.getAttribute("aria-label");
      }
      return el.getAttribute("title")?.trim() || "";
    };
    return [...document.querySelectorAll<HTMLElement>(SELECTOR)].filter(visible).filter((el) => !nameOf(el))
      .map((el) => `${el.tagName.toLowerCase()}${el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : ""}.${el.className} @${Math.round(el.getBoundingClientRect().x)},${Math.round(el.getBoundingClientRect().y)}`);
  });
}

async function expectNamed(page: Page, where: string) {
  await page.evaluate(() => document.fonts.ready);
  expect(await unnamed(page), `${where}: controls without a name`).toEqual([]);
}

const MANAGER_PAGES = ["/rep/quotes", "/rep/quotes?view=table", "/rep/quotes/Q-24817", "/rep/customers", "/rep/customers/wasatch", "/rep/orders", "/rep/orders/so-51223",
  "/rep/stock", "/rep/stock/HCS-12-13-2G8", "/rep/analytics", "/rep/teams", "/rep/settings", "/rep/settings?tab=floors", "/rep/settings?tab=pricing", "/rep/settings?tab=aging", "/rep/settings?tab=profile"];
const REP_PAGES = ["/rep/quotes", "/rep/customers", "/rep/orders", "/rep/stock", "/rep/analytics", "/rep/settings", "/rep/settings?tab=profile", "/rep/settings?tab=notifications"];

test("visitor: the box and Sign in are named", async ({ browser }, testInfo) => {
  const page = await as(browser, testInfo, null);
  await page.goto("/");
  await expect(page.getByLabel("Ask a question")).toBeVisible();
  await expectNamed(page, "/ (visitor)");
  await page.goto("/demo");
  await expectNamed(page, "/demo");
  await page.context().close();
});

test("customer: the box, the bell, the account chip and both sheets are named; a sheet traps and gives back focus", async ({ browser }, testInfo) => {
  const page = await as(browser, testInfo, "customer");
  await page.goto("/");
  await expect(page.getByLabel("Ask a question")).toBeVisible();
  await expectNamed(page, "/ (customer)");
  const bell = page.getByRole("button", { name: /^Notifications/ });
  await bell.click();
  await expectNamed(page, "/ (customer), bell open");
  await page.keyboard.press("Escape");
  for (const [button, sheet] of [["Orders", "Previous orders"], ["My rep", "Your rep"]] as const) {
    const opener = page.getByRole("button", { name: button, exact: true });
    await opener.focus();
    await opener.press("Enter");
    const dialog = page.getByRole("dialog", { name: sheet });
    await expect(dialog).toBeVisible();
    await expectNamed(page, `/ (customer), ${sheet}`);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((el) => el.contains(document.activeElement)), `${sheet}: Tab ${i + 1} stays inside`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
  await page.context().close();
});

test("manager: every page's controls are named; the caution dropdown traps and gives back focus; a column moves by keyboard", async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  const page = await as(browser, testInfo, "supplier");
  for (const path of MANAGER_PAGES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNamed(page, path);
  }
  await page.goto("/rep/quotes");
  const caution = page.getByRole("button", { name: /^Needs attention/ });
  await caution.focus();
  await caution.press("Enter");
  const panel = page.getByRole("dialog").filter({ hasText: /need your attention/ });
  await expect(panel).toBeVisible();
  await expectNamed(page, "/rep/quotes, caution open");
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await panel.evaluate((el) => el.contains(document.activeElement)), `caution: Tab ${i + 1} stays inside`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(caution).toBeFocused();
  // The "::" handles' keyboard alternative: Alt+Right on the table's first column header moves it one place.
  await page.goto("/rep/quotes?view=table");
  const headers = page.getByRole("columnheader");
  const before = (await headers.allTextContents()).map((t) => t.replace(/::/g, "").trim()).filter(Boolean);
  await headers.first().focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(async () => (await headers.allTextContents()).map((t) => t.replace(/::/g, "").trim()).filter(Boolean).slice(0, 2)).toEqual([before[1], before[0]]);
  await page.keyboard.press("Alt+ArrowLeft");
  await expect.poll(async () => (await headers.allTextContents()).map((t) => t.replace(/::/g, "").trim()).filter(Boolean).slice(0, 2)).toEqual(before.slice(0, 2));
  await page.context().close();
});

test("rep: every page's controls are named", async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  const page = await as(browser, testInfo, "mara");
  for (const path of REP_PAGES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNamed(page, path);
  }
  await page.context().close();
});
