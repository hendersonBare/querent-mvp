import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { FONT_USER_AGENT, FRAME_SIZE, STYLE_PROPS, diffMeasures, measureAll, openFrame, startFrameServer } from "../scripts/frames/lib.mjs";

// Frame proof for plan U3 (the Quotes list), at 1920x1080 against the frames (drawn at 1440x900):
//   manager (querent-persona=supplier): C_QOBoard, C_QOB1 picker, C_QOB2 filter, C_QOB5 preview, C_QOB6 note,
//   C_QOB7 show more, C_QOB8 lane drag, C_QOTable, C_QOT1 filter, C_QOT2 columns, C_QOT3 preview, C_QOT4 note,
//   C_QOT5 show more, C_QOT6 header drag, C_QOT7 customer search;
//   rep (querent-persona=mara): C_RQBoard, C_RQB1 picker, C_RQB2 filter, C_RQTable.
// Each test drives the app into the frame's state and diffs it with the frame's live DOM (scripts/frames/lib.mjs),
// in both directions: nothing the frame draws is missing or styled differently, and the app adds no text or
// control the frame lacks. Every style value comes from the frames; nothing is typed by hand.
//
// The frames' quotes, customers, counts, dates and totals are placeholders (Appendix G); the app's are real
// data. Texts are therefore paired by what they are (ROLES below: a quote number, a day, a total, a margin, a
// count, a customer, an account code, the frame's sentence patterns), and the frame's literal copy is compared
// as it is. Where the app uses a real control and the frame draws a box (a button for a span), the pairing
// names it (ALIAS). Every other difference is listed with its frame value, app value and reason.

const COOKIE = "querent-persona";
const APP_SIZE = { width: 1920, height: 1080 };
const SEED_DATE = "2026-09-23";

type Measure = { path: number; tag: string; text: string; rect: { x: number; y: number; w: number; h: number }; style: Record<string, string> };
interface Locate { selector?: string; text?: string; nth?: number; up?: number; prev?: boolean }

let frames: { base: string; close: () => void };
let framePage: Page;
const contexts: BrowserContext[] = [];
/** Customer names the frames and the app show, paired as "a customer" (Appendix G: the frames' are placeholders). */
const customerNames = new Set<string>();

// One worker runs the tests in order (playwright.config.ts); a failure does not skip the rest, so one run reports every frame.

test.beforeAll(async ({ browser }, testInfo) => {
  frames = await startFrameServer();
  framePage = await (await browser.newContext({ viewport: FRAME_SIZE, userAgent: FONT_USER_AGENT })).newPage();
  const context = await browser.newContext();
  const response = await context.request.post(`${testInfo.project.use.baseURL}/api/test/reset`, { data: { seed_date: SEED_DATE } });
  expect(response.status(), "POST /api/test/reset needs QUERENT_E2E_RESET=1 on the server").toBe(200);
  await context.close();
  // The frames' placeholder customers (C_QOBoard, C_QOB1, C_RQB1).
  for (const name of ["Wasatch Mechanical Contractors", "Canyon Ridge Builders", "Bonneville Electric Supply", "Summit Plumbing and Heating",
    "Red Rock Excavation", "Teton Concrete Works", "Great Basin Fabrication", "Wasatch Valley Roofing"]) customerNames.add(name);
});
test.afterAll(async () => {
  for (const context of contexts) await context.close();
  frames.close();
});

async function appAs(browser: Browser, testInfo: TestInfo, persona: string, path = "/rep/quotes") {
  const baseURL = String(testInfo.project.use.baseURL);
  const context = await browser.newContext({ viewport: APP_SIZE, baseURL });
  contexts.push(context);
  await context.addCookies([{ name: COOKIE, value: persona, url: baseURL }]);
  const page = await context.newPage();
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  await rest(page);
  // The app's real customers are customers too.
  const list = await page.evaluate(() => fetch("/api/rep/quotes").then((r) => r.json()));
  for (const c of list.customers as { name: string }[]) customerNames.add(c.name);
  for (const r of list.rows as { customer_name: string }[]) customerNames.add(r.customer_name);
  return page;
}
/** Hover is a state the frames do not draw: keep the pointer on the page's empty corner. */
const rest = (page: Page) => page.mouse.move(page === framePage ? 1439 : 1919, page === framePage ? 899 : 1079);
const frame = (id: string) => openFrame(framePage, frames.base, id);

/** In-page: marks the located element with data-m=<name>; false when not found. */
async function mark(page: Page, at: Locate, name: string) {
  return page.evaluate(({ at, name }) => {
    document.querySelectorAll(`[data-m="${name}"]`).forEach((e) => e.removeAttribute("data-m"));
    const own = (el: Element) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()).join(" ").trim();
    const found = at.text !== undefined
      ? [...document.querySelectorAll(at.selector ?? "body *")].filter((e) => own(e) === at.text && getComputedStyle(e).display !== "none")
      : [...document.querySelectorAll(at.selector!)];
    let el: Element | null = found[at.nth ?? 0] ?? null;
    for (let i = 0; el && i < (at.up ?? 0); i++) el = el.parentElement;
    if (el && at.prev) el = el.previousElementSibling;
    if (!el) return false;
    el.setAttribute("data-m", name);
    return true;
  }, { at, name });
}
async function measure(page: Page, at: Locate | string): Promise<Measure[]> {
  const name = page === framePage ? "f" : "a";
  expect(await mark(page, typeof at === "string" ? { selector: at } : at, name), `${JSON.stringify(at)} not found`).toBe(true);
  return page.evaluate(measureAll, { root: `[data-m="${name}"]`, props: STYLE_PROPS });
}
const EXTRA = ["position", "zIndex", "boxSizing", "transform", "outlineStyle", "outlineColor", "outlineWidth", "outlineOffset", "overflowX",
  "borderRightWidth", "borderRightColor", "borderRightStyle", "borderLeftWidth", "borderLeftColor", "borderTopStyle", "flexGrow", "flexBasis"];
async function styleAt(page: Page, at: Locate | string) {
  if (page !== framePage) await rest(page);
  const name = page === framePage ? "fs" : "as";
  expect(await mark(page, typeof at === "string" ? { selector: at } : at, name), `${JSON.stringify(at)} not found`).toBe(true);
  return page.evaluate(({ name, props }) => {
    const el = document.querySelector(`[data-m="${name}"]`)!;
    const cs = getComputedStyle(el) as unknown as Record<string, string>;
    const r = el.getBoundingClientRect();
    return { style: Object.fromEntries(props.map((p) => [p, cs[p]])), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
  }, { name, props: [...STYLE_PROPS, ...EXTRA] });
}
/** A difference with its reason: it must be exactly this frame value and this app value. */
type Explained = Record<string, { frame: string | number; app: string | number; why: string }>;
/** One frame element and one app element: computed styles equal (and size, unless the region is fluid). */
async function sameStyle(name: string, app: Page, frameAt: Locate | string, appAt: Locate | string, { w = true, h = true, explained = {} as Explained, props = [...STYLE_PROPS, ...EXTRA] } = {}) {
  const f = await styleAt(framePage, frameAt);
  const a = await styleAt(app, appAt);
  const diffs: Record<string, { frame: unknown; app: unknown }> = {};
  const check = (k: string, fv: string | number, av: string | number) => {
    if (fv === av) return;
    const ok = explained[k];
    if (ok && ok.frame === fv && ok.app === av) return;
    diffs[k] = { frame: fv, app: av };
  };
  // An outline that neither side draws (outline-style none) has no colour, width or offset to compare.
  const noOutline = f.style.outlineStyle === "none" && a.style.outlineStyle === "none";
  for (const p of props) if (!(noOutline && /^outline(Color|Width|Offset)$/.test(p))) check(p, f.style[p], a.style[p]);
  if (w) check("width", f.w, a.w);
  if (h) check("height", f.h, a.h);
  expect.soft(diffs, `${name}: computed styles differ from the frame`).toEqual({});
}

// ---- Pairing texts by what they are ----

const LITERAL = new Set(["Quotes", "All customers", "All my customers", "Filter", "Board", "Table", "Draft ready", "Changes requested", "Sent", "Accepted",
  "Expired", "Declined", "::", "View note", "No quotes here", "Show less", "Show fewer quotes", ":: Quote", ":: Customer", ":: Requested", ":: Status",
  ":: Total", ":: Margin", "Filter quotes", "Status", "Rep", "Customer", "Requested from", "Requested to", "Only show", "Overdue", "Aging",
  "Below margin floor", "Clear all", "Apply filters", "All reps", "Any customer", "Any of my customers", "Choose columns", "Always shown", "Quote",
  "Requested", "Total", "Margin", "Valid until", "Purchasing agent", "Reset to default", "Done", "Open quote", "x", "Close", "Send reply"]);
const ROLES: [RegExp, string][] = [
  [/^Q-\d+$/, "<quote number>"],
  [/^Note on Q-\d+$/, "Note on <quote number>"],
  [/^Status: (Draft ready|Changes requested|Sent|Accepted|Expired|Declined)$/, "Status: <status>"],
  [/^[A-Z][a-z]{2} \d{1,2}(, \d{4})?$/, "<day>"],
  [/^\$[\d,]+\.\d{2}$/, "<total>"],
  [/^\d+\.\d%$/, "<margin>"],
  [/^\d+$/, "<count>"],
  [/^[A-Z]{3}-\d{4}$/, "<account code>"],
  [/^Show \d+ more$/, "Show <n> more"],
  [/^Show \d+ more quotes$/, "Show <n> more quotes"],
  [/^Overdue\. \d+ lines? below floor$/, "Overdue. <n> line below floor"],
  [/^\d+ lines? below floor$/, "<n> line below floor"],
  [/^Showing 5 of \d+\. Scroll to see more or type to search\.$/, "Showing 5 of <n>. Scroll to see more or type to search."],
  [/^Your \d+ customers?\. Type to search\.$/, "Your <n> customers. Type to search."],
  [/^\d+ match(es)?$/, "<n> matches"],
  [/^Reply to [A-Z][a-z]+$/, "Reply to <first name>"],
  [/^.+, [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} (AM|PM)$/, "<contact>, <day>, <time>"],
  [/^.+, [A-Z][a-z]{2} \d{1,2}$/, "<contact>, <day>"],
  [/^".+"$/, '"<the customer\'s note>"'],
];
function roleOf(text: string) {
  if (LITERAL.has(text)) return text;
  if (customerNames.has(text)) return "<customer>";
  for (const [re, role] of ROLES) if (re.test(text)) return role;
  return text;
}
/** Real controls where the frame draws a box (or a heading where it draws a div): app tag -> frame tag, by text role. */
type Alias = Record<string, string>;
/** Invisible elements (the real checkbox inputs under the drawn squares, opacity 0) are not drawn, so not compared. */
const paired = (list: Measure[], alias: Alias = {}) => list.filter((m) => m.style.opacity !== "0").map((m) => {
  const text = m.text ? roleOf(m.text) : m.text;
  return { ...m, text, tag: alias[`${m.tag}|${text}`] ?? alias[m.tag] ?? m.tag };
});

/**
 * Both directions over a region: every frame element is in the app with the same computed styles and height, and
 * the app adds no text the frame lacks; the icons and controls are the same. `missing` lists frame elements with
 * no app twin, each explained; `extraKinds` app controls the frame draws as boxes.
 */
function expectSame(name: string, frameList: Measure[], appList: Measure[], { missing = [] as string[], extra = [] as string[], extraKinds = [] as string[],
  heights = {} as Record<string, { frame: number; app: number; why: string }> } = {}) {
  const forward = diffMeasures(frameList, appList);
  expect(frameList.filter((m) => m.text).length, `${name}: the frame region has text to compare`).toBeGreaterThan(0);
  expect.soft(forward.missing, `${name}: elements of the frame missing from the app`).toEqual(missing);
  const diffs = forward.diffs.map((d: Record<string, unknown>) => {
    const h = d.height as { frame: number; app: number } | undefined;
    const ok = heights[d.element as string];
    if (h && ok && ok.frame === h.frame && ok.app === h.app) { const { height: _h, ...rest } = d; return rest; }
    return d;
  }).filter((d: Record<string, unknown>) => Object.keys(d).length > 1);
  expect.soft(diffs, `${name}: style differences`).toEqual([]);
  const backward = diffMeasures(appList, frameList);
  expect.soft(backward.missing, `${name}: text the app adds that the frame lacks`).toEqual(extra);
  const kinds = (list: Measure[]) => list.filter((m) => ["svg", "button", "a", "input", "select", "textarea"].includes(m.tag)).map((m) => m.tag).sort();
  expect.soft(kinds(appList), `${name}: icons and controls`).toEqual([...kinds(frameList), ...extraKinds].sort());
  return forward.matched;
}

/**
 * Over the whole page area: every kind of text the app draws (its tag and what it is, ROLES) is one the frame
 * draws too, so nothing outside the regions compared one by one is added. The counts differ (real data).
 */
async function expectNothingAdded(name: string, page: Page, alias: Alias = {}) {
  const key = (m: Measure) => `${m.tag} "${m.text}"`;
  // Which statuses a table's rows show is data: every status word is the frames' own copy (the lanes, C_QOB2), in the status cell's span.
  const statuses = ["Draft ready", "Changes requested", "Sent", "Accepted", "Expired", "Declined"].map((st) => `span "${st}"`);
  const f = new Set([...paired(await measure(framePage, "main")).filter((m) => m.text).map(key), ...statuses]);
  const a = new Set(paired(await measure(page, "main"), alias).filter((m) => m.text).map(key));
  expect.soft([...a].filter((k) => !f.has(k)), `${name}: kinds of text the app adds that the frame lacks`).toEqual([]);
}

/** The rail is 216px, the page area takes the rest, and nothing in the page is wider than it (decision 51). */
async function expectViewport(page: Page) {
  const box = await page.evaluate(() => {
    const aside = document.querySelector("aside")!.getBoundingClientRect(), main = document.querySelector("main")!.getBoundingClientRect();
    return { aside: aside.width, mainX: main.x, mainW: main.width, vw: document.documentElement.clientWidth, scrollW: document.documentElement.scrollWidth };
  });
  expect(box.aside).toBe(216);
  expect(box.mainX).toBe(216);
  expect(box.mainW).toBe(box.vw - 216);
  expect(box.scrollW).toBe(box.vw);
}

// ---- The toolbar (every Quotes frame) ----

const FRAME_HEADER: Locate = { selector: "main > div:first-child" };
const APP_HEADER = "header[data-ui=page-header]";
/** The header's fixed-width controls keep the frame's widths; the gap before the caution and bell takes the extra width. */
async function expectToolbar(page: Page, { tableFrame = false, picker = "All customers" } = {}) {
  // The picker's real input is a control the frame draws as a box with a label.
  expectSame("toolbar", paired(await measure(framePage, FRAME_HEADER)), paired(await measure(page, APP_HEADER)), { extraKinds: ["input"] });
  await sameStyle("toolbar row", page, FRAME_HEADER, APP_HEADER, { w: false });
  await sameStyle("customer picker", page, { text: picker, selector: "main span", up: 1 }, "[data-ui=picker]",
    { explained: { position: { frame: "static", app: "relative", why: "the picker's list is placed against its box (U0 CustomerPicker); the frames draw the open list inside the same box" } } });
  await sameStyle("Filter", page, { text: "Filter", selector: "main button" }, "header [data-ui=filter] > button");
  await sameStyle("Board/Table", page, { text: "Board", selector: "main button", up: 1 }, '[role=group][aria-label="View"]');
  for (const v of ["Board", "Table"]) await sameStyle(v, page, { text: v, selector: "main button" }, { text: v, selector: '[aria-label="View"] button' });
  // Decision 54: the caution border is #E8A8A0 on every page; the nine Quotes table frames draw #F1BEB8.
  const why = "decision 54: #E8A8A0 on every page; the Quotes table frames draw #F1BEB8";
  const border = { frame: "rgb(241, 190, 184)", app: "rgb(232, 168, 160)", why };
  await sameStyle("caution", page, 'button[aria-label^="Needs attention"]', 'button[aria-label^="Needs attention"]',
    { explained: tableFrame ? { borderTopColor: border, borderBottomColor: border, borderRightColor: border, borderLeftColor: border } : {} });
  await sameStyle("bell", page, 'button[aria-label^="Notifications"]', 'button[aria-label^="Notifications"]');
  await expectViewport(page);
}

// ---- The board ----

const lane = (n: number) => `main section:nth-of-type(${n})`;
const appLane = (label: string) => `section[data-lane][aria-label="${label}"]`;
const LANES = ["Draft ready", "Changes requested", "Sent", "Accepted", "Expired", "Declined"];
const card = (number: string): Locate => ({ text: number, selector: "main section span", up: 3 });
const appCard = (number: string) => `[role=article][aria-label="${number}"]`;

/** Lane chrome as C_QOBoard draws it: the lane box, its header, the "::" handle, label and count; lanes grow from 236px. */
async function expectLanes(page: Page, labels: string[] = LANES) {
  await sameStyle("lane row", page, { selector: "main > div:nth-child(2)" }, '[role=group][aria-label="Board columns"]', { w: false, h: false });
  for (const [i, label] of labels.entries()) {
    const n = LANES.indexOf(label) + 1;
    await sameStyle(`${label} lane`, page, lane(n), appLane(label), { w: false, h: false });
    await sameStyle(`${label} head`, page, `${lane(n)} > div:first-child`, `${appLane(label)} > div:first-child`, { w: false });
    await sameStyle(`${label} body`, page, `${lane(n)} > div:nth-child(2)`, `${appLane(label)} > div:nth-child(2)`, { w: false, h: false });
    expectSame(`${label} head`, paired(await measure(framePage, `${lane(n)} > div:first-child`)), paired(await measure(page, `${appLane(label)} > div:first-child`)));
    void i;
  }
  // Fluid: every lane the same width, at least the frame's 236px, filling the row (decision 51).
  const widths = await page.evaluate(() => {
    const row = document.querySelector('[role=group][aria-label="Board columns"]')!.getBoundingClientRect();
    const lanes = [...document.querySelectorAll("section[data-lane]")].map((l) => l.getBoundingClientRect().width);
    return { row: row.width, lanes };
  });
  const frameLane = await framePage.locator(lane(1)).evaluate((el) => el.getBoundingClientRect().width);
  expect(frameLane).toBe(236);
  for (const w of widths.lanes) expect(Math.abs(w - widths.lanes[0]!)).toBeLessThan(1);
  expect(widths.lanes[0]!).toBeGreaterThanOrEqual(frameLane);
  expect(Math.round(widths.lanes.reduce((a, b) => a + b, 0) + 14 * (widths.lanes.length - 1))).toBe(Math.round(widths.row));
}

/** Fluid: a full-width control in a lane spans the lane's body (the lane is 236px in the frame and grows here). */
async function expectFullWidth(page: Page, selector: string) {
  const { w, body } = await page.locator(selector).first().evaluate((el) => {
    const lane = el.closest("section")!.querySelector(":scope > div:nth-child(2)")!;
    const cs = getComputedStyle(lane);
    return { w: el.getBoundingClientRect().width, body: lane.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) };
  });
  expect(w).toBeCloseTo(body, 1);
}

/** One card against one of the frame's cards of the same shape (number, day, customer, View note, total, margin, red line). */
async function expectCard(page: Page, frameNumber: string, appNumber: string) {
  await sameStyle(`card ${appNumber}`, page, card(frameNumber), appCard(appNumber), { w: false, h: false });
  expectSame(`card ${appNumber} (frame ${frameNumber})`, paired(await measure(framePage, card(frameNumber))), paired(await measure(page, appCard(appNumber))));
}

/** The first card on the app's board matching a shape, by its parts' text. */
async function findCard(page: Page, { lane: label, flag, note = false, lines }: { lane: string; flag: RegExp | null; note?: boolean; lines?: 1 | 2 }) {
  const found = await page.evaluate(({ label, flag, note, lines }) => {
    const cards = [...document.querySelectorAll(`section[data-lane][aria-label="${label}"] [role=article]`)];
    const hit = cards.find((c) => {
      const red = c.querySelector(":scope > div:last-child")?.className.includes("Flag") ? c.querySelector(":scope > div:last-child")!.textContent : null;
      const hasNote = !!c.querySelector("[data-ui=view-note]");
      const name = c.querySelector(":scope > div:nth-child(2) span")!;
      const oneLine = name.getBoundingClientRect().height < 20;
      return (flag === null ? red === null : red !== null && new RegExp(flag).test(red)) && hasNote === note && (!lines || (lines === 1) === oneLine);
    });
    return hit?.getAttribute("aria-label") ?? null;
  }, { label, flag: flag?.source ?? null, note, lines });
  expect(found, `a ${label} card ${JSON.stringify({ flag: flag?.source, note, lines })}`).not.toBeNull();
  return found!;
}

test("C_QOBoard (manager): toolbar, six lanes with real counts, cards of every shape, Show N more, empty lane", async ({ browser }, testInfo) => {
  await frame("QOBoard");
  const page = await appAs(browser, testInfo, "supplier");
  await expectToolbar(page);
  await expectLanes(page);
  await expectNothingAdded("C_QOBoard", page);
  // Real counts (Appendix G: the frame's "20 accepted" is a placeholder): each lane counts the list's quotes of its status.
  const list = await page.evaluate(() => fetch("/api/rep/quotes").then((r) => r.json()));
  const counts = await page.locator("section[data-lane] [data-ui=count]").allTextContents();
  expect(counts).toEqual(["ready_for_review", "changes_requested", "sent", "accepted", "expired", "declined"].map((s) => String(list.counts[s])));
  // Cards: the seeded Wasatch quotes are the frame's own shapes (plain, Aging, View note with Overdue, Overdue with a line below the floor).
  await expectCard(page, "Q-24791", "Q-24791");
  await expectCard(page, "Q-24789", "Q-24789");
  await expectCard(page, "Q-24790", "Q-24790");
  await expectCard(page, "Q-24817", "Q-24817");
  // A one-line customer (C_QOBoard Q-24763, Canyon Ridge Builders).
  await expectCard(page, "Q-24763", await findCard(page, { lane: "Accepted", flag: null, lines: 1 }));
  // Show N more at a lane's foot (C_QOBoard Accepted: "Show 13 more").
  await sameStyle("Show more", page, { text: "Show 13 more", up: 1 }, `${appLane("Accepted")} [data-ui=more]`, { w: false });
  await expectFullWidth(page, `${appLane("Accepted")} [data-ui=more]`);
  expectSame("Show more", paired(await measure(framePage, { text: "Show 13 more", up: 1 })), paired(await measure(page, `${appLane("Accepted")} [data-ui=more]`)));
  const accepted = list.rows.filter((r: { status: string }) => r.status === "accepted").length;
  await expect(page.locator(`${appLane("Accepted")} [data-ui=more]`)).toHaveText(`Show ${accepted - 7} more`);
  await expect(page.locator(`${appLane("Accepted")} [role=article]`)).toHaveCount(7);
  // An empty lane (C_QOBoard Declined): Brandi's Wasatch quotes have no declined one.
  await page.goto("/rep/quotes?customer=wasatch");
  await rest(page);
  await expect(page.locator(`${appLane("Declined")} [data-ui=count]`)).toHaveText("0");
  expectSame("empty lane", paired(await measure(framePage, `${lane(6)} > div:nth-child(2)`)), paired(await measure(page, `${appLane("Declined")} > div:nth-child(2)`)));
  await sameStyle("empty lane line", page, { text: "No quotes here" }, { text: "No quotes here", selector: `${appLane("Declined")} div` }, { w: false });
});

// ---- Opened states on the board ----

/** Measures the open picker as it shows: rows scrolled out of the five-row list are not drawn (C_QOB1 draws those five). */
async function measureOpenPicker(page: Page) {
  await page.evaluate(() => [...document.querySelectorAll("[data-ui=picker] [role=listbox] > *")].forEach((row, i) => {
    if (i >= 5) (row as HTMLElement).style.setProperty("display", "none");
  }));
  const list = await measure(page, "[data-ui=picker]");
  await page.evaluate(() => document.querySelectorAll("[data-ui=picker] [role=listbox] > *").forEach((row) => (row as HTMLElement).style.removeProperty("display")));
  return list;
}

async function expectPicker(page: Page, frameAt: Locate, { missing = [] as string[], why = "" } = {}) {
  await expect(page.getByRole("listbox")).toBeVisible();
  await rest(page);
  const f = paired(await measure(framePage, frameAt));
  const a = paired(await measureOpenPicker(page));
  // The picker's real input is a control the frame draws as a box; `missing` are placeholder rows (why).
  expectSame(`picker${why ? ` (${why})` : ""}`, f, a, { extraKinds: ["input"], missing });
  await sameStyle("open picker", page, frameAt, "[data-ui=picker]", { explained: { position: { frame: "static", app: "relative", why: "the list is placed against the box (U0)" } } });
  // Five rows show, the rest scroll.
  const rows = await page.locator("[data-ui=picker] [role=listbox]").evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight, row: el.firstElementChild!.getBoundingClientRect().height, n: el.children.length }));
  expect(rows.client).toBe(rows.row * Math.min(5, rows.n));
}

test("C_QOB1 (manager): the customer picker open, All customers first, five rows, the rest scroll", async ({ browser }, testInfo) => {
  await frame("QOB1");
  const page = await appAs(browser, testInfo, "supplier");
  await page.getByRole("combobox", { name: /^Customer/ }).click();
  await expectPicker(page, { text: "All customers", selector: "main span", up: 1 });
  await sameStyle("list panel", page, { text: "Showing 5 of 14. Scroll to see more or type to search.", up: 1 }, "[data-ui=picker-panel]");
  const list = await page.evaluate(() => fetch("/api/rep/quotes").then((r) => r.json()));
  await expect(page.getByText(`Showing 5 of ${list.customers.length + 1}. Scroll to see more or type to search.`)).toBeVisible();
  // Picking one narrows the page to it (the page's own ?customer=, task U1).
  await page.getByRole("option", { name: /^Wasatch Mechanical Contractors/ }).click();
  await expect(page).toHaveURL(/\/rep\/quotes\?customer=wasatch$/);
  await expect(page.getByRole("combobox", { name: "Customer, Wasatch Mechanical Contractors" })).toBeVisible();
});

const FILTER_ALIAS: Alias = { "button|Clear all": "span", "button|Apply filters": "span", "button|All reps": "div", "button|Any customer": "div", "button|Any of my customers": "div" };
/** C_QOB2 draws sample dates in the date fields; the app's are empty date inputs (U0), compared by style. */
const DATES = ['div "<day>"', 'div "<day>"'];
async function expectFilterPanel(page: Page, { rep = true } = {}) {
  await page.locator("header [data-ui=filter] > button").click();
  await expect(page.getByRole("dialog", { name: "Filter quotes" })).toBeVisible();
  await rest(page);
  const f = paired(await measure(framePage, { text: "Filter quotes", up: 2 }));
  const a = paired(await measure(page, "header [data-ui=filter]"), FILTER_ALIAS);
  expectSame("filter panel", f, a, { missing: DATES, extraKinds: ["input", "input"] });
  await sameStyle("Filter, open", page, { text: "Filter", selector: "main button" }, "header [data-ui=filter] > button");
  await sameStyle("panel", page, { text: "Filter quotes", up: 1 }, "header [data-ui=filter] [role=dialog]", { h: false });
  // The frame's field is a flex div holding a sample day (placeholder, Appendix G); the app's is an empty date
  // input (U0 primitive), so its display, alignment, text colour and gap are the input's own; every other style matches.
  await sameStyle("date field", page, { text: "Sep 1" }, 'input[aria-label="Requested from"]', { w: true,
    props: STYLE_PROPS.filter((p: string) => !["display", "textAlign", "color", "gap"].includes(p)) });
  // The Rep field (the manager only) lists every rep; the Customer field the reader's customers.
  if (rep) {
    await page.getByRole("button", { name: "Rep: All reps" }).click();
    const reps = (await page.evaluate(() => fetch("/api/rep/quotes").then((r) => r.json()))).manager.reps.map((r: { name: string }) => r.name);
    await expect(page.getByRole("dialog", { name: "Filter quotes" }).getByRole("option")).toHaveText(["All reps", ...reps]);
    // Escape closes the list only, not the panel around it.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Filter quotes" }).getByRole("option")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Filter quotes" })).toBeVisible();
  } else await expect(page.getByRole("dialog", { name: "Filter quotes" }).getByText("Rep", { exact: true })).toHaveCount(0);
}

test("C_QOB2 (manager): the filter panel, and applying it filters the board", async ({ browser }, testInfo) => {
  await frame("QOB2");
  const page = await appAs(browser, testInfo, "supplier");
  await expectFilterPanel(page);
  // Only show Overdue: the board keeps the red quotes, in their lanes, with real counts.
  const panel = page.getByRole("dialog", { name: "Filter quotes" });
  await panel.locator("label").filter({ hasText: /^Overdue$/ }).click();
  await panel.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/\/rep\/quotes\?only=overdue$/);
  await expect(page.getByRole("button", { name: "Filter, 1 applied" })).toBeVisible();
  const list = await page.evaluate(() => fetch("/api/rep/quotes?only=overdue").then((r) => r.json()));
  expect(list.rows.length).toBeGreaterThan(0);
  expect(list.rows.every((r: { aging: { level: string } | null }) => r.aging?.level === "red")).toBe(true);
  await expect(page.locator("[role=article]")).toHaveCount(Math.min(list.rows.length, 6 * 7));
  for (const r of list.rows.slice(0, 5)) await expect(page.locator(`[role=article][aria-label="${r.quote_number}"]`)).toContainText("Overdue");
});

const SHEET_ALIAS: Alias = { "h2|<quote number>": "div", "button|x": "span", "a|Open quote": "span", "button|Reply to <first name>": "span" };
/** The frame's root is one viewport (900px, overflow hidden), so its overlays are absolute; the app's page scrolls, so they are fixed. */
const FIXED = { frame: "absolute", app: "fixed", why: "the frame's root is one viewport; the app's page scrolls" };
async function expectPreview(page: Page, number: string) {
  const sheet = page.getByRole("dialog", { name: number });
  await expect(sheet).toBeVisible();
  await rest(page);
  const at: Locate = { selector: "aside div", text: "Q-24790", up: 3 };
  expectSame("quote preview", paired(await measure(framePage, at)), paired(await measure(page, "[data-ui=sheet]"), SHEET_ALIAS));
  await sameStyle("sheet", page, at, "[data-ui=sheet]", { explained: { position: FIXED, height: { frame: 900, app: 1080, why: "one viewport tall: 900 in the frame, 1080 here" },
    overflowX: { frame: "visible", app: "auto", why: "the sheet scrolls when its content is taller than the viewport (U0 Sheet); the frame's fits" } } });
  await sameStyle("sheet backdrop", page, { ...at, prev: true }, "[data-ui=sheet-backdrop]", { w: false, h: false, explained: { position: FIXED } });
  await sameStyle("Open quote", page, { text: "Open quote" }, { text: "Open quote", selector: "[data-ui=sheet] a" }, { props: STYLE_PROPS.filter((p: string) => p !== "display") });
  await sameStyle("Reply", page, { text: "Reply to Dana", selector: "aside span" }, { text: "Reply to Dana", selector: "[data-ui=sheet] button" });
  // Its words are the quote's own (real data): total, requested day, margin, status, the customer's note.
  const row = (await page.evaluate(() => fetch("/api/rep/quotes").then((r) => r.json()))).rows.find((r: { quote_number: string }) => r.quote_number === number);
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(row.total);
  await expect(sheet).toContainText(`Total${usd}`);
  await expect(sheet).toContainText(`Margin${row.margin_label}`);
  await expect(sheet).toContainText(`"${row.change_request.note}"`);
  await expect(sheet.getByRole("link", { name: "Open quote" })).toHaveAttribute("href", `/rep/quotes/${number}`);
}

test("C_QOB5 (manager): the quote preview from a card, and Open quote leads to it", async ({ browser }, testInfo) => {
  await frame("QOB5");
  const page = await appAs(browser, testInfo, "supplier");
  await page.locator('[role=article][aria-label="Q-24790"]').getByRole("button", { name: "Q-24790" }).click();
  await expectPreview(page, "Q-24790");
  await page.getByRole("dialog", { name: "Q-24790" }).getByRole("link", { name: "Open quote" }).click();
  await expect(page).toHaveURL(/\/rep\/quotes\/Q-24790$/);
});

const NOTE_ALIAS: Alias = { "button|x": "span", "label|Reply to <first name>": "div", "button|Close": "span", "button|Send reply": "span" };
async function expectNote(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Note on Q-24790" });
  await expect(dialog).toBeVisible();
  await page.locator("[data-ui=note-dialog] textarea").blur();
  await rest(page);
  const at: Locate = { text: "Note on Q-24790", up: 3 };
  // The reply box is a real textarea whose placeholder is the frame's "Write a reply".
  expectSame("note", paired(await measure(framePage, at)), paired(await measure(page, "[data-ui=note-dialog]"), NOTE_ALIAS),
    { missing: ['div "Write a reply"'], extraKinds: ["textarea"] });
  await sameStyle("note dialog", page, at, "[data-ui=note-dialog]", { explained: { position: FIXED } });
  await sameStyle("note backdrop", page, { ...at, prev: true }, "[data-ui=note-backdrop]", { w: false, h: false, explained: { position: FIXED } });
  await sameStyle("reply box", page, { text: "Write a reply" }, "[data-ui=note-dialog] textarea",
    { explained: { color: { frame: "rgb(118, 125, 121)", app: "rgb(27, 31, 29)", why: "the frame draws the placeholder as the box's text; the textarea's placeholder has that colour (checked below)" },
      overflowX: { frame: "visible", app: "auto", why: "a textarea scrolls a long reply; the frame's box is empty" } } });
  expect(await page.locator("[data-ui=note-dialog] textarea").evaluate((el) => getComputedStyle(el, "::placeholder").color)).toBe("rgb(118, 125, 121)");
  await expect(page.locator("[data-ui=note-dialog] textarea")).toHaveAttribute("placeholder", "Write a reply");
  await sameStyle("Close", page, { text: "Close", selector: "span" }, { text: "Close", selector: "[data-ui=note-dialog] button" });
  await sameStyle("Send reply", page, { text: "Send reply" }, { text: "Send reply", selector: "[data-ui=note-dialog] button" });
  const place = (p: Page, sel: string) => p.locator(sel).evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, centre: Math.round(r.left + r.width / 2 - window.innerWidth / 2) }; });
  await mark(framePage, at, "nd");
  expect(await place(page, "[data-ui=note-dialog]")).toEqual(await place(framePage, '[data-m="nd"]'));
}

test("C_QOB6 (manager): View note on a card, then Send reply records the reply", async ({ browser }, testInfo) => {
  await frame("QOB6");
  const page = await appAs(browser, testInfo, "supplier");
  await page.locator('[role=article][aria-label="Q-24790"]').getByRole("button", { name: "View note" }).click();
  await expect(page.getByRole("dialog", { name: "Q-24790", exact: true })).toHaveCount(0);
  await expectNote(page);
  await page.getByRole("textbox", { name: "Reply to Dana" }).fill("Yes, we can hold them at Ogden.");
  const posted = page.waitForResponse((r) => r.url().endsWith("/api/rep/quotes/Q-24790/reply"));
  await page.getByRole("button", { name: "Send reply" }).click();
  expect((await posted).status()).toBe(201);
  await expect(page.getByRole("dialog", { name: "Note on Q-24790" })).toHaveCount(0);
});

test("C_QOB7 (manager): Show N more shows every quote in the lane, then Show less", async ({ browser }, testInfo) => {
  await frame("QOB7");
  const page = await appAs(browser, testInfo, "supplier");
  const accepted = (await page.evaluate(() => fetch("/api/rep/quotes").then((r) => r.json()))).counts.accepted;
  await page.locator(`${appLane("Accepted")} [data-ui=more]`).click();
  await rest(page);
  await expect(page.locator(`${appLane("Accepted")} [role=article]`)).toHaveCount(accepted);
  await expect(page.locator(`${appLane("Accepted")} [data-ui=more]`)).toHaveText("Show less");
  // C_QOB7's "Scrolled down after Show more" pill is a design note, not drawn (decision 50).
  expectSame("Show less", paired(await measure(framePage, { text: "Show less", up: 1 })), paired(await measure(page, `${appLane("Accepted")} [data-ui=more]`)));
  await sameStyle("Show less", page, { text: "Show less", up: 1 }, `${appLane("Accepted")} [data-ui=more]`, { w: false });
  await expectFullWidth(page, `${appLane("Accepted")} [data-ui=more]`);
  await page.locator(`${appLane("Accepted")} [data-ui=more]`).click();
  await expect(page.locator(`${appLane("Accepted")} [role=article]`)).toHaveCount(7);
});

async function restoreOrder(page: Page, table: string) {
  expect((await page.evaluate((table) => fetch("/api/rep/table-prefs", { method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ table_id: table, column_order: table === "quotes" ? ["quote", "customer", "requested", "status", "total", "margin", "rep", "valid", "agent"]
      : ["ready_for_review", "changes_requested", "sent", "accepted", "expired", "declined"], hidden_columns: table === "quotes" ? ["rep", "valid", "agent"] : [] }) }).then((r) => r.status), table))).toBe(200);
}

test("C_QOB8 (manager): dragging a lane lifts it and outlines where it goes; the order is the user's own", async ({ browser }, testInfo) => {
  await frame("QOB8");
  const page = await appAs(browser, testInfo, "supplier");
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const head = (label: string) => page.locator(`${appLane(label)} > div:first-child`);
  await head("Changes requested").dispatchEvent("dragstart", { dataTransfer });
  await head("Accepted").dispatchEvent("dragover", { dataTransfer });
  const lifted = ["transform", "boxShadow", "zIndex", "position", "backgroundColor", "borderRadius"];
  await sameStyle("lane, lifted", page, lane(2), appLane("Changes requested"), { w: false, h: false, props: lifted });
  await sameStyle("lane, drop target", page, lane(4), appLane("Accepted"), { w: false, h: false, props: [...lifted, "outlineStyle", "outlineColor", "outlineWidth", "outlineOffset"] });
  // A lane at rest: C_QOB8 positions every lane (relative, z-index 1) for the drag; that draws nothing, so it is not compared.
  await sameStyle("lane, resting", page, lane(1), appLane("Draft ready"), { w: false, h: false, props: ["transform", "boxShadow", "backgroundColor", "borderRadius", "outlineStyle"] });
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/rep/table-prefs") && r.request().method() === "PUT");
  await head("Accepted").dispatchEvent("drop", { dataTransfer });
  expect((await saved).status()).toBe(200);
  const order = () => page.locator("section[data-lane]").evaluateAll((ls) => ls.map((l) => l.getAttribute("aria-label")));
  expect(await order()).toEqual(["Draft ready", "Sent", "Accepted", "Changes requested", "Expired", "Declined"]);
  await page.reload();
  expect(await order()).toEqual(["Draft ready", "Sent", "Accepted", "Changes requested", "Expired", "Declined"]);
  // Another user keeps the frames' order.
  const mara = await appAs(browser, testInfo, "mara");
  expect(await mara.locator("section[data-lane]").evaluateAll((ls) => ls.map((l) => l.getAttribute("aria-label")))).toEqual(LANES);
  await restoreOrder(page, "quotes-board");
});

// ---- The table ----

const tableCard: Locate = { text: ":: Quote", up: 4 };
const frameRow = (number: string): Locate => ({ text: number, selector: "main span", up: 2 });
const appRow = (number: string): Locate => ({ text: number, selector: "[data-ui=table] [role=row] span", up: 2 });

async function showAllRows(page: Page) {
  const more = page.locator("[data-ui=table] [data-ui=more]");
  if (await more.count() && /more/.test(await more.textContent() ?? "")) await more.click();
  await rest(page);
}

test("C_QOTable (manager): the table's header, rows of every shape, Show N more quotes; fluid tracks, fixed columns cell", async ({ browser }, testInfo) => {
  await frame("QOTable");
  const page = await appAs(browser, testInfo, "supplier", "/rep/quotes?view=table");
  await expectToolbar(page, { tableFrame: true });
  await expectNothingAdded("C_QOTable", page);
  await sameStyle("table card", page, tableCard, "[data-ui=table]", { w: false, h: false });
  await sameStyle("table, under the toolbar", page, { ...tableCard }, "[data-ui=table]", { w: false, h: false, props: ["marginTop", "borderTopWidth", "borderTopColor", "borderRadius"] });
  const head: Locate = { text: ":: Quote", up: 1 };
  expectSame("header row", paired(await measure(framePage, head)), paired(await measure(page, "[data-ui=table] [role=row]")));
  await sameStyle("header row", page, head, "[data-ui=table] [role=row]", { w: false });
  for (const [i, h] of [":: Quote", ":: Customer", ":: Requested", ":: Status", ":: Total", ":: Margin"].entries())
    await sameStyle(h, page, { text: h }, { text: h, selector: "[data-ui=table] [role=columnheader]", nth: 0 }, { w: false,
      explained: { position: { frame: "static", app: "relative", why: "the header cell is a drag target and draws the drop line against itself (U0 DataTable, C_QOT6)" } } });
  await sameStyle("columns button", page, 'button[aria-label="Choose columns"]', '[data-ui=table] button[aria-label="Choose columns"]');
  // 14 rows, then "Show N more quotes" (C_QOTable: 13 rows and "Show 18 more quotes"; the counts are placeholders).
  const list = await page.evaluate(() => fetch("/api/rep/quotes").then((r) => r.json()));
  await expect(page.locator("[data-ui=table] [role=row]")).toHaveCount(1 + 14);
  await expect(page.locator("[data-ui=table] [data-ui=more]")).toHaveText(`Show ${list.rows.length - 14} more quotes`);
  const foot: Locate = { text: "Show 18 more quotes", up: 1 };
  expectSame("table foot", paired(await measure(framePage, foot)), paired(await measure(page, { selector: "[data-ui=table] [data-ui=more]", up: 1 })));
  await sameStyle("table foot", page, foot, { selector: "[data-ui=table] [data-ui=more]", up: 1 }, { w: false });
  await sameStyle("Show more quotes", page, { text: "Show 18 more quotes" }, "[data-ui=table] [data-ui=more]", { w: false });
  // Rows: the seeded Wasatch quotes are the frame's own shapes (plain, Draft ready with "Overdue. 1 line below floor",
  // Changes requested with Overdue and View note, Sent with Aging, Accepted).
  await showAllRows(page);
  for (const number of ["Q-24791", "Q-24817", "Q-24790", "Q-24789", "Q-24816"]) {
    expectSame(`row ${number}`, paired(await measure(framePage, frameRow(number))), paired(await measure(page, appRow(number))));
    await sameStyle(`row ${number}`, page, frameRow(number), appRow(number), { w: false });
  }
  // Fluid tracks keep the frame's proportions; the columns cell stays 28px; the table fills the page area.
  const tracks = async (p: Page, row: string) => p.locator(row).first().evaluate((el) => [...el.children].map((c) => c.getBoundingClientRect().width));
  await mark(framePage, head, "hr");
  const f = await tracks(framePage, '[data-m="hr"]');
  const a = await tracks(page, "[data-ui=table] [role=row]");
  expect(a.at(-1)).toBe(28);
  expect(f.at(-1)).toBe(28);
  for (let i = 1; i < 6; i++) expect(a[i]! / a[0]!).toBeCloseTo(f[i]! / f[0]!, 2);
  const fill = await page.evaluate(() => {
    const main = document.querySelector("main")!, cs = getComputedStyle(main);
    return { table: document.querySelector("[data-ui=table]")!.getBoundingClientRect().width, inner: main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) };
  });
  expect(fill.table).toBe(fill.inner);
});

test("C_QOT1 (manager): the filter panel over the table", async ({ browser }, testInfo) => {
  await frame("QOT1");
  const page = await appAs(browser, testInfo, "supplier", "/rep/quotes?view=table");
  await expectFilterPanel(page);
});

test("C_QOT2 (manager): the columns picker, with Rep, Valid until and Purchasing agent unticked; the choice is the user's own", async ({ browser }, testInfo) => {
  await frame("QOT2");
  const page = await appAs(browser, testInfo, "supplier", "/rep/quotes?view=table");
  await page.getByRole("button", { name: "Choose columns" }).click();
  await expect(page.getByRole("dialog", { name: "Choose columns" })).toBeVisible();
  await rest(page);
  const at: Locate = { text: "Choose columns", up: 1 };
  expectSame("columns picker", paired(await measure(framePage, at)), paired(await measure(page, "[data-ui=columns-picker]"), { "button|Reset to default": "span", "button|Done": "span" }));
  await sameStyle("columns picker", page, at, "[data-ui=columns-picker]", { h: false });
  // Show Rep: it saves and comes back after a reload.
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/rep/table-prefs") && r.request().method() === "PUT");
  await page.getByRole("checkbox", { name: "Rep" }).check({ force: true });
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(page.locator("[data-ui=table] [role=columnheader]")).toHaveText([":: Quote", ":: Customer", ":: Requested", ":: Status", ":: Total", ":: Margin", ":: Rep"]);
  await restoreOrder(page, "quotes");
});

test("C_QOT3 (manager): the quote preview from a table row", async ({ browser }, testInfo) => {
  await frame("QOT3");
  const page = await appAs(browser, testInfo, "supplier", "/rep/quotes?view=table");
  await showAllRows(page);
  await page.locator("[data-ui=table] [role=row]").filter({ hasText: /^Q-24790/ }).getByRole("cell").nth(1).click();
  await expectPreview(page, "Q-24790");
});

test("C_QOT4 (manager): View note from a table row", async ({ browser }, testInfo) => {
  await frame("QOT4");
  const page = await appAs(browser, testInfo, "supplier", "/rep/quotes?view=table");
  await showAllRows(page);
  await page.locator("[data-ui=table] [role=row]").filter({ hasText: /^Q-24790/ }).getByRole("button", { name: "View note" }).click();
  await expect(page.getByRole("dialog", { name: "Q-24790", exact: true })).toHaveCount(0);
  await expectNote(page);
});

test("C_QOT5 (manager): Show N more quotes shows every row, then Show fewer quotes", async ({ browser }, testInfo) => {
  await frame("QOT5");
  const page = await appAs(browser, testInfo, "supplier", "/rep/quotes?view=table");
  const total = (await page.evaluate(() => fetch("/api/rep/quotes").then((r) => r.json()))).rows.length;
  await page.locator("[data-ui=table] [data-ui=more]").click();
  await rest(page);
  await expect(page.locator("[data-ui=table] [role=row]")).toHaveCount(1 + total);
  const foot: Locate = { text: "Show fewer quotes", up: 1 };
  expectSame("table foot", paired(await measure(framePage, foot)), paired(await measure(page, { selector: "[data-ui=table] [data-ui=more]", up: 1 })));
  await sameStyle("Show fewer quotes", page, { text: "Show fewer quotes" }, "[data-ui=table] [data-ui=more]");
});

test("C_QOT6 (manager): dragging a column header lifts it and draws the drop line; the order is the user's own", async ({ browser }, testInfo) => {
  await frame("QOT6");
  const page = await appAs(browser, testInfo, "supplier", "/rep/quotes?view=table");
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const head = (name: string) => page.locator("[data-ui=table]").getByRole("columnheader", { name });
  await head("Status").dispatchEvent("dragstart", { dataTransfer });
  await head("Requested").dispatchEvent("dragover", { dataTransfer });
  await sameStyle("lifted header", page, { text: ":: Status" }, "[data-ui=table] [data-ui=lifted]", { w: true,
    props: ["transform", "boxShadow", "backgroundColor", "color", "paddingTop", "paddingLeft", "borderRadius", "fontSize", "fontWeight", "display"] });
  await sameStyle("drop line", page, { text: ":: Customer" }, "[data-ui=table] [data-drop=after]", { w: false,
    props: [...STYLE_PROPS, "borderRightWidth", "borderRightColor", "borderRightStyle", "paddingRight"] });
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/rep/table-prefs") && r.request().method() === "PUT");
  await head("Requested").dispatchEvent("drop", { dataTransfer });
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(page.locator("[data-ui=table] [role=columnheader]")).toHaveText([":: Quote", ":: Customer", ":: Status", ":: Requested", ":: Total", ":: Margin"]);
  await restoreOrder(page, "quotes");
});

test("C_QOT7 (manager): typing in the picker narrows it and counts the matches", async ({ browser }, testInfo) => {
  await frame("QOT7");
  const page = await appAs(browser, testInfo, "supplier", "/rep/quotes?view=table");
  // Two seeded customers match "Basin", as two of the frame's placeholders match "Wasat".
  await page.getByRole("combobox", { name: /^Customer/ }).fill("Basin");
  await expect(page.getByRole("option")).toHaveText(["Great Basin FabricationGBF-2207", "Weber Basin FabricatorsWBF-6074"]);
  await rest(page);
  const at: Locate = { text: "Wasat", up: 1 };
  // The frame draws the typed text and a caret as spans; the app has a real input holding the text.
  expectSame("picker, typed", paired(await measure(framePage, at)), paired(await measure(page, "[data-ui=picker]")), { missing: ['span "Wasat"'], extraKinds: ["input"] });
  await sameStyle("picker, typed", page, at, "[data-ui=picker]", { explained: { position: { frame: "static", app: "relative", why: "the list is placed against the box (U0)" } } });
  await sameStyle("typed text", page, { text: "Wasat" }, "[data-ui=picker] input", { w: false, h: false, props: ["color", "fontFamily", "fontSize", "fontWeight", "letterSpacing"] });
  await sameStyle("matches", page, { text: "2 matches" }, { text: "2 matches", selector: "[data-ui=picker] div" });
});

// ---- The rep (Mara; the frames draw "Brandi Gallegos" as the rep, a placeholder) ----

/** The frames' rep cards have two-line placeholder customers where Mara's (Canyon Ridge Builders) take one line. */
const TWO_LINES = { why: "the frame's placeholder customer wraps to two lines in its 236px lane; Mara's takes one" };

test("C_RQBoard (rep): All my customers, the six lanes with Mara's counts, cards of every shape", async ({ browser }, testInfo) => {
  await frame("RQBoard");
  const page = await appAs(browser, testInfo, "mara");
  await expectToolbar(page, { picker: "All my customers" });
  await expectLanes(page);
  await expectNothingAdded("C_RQBoard", page);
  const list = await page.evaluate(() => fetch("/api/rep/quotes").then((r) => r.json()));
  expect(list.rows.every((r: { rep_id: string }) => r.rep_id === "mara")).toBe(true);
  expect(await page.locator("section[data-lane] [data-ui=count]").allTextContents())
    .toEqual(["ready_for_review", "changes_requested", "sent", "accepted", "expired", "declined"].map((s) => String(list.counts[s])));
  const heights = (frameH: number) => ({ 'span "<customer>"': { frame: frameH, app: 16, ...TWO_LINES } });
  const plain = await findCard(page, { lane: "Accepted", flag: null });
  await sameStyle(`card ${plain}`, page, card("Q-24763"), appCard(plain), { w: false, h: false });
  expectSame(`card ${plain}`, paired(await measure(framePage, card("Q-24763"))), paired(await measure(page, appCard(plain))));
  for (const [frameNumber, shape] of [["Q-24789", { lane: "Sent", flag: /^Aging$/ }], ["Q-24790", { lane: "Changes requested", flag: /^Overdue$/, note: true }]] as const) {
    const number = await findCard(page, shape);
    expectSame(`card ${number} (frame ${frameNumber})`, paired(await measure(framePage, card(frameNumber))), paired(await measure(page, appCard(number))), { heights: heights(32) });
  }
});

test("C_RQB1 (rep): the picker lists only the rep's customers", async ({ browser }, testInfo) => {
  await frame("RQB1");
  const page = await appAs(browser, testInfo, "mara");
  await page.getByRole("combobox", { name: /^Customer/ }).click();
  // The frame's rep has three placeholder customers; Mara has one, so two rows are not there.
  await expectPicker(page, { text: "All my customers", selector: "main span", up: 1 },
    { missing: ['span "<customer>"', 'span "<account code>"', 'span "<customer>"', 'span "<account code>"'], why: "placeholder customers" });
  await expect(page.getByText("Your 1 customer. Type to search.")).toBeVisible();
  await expect(page.getByRole("option")).toHaveText(["All my customers", "Canyon Ridge BuildersCRB-3318"]);
});

test("C_RQB2 (rep): the filter panel without Rep", async ({ browser }, testInfo) => {
  await frame("RQB2");
  const page = await appAs(browser, testInfo, "mara");
  await expectFilterPanel(page, { rep: false });
});

test("C_RQTable (rep): the table without a Rep column, Mara's quotes only", async ({ browser }, testInfo) => {
  await frame("RQTable");
  const page = await appAs(browser, testInfo, "mara", "/rep/quotes?view=table");
  await expectToolbar(page, { tableFrame: true, picker: "All my customers" });
  await expectNothingAdded("C_RQTable", page);
  const head: Locate = { text: ":: Quote", up: 1 };
  expectSame("header row", paired(await measure(framePage, head)), paired(await measure(page, "[data-ui=table] [role=row]")));
  await page.getByRole("button", { name: "Choose columns" }).click();
  await expect(page.getByRole("dialog", { name: "Choose columns" }).getByRole("checkbox", { name: "Rep" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  const list = await page.evaluate(() => fetch("/api/rep/quotes").then((r) => r.json()));
  const shown = await page.locator("[data-ui=table] [role=row] [role=button]").allTextContents();
  expect(shown).toEqual(list.rows.slice(0, 14).map((r: { quote_number: string }) => r.quote_number));
  // Rows of each shape against the frame's (Mara's customer takes one line, as the frame's table rows do).
  const rows: [string, (r: { status: string; aging: { level: string } | null; change_request: unknown }) => boolean][] = [
    ["Q-24816", (r) => r.status === "accepted"],
    ["Q-24789", (r) => r.status === "sent" && r.aging?.level === "amber"],
    ["Q-24790", (r) => r.status === "changes_requested" && !!r.change_request],
  ];
  for (const [frameNumber, test] of rows) {
    const number = list.rows.find(test).quote_number;
    expectSame(`row ${number} (frame ${frameNumber})`, paired(await measure(framePage, frameRow(frameNumber))), paired(await measure(page, appRow(number))));
    await sameStyle(`row ${number}`, page, frameRow(frameNumber), appRow(number), { w: false });
  }
});
