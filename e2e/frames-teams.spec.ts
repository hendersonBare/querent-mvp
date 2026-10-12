import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { FONT_USER_AGENT, STYLE_PROPS, diffMeasures, measureAll, openFrame, startFrameServer } from "../scripts/frames/lib.mjs";

// Frame proof for plan U7 (Teams and Reps, /rep/teams), manager (querent-persona=supplier), at 1920x1080:
//   C_TRBase (page), C_TR1 (a rep's customers expanded), C_TR2 (disconnect a customer), C_TR3 (connect a
//   customer), C_TR4 (move approval), C_TR5 (team selected), C_TR6 (create team), C_TR7 (move team).
//
// How each frame is proven:
//   - The data is driven toward the frame's sample through the app's own routes (the frames draw the seed
//     with Canyon Ridge as Brandi's customer and Outside Sales named Field Sales), then the page is driven
//     into the frame's state (expand, open the dialog, pick, type).
//   - The frame is opened at the app's viewport, 1920x1080: the frames are fluid (main is flex 1, the cards
//     flex), so both lay out at the same width and wrapping compares like for like (decision 51).
//   - Every element with text in `main` (and the dialog, which sits outside main in both), its computed
//     STYLE_PROPS and its height, both directions: nothing the frame draws is missing or styled differently,
//     and the app adds no text, icon or control the frame lacks. Copy is compared literally; data-filled
//     sentences are compared whole, their only rewrites listed per frame with the reason, and each rewrite
//     must apply (a stale one fails).
//   - The frames draw Brandi Gallegos as a rep; she is the manager in the seed, and the Reps card lists no
//     managers ("Managers are not listed.", C_TRBase), so the frame's Brandi row is the one sample row the
//     app cannot draw (Appendix G: roles and names). C_TR1 to C_TR4 expand a listed rep given Brandi's
//     three customers instead.
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

type Setup = "base" | "expanded";
/**
 * The seed reset, then moved toward the frame's sample through the manager's own routes:
 *   base      Canyon Ridge is Brandi's (the frames draw her three customers: Canyon Ridge, Great Basin,
 *             Wasatch), so Mara has none ("0 customers"); Outside Sales is renamed Field Sales.
 *   expanded  Great Basin and Wasatch go to Mara, who then has the frame's three customers under her row
 *             (the frame draws them under Brandi's); Outside Sales is renamed Field Sales.
 */
async function prepare(api: APIRequestContext, setup: Setup) {
  expect((await api.post("/api/test/reset", { data: { seed_date: SEED_DATE } })).status(), "POST /api/test/reset needs QUERENT_E2E_RESET=1").toBe(200);
  const assign = async (customer_id: string, rep_id: string) =>
    expect((await api.put("/api/rep/settings/assignments", { data: { customer_id, rep_id } })).status()).toBe(200);
  if (setup === "base") await assign("canyon-ridge", "brandi");
  else { await assign("great-basin", "mara"); await assign("wasatch", "mara"); }
  const board = await (await api.get("/api/rep/teams")).json();
  const outside = board.teams.find((t: { name: string }) => t.name === "Outside Sales");
  expect((await api.patch(`/api/rep/teams/${outside.id}`, { data: { name: "Field Sales" } })).status()).toBe(200);
}

async function appAs(browser: Browser, testInfo: TestInfo, setup: Setup) {
  const baseURL = String(testInfo.project.use.baseURL);
  const context = await browser.newContext({ viewport: APP_SIZE, baseURL });
  contexts.push(context);
  await context.addCookies([{ name: COOKIE, value: "supplier", url: baseURL }]);
  await prepare(context.request, setup);
  const page = await context.newPage();
  await page.goto("/rep/teams");
  await expect(page.getByRole("heading", { name: "Teams and Reps", level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await rest(page);
  return page;
}
const frame = (id: string) => openFrame(framePage, frames.base, id);

/**
 * measureAll over `selector`. On the app side, the inputs behind a drawn box are left out while measuring
 * (the checkboxes under the drawn squares, the search field over the frame's box: each is the frame's box
 * made usable), and a text field's text is its value or placeholder, which is what it shows.
 */
async function measure(page: Page, selector: string, { app = false } = {}): Promise<Measure[]> {
  expect(await page.locator(selector).count(), `${selector} not found`).toBeGreaterThan(0);
  const fields = await page.evaluate(({ sel, app }) => {
    document.querySelectorAll("[data-m]").forEach((e) => e.removeAttribute("data-m"));
    document.querySelector(sel)!.setAttribute("data-m", "root");
    const out: { x: number; y: number; w: number; h: number; text: string }[] = [];
    if (!app) return out;
    for (const input of document.querySelectorAll<HTMLInputElement>('[data-m="root"] input')) {
      const r = input.getBoundingClientRect();
      if (input.closest('[data-ui="search"]') || r.width <= 1 || r.height <= 1) { input.style.visibility = "hidden"; input.dataset.hiddenForMeasure = "1"; continue; }
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
 * Semantic tags where the frame draws a plain box: buttons where the frame draws a span ("Save", "Create
 * team", the dialogs' actions), label for a checkbox row, input for a text field. An app element takes the
 * frame's tag when the frame has an element with the same text and that tag; its styles are still compared in full.
 */
const SEMANTIC = new Set(["button", "label", "input", "h2"]);
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
type Rewrite = { app: string | RegExp; frame: string; nth?: number; tag?: string; why: string };
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
      if (v && v.frame === ok.frame && v.app === ok.app) { delete rest[prop]; used.add(`style ${d.element} ${prop}`); }
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

/** Removes the frame's sample rows the app cannot draw (each with its reason). */
async function dropFromFrame(drops: { text: string; up: number }[]) {
  for (const { text, up } of drops) {
    const removed = await framePage.evaluate(({ text, up }) => {
      const own = (el: Element) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()).join(" ").trim();
      let el: Element | null = [...document.querySelectorAll("main *")].find((e) => own(e) === text) ?? null;
      for (let i = 0; el && i < up; i++) el = el.parentElement;
      if (!el) return false;
      el.remove();
      return true;
    }, { text, up });
    expect(removed, `frame element "${text}" to drop`).toBe(true);
  }
}

/** Left and right card widths and the gap between them: the cards share the page area as flex 1.7 and 1 (C_TRBase). */
async function cards(page: Page, reps: string, teams: string) {
  return page.evaluate(({ reps, teams }) => {
    const a = document.querySelector(reps)!.getBoundingClientRect(), b = document.querySelector(teams)!.getBoundingClientRect();
    return { reps: Math.round(a.width), teams: Math.round(b.width), gap: Math.round(b.left - a.right), top: Math.round(b.top - a.top) };
  }, { reps, teams });
}

// The frame's sample rows and words the seed does not have (Appendix G: roles, names and team names).
const BRANDI_ROW = { text: "Brandi Gallegos", up: 2, why: "the frames draw Brandi Gallegos as a listed rep; she is the seed's manager and the card lists no managers" };
const FOUR_REPS: Rewrite = { app: "3 reps. Managers are not listed.", frame: "4 reps. Managers are not listed.", why: "the frame counts Brandi as a rep; the seed's three reps (she is the manager)" };
const NORA_ROLE: Rewrite = { app: "Account Manager", frame: "Counter Sales", why: "Nora Chen's title in the seed is Account Manager; the frame's role is a sample" };
/** C_TR1 to C_TR4: Mara, given the frame's three customers, stands in the frame's Brandi row. */
const MARA_ROW = { text: "Mara Jensen", up: 2, why: "Mara's own row in the frame (0 customers): in the app Mara holds the frame's three customers and is drawn in Brandi's place" };
const AS_BRANDI: Rewrite[] = [
  { app: "Mara Jensen", frame: "Brandi Gallegos", tag: "div", nth: 0, why: "the expanded rep: Mara holds the frame's three customers (Brandi, the frame's rep, is the manager)" },
  { app: "Customers for Mara Jensen", frame: "Customers for Brandi Gallegos", why: "as above" },
];
/** The Active toggles are switches (buttons) where the frame draws spans; each title-bar or dialog action the frame draws as a span is a button. */
const TOGGLES = 3;

interface Case {
  id: string;
  setup: Setup;
  drive?: (page: Page) => Promise<void>;
  drop?: { text: string; up: number; why: string }[];
  rewrites?: Rewrite[];
  /** The dialog, outside main on both sides: the frame's selector and the app's. */
  dialog?: { frame: string; app: string; rewrites?: Rewrite[] };
  explained?: Explained;
}

const expandMara = async (page: Page) => {
  const row = page.getByRole("region", { name: "Reps" }).getByRole("row").filter({ has: page.getByText("Mara Jensen", { exact: true }) }).first();
  await row.getByRole("button", { name: "3 customers" }).click();
  await rest(page);
};
const selectTeam = async (page: Page) => {
  await page.getByRole("region", { name: "Teams" }).getByText("Field Sales", { exact: true }).click();
  await rest(page);
};
const DIALOG_FRAME = 'div[style*="z-index: 30"]';

const CASES: Case[] = [
  {
    id: "TRBase", setup: "base",
    drop: [BRANDI_ROW], rewrites: [FOUR_REPS, NORA_ROLE],
    explained: { kinds: { button: { n: TOGGLES + 2, why: "the three Active switches, and Save and Create team, which the frame draws as spans" } } },
  },
  {
    id: "TR1", setup: "expanded", drive: expandMara,
    drop: [MARA_ROW], rewrites: [FOUR_REPS, NORA_ROLE, ...AS_BRANDI],
    explained: { kinds: { button: { n: TOGGLES + 2, why: "as C_TRBase" } } },
  },
  {
    id: "TR2", setup: "expanded",
    drive: async (page) => {
      await expandMara(page);
      await page.getByRole("button", { name: "Disconnect Canyon Ridge Builders" }).click();
      await page.getByRole("dialog", { name: "Disconnect Canyon Ridge Builders?" }).getByRole("radio", { name: /^Brandi Gallegos/ }).click();
      await rest(page);
    },
    drop: [MARA_ROW], rewrites: [FOUR_REPS, NORA_ROLE, ...AS_BRANDI],
    dialog: {
      frame: DIALOG_FRAME, app: '[role="dialog"][aria-label="Disconnect Canyon Ridge Builders?"]',
      rewrites: [
        { app: "Every customer needs a rep. Pick who takes Canyon Ridge Builders from Mara Jensen.", frame: "Every customer needs a rep. Pick who takes Canyon Ridge Builders from Brandi Gallegos.", why: "the rep losing the customer: Mara stands in for the frame's Brandi" },
        { app: "Brandi Gallegos", frame: "Mara Jensen", why: "the new rep picked: Brandi (now with no customers) in place of the frame's Mara, who has none in the frame" },
      ],
    },
    explained: { kinds: { button: { n: TOGGLES + 2 + 2, why: "as C_TRBase, and the dialog's Cancel and Disconnect and reassign, drawn as spans" } } },
  },
  {
    id: "TR3", setup: "expanded",
    drive: async (page) => {
      await expandMara(page);
      await page.getByRole("button", { name: /Connect a customer$/ }).click();
      await rest(page);
    },
    drop: [MARA_ROW], rewrites: [FOUR_REPS, NORA_ROLE, ...AS_BRANDI],
    explained: { kinds: { button: { n: TOGGLES + 2, why: "as C_TRBase" } } },
  },
  {
    id: "TR4", setup: "expanded",
    drive: async (page) => {
      await expandMara(page);
      await page.getByRole("button", { name: /Connect a customer$/ }).click();
      await page.getByRole("option", { name: /Utah Valley Electric/ }).click();
      await rest(page);
    },
    drop: [MARA_ROW], rewrites: [FOUR_REPS, NORA_ROLE, ...AS_BRANDI],
    dialog: {
      frame: DIALOG_FRAME, app: '[role="dialog"][aria-label="Utah Valley Electric is with Eli Porter"]',
      rewrites: [
        { app: "Connecting it to Mara Jensen takes it off Eli Porter. Eli will keep 1 customer.", frame: "Connecting it to Brandi Gallegos takes it off Eli Porter. Eli will keep 1 customer.", why: "the rep it moves to: Mara stands in for the frame's Brandi" },
        { app: /^Also move this customer's open quotes \(\d+ quotes\)$/, frame: "Also move this customer's open quotes (12 quotes)", why: "Utah Valley Electric's open quotes in the seed; the frame's 12 is a sample" },
        { app: "Move to Mara Jensen", frame: "Move to Brandi Gallegos", why: "as above" },
      ],
    },
    explained: { kinds: { button: { n: TOGGLES + 2 + 2, why: "as C_TRBase, and the dialog's Cancel and Move to, drawn as spans" } } },
  },
  {
    id: "TR5", setup: "base", drive: selectTeam,
    drop: [BRANDI_ROW], rewrites: [FOUR_REPS, NORA_ROLE],
    explained: { kinds: { button: { n: TOGGLES + 2 + 3, why: "as C_TRBase, and Add to team, Remove from team and Move into other team, drawn as spans" } } },
  },
  {
    id: "TR6", setup: "base",
    drive: async (page) => {
      await page.getByRole("region", { name: "Teams" }).getByRole("button", { name: "Create team" }).click();
      const dialog = page.getByRole("dialog", { name: "Create team" });
      await dialog.getByRole("textbox", { name: "Team name" }).fill("Counter and Yard");
      await dialog.getByText("Nora Chen", { exact: true }).click();
      await rest(page);
    },
    drop: [BRANDI_ROW], rewrites: [FOUR_REPS, NORA_ROLE],
    dialog: { frame: DIALOG_FRAME, app: '[role="dialog"][aria-label="Create team"]' },
    explained: { kinds: { button: { n: TOGGLES + 2 + 3, why: "as C_TRBase, the Inside another team field (a list button where the frame draws a box), and Cancel and Create team, drawn as spans" } } },
  },
  {
    id: "TR7", setup: "base",
    drive: async (page) => {
      await selectTeam(page);
      await page.getByRole("button", { name: "Move into other team" }).click();
      await page.getByRole("dialog", { name: "Move Field Sales into another team" }).getByRole("radio", { name: /^Inside Sales/ }).click();
      await rest(page);
    },
    drop: [BRANDI_ROW], rewrites: [FOUR_REPS, NORA_ROLE],
    dialog: { frame: DIALOG_FRAME, app: '[role="dialog"][aria-label="Move Field Sales into another team"]' },
    explained: { kinds: { button: { n: TOGGLES + 2 + 3 + 2, why: "as C_TR5, and the dialog's Cancel and Move team, drawn as spans" } } },
  },
];

for (const c of CASES) {
  test(`C_${c.id} (manager): every element, style and word, both ways`, async ({ browser }, testInfo) => {
    await frame(c.id);
    if (c.drop?.length) await dropFromFrame(c.drop);
    const page = await appAs(browser, testInfo, c.setup);
    await expectGeometry(page);
    if (c.drive) await c.drive(page);
    const used = new Set<Rewrite>();
    const frameMain = await measure(framePage, "main");
    const appMain = rewrite(await measure(page, "main", { app: true }), c.rewrites ?? [], used);
    const frameDialog = c.dialog ? await measure(framePage, c.dialog.frame) : [];
    const appDialog = c.dialog ? rewrite(await measure(page, c.dialog.app, { app: true }), c.dialog.rewrites ?? [], used) : [];
    const allFrame = [...frameMain, ...frameDialog];
    const appList = asFrameTags(allFrame, [...appMain, ...appDialog]);
    const result = expectSame(`C_${c.id}`, allFrame, appList, c.explained);
    for (const r of [...(c.rewrites ?? []), ...(c.dialog?.rewrites ?? [])]) expect(used.has(r), `C_${c.id}: rewrite ${String(r.app)} -> ${r.frame} is used (${r.why})`).toBe(true);

    // The two cards share the page area as the frame's flex 1.7 and 1, 20px apart, tops aligned; extra width goes to them (decision 51).
    const frameCards = await cards(framePage, "main section:first-of-type", "main section:last-of-type");
    expect(await cards(page, 'section[aria-labelledby="teams-reps-title"]', 'section[aria-labelledby="teams-teams-title"]'), `C_${c.id}: the two cards`).toEqual(frameCards);
    if (c.dialog) {
      // The dialog: its width, 50% from the left, its top, and the dimmed page behind it.
      const place = (p: Page, sel: string) => p.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, width: r.width, centre: Math.round(r.left + r.width / 2 - window.innerWidth / 2) }; });
      expect(await place(page, c.dialog.app), `C_${c.id}: the dialog's place`).toEqual(await place(framePage, c.dialog.frame));
      expect(await page.locator('[data-ui="teams-backdrop"]').evaluate((el) => getComputedStyle(el).backgroundColor))
        .toBe(await framePage.locator('div[style*="z-index: 20"]').evaluate((el) => getComputedStyle(el).backgroundColor));
    }
    await testInfo.attach(`C_${c.id} result`, { body: JSON.stringify({ ...result, rewrites: [...(c.rewrites ?? []), ...(c.dialog?.rewrites ?? [])].map((r) => ({ app: String(r.app), frame: r.frame, why: r.why })), drop: c.drop, explained: c.explained }, null, 1), contentType: "application/json" });
  });
}

test("C_TR3: the connect list opens under its button, the button's width, with the frame's search box", async ({ browser }, testInfo) => {
  await frame("TR3");
  const page = await appAs(browser, testInfo, "expanded");
  await expandMara(page);
  await page.getByRole("button", { name: /Connect a customer$/ }).click();
  await rest(page);
  const under = (p: Page, list: string) => p.evaluate((sel) => {
    const button = [...document.querySelectorAll("main button")].find((b) => b.textContent?.includes("Connect a customer"))!.getBoundingClientRect();
    const r = document.querySelector(sel)!.getBoundingClientRect();
    return { top: Math.round(r.top - button.top), left: Math.round(r.left - button.left), width: Math.round(r.width - button.width) };
  }, list);
  expect(await under(page, '[data-ui="connect-list"]')).toEqual(await under(framePage, 'div[style*="z-index: 12"]'));
});
