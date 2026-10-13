import { writeFile } from "node:fs/promises";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { FONT_USER_AGENT, FRAME_SIZE, STYLE_PROPS, diffMeasures, measureAll, openFrame, startFrameServer } from "../scripts/frames/lib.mjs";

// Frame proof for plan U4 (the quote editor): C_QEBase and its eleven states C_QE1 to C_QE11, on the
// manager's own sample quote Q-24817 (querent-persona=supplier, Brandi). Each state is driven in the app
// at 1920x1080 and diffed with the frame through scripts/frames/lib.mjs:
//   - every element with text, both ways: nothing the frame draws is missing or styled differently, and
//     the app adds no text the frame lacks; icon-only controls and icons are counted both ways too;
//   - the frame is measured at the app's viewport (1920x1080) as well as at its own (1440x900). The frame
//     is live DOM with the same fluid columns as the app, so at 1920 its text wraps where the app's does
//     and every height compares exactly; the fixed widths (Qty 60, Unit price 118, Margin 78, Total 82,
//     the 340px total column, the inputs) are compared with the frame at 1440x900: fixed stays fixed;
//   - the rail stays 216px and the extra width goes only to the fluid Items column.
// The frame's form fields are drawn as divs holding their value or hint; the app's inputs are read as
// that text (the hint with its ::placeholder colour). Where the frame draws a span for what is a real
// control in the app (a button, a link, a checkbox), the app element is listed with its reason. Text the
// frame shows as placeholder data (Appendix G: its dates and times) is matched by pattern and must keep
// the frame element's look. Nothing here is a hard-coded style value.

const COOKIE = "querent-persona";
const APP_SIZE = { width: 1920, height: 1080 };
const SEED_DATE = "2026-09-23";
const QUOTE = "/rep/quotes/Q-24817";

type Measure = { path: number; tag: string; text: string; rect: { x: number; y: number; w: number; h: number }; style: Record<string, string>; field?: boolean };

/**
 * A form field reads as the frame's div holding its text, with one explained difference: an input aligns
 * its value with text-align (right for numbers), where the frame's div aligns its text with flex
 * (justify-content: flex-end) and keeps text-align: start.
 */
const FIELD_EXPLAINED: Record<string, { frame: string; app: string }> = { textAlign: { frame: "start", app: "right" } };
type Diff = { element: string } & Record<string, unknown>;
function withoutExplained(diffs: Diff[], app: Measure[], wraps: Set<string>) {
  const fields = new Set(app.filter((m) => m.field).map((m) => `${m.tag} "${m.text}"`));
  return diffs
    .map((d) => {
      if (!fields.has(d.element) && !wraps.has(d.element)) return d;
      const rest: Diff = { element: d.element };
      for (const [k, v] of Object.entries(d)) {
        if (k === "element" || (k === "height" && wraps.has(d.element))) continue;
        const ok = fields.has(d.element) ? FIELD_EXPLAINED[k] : undefined;
        const pair = v as { frame: string; app: string };
        if (!(ok && ok.frame === pair.frame && ok.app === pair.app)) rest[k] = v;
      }
      return rest;
    })
    .filter((d) => Object.keys(d).length > 1);
}

let frames: { base: string; close: () => void };
let framePage: Page;
let frameSmall: Page;
let appPage: Page;

test.beforeAll(async ({ browser }) => {
  frames = await startFrameServer();
  // Same user agent as next/font, so both sides render byte-identical font files (scripts/frames/lib.mjs).
  framePage = await (await browser.newContext({ viewport: APP_SIZE, userAgent: FONT_USER_AGENT })).newPage();
  frameSmall = await (await browser.newContext({ viewport: FRAME_SIZE, userAgent: FONT_USER_AGENT })).newPage();
});
test.afterAll(async () => frames.close());

async function resetDemo(browser: Browser, testInfo: TestInfo) {
  const context = await browser.newContext();
  const response = await context.request.post(`${testInfo.project.use.baseURL}/api/test/reset`, { data: { seed_date: SEED_DATE } });
  expect(response.status(), "POST /api/test/reset needs QUERENT_E2E_RESET=1 on the server").toBe(200);
  await context.close();
}

/** The sample quote at 1920x1080 as the manager, settled: suggestions and the chat count loaded (another quote: its header shown). */
async function openEditor(browser: Browser, testInfo: TestInfo, persona = "supplier", path = QUOTE) {
  await resetDemo(browser, testInfo);
  const baseURL = String(testInfo.project.use.baseURL);
  const context = await browser.newContext({ viewport: APP_SIZE, baseURL });
  await context.addCookies([{ name: COOKIE, value: persona, url: baseURL }]);
  appPage = await context.newPage();
  await appPage.goto(path);
  await appPage.evaluate(() => document.fonts.ready);
  if (path === QUOTE) {
    await expect(appPage.getByRole("button", { name: /^Customer chat, \d+ messages$/ })).toBeVisible();
    await expect(appPage.getByText(/ideas?, up to/)).toBeVisible();
  } else await expect(appPage.getByRole("group", { name: "Quote facts" })).toBeVisible();
  await restMouse();
  return appPage;
}

/** Hover is a state the frames do not draw: park the pointer where nothing is. */
async function restMouse(page = appPage) {
  await page.mouse.move(APP_SIZE.width - 1, APP_SIZE.height - 1);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/** The page without the rail (proven in U2): the first aside on both sides. */
async function withoutRail(page: Page) {
  await page.evaluate(() => document.querySelector("aside")?.setAttribute("data-rail", ""));
  await page.addStyleTag({ content: "[data-rail]{display:none !important}" });
}

async function measureFrame(id: string, page = framePage) {
  await openFrame(page, frames.base, id);
  await withoutRail(page);
  return (await page.evaluate(measureAll, { root: "body", props: STYLE_PROPS })) as Measure[];
}

/**
 * The app measured like the frame: form fields read as the text the frame draws in their place (value,
 * selected option, or hint with its ::placeholder colour; a date as MM/DD/YYYY), and the visually hidden
 * text for screen readers (1x1 clipped) left out, as it is never drawn.
 */
async function measureApp(page = appPage) {
  await page.evaluate(() => {
    document.querySelector("aside")?.setAttribute("data-rail", "");
    if (!document.getElementById("u4-rail")) {
      const style = document.createElement("style");
      style.id = "u4-rail";
      style.textContent = "[data-rail]{display:none !important}";
      document.head.append(style);
    }
  });
  const measured = (await page.evaluate(measureAll, { root: "body", props: STYLE_PROPS })) as Measure[];
  const fields = (await page.evaluate(() => {
    const out: { text: string; placeholderColor: string | null }[] = [];
    for (const el of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select")) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (!el.checkVisibility() || cs.visibility === "hidden" || !(r.width > 0 && r.height > 0)) continue;
      let text = el.value;
      if (el instanceof HTMLSelectElement) text = el.selectedOptions[0]?.textContent ?? "";
      else if (el instanceof HTMLInputElement && el.type === "date" && el.value) {
        const [y, m, d] = el.value.split("-");
        text = `${m}/${d}/${y}`;
      }
      const hint = !text && "placeholder" in el ? el.placeholder : "";
      out.push({ text: text || hint, placeholderColor: hint ? getComputedStyle(el, "::placeholder").color : null });
    }
    return out;
  })) as { text: string; placeholderColor: string | null }[];
  let k = 0;
  return measured
    .filter((m) => !(m.rect.w <= 1 && m.rect.h <= 1))
    .map((m) => {
      if (!["input", "textarea", "select"].includes(m.tag)) return m;
      const field = fields[k++];
      if (!field || (m.tag === "input" && /checkbox|radio/.test(field.text))) return m;
      return { ...m, tag: "div", text: field.text.slice(0, 80), field: true, style: field.placeholderColor ? { ...m.style, color: field.placeholderColor } : m.style };
    });
}

/** A frame text the app shows with real data (Appendix G placeholders: dates, times): the app element matching `app` takes the frame's text, so its look is compared. */
interface Placeholder { frame: string; app: RegExp; why: string; /** The real text is longer, so it wraps to more lines: its height may differ. */ wraps?: boolean }
/** An app element whose tag differs from the frame's drawing (a real control where the frame draws a span or div). */
interface Alias { text: string; app: string; frame: string; why: string }
/** App text the frame does not draw, each explained. */
interface Extra { app: RegExp; why: string }

interface FrameCase {
  id: string;
  /** Drives the app (already on the sample quote) into the frame's state. */
  drive?: (page: Page) => Promise<void>;
  placeholders?: Placeholder[];
  aliases?: Alias[];
  extras?: Extra[];
  /** Icon-only controls the frame draws as plain elements, each explained (counted out of the app's). */
  iconOnly?: { selector: string; why: string }[];
}

// ---- What every state shares ----

const DAY = "[A-Z][a-z]{2} \\d{1,2}";
const day = (prefix = "", suffix = "") => new RegExp(`^${prefix}${DAY}${suffix}$`);
const WHY_DATES = "date: the frame's dates are placeholders (Appendix G); the app shows the sample's real dates (seeded on the mockup's day, valid until counted from today)";

const BASE_PLACEHOLDERS: Placeholder[] = [
  { frame: 'div "Fri Oct 9, 10:14 AM"', app: /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d\d [AP]M$/, why: WHY_DATES },
  { frame: 'div "Oct 25"', app: day(), why: WHY_DATES },
  { frame: 'span "Net 30, will call SLC, valid until Oct 25"', app: day("Net 30, will call SLC, valid until "), why: WHY_DATES },
];
const WHY_CHAT = "the chat is Q-24817's seeded conversation: Querent's answer and the two notices are its own words and times; the frame shortens them (sample text, Appendix G), so they wrap to more lines";
const WHY_SEARCH = "search results: the frame samples three matches for \"1/2\" (Appendix G); the app lists what the catalog search really returns, the active row first and the item on the quote as \"Already on quote\"";
const SEARCH_NAME = /^(?!Hex cap screw 1\/2-13 x 2 in, Grade 8, yellow zinc$).*1\/2.*$/;
const SEARCH_SKU = /^[A-Z]{2,3}(-[A-Z0-9]+)+$/;
const SEARCH_META = /^, \d+ at SLC, \$[\d,]+\.\d\d$/;
const STOCK_NOTE: Extra = {
  app: /^div "Short 5 at SLC\. 20 at Ogden\. 24 on order at SLC, due [A-Z][a-z]{2} \d{1,2}"$/,
  why: "decision 44 (no frame): stock short at the quote branch shows as an inline note on its line, styled like the below-floor note; the ratchet strap line is 5 short at SLC",
};
const TOGGLE: { selector: string; why: string } = { selector: '[role="switch"]', why: "the Show cost and stock switch is a button in the app; the frame draws the track as a span" };

const CASES: FrameCase[] = [
  { id: "QEBase" },
  {
    id: "QE1",
    drive: async (page) => page.getByRole("button", { name: "Approve and send" }).click(),
    placeholders: [
      { frame: 'div "4 items, $1,122.40 before tax. Will call at SLC, Thu Oct 15. Valid until Oct 25."', app: day("4 items, \\$1,122\\.40 before tax\\. Will call at SLC, [A-Z][a-z]{2} ", "\\. Valid until [A-Z][a-z]{2} \\d{1,2}\\."), why: WHY_DATES },
      { frame: "div \"Nitrile disposable gloves: 26.6% margin, below Brandi's 30% Safety & PPE floor. Ratchet strap 2 in x 27 ft: short 5 at SLC. 20 at Ogden. 24 on order at SL\"",
        app: /^Nitrile disposable gloves: 26\.6% margin, below Brandi's 30% Safety & PPE floor\. Ratchet strap 2 in x 27 ft: short 5 at SLC\. 20 at Ogden\. 24 on order at SL/, why: WHY_DATES },
      { frame: 'div "Hi Dana, your quote is ready: 4 items, $1,122.40 before tax, pickup at SLC on Thu, Oct 15. You can accept it or ask for changes from"',
        app: /^Hi Dana, your quote is ready: 4 items, \$1,122\.40 before tax, pickup at SLC on [A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}\. You can accept it or ask for changes from/, why: WHY_DATES },
      { frame: "div \"Dana's chat shows it under \"Quote Q-24817 is ready: $1,122.40, valid until Oct 25 - View quote\".\"",
        app: /^Dana's chat shows it under "Quote Q-24817 is ready: \$1,122\.40, valid until [A-Z][a-z]{2} \d{1,2} - View quote"\.$/, why: WHY_DATES },
    ],
    aliases: [
      { text: "Cancel", app: "button", frame: "span", why: "Cancel is a button; the frame draws a span" },
      { text: "Send quote", app: "button", frame: "span", why: "Send quote is a button; the frame draws a span" },
      { text: "Preview PDF", app: "a", frame: "span", why: "Preview PDF opens the draft PDF, so it is a link; the frame draws a span" },
    ],
  },
  { id: "QE2", drive: async (page) => page.getByRole("button", { name: "Export" }).click() },
  { id: "QE3", drive: async (page) => page.getByRole("button", { name: "More actions" }).click() },
  {
    id: "QE4",
    drive: async (page) => page.getByRole("button", { name: /^Quote details/ }).click(),
    placeholders: [
      { frame: 'span "Will call, SLC, Thu Oct 15"', app: day("Will call, SLC, [A-Z][a-z]{2} "), why: WHY_DATES },
      { frame: 'span "Thu Oct 15"', app: day("[A-Z][a-z]{2} "), why: WHY_DATES },
      { frame: 'span "Valid until Oct 25"', app: day("Valid until "), why: WHY_DATES },
      { frame: 'div "10/25/2026"', app: /^\d\d\/\d\d\/\d{4}$/, why: WHY_DATES },
      { frame: 'span "Sep 25, SO-51223"', app: day("", ", SO-51223"), why: WHY_DATES },
      { frame: 'span "71% over 12 months"', app: /^\d+% over 12 months$/, why: "win rate: counted from Wasatch's quotes over the 12 months before today; the frame's 71% is the mockup's sample (Appendix G)" },
      ...[0, 1, 2].map((i) => ({ frame: `span "Oct 9, 10:1${i === 2 ? 4 : 3} AM"`, app: day("", ", \\d{1,2}:\\d\\d [AP]M"), why: `activity time: ${WHY_DATES}` })),
    ],
    aliases: [
      { text: "Copy", app: "button", frame: "span", why: "Copy is a button; the frame draws a span" },
      { text: "Set freight by hand", app: "button", frame: "span", why: "Set freight by hand is a button; the frame draws a span" },
      { text: "Add note", app: "button", frame: "span", why: "Add note is a button; the frame draws a span" },
    ],
  },
  { id: "QE5", drive: async (page) => page.getByRole("button", { name: /^Suggested by Querent/ }).click() },
  {
    id: "QE6",
    drive: async (page) => page.getByRole("button", { name: /^Customer chat/ }).click(),
    placeholders: [
      ...[0, 1, 2].map((i) => ({ frame: `span "Fri Oct 9, 10:1${i === 2 ? 3 : 2} AM"`, app: /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d\d [AP]M$/, why: `message time: ${WHY_DATES}` })),
      { frame: 'div "Yes, the 1/2-13 x 2 in Grade 8 hex cap screws are in stock at SLC."', app: /^Yes, the 1\/2-13 x 2 in Grade 8 hex cap screws are in stock at SLC/, wraps: true, why: WHY_CHAT },
      { frame: 'div "Item pop-up: Here is your list. Check the quantities. Fri Oct 9, 10:13 AM"', app: /^Item pop-up: Here is your list\. Check the quantities/, wraps: true, why: WHY_CHAT },
      { frame: 'div "Quote requested: Thanks, Dana. Brandi Gallego has your quote. Fri Oct 9, 10:14 AM"', app: /^Quote requested: Thanks, Dana\. Brandi Gallegos/, wraps: true, why: WHY_CHAT },
    ],
  },
  { id: "QE7", drive: async (page) => page.getByRole("switch", { name: "Show cost and stock" }).click() },
  {
    id: "QE8",
    placeholders: [
      ...["Hex nut 1/2-13, Grade 8, yellow zinc (box of 100)", "Flat washer 1/2 in, Grade 8, yellow zinc (box of 100)"].map((name) => ({ frame: `div "${name}"`, app: SEARCH_NAME, why: WHY_SEARCH })),
      { frame: 'span "HN-12-13-G8"', app: SEARCH_SKU, why: WHY_SEARCH },
      ...[", 41 at SLC, $18.15", ", 88 at SLC, $14.25", ", 64 at SLC, $31.50"].map((meta) => ({ frame: `div "${meta}"`, app: SEARCH_META, why: WHY_SEARCH })),
      { frame: 'div "3 matches for "1/2". Type a SKU or name."', app: /^\d+ matches for "1\/2"\. Type a SKU or name\.$/, why: WHY_SEARCH },
    ],
    aliases: [{ text: "1/2", app: "div", frame: "span", why: "the search's text is a real input; the frame draws what was typed as a span" }],
    extras: [
      { app: /^div ".*1\/2.*"$/, why: WHY_SEARCH }, { app: /^div ", \d+ at SLC, \$[\d,]+\.\d\d"$/, why: WHY_SEARCH },
      { app: /^span "[A-Z]{2,3}(-[A-Z0-9]+)+"$/, why: WHY_SEARCH }, { app: /^span "Add"$/, why: WHY_SEARCH },
    ],
    drive: async (page) => {
      await page.getByRole("button", { name: "Add item" }).click();
      await page.getByRole("combobox", { name: "Add item" }).fill("1/2");
      await expect(page.getByText(/^\d+ matches for "1\/2"\. Type a SKU or name\.$/)).toBeVisible();
    },
  },
  {
    id: "QE9",
    drive: async (page) => page.getByRole("button", { name: "Line details for Hex cap screw 1/2-13 x 2 in" }).click(),
    placeholders: [
      { frame: 'div "Last paid $31.50 on Aug 28, above customer price $30.95. +$5.50 GP vs customer price."', app: /^Last paid \$31\.50 on [A-Z][a-z]{2} \d{1,2}, above customer price \$30\.95\. \+\$5\.50 GP vs customer p/, why: WHY_DATES },
      { frame: "div \"Brandi's 20% Fasteners floor. Last paid $31.50 on Aug 28.\"", app: day("Brandi's 20% Fasteners floor\\. Last paid \\$31\\.50 on ", "\\."), why: WHY_DATES },
    ],
    aliases: [
      { text: "Use", app: "button", frame: "span", why: "Use is a button; the frame draws a span" },
      { text: "Current", app: "button", frame: "span", why: "Current is the disabled Use button of the line's own price; the frame draws a span" },
    ],
  },
  {
    id: "QE10",
    drive: async (page) => {
      await page.getByRole("button", { name: "Price basis for HCS-12-13-2G8: Last paid" }).click();
      // The frame draws the pointer over Customer (its row in the hover tint, "States not drawn").
      await page.getByRole("option", { name: /^Customer/ }).hover();
    },
    placeholders: [{ frame: 'div "Paid Aug 28"', app: day("Paid "), why: WHY_DATES }],
  },
  {
    id: "QE11",
    drive: async (page) => {
      await page.getByRole("button", { name: "Save draft" }).click();
      await expect(page.getByText(/^Draft saved at /)).toBeVisible();
    },
    placeholders: [{ frame: 'span "Draft saved at 10:26 PM"', app: /^Draft saved at \d{1,2}:\d\d [AP]M$/, why: "time: the frame's is a placeholder; the app shows the time it saved" }],
  },
];

/** "tag "text"" of a measure. */
const key = (m: Measure) => `${m.tag} "${m.text}"`;

/**
 * Rewrites placeholder app elements to the frame's text (measureAll keeps a text's first 80 characters,
 * so a long placeholder is matched on those), and aliased tags to the frame's; returns the app list to
 * compare and the elements whose real text wraps differently.
 */
function prepare(frameM: Measure[], appM: Measure[], c: FrameCase) {
  const wraps = new Set<string>();
  const frameKeys = new Set(frameM.map(key));
  const app = appM.map((m) => {
    const alias = c.aliases?.find((a) => a.text === m.text && a.app === m.tag);
    return alias ? { ...m, tag: alias.frame } : m;
  });
  const used = new Set<number>();
  const count = (list: Measure[], tag: string, text: string) => list.filter((m) => m.tag === tag && m.text === text).length;
  for (const p of [...BASE_PLACEHOLDERS, ...(c.placeholders ?? [])]) {
    const [, tag, full] = /^(\w+) "([\s\S]*)"$/.exec(p.frame)!;
    const text = full.slice(0, 80);
    // Only as many as the frame has and the app lacks: none when the app shows the frame's own text.
    if (count(frameM, tag, text) <= count(app, tag, text)) continue;
    const i = app.findIndex((a, n) => !used.has(n) && a.tag === tag && p.app.test(a.text) && !frameKeys.has(key(a)));
    expect(i, `${c.id}: no app element for the placeholder ${p.frame} (${p.app})`).toBeGreaterThanOrEqual(0);
    used.add(i);
    app[i] = { ...app[i], text };
    if (p.wraps) wraps.add(`${tag} "${text}"`);
  }
  return { app, wraps };
}

/** Icons and icon-only buttons (no text at all), per side. */
async function iconCounts(page: Page, exclude: string[] = []) {
  return page.evaluate((exclude) => {
    const shown = (el: Element) => (el as HTMLElement).checkVisibility?.() !== false && el.getBoundingClientRect().width > 0 && !el.closest("[data-rail]");
    const svgs = [...document.querySelectorAll("svg")].filter(shown).length;
    const buttons = [...document.querySelectorAll("button")].filter((b) => shown(b) && !b.textContent!.trim() && !exclude.some((s) => b.matches(s))).length;
    return { svgs, buttons };
  }, exclude);
}

for (const c of CASES) {
  test(`C_${c.id} matches the frame`, async ({ browser }, testInfo) => {
    await openEditor(browser, testInfo);
    if (c.drive) await c.drive(appPage);
    await restMouse();
    if (c.id === "QE10") await appPage.getByRole("option", { name: /^Customer/ }).hover();
    const frameM = await measureFrame(c.id);
    const { app: appM, wraps } = prepare(frameM, await measureApp(), c);
    const forward = diffMeasures(frameM, appM);
    const backward = diffMeasures(appM, frameM);
    const extras = [STOCK_NOTE, ...(c.extras ?? [])];
    const added = (backward.missing as string[]).filter((m) => !extras.some((e) => e.app.test(m)));
    const frameIcons = await iconCounts(framePage);
    const appIcons = await iconCounts(appPage, [TOGGLE.selector, ...(c.iconOnly ?? []).map((i) => i.selector)]);
    const report = testInfo.outputPath(`C_${c.id}-diff.json`);
    await writeFile(report, JSON.stringify({ forward, added, frameIcons, appIcons, frame: frameM.map(key), app: appM.map(key) }, null, 1));
    await testInfo.attach(`C_${c.id}-diff.json`, { path: report, contentType: "application/json" });
    expect(forward.missing, `C_${c.id}: frame elements missing in the app`).toEqual([]);
    expect(withoutExplained(forward.diffs as Diff[], appM, wraps), `C_${c.id}: style and height differences`).toEqual([]);
    expect(added, `C_${c.id}: app text the frame does not draw`).toEqual([]);
    expect(appIcons, `C_${c.id}: icons and icon-only buttons`).toEqual(frameIcons);
  });
}

// ---- Fixed widths and the fluid column ----

/** Width of the element whose own text is `text` (first match), or of `selector`. */
async function widthOf(page: Page, { text, selector, up = 0 }: { text?: string; selector?: string; up?: number }) {
  return page.evaluate(({ text, selector, up }) => {
    const own = (el: Element) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()).join(" ").trim();
    let el = selector ? document.querySelector(selector) : [...document.querySelectorAll("body *")].find((e) => own(e) === text && !e.closest("[data-rail]"));
    for (let i = 0; el && i < up; i++) el = el.parentElement;
    return el ? Math.round(el.getBoundingClientRect().width * 10) / 10 : null;
  }, { text, selector, up });
}

test("fixed widths stay as drawn at 1440 (columns, inputs, the total column); the extra width goes to the Items column", async ({ browser }, testInfo) => {
  await openEditor(browser, testInfo);
  for (const [state, drive] of [["QEBase", null], ["QE7", (p: Page) => p.getByRole("switch", { name: "Show cost and stock" }).click()]] as const) {
    if (drive) await drive(appPage);
    await openFrame(frameSmall, frames.base, state);
    const heads = state === "QE7" ? [":: Qty", ":: Available", ":: Cost", ":: Unit price", ":: Margin", ":: Total"] : [":: Qty", ":: Unit price", ":: Margin", ":: Total"];
    for (const text of heads) expect(await widthOf(appPage, { text }), `${state} ${text}`).toBe(await widthOf(frameSmall, { text }));
    // Inputs: qty 56, price 84, margin 52 (the frame's divs), on the first line.
    for (const [frameText, label] of [["10", "Quantity for HCS-12-13-2G8"], ["31.50", "Unit price for HCS-12-13-2G8"], ["32.1", "Margin for HCS-12-13-2G8"]]) {
      expect(await widthOf(appPage, { selector: `input[aria-label="${label}"]` }), `${state} ${label}`).toBe(await widthOf(frameSmall, { text: frameText }));
    }
    expect(await widthOf(appPage, { text: "$315.00" }), `${state} line total`).toBe(await widthOf(frameSmall, { text: "$315.00" }));
    // The remove "x" fills the grid's last column (16px), as the frame's button does.
    expect(await widthOf(appPage, { selector: 'button[aria-label^="Remove "]' }), `${state} remove x`).toBe(await widthOf(frameSmall, { selector: 'button[aria-label="Remove item"]' }));
  }
  await openFrame(frameSmall, frames.base, "QEBase");
  // The total column (flex 0 0 340px, as the frame lays it out) keeps its width; the rail is 216. Its
  // width is its widest unbreakable line, Quote details' one-line summary ("Net 30, will call SLC, valid
  // until Oct 25"), whose day is real data (Appendix G: valid until follows today's date), so a day one
  // pixel narrower or wider than the frame's moved the column (U11). The app's summary takes the frame's
  // words for this measurement only.
  const SUMMARY = /^Net 30, will call SLC, valid until /;
  const summaryOf = (page: Page) => page.evaluate((source) => {
    const re = new RegExp(source);
    const el = [...document.querySelectorAll("span")].find((e) => re.test(e.textContent ?? ""));
    return el?.textContent ?? null;
  }, SUMMARY.source);
  const frameSummary = await summaryOf(frameSmall);
  expect(frameSummary, "the frame's Quote details summary").toMatch(SUMMARY);
  expect(await summaryOf(appPage), "the app's Quote details summary").toMatch(SUMMARY);
  await appPage.evaluate(({ source, text }) => {
    const re = new RegExp(source);
    const el = [...document.querySelectorAll("span")].find((e) => re.test(e.textContent ?? ""))!;
    el.textContent = text;
  }, { source: SUMMARY.source, text: frameSummary! });
  const totalBox = { text: "Quote total, before tax", up: 1 };
  expect(await widthOf(appPage, totalBox)).toBe(await widthOf(frameSmall, totalBox));
  expect(await widthOf(appPage, { selector: "aside" })).toBe(216);
  // The Items card takes the rest: main minus padding (32 + 32), the gap (20) and the total column.
  const geometry = await appPage.evaluate(() => {
    const main = document.querySelector("main")!.getBoundingClientRect();
    const items = document.querySelector('[data-ui="items-card"]')!.getBoundingClientRect();
    const side = document.querySelector('[data-ui="total-column"]')!.getBoundingClientRect();
    return { main: main.width, items: items.width, side: side.width, scroll: document.documentElement.scrollWidth };
  });
  expect(geometry.main).toBe(APP_SIZE.width - 216);
  expect(geometry.items).toBe(geometry.main - 64 - 20 - geometry.side);
  expect(geometry.scroll).toBe(APP_SIZE.width);
});

// ---- Decision 64: the one explained addition to C_QEBase ----

// Decision 36 stands (decision 64): a quote that carries freight recovery shows its frozen rate as a
// small "Freight recovery N%" chip in the header, in the editor's tokens (the frame's CONTRACT tag), in
// addition to the rate and ramp step in Line details. Only such a quote has it: the sample Q-24817
// carries none, so C_QEBase above compares with no chip. Q-24763 is Brandi's accepted delivery quote
// from the free delivery pilot (src/server/db/seed/demo.ts), frozen at the 3.0% starting rate.
test("decision 64: a quote that carries freight recovery adds the \"Freight recovery N%\" chip to the header, in the CONTRACT tag's look", async ({ browser }, testInfo) => {
  await openEditor(browser, testInfo, "supplier", "/rep/quotes/Q-24763");
  const facts = appPage.getByRole("group", { name: "Quote facts" });
  const chip = facts.getByText("Freight recovery 3.0%", { exact: true });
  await expect(chip).toBeVisible();
  const frameM = await measureFrame("QEBase");
  const contract = frameM.find((m) => m.tag === "span" && m.text === "CONTRACT")!;
  const appM = await measureApp();
  const mine = appM.find((m) => m.text === "Freight recovery 3.0%")!;
  expect(mine.tag).toBe("span");
  expect(mine.style).toEqual(contract.style);
  // It sits on the facts' value line: centred with the quote number.
  const quoteNo = appM.find((m) => m.text === "Q-24763")!;
  expect(Math.abs(mine.rect.y + mine.rect.h / 2 - (quoteNo.rect.y + quoteNo.rect.h / 2))).toBeLessThanOrEqual(1);
  // Nothing else is added to the header: the facts are the frame's five labels and the chip.
  const labels = (q: Measure[]) => q.filter((m) => m.rect.y < 140 && ["Quote", "Status", "Purchasing agent", "Requested", "Valid until"].includes(m.text)).map((m) => m.text);
  expect(labels(appM)).toEqual(labels(frameM));
  expect(await facts.evaluate((el) => el.children.length)).toBe(6);
});

test("the item rows share the 34px centre line: name, inputs and total", async ({ browser }, testInfo) => {
  await openEditor(browser, testInfo);
  const centres = await appPage.evaluate(() => {
    const row = document.querySelector('[role="rowgroup"] [role="row"]')!;
    const mid = (el: Element) => { const r = el.getBoundingClientRect(); return Math.round((r.top + r.height / 2) * 10) / 10; };
    const name = row.querySelector('[data-ui="item-name"]')!;
    const line = name.getBoundingClientRect();
    // The name's first line, by its own line height (the name may wrap).
    const firstLine = Math.round((line.top + parseFloat(getComputedStyle(name).lineHeight) / 2) * 10) / 10;
    const total = row.querySelector('[data-ui="line-total"]')!;
    return { name: firstLine, qty: mid(row.querySelector('input[aria-label^="Quantity"]')!), price: mid(row.querySelector('input[aria-label^="Unit price"]')!),
      margin: mid(row.querySelector('input[aria-label^="Margin"]')!), total: mid(total), height: Math.round(total.getBoundingClientRect().height * 10) / 10 };
  });
  const { height, ...line } = centres;
  for (const [name, value] of Object.entries(line)) expect(Math.abs(value - line.qty), name).toBeLessThanOrEqual(1);
  // The line's height is the frame's: its total cell (34px in C_QEBase), read from the frame.
  await openFrame(frameSmall, frames.base, "QEBase");
  const frameTotal = await frameSmall.evaluate(() => {
    const el = [...document.querySelectorAll("body *")].find((e) => e.childElementCount === 0 && e.textContent!.trim() === "$315.00")!;
    return Math.round(el.getBoundingClientRect().height * 10) / 10;
  });
  expect(height).toBe(frameTotal);
});
