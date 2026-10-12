import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { FONT_USER_AGENT, FRAME_SIZE, STYLE_PROPS, diffMeasures, measureAll, openFrame, startFrameServer } from "../scripts/frames/lib.mjs";

// Frame proof for plan U10 (customer site): C_CVE0 (visitor), C_CVL1 (customer), C_CVL2 (Orders),
// C_CVL3 (My rep), C_CVL4 (bell opened), C_CVL5 (quote opened from the bell). Each state is driven in
// the app at 1920x1080 and its computed styles are diffed with the frame (1440x900) through
// scripts/frames/lib.mjs. Only the Querent box, the sheets, the bell, the account chip and the
// visitor's Sign in are built: the frames' stand-in Herrick logo is removed from the frame before it
// is measured, and in C_CVL5 so is the drawn quote document (the app renders the real customer PDF to
// a canvas). Every frame element the app lacks must be a listed placeholder (Appendix G), and its app
// counterpart must carry the frame element's look; every app text the frame lacks must be listed too,
// so no copy, icon or button is added. Nothing here is a hard-coded style value.

const COOKIE = "querent-persona";
const APP_SIZE = { width: 1920, height: 1080 };
const SEED_DATE = "2026-09-23";

let frames: { base: string; close: () => void };
let framePage: Page;
let appPage: Page;

test.beforeAll(async ({ browser }, testInfo) => {
  frames = await startFrameServer();
  framePage = await (await browser.newContext({ viewport: FRAME_SIZE, userAgent: FONT_USER_AGENT })).newPage();
  await resetDemo(testInfo, browser);
});
test.afterAll(async () => frames.close());

async function resetDemo(testInfo: TestInfo, browser: Browser) {
  const context = await browser.newContext();
  const response = await context.request.post(`${testInfo.project.use.baseURL}/api/test/reset`, { data: { seed_date: SEED_DATE } });
  expect(response.status(), "POST /api/test/reset needs QUERENT_E2E_RESET=1 on the server").toBe(200);
  await context.close();
}

async function openApp(browser: Browser, testInfo: TestInfo, persona?: string) {
  const context = await browser.newContext({ viewport: APP_SIZE });
  if (persona) await context.addCookies([{ name: COOKIE, value: persona, url: String(testInfo.project.use.baseURL) }]);
  appPage = await context.newPage();
  await appPage.goto("/");
  await appPage.evaluate(() => document.fonts.ready);
  return appPage;
}

/** Hover is a state the frames do not draw: park the pointer where nothing is. */
async function restMouse() {
  await appPage.mouse.move(1, 1);
  await appPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/** The frame without what is not built: the stand-in Herrick logo, and (C_CVL5) the drawn quote document. */
async function openFrameBuilt(id: string) {
  await openFrame(framePage, frames.base, id);
  await framePage.evaluate(() => {
    const logo = [...document.querySelectorAll("span")].find((e) => e.textContent === "Herrick Industrial Supply");
    logo?.parentElement?.remove();
    document.querySelector('div[style*="height: 560px"]')?.remove();
  });
}

/** How to find one element: a CSS selector, and/or the element whose own text is `text` (or matches it). */
interface Locate { selector?: string; text?: string | RegExp; nth?: number; up?: number }

async function mark(page: Page, at: Locate, markName: string) {
  return page.evaluate(({ at, text, flags, markName }) => {
    document.querySelectorAll(`[data-m="${markName}"]`).forEach((e) => e.removeAttribute("data-m"));
    const ownText = (el: Element) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()).join(" ").trim();
    const re = flags !== null ? new RegExp(text!, flags) : null;
    let found = [...document.querySelectorAll(at.selector ?? "body *")];
    if (text !== null) found = found.filter((e) => (re ? re.test(ownText(e)) : ownText(e) === text) && getComputedStyle(e).display !== "none");
    let el: Element | null = found[at.nth ?? 0] ?? null;
    for (let i = 0; el && i < (at.up ?? 0); i++) el = el.parentElement;
    if (!el) return false;
    el.setAttribute("data-m", markName);
    return true;
  }, { at: { ...at, text: undefined }, text: at.text instanceof RegExp ? at.text.source : (at.text ?? null), flags: at.text instanceof RegExp ? at.text.flags : null, markName });
}

const EXTRA_PROPS = ["width", "height", "boxSizing", "borderLeftWidth", "borderLeftColor", "borderRightWidth", "borderRightColor"];
async function styleAt(page: Page, at: Locate, label: string, pseudo: string | null = null) {
  if (page === appPage) await restMouse();
  expect(await mark(page, at, label), `${label}: element not found ${JSON.stringify({ ...at, text: String(at.text) })}`).toBe(true);
  return page.evaluate(({ label, props, pseudo }) => {
    const el = document.querySelector(`[data-m="${label}"]`)!;
    const cs = getComputedStyle(el, pseudo) as unknown as Record<string, string>;
    const r = el.getBoundingClientRect();
    return { style: Object.fromEntries(props.map((p) => [p, cs[p]])), rect: { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 } };
  }, { label, props: [...STYLE_PROPS, ...EXTRA_PROPS], pseudo });
}

/** A frame element paired with an app element: the listed props (and sizes) must be equal. Returns the differences. */
async function pair(name: string, frame: Locate, app: Locate, props: readonly string[], { size = [] as ("w" | "h")[], appPseudo = null as string | null } = {}) {
  const f = await styleAt(framePage, frame, `f-${name}`);
  const a = await styleAt(appPage, app, `a-${name}`, appPseudo);
  const diffs: Record<string, { frame: unknown; app: unknown }> = {};
  for (const p of props) if (f.style[p] !== a.style[p]) diffs[p] = { frame: f.style[p], app: a.style[p] };
  for (const s of size) if (f.rect[s] !== a.rect[s]) diffs[s === "w" ? "width" : "height"] = { frame: f.rect[s], app: a.rect[s] };
  return Object.keys(diffs).length ? [{ element: name, ...diffs }] : [];
}

/** STYLE_PROPS without the layout-only props a real control legitimately changes. */
const LOOK = STYLE_PROPS.filter((p: string) => p !== "display" && p !== "textAlign");

/** A frame element the app shows with real data (Appendix G placeholder), or as a real control: where it is in the app, and why the text differs. */
interface Placeholder { frame: string; app: Locate; why: string; props?: readonly string[]; pseudo?: string }

interface FrameCase {
  id: string;
  persona?: string;
  /** Drives the app into the frame's state. */
  drive: (page: Page) => Promise<void>;
  placeholders: Placeholder[];
  /** App texts the frame does not draw, each a placeholder's real value (tag "text" pattern). */
  extras: RegExp[];
  /** App element text -> the frame's tag, where the app uses the right element and the frame draws another (each explained). */
  alias?: Record<string, string>;
}

const PLACEHOLDER_INPUT: Placeholder = {
  frame: 'span "Ask about stock, pricing, orders..."',
  app: { selector: 'input[aria-label="Ask a question"]' },
  pseudo: "::placeholder",
  props: ["color", "fontSize", "fontWeight", "fontFamily"],
  why: "the frame draws the empty input's hint as a span; the app's input carries it as its placeholder, with the same text and look",
};
const BADGE = (frameCount: string): Placeholder => ({
  frame: `span "${frameCount}"`,
  app: { selector: 'button[aria-label="Notifications"] span' },
  why: "unread count: the frame's is a placeholder (Appendix G, notification samples); the app shows Dana's real unread count",
});
const CHIP_NAME: Placeholder = {
  frame: 'div "Wasatch Mechanical"',
  app: { text: "Wasatch Mechanical Contractors" },
  why: "the account chip shows the customer's real name (Wasatch Mechanical Contractors); the frame shortens it",
};
const CUSTOMER_BAR = [/^div "Wasatch Mechanical Contractors"$/, /^span "\d+"$/];

const CASES: FrameCase[] = [
  {
    id: "CVE0",
    drive: async (page) => { await expect(page.getByText("Powered by Querent")).toBeVisible(); },
    placeholders: [PLACEHOLDER_INPUT],
    extras: [],
  },
  {
    id: "CVL1",
    persona: "customer",
    drive: async (page) => {
      await expect(page.getByLabel("Ask a question")).toBeVisible();
      await expect(page.getByRole("button", { name: "Notifications" }).locator("span")).toBeVisible();
    },
    placeholders: [PLACEHOLDER_INPUT, BADGE("2"), CHIP_NAME],
    extras: CUSTOMER_BAR,
  },
  {
    id: "CVL2",
    persona: "customer",
    drive: async (page) => {
      await page.getByRole("button", { name: "Orders" }).click();
      await expect(page.getByRole("dialog", { name: "Previous orders" }).locator("[data-order]")).toHaveCount(5);
    },
    placeholders: [PLACEHOLDER_INPUT, BADGE("2"), CHIP_NAME,
      ...["Sep 25, 2026", "Sep 11, 2026", "Aug 28, 2026", "Aug 14, 2026", "Jul 31, 2026"].map((date, nth) => ({
        frame: `span "${date}"`, app: { selector: "[data-order] span", text: /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/, nth },
        why: "order date: the frame's orders are placeholders (Appendix G); the app lists Dana's real orders" })),
      ...["Delivery, SLC · From quote Q-24816", "Delivery, Provo · From quote Q-24814", "Will call, SLC · From quote Q-24812", "Delivery, SLC · From quote Q-24811", "Will call, SLC"].map((meta, nth) => ({
        frame: `div "${meta}"`, app: { selector: "[data-order] div", text: /^(Delivery|Will call), /, nth },
        why: "order fulfillment and quote: placeholder orders (Appendix G); the app lists Dana's real ones" })),
      ...["SO-51223", "SO-51222", "SO-51221", "SO-51220", "SO-51219"].map((number, nth) => ({
        frame: `span "${number}"`, app: { selector: "[data-order] span", text: /^SO-\d+$/, nth }, why: "order number: placeholder orders (Appendix G)" })),
      ...["$698.22", "$304.23", "$481.87", "$303.38", "$175.03"].map((total, nth) => ({
        frame: `div "${total}"`, app: { selector: "[data-order] div", text: /^\$[\d,]+\.\d\d$/, nth }, why: "order total: placeholder orders (Appendix G)" })),
      { frame: 'div "Shipped"', app: { selector: "[data-order] div", text: /^(Shipped|Closed|Open)$/ }, why: "order status: placeholder orders (Appendix G)" },
      { frame: 'span "23"', app: { selector: '[data-ui="site-sheet"] span', text: /^\d+$/ }, why: "order count: placeholder orders (Appendix G)" },
      { frame: 'button "Show 18 more"', app: { selector: "button", text: /^Show \d+ more$/ }, why: "remaining orders: placeholder orders (Appendix G)" },
    ],
    extras: [...CUSTOMER_BAR, /^span "SO-\d+"$/, /^span "[A-Z][a-z]{2} \d{1,2}, \d{4}"$/, /^div "(Delivery|Will call), /, /^div "\$[\d,]+\.\d\d"$/, /^div "(Shipped|Closed|Open)"$/, /^button "Show \d+ more"$/],
  },
  {
    id: "CVL3",
    persona: "customer",
    drive: async (page) => {
      await page.getByRole("button", { name: "My rep" }).click();
      await expect(page.getByRole("dialog", { name: "Your rep" }).getByText("Inside Sales")).toBeVisible();
    },
    placeholders: [PLACEHOLDER_INPUT, BADGE("2"), CHIP_NAME],
    extras: CUSTOMER_BAR,
  },
  {
    id: "CVL4",
    persona: "customer",
    drive: async (page) => {
      await page.getByRole("button", { name: "Notifications" }).click();
      await expect(page.getByRole("dialog", { name: "Notifications" }).locator("[data-read]").first()).toBeVisible();
    },
    placeholders: [PLACEHOLDER_INPUT, BADGE("2"), CHIP_NAME,
      ...["Quote Q-24791 is ready to review", "Brandi updated Q-24790", "Order SO-51223 has shipped"].map((title, nth) => ({
        frame: `div "${title}"`, app: { selector: "[data-read] > div > div:first-child", nth }, why: "notification title: the frame's notifications are placeholders (Appendix G); the app derives Dana's real ones" })),
      ...["$96.00. Brandi sent it today.", "The changes you asked for are in. Revision 2.", "Delivery, SLC. From quote Q-24816."].map((body, nth) => ({
        frame: `div "${body}"`, app: { selector: "[data-read] > div > div:last-child", nth }, why: "notification line: placeholder notifications (Appendix G)" })),
      ...["Just now", "2 h ago", "Yesterday"].map((when, nth) => ({
        frame: `span "${when}"`, app: { selector: "[data-read] > span:last-child", nth }, why: "when: placeholder notifications (Appendix G)" })),
    ],
    extras: [...CUSTOMER_BAR, /^div "(Quote Q-\d+ (is ready to review|expired)|Brandi updated Q-\d+|Order SO-\d+ has shipped)"$/,
      /^div "(\$[\d,]+\.\d\d\. Brandi sent it (today|yesterday|on [A-Z][a-z]{2} \d{1,2}(, \d{4})?)\.|The changes you asked for are in\. Revision \d+\.|It was valid until [A-Z][a-z]{2} \d{1,2}(, \d{4})?\.|(Delivery|Will call), \w+\.( From quote Q-\d+\.)?)"$/,
      /^span "(Just now|\d+ min ago|\d+ h ago|Today|Yesterday|[A-Z][a-z]{2} \d{1,2}(, \d{4})?)"$/],
  },
  {
    id: "CVL5",
    persona: "customer",
    drive: async (page) => {
      await page.getByRole("button", { name: "Notifications" }).click();
      await page.getByRole("button", { name: /^Quote Q-24791 is ready to review/ }).click();
      const dialog = page.getByRole("dialog", { name: "Quote Q-24791" });
      await expect(dialog.getByRole("document")).toHaveAttribute("data-state", "ready");
    },
    placeholders: [PLACEHOLDER_INPUT, BADGE("2"), CHIP_NAME,
      { frame: 'div "Oct 23"', app: { selector: ".qp-fact-value", nth: 1 }, why: "valid until: the frame's date is a placeholder; the app shows Q-24791's real valid-until day" }],
    // The PDF's text for screen readers (visually hidden): the real document the frame draws as a placeholder.
    extras: [...CUSTOMER_BAR, /^div "[A-Z][a-z]{2} \d{1,2}(, \d{4})?"$/, /^p "H Herrick Industrial Supply /],
    alias: { Download: "button" },
  },
];

/** The app's text elements the frame does not draw, as tag "text". */
async function extraTexts(frameM: { tag: string; text: string }[], appM: { tag: string; text: string }[]) {
  return diffMeasures(appM, frameM).missing as string[];
}

for (const c of CASES) {
  test(`C_${c.id} matches the frame`, async ({ browser }, testInfo) => {
    await openApp(browser, testInfo, c.persona);
    await c.drive(appPage);
    await openFrameBuilt(c.id);
    await restMouse();
    const frameM = await framePage.evaluate(measureAll, { root: "body", props: STYLE_PROPS });
    const appM = (await appPage.evaluate(measureAll, { root: "body", props: STYLE_PROPS }))
      .map((e: { text: string; tag: string }) => (c.alias?.[e.text] ? { ...e, tag: c.alias[e.text] } : e));
    const result = diffMeasures(frameM, appM);
    const listed = new Map(c.placeholders.map((p) => [p.frame, p]));
    const unexplained = (result.missing as string[]).filter((m) => !listed.has(m));
    const placeholderDiffs = [];
    for (const [i, m] of (result.missing as string[]).entries()) {
      const p = listed.get(m);
      if (!p) continue;
      const [, tag, text] = /^(\w+) "(.*)"$/.exec(m)!;
      placeholderDiffs.push(...(await pair(`ph${i}`, { selector: tag, text }, p.app, p.props ?? LOOK, { appPseudo: p.pseudo ?? null })).map((d) => ({ ...d, element: m })));
    }
    const added = (await extraTexts(frameM, appM)).filter((t) => !c.extras.some((re) => re.test(t)));
    await testInfo.attach(`C_${c.id}-diff.json`, { body: JSON.stringify({ result, placeholderDiffs, added }, null, 1), contentType: "application/json" });
    expect(unexplained, `C_${c.id}: frame elements missing in the app`).toEqual([]);
    expect(result.diffs, `C_${c.id}: style differences`).toEqual([]);
    expect(placeholderDiffs, `C_${c.id}: placeholders whose app counterpart looks different`).toEqual([]);
    expect(added, `C_${c.id}: app text the frame does not draw`).toEqual([]);
  });
}

test("the input's placeholder is the frame's hint, word for word", async ({ browser }, testInfo) => {
  await openApp(browser, testInfo);
  await openFrameBuilt("CVE0");
  const hint = await framePage.evaluate(() => [...document.querySelectorAll("span")].find((e) => e.textContent?.startsWith("Ask about stock, pricing"))!.textContent);
  await expect(appPage.getByLabel("Ask a question")).toHaveAttribute("placeholder", hint!);
});

test("at 1920 the box keeps the frame's width and the sheets theirs; only the space around them grows", async ({ browser }, testInfo) => {
  await openApp(browser, testInfo, "customer");
  await expect(appPage.getByLabel("Ask a question")).toBeVisible();
  await openFrameBuilt("CVL2");
  // The frame's box column and composer (max-width 880) and its sheet (400) at 1440; the app's at 1920.
  const frameWidths = await framePage.evaluate(() => ({
    box: [...document.querySelectorAll("h2")][0].parentElement!.getBoundingClientRect().width,
    sheet: [...document.querySelectorAll("span")].find((e) => e.textContent === "Previous orders")!.parentElement!.parentElement!.getBoundingClientRect().width,
  }));
  const appBox = await appPage.locator('[data-ui="box"]').boundingBox();
  const composer = await appPage.getByLabel("Ask a question").locator("xpath=ancestor::form").boundingBox();
  expect(appBox!.width).toBe(frameWidths.box);
  expect(composer!.width).toBe(frameWidths.box);
  expect(await appPage.evaluate(() => document.documentElement.scrollWidth)).toBe(APP_SIZE.width);
  await appPage.getByRole("button", { name: "Orders" }).click();
  const sheet = await appPage.locator('[data-ui="site-sheet"]').boundingBox();
  expect(sheet!.width).toBe(frameWidths.sheet);
  expect(sheet!.x + sheet!.width).toBe(APP_SIZE.width);
  // The strip spans the page (fluid).
  expect((await appPage.locator("main").boundingBox())!.width).toBe(APP_SIZE.width);
});

test("the active states the frames draw: Orders and My rep while their sheet is open, the bell while open", async ({ browser }, testInfo) => {
  await openApp(browser, testInfo, "customer");
  await expect(appPage.getByLabel("Ask a question")).toBeVisible();
  const borders = ["borderTopWidth", "borderTopColor"];
  await appPage.getByRole("button", { name: "Orders" }).click();
  await openFrameBuilt("CVL2");
  expect(await pair("orders-open", { selector: "button", text: "Orders" }, { selector: "button", text: "Orders" }, borders)).toEqual([]);
  await appPage.keyboard.press("Escape");
  await appPage.getByRole("button", { name: "My rep" }).click();
  await openFrameBuilt("CVL3");
  expect(await pair("rep-open", { selector: "button", text: "My rep" }, { selector: "button", text: "My rep" }, borders)).toEqual([]);
  await appPage.keyboard.press("Escape");
  await appPage.getByRole("button", { name: "Notifications" }).click();
  await openFrameBuilt("CVL4");
  expect(await pair("bell-open", { selector: 'button[aria-label="Notifications"]' }, { selector: 'button[aria-label="Notifications"]' }, [...borders, "backgroundColor", "color"], { size: ["w", "h"] })).toEqual([]);
  expect(await pair("bell-panel", { selector: "span", text: "Notifications", up: 2 }, { selector: '[data-ui="bell-panel"]' }, ["backgroundColor", "borderTopColor", "borderTopWidth", "borderRadius", "boxShadow"])).toEqual([]);
});
