import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { FONT_USER_AGENT, STYLE_PROPS, diffMeasures, measureAll, openFrame, startFrameServer } from "../scripts/frames/lib.mjs";

// Frame proof for plan U8 (manager Settings, /rep/settings), manager (querent-persona=supplier), at 1920x1080:
//   C_S1 (Customer access), C_S1a (its filter open), C_S1b (filter applied), C_S2 (Margin floors), C_S3 (review
//   a rep, the rep list open), C_S4 (Pricing and delivery, the feature flags off: the real default), C_S5 and
//   C_S6 (the same page with the flags on, scrolled to Free delivery pricing and to the pool and cost model),
//   C_S7 (the impact preview), C_S8 (Aging). The frames draw the manager's four tabs; decision 69 adds her own
//   Profile tab after them, so each frame's tab bar takes one more tab drawn its way (addProfileTab). The
//   Profile tab itself is C_RS2's layout, proven in e2e/frames-rep-settings.spec.ts for the manager too.
//
// The feature flags (decision 48) are environment variables read on the server, so this spec starts two
// production servers of its own (the build Playwright already needs), each on a free port with its own
// database: one with every flag off (C_S1 to C_S4, C_S8) and one with every flag on (C_S5 to C_S7). It does
// not use the configured server, so it holds whatever flags that one runs with. The database is seeded two
// days before today, so the seeded UT fuel price reads "2 days old" as C_S6 samples it.
//
// How each frame is proven:
//   - The data is driven toward the frame's sample through the app's own routes (two customers with Pricing
//     not shared for C_S1b; the organization floors and Eli's own margins of C_S2; free delivery pricing on,
//     after the impact preview, for C_S5 to C_S7), then the page is driven into the frame's state.
//   - The frame is opened at the app's viewport, 1920x1080: the frames are fluid (main is flex 1, the cards
//     flex), so both lay out at the same width and wrapping compares like for like (decision 51).
//   - Every element with text in `main` (and the dialog, outside main in both), its computed STYLE_PROPS and
//     its height, both directions: nothing the frame draws is missing or styled differently, and the app adds
//     no text, icon or control the frame lacks. Copy is compared literally; sentences longer than measureAll
//     keeps are compared whole. Every rewrite of the app's data to the frame's sample is listed with its
//     reason and must apply.
//   - The design markers never render (decision 50): the "FEATURE FLAG: HIDDEN" badges are taken out of the
//     frame and must be absent from the app; with the flags off (C_S4) the frame's three flagged sections are
//     taken out and must be absent from the app.
// Nothing here is a hard-coded style value: every value comes from the frames' live DOM.

const COOKIE = "querent-persona";
const APP_SIZE = { width: 1920, height: 1080 };
type Measure = { path: number; tag: string; text: string; rect: { x: number; y: number; w: number; h: number }; style: Record<string, string> };
const FLAGS = ["FEATURE_FREE_DELIVERY_PRICING", "FEATURE_RECOVERY_POOL", "FEATURE_DELIVERY_COST_MODEL"] as const;
/** Two days before today (UTC): the seeded fuel price's age in C_S6. */
const SEED_DATE = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);

let frames: { base: string; close: () => void };
let framePage: Page;
const contexts: BrowserContext[] = [];
type App = { url: string; db: string; process: ChildProcess; flags: boolean };
const apps: Record<"off" | "on", App | null> = { off: null, on: null };

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

function appEnv(db: string, flags: boolean, port?: number): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env, DATABASE_PATH: db, QUERENT_SEED_DATE: SEED_DATE, QUERENT_SCRIPTED: "1", QUERENT_E2E_RESET: "1",
    ANTHROPIC_API_KEY: "", OILPRICEAPI_KEY: "", NEXT_TELEMETRY_DISABLED: "1",
  };
  for (const name of FLAGS) env[name] = flags ? "1" : "";
  if (port) env.PORT = String(port);
  return env;
}

/** A production server of this build with every flag on or off, on a free port, its database freshly seeded. */
async function startApp(flags: boolean): Promise<App> {
  const db = join(tmpdir(), `querent-frames-settings-${flags ? "on" : "off"}-${process.pid}.sqlite`);
  const reset = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/reset-db.ts"], { env: appEnv(db, flags), encoding: "utf8" });
  expect(reset.status, `db:reset for the flags-${flags ? "on" : "off"} server: ${reset.stderr}`).toBe(0);
  const port = await freePort();
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "--hostname", "127.0.0.1"], { env: appEnv(db, flags, port), stdio: "ignore" });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 240; i++) {
    const up = await fetch(url).then((r) => r.status > 0).catch(() => false);
    if (up) return { url, db, process: child, flags };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error(`The flags-${flags ? "on" : "off"} server did not start at ${url} (run npm run build first)`);
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  frames = await startFrameServer();
  framePage = await (await browser.newContext({ viewport: APP_SIZE, userAgent: FONT_USER_AGENT })).newPage();
  [apps.off, apps.on] = await Promise.all([startApp(false), startApp(true)]);
});
test.afterAll(async () => {
  for (const c of contexts) await c.close();
  for (const app of Object.values(apps)) {
    if (!app) continue;
    app.process.kill();
    for (const suffix of ["", "-wal", "-shm"]) rmSync(app.db + suffix, { force: true });
  }
  frames.close();
});

/** Hover is a state the frames do not draw: the pointer rests on the page's empty corner. */
async function rest(page: Page) {
  await page.mouse.move(1919, 1079);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

type Setup = (api: APIRequestContext, as: (persona: string) => Promise<APIRequestContext>) => Promise<void>;

async function appAs(browser: Browser, which: "off" | "on", path: string, setup?: Setup) {
  const app = apps[which]!;
  const context = await browser.newContext({ viewport: APP_SIZE, baseURL: app.url });
  contexts.push(context);
  await context.addCookies([{ name: COOKIE, value: "supplier", url: app.url }]);
  expect((await context.request.post("/api/test/reset", { data: { seed_date: SEED_DATE } })).status(), "POST /api/test/reset").toBe(200);
  const as = async (persona: string) => {
    const other = await browser.newContext({ baseURL: app.url });
    contexts.push(other);
    await other.addCookies([{ name: COOKIE, value: persona, url: app.url }]);
    return other.request;
  };
  if (setup) await setup(context.request, as);
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await rest(page);
  return page;
}
const frame = (id: string) => openFrame(framePage, frames.base, id);

/**
 * measureAll over `selector`. On the app side, the inputs behind a drawn box are left out while measuring
 * (the search fields over the frame's boxes, each the frame's box made usable), and a field's text is its
 * value or placeholder, which is what it shows.
 */
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
      // Left out, not hidden: hiding a focused field would blur it and close its list (C_S3).
      const skip = !!input.closest('[data-ui="search"]') || r.width <= 1 || r.height <= 1;
      out.push({ x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height), text: skip ? "\u0000skip" : input.value || input.placeholder });
    }
    return out;
  }, { sel: selector, app });
  const list: Measure[] = await page.evaluate(measureAll, { root: '[data-m="root"]', props: STYLE_PROPS });
  return list.flatMap((m) => {
    if (m.tag !== "input") return [m];
    const f = fields.find((x) => x.x === m.rect.x && x.y === m.rect.y && x.w === m.rect.w && x.h === m.rect.h);
    if (f?.text === "\u0000skip") return [];
    // A field shows its value right-aligned by text-align, where the frame's box does it with justify-content.
    return [f ? { ...m, text: f.text, style: { ...m.style, textAlign: m.style.textAlign === "right" ? "start" : m.style.textAlign }, field: true } : m];
  });
}

/**
 * Semantic tags where the frame draws a plain box: links for the tabs, headings for card titles, buttons for
 * the actions the frame draws as spans ("Save floors", "View impact preview", "Close", the fuel type box),
 * labels for a field's name, inputs for a field. An app element takes the frame's tag when the frame has an
 * element with the same text and that tag; its styles are still compared in full.
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
/** `optional`: for rows of real data that may or may not be there (C_S7's categories), it need not apply. */
type Rewrite = { app: string | RegExp; frame: string; nth?: number; tag?: string; why: string; optional?: boolean };
function rewrite(list: Measure[], rewrites: Rewrite[], used: Set<Rewrite>) {
  const seen = new Map<Rewrite, number>();
  return list.map((m) => {
    for (const r of rewrites) {
      if (r.tag && m.tag !== r.tag) continue;
      if (!(typeof r.app === "string" ? m.text === r.app : r.app.test(m.text))) continue;
      const k = seen.get(r) ?? 0;
      seen.set(r, k + 1);
      if (r.nth !== undefined && r.nth !== k) continue;
      used.add(r);
      return { ...m, text: r.frame };
    }
    return m;
  });
}

interface Explained {
  /** Extra controls the app has, by tag, and why. */
  kinds?: Record<string, { n: number; why: string }>;
  /** Style differences on one element ("tag \"text\"" -> prop -> reason), each must match exactly. */
  styles?: Record<string, Record<string, { frame: string; app: string; why: string }>>;
}

/** Both directions; every explanation must be used (none is stale). */
function expectSame(name: string, frameList: Measure[], appList: Measure[], explained: Explained = {}) {
  const used = new Set<string>();
  const forward = diffMeasures(frameList, appList);
  expect(forward.missing, `${name}: elements of the frame missing from the app`).toEqual([]);
  const diffs = forward.diffs.map((d: Record<string, unknown> & { element: string }) => {
    const rest: Record<string, unknown> = { ...d };
    delete rest.element;
    for (const [prop, ok] of Object.entries(explained.styles?.[d.element] ?? {})) {
      const v = rest[prop] as { frame: string; app: string } | undefined;
      if (v && String(v.frame) === ok.frame && String(v.app) === ok.app) { delete rest[prop]; used.add(`style ${d.element} ${prop}`); }
    }
    return Object.keys(rest).length ? { element: d.element, ...rest } : null;
  }).filter(Boolean);
  expect(diffs, `${name}: style differences`).toEqual([]);
  const backward = diffMeasures(appList, frameList);
  expect(backward.missing, `${name}: text or controls the app adds that the frame lacks`).toEqual([]);
  const kinds = (list: Measure[]) => list.filter((m) => ["svg", "button", "a", "input", "select"].includes(m.tag)).map((m) => m.tag).sort();
  const extra = Object.entries(explained.kinds ?? {}).flatMap(([tag, { n }]) => Array(n).fill(tag));
  expect(kinds(appList), `${name}: icons and controls`).toEqual([...kinds(frameList), ...extra].sort());
  const stale = Object.entries(explained.styles ?? {}).flatMap(([el, props]) => Object.keys(props).map((p) => `style ${el} ${p}`)).filter((k) => !used.has(k));
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

/** Removes frame elements the app must not draw (each with its reason): `up` parents above the element with that own text. */
async function dropFromFrame(drops: { text: string; up: number; all?: boolean }[]) {
  for (const { text, up, all } of drops) {
    const removed = await framePage.evaluate(({ text, up, all }) => {
      const own = (el: Element) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()).join(" ").trim();
      const found = [...document.querySelectorAll("main *")].filter((e) => own(e) === text);
      let n = 0;
      for (const hit of all ? found : found.slice(0, 1)) {
        let el: Element | null = hit;
        for (let i = 0; el && i < up; i++) el = el.parentElement;
        if (el) { el.remove(); n++; }
      }
      return n;
    }, { text, up, all: !!all });
    expect(removed, `frame element "${text}" to drop`).toBeGreaterThan(0);
  }
}

/** Every own text longer than measureAll's 80 characters under `selector`, in full (sentences are compared whole). */
async function longTexts(page: Page, selector: string, also: string[] = []) {
  return page.evaluate(({ sel, also }) => {
    const own = (el: Element) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()).join(" ").trim();
    return [...document.querySelectorAll(`${sel} *`)].filter((e) => (e as HTMLElement).offsetParent !== null).map(own).filter((t) => t.length > 80 || also.includes(t));
  }, { sel: selector, also });
}

/** The cards' left edges, widths and gaps in `main`: the cards share the page area the frame's way (decision 51). */
async function cardBoxes(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll("main section")].map((s) => {
    const r = s.getBoundingClientRect();
    return { x: Math.round(r.x), w: Math.round(r.width) };
  }));
}

// The frame's sample words the seed does not have (Appendix G and catalog data).
const CATEGORY_NAMES: Rewrite[] = [
  ["Abrasives & Cutting", "Abrasives and Cutting"], ["Safety & PPE", "Safety and PPE"],
  ["Material Handling & Tie-downs", "Material Handling and Tie-downs"], ["Janitorial/MRO", "Janitorial and MRO"],
].map(([app, frame]) => ({ app, frame, why: "category names are catalog data (the frame writes and for & and /)" }));
const MARKER = { text: "FEATURE FLAG: HIDDEN", up: 0, all: true, why: "a design marker (decision 50): never rendered" };
const FLAGGED = [
  { text: "Free delivery pricing", up: 2, why: "C_S4 is the flags-off default: the Free delivery pricing section does not render (decision 48)" },
  { text: "Recovery pool", up: 4, why: "C_S4: the Recovery pool section does not render with its flag off (the pool and cost model share one row, taken out whole)" },
];
/** The switches are buttons (role switch) where the frame draws spans. */
const switches = (n: number, why = "the switches are buttons where the frame draws spans"): Explained["kinds"] => ({ button: { n, why } });

interface Case {
  id: string;
  which: "off" | "on";
  path: string;
  setup?: Setup;
  drive?: (page: Page) => Promise<void>;
  drop?: { text: string; up: number; all?: boolean; why: string }[];
  rewrites?: Rewrite[];
  /** The dialog, outside main on both sides: the frame's selector and the app's. */
  dialog?: { frame: string; app: string; rewrites?: Rewrite[] };
  sentences?: { app: string; frame: string; why: string }[];
  /** Placeholder numbers (Appendix G) turned into one token on both sides, with the reason. */
  pattern?: { test: RegExp; token: string; why: string }[];
  explained?: Explained;
  /** C_S7: the frame's placeholder table rows for categories the real window does not touch are taken out (each app row must match one). */
  previewRows?: boolean;
  /** A frame box with no text and the app control drawn in its place, compared style by style. */
  boxes?: { frame: string; app: string; why: string }[];
}

const pricingNotShared: Setup = async (api) => {
  for (const customer_id of ["great-basin", "uinta-facility"])
    expect((await api.put("/api/rep/settings/access", { data: { customer_id, category: "pricing", enabled: false } })).status()).toBe(200);
};
const openFilter = async (page: Page) => {
  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByRole("dialog", { name: "Filter customers" }).getByRole("radiogroup").nth(1).getByRole("radio", { name: "Not shared" }).click();
  await rest(page);
};
/** C_S2's sample through the app's routes: the organization floors it draws, and Eli's own margins (set as Eli). */
const floorsSample: Setup = async (api, as) => {
  expect((await api.put("/api/rep/settings/org-floors", { data: { floors: [{ category_id: "abrasives", floor_pct: 25 }, { category_id: "safety", floor_pct: 30 }] } })).status()).toBe(200);
  const eli = await as("eli");
  for (const [category_id, floor_pct] of [["fasteners", 22], ["abrasives", 25], ["safety", 30], ["tools", 18], ["janitorial", 21]] as const)
    expect((await eli.put("/api/rep/settings/floors", { data: { category_id, floor_pct } })).status()).toBe(200);
};
/** Free delivery pricing on (C_S5): the impact preview viewed, then the toggle, through the manager's routes. */
const freeDeliveryOn: Setup = async (api) => {
  expect((await api.get("/api/rep/settings/freight/preview")).status()).toBe(200);
  expect((await api.put("/api/rep/settings/freight", { data: { enabled: true } })).status()).toBe(200);
};
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
/** The ramp's dates: today and 30 and 60 days on, where the frame samples Oct 10, 2026. */
const RAMP_DATES: Rewrite[] = [
  { app: `On since ${day(0)}`, frame: "On since Oct 10, 2026", why: "turned on today; the frame's day is a sample" },
  { app: day(0), frame: "Oct 10, 2026", why: "the ramp's day 0 is today" },
  { app: day(30), frame: "Nov 9, 2026", why: "day 30 from today" },
  { app: day(60), frame: "Dec 9, 2026", why: "day 60 from today" },
];

/** C_S6 Manual fuel price: blank, so the frame's box has no text to match by; its styles are compared directly. */
const MANUAL_FUEL = { frame: "MANUAL_FUEL_BOX", app: "#cost-fuel-manual", why: "the blank Manual fuel price field: the frame's empty box has no text to match by" };
const PREVIEW_NUMBERS = [
  { test: /^\d+ of \d+$/, token: "N of N", why: "Quotes affected per category: real counts where the frame's table is placeholder data (Appendix G)" },
  { test: /^\+\$\d+\.\d\d$/, token: "+$N", why: "the average line price change per category: real amounts where the frame's table is placeholder data (Appendix G)" },
];

const CASES: Case[] = [
  { id: "S1", which: "off", path: "/rep/settings", explained: { kinds: switches(4) } },
  { id: "S1a", which: "off", path: "/rep/settings", drive: openFilter, explained: { kinds: switches(4) } },
  {
    id: "S1b", which: "off", path: "/rep/settings", setup: pricingNotShared,
    drive: async (page) => {
      await openFilter(page);
      await page.getByRole("dialog", { name: "Filter customers" }).getByRole("button", { name: "Apply filters" }).click();
      await expect(page.getByText("2 of 6 customers")).toBeVisible();
      await rest(page);
    },
    explained: { kinds: switches(8) },
  },
  { id: "S2", which: "off", path: "/rep/settings?tab=floors", setup: floorsSample, rewrites: CATEGORY_NAMES },
  {
    id: "S3", which: "off", path: "/rep/settings?tab=floors", setup: floorsSample, rewrites: CATEGORY_NAMES,
    drive: async (page) => {
      await page.getByRole("combobox", { name: "Rep" }).click();
      await expect(page.getByRole("listbox", { name: "Reps" })).toBeVisible();
      await rest(page);
    },
  },
  { id: "S4", which: "off", path: "/rep/settings?tab=pricing", drop: [MARKER, ...FLAGGED], explained: { kinds: switches(1) } },
  {
    id: "S5", which: "on", path: "/rep/settings?tab=pricing", setup: freeDeliveryOn, drop: [MARKER], rewrites: RAMP_DATES,
    drive: async (page) => { await page.getByRole("heading", { name: "Free delivery pricing" }).scrollIntoViewIfNeeded(); await rest(page); },
    explained: { kinds: { ...switches(2), input: { n: 1, why: MANUAL_FUEL.why } } }, boxes: [MANUAL_FUEL],
  },
  {
    id: "S6", which: "on", path: "/rep/settings?tab=pricing", setup: freeDeliveryOn, drop: [MARKER], rewrites: RAMP_DATES,
    drive: async (page) => { await page.getByRole("heading", { name: "Recovery pool" }).scrollIntoViewIfNeeded(); await rest(page); },
    explained: { kinds: { ...switches(2), input: { n: 1, why: MANUAL_FUEL.why } } }, boxes: [MANUAL_FUEL],
  },
  {
    id: "S7", which: "on", path: "/rep/settings?tab=pricing", setup: freeDeliveryOn, drop: [MARKER], rewrites: RAMP_DATES,
    drive: async (page) => {
      await page.getByRole("button", { name: "View impact preview" }).click();
      await expect(page.getByRole("dialog", { name: "Impact preview" })).toBeVisible();
      await rest(page);
    },
    dialog: {
      frame: 'div[style*="z-index: 30"]', app: '[role="dialog"][aria-labelledby="impact-preview-title"]',
      rewrites: [
        { app: /^Based on the last \d+ delivery quotes\.$/, frame: "Based on the last 22 delivery quotes. Sample figures.", why: "the count is the real window's; \"Sample figures.\" marks the frame's placeholder table (Appendix G) and is not product copy" },
        ...CATEGORY_NAMES.map((r) => ({ ...r, optional: true })),
      ],
    },
    pattern: PREVIEW_NUMBERS, previewRows: true,
    explained: {
      kinds: { ...switches(2), input: { n: 1, why: MANUAL_FUEL.why } },
      // The catalog's "Material Handling & Tie-downs" fits the 680px dialog's category column on one line, where the
      // frame's "Material Handling and Tie-downs" wraps to two; the row's other cells are as tall as the row.
      styles: Object.fromEntries(['div "Material Handling and Tie-downs"', 'div "N of N"', 'div "+$N"'].map((el) => [el, { height: { frame: "36", app: "18", why: "the catalog name is shorter than the frame's, one line instead of two" } }])),
    },
    boxes: [MANUAL_FUEL],
  },
  { id: "S8", which: "off", path: "/rep/settings?tab=aging" },
];

/**
 * Decision 69: the manager's Settings gains her own Profile tab after the four the frames draw (customers see her
 * in My rep). It goes into the frame's tab bar as one more tab drawn the frame's way: a copy of one of the
 * frame's own inactive tabs, last, reading "Profile". Its place, its styles and its word are then compared like
 * every other tab.
 */
async function addProfileTab() {
  const added = await framePage.evaluate(() => {
    const own = (el: Element) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()).join(" ").trim();
    const aging = [...document.querySelectorAll("main span")].find((e) => own(e) === "Aging" && own(e.parentElement!.firstElementChild!) === "Customer access");
    const bar = aging?.parentElement;
    const inactive = bar && [...bar.children].find((t) => (t as HTMLElement).style.borderBottom.includes("transparent"));
    if (!bar || !inactive) return false;
    const tab = inactive.cloneNode(true) as HTMLElement;
    tab.textContent = "Profile";
    bar.appendChild(tab);
    return true;
  });
  expect(added, "the frame's tab bar takes the manager's Profile tab (decision 69)").toBe(true);
}

for (const c of CASES) {
  test(`C_${c.id} (manager): every element, style and word, both ways`, async ({ browser }, testInfo) => {
    await frame(c.id);
    await addProfileTab();
    if (c.drop?.length) await dropFromFrame(c.drop);
    const page = await appAs(browser, c.which, c.path, c.setup);
    await expectGeometry(page);
    if (c.drive) await c.drive(page);
    expect(await page.getByText(/FEATURE FLAG/i).count(), "no design marker renders").toBe(0);
    if (c.previewRows) {
      const names = Object.fromEntries(CATEGORY_NAMES.map((r) => [r.app as string, r.frame]));
      const shown = (await page.locator('[aria-label="Average change per line price"] [role="rowheader"]').allTextContents()).map((t) => names[t] ?? t);
      expect(shown.length, "the preview lists at least one category").toBeGreaterThan(0);
      const dropped = await framePage.evaluate((shown) => {
        const dialog = document.querySelector('div[style*="z-index: 30"]')!;
        const rows = [...dialog.querySelectorAll('div[style*="grid-template-columns"]')].slice(1);
        const out: string[] = [];
        for (const row of rows) { const name = row.firstElementChild!.textContent!.trim(); if (!shown.includes(name)) { out.push(name); row.remove(); } }
        return out;
      }, shown);
      await testInfo.attach(`C_${c.id} placeholder rows taken out`, { body: JSON.stringify({ shown, dropped, why: "the frame's six rows are placeholder data (Appendix G); the app lists the categories the last 90 days' delivery quotes touch" }), contentType: "application/json" });
    }
    const used = new Set<Rewrite>();
    const frameMain = await measure(framePage, "main");
    const appMain = rewrite(await measure(page, "main", { app: true }), c.rewrites ?? [], used);
    const frameDialog = c.dialog ? await measure(framePage, c.dialog.frame) : [];
    const appDialog = c.dialog ? rewrite(await measure(page, c.dialog.app, { app: true }), c.dialog.rewrites ?? [], used) : [];
    const tokens = (list: Measure[]) => list.map((m) => { const p = c.pattern?.find((x) => x.test.test(m.text)); return p ? { ...m, text: p.token } : m; });
    const allFrame = tokens([...frameMain, ...frameDialog]);
    const appList = asFrameTags(allFrame, tokens([...appMain, ...appDialog]));
    const result = expectSame(`C_${c.id}`, allFrame, appList, c.explained);
    for (const r of [...(c.rewrites ?? []), ...(c.dialog?.rewrites ?? [])].filter((r) => !r.optional)) expect(used.has(r), `C_${c.id}: rewrite ${String(r.app)} -> ${r.frame} is used (${r.why})`).toBe(true);
    const frameLong = [...await longTexts(framePage, "main"), ...(c.dialog ? await longTexts(framePage, c.dialog.frame) : [])].sort();
    const also = (c.sentences ?? []).map((x) => x.app);
    const appLong = [...await longTexts(page, "main", also), ...(c.dialog ? await longTexts(page, c.dialog.app, also) : [])]
      .map((t) => c.sentences?.find((x) => x.app === t)?.frame ?? t).sort();
    expect(appLong, `C_${c.id}: whole sentences`).toEqual(frameLong);
    // The cards start where the frame's do and share the page area its way: each card as wide as the
    // frame's at the same viewport (fluid, decision 51).
    expect(await cardBoxes(page), `C_${c.id}: the cards`).toEqual(await cardBoxes(framePage));
    if (c.dialog) {
      // The dialog: its width, centred on the page, and the dimmed page behind it (the frame's top is in its
      // scrolled one-page root; the app's dialog is fixed 150px from the viewport's top, the frame's offset).
      const place = (p: Page, sel: string) => p.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { width: r.width, centre: Math.round(r.left + r.width / 2 - document.documentElement.clientWidth / 2), style: getComputedStyle(el).top }; });
      expect(await place(page, c.dialog.app), `C_${c.id}: the dialog's place`).toEqual(await place(framePage, c.dialog.frame));
      expect(await page.locator('[data-ui="settings-backdrop"]').evaluate((el) => getComputedStyle(el).backgroundColor))
        .toBe(await framePage.locator('div[style*="z-index: 20"]').evaluate((el) => getComputedStyle(el).backgroundColor));
    }
    for (const box of c.boxes ?? []) {
      const frameBox = await framePage.evaluate(({ props }) => {
        const row = [...document.querySelectorAll("main div")].find((d) => [...d.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim() === "Manual fuel price"))!.closest('div[style*="justify-content: space-between"]')!;
        const el = [...row.querySelectorAll("div")].find((d) => d.style.width === "90px")!;
        const cs = getComputedStyle(el);
        return { h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width, style: Object.fromEntries(props.map((p: string) => [p, cs[p as keyof CSSStyleDeclaration]])) };
      }, { props: STYLE_PROPS });
      const appBox = await page.locator(box.app).evaluate((el, props) => {
        const cs = getComputedStyle(el);
        return { h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width, style: Object.fromEntries(props.map((p) => [p, cs[p as keyof CSSStyleDeclaration]])) };
      }, STYLE_PROPS);
      expect({ ...appBox, style: { ...appBox.style, textAlign: appBox.style.textAlign === "right" ? "start" : appBox.style.textAlign } }, `C_${c.id}: ${box.why}`).toEqual(frameBox);
    }
    await testInfo.attach(`C_${c.id} result`, { body: JSON.stringify({ ...result, rewrites: [...(c.rewrites ?? []), ...(c.dialog?.rewrites ?? [])].map((r) => ({ app: String(r.app), frame: r.frame, why: r.why })), drop: c.drop, explained: c.explained }, null, 1), contentType: "application/json" });
  });
}
