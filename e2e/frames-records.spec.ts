import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { FONT_USER_AGENT, FRAME_SIZE, STYLE_PROPS, diffMeasures, measureAll, openFrame, startFrameServer } from "../scripts/frames/lib.mjs";

// Frame proof for plan U5 (Customers, Orders, Stock), at 1920x1080 against the frames (drawn at 1440x900):
//   manager (querent-persona=supplier): C_CUBase, C_CU1, C_CU2, C_CU3, C_ORBase, C_OR1, C_OR2, C_STBase,
//   C_ST1, C_ST2, C_ST3; rep (querent-persona=mara): C_RCUBase, C_RCU1.
// For each frame the spec drives the app into the frame's state, measures the page area (`main`) on both
// sides with scripts/frames/lib.mjs and compares every element's computed style both ways: nothing the
// frame draws is missing or styled differently, and the app adds no text, icon or control the frame lacks.
// Copy is compared literally. The only rewrites are listed per frame with their reason (the frames'
// sample data, Appendix G, or a decision); each must actually apply, so a stale one fails too.
// The seed is reset to 2026-10-09, the day the frames' order history is drawn from (SO-51223 on Sep 25).

const COOKIE = "querent-persona";
const APP_SIZE = { width: 1920, height: 1080 };
const SEED_DATE = "2026-10-09";

type Measure = { path: number; tag: string; text: string; rect: { x: number; y: number; w: number; h: number }; style: Record<string, string> };

let frames: { base: string; close: () => void };
let framePage: Page;
const contexts: BrowserContext[] = [];


test.beforeAll(async ({ browser }, testInfo) => {
  frames = await startFrameServer();
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

async function appAs(browser: Browser, testInfo: TestInfo, persona: string, path: string) {
  const baseURL = String(testInfo.project.use.baseURL);
  const context = await browser.newContext({ viewport: APP_SIZE, baseURL });
  contexts.push(context);
  await context.addCookies([{ name: COOKIE, value: persona, url: baseURL }]);
  const page = await context.newPage();
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  await rest(page);
  return page;
}
/** Hover is a state the frames do not draw: keep the pointer on the page's empty corner. */
const rest = (page: Page) => page.mouse.move(1919, 1079);
const frame = (id: string) => openFrame(framePage, frames.base, id);

/**
 * measureAll over `selector`. On the app side, the controls behind a drawn box are left out while
 * measuring (the search field over the frame's box, the checkboxes under the drawn squares: each is the
 * frame's box made usable), and a text field's text is its value or placeholder, which is what it shows.
 */
async function measure(page: Page, selector: string, { app = false } = {}): Promise<Measure[]> {
  expect(await page.locator(selector).count(), `${selector} not found`).toBeGreaterThan(0);
  const fields = await page.evaluate(({ sel, app }) => {
    document.querySelectorAll("[data-m]").forEach((e) => e.removeAttribute("data-m"));
    document.querySelector(sel)!.setAttribute("data-m", "root");
    const out: { x: number; y: number; w: number; h: number; text: string }[] = [];
    if (!app) return out;
    for (const input of document.querySelectorAll<HTMLInputElement>('[data-m="root"] input, [data-ui="add-to-quote"] input')) {
      const r = input.getBoundingClientRect();
      if (input.closest('[data-ui="search"], [data-ui="picker"]') || r.width <= 1 || r.height <= 1) { input.style.visibility = "hidden"; input.dataset.hiddenForMeasure = "1"; continue; }
      const round = (n: number) => Math.round(n * 10) / 10;
      out.push({ x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height), text: input.value || input.placeholder });
    }
    return out;
  }, { sel: selector, app });
  const list: Measure[] = await page.evaluate(measureAll, { root: '[data-m="root"]', props: STYLE_PROPS });
  if (app) await page.evaluate(() => document.querySelectorAll<HTMLInputElement>("[data-hidden-for-measure]").forEach((i) => { i.style.visibility = ""; delete i.dataset.hiddenForMeasure; }));
  return list.map((m) => {
    if (m.tag !== "input") return m;
    const f = fields.find((x) => x.x === m.rect.x && x.y === m.rect.y && x.w === m.rect.w && x.h === m.rect.h);
    return f ? { ...m, text: f.text } : m;
  });
}

/**
 * Semantic tags where the frame draws a plain box: links (a) for names that open their record, h2 for card
 * titles, dt and dd for label and value rows, address, label, and buttons where the frame draws a span.
 * An app element takes the frame's tag when the frame has an element with the same text and that tag;
 * its computed styles are still compared in full.
 */
const SEMANTIC = new Set(["a", "h2", "dt", "dd", "address", "label", "button", "input"]);
function asFrameTags(frameList: Measure[], appList: Measure[]) {
  // Per text: the frame's tags not already matched by an app element with the same tag go to the app's
  // semantic elements, in order (a span or div only).
  const left = new Map<string, string[]>();
  for (const f of frameList) if (f.text) (left.get(f.text) ?? left.set(f.text, []).get(f.text)!).push(f.tag);
  for (const a of appList) {
    const tags = left.get(a.text);
    if (!a.text || !tags || SEMANTIC.has(a.tag)) continue;
    const i = tags.indexOf(a.tag);
    if (i >= 0) tags.splice(i, 1);
  }
  return appList.map((a) => {
    if (!a.text || !SEMANTIC.has(a.tag)) return a;
    const tags = left.get(a.text);
    if (!tags) return a;
    const same = tags.indexOf(a.tag);
    if (same >= 0) { tags.splice(same, 1); return a; }
    const plain = tags.findIndex((t) => t === "div" || t === "span");
    if (plain < 0) return a;
    const [tag] = tags.splice(plain, 1);
    return { ...a, tag };
  });
}

/**
 * One rewrite of the app's text to the frame's sample, with its reason; it must apply at least once.
 * `frame` as a list rewrites the matches in order (the frame's samples by place); `nth` rewrites only that match.
 */
type Rewrite = { app: string | RegExp; frame: string | string[]; nth?: number; tag?: string; why: string };
function rewrite(list: Measure[], rewrites: Rewrite[], used: Set<Rewrite>) {
  const seen = new Map<Rewrite, number>();
  return list.map((m) => {
    for (const r of rewrites) {
      if (r.tag && m.tag !== r.tag) continue;
      if (!(typeof r.app === "string" ? m.text === r.app : r.app.test(m.text))) continue;
      const k = seen.get(r) ?? 0;
      seen.set(r, k + 1);
      if (r.nth !== undefined && r.nth !== k) continue;
      const to = Array.isArray(r.frame) ? r.frame[k] : r.frame;
      if (to === undefined) continue;
      used.add(r);
      return { ...m, text: to };
    }
    return m;
  });
}

interface Explained {
  /** Element texts whose height may differ, and why (a line that wraps at 1440 fits on one line at 1920). */
  heights?: Record<string, string>;
  /** Frame texts that the app does not draw, and why. */
  missing?: Record<string, string>;
  /** App texts the frame does not draw, and why. */
  added?: Record<string, string>;
  /** Extra controls the app has, by tag, and why (in `why`). */
  kinds?: Record<string, number>;
  /** Style differences on one element ("tag \"text\"" -> prop -> reason), each must match exactly. */
  styles?: Record<string, Record<string, { frame: string; app: string; why: string }>>;
}

/** Both directions, with the explained differences taken out; every explanation must be used (none is stale). */
function expectSame(name: string, frameList: Measure[], appList: Measure[], explained: Explained = {}) {
  const used = new Set<string>();
  const forward = diffMeasures(frameList, appList);
  const missing = forward.missing.filter((m: string) => {
    if (!(m in (explained.missing ?? {}))) return true;
    used.add(`missing ${m}`);
    return false;
  });
  expect(missing, `${name}: elements of the frame missing from the app`).toEqual([]);
  const diffs = forward.diffs.map((d: Record<string, unknown> & { element: string }) => {
    const rest: Record<string, unknown> = { ...d };
    delete rest.element;
    const height = Object.keys(explained.heights ?? {}).find((t) => d.element.endsWith(`"${t}"`));
    if (rest.height && height) { delete rest.height; used.add(`height ${height}`); }
    for (const [prop, ok] of Object.entries(explained.styles?.[d.element] ?? {})) {
      const v = rest[prop] as { frame: string; app: string } | undefined;
      if (v && v.frame === ok.frame && v.app === ok.app) { delete rest[prop]; used.add(`style ${d.element} ${prop}`); }
    }
    return Object.keys(rest).length ? { element: d.element, ...rest } : null;
  }).filter(Boolean);
  expect(diffs, `${name}: style differences`).toEqual([]);
  const backward = diffMeasures(appList, frameList);
  const added = backward.missing.filter((m: string) => {
    if (!(m in (explained.added ?? {}))) return true;
    used.add(`added ${m}`);
    return false;
  });
  expect(added, `${name}: text or controls the app adds that the frame lacks`).toEqual([]);
  // Text-less controls (icons, buttons, fields) too: the same count of each kind, after the explained extras.
  const kinds = (list: Measure[]) => list.filter((m) => ["svg", "button", "a", "input", "select"].includes(m.tag)).map((m) => m.tag).sort();
  const extra = Object.entries(explained.kinds ?? {}).flatMap(([tag, n]) => Array(n).fill(tag));
  expect(kinds(appList), `${name}: icons and controls`).toEqual([...kinds(frameList), ...extra].sort());
  const stale = [
    ...Object.keys(explained.missing ?? {}).map((k) => `missing ${k}`),
    ...Object.keys(explained.added ?? {}).map((k) => `added ${k}`),
    ...Object.keys(explained.heights ?? {}).map((k) => `height ${k}`),
    ...Object.entries(explained.styles ?? {}).flatMap(([el, props]) => Object.keys(props).map((p) => `style ${el} ${p}`)),
  ].filter((k) => !used.has(k));
  expect(stale, `${name}: explanations that no longer apply`).toEqual([]);
  return { matched: forward.matched, missing: forward.missing.length, added: backward.missing.length };
}

/** The rail is 216px (U2) and the page area takes every other pixel (decision 51: fluid, no max-width). */
async function expectGeometry(page: Page) {
  const box = await page.evaluate(() => {
    const aside = document.querySelector("aside")!.getBoundingClientRect(), main = document.querySelector("main")!.getBoundingClientRect();
    return { aside: aside.width, mainX: main.x, mainW: main.width, vw: document.documentElement.clientWidth };
  });
  expect(box).toEqual({ aside: 216, mainX: 216, mainW: box.vw - 216, vw: box.vw });
}

/** Width of an element on each side, for the frames' fixed widths. */
async function widthOf(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => Math.round(el.getBoundingClientRect().width * 10) / 10);
}

/** Removes frame elements that are sample data the app's real data does not have (each listed with its reason). */
async function dropFromFrame(selectorText: { text: string; up: number }[]) {
  for (const { text, up } of selectorText) {
    const removed = await framePage.evaluate(({ text, up }) => {
      const own = (el: Element) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()).join(" ").trim();
      let el: Element | null = [...document.querySelectorAll("body *")].find((e) => own(e) === text) ?? null;
      for (let i = 0; el && i < up; i++) el = el.parentElement;
      if (!el) return false;
      el.remove();
      return true;
    }, { text, up });
    expect(removed, `frame element "${text}" to drop`).toBe(true);
  }
}

interface Case {
  id: string;
  persona: "supplier" | "mara";
  path: string;
  /** Drives the app into the frame's state. */
  drive?: (page: Page) => Promise<void>;
  /** The frame's sample rows the seed does not have (Appendix G), removed before measuring. */
  drop?: { text: string; up: number; why: string }[];
  rewrites?: Rewrite[];
  explained?: Explained;
  /** Rewrites for the dialog only (C_ST3). */
  dialogRewrites?: Rewrite[];
  /** Fixed widths the frame sets (selector on the frame, selector on the app). */
  widths?: [string, string][];
}

const FILTER = 'button:has-text("Filter")';
/** The filter panels are 400px wide in C_CU1, C_RCU1, C_OR1 and C_ST1. */
const FRAME_PANEL = 'div[style*="width: 400px"]';
const appPanel = (name: string) => `[role="dialog"][aria-label="${name}"]`;

async function openFilter(page: Page) {
  await page.locator("main").locator(FILTER).first().click();
  await rest(page);
  await expect(page.getByRole("dialog", { name: /^Filter / })).toBeVisible();
}

/** The frames draw the rep's pages for "Brandi Gallegos" and every customer's rep as Brandi, Eli or Nora (Appendix G: roles and names). */
const CANYON_REP: Rewrite = { app: "Mara Jensen", frame: "Brandi Gallegos", tag: "div", why: "the frame draws Canyon Ridge as Brandi's customer; the seed gives it to Mara Jensen" };
/** The seed's aging quotes are dated from the reset time, so their requested days follow the clock. */
const NOW_DAY = /^[A-Z][a-z]{2} \d{1,2}, 2026$/;
/** The seed links SO-51214 to Q-24806; the frame's sample row leaves the quote out (its other rows name theirs). */
const SO_51214: Rewrite = { app: "PO 7768, from Q-24806", frame: "PO 7768", why: "the seed links SO-51214 to Q-24806; the frame's sample row omits it" };
const WRAP = "wraps to two lines in the frame's 1440px column, one line in the wider 1920px column";

const CASES: Case[] = [
  {
    id: "CUBase", persona: "supplier", path: "/rep/customers",
    rewrites: [CANYON_REP],
    widths: [['div:has(> span:text-is("Search customers"))', '[data-ui="search"]']],
  },
  {
    id: "CU1", persona: "supplier", path: "/rep/customers",
    drive: async (page) => {
      await openFilter(page);
      // The frame draws Brandi and Eli picked (not applied yet: the list still shows everyone).
      await page.getByRole("checkbox", { name: /^Brandi Gallegos/ }).check({ force: true });
      await page.getByRole("checkbox", { name: /^Eli Porter/ }).check({ force: true });
      await rest(page);
    },
    // The frame's three reps with 3, 2 and 1 customers are samples; the seed has four reps with 2, 2, 1 and 1.
    drop: [{ text: "Nora Chen", up: 1, why: "the frame's third rep row; the seed's reps pair by name below" }],
    rewrites: [CANYON_REP, { app: "2", frame: "3", nth: 0, why: "Brandi has 2 customers in the seed; the frame's sample counts 3 (Canyon Ridge drawn as hers)" }],
    explained: {
      added: { 'span "Mara Jensen"': "a fourth rep in the seed (the frame draws three)", 'span "Nora Chen"': "a fourth rep in the seed (the frame draws three)", 'span "1"': "their counts" },
    },
    widths: [[FRAME_PANEL, appPanel("Filter customers")]],
  },
  {
    id: "CU2", persona: "supplier", path: "/rep/customers",
    drive: async (page) => {
      await openFilter(page);
      await page.getByRole("checkbox", { name: /^Brandi Gallegos/ }).check({ force: true });
      await page.getByRole("checkbox", { name: /^Eli Porter/ }).check({ force: true });
      await page.getByRole("button", { name: "Apply filters" }).click();
      await rest(page);
    },
    drop: [{ text: "Canyon Ridge Builders", up: 2, why: "the frame draws Canyon Ridge as Brandi's; it is Mara Jensen's in the seed, so the filter leaves it out" }],
    rewrites: [{ app: "4 customers", frame: "5 customers", why: "Brandi and Eli have 4 customers in the seed; the frame's sample counts 5 (Canyon Ridge drawn as Brandi's)" }],
  },
  {
    id: "CU3", persona: "supplier", path: "/rep/customers/canyon-ridge",
    rewrites: [
      { app: ", rep Mara Jensen, Net 30", frame: ", rep Brandi Gallegos, Net 30", why: CANYON_REP.why },
      { app: "Mara Jensen", frame: "Brandi Gallegos", why: CANYON_REP.why },
      { app: "(801) 555-0102", frame: "(801) 111-2222", why: "the rep card shows the real rep's phone (Mara Jensen)" },
      { app: "mara.jensen@herrickindustrial.com", frame: "brandi.gallegos@herrickindustrial.com", why: "the rep card shows the real rep's email" },
      { app: NOW_DAY, frame: ["Oct 10, 2026", "Oct 10, 2026", "Oct 9, 2026", "Oct 9, 2026", "Oct 8, 2026"], why: "the seed's open quotes are dated from the reset time (the clock), the frame's days are samples: compared by place" },
    ],
    widths: [['section:has(> div > span:text-is("Account"))', 'section[aria-labelledby="customer-account"]']],
  },
  {
    id: "RCUBase", persona: "mara", path: "/rep/customers",
    drop: [
      { text: "Great Basin Fabrication", up: 2, why: "the frame draws the rep as Brandi with three customers; Mara's book has one, Canyon Ridge" },
      { text: "Wasatch Mechanical Contractors", up: 2, why: "as above" },
    ],
    rewrites: [
      { app: "1 customer", frame: "3 customers", why: "Mara has one customer in the seed; the frame's rep (Brandi) has three" },
      { app: "18", frame: "23", why: "a rep's Quotes count is their own quotes (task U1): 18 of Canyon Ridge's 23 are Mara's" },
    ],
  },
  {
    id: "RCU1", persona: "mara", path: "/rep/customers",
    drive: openFilter,
    drop: [
      { text: "Great Basin Fabrication", up: 2, why: "as C_RCUBase" },
      { text: "Wasatch Mechanical Contractors", up: 2, why: "as C_RCUBase" },
      { text: "Net 45", up: 1, why: "the Terms are the terms Mara's customers have: Net 30 only (the frame's rep has Net 45 and placeholder customers)" },
      { text: "Not on file", up: 1, why: "as above" },
    ],
    rewrites: [
      { app: "1 customer", frame: "3 customers", why: "as C_RCUBase" },
      { app: "18", frame: "23", why: "as C_RCUBase" },
      { app: "$40,000.00", frame: "$50,000.00", why: "Open balance to shows the highest credit limit in the list: Canyon Ridge's $40,000.00 for Mara" },
    ],
    widths: [[FRAME_PANEL, appPanel("Filter customers")]],
  },
  {
    id: "ORBase", persona: "supplier", path: "/rep/orders",
    rewrites: [SO_51214],
    explained: { heights: { "Wasatch Mechanical Contractors": WRAP } },
    widths: [['div:has(> span:text-is("All customers"))', '[data-ui="picker"]']],
  },
  {
    id: "OR1", persona: "supplier", path: "/rep/orders",
    drive: async (page) => {
      await openFilter(page);
      // The frame draws Delivery and SLC picked.
      await page.getByRole("checkbox", { name: "Delivery" }).check({ force: true });
      await page.getByRole("checkbox", { name: "SLC" }).check({ force: true });
      await rest(page);
    },
    rewrites: [SO_51214],
    explained: {
      heights: { "Wasatch Mechanical Contractors": WRAP },
      // The native date field shows the browser's own empty format; the frame's two days are sample values.
      missing: { 'div "Jan 1, 2026"': "an empty native date field (the frame's day is a sample)", 'div "Oct 10, 2026"': "as above" },
      added: { 'span "Mara Jensen"': "a fourth rep in the seed (the frame draws three)" },
      // The two native date fields (the frame draws two boxes with sample days).
      kinds: { input: 2 },
    },
    widths: [[FRAME_PANEL, appPanel("Filter orders")]],
  },
  {
    id: "OR2", persona: "supplier", path: "/rep/orders/SO-51223",
    widths: [['section:has(> div > span:text-is("Order details"))', 'section[aria-labelledby="order-facts"]']],
  },
  {
    id: "STBase", persona: "supplier", path: "/rep/stock",
    explained: { heights: { "Hex cap screw 1/2-13 x 1-1/2 in, Grade 8, yellow zinc": WRAP } },
    widths: [['div:has(> span:text-is("Search SKU or item name"))', '[data-ui="search"]'], ['button:text-is("Add to quote")', 'main button:text-is("Add to quote")']],
  },
  {
    id: "ST1", persona: "supplier", path: "/rep/stock",
    drive: async (page) => {
      await openFilter(page);
      await page.getByRole("checkbox", { name: /^Fasteners/ }).check({ force: true });
      await rest(page);
    },
    rewrites: [
      { app: "Abrasives & Cutting", frame: "Abrasives and Cutting", why: "category names are catalog data (the frame writes and for &)" },
      { app: "Safety & PPE", frame: "Safety and PPE", why: "as above" },
      { app: "Material Handling & Tie-downs", frame: "Material Handling and Tie-downs", why: "as above" },
      { app: "Janitorial/MRO", frame: "Janitorial and MRO", why: "as above" },
      { app: "$121.00", frame: "$500.00", why: "List price to shows the highest list price in the catalog; the frame's $500.00 is a sample" },
    ],
    explained: { heights: { "Hex cap screw 1/2-13 x 1-1/2 in, Grade 8, yellow zinc": WRAP } },
    widths: [[FRAME_PANEL, appPanel("Filter stock")]],
  },
  {
    id: "ST2", persona: "supplier", path: "/rep/stock/ANC-12-414-W",
    widths: [['section:has(> div > span:text-is("Item details"))', 'section[aria-labelledby="item-facts"]']],
  },
  {
    id: "ST3", persona: "supplier", path: "/rep/stock/ANC-12-414-W",
    drive: async (page) => {
      await page.locator("main").getByRole("button", { name: "Add to quote" }).click();
      await rest(page);
      await expect(page.getByRole("dialog", { name: "Add to quote" })).toBeVisible();
    },
    drop: [{ text: "Q-24785", up: 3, why: "a manager adds only to their own drafts (decision 22): Brandi has two (Q-24817, Q-24790); the frame lists other reps' drafts" }],
    dialogRewrites: [
      { app: ", Wasatch Mechanical Contractors", frame: [", Wasatch Mechanical Contractors", ", Canyon Ridge Builders"], why: "the second draft is Brandi's Q-24790 (Wasatch); the frame's is another rep's Q-24788" },
      { app: "Q-24790", frame: "Q-24788", why: "as above" },
      { app: /^Changes requested, \d+ lines?$/, frame: "Draft ready, 3 lines", why: "as above" },
      { app: /^\$[\d,]+\.\d\d$/, frame: ["$1,122.40", "Not sent"], why: "the drafts' totals by place: Q-24817 is the frame's own $1,122.40; Q-24790's real draft total stands for the frame's Not sent" },
      { app: "1", frame: "2", why: "the quantity starts at 1 (the frame's 2 is a sample)" },
    ],
    explained: {
      // The frame right-aligns the quantity box's text with flex (justify-content: flex-end); a text field
      // aligns its own text with text-align.
      styles: { 'div "2"': { textAlign: { frame: "start", app: "right", why: "the quantity is a text field: text-align right where the frame's box uses justify-content: flex-end" } } },
    },
    widths: [['div[style*="width: 580px"]', '[data-ui="add-to-quote"]']],
  },
];

for (const c of CASES) {
  test(`C_${c.id} (${c.persona === "mara" ? "rep" : "manager"}): every element, style and word, both ways`, async ({ browser }, testInfo) => {
    await frame(c.id);
    if (c.drop?.length) await dropFromFrame(c.drop);
    const page = await appAs(browser, testInfo, c.persona, c.path);
    await expectGeometry(page);
    if (c.drive) await c.drive(page);
    const scope = "main";
    const frameList: Measure[] = await framePage.evaluate(measureAll, { root: scope, props: STYLE_PROPS });
    // ST3's dialog sits outside main in both (a sibling of main in the frame, portalled to body in the app).
    const extraFrame: Measure[] = c.id === "ST3" ? await measure(framePage, 'div[style*="width: 580px"]') : [];
    const used = new Set<Rewrite>();
    const extraApp: Measure[] = c.id === "ST3" ? rewrite(await measure(page, '[data-ui="add-to-quote"]', { app: true }), c.dialogRewrites ?? [], used) : [];
    let appList = [...rewrite(await measure(page, scope, { app: true }), c.rewrites ?? [], used), ...extraApp];
    const allFrame = [...frameList, ...extraFrame];
    appList = asFrameTags(allFrame, appList);
    const result = expectSame(`C_${c.id}`, allFrame, appList, c.explained);
    for (const r of [...(c.rewrites ?? []), ...(c.dialogRewrites ?? [])]) expect(used.has(r), `C_${c.id}: rewrite ${String(r.app)} -> ${String(r.frame)} is used (${r.why})`).toBe(true);
    for (const [frameSel, appSel] of c.widths ?? []) expect(await widthOf(page, appSel), `C_${c.id}: fixed width of ${appSel}`).toBe(await widthOf(framePage, frameSel));
    if (c.id === "ST3") {
      // Centred, 120px from the top, over the dimmed page, as drawn.
      const place = (p: Page, sel: string) => p.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, centre: Math.round(r.left + r.width / 2 - window.innerWidth / 2) }; });
      expect(await place(page, '[data-ui="add-to-quote"]')).toEqual(await place(framePage, 'div[style*="width: 580px"]'));
      expect(await page.locator('[data-ui="add-to-quote-backdrop"]').evaluate((el) => getComputedStyle(el).backgroundColor))
        .toBe(await framePage.locator('div[style*="z-index: 20"]').evaluate((el) => getComputedStyle(el).backgroundColor));
    }
    if (c.widths?.some(([f]) => f === FRAME_PANEL)) {
      // The panel opens 48px under the Filter button's top, at its left edge.
      const under = (p: Page, panel: string) => p.evaluate((sel) => {
        const button = [...document.querySelectorAll("main button")].find((b) => b.textContent?.startsWith("Filter"))!.getBoundingClientRect();
        const r = document.querySelector(sel)!.getBoundingClientRect();
        return { top: Math.round(r.top - button.top), left: Math.round(r.left - button.left) };
      }, panel);
      const name = c.widths.find(([f]) => f === FRAME_PANEL)![1];
      expect(await under(page, name)).toEqual(await under(framePage, FRAME_PANEL));
    }
    await testInfo.attach(`C_${c.id} result`, { body: JSON.stringify({ ...result, rewrites: (c.rewrites ?? []).map((r) => ({ app: String(r.app), frame: r.frame, why: r.why })), drop: c.drop, explained: c.explained }, null, 1), contentType: "application/json" });
  });
}
