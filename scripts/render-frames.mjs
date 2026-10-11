// Render the committed canvas frames to PNG.
// Usage: node scripts/render-frames.mjs [frameId ...]   (e.g. QEBase QOB3; none = all)
// Options: --size=1440x900 (default, the size the frames are drawn at), --out=docs/design/canvas-frames/png
// The frames load ./support.js (the canvas runtime, copied from the artifact) and Google Fonts.
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=")[1];
const [w, h] = opt("size", "1440x900").split("x").map(Number);
const dir = resolve("docs/design/canvas-frames");
const out = resolve(opt("out", "docs/design/canvas-frames/png"));
const index = JSON.parse(await readFile(join(dir, "canvas.json"), "utf8"));
const wanted = args.filter((a) => !a.startsWith("--"));
const files = Object.keys(index.boards).filter(
  (f) => !wanted.length || wanted.some((id) => f === `C_${id}.dc.html` || f === id),
);

const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json" };
const server = createServer(async (req, res) => {
  try {
    const p = join(dir, decodeURIComponent(req.url.split("?")[0]));
    if (!p.startsWith(dir)) throw new Error("outside");
    const body = await readFile(p);
    res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

await mkdir(out, { recursive: true });
// PW_CHANNEL=chrome uses the installed Chrome instead of Playwright's downloaded Chromium.
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const page = await browser.newPage({ viewport: { width: w, height: h } });
for (const f of files) {
  await page.goto(`${base}/${f}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const name = f.replace(/^C_/, "").replace(/\.dc\.html$/, "");
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log("rendered", name);
}
await browser.close();
server.close();
