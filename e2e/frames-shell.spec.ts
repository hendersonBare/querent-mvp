import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { FONT_USER_AGENT, FRAME_SIZE, STYLE_PROPS, diffMeasures, measureAll, openFrame, startFrameServer } from "../scripts/frames/lib.mjs";

// Frame proof for plan U2 (the shell), at 1920x1080 against the frames (drawn at 1440x900):
//   - the rail as every page frame draws it: C_QOBoard for the manager (querent-persona=supplier) and
//     C_RQBoard for a rep (querent-persona=mara); 216px wide, sticky at the top after scrolling, the
//     page area taking the rest of the width; on every rep route; and (U11) against a frame of every
//     other page family, since the frames disagree on the nav label (one explained difference);
//   - C_QOB3 (caution dropdown open) and C_QOB4 (bell dropdown open), scoped to the header controls;
//   - C_QOB9 (Sign out asks first), then Sign out ends the session and returns to /.
// Also the route renames (decision 46): the old paths answer 308 with the query kept.
// Every style value comes from the frames' live DOM (scripts/frames/lib.mjs); nothing is typed by hand.
// The only text differences allowed are the frames' placeholder names (Appendix G) and the dropdowns'
// real rows, each mapped and explained below.

const COOKIE = "querent-persona";
const APP_SIZE = { width: 1920, height: 1080 };
const SEED_DATE = "2026-09-23";

type Measure = { path: number; tag: string; text: string; rect: { x: number; y: number; w: number; h: number }; style: Record<string, string> };

let frames: { base: string; close: () => void };
let framePage: Page;
const contexts: BrowserContext[] = [];

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }, testInfo) => {
  frames = await startFrameServer();
  // Same user agent as next/font, so both sides render byte-identical font files (scripts/frames/lib.mjs).
  framePage = await (await browser.newContext({ viewport: FRAME_SIZE, userAgent: FONT_USER_AGENT })).newPage();
  const context = await browser.newContext();
  const response = await context.request.post(`${testInfo.project.use.baseURL}/api/test/reset`, { data: { seed_date: SEED_DATE } });
  expect(response.status(), "POST /api/test/reset needs QUERENT_E2E_RESET=1 on the server").toBe(200);
  await context.close();
});
test.afterAll(async () => {
  for (const context of contexts) await context.close();
  frames.close();
});

/** A 1920x1080 page signed in as `persona` (the cookie goes on the whole site, so the shell's badge poll keeps the session). */
async function appAs(browser: Browser, testInfo: TestInfo, persona: string, path = "/rep/quotes") {
  const baseURL = String(testInfo.project.use.baseURL);
  const context = await browser.newContext({ viewport: APP_SIZE, baseURL });
  contexts.push(context);
  await context.addCookies([{ name: COOKIE, value: persona, url: baseURL }]);
  const page = await context.newPage();
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  // Hover is a state the frames do not draw: keep the pointer on the page's empty corner.
  await page.mouse.move(1919, 1079);
  return page;
}
const frame = (id: string) => openFrame(framePage, frames.base, id);

/** measureAll over the first element matching `selector`. */
async function measure(page: Page, selector: string): Promise<Measure[]> {
  expect(await page.locator(selector).count(), `${selector} not found`).toBeGreaterThan(0);
  await page.evaluate((sel) => {
    document.querySelectorAll("[data-m]").forEach((e) => e.removeAttribute("data-m"));
    document.querySelector(sel)!.setAttribute("data-m", "root");
  }, selector);
  return page.evaluate(measureAll, { root: '[data-m="root"]', props: STYLE_PROPS });
}

/** Computed STYLE_PROPS plus size of one element. */
async function styleOf(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el, props) => {
    const cs = getComputedStyle(el) as unknown as Record<string, string>;
    const r = el.getBoundingClientRect();
    return { style: Object.fromEntries(props.map((p) => [p, cs[p]])), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
  }, [...STYLE_PROPS, "position", "zIndex", "overflow", "boxSizing"]);
}
/** A difference with its reason (PR table): it must be exactly this frame value and this app value. */
type Explained = Record<string, { frame: string; app: string; why: string }>;
async function sameStyle(name: string, frameSel: string, appPage: Page, appSel: string, { size = true, explained = {} as Explained } = {}) {
  const f = await styleOf(framePage, frameSel);
  const a = await styleOf(appPage, appSel);
  const diffs: Record<string, { frame: unknown; app: unknown }> = {};
  for (const [k, v] of Object.entries(f.style)) {
    if (a.style[k] === v) continue;
    const ok = explained[k];
    if (ok && ok.frame === v && ok.app === a.style[k]) continue;
    diffs[k] = { frame: v, app: a.style[k] };
  }
  if (size && f.w !== a.w) diffs.width = { frame: f.w, app: a.w };
  if (size && f.h !== a.h) diffs.height = { frame: f.h, app: a.h };
  expect(diffs, `${name}: computed styles differ from the frame`).toEqual({});
}

/** Rewrites text on one side (placeholder names, real rows), so elements pair up; returns what was rewritten. */
const rewrite = (list: Measure[], map: (m: Measure) => string) => list.map((m) => (m.text ? { ...m, text: map(m) } : m));

/** Both directions: nothing the frame draws is missing or styled differently, and the app adds no text or control the frame lacks. */
function expectSame(name: string, frameList: Measure[], appList: Measure[], { width = false, explained = (_d: Record<string, unknown>) => false } = {}) {
  const forward = diffMeasures(frameList, appList, { width });
  expect(forward.missing, `${name}: elements of the frame missing from the app`).toEqual([]);
  expect(forward.diffs.filter((d: Record<string, unknown>) => !explained(d)), `${name}: style differences`).toEqual([]);
  const backward = diffMeasures(appList, frameList);
  expect(backward.missing, `${name}: text or controls the app adds that the frame lacks`).toEqual([]);
  // Text-less controls (icons, buttons) too: same count of each kind.
  const kinds = (list: Measure[]) => list.filter((m) => ["svg", "button", "a", "input", "select"].includes(m.tag)).map((m) => m.tag).sort();
  expect(kinds(appList), `${name}: icons and controls`).toEqual(kinds(frameList));
  return forward.matched;
}

// ---- The rail ----

const NAV_LABELS = ["Quotes", "Customers", "Orders", "Stock", "Analytics", "My Analytics", "Teams and Reps", "Settings"];
/**
 * The one explained difference against the 22 Quotes frames (U11): they wrap each nav label's text in
 * a second, inline span; the rail draws one block span, as the other 61 page frames do (checked below).
 * Exactly display inline (frame) and block (app) on a nav label, nothing else, not even its height.
 */
const quotesFrameNavLabel = (d: Record<string, unknown>) => {
  const { element, ...rest } = d as { element: string; display?: { frame: string; app: string } };
  return NAV_LABELS.some((l) => element === `span "${l}"`) && Object.keys(rest).length === 1 && rest.display?.frame === "inline" && rest.display.app === "block";
};

const RAIL = "aside";
/** The frames' user block names are placeholders (Appendix G): Brian G. (manager) and Brandi G. (rep), BG. */
const PLACEHOLDER = {
  supplier: { "Brandi G.": "Brian G." } as Record<string, string>,
  mara: { "Mara J.": "Brandi G.", MJ: "BG" } as Record<string, string>,
};

async function expectRailGeometry(page: Page) {
  const box = await page.evaluate(() => {
    const aside = document.querySelector("aside")!, inner = aside.firstElementChild!, main = document.querySelector("main")!;
    const r = aside.getBoundingClientRect(), i = inner.getBoundingClientRect(), m = main.getBoundingClientRect();
    return { asideW: r.width, asideX: r.x, innerTop: i.top, innerH: i.height, mainX: m.x, mainW: m.width, vw: document.documentElement.clientWidth, vh: window.innerHeight };
  });
  const frameW = await framePage.locator(RAIL).evaluate((el) => el.getBoundingClientRect().width);
  expect(box.asideW).toBe(frameW);
  expect(box.asideW).toBe(216);
  expect(box.asideX).toBe(0);
  expect(box.innerTop).toBe(0);
  expect(box.innerH).toBe(box.vh);
  // The page area takes every pixel the rail leaves (decision 51: fluid, no max-width).
  expect(box.mainX).toBe(216);
  expect(box.mainW).toBe(box.vw - 216);
}

test("rail, manager (C_QOBoard): every element and style, 216px, sticky, the page area fills the rest", async ({ browser }, testInfo) => {
  await frame("QOBoard");
  const page = await appAs(browser, testInfo, "supplier");
  expectSame("C_QOBoard rail", await measure(framePage, RAIL), rewrite(await measure(page, RAIL), (m) => PLACEHOLDER.supplier[m.text] ?? m.text), { explained: quotesFrameNavLabel });
  await expectRailGeometry(page);
  // The active item is Quotes, the accent green with white bold text, as drawn.
  await expect(page.locator("aside nav a[aria-current=page]")).toHaveText("Quotes");

  // Sticky: on a long page scrolled to the bottom the rail is still at the top, one viewport tall.
  await page.goto("/rep/stock");
  // Stock shows about one screen of items first (plan U5, C_STBase); the whole catalog makes a long page.
  await page.getByRole("button", { name: /^Show \d+ more items$/ }).click();
  const tall = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(tall).toBeGreaterThan(APP_SIZE.height * 1.5);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(APP_SIZE.height / 2);
  await expectRailGeometry(page);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeInViewport();
});

test("rail, rep (C_RQBoard): My Analytics, no Teams and Reps, role Rep; 216px and sticky", async ({ browser }, testInfo) => {
  await frame("RQBoard");
  const page = await appAs(browser, testInfo, "mara");
  expectSame("C_RQBoard rail", await measure(framePage, RAIL), rewrite(await measure(page, RAIL), (m) => PLACEHOLDER.mara[m.text] ?? m.text), { explained: quotesFrameNavLabel });
  await expectRailGeometry(page);
  await expect(page.getByRole("navigation", { name: "Rep portal" }).getByRole("link")).toHaveText(["Quotes", "Customers", "Orders", "Stock", "My Analytics", "Settings"]);
});

// U11: the frames disagree on the nav label. 61 of the 83 page frames (every one but the 22 Quotes
// frames) draw it as one block span inside the link; the Quotes frames wrap the text in a second,
// inline span. The rail follows the majority. Here it is diffed, every element both ways, against a
// majority frame of each page family, on the route whose nav item the frame draws active.
const RAIL_FRAMES: [frame: string, persona: "supplier" | "mara", route: string, active: string][] = [
  ["ANBase", "supplier", "/rep/analytics", "Analytics"],
  ["CUBase", "supplier", "/rep/customers", "Customers"],
  ["ORBase", "supplier", "/rep/orders", "Orders"],
  ["STBase", "supplier", "/rep/stock", "Stock"],
  ["QEBase", "supplier", "/rep/quotes/Q-24817", "Quotes"],
  ["TRBase", "supplier", "/rep/teams", "Teams and Reps"],
  ["S1", "supplier", "/rep/settings", "Settings"],
  ["RAN1", "mara", "/rep/analytics", "My Analytics"],
  ["RCUBase", "mara", "/rep/customers", "Customers"],
  ["RS1", "mara", "/rep/settings", "Settings"],
];
test("rail on the other page frames (U11): the nav label as most frames draw it, every element both ways", async ({ browser }, testInfo) => {
  for (const [id, persona, route, active] of RAIL_FRAMES) {
    await frame(id);
    const page = await appAs(browser, testInfo, persona, route);
    await expect(page.locator("aside nav a[aria-current=page]"), id).toHaveText(active);
    expectSame(`C_${id} rail`, await measure(framePage, RAIL), rewrite(await measure(page, RAIL), (m) => PLACEHOLDER[persona][m.text] ?? m.text));
    await expectRailGeometry(page);
    await page.context().close();
  }
});

// ---- Every rep route renders in the shell ----

const MANAGER_ROUTES = ["/rep/quotes", "/rep/quotes/Q-24817", "/rep/customers", "/rep/customers/wasatch", "/rep/orders", "/rep/stock", "/rep/stock/HCS-12-13-2G8",
  "/rep/analytics", "/rep/teams", "/rep/settings", "/rep/quotes/Q-NOPE", "/rep/stock/NOPE-1"];
const REP_ROUTES = ["/rep/quotes", "/rep/customers", "/rep/orders", "/rep/stock", "/rep/analytics", "/rep/settings"];
/** Pages whose own header has a search box (C_CUBase "Search customers", C_STBase "Search SKU or item name"; the manager's Settings, C_S1 "Search customers", plan U8). */
const PAGE_SEARCH = { supplier: ["/rep/customers", "/rep/stock", "/rep/settings"], mara: ["/rep/customers", "/rep/stock"] } as const;

test("every rep route: the rail (216px) and the page header's title, caution and bell", async ({ browser }, testInfo) => {
  for (const [persona, routes] of [["supplier", MANAGER_ROUTES], ["mara", REP_ROUTES]] as const) {
    const page = await appAs(browser, testInfo, persona);
    for (const route of routes) {
      await page.goto(route);
      await expect(page, route).toHaveURL(new RegExp(`${route.replace(/[?]/g, "\\?")}$`));
      expect(await page.locator("aside").first().evaluate((el) => el.getBoundingClientRect().width), route).toBe(216);
      await expect(page.getByRole("heading", { level: 1 }), route).toHaveCount(1);
      await expect(page.getByRole("button", { name: /^Needs attention/ }), route).toHaveCount(1);
      await expect(page.getByRole("button", { name: /^Notifications/ }), route).toHaveCount(1);
      // No global search: the only search boxes are the page's own (plan U5: C_CUBase, C_STBase), in its header.
      await expect(page.locator("aside").getByRole("searchbox"), route).toHaveCount(0);
      const searched = (PAGE_SEARCH[persona] as readonly string[]).includes(route);
      await expect(page.getByRole("searchbox"), route).toHaveCount(searched ? 1 : 0);
      if (searched) await expect(page.locator("main header").getByRole("searchbox"), route).toHaveCount(1);
      await expect(page.getByText("Switch workspace"), route).toHaveCount(0);
    }
  }
  // A rep has no Teams and Reps page.
  const mara = await appAs(browser, testInfo, "mara", "/rep/teams");
  await expect(mara).toHaveURL(/\/rep\/quotes$/);
});

test("route renames (decision 46): the old paths answer 308 with the query kept", async ({ browser }, testInfo) => {
  const page = await appAs(browser, testInfo, "supplier");
  for (const [from, to] of [
    ["/rep/items", "/rep/stock"],
    ["/rep/items?category=fasteners", "/rep/stock?category=fasteners"],
    ["/rep/items/HCS-12-13-2G8?customer=wasatch", "/rep/stock/HCS-12-13-2G8?customer=wasatch"],
    ["/rep/team", "/rep/teams"],
  ]) {
    const response = await page.request.get(from, { maxRedirects: 0 });
    expect(response.status(), from).toBe(308);
    expect(response.headers().location, from).toBe(to);
  }
  await page.goto("/rep/items/HCS-12-13-2G8");
  await expect(page).toHaveURL(/\/rep\/stock\/HCS-12-13-2G8$/);
  await expect(page.locator("aside nav a[aria-current=page]")).toHaveText("Stock");
});

// ---- The header dropdowns ----

const CAUTION = 'button[aria-label^="Needs attention"]';
const BELL = 'button[aria-label^="Notifications"]';
const FRAME_PANEL = 'div[style*="width: 360px"]';
const APP_PANEL = '[data-ui="dropdown-panel"]';
const ALERTS = "header > div:last-child"; // the wrapper of the two buttons, at the far right of the header row

/** A dropdown row's text is real data, the frame's is a sample (Appendix G): pair them by their place in the row. */
const byPlace = (m: Measure) => `${m.tag}@${m.path}`;

/** "Oct 6" (UTC days, like every date in the app). */
const monDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * C_QOB3's row lines, one sentence pattern per status, as its three samples word them: "Dana Ortiz asked to
 * move pickup to Ogden.", "Draft has 1 line below the margin floor.", "Sent Oct 6, no reply yet."
 */
const CAUTION_LINES = {
  changes_requested: /^(.+) asked to .+[.…]$/,
  ready_for_review: /^Draft has \d+ lines? below the margin floor\.$/,
  sent: /^Sent [A-Z][a-z]{2} \d{1,2}, no reply yet\.$/,
};
/** No frame (docs/plans/status.md): a draft that is only waiting, with no line below the floor. */
const DRAFT_WAITING = /^Requested [A-Z][a-z]{2} \d{1,2}, not sent yet\.$/;
/**
 * C_QOB4's row titles, as its three samples word them: "Dana Ortiz replied on Q-24790" (the contact),
 * "Q-24763 accepted by Canyon Ridge" (the customer: the app prints its full name, decision 59), "Q-24815 expired"; and its times: "Oct 9, 4:12 PM", or
 * the day only for an expired quote ("Sep 18").
 */
const BELL_TITLES = { replied: /^(.+) replied on (Q-\d+)$/, accepted: /^(Q-\d+) accepted by (.+)$/, expired: /^(Q-\d+) expired$/ };
const BELL_TIME = /^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} (AM|PM)$/;
const BELL_DAY = /^[A-Z][a-z]{2} \d{1,2}$/;

/** Where the panel sits: 50px below the buttons' top, its right edge on the given button's right edge. */
async function panelPlace(page: Page, anchor: string, panel: string) {
  return page.evaluate(({ anchor, panel }) => {
    const a = document.querySelector(anchor)!.getBoundingClientRect(), p = document.querySelector(panel)!.getBoundingClientRect();
    const bell = document.querySelector('button[aria-label^="Notifications"]')!.getBoundingClientRect();
    return { top: Math.round(p.top - a.top), rightFromBell: Math.round(bell.right - p.right), width: p.width };
  }, { anchor, panel });
}

test("header controls closed (C_QOBoard): caution with the #E8A8A0 border, bell, 10px apart at the far right", async ({ browser }, testInfo) => {
  await frame("QOBoard");
  const page = await appAs(browser, testInfo, "supplier");
  await sameStyle("caution", CAUTION, page, CAUTION);
  await sameStyle("bell", BELL, page, BELL);
  await sameStyle("caution icon", `${CAUTION} svg`, page, `${CAUTION} svg`);
  await sameStyle("bell icon", `${BELL} svg`, page, `${BELL} svg`);
  await sameStyle("buttons wrapper", 'div:has(> button[aria-label^="Needs attention"])', page, 'div:has(> div > button[aria-label^="Needs attention"])', { size: false });
  expect((await styleOf(page, CAUTION)).style.borderTopColor).toBe("rgb(232, 168, 160)"); // decision 54
  // At the far right of the page area, 32px in, as drawn.
  const right = await page.locator(BELL).evaluate((el) => window.innerWidth - el.getBoundingClientRect().right);
  const frameRight = await framePage.locator(BELL).evaluate((el) => window.innerWidth - el.getBoundingClientRect().right);
  expect(right).toBe(frameRight);
  await expect(page.locator(CAUTION)).toHaveAttribute("aria-label", /^Needs attention, \d+ items?$/);
  await expect(page.locator(BELL)).toHaveAttribute("aria-label", "Notifications");
});

test("caution open (C_QOB3): the Needs attention dropdown, without navigating", async ({ browser }, testInfo) => {
  await frame("QOB3");
  const page = await appAs(browser, testInfo, "supplier");
  const before = page.url();
  const served = await page.evaluate(() => fetch("/api/rep/badges").then((r) => r.json()));
  expect(served.caution.length).toBeGreaterThanOrEqual(3);
  await page.locator(CAUTION).click();
  await page.mouse.move(1919, 1079);
  await expect(page.locator(APP_PANEL)).toBeVisible();
  expect(page.url()).toBe(before);
  await sameStyle("caution, open", CAUTION, page, CAUTION);
  await expect(page.locator(CAUTION)).toHaveAttribute("aria-label", "Needs attention, open");
  await sameStyle("panel", FRAME_PANEL, page, APP_PANEL, { size: false });
  expect(await panelPlace(page, CAUTION, APP_PANEL)).toEqual(await panelPlace(framePage, CAUTION, FRAME_PANEL));

  // The heading's wording, then each row's structure and styles, by place (the rows are real data).
  const head = await page.locator(`${APP_PANEL} > div`).first().textContent();
  expect(head).toBe(`${served.caution.length} need your attention`);
  const f = await measure(framePage, FRAME_PANEL);
  const a = await measure(page, APP_PANEL);
  const shown = a.filter((m) => m.text);
  expect(shown.map((m) => m.text)).toEqual([head, ...served.caution.flatMap((c: { label: string; tag: string; line: string }) => [c.label, c.tag, c.line])]);
  const rows = (f.filter((m) => m.text).length - 1) / 3;
  const appFirstRows = a.slice(0, 2 + rows * 4); // the panel, its head, then per row: the row box, title, tag, line
  expectSame("C_QOB3 panel", rewrite(f, byPlace), rewrite(appFirstRows, byPlace));
  for (const tag of shown.filter((m) => m.text === "Overdue" || m.text === "Aging")) expect(tag.style.color).toBe("rgb(201, 42, 28)");

  // The wording: the frame samples one row of each pattern, and every app row follows the pattern for its
  // quote's status, filled from that quote's data (the Needs attention list's rows).
  const frameLines = f.filter((m) => m.text).map((m) => m.text).filter((_, i) => i > 0 && i % 3 === 0);
  expect(frameLines.map((line) => Object.entries(CAUTION_LINES).find(([, re]) => re.test(line))?.[0])).toEqual(["changes_requested", "ready_for_review", "sent"]);
  const list = await page.evaluate(() => fetch("/api/rep/quotes?attention=1").then((r) => r.json()));
  type Row = { quote_number: string; status: keyof typeof CAUTION_LINES; sent_at: string | null; below_floor_count: number; change_request: { by: string | null } | null; customer_name: string };
  const rowOf = new Map<string, Row>(list.rows.map((r: Row) => [r.quote_number, r]));
  const patterns = new Set<string>();
  for (const c of served.caution as { quote_number: string; line: string }[]) {
    const row = rowOf.get(c.quote_number)!;
    expect(row, c.quote_number).toBeTruthy();
    if (row.status === "changes_requested") {
      expect(c.line, c.quote_number).toMatch(CAUTION_LINES.changes_requested);
      expect(c.line, c.quote_number).toMatch(new RegExp(`^${escapeRe(row.change_request?.by ?? "")} asked to `));
    } else if (row.status === "ready_for_review") {
      const n = row.below_floor_count;
      if (n > 0) expect(c.line, c.quote_number).toBe(`Draft has ${n} ${n === 1 ? "line" : "lines"} below the margin floor.`);
      else expect(c.line, c.quote_number).toMatch(DRAFT_WAITING);
      if (n === 0) continue;
    } else expect(c.line, c.quote_number).toBe(`Sent ${monDay(row.sent_at!)}, no reply yet.`);
    patterns.add(row.status);
  }
  // The seeded data shows every pattern the frame draws.
  expect([...patterns].sort()).toEqual(Object.keys(CAUTION_LINES).sort());
  // Each line is one row tall, as each of the frame's is (a long change request is trimmed to fit).
  const lineHeight = (list: Measure[]) => list.filter((m) => m.text).filter((_, i) => i > 0 && i % 3 === 0).map((m) => m.rect.h);
  const frameRow = lineHeight(f)[0]!;
  expect(lineHeight(f).every((h) => h === frameRow)).toBe(true);
  expect(lineHeight(a).filter((h) => h !== frameRow)).toEqual([]);
  await testInfo.attach("C_QOB3 text: frame sample vs app data", { body: JSON.stringify({ frame: f.filter((m) => m.text).map((m) => m.text), app: shown.map((m) => m.text) }, null, 1), contentType: "application/json" });

  // Choosing a row opens that quote (no frame: decision 50, status.md).
  await page.getByRole("dialog", { name: head! }).getByRole("button").first().click();
  await expect(page).toHaveURL(new RegExp(`/rep/quotes/${served.caution[0].quote_number}$`));
});

test("bell open (C_QOB4): the reader's notifications, without navigating", async ({ browser }, testInfo) => {
  await frame("QOB4");
  const page = await appAs(browser, testInfo, "supplier");
  const dana = await appAs(browser, testInfo, "customer", "/");
  // Four customer events on Brandi's quotes (real data; the frame's rows are samples): a reply, an acceptance
  // and two declines.
  const made: string[] = [];
  for (let i = 0; i < 4; i++) {
    made.push(await page.evaluate(async () => {
      const copy = await fetch("/api/rep/quotes/Q-24816/duplicate", { method: "POST" }).then((r) => r.json());
      const detail = await fetch(`/api/rep/quotes/${copy.quote_number}`).then((r) => r.json());
      const { total, revision } = detail.send_check;
      const sent = await fetch(`/api/rep/quotes/${copy.quote_number}/send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "", attach_pdf: true, revision, total }) });
      if (!sent.ok) throw new Error(`send ${sent.status}`);
      return copy.quote_number as string;
    }));
  }
  const answer = (action: string, number: string, body: unknown) => dana.evaluate(async ({ action, number, body }) =>
    (await fetch(`/api/query/customer/quotes/${number}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).status, { action, number, body });
  expect(await answer("request-changes", made[0]!, { revision: 1, note: "Make it 12 boxes." })).toBe(200);
  expect(await answer("decline", made[1]!, { revision: 1, reason: "price_too_high" })).toBe(200);
  expect(await answer("decline", made[2]!, { revision: 1, reason: null })).toBe(200);
  expect(await answer("accept", made[3]!, { revision: 1, day: nextWeekday(), time: "10:00", po: "E2E-4410" })).toBe(200);

  await page.reload();
  await page.mouse.move(1919, 1079);
  const served = await page.evaluate(() => fetch("/api/rep/badges").then((r) => r.json()));
  // Q-24817's request was read when an earlier test opened it, so these four are the unread ones. The reply
  // names the contact and the acceptance the customer by its full name (decision 59); declines name the contact (decision 58).
  expect(served.bell.map((b: { label: string }) => b.label)).toEqual([
    `${made[3]} accepted by Wasatch Mechanical Contractors`, `${made[2]} declined by Dana Ortiz`, `${made[1]} declined by Dana Ortiz`, `Dana Ortiz replied on ${made[0]}`]);
  const before = page.url();
  await page.locator(BELL).click();
  await page.mouse.move(1919, 1079);
  await expect(page.locator(APP_PANEL)).toBeVisible();
  expect(page.url()).toBe(before);
  await sameStyle("bell, open", BELL, page, BELL);
  await expect(page.locator(BELL)).toHaveAttribute("aria-label", "Notifications, open");
  await sameStyle("panel", FRAME_PANEL, page, APP_PANEL, { size: false });
  expect(await panelPlace(page, BELL, APP_PANEL)).toEqual(await panelPlace(framePage, BELL, FRAME_PANEL));

  const f = await measure(framePage, FRAME_PANEL);
  const a = await measure(page, APP_PANEL);
  const shown = a.filter((m) => m.text).map((m) => m.text);
  expect(shown[0]).toBe("Notifications");
  expect(shown.filter((_, i) => i % 2 === 1)).toEqual(served.bell.map((b: { label: string }) => b.label));
  for (const when of shown.filter((_, i) => i > 0 && i % 2 === 0)) expect(when).toMatch(BELL_TIME);
  // The frame's samples follow these patterns, and the app's reply and acceptance rows fill them the same way:
  // the contact who replied, the customer who accepted, by its full name (decision 59).
  const frameShown = f.filter((m) => m.text).map((m) => m.text);
  expect(frameShown[1]).toMatch(BELL_TITLES.replied);
  expect(frameShown[3]).toMatch(BELL_TITLES.accepted);
  expect(frameShown[5]).toMatch(BELL_TITLES.expired);
  expect([frameShown[2], frameShown[4]]).toEqual([expect.stringMatching(BELL_TIME), expect.stringMatching(BELL_TIME)]);
  expect(frameShown[6]).toMatch(BELL_DAY);
  expect(shown).toContain(`Dana Ortiz replied on ${made[0]}`);
  expect(shown.find((t) => BELL_TITLES.accepted.test(t))?.match(BELL_TITLES.accepted)?.[2]).toBe("Wasatch Mechanical Contractors");
  // Each of the frame's titles is one row tall, and so is each app title: "accepted by" with the longest seeded
  // customer name (decision 59: the full name) stays on one line, ends with an ellipsis at the panel edge, and
  // carries the full text as its tooltip (decision 60).
  const titles = (list: Measure[]) => list.filter((m) => m.text).filter((_, i) => i % 2 === 1);
  const frameTitle = titles(f)[0]!.rect.h;
  expect(frameTitle).toBe(17);
  expect(titles(f).every((m) => m.rect.h === frameTitle)).toBe(true);
  expect(titles(a).filter((m) => m.rect.h !== frameTitle).map((m) => [m.text, m.rect.h])).toEqual([]);
  const long = page.locator(APP_PANEL).getByText(`${made[3]} accepted by Wasatch Mechanical Contractors`, { exact: true });
  await expect(long).toHaveAttribute("title", `${made[3]} accepted by Wasatch Mechanical Contractors`);
  const cut = await long.evaluate((el) => ({ h: el.getBoundingClientRect().height, clipped: el.scrollWidth > el.clientWidth, ...(({ whiteSpace, overflow, textOverflow }) => ({ whiteSpace, overflow, textOverflow }))(getComputedStyle(el)) }));
  expect(cut).toEqual({ h: frameTitle, clipped: true, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
  // The frame's heading is literal; rows pair by place (real data, Appendix G "notification samples").
  // The frame draws three rows; the app's first three rows pair with them (the fourth has the same structure).
  expectSame("C_QOB4 panel", rewrite(f, (m) => (m.text === "Notifications" ? m.text : byPlace(m))), rewrite(a.slice(0, f.length), (m) => (m.text === "Notifications" ? m.text : byPlace(m))));
  await testInfo.attach("C_QOB4 text: frame sample vs app data", { body: JSON.stringify({ frame: f.filter((m) => m.text).map((m) => m.text), app: shown }, null, 1), contentType: "application/json" });

  // One open at a time: the caution closes the bell.
  await page.locator(CAUTION).click();
  await expect(page.getByRole("dialog", { name: "Notifications" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(APP_PANEL)).toHaveCount(0);
});

// ---- Sign out ----

/** A weekday at least a day ahead in Mountain time (YYYY-MM-DD): an acceptance's pickup day. */
function nextWeekday() {
  const day = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date())}T12:00:00.000Z`);
  do day.setUTCDate(day.getUTCDate() + 1);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6);
  return day.toISOString().slice(0, 10);
}

const FRAME_DIALOG = 'div[style*="width: 420px"]';
const FRAME_BACKDROP = 'div[style*="z-index: 20"]';

test("Sign out (C_QOB9): asks first in the frame's words; Cancel keeps the session; Sign out clears it and returns to /", async ({ browser }, testInfo) => {
  await frame("QOB9");
  const page = await appAs(browser, testInfo, "supplier");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.mouse.move(1919, 1079);
  const dialog = page.getByRole("dialog", { name: "Sign out of Querent?" });
  await expect(dialog).toBeVisible();
  // The dialog's actions are buttons here, boxes (span) in the frame: pair them by tag (same computed styles).
  const asSpan = (list: Measure[]) => list.map((m) => (m.tag === "button" ? { ...m, tag: "span" } : m));
  expectSame("C_QOB9 dialog", await measure(framePage, FRAME_DIALOG),
    asSpan(rewrite(await measure(page, '[role="dialog"]'), (m) => m.text.replace("Brandi G.", "Brian G."))));
  // The frame's root is exactly one viewport (900px, overflow hidden), so its overlay is absolute; the app's
  // page scrolls, so the same overlay is fixed to the viewport.
  const fixed: Explained = { position: { frame: "absolute", app: "fixed", why: "frame root is one viewport; the app page scrolls" } };
  await sameStyle("dialog", FRAME_DIALOG, page, '[role="dialog"]', { explained: fixed });
  await sameStyle("backdrop", FRAME_BACKDROP, page, '[data-ui="sign-out-backdrop"]', { size: false, explained: fixed });
  // Centered at 300px from the top, as drawn.
  const place = (p: Page, sel: string) => p.locator(sel).evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, centre: Math.round(r.left + r.width / 2 - window.innerWidth / 2) }; });
  expect(await place(page, '[role="dialog"]')).toEqual(await place(framePage, FRAME_DIALOG));
  await expect(dialog).toContainText("You are signed in as Brandi G., Manager at Herrick Industrial Supply.");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect((await page.request.get("/api/rep/badges")).status()).toBe(200);

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  // The session cookie is gone: the portal sends you back to /, and the badges ask for a session.
  expect((await page.context().cookies()).filter((c) => c.name === COOKIE && c.value)).toEqual([]);
  expect((await page.request.get("/api/rep/badges")).status()).toBe(401);
  await page.goto("/rep/quotes");
  await expect(page).toHaveURL(/\/$/);
});
