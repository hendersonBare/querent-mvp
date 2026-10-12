import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { FONT_USER_AGENT, STYLE_PROPS, diffMeasures, measureAll, openFrame, startFrameServer } from "../scripts/frames/lib.mjs";

// Frame proof for plan U6 (Analytics), first pass: every mapped frame's header and tab strip.

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

async function appAs(browser: Browser, testInfo: TestInfo, persona: string) {
  const baseURL = String(testInfo.project.use.baseURL);
  const context = await browser.newContext({ viewport: APP_SIZE, baseURL });
  contexts.push(context);
  await context.addCookies([{ name: COOKIE, value: persona, url: baseURL }]);
  const page = await context.newPage();
  await page.goto("/rep/analytics");
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(1919, 1079);
  return page;
}
async function measure(page: Page, selector: string): Promise<Measure[]> {
  expect(await page.locator(selector).count(), `${selector} not found`).toBeGreaterThan(0);
  await page.evaluate((sel) => {
    document.querySelectorAll("[data-m]").forEach((e) => e.removeAttribute("data-m"));
    document.querySelector(sel)!.setAttribute("data-m", "root");
  }, selector);
  return page.evaluate(measureAll, { root: '[data-m="root"]', props: STYLE_PROPS });
}
function expectSame(name: string, frameList: Measure[], appList: Measure[]) {
  const forward = diffMeasures(frameList, appList);
  expect(forward.missing, `${name}: elements of the frame missing from the app`).toEqual([]);
  expect(forward.diffs, `${name}: style differences`).toEqual([]);
  expect(diffMeasures(appList, frameList).missing, `${name}: text or controls the app adds that the frame lacks`).toEqual([]);
}

const MANAGER = ["ANBase", "AN1", "AN3", "AN4", "AN6", "AN7", "AN8", "AN2", "AN5"];
const REP = ["RAN1", "RAN2", "RAN3", "RAN4", "RAN5"];
for (const id of [...MANAGER, ...REP]) {
  test(`C_${id}: the header and the tab strip`, async ({ browser }, testInfo) => {
    await openFrame(framePage, frames.base, id);
    const page = await appAs(browser, testInfo, MANAGER.includes(id) ? "supplier" : "mara");
    expectSame(`C_${id} header`, await measure(framePage, "main > :nth-child(1)"), await measure(page, "main > :nth-child(1)"));
    expectSame(`C_${id} tabs`, await measure(framePage, "main > :nth-child(2)"), await measure(page, "main > :nth-child(2)"));
  });
}
