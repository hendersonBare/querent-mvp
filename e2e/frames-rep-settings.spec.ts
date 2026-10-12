import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { FONT_USER_AGENT, STYLE_PROPS, diffMeasures, measureAll, openFrame, startFrameServer } from "../scripts/frames/lib.mjs";

// Frame proof for plan U9 (a rep's Settings, /rep/settings), rep (querent-persona=mara), at 1920x1080:
//   C_RS1 (Margins), C_RS2 (Profile), C_RS3 (Margins with a value below the organization floor),
//   C_RS4 (Notifications). C_RS2 is proven for the manager (querent-persona=supplier) too: decision 69 gives her
//   the rep's Profile tab, the same component, after her four tabs; the frame's tab bar is redrawn as hers
//   (her four tabs drawn as the frame's inactive tab, then its active Profile) before the comparison.
//
// How each frame is proven:
//   - The data is driven toward the frame's sample through the app's own routes: the manager sets the
//     organization floors C_RS1 draws (Abrasives and Cutting 25%, Safety and PPE 30%; the seed has the rest),
//     and Mara sets her own margins to the frame's (24, 27, 30, 22, 20, 23) through PUT /api/rep/settings/floors.
//     C_RS3 then types 28 into Safety and PPE, under its 30% floor. The frames draw the rep "Brandi Gallegos";
//     Mara's name, initials, phone and email are rewritten to the frame's sample (Appendix G: names are
//     placeholders), each rewrite listed with its reason and required to apply.
//   - The frame is opened at the app's viewport, 1920x1080: the frames are fluid (main is flex 1, the cards
//     flex), so both lay out at the same width and wrapping compares like for like (decision 51).
//   - Every element with text in `main`, its computed STYLE_PROPS and its height, both directions: nothing the
//     frame draws is missing or styled differently, and the app adds no text, icon or control the frame lacks.
//     Copy is compared literally, sentences whole (C_RS3's "Below the 30.0% organization floor. Pick 30.0% or
//     higher." comes from the real floor).
//   - Every element without text (the bars, their ticks, the legend's ticks, the avatar circle, the switches
//     and their knobs, the card and row boxes) is compared in order, both ways: its colour, border, radius,
//     width and height, and its left edge within the card (fixed and fluid widths alike, at the same viewport).
// Nothing here is a hard-coded style value: every value comes from the frames' live DOM.

const COOKIE = "querent-persona";
const APP_SIZE = { width: 1920, height: 1080 };
const SEED_DATE = "2026-09-23";
type Measure = { path: number; tag: string; text: string; rect: { x: number; y: number; w: number; h: number }; style: Record<string, string> };

let frames: { base: string; close: () => void };
let framePage: Page;
const contexts: BrowserContext[] = [];

test.beforeAll(async ({ browser }) => {
  frames = await startFrameServer();
  framePage = await (await browser.newContext({ viewport: APP_SIZE, userAgent: FONT_USER_AGENT })).newPage();
});
test.afterAll(async ({ browser }, testInfo) => {
  const context = await browser.newContext();
  await context.request.post(`${testInfo.project.use.baseURL}/api/test/reset`, { data: { seed_date: SEED_DATE } });
  await context.close();
  for (const c of contexts) await c.close();
  frames.close();
});

/** Hover is a state the frames do not draw: the pointer rests on the page's empty corner. */
async function rest(page: Page) {
  await page.mouse.move(1919, 1079);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/** C_RS1's sample through the app's routes: the organization floors it draws (as the manager), Mara's own margins (as Mara). */
async function marginsSample(manager: APIRequestContext, mara: APIRequestContext) {
  expect((await manager.put("/api/rep/settings/org-floors", { data: { floors: [{ category_id: "abrasives", floor_pct: 25 }, { category_id: "safety", floor_pct: 30 }] } })).status()).toBe(200);
  const floors = [["fasteners", 24], ["abrasives", 27], ["safety", 30], ["material-handling", 22], ["tools", 20], ["janitorial", 23]].map(([category_id, floor_pct]) => ({ category_id, floor_pct }));
  expect((await mara.put("/api/rep/settings/floors", { data: { floors } })).status()).toBe(200);
}

async function asRep(browser: Browser, baseURL: string, path: string, sample: boolean, persona = "mara") {
  const manager = await browser.newContext({ baseURL });
  contexts.push(manager);
  await manager.addCookies([{ name: COOKIE, value: "supplier", url: baseURL }]);
  expect((await manager.request.post("/api/test/reset", { data: { seed_date: SEED_DATE } })).status(), "POST /api/test/reset").toBe(200);
  const context = await browser.newContext({ viewport: APP_SIZE, baseURL });
  contexts.push(context);
  await context.addCookies([{ name: COOKIE, value: persona, url: baseURL }]);
  if (sample) await marginsSample(manager.request, context.request);
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await rest(page);
  return page;
}
const frame = (id: string) => openFrame(framePage, frames.base, id);

/** measureAll over `selector`; on the app side a field's text is its value, which is what it shows. */
async function measure(page: Page, selector: string, { app = false } = {}): Promise<Measure[]> {
  expect(await page.locator(selector).count(), `${selector} not found`).toBeGreaterThan(0);
  const fields = await page.evaluate(({ sel, app }) => {
    document.querySelectorAll("[data-m]").forEach((e) => e.removeAttribute("data-m"));
    document.querySelector(sel)!.setAttribute("data-m", "root");
    const out: { x: number; y: number; w: number; h: number; text: string }[] = [];
    if (!app) return out;
    const round = (n: number) => Math.round(n * 10) / 10;
    for (const input of document.querySelectorAll<HTMLInputElement>('[data-m="root"] input')) {
      const r = input.getBoundingClientRect();
      out.push({ x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height), text: input.value || input.placeholder });
    }
    return out;
  }, { sel: selector, app });
  const list: Measure[] = await page.evaluate(measureAll, { root: '[data-m="root"]', props: STYLE_PROPS });
  return list.map((m) => {
    if (m.tag !== "input") return m;
    const f = fields.find((x) => x.x === m.rect.x && x.y === m.rect.y && x.w === m.rect.w && x.h === m.rect.h);
    // A field shows its value right-aligned by text-align, where the frame's box does it with justify-content.
    return f ? { ...m, text: f.text, style: { ...m.style, textAlign: m.style.textAlign === "right" ? "start" : m.style.textAlign } } : m;
  });
}

/**
 * Semantic tags where the frame draws a plain box: links for the tabs, headings for card titles, buttons for the
 * actions the frame draws as spans, labels for a field's name, inputs for a field. An app element takes the
 * frame's tag when the frame has an element with the same text and that tag; its styles are still compared in full.
 */
const SEMANTIC = new Set(["a", "button", "label", "input", "h2", "h3"]);
function asFrameTags(frameList: Measure[], appList: Measure[]) {
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

/** One rewrite of the app's text to the frame's sample, with its reason; it must apply at least once. */
type Rewrite = { app: string | RegExp; frame: string; why: string };
function rewrite(list: Measure[], rewrites: Rewrite[], used: Set<Rewrite>) {
  return list.map((m) => {
    for (const r of rewrites) {
      if (!(typeof r.app === "string" ? m.text === r.app : r.app.test(m.text))) continue;
      used.add(r);
      return { ...m, text: r.frame };
    }
    return m;
  });
}

interface Explained {
  /** Extra controls the app has, by tag, and why. */
  kinds?: Record<string, { n: number; why: string }>;
}

/** Both directions. */
function expectSame(name: string, frameList: Measure[], appList: Measure[], explained: Explained = {}) {
  const forward = diffMeasures(frameList, appList);
  expect(forward.missing, `${name}: elements of the frame missing from the app`).toEqual([]);
  expect(forward.diffs, `${name}: style differences`).toEqual([]);
  const backward = diffMeasures(appList, frameList);
  expect(backward.missing, `${name}: text or controls the app adds that the frame lacks`).toEqual([]);
  expect(backward.diffs, `${name}: style differences, the other way`).toEqual([]);
  const kinds = (list: Measure[]) => list.filter((m) => ["svg", "button", "a", "input", "select", "img"].includes(m.tag)).map((m) => m.tag).sort();
  const extra = Object.entries(explained.kinds ?? {}).flatMap(([tag, { n }]) => Array(n).fill(tag));
  expect(kinds(appList), `${name}: icons and controls`).toEqual([...kinds(frameList), ...extra].sort());
  return { matched: forward.matched, missing: forward.missing.length, added: backward.missing.length };
}

/**
 * The elements without text (bars, ticks, swatches, the avatar circle, switches and knobs, card and row boxes),
 * in order: colour, borders, radius, size and left edge relative to `main`. The frame and the app lay out at
 * the same viewport, so every width, fixed or fluid, must match.
 */
async function textless(page: Page) {
  return page.evaluate(() => {
    const mainEl = document.querySelector("main")!, main = mainEl.getBoundingClientRect();
    // The page colour, from main or the nearest box behind it: a wrapper painting it again is invisible (the
    // app's page area and .ui-root wrappers paint it where the frame's one root does), so it counts as none.
    let behind: Element | null = mainEl;
    while (behind && getComputedStyle(behind).backgroundColor === "rgba(0, 0, 0, 0)") behind = behind.parentElement;
    const page = behind ? getComputedStyle(behind).backgroundColor : "";
    const out: string[] = [];
    const round = (n: number) => Math.round(n * 10) / 10;
    const walk = (el: Element) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
      const bg = cs.backgroundColor === page ? "rgba(0, 0, 0, 0)" : cs.backgroundColor;
      const filled = bg !== "rgba(0, 0, 0, 0)";
      const bordered = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0;
      const r = el.getBoundingClientRect();
      if (!own && (filled || bordered) && r.width > 0 && r.height > 0 && el.tagName !== "INPUT")
        out.push([bg, cs.borderTopWidth, cs.borderTopColor, cs.borderBottomWidth, cs.borderRadius, `w${round(r.width)}`, `h${round(r.height)}`, `x${round(r.x - main.x)}`].join(" "));
      for (const c of el.children) walk(c);
    };
    walk(document.querySelector("main")!);
    return out;
  });
}

/** The rail is 216px (U2) and the page area takes every other pixel (decision 51: fluid, no max-width). */
async function expectGeometry(page: Page) {
  const box = await page.evaluate(() => {
    const aside = document.querySelector("aside")!.getBoundingClientRect(), main = document.querySelector("main")!.getBoundingClientRect();
    return { aside: aside.width, mainX: main.x, mainW: main.width, vw: document.documentElement.clientWidth };
  });
  expect(box).toEqual({ aside: 216, mainX: 216, mainW: box.vw - 216, vw: box.vw });
}

/** Every own text under `main` in full (measureAll keeps 80 characters): sentences are compared whole. */
async function sentences(page: Page) {
  return page.evaluate(() => {
    const own = (el: Element) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()).join(" ").trim();
    return [...document.querySelectorAll("main *")].filter((e) => (e as HTMLElement).offsetParent !== null).map(own).filter((t) => t.length > 40);
  });
}

// The frame's sample words the seed does not have (Appendix G and catalog data).
const CATEGORY_NAMES: Rewrite[] = [
  ["Abrasives & Cutting", "Abrasives and Cutting"], ["Safety & PPE", "Safety and PPE"],
  ["Material Handling & Tie-downs", "Material Handling and Tie-downs"], ["Janitorial/MRO", "Janitorial and MRO"],
].map(([app, frame]) => ({ app, frame, why: "category names are catalog data (the frame writes and for & and /)" }));
const PROFILE_SAMPLE: Rewrite[] = [
  { app: "Mara Jensen", frame: "Brandi Gallegos", why: "the frames draw the rep view for Brandi Gallegos; names are placeholders (Appendix G)" },
  { app: "MJ", frame: "BG", why: "the avatar's initials follow the rep's name (placeholder, Appendix G)" },
  { app: "(801) 555-0102", frame: "(801) 555-0142", why: "Mara's phone where the frame samples Brandi's (placeholder)" },
  { app: "mara.jensen@herrickindustrial.com", frame: "brandi.gallegos@example.com", why: "Mara's email where the frame samples Brandi's (placeholder)" },
];
const MANAGER_PROFILE_SAMPLE: Rewrite[] = [
  { app: "(801) 111-2222", frame: "(801) 555-0142", why: "Brandi's seeded phone where the frame samples another (placeholder, Appendix G)" },
  { app: "brandi.gallegos@herrickindustrial.com", frame: "brandi.gallegos@example.com", why: "Brandi's seeded email where the frame samples example.com (placeholder, Appendix G)" },
];
/** The manager's tab bar (plan U8, then decision 69's Profile), in place of the rep's in C_RS2's frame. */
const MANAGER_TABS = ["Customer access", "Margin floors", "Pricing and delivery", "Aging"];
/** Redraws the frame's tab bar as the manager's: each of her four tabs a copy of the frame's inactive "Margins", then its active "Profile". */
async function managerTabBar() {
  const done = await framePage.evaluate((labels) => {
    const own = (el: Element) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()).join(" ").trim();
    const margins = [...document.querySelectorAll("main span")].find((e) => own(e) === "Margins");
    const bar = margins?.parentElement;
    const profile = bar && [...bar.children].find((t) => own(t) === "Profile");
    const notifications = bar && [...bar.children].find((t) => own(t) === "Notifications");
    if (!bar || !margins || !profile || !notifications) return false;
    for (const label of labels) {
      const tab = margins.cloneNode(true) as HTMLElement;
      tab.textContent = label;
      bar.insertBefore(tab, margins);
    }
    margins.remove();
    notifications.remove();
    return [...bar.children].map(own).join("|");
  }, MANAGER_TABS);
  expect(done, "the frame's tab bar redrawn as the manager's").toBe([...MANAGER_TABS, "Profile"].join("|"));
}
/** The switches are buttons (role switch) where the frame draws spans. */
const SWITCHES = { button: { n: 8, why: "the switches are buttons (role switch) where the frame draws spans" } };

interface Case {
  id: string;
  path: string;
  sample: boolean;
  /** The manager (decision 69) where the frame draws a rep: her tab bar replaces the rep's in the frame. */
  manager?: boolean;
  drive?: (page: Page) => Promise<void>;
  rewrites?: Rewrite[];
  explained?: Explained;
}

const CASES: Case[] = [
  { id: "RS1", path: "/rep/settings", sample: true, rewrites: CATEGORY_NAMES },
  { id: "RS2", path: "/rep/settings?tab=profile", sample: false, rewrites: PROFILE_SAMPLE },
  { id: "RS2", path: "/rep/settings?tab=profile", sample: false, rewrites: MANAGER_PROFILE_SAMPLE, manager: true },
  {
    id: "RS3", path: "/rep/settings", sample: true, rewrites: CATEGORY_NAMES,
    drive: async (page) => {
      const field = page.getByRole("textbox", { name: "Safety & PPE margin", exact: true });
      await field.fill("28.0");
      await expect(page.getByText("Below the 30.0% organization floor. Pick 30.0% or higher.", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Save margins" })).toBeDisabled();
      // Focus is a state the frame does not draw.
      await field.evaluate((el) => (el as HTMLInputElement).blur());
      await rest(page);
    },
  },
  { id: "RS4", path: "/rep/settings?tab=notifications", sample: false, explained: { kinds: SWITCHES } },
];

for (const c of CASES) {
  test(`C_${c.id} (${c.manager ? "manager, decision 69" : "rep"}): every element, style and word, both ways`, async ({ browser }, testInfo) => {
    await frame(c.id);
    if (c.manager) await managerTabBar();
    const page = await asRep(browser, String(testInfo.project.use.baseURL), c.path, c.sample, c.manager ? "supplier" : "mara");
    await expectGeometry(page);
    if (c.drive) await c.drive(page);
    const used = new Set<Rewrite>();
    const frameMain = await measure(framePage, "main");
    const appMain = asFrameTags(frameMain, rewrite(await measure(page, "main", { app: true }), c.rewrites ?? [], used));
    const result = expectSame(`C_${c.id}`, frameMain, appMain, c.explained);
    for (const r of c.rewrites ?? []) expect(used.has(r), `C_${c.id}: rewrite ${String(r.app)} -> ${r.frame} is used (${r.why})`).toBe(true);
    const say = (t: string) => (c.rewrites ?? []).reduce((acc, r) => (typeof r.app === "string" ? acc.split(r.app).join(r.frame) : acc), t);
    expect((await sentences(page)).map(say).sort(), `C_${c.id}: whole sentences`).toEqual((await sentences(framePage)).sort());
    const boxes = await textless(framePage);
    expect(boxes.length, `C_${c.id}: the frame has boxes without text to compare`).toBeGreaterThan(4);
    expect(await textless(page), `C_${c.id}: bars, ticks, switches, the avatar and the boxes`).toEqual(boxes);
    await testInfo.attach(`C_${c.id}${c.manager ? " manager" : ""} result`, { body: JSON.stringify({ ...result, boxes: boxes.length, rewrites: (c.rewrites ?? []).map((r) => ({ app: String(r.app), frame: r.frame, why: r.why })), explained: c.explained }, null, 1), contentType: "application/json" });
  });
}
