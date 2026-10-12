// Inspect design frames as live DOM.
//   npm run frames -- list                       list frame ids with titles
//   npm run frames -- dump QEBase [--text=Approve] [--selector=aside] [--size=1920x1080]
//        prints JSON: every styled element with text, rect and computed style
//   npm run frames -- compare QOB3 http://localhost:3000/rep/quotes [--size=1920x1080] [--width]
//        opens the frame (1440x900) and the app URL (--size, default 1920x1080), prints style differences
//        (the app page must already be reachable: dev server running, session cookie via --cookie=name=value)
//   npm run frames -- click QE7 "Show cost and stock"   click an element by text, then dump what changed
// Flags: --out=file.json writes instead of printing.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { FRAME_DIR, FRAME_SIZE, FONT_USER_AGENT, startFrameServer, openFrame, measureAll, diffMeasures, STYLE_PROPS } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const pos = args.filter((a) => !a.startsWith("--"));
const [cmd, id, arg] = pos;

if (cmd === "list") {
  const idx = JSON.parse(await readFile(join(FRAME_DIR, "canvas.json"), "utf8"));
  for (const [f, b] of Object.entries(idx.boards)) console.log(f.replace(/^C_|\.dc\.html$/g, ""), "-", b.title);
  process.exit(0);
}
if (!["dump", "click", "compare"].includes(cmd) || !id) {
  console.error("usage: frames list | dump <id> | click <id> <text> | compare <id> <app-url>");
  process.exit(1);
}

const [w, h] = (flag("size") ?? (cmd === "compare" ? "1920x1080" : `${FRAME_SIZE.width}x${FRAME_SIZE.height}`)).split("x").map(Number);
const srv = await startFrameServer();
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const page = await browser.newPage({ viewport: { width: w, height: h } });
if (cmd === "compare") {
  const fp = await browser.newPage({ viewport: FRAME_SIZE, userAgent: FONT_USER_AGENT });
  await openFrame(fp, srv.base, id);
  const props = { root: flag("selector") ?? "body", props: STYLE_PROPS };
  const frame = await fp.evaluate(measureAll, props);
  const cookie = flag("cookie");
  if (cookie) {
    const [name, ...v] = cookie.split("=");
    // On the app's origin with path "/", as the app sets its session cookie, so API calls carry it too.
    await page.context().addCookies([{ name, value: v.join("="), url: new URL("/", arg.replace("{frames}", srv.base)).href }]);
  }
  const appUrl = arg.replace("{frames}", srv.base); // {frames} = the local frame server, for self-tests
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const app = await page.evaluate(measureAll, props);
  console.log(JSON.stringify(diffMeasures(frame, app, { width: args.includes("--width") }), null, 1));
  await browser.close();
  srv.close();
  process.exit(0);
}
await openFrame(page, srv.base, id);

const measure = () => page.evaluate(measureAll, { root: flag("selector") ?? "body", props: STYLE_PROPS });
let result = await measure();
if (cmd === "click") {
  await page.getByText(arg, { exact: true }).first().click();
  await page.waitForTimeout(100);
  const after = await measure();
  const key = (e) => `${e.tag}|${e.text}|${JSON.stringify(e.rect)}|${JSON.stringify(e.style)}`;
  const before = new Set(result.map(key));
  result = after.filter((e) => !before.has(key(e)));
}
const text = flag("text");
if (text) result = result.filter((e) => e.text.toLowerCase().includes(text.toLowerCase()));

const json = JSON.stringify(result, null, 1);
if (flag("out")) await writeFile(flag("out"), json);
else console.log(json);
await browser.close();
srv.close();
