import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { FONT_USER_AGENT, FRAME_SIZE, STYLE_PROPS, diffMeasures, measureAll, openFrame, startFrameServer } from "../scripts/frames/lib.mjs";

// Frame proof for plan U0 (tokens and primitives), at the component level. The page-level proof of
// these frames is U3's (e2e/frames-quotes.spec.ts).
//   - Tokens: every CSS variable in src/app/tokens.css that a frame draws is read from that frame's
//     live DOM and compared with the app's computed value (a swatch on the fixture page per token).
//   - Primitives: the test-only fixture page /test/ui (404 unless QUERENT_E2E_RESET=1) renders each
//     primitive; the spec drives it into the frame's state at 1920x1080 and diffs its computed styles
//     with the frame element's (frames open at 1440x900). Nothing here is a hard-coded style value.
// Frames: C_QOB2 (filter panel), C_QOB1 and C_QOT7 (customer picker), C_QOT2 (columns picker),
// C_QOT6 and C_QOB8 (reorder), C_QOTable (table, status, View note, Show more), C_QOB3 and C_QOB4
// (dropdowns), C_QOB5 (sheet), C_S4 (toggle), C_CU2 (count badge), C_QOBoard and C_ANBase (tokens).

const COOKIE = "querent-persona";
const APP_SIZE = { width: 1920, height: 1080 };
const SEED_DATE = "2026-09-23";

let frames: { base: string; close: () => void };
let framePage: Page;
test.beforeAll(async ({ browser }) => {
  frames = await startFrameServer();
  // The frames fetch their fonts from Google with the same user agent next/font used, so both sides
  // render byte-identical font files (see FONT_USER_AGENT in scripts/frames/lib.mjs).
  framePage = await (await browser.newContext({ viewport: FRAME_SIZE, userAgent: FONT_USER_AGENT })).newPage();
});
test.afterAll(async () => frames.close());

async function resetDemo(testInfo: TestInfo, browser: Browser) {
  const context = await browser.newContext();
  const response = await context.request.post(`${testInfo.project.use.baseURL}/api/test/reset`, { data: { seed_date: SEED_DATE } });
  expect(response.status(), "POST /api/test/reset needs QUERENT_E2E_RESET=1 on the server").toBe(200);
  await context.close();
}

/** How to find one element: a CSS selector, or the element whose own text is `text`; then `up` parents, or the previous sibling. */
interface Locate { selector?: string; text?: string; nth?: number; up?: number; prev?: boolean; where?: "toggle-off" | "toggle-on" }

/** In-page: marks the located element with data-m=<mark> and returns whether it was found. */
async function mark(page: Page, at: Locate, markName: string) {
  return page.evaluate(({ at, markName }) => {
    document.querySelectorAll(`[data-m="${markName}"]`).forEach((e) => e.removeAttribute("data-m"));
    const ownText = (el: Element) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()).join(" ").trim();
    let found: Element[] = [];
    if (at.where) {
      // A toggle: a 40x22 track holding one round knob; "off" has its knob on the left.
      found = [...document.querySelectorAll("span,button")].filter((e) => {
        const r = e.getBoundingClientRect();
        const knob = e.firstElementChild;
        if (Math.round(r.width) !== 40 || Math.round(r.height) !== 22 || !knob) return false;
        const left = knob.getBoundingClientRect().left - r.left < r.width / 2 - 8;
        return at.where === "toggle-off" ? left : !left;
      });
    } else if (at.text !== undefined) {
      found = [...document.querySelectorAll(at.selector ?? "body *")].filter((e) => ownText(e) === at.text && getComputedStyle(e).display !== "none");
    } else found = [...document.querySelectorAll(at.selector!)];
    let el: Element | null = found[at.nth ?? 0] ?? null;
    for (let i = 0; el && i < (at.up ?? 0); i++) el = el.parentElement;
    if (el && at.prev) el = el.previousElementSibling;
    if (!el) return false;
    el.setAttribute("data-m", markName);
    return true;
  }, { at, markName });
}

const EXTRA_PROPS = ["width", "height", "boxSizing", "transform", "outlineStyle", "outlineColor", "outlineWidth", "outlineOffset", "zIndex",
  "borderRightWidth", "borderRightColor", "borderLeftWidth", "borderLeftColor", "borderRightStyle", "borderTopStyle", "scrollbarWidth", "scrollbarColor"];

/** Computed styles of a located element (STYLE_PROPS plus the extras). */
async function styleAt(page: Page, at: Locate, label: string) {
  if (page === appPage) await restMouse();
  expect(await mark(page, at, label), `${label}: element not found ${JSON.stringify(at)}`).toBe(true);
  return page.evaluate(({ label, props }) => {
    const el = document.querySelector(`[data-m="${label}"]`)!;
    const cs = getComputedStyle(el) as unknown as Record<string, string>;
    const r = el.getBoundingClientRect();
    return { style: Object.fromEntries(props.map((p) => [p, cs[p]])), rect: { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 } };
  }, { label, props: [...STYLE_PROPS, ...EXTRA_PROPS] });
}

/** A frame element paired with an app element: the listed props must be equal. Returns the differences. */
async function pair(name: string, frame: Locate, app: Locate, props: readonly string[], { size = [] as ("w" | "h")[] } = {}) {
  const f = await styleAt(framePage, frame, `f-${name}`);
  const a = await styleAt(appPage, app, `a-${name}`);
  const diffs: Record<string, { frame: unknown; app: unknown }> = {};
  for (const p of props) if (f.style[p] !== a.style[p]) diffs[p] = { frame: f.style[p], app: a.style[p] };
  for (const s of size) if (f.rect[s] !== a.rect[s]) diffs[s === "w" ? "width" : "height"] = { frame: f.rect[s], app: a.rect[s] };
  return Object.keys(diffs).length ? [{ element: name, ...diffs }] : [];
}

/** STYLE_PROPS without layout-only props that legitimately differ when a real control replaces a drawn one. */
const LOOK = STYLE_PROPS.filter((p: string) => p !== "display" && p !== "textAlign");

/**
 * diffMeasures over a located subtree in the frame and in the app. `alias` maps an app element's text to
 * the frame's tag where the app uses a real control and the frame draws a box (each one explained).
 */
async function subtreeDiff(frame: Locate, app: Locate, alias: Record<string, string> = {}) {
  expect(await mark(framePage, frame, "f-root"), `frame root not found ${JSON.stringify(frame)}`).toBe(true);
  await restMouse();
  expect(await mark(appPage, app, "a-root"), `app root not found ${JSON.stringify(app)}`).toBe(true);
  const f = await framePage.evaluate(measureAll, { root: '[data-m="f-root"]', props: STYLE_PROPS });
  const a = (await appPage.evaluate(measureAll, { root: '[data-m="a-root"]', props: STYLE_PROPS }))
    .map((e: { text: string; tag: string }) => (alias[e.text] ? { ...e, tag: alias[e.text] } : e));
  return diffMeasures(f, a);
}

let appPage: Page;
/** Hover is a state the frames do not draw: park the pointer on the empty page corner before measuring. */
const restMouse = () => appPage.mouse.move(1, 1);
async function openFixture(browser: Browser, testInfo: TestInfo, persona?: string) {
  const context = await browser.newContext({ viewport: APP_SIZE });
  if (persona) await context.addCookies([{ name: COOKIE, value: persona, url: String(testInfo.project.use.baseURL) }]);
  appPage = await context.newPage();
  const response = await appPage.goto("/test/ui");
  expect(response?.status(), "the fixture page needs QUERENT_E2E_RESET=1").toBe(200);
  await appPage.evaluate(() => document.fonts.ready);
  return appPage;
}
const frame = (id: string) => openFrame(framePage, frames.base, id);
const fixture = (id: string) => appPage.getByTestId(id);

test("fonts: Albert Sans and Geist Mono load through next/font", async ({ browser }, testInfo) => {
  await openFixture(browser, testInfo);
  // Each weight has its own face: loading it must find one and leave it loaded.
  const load = (family: string, weights: number[]) => appPage.evaluate(async ({ family, weights }) => Promise.all(weights.map(async (w) => {
    const faces = await document.fonts.load(`${w} 16px "${family}"`);
    return faces.some((f) => f.family.replace(/"/g, "") === family && f.status === "loaded") && document.fonts.check(`${w} 16px "${family}"`);
  })), { family, weights });
  expect(await load("Albert Sans", [400, 500, 600, 700, 800])).toEqual([true, true, true, true, true]);
  expect(await load("Geist Mono", [400, 500])).toEqual([true, true]);
  await frame("QOTable");
  expect(await pair("sans", { selector: "h1" }, { selector: "[data-token=font-sans]" }, ["fontFamily"])).toEqual([]);
  expect(await pair("mono", { text: "35.4%" }, { selector: "[data-token=font-mono]" }, ["fontFamily"])).toEqual([]);
});

/** token name -> [frame id, where the frame draws it, the frame's computed prop, the swatch's prop]. */
const TOKENS: [string, string, Locate, string, string?][] = [
  ["rail", "QOBoard", { selector: "aside" }, "backgroundColor"],
  ["rail-border", "QOBoard", { text: "Sign out", up: 1 }, "borderTopColor", "backgroundColor"],
  ["rail-text", "QOBoard", { text: "Customers" }, "color", "backgroundColor"],
  ["rail-name", "QOBoard", { text: "Herrick Industrial Supply" }, "color", "backgroundColor"],
  ["rail-button-border", "QOBoard", { text: "Sign out" }, "borderTopColor", "backgroundColor"],
  ["titlebar", "ANBase", { text: "Quotes and wins by week", up: 1 }, "backgroundColor"],
  ["titlebar-muted", "AN2", { text: "categories fully enabled" }, "color", "backgroundColor"],
  ["page", "QOBoard", { selector: "main", up: 1 }, "backgroundColor"],
  ["card", "QOTable", { text: ":: Quote", up: 4 }, "backgroundColor"],
  ["card-border", "QOTable", { text: ":: Quote", up: 4 }, "borderTopColor", "backgroundColor"],
  ["table-header", "QOTable", { text: ":: Quote", up: 1 }, "backgroundColor"],
  ["table-header-text", "QOTable", { text: ":: Quote" }, "color", "backgroundColor"],
  ["row-divider", "CUBase", { text: "Canyon Ridge Builders", up: 2 }, "borderTopColor", "backgroundColor"],
  ["row-divider-soft", "QOTable", { text: "Q-24791", up: 2 }, "borderTopColor", "backgroundColor"],
  ["lane", "QOBoard", { selector: "section" }, "backgroundColor"],
  ["border", "QOTable", { text: "Filter" }, "borderTopColor", "backgroundColor"],
  ["rule", "QOB2", { text: "Filter quotes", up: 1 }, "borderTopColor", "backgroundColor"],
  ["text", "QOBoard", { selector: "h1" }, "color", "backgroundColor"],
  ["text-2", "QOB2", { text: "Status" }, "color", "backgroundColor"],
  ["text-muted", "QOT2", { text: "Always shown" }, "color", "backgroundColor"],
  ["text-code", "QOB1", { text: "WAS-1142" }, "color", "backgroundColor"],
  ["icon-muted", "QOT2", { text: "::" }, "color", "backgroundColor"],
  ["icon-muted", "QOTable", { text: "Show 18 more quotes" }, "borderTopColor", "backgroundColor"],
  ["more-text", "QOTable", { text: "Show 18 more quotes" }, "color", "backgroundColor"],
  ["accent", "QOB2", { text: "Apply filters" }, "backgroundColor"],
  ["red", "QOTable", { text: "Overdue" }, "color", "backgroundColor"],
  ["red-tint", "QOB2", { selector: 'button[aria-label="Needs attention, 2 items"]' }, "backgroundColor"],
  ["red-border", "QOB2", { selector: 'button[aria-label="Needs attention, 2 items"]' }, "borderTopColor", "backgroundColor"],
  ["note", "QOTable", { text: "View note" }, "backgroundColor"],
  ["note-text", "QOTable", { text: "View note" }, "color", "backgroundColor"],
  ["toggle-off", "S4", { where: "toggle-off" }, "backgroundColor"],
  ["check-disabled", "QOT2", { text: "Quote", prev: true }, "backgroundColor"],
  ["close", "QOB5", { text: "x" }, "backgroundColor"],
  ["count-bg", "QOTable", { selector: 'button[aria-label="Choose columns"]' }, "backgroundColor"],
  ["button-text", "QOTable", { text: "Filter" }, "color", "backgroundColor"],
  ["backdrop-sheet", "QOB5", { selector: "aside div", text: "Q-24790", up: 3, prev: true }, "backgroundColor"],
  ["backdrop-dialog", "QOB6", { text: "Note on Q-24790", up: 3, prev: true }, "backgroundColor"],
  ["shadow-popover", "QOB2", { text: "Filter quotes", up: 1 }, "boxShadow"],
  ["shadow-picker", "QOB1", { text: "Showing 5 of 14. Scroll to see more or type to search.", up: 1 }, "boxShadow"],
  ["shadow-sheet", "QOB5", { selector: "aside div", text: "Q-24790", up: 3 }, "boxShadow"],
  ["shadow-lane-drag", "QOB8", { selector: "section", nth: 1 }, "boxShadow"],
  ["shadow-header-drag", "QOT6", { text: ":: Status" }, "boxShadow"],
  ["text-body", "QOBoard", { selector: "main" }, "fontSize"],
  ["text-title", "QOBoard", { selector: "h1" }, "fontSize"],
  ["title-tracking", "QOBoard", { selector: "h1" }, "letterSpacing"],
  ["text-table-head", "QOTable", { text: ":: Quote" }, "fontSize"],
  ["text-button", "QOTable", { text: "Filter" }, "fontSize"],
  ["text-control", "QOB2", { text: "Draft ready" }, "fontSize"],
  ["text-label", "QOB2", { text: "Status" }, "fontSize"],
  ["text-card-title", "ANBase", { text: "Quotes and wins by week" }, "fontSize"],
  ["text-secondary", "AN2", { text: "categories fully enabled" }, "fontSize"],
  ["radius-card", "QOTable", { text: ":: Quote", up: 4 }, "borderRadius"],
  ["radius-control", "QOTable", { text: "Filter" }, "borderRadius"],
  ["radius-button", "QOTable", { text: "Show 18 more quotes" }, "borderRadius"],
  ["radius-field", "QOB2", { text: "All reps" }, "borderRadius"],
  ["page-padding", "QOBoard", { selector: "main" }, "paddingTop"],
  ["page-padding", "QOBoard", { selector: "main" }, "paddingRight"],
  ["page-padding", "QOBoard", { selector: "main" }, "paddingBottom"],
  ["page-padding", "QOBoard", { selector: "main" }, "paddingLeft"],
];
const SIZE_TOKENS: [string, string, Locate, "w" | "h"][] = [
  ["rail-width", "QOBoard", { selector: "aside" }, "w"],
  ["control-height", "QOB2", { text: "Apply filters" }, "h"],
  ["header-button", "QOB2", { selector: 'button[aria-label="Needs attention, 2 items"]' }, "h"],
  ["picker-height", "QOB1", { text: "All customers", up: 1 }, "h"],
];

test("tokens equal the frames' computed values", async ({ browser }, testInfo) => {
  await openFixture(browser, testInfo);
  const diffs: unknown[] = [];
  let open = "";
  for (const [token, id, at, frameProp, swatchProp] of TOKENS) {
    if (open !== id) { await frame(id); open = id; }
    const f = await styleAt(framePage, at, `t-${token}`);
    const a = await styleAt(appPage, { selector: `[data-token="${token}"]` }, `s-${token}`);
    const prop = swatchProp ?? frameProp;
    if (f.style[frameProp] !== a.style[prop]) diffs.push({ token, frame: `${id} ${frameProp}=${f.style[frameProp]}`, app: `${prop}=${a.style[prop]}` });
  }
  for (const [token, id, at, side] of SIZE_TOKENS) {
    if (open !== id) { await frame(id); open = id; }
    const f = await styleAt(framePage, at, `t-${token}`);
    const a = await styleAt(appPage, { selector: `[data-token="${token}"]` }, `s-${token}`);
    if (f.rect[side] !== a.rect[side]) diffs.push({ token, frame: f.rect[side], app: a.rect[side] });
  }
  expect(diffs).toEqual([]);
  // Thin 8px scrollbars, thumb on a transparent track, everywhere inside the new UI.
  await frame("QOBoard");
  expect(await pair("scrollbars", { selector: "body" }, { selector: "[data-testid=ui-root]" }, ["scrollbarWidth", "scrollbarColor"])).toEqual([]);
});

test("C_QOB2 filter panel: Filter button, groups, fields and actions", async ({ browser }, testInfo) => {
  await openFixture(browser, testInfo);
  await frame("QOB2");
  await fixture("header").getByRole("button", { name: "Filter", exact: true }).click();
  await expect(appPage.getByRole("dialog", { name: "Filter quotes" })).toBeVisible();
  // Real controls where the frame draws boxes: buttons for "Clear all", "Apply filters" and the two
  // pickers (frame: span, span, div, div). The date fields are native date inputs, compared below.
  const result = await subtreeDiff({ text: "Filter quotes", up: 2 }, { selector: "[data-testid=header] [data-ui=filter]" },
    { "Clear all": "span", "Apply filters": "span", "All reps": "div", "Any customer": "div" });
  expect(result.missing).toEqual(['div "Sep 1"', 'div "Oct 10"']);
  expect(result.diffs).toEqual([]);
  expect(result.matched).toBeGreaterThan(20);
  const diffs = [
    ...(await pair("checked", { text: "Draft ready", prev: true }, { selector: "[data-testid=header] [data-ui=check]", nth: 0 }, STYLE_PROPS, { size: ["w", "h"] })),
    ...(await pair("unchecked", { text: "Overdue", prev: true }, { selector: "[data-testid=header] [data-ui=check][data-checked=false]" }, STYLE_PROPS, { size: ["w", "h"] })),
    ...(await pair("date", { text: "Sep 1" }, { selector: '[data-testid=header] input[aria-label="Requested from"]' }, LOOK, { size: ["h"] })),
    ...(await pair("filter-icon", { text: "Filter", up: 0, selector: "button" }, { selector: "[data-testid=header] [data-ui=filter] > button" }, STYLE_PROPS, { size: ["h"] })),
  ];
  expect(diffs).toEqual([]);
});

test("C_CU2 count badge on an applied filter", async ({ browser }, testInfo) => {
  await openFixture(browser, testInfo);
  await frame("CU2");
  const diffs = [
    ...(await pair("badge", { text: "1", selector: "button span" }, { selector: "[data-testid=applied] [data-ui=count]" }, STYLE_PROPS, { size: ["h"] })),
    ...(await pair("active-button", { text: "Filter", selector: "button" }, { selector: "[data-testid=applied] [data-ui=filter] > button" }, STYLE_PROPS, { size: ["h"] })),
  ];
  expect(diffs).toEqual([]);
});

test("C_QOB1 customer picker open, and C_QOT7 narrowed by typing", async ({ browser }, testInfo) => {
  await openFixture(browser, testInfo);
  await frame("QOB1");
  const box = fixture("header").getByRole("combobox", { name: /^Customer/ });
  await box.click();
  await expect(appPage.getByRole("listbox")).toBeVisible();
  let result = await subtreeDiff({ text: "All customers", up: 1 }, { selector: "[data-testid=header] [data-ui=picker]" });
  expect(result.missing).toEqual([]);
  expect(result.diffs).toEqual([]);
  expect(await pair("picker-box", { text: "All customers", up: 1 }, { selector: "[data-testid=header] [data-ui=picker]" }, STYLE_PROPS, { size: ["w", "h"] })).toEqual([]);
  expect(await pair("picker-list", { text: "Showing 5 of 14. Scroll to see more or type to search.", up: 1 }, { selector: "[data-testid=header] [data-ui=picker-panel]" }, STYLE_PROPS, { size: ["w", "h"] })).toEqual([]);
  // Five rows show, the rest scroll.
  const list = await appPage.locator("[data-testid=header] [role=listbox]").evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight, row: el.firstElementChild!.getBoundingClientRect().height }));
  expect(list.client).toBe(list.row * 5);
  expect(list.scroll).toBeGreaterThan(list.client);

  await frame("QOT7");
  await box.fill("Wasat");
  result = await subtreeDiff({ text: "2 matches", up: 2 }, { selector: "[data-testid=header] [data-ui=picker]" });
  // The frame draws the typed text and a caret as two spans; the app has a real input holding "Wasat".
  expect(result.missing).toEqual(['span "Wasat"']);
  expect(result.diffs).toEqual([]);
  expect(await pair("typed", { text: "Wasat" }, { selector: "[data-testid=header] [data-ui=picker] input" }, ["color", "fontFamily", "fontSize", "fontWeight", "letterSpacing"])).toEqual([]);
});

test("C_QOTable table, status, View note and Show more; C_QOT2 columns picker", async ({ browser }, testInfo) => {
  await openFixture(browser, testInfo);
  await frame("QOTable");
  let diffs = [
    ...(await pair("card", { text: ":: Quote", up: 4 }, { selector: "[data-testid=table] [data-ui=table]" }, STYLE_PROPS)),
    ...(await pair("header-row", { text: ":: Quote", up: 1 }, { selector: "[data-testid=table] [role=row]", nth: 0 }, STYLE_PROPS, { size: ["h"] })),
    ...(await pair("header-cell", { text: ":: Customer" }, { selector: "[data-testid=table] [role=columnheader]", nth: 1 }, STYLE_PROPS, { size: ["h"] })),
    ...(await pair("header-right", { text: ":: Total" }, { selector: "[data-testid=table] [role=columnheader]", nth: 4 }, STYLE_PROPS, { size: ["h"] })),
    ...(await pair("columns-button", { selector: 'button[aria-label="Choose columns"]' }, { selector: '[data-testid=table] button[aria-label="Choose columns"]' }, STYLE_PROPS, { size: ["w", "h"] })),
    ...(await pair("row", { text: "Q-24790", up: 2 }, { selector: "[data-testid=table] [role=row]", nth: 3 }, STYLE_PROPS, { size: ["h"] })),
    ...(await pair("status", { text: "Changes requested", up: 1 }, { selector: "[data-testid=table] [data-ui=status]", nth: 2 }, STYLE_PROPS, { size: ["h"] })),
    ...(await pair("flag", { text: "Overdue", up: 1 }, { selector: "[data-testid=table] [data-ui=flag]", nth: 1 }, STYLE_PROPS, { size: ["h"] })),
    ...(await pair("view-note", { text: "View note" }, { selector: "[data-testid=table] [data-ui=view-note]" }, STYLE_PROPS, { size: ["w", "h"] })),
    ...(await pair("more", { text: "Show 18 more quotes" }, { selector: "[data-testid=table] [data-ui=more]" }, STYLE_PROPS, { size: ["w", "h"] })),
    ...(await pair("more-row", { text: "Show 18 more quotes", up: 1 }, { selector: "[data-testid=table] [data-ui=more]", up: 1 }, STYLE_PROPS, { size: ["h"] })),
  ];
  expect(diffs).toEqual([]);

  await frame("QOT2");
  await fixture("table").getByRole("button", { name: "Choose columns" }).click();
  await expect(appPage.getByRole("dialog", { name: "Choose columns" })).toBeVisible();
  // "Reset to default" and "Done" are real buttons (frame: spans).
  const result = await subtreeDiff({ text: "Choose columns", up: 1 }, { selector: "[data-testid=table] [data-ui=columns-picker]" }, { "Reset to default": "span", Done: "span" });
  expect(result.missing).toEqual([]);
  expect(result.diffs).toEqual([]);
  diffs = [
    ...(await pair("picker", { text: "Choose columns", up: 1 }, { selector: "[data-testid=table] [data-ui=columns-picker]" }, STYLE_PROPS, { size: ["w"] })),
    ...(await pair("shown-row", { text: "Customer", up: 1 }, { selector: "[data-testid=table] [data-ui=columns-picker] label", nth: 1 }, STYLE_PROPS, { size: ["h"] })),
    ...(await pair("hidden-row", { text: "Rep", up: 1 }, { selector: "[data-testid=table] [data-ui=columns-picker] label", nth: 6 }, STYLE_PROPS, { size: ["h"] })),
    ...(await pair("always-check", { text: "Quote", prev: true }, { selector: "[data-testid=table] [data-ui=columns-picker] [data-ui=check]", nth: 0 }, STYLE_PROPS, { size: ["w", "h"] })),
    ...(await pair("hidden-check", { text: "Rep", prev: true }, { selector: "[data-testid=table] [data-ui=columns-picker] [data-ui=check]", nth: 6 }, STYLE_PROPS, { size: ["w", "h"] })),
  ];
  expect(diffs).toEqual([]);
  // Hide and restore from the picker; the extra width at 1920 goes to the fluid tracks only.
  await appPage.getByRole("checkbox", { name: "Margin" }).uncheck({ force: true });
  await expect(fixture("table").getByRole("columnheader")).toHaveCount(5);
  await appPage.getByRole("checkbox", { name: "Margin" }).check({ force: true });
  await expect(fixture("table").getByRole("columnheader")).toHaveCount(6);
  const columnsButton = await fixture("table").getByRole("button", { name: "Choose columns" }).boundingBox();
  expect(columnsButton?.width).toBe(28);
});

test("C_QOT6 header drag: lifted header and drop line; C_QOB8 lane drag", async ({ browser }, testInfo) => {
  await openFixture(browser, testInfo);
  await frame("QOT6");
  const dataTransfer = await appPage.evaluateHandle(() => new DataTransfer());
  const head = (name: string) => fixture("table").getByRole("columnheader", { name });
  await head("Status").dispatchEvent("dragstart", { dataTransfer });
  await head("Requested").dispatchEvent("dragover", { dataTransfer });
  const lifted = ["transform", "boxShadow", "backgroundColor", "color", "paddingTop", "paddingLeft", "borderRadius", "fontSize", "fontWeight", "display"];
  let diffs = [
    ...(await pair("lifted", { text: ":: Status" }, { selector: "[data-testid=table] [data-ui=lifted]" }, lifted, { size: ["h"] })),
    ...(await pair("drop-line", { text: ":: Customer" }, { selector: "[data-testid=table] [data-drop=after]" }, [...STYLE_PROPS, "borderRightWidth", "borderRightColor", "borderRightStyle", "paddingRight"])),
  ];
  expect(diffs).toEqual([]);
  await head("Requested").dispatchEvent("drop", { dataTransfer });
  await expect(fixture("table").getByRole("columnheader")).toHaveText([":: Quote", ":: Customer", ":: Status", ":: Requested", ":: Total", ":: Margin"]);

  await frame("QOB8");
  const laneHandle = (n: number) => fixture("lanes").locator("[draggable=true]").nth(n);
  await laneHandle(1).dispatchEvent("dragstart", { dataTransfer });
  await laneHandle(3).dispatchEvent("dragover", { dataTransfer });
  const lane = [...STYLE_PROPS, "transform", "zIndex"];
  const outline = ["outlineStyle", "outlineColor", "outlineWidth", "outlineOffset"];
  diffs = [
    ...(await pair("lane", { selector: "section", nth: 0 }, { selector: "[data-testid=lanes] section", nth: 0 }, STYLE_PROPS)),
    ...(await pair("lane-dragging", { selector: "section", nth: 1 }, { selector: "[data-testid=lanes] section", nth: 1 }, lane)),
    ...(await pair("lane-drop", { selector: "section", nth: 3 }, { selector: "[data-testid=lanes] section", nth: 3 }, [...lane, ...outline])),
    ...(await pair("lane-head", { selector: "section > div", nth: 0 }, { selector: "[data-testid=lanes] section > div", nth: 0 }, STYLE_PROPS, { size: ["h"] })),
    ...(await pair("lane-handle", { text: "::", selector: "section span", nth: 0 }, { selector: "[data-testid=lanes] section [data-ui=handle]", nth: 0 }, STYLE_PROPS)),
    ...(await pair("lane-count", { text: "1", selector: "section span", nth: 0, up: 1 }, { selector: "[data-testid=lanes] section [data-ui=count]", nth: 0 }, STYLE_PROPS, { size: ["h"] })),
  ];
  expect(diffs).toEqual([]);
});

test("C_QOB3 and C_QOB4 dropdowns, C_S4 toggles, C_QOB5 sheet", async ({ browser }, testInfo) => {
  await openFixture(browser, testInfo);
  await frame("QOB3");
  await fixture("header").getByRole("button", { name: /^Needs attention/ }).click();
  let result = await subtreeDiff({ text: "3 need your attention", up: 1 }, { selector: "[data-testid=header] [data-ui=dropdown-panel]" });
  expect(result.missing).toEqual([]);
  expect(result.diffs).toEqual([]);
  let diffs = [
    ...(await pair("caution-open", { selector: 'button[aria-label="Needs attention, open"]' }, { selector: "[data-testid=header] [data-ui=caution]" }, STYLE_PROPS, { size: ["w", "h"] })),
    ...(await pair("dropdown", { text: "3 need your attention", up: 1 }, { selector: "[data-testid=header] [data-ui=dropdown-panel]" }, STYLE_PROPS, { size: ["w"] })),
  ];
  expect(diffs).toEqual([]);
  await appPage.keyboard.press("Escape");

  await frame("QOB4");
  await fixture("header").getByRole("button", { name: /^Notifications/ }).click();
  result = await subtreeDiff({ text: "Notifications", up: 1, selector: "div" }, { selector: "[data-testid=header] [data-ui=dropdown-panel]" });
  expect(result.missing).toEqual([]);
  expect(result.diffs).toEqual([]);
  expect(await pair("bell-open", { selector: 'button[aria-label="Notifications, open"]' }, { selector: "[data-testid=header] [data-ui=bell]" }, STYLE_PROPS, { size: ["w", "h"] })).toEqual([]);
  await appPage.keyboard.press("Escape");

  await frame("QOB2");
  diffs = [
    ...(await pair("caution", { selector: 'button[aria-label="Needs attention, 2 items"]' }, { selector: "[data-testid=header] [data-ui=caution]" }, STYLE_PROPS, { size: ["w", "h"] })),
    ...(await pair("bell", { selector: 'button[aria-label="Notifications"]' }, { selector: "[data-testid=header] [data-ui=bell]" }, STYLE_PROPS, { size: ["w", "h"] })),
    ...(await pair("title", { selector: "h1" }, { selector: "[data-testid=header] h1" }, STYLE_PROPS, { size: ["h"] })),
    ...(await pair("header-row", { selector: "h1", up: 1 }, { selector: "[data-testid=header] header" }, STYLE_PROPS)),
  ];
  expect(diffs).toEqual([]);

  await frame("S4");
  diffs = [
    ...(await pair("toggle-on", { where: "toggle-on" }, { selector: "[data-testid=toggles] [role=switch][aria-checked=true]" }, STYLE_PROPS, { size: ["w", "h"] })),
    ...(await pair("toggle-off", { where: "toggle-off" }, { selector: "[data-testid=toggles] [role=switch][aria-checked=false]" }, STYLE_PROPS, { size: ["w", "h"] })),
  ];
  expect(diffs).toEqual([]);
  // The knob: colour, shape, size and where it sits in the track (right when on, left when off).
  const knob = async (page: Page, at: Locate, name: string) => {
    expect(await mark(page, at, name)).toBe(true);
    return page.evaluate((name) => {
      const track = document.querySelector(`[data-m="${name}"]`)!;
      const k = track.firstElementChild!;
      const cs = getComputedStyle(k);
      const r = k.getBoundingClientRect(), t = track.getBoundingClientRect();
      return { bg: cs.backgroundColor, radius: cs.borderRadius, w: r.width, h: r.height, top: r.top - t.top, left: r.left - t.left, right: t.right - r.right };
    }, name);
  };
  for (const state of ["on", "off"] as const) {
    expect(await knob(appPage, { selector: `[data-testid=toggles] [role=switch][aria-checked=${state === "on"}]` }, `a-knob-${state}`))
      .toEqual(await knob(framePage, { where: `toggle-${state}` }, `f-knob-${state}`));
  }

  await frame("QOB5");
  await fixture("sheet").getByRole("button", { name: "Open sheet" }).click();
  await expect(appPage.getByRole("dialog", { name: "Q-24790" })).toBeVisible();
  diffs = [
    ...(await pair("sheet", { selector: "aside div", text: "Q-24790", up: 3 }, { selector: "[data-ui=sheet]" }, STYLE_PROPS, { size: ["w"] })),
    ...(await pair("sheet-backdrop", { selector: "aside div", text: "Q-24790", up: 3, prev: true }, { selector: "[data-ui=sheet-backdrop]" }, STYLE_PROPS)),
    ...(await pair("sheet-title", { selector: "aside div", text: "Q-24790" }, { selector: "[data-ui=sheet] h2" }, LOOK, { size: ["h"] })),
    ...(await pair("sheet-subtitle", { selector: "aside div", text: "Wasatch Mechanical Contractors" }, { selector: "[data-ui=sheet] [data-ui=subtitle]" }, STYLE_PROPS, { size: ["h"] })),
    ...(await pair("sheet-close", { text: "x" }, { selector: "[data-ui=sheet] [data-ui=close]" }, LOOK, { size: ["w", "h"] })),
  ];
  expect(diffs).toEqual([]);
  await appPage.keyboard.press("Escape");
  await expect(appPage.getByRole("dialog", { name: "Q-24790" })).toHaveCount(0);
});

test("column order and visibility persist per user", async ({ browser }, testInfo) => {
  await resetDemo(testInfo, browser);
  await openFixture(browser, testInfo, "mara");
  const headers = () => fixture("table").getByRole("columnheader");
  await expect(headers()).toHaveText([":: Quote", ":: Customer", ":: Requested", ":: Status", ":: Total", ":: Margin"]);
  const saved = appPage.waitForResponse((r) => r.url().endsWith("/api/rep/table-prefs") && r.request().method() === "PUT");
  await headers().nth(3).focus();
  await appPage.keyboard.press("Alt+ArrowLeft");
  expect((await saved).status()).toBe(200);
  const hidden = appPage.waitForResponse((r) => r.url().endsWith("/api/rep/table-prefs") && r.request().method() === "PUT");
  await fixture("table").getByRole("button", { name: "Choose columns" }).click();
  await appPage.getByRole("checkbox", { name: "Margin" }).uncheck({ force: true });
  expect((await hidden).status()).toBe(200);
  await appPage.reload();
  await expect(headers()).toHaveText([":: Quote", ":: Customer", ":: Status", ":: Requested", ":: Total"]);
  await appPage.context().close();
  await openFixture(browser, testInfo, "eli");
  await expect(headers()).toHaveText([":: Quote", ":: Customer", ":: Requested", ":: Status", ":: Total", ":: Margin"]);
  await appPage.context().close();
  await resetDemo(testInfo, browser);
});
