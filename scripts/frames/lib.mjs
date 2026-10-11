// Helpers for reading the committed design frames as live DOM with Playwright.
// Frames live in docs/design/canvas-frames/ and load ./support.js (the canvas runtime).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, resolve } from "node:path";

export const FRAME_DIR = resolve("docs/design/canvas-frames");
export const FRAME_SIZE = { width: 1440, height: 900 }; // the size frames are drawn at

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json" };

/** Serve the frames folder on a random local port. Returns { base, close }. */
export async function startFrameServer() {
  const server = createServer(async (req, res) => {
    try {
      const p = join(FRAME_DIR, decodeURIComponent(req.url.split("?")[0]));
      if (!p.startsWith(FRAME_DIR)) throw new Error("outside");
      const body = await readFile(p);
      res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

/** "QEBase" or "C_QEBase.dc.html" -> "C_QEBase.dc.html" */
export const frameFile = (id) => (id.endsWith(".html") ? id : `C_${id}.dc.html`);

/** Open a frame and wait for fonts and the runtime to finish. */
export async function openFrame(page, base, id) {
  await page.goto(`${base}/${frameFile(id)}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
}

/** Computed properties that define the look. Same list is used on frames and on the app. */
export const STYLE_PROPS = [
  "color", "backgroundColor", "fontFamily", "fontSize", "fontWeight", "letterSpacing", "lineHeight",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderRadius",
  "borderTopWidth", "borderTopColor", "borderBottomWidth", "borderBottomColor",
  "display", "flexDirection", "gap", "opacity", "boxShadow", "textAlign",
];

/**
 * In-page function (pass to page.evaluate): measure every element that has own text, a background,
 * a border or is a control. Works on frames and on the running app, so results can be compared.
 * Call as page.evaluate(measureAll, { root: "body", props: STYLE_PROPS }) (it must be self-contained).
 * Returns [{ path, tag, text, rect:{x,y,w,h}, style:{...} }].
 */
export function measureAll({ root, props }) {
  const rootEl = document.querySelector(root);
  const out = [];
  const walk = (el, depth) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    const r = el.getBoundingClientRect();
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
    const bordered = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0;
    const filled = cs.backgroundColor !== "rgba(0, 0, 0, 0)";
    const control = ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A", "SVG", "svg"].includes(el.tagName);
    if (r.width > 0 && r.height > 0 && (own || filled || bordered || control)) {
      const style = {};
      for (const p of props) style[p] = cs[p];
      out.push({
        path: depth,
        tag: el.tagName.toLowerCase(),
        text: own.slice(0, 80),
        rect: { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 },
        style,
      });
    }
    for (const c of el.children) walk(c, depth + 1);
  };
  walk(rootEl, 0);
  return out;
}

/**
 * Compare frame measurements with app measurements. Elements are matched by tag + text (in order for
 * repeats). Reports style props that differ and height differences. x, y and width are ignored on
 * purpose: the frames are 1440 wide, the app is verified at 1920, and fluid regions grow.
 * Pass { width: true } to also compare widths (use for fixed-width controls).
 */
export function diffMeasures(frame, app, { width = false } = {}) {
  const keyOf = (e) => `${e.tag}|${e.text}`;
  const pool = new Map();
  for (const e of app) (pool.get(keyOf(e)) ?? pool.set(keyOf(e), []).get(keyOf(e))).push(e);
  const diffs = [];
  const missing = [];
  for (const f of frame) {
    if (!f.text) continue; // text-less boxes cannot be matched reliably; checked via parents with text
    const a = pool.get(keyOf(f))?.shift();
    if (!a) { missing.push(`${f.tag} "${f.text}"`); continue; }
    const d = {};
    for (const [k, v] of Object.entries(f.style)) if (a.style[k] !== v) d[k] = { frame: v, app: a.style[k] };
    if (f.rect.h !== a.rect.h) d.height = { frame: f.rect.h, app: a.rect.h };
    if (width && f.rect.w !== a.rect.w) d.width = { frame: f.rect.w, app: a.rect.w };
    if (Object.keys(d).length) diffs.push({ element: `${f.tag} "${f.text}"`, ...d });
  }
  return { matched: frame.filter((f) => f.text).length - missing.length, missing, diffs };
}
