import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { FONT_USER_AGENT, STYLE_PROPS, diffMeasures, measureAll, openFrame, startFrameServer } from "../scripts/frames/lib.mjs";

// Frame proof for plan U6 (Analytics), at 1920x1080. Manager (querent-persona=supplier): C_ANBase
// (Overview), C_AN1 (the same page scrolled), C_AN3 (Show table), C_AN4 (filter open), C_AN6 (Rep
// leaderboard), C_AN7 (Decline reasons), C_AN8 (Untouched quotes), C_AN2 (Customer questions), C_AN5
// (scrolled). Rep (querent-persona=mara): C_RAN1 (Overview), C_RAN2 (filter open), C_RAN3, C_RAN4, C_RAN5.
//
// How each frame is proven:
//   - The app is driven into the frame's state (the tab, the open filter, the table toggle, the scroll).
//   - The frame is opened at the app's viewport, 1920x1080. The frames are fluid (the page area is flex 1),
//     so both lay out at the same width and wrapped text compares like for like (decision 51).
//   - Every element with text in the page area (`main`), its computed STYLE_PROPS and its height, both
//     directions: nothing the frame draws is missing or styled differently, and the app adds no text,
//     icon or control the frame lacks.
//   - Numbers, dates and names in the frames are placeholders (Appendix G). Texts are compared as the
//     frames' sentence patterns: numbers become "#", dates "MON D", money "$#", durations and rates a
//     value, and the placeholder names (categories, items, customers) a token, so "From request to first
//     send, 47 quotes" and the app's "From request to first send, 27 quotes" are the same sentence and
//     any other wording fails. A count's colour is the data's (green, gray at zero, red when overdue), so
//     counts are compared without it and the colour rule is checked on its own against the frame's samples.
//   - Lists whose length is data (margin categories, top items, chart ticks, decline notes, filter reps)
//     are cut to the shorter side's length before measuring; what was cut is attached to the report.
//   - Links the frames draw as plain text (a count, "Pick a count to see its quotes"; a quote number; the
//     declined count; Manage customer access) are compared as the frame's tag, and each is checked to link.
// Nothing here is a hard-coded style value: every value comes from the frames' live DOM.

const COOKIE = "querent-persona";
const APP_SIZE = { width: 1920, height: 1080 };
const SEED_DATE = "2026-09-23";
type Measure = { path: number; tag: string; text: string; rect: { x: number; y: number; w: number; h: number }; style: Record<string, string> };

let frames: { base: string; close: () => void };
let framePage: Page;
const contexts: BrowserContext[] = [];

test.beforeAll(async ({ browser }, testInfo) => {
  frames = await startFrameServer();
  framePage = await (await browser.newContext({ viewport: APP_SIZE, userAgent: FONT_USER_AGENT })).newPage();
  const context = await browser.newContext();
  const response = await context.request.post(`${testInfo.project.use.baseURL}/api/test/reset`, { data: { seed_date: SEED_DATE } });
  expect(response.status(), "POST /api/test/reset needs QUERENT_E2E_RESET=1 on the server").toBe(200);
  await context.close();
});
test.afterAll(async () => {
  for (const context of contexts) await context.close();
  frames.close();
});

/** A 1920x1080 page signed in as `persona` on Analytics, its numbers loaded. */
async function appAs(browser: Browser, testInfo: TestInfo, persona: "supplier" | "mara") {
  const baseURL = String(testInfo.project.use.baseURL);
  const context = await browser.newContext({ viewport: APP_SIZE, baseURL });
  contexts.push(context);
  await context.addCookies([{ name: COOKIE, value: persona, url: baseURL }]);
  const page = await context.newPage();
  await page.goto("/rep/analytics");
  await expect(page.getByRole("heading", { name: "Median time to send" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await rest(page);
  return page;
}
/** Hover is a state the frames do not draw: the pointer rests on the page's empty corner. */
async function rest(page: Page) {
  await page.mouse.move(1919, 1079);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
const frame = (id: string) => openFrame(framePage, frames.base, id);

async function measure(page: Page, selector = "main"): Promise<Measure[]> {
  expect(await page.locator(selector).count(), `${selector} not found`).toBeGreaterThan(0);
  await page.evaluate((sel) => {
    document.querySelectorAll("[data-m]").forEach((e) => e.removeAttribute("data-m"));
    document.querySelector(sel)!.setAttribute("data-m", "root");
  }, selector);
  return page.evaluate(measureAll, { root: '[data-m="root"]', props: STYLE_PROPS });
}

/** Computed STYLE_PROPS plus the given extra props of one element. */
async function styleOf(page: Page, selector: string, extra: string[] = []) {
  return page.locator(selector).first().evaluate((el, props) => {
    const cs = getComputedStyle(el) as unknown as Record<string, string>;
    return Object.fromEntries(props.map((p) => [p, cs[p]]));
  }, [...STYLE_PROPS, ...extra]);
}
async function sameStyle(name: string, frameSel: string, page: Page, appSel: string, extra: string[] = []) {
  expect(await styleOf(page, appSel, extra), `${name}: computed styles differ from the frame`).toEqual(await styleOf(framePage, frameSel, extra));
}

// ---- Placeholder data (Appendix G) as the frames' patterns ----

const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
const VALUE = /^(-|#%|<?# min|# h|# h # min|# days?|# d|#)$/;
/** The frames' placeholder names (Appendix G), each mapped to a token with the app's own names. */
const FRAME_NAMES: Record<string, string> = {
  Fasteners: "CATEGORY", "Abrasives and Cutting": "CATEGORY", "Safety and PPE": "CATEGORY", "Material Handling and Tie-downs": "CATEGORY", Tools: "CATEGORY", "Janitorial and MRO": "CATEGORY",
  "HCS-12-13-2G8": "SKU", "CW-45-045-T1": "SKU", "HN-12-13-G8": "SKU", "FW-12-G8": "SKU", "FD-45-60Z": "SKU",
  "Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc": "ITEM", "Cut-off wheel 4.5 x .045 x 7/8 in, Type 1": "ITEM", "Hex nut 1/2-13, Grade 8, yellow zinc": "ITEM",
  "Flat washer 1/2 in, Grade 8, yellow zinc": "ITEM", "Flap disc 4.5 in, 60 grit zirconia": "ITEM",
  '"The general contractor is supplying the anchors on this job."': "NOTE",
};
type Names = { exact: Record<string, string>; inside: string[] };

/** The app's own names for the tokens, from the page's data. */
async function appNames(page: Page, extra: Record<string, string> = {}): Promise<Names> {
  const data = await page.evaluate(() => fetch("/api/rep/analytics").then((r) => r.json()));
  const exact: Record<string, string> = { ...extra };
  for (const c of data.margin.categories) exact[c.name] = "CATEGORY";
  for (const i of data.top_items) { exact[i.sku] = "SKU"; exact[i.description] = "ITEM"; }
  for (const n of data.groups.other_notes) exact[`"${n.note}"`] = "NOTE";
  return { exact, inside: data.options.customers.map((c: { name: string }) => c.name) };
}

function pattern(text: string, names: Names) {
  const token = names.exact[text] ?? FRAME_NAMES[text];
  if (token) return token;
  let t = text;
  for (const name of names.inside) t = t.split(name).join("CUSTOMER");
  t = t.replace(new RegExp(`${MONTH} \\d{1,2}, \\d{4}`, "g"), "MON D, YYYY").replace(new RegExp(`${MONTH} \\d{1,2}`, "g"), "MON D")
    .replace(/[+-]?\$[\d,]+(?:\.\d+)?/g, "$#").replace(/\d+(?:[.,]\d+)*/g, "#").replace(/# (line|quote|week|declined quote|accepted quote)s\b/g, "# $1")
    .replace(/# (lines|quotes) (you kept|of)/g, "# $1 $2");
  return VALUE.test(t) ? "VALUE" : t;
}

/** A count span: the frames' count look (700, tabular) in green, gray or red. */
const isCount = (m: Measure) => (m.tag === "span" || m.tag === "a") && m.style.fontWeight === "700" && /^\d+$/.test(m.text);

/** The list as the frame's patterns: tokens for data, the frame's tag for links, counts without their colour. */
function patterned(list: Measure[], names: Names, links: Record<string, string> = {}) {
  return list.map((m) => {
    if (!m.text) return m.tag === "a" ? { ...m, tag: links.a ?? "span" } : m;
    const count = isCount(m);
    const style = count ? { ...m.style, color: "count", borderTopColor: "count", borderBottomColor: "count" } : m.style;
    const tag = m.tag === "a" ? (links[m.text] ?? "span") : m.tag;
    return { ...m, tag, style, text: count ? "COUNT" : pattern(m.text, names) };
  });
}

/** Both directions, plus the same icons and controls. Returns what it compared, for the report. */
function expectSame(name: string, frameList: Measure[], appList: Measure[]) {
  const forward = diffMeasures(frameList, appList);
  expect(forward.missing, `${name}: elements of the frame missing from the app`).toEqual([]);
  expect(forward.diffs, `${name}: style differences`).toEqual([]);
  expect(diffMeasures(appList, frameList).missing, `${name}: text or controls the app adds that the frame lacks`).toEqual([]);
  const kinds = (list: Measure[]) => list.filter((m) => ["svg", "button", "a", "input", "select"].includes(m.tag)).map((m) => m.tag).sort();
  expect(kinds(appList), `${name}: icons and controls`).toEqual(kinds(frameList));
  return forward.matched;
}

/** The count colours, from the frame's own samples: zero is one colour, above zero another (or the overdue red). */
function expectCountColours(name: string, frameList: Measure[], appList: Measure[]) {
  const counts = (list: Measure[]) => list.filter(isCount);
  const zero = new Set(counts(frameList).filter((m) => m.text === "0").map((m) => m.style.color));
  const some = new Set(counts(frameList).filter((m) => m.text !== "0").map((m) => m.style.color));
  for (const m of counts(appList)) {
    if (m.text === "0") expect(zero.size ? [...zero] : [m.style.color], `${name}: a zero count's colour`).toContain(m.style.color);
    else expect([...some], `${name}: a count's colour`).toContain(m.style.color);
  }
}

/**
 * Cuts a list whose length is data to the shorter side's length (removes the last items from the longer
 * side's DOM before measuring). Returns both lengths for the report.
 */
async function cut(page: Page, frameSel: string, appSel: string) {
  const count = (p: Page, sel: string) => p.evaluate((s) => document.querySelectorAll(s).length, sel);
  const f = await count(framePage, frameSel), a = await count(page, appSel);
  const keep = Math.min(f, a);
  for (const [p, sel] of [[framePage, frameSel], [page, appSel]] as const)
    await p.evaluate(({ s, keep }) => [...document.querySelectorAll(s)].slice(keep).forEach((e) => e.remove()), { s: sel, keep });
  return { frame: f, app: a };
}

/**
 * A filter panel's controls as the frame draws them: the frame is static, so its actions and segments are
 * spans and its select a div, where the app has buttons with the same computed styles; each checkbox's
 * real input sits invisible under the drawn square (U0 Check), so it is left out.
 */
function asFrameControls(list: Measure[], divs: Record<string, string>) {
  return list.filter((m) => !(m.tag === "input" && m.style.opacity === "0")).map((m) => (m.tag === "button" && m.text ? { ...m, tag: divs[m.text] ?? "span" } : m));
}

/** Removes the matching elements on one page (a data-only element compared on its own). */
const drop = (p: Page, sel: string) => p.evaluate((s) => document.querySelectorAll(s).forEach((e) => e.remove()), sel);

/** The rail is 216px and the page area takes the rest (decision 51). */
async function expectShell(page: Page) {
  const box = await page.evaluate(() => {
    const aside = document.querySelector("aside")!.getBoundingClientRect(), main = document.querySelector("main")!.getBoundingClientRect();
    return { aside: aside.width, mainX: main.x, mainW: main.width, vw: document.documentElement.clientWidth };
  });
  expect(box).toEqual({ aside: 216, mainX: 216, mainW: box.vw - 216, vw: box.vw });
}

async function report(testInfo: TestInfo, id: string, body: Record<string, unknown>) {
  await testInfo.attach(`C_${id}`, { body: JSON.stringify(body, null, 1), contentType: "application/json" });
}

// Frame selectors for the parts whose length is data. The app marks the same parts with the frame's
// structure, so the selectors below name each side's own elements.
const F = {
  ticks: 'main div[style*="height: 255px"] > div[style*="transform: translateY(8px)"]',
  gridlines: 'main div[style*="height: 255px"] > div[style*="left: 36px; right: 0px; bottom"][style*="border-top"]',
  marginRows: 'main div[style*="padding: 16px 20px 18px"] > div[style="margin-top: 14px;"]',
  belowNote: 'main div[style*="color: rgb(201, 42, 28)"][style*="12.5px"]',
  items: 'main section div[style*="padding: 6px 20px 20px"] > div[style*="margin-top: 14px"]',
  notes: 'main div[style*="border-left: 3px solid"]',
};
const A = {
  ticks: "main [class*=tick]",
  gridlines: "main [class*=gridline]",
  marginRows: "main li[class*=marginRow]",
  belowNote: "main [class*=belowNote]",
  items: "main li[class*=item]",
  notes: "main li[class*=note]",
};

/** The Overview's data-length parts, cut to match; the below-floor note is compared on its own. */
async function cutOverview(page: Page) {
  const ticks = await cut(page, F.ticks, A.ticks);
  await cut(page, F.gridlines, A.gridlines);
  // A category's "N lines under the X% floor" shows when it has such lines (data): its look is the frame's.
  if (await page.locator(A.belowNote).count()) await sameStyle("below-floor note", F.belowNote, page, A.belowNote);
  await drop(framePage, F.belowNote);
  await drop(page, A.belowNote);
  return { ticks, marginRows: await cut(page, F.marginRows, A.marginRows), items: await cut(page, F.items, A.items) };
}

/** The chart's drawn parts (no text): the plot, a won and a lost segment, a gridline and a week label. */
async function expectChartGeometry(page: Page) {
  const extra = ["height", "position", "left", "right", "bottom", "width", "maxWidth", "borderTopLeftRadius", "borderTopRightRadius"];
  await sameStyle("plot", 'main div[style*="height: 255px"]', page, "main [class*=chart]", ["height", "position"]);
  await sameStyle("columns", 'main div[style*="inset: 0px 0px 24px 36px"]', page, "main [class*=columns]", ["position", "left", "right", "bottom", "top"]);
  await sameStyle("stack", 'main div[style*="max-width: 30px"]', page, "main [class*=stack]", ["width", "maxWidth"]);
  await sameStyle("lost segment", 'main div[style*="background: rgb(179, 182, 180); border-radius"]', page, "main [class*=segOther]", ["borderTopLeftRadius", "borderTopRightRadius"]);
  await sameStyle("won segment", 'main div[style*="max-width: 30px"] > div:last-child', page, "main [class*=segWon]");
  await sameStyle("gridline", F.gridlines, page, A.gridlines, ["position", "left", "right"]);
  await sameStyle("week label", 'main div[style*="height: 20px"]', page, "main [data-testid=week-label]", ["height", "whiteSpace", "overflow", "flexGrow"]);
  // The top tick sits 12px under the plot's top, and each count is the same height, as drawn.
  const top = (p: Page, sel: string) => p.locator(sel).last().evaluate((el) => parseFloat(getComputedStyle(el).bottom));
  expect(await top(page, A.ticks)).toBe(await top(framePage, F.ticks));
}

// ---- Manager ----

test("C_ANBase: the Overview, as the manager (stat cards, weekly chart, margin vs floor, top items)", async ({ browser }, testInfo) => {
  await frame("ANBase");
  const page = await appAs(browser, testInfo, "supplier");
  await expectShell(page);
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  const names = await appNames(page);
  await expectChartGeometry(page);
  const cuts = await cutOverview(page);
  const f = await measure(framePage), a = await measure(page);
  const matched = expectSame("C_ANBase", patterned(f, names), patterned(a, names));
  await report(testInfo, "ANBase", { matched, cuts });
});

test("C_AN1: the Overview scrolled is the same long page; the rail stays", async ({ browser }, testInfo) => {
  await frame("AN1");
  const page = await appAs(browser, testInfo, "supplier");
  // One long page (decision 51): the page scrolls and the rail stays 216px at the top.
  const tall = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(tall).toBeGreaterThan(APP_SIZE.height);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.locator("aside > div").first().evaluate((el) => el.getBoundingClientRect().top)).toBe(0);
  await expectShell(page);
  // The frame draws the same main moved up: it is ANBase's page.
  expect(await framePage.locator("main").evaluate((el) => getComputedStyle(el).transform)).not.toBe("none");
  const names = await appNames(page);
  const cuts = await cutOverview(page);
  const matched = expectSame("C_AN1", patterned(await measure(framePage), names), patterned(await measure(page), names));
  await report(testInfo, "AN1", { matched, cuts, scrollHeight: tall });
});

test("C_AN3: Show table lists the weeks newest first, nine, then Show 17 more weeks", async ({ browser }, testInfo) => {
  await frame("AN3");
  const page = await appAs(browser, testInfo, "supplier");
  await page.getByRole("button", { name: "Show table" }).click();
  await rest(page);
  await expect(page.getByRole("button", { name: "Show chart" })).toBeVisible();
  const names = await appNames(page);
  await sameStyle("week table header", 'main div[style*="1.4fr 1fr 1fr 1fr 1fr 28px"]', page, 'main [role=table][aria-label="Quotes and wins by week"] [role=row]', ["gridTemplateColumns"]);
  await sameStyle("week row", 'main div[style*="1.4fr 1fr 1fr 1fr 1fr 28px"][style*="border-top"]', page, 'main [role=table][aria-label="Quotes and wins by week"] [role=row]:nth-child(2)', ["gridTemplateColumns"]);
  const cuts = { marginRows: await cut(page, F.marginRows, A.marginRows), items: await cut(page, F.items, A.items) };
  if (await page.locator(A.belowNote).count()) await sameStyle("below-floor note", F.belowNote, page, A.belowNote);
  await drop(framePage, F.belowNote);
  await drop(page, A.belowNote);
  const matched = expectSame("C_AN3", patterned(await measure(framePage), names), patterned(await measure(page), names));
  await report(testInfo, "AN3", { matched, cuts });
});

test("C_AN4: the manager's filter: reps, teams, a customer and the breakdown", async ({ browser }, testInfo) => {
  await frame("AN4");
  const page = await appAs(browser, testInfo, "supplier");
  await page.getByRole("button", { name: "Filter" }).click();
  const panel = page.getByRole("dialog", { name: "Filter analytics" });
  // The frame's state: two reps ticked, broken down by rep.
  await panel.getByText("Brandi Gallegos", { exact: true }).click();
  await panel.getByText("Eli Porter", { exact: true }).click();
  await expect(panel.getByRole("checkbox", { name: "Eli Porter" })).toBeChecked();
  await panel.getByRole("radio", { name: "Rep" }).click();
  await rest(page);
  const framePanel = 'div[style*="width: 420px"]', appPanel = '[role=dialog][aria-label="Filter analytics"]';
  await sameStyle("panel", framePanel, page, appPanel, ["width", "position", "top", "left", "zIndex"]);
  await sameStyle("filter button, open", 'main button:has(svg):not([aria-label])', page, "main [data-ui=filter] > button");
  // The ticked and unticked squares, as drawn.
  const squares = (p: Page, sel: string) => p.locator(sel).evaluateAll((els) => els.map((e) => { const cs = getComputedStyle(e); return [cs.width, cs.height, cs.borderTopWidth, cs.borderTopColor, cs.borderRadius, cs.backgroundColor].join(" "); }));
  const frameSquares = await squares(framePage, `${framePanel} span[style*="width: 16px"]`);
  const appSquares = await squares(page, `${appPanel} [data-ui=check]`);
  expect(appSquares.slice(0, 2)).toEqual(frameSquares.slice(0, 2));
  expect(appSquares[2]).toBe(frameSquares[2]);
  // The seed has four reps (Appendix G: the frame's three names are placeholders): the fourth row is cut.
  const appReps = await page.evaluate((sel) => {
    const group = [...document.querySelectorAll(`${sel} [role=group]`)].find((g) => g.textContent?.startsWith("Reps"))!;
    const rows = [...group.querySelectorAll("label")];
    rows.slice(3).forEach((r) => r.remove());
    return rows.length;
  }, appPanel);
  const reps = { frame: await framePage.locator(`${framePanel} div[style*="1fr 1fr 1fr"] > div`).count(), app: appReps };
  const names: Names = { exact: { "Brandi Gallegos": "REP", "Eli Porter": "REP", "Nora Chen": "REP", "Mara Jensen": "REP", "Inside Sales": "TEAM", "Field Sales": "TEAM", "Outside Sales": "TEAM" }, inside: [] };
  const f = await measure(framePage, framePanel);
  const a = asFrameControls(await measure(page, appPanel), { "Any customer": "div" });
  const matched = expectSame("C_AN4 panel", patterned(f, names), patterned(a, names));
  await report(testInfo, "AN4", { matched, reps, note: "the panel's actions, segments and select are buttons here, spans and a div in the frame (static frame); same computed styles" });
});

test("C_AN6: the Rep leaderboard: Export CSV, the window, a row per rep and the totals", async ({ browser }, testInfo) => {
  await frame("AN6");
  const page = await appAs(browser, testInfo, "supplier");
  await page.getByRole("tab", { name: "Rep leaderboard" }).click();
  await rest(page);
  await expect(page.getByRole("table", { name: "Leaderboard" })).toBeVisible();
  // Fixed column widths, as drawn: the head rows' grid and the table's minimum width.
  await sameStyle("group head", 'main div[style*="170px 80px 56px"][style*="padding: 8px 20px 0px"]', page, "main [class*=groupHead]", ["gridTemplateColumns"]);
  await sameStyle("head", 'main div[style*="170px 80px 56px"][style*="padding: 6px 20px 10px"]', page, "main [class*=boardHead]", ["gridTemplateColumns"]);
  await sameStyle("table", 'main div[style*="min-width: 2280px"]', page, 'main [role=table][aria-label="Leaderboard"]', ["minWidth"]);
  await sameStyle("scroller", 'main div[style*="overflow-x: auto"]', page, "main [class*=scrollX]", ["overflowX"]);
  // Every count above zero links to its quotes (C_AN6 "Pick a count to see its quotes").
  for (const link of await page.locator("main [role=table] a").all()) expect(await link.getAttribute("href")).toMatch(/^\/rep\/quotes\?/);
  const names = await appNames(page);
  const f = await measure(framePage), a = await measure(page);
  expectCountColours("C_AN6", f, a);
  const matched = expectSame("C_AN6", patterned(f, names), patterned(a, names));
  await report(testInfo, "AN6", { matched, links: await page.locator("main [role=table] a").count() });
});

test("C_AN7: Decline reasons: per reason with a column per rep, and the Other notes", async ({ browser }, testInfo) => {
  await frame("AN7");
  const page = await appAs(browser, testInfo, "supplier");
  await page.getByRole("tab", { name: "Decline reasons" }).click();
  await rest(page);
  await sameStyle("head", 'main div[style*="2fr 0.8fr 0.8fr 1.1fr"]', page, 'main [role=table][aria-label="Decline reasons"] [role=row]', ["gridTemplateColumns"]);
  await expect(page.locator("main a[href^='/rep/quotes/Q-']").first()).toBeVisible();
  const names = await appNames(page);
  const notes = await cut(page, F.notes, A.notes);
  const f = await measure(framePage), a = await measure(page);
  expectCountColours("C_AN7", f, a);
  const matched = expectSame("C_AN7", patterned(f, names), patterned(a, names));
  await report(testInfo, "AN7", { matched, notes });
});

test("C_AN8: Untouched quotes: the reasons per rep and the totals", async ({ browser }, testInfo) => {
  await frame("AN8");
  const page = await appAs(browser, testInfo, "supplier");
  await page.getByRole("tab", { name: "Untouched quotes" }).click();
  await rest(page);
  await sameStyle("head", 'main div[style*="1.4fr 1fr 1.2fr 1.4fr"]', page, 'main [role=table][aria-label="Why quotes went untouched"] [role=row]', ["gridTemplateColumns"]);
  const names = await appNames(page);
  const f = await measure(framePage), a = await measure(page);
  expectCountColours("C_AN8", f, a);
  const matched = expectSame("C_AN8", patterned(f, names), patterned(a, names));
  await report(testInfo, "AN8", { matched });
});

for (const id of ["AN2", "AN5"]) {
  test(`C_${id}: Customer questions${id === "AN5" ? ", scrolled" : ""}: answered without a rep, the query analytics, Manage customer access`, async ({ browser }, testInfo) => {
    await frame(id);
    const page = await appAs(browser, testInfo, "supplier");
    await page.getByRole("tab", { name: "Customer questions" }).click();
    await rest(page);
    if (id === "AN5") {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expectShell(page);
    }
    await expect(page.getByRole("link", { name: "Manage customer access" })).toHaveAttribute("href", "/rep/settings?tab=access");
    await sameStyle("insight card", 'main div[style*="flex: 0 0 340px"]', page, "main [class*=insight]", ["flexBasis", "width"]);
    // The Assigned rep column names each category's rep: the frame's are placeholders (Appendix G).
    const reps = await page.evaluate(() => fetch("/api/rep/analytics").then((r) => r.json()).then((d) => d.queries.categories.map((c: { rep_name: string }) => c.rep_name)));
    const names = await appNames(page, Object.fromEntries([["Brandi Gallegos", "REP"], ...reps.map((r: string) => [r, "REP"])]));
    const f = await measure(framePage), a = await measure(page);
    const matched = expectSame(`C_${id}`, patterned(f, names), patterned(a, names, { "Manage customer access": "div" }));
    await report(testInfo, id, { matched });
  });
}

// ---- Rep (Mara) ----

test("C_RAN1: My Analytics Overview, as a rep: own numbers, no Rep leaderboard tab", async ({ browser }, testInfo) => {
  await frame("RAN1");
  const page = await appAs(browser, testInfo, "mara");
  await expectShell(page);
  await expect(page.getByRole("tab")).toHaveText(["Overview", "Decline reasons", "Untouched quotes", "Customer questions"]);
  const names = await appNames(page);
  await expectChartGeometry(page);
  const cuts = await cutOverview(page);
  // Extra GP Querent found is green when Querent found GP (C_RAN1 samples +$6.40); with none it is "$0.00" in
  // the other values' colour. The rule is checked here, then the value is compared without its colour.
  const gp = await page.evaluate(() => fetch("/api/rep/analytics").then((r) => r.json()).then((d) => d.extra_gp.amount));
  const frameValues = (await measure(framePage)).filter((m) => m.style.fontSize === "34px");
  const appValues = (await measure(page)).filter((m) => m.style.fontSize === "34px");
  expect(appValues.at(-1)!.style.color, "Extra GP's colour").toBe(gp > 0 ? frameValues.at(-1)!.style.color : frameValues[0].style.color);
  const gpFree = (list: Measure[]) => list.map((m) => (m.style.fontSize === "34px" && /\$/.test(m.text) && !/quoted/.test(m.text) && m === list.filter((x) => x.style.fontSize === "34px").at(-1)
    ? { ...m, style: { ...m.style, color: "gp", borderTopColor: "gp", borderBottomColor: "gp" } } : m));
  const matched = expectSame("C_RAN1", patterned(gpFree(await measure(framePage)), names), patterned(gpFree(await measure(page)), names));
  await report(testInfo, "RAN1", { matched, cuts, extraGp: gp });
});

test("C_RAN2: a rep's filter: own customers and a period", async ({ browser }, testInfo) => {
  await frame("RAN2");
  const page = await appAs(browser, testInfo, "mara");
  await page.getByRole("button", { name: "Filter" }).click();
  await rest(page);
  const framePanel = 'div[style*="width: 420px"]', appPanel = '[role=dialog][aria-label="Filter analytics"]';
  await sameStyle("panel", framePanel, page, appPanel, ["width", "position", "top", "left", "zIndex"]);
  const matched = expectSame("C_RAN2 panel", await measure(framePage, framePanel), asFrameControls(await measure(page, appPanel), { "Any of my customers": "div" }));
  await report(testInfo, "RAN2", { matched, note: "the panel's actions, segments and select are buttons here, spans and a div in the frame (static frame); same computed styles" });
});

test("C_RAN3: a rep's Decline reasons: no per-rep columns, the customer in each note", async ({ browser }, testInfo) => {
  await frame("RAN3");
  const page = await appAs(browser, testInfo, "mara");
  await page.getByRole("tab", { name: "Decline reasons" }).click();
  await rest(page);
  await sameStyle("head", 'main div[style*="2fr 0.8fr 0.8fr"]', page, 'main [role=table][aria-label="Decline reasons"] [role=row]', ["gridTemplateColumns"]);
  const names = await appNames(page);
  const notes = await cut(page, F.notes, A.notes);
  const f = await measure(framePage), a = await measure(page);
  expectCountColours("C_RAN3", f, a);
  const matched = expectSame("C_RAN3", patterned(f, names), patterned(a, names));
  await report(testInfo, "RAN3", { matched, notes });
});

test("C_RAN4: a rep's Untouched quotes: Your quotes, no totals", async ({ browser }, testInfo) => {
  await frame("RAN4");
  const page = await appAs(browser, testInfo, "mara");
  await page.getByRole("tab", { name: "Untouched quotes" }).click();
  await rest(page);
  const names = await appNames(page);
  const f = await measure(framePage), a = await measure(page);
  expectCountColours("C_RAN4", f, a);
  const matched = expectSame("C_RAN4", patterned(f, names), patterned(a, names));
  await report(testInfo, "RAN4", { matched });
});

test("C_RAN5: a rep's Customer questions: no Assigned rep, no Manage customer access", async ({ browser }, testInfo) => {
  await frame("RAN5");
  const page = await appAs(browser, testInfo, "mara");
  await page.getByRole("tab", { name: "Customer questions" }).click();
  await rest(page);
  await expect(page.getByRole("link", { name: "Manage customer access" })).toHaveCount(0);
  const names = await appNames(page);
  const f = await measure(framePage), a = await measure(page);
  const matched = expectSame("C_RAN5", patterned(f, names), patterned(a, names));
  await report(testInfo, "RAN5", { matched });
});
