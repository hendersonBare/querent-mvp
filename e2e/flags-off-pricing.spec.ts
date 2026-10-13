import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

// A feature flag that is off also stops what it governs (decision 71, amending 48; plan U12), on a real
// server: free delivery pricing is stored on while FEATURE_FREE_DELIVERY_PRICING is on; a server started
// with that flag off then prices Mara's reopened delivery drafts as with free delivery pricing off (the
// normal freight line, no recovery), and keeps the stored toggle; a server started with the flag back on
// applies the stored toggle again. The flag is an environment variable read on the server, so this spec
// starts production servers of its own (the build Playwright already needs), one after another on one
// database, each on a free port: it does not use the configured server or its flags. Rep views as Mara
// (querent-persona=mara), the toggle through the manager's routes (supplier), at 1920x1080.
//
// The drafts are the seed's (Mara's book, task F1): Q-24784, $1,874.70 delivered from SLC, over the $1,500
// free-delivery threshold, so it carries recovery while free delivery pricing is in effect; and Q-24788,
// $1,517.50, which the first test edits to $1,491.60, under the threshold: $0.00 freight with free delivery
// pricing in effect, the distance charge without it.

const COOKIE = "querent-persona";
const APP_SIZE = { width: 1920, height: 1080 };
const SEED_DATE = "2026-09-23";
const FLAGS = ["FEATURE_FREE_DELIVERY_PRICING", "FEATURE_RECOVERY_POOL", "FEATURE_DELIVERY_COST_MODEL"] as const;
const OVER = "Q-24784", UNDER = "Q-24788";
const FREE_DELIVERY_SENTENCE = "Free delivery pricing: freight is recovered in item prices.";

test.describe.configure({ mode: "serial" });

const db = join(tmpdir(), `querent-flags-off-pricing-${process.pid}.sqlite`);
type App = { url: string; process: ChildProcess };
let app: App | null = null;
const contexts: BrowserContext[] = [];

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

/** The server's environment: the free delivery pricing flag as given, the pool and cost model flags on. */
function appEnv(freeDelivery: boolean, port?: number): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env, DATABASE_PATH: db, QUERENT_SEED_DATE: SEED_DATE, QUERENT_SCRIPTED: "1", QUERENT_E2E_RESET: "1",
    ANTHROPIC_API_KEY: "", OILPRICEAPI_KEY: "", NEXT_TELEMETRY_DISABLED: "1",
  };
  for (const name of FLAGS) env[name] = "1";
  env.FEATURE_FREE_DELIVERY_PRICING = freeDelivery ? "1" : "";
  if (port) env.PORT = String(port);
  return env;
}

/** Stops the running server, if any, and starts a production server of this build on the same database (never reset). */
async function startApp(freeDelivery: boolean): Promise<App> {
  await stopApp();
  const port = await freePort();
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "--hostname", "127.0.0.1"], { env: appEnv(freeDelivery, port), stdio: "ignore" });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 240; i++) {
    const up = await fetch(url).then((r) => r.status > 0).catch(() => false);
    if (up) return (app = { url, process: child });
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error(`The server did not start at ${url} (run npm run build first)`);
}

async function stopApp() {
  if (!app) return;
  const { process: child } = app;
  app = null;
  for (const c of contexts.splice(0)) await c.close();
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => { child.once("exit", () => resolve()); child.kill(); });
}

test.beforeAll(() => {
  const reset = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/reset-db.ts"], { env: appEnv(true), encoding: "utf8" });
  expect(reset.status, `db:reset: ${reset.stderr}`).toBe(0);
});
test.afterAll(async () => {
  await stopApp();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(db + suffix, { force: true });
});

async function as(browser: Browser, persona: string) {
  const context = await browser.newContext({ viewport: APP_SIZE, baseURL: app!.url });
  contexts.push(context);
  await context.addCookies([{ name: COOKIE, value: persona, url: app!.url }]);
  return context;
}

/** The quote's detail as the rep's API answers it (it reprices a draft first, like the page). */
async function detail(page: Page, number: string) {
  const response = await page.request.get(`/api/rep/quotes/${number}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as { quote: { freight_rate_bp: number | null }; lines: { freight_recovery: number }[]; freight: { amount: number; computed: { rule: string } } };
}

/** Opens the quote in the editor, then Quote details' Pickup or delivery section (C_QE4). */
async function openFreight(page: Page, number: string) {
  await page.goto(`/rep/quotes/${number}`);
  const details = page.getByRole("button", { name: /^Quote details/ });
  await details.click();
  await expect(details).toHaveAttribute("aria-expanded", "true");
  return page.getByRole("region", { name: "Quote details" }).getByRole("region", { name: "Pickup or delivery", exact: true });
}
const rowValue = (section: Locator, label: string) => section.getByText(label, { exact: true }).locator("xpath=following-sibling::span[1]");
const chip = (page: Page) => page.getByRole("group", { name: "Quote facts" }).getByText(/^Freight recovery \d+\.\d%$/);

test("flag on: free delivery pricing is turned on; Mara's drafts carry recovery over the threshold and $0.00 freight", async ({ browser }) => {
  await startApp(true);
  const manager = (await as(browser, "supplier")).request;
  expect((await manager.get("/api/rep/settings/freight/preview")).status()).toBe(200);
  const put = await manager.put("/api/rep/settings/freight", { data: { enabled: true } });
  expect(put.status()).toBe(200);
  expect(await put.json()).toMatchObject({ enabled: true });

  const mara = await (await as(browser, "mara")).newPage();
  const over = await openFreight(mara, OVER);
  await expect(chip(mara)).toBeVisible();
  await expect(rowValue(over, "Freight")).toHaveText("$0.00");
  await expect(over.getByText(FREE_DELIVERY_SENTENCE, { exact: true })).toBeVisible();
  expect(await detail(mara, OVER)).toMatchObject({ quote: { freight_rate_bp: expect.any(Number) }, freight: { amount: 0, computed: { rule: "free_delivery_pricing" } } });

  const edited = await mara.request.patch(`/api/rep/quotes/${UNDER}/lines/q-24788-3`, { data: { qty: 18 } });
  expect(edited.status()).toBe(200);
  const under = await openFreight(mara, UNDER);
  await expect(rowValue(under, "Freight")).toHaveText("$0.00");
  await expect(under.getByText(FREE_DELIVERY_SENTENCE, { exact: true })).toBeVisible();
  await expect(chip(mara)).toHaveCount(0);
});

test("a server started with FEATURE_FREE_DELIVERY_PRICING off: the reopened drafts get the normal freight line and no recovery; the stored toggle is kept", async ({ browser }) => {
  await startApp(false);
  const manager = (await as(browser, "supplier")).request;
  // Stored settings are never changed: the toggle still reads on, and its write is refused while the flag is off.
  expect(await (await manager.get("/api/rep/settings/freight")).json()).toMatchObject({ enabled: true });
  expect((await manager.put("/api/rep/settings/freight", { data: { enabled: false } })).status()).toBe(403);

  const mara = await (await as(browser, "mara")).newPage();
  const over = await openFreight(mara, OVER);
  await expect(rowValue(over, "Freight")).toHaveText("$0.00");
  await expect(over.getByText(/^Free delivery: items total \$1,874\.70, at or over the \$1,500\.00 threshold\./)).toBeVisible();
  await expect(over.getByText(FREE_DELIVERY_SENTENCE, { exact: true })).toHaveCount(0);
  await expect(chip(mara)).toHaveCount(0);
  const off = await detail(mara, OVER);
  expect(off).toMatchObject({ quote: { freight_rate_bp: null }, freight: { amount: 0, computed: { rule: "free_threshold" } } });
  expect(off.lines.map((l) => l.freight_recovery)).toEqual([0, 0, 0, 0]);

  const under = await openFreight(mara, UNDER);
  await expect(rowValue(under, "Freight")).toHaveText(/^\$(?!0\.00)[\d,]+\.\d\d$/);
  await expect(rowValue(under, "Formula")).toHaveText(/^\$25\.00 \+ \$2\.50\/mi × \d+\.\d mi = \$[\d,]+\.\d\d$/);
  await expect(under.getByText(FREE_DELIVERY_SENTENCE, { exact: true })).toHaveCount(0);
  expect(await detail(mara, UNDER)).toMatchObject({ freight: { computed: { rule: "distance" } } });
});

test("a server started with the flag back on applies the stored toggle again: the drafts reprice on their next open", async ({ browser }) => {
  await startApp(true);
  const mara = await (await as(browser, "mara")).newPage();
  const over = await openFreight(mara, OVER);
  await expect(chip(mara)).toBeVisible();
  await expect(over.getByText(FREE_DELIVERY_SENTENCE, { exact: true })).toBeVisible();
  const on = await detail(mara, OVER);
  expect(on).toMatchObject({ quote: { freight_rate_bp: expect.any(Number) }, freight: { amount: 0, computed: { rule: "free_delivery_pricing" } } });
  expect(on.lines.some((l) => l.freight_recovery > 0)).toBe(true);
  const under = await openFreight(mara, UNDER);
  await expect(rowValue(under, "Freight")).toHaveText("$0.00");
  await expect(under.getByText(FREE_DELIVERY_SENTENCE, { exact: true })).toBeVisible();
});
