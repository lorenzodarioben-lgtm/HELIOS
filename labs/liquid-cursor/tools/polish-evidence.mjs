// Liquid cursor: visual evidence for the Observatory's final polish passes: the water material over artwork (the whole
// Overview hero as one zone, refracting the hero itself, and the renders marked data-cursor-media elsewhere) and the hero's
// colour balance, captured in the real Observatory in headless Edge at 1920×1080, DPR 1. The 7260ef8 front end (the
// integration commit, the rollback point) is served from git through request interception, so every "before" image is the
// real previous version; --prepass DIR serves DIR/liquid-cursor.js the same way (the water as it was before this pass).
//
//   node labs/liquid-cursor/tools/polish-evidence.mjs [--http URL] [--only 1,2,3,4,5,6,7,8] [--prepass DIR]
//
// Writes labs/liquid-cursor/evidence/polish/ (never the Observatory's own screenshots):
//   01-hero-<scene>-{A,B,C,raw}.png  full 1920×1080 frames: the three wash steps (?hero=a, the default B, ?hero=c), the render alone
//   01-hero-abc.png                  the coral sphere, the red/blue field and the copy: A / B / C / the raw render
//   02-water-over-hero.png           the cursor in the hero: 7260ef8's difference vs the three water candidates (?water=)
//   03-water-over-renders.png        the same over the Render Lab's renders (with refraction)
//   04-normal-ui-regression.png      7260ef8's cursor runtime vs this pass over ordinary interface surfaces, pixel for pixel
//   05-boundaries.png                the material at the hero's edge and at a render's edge, frame by frame
//   (section 6, metrics only)        Chromium's compositor layers: 7260ef8 vs this pass, over the interface, a render, the hero
//   07-refraction-temporal.png       a HELIOS letter as the water passes over it: before, entering, centred, exiting, after
//   08-dark-artifact.png             fast gestures over the hero, the pre-pass water vs this pass on the same frames (--prepass)
//   polish-metrics.json              colour, contrast, pixel, state and layer comparisons behind the sheets
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sleep, labelledSheet, decodePNG, encodePNG } from "./cdp.mjs";

const LAB = resolve(dirname(fileURLToPath(import.meta.url)), ".."), ROOT = resolve(LAB, "..", "..");
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const GLASS = argv.includes("--glass"); // material-only review: preserve the previous polish proof in its own directory
const HTTP = opt("--http", "http://127.0.0.1:8315/") + "assets/observatory/index.html";
const OUT = join(LAB, "evidence", GLASS ? "glass" : "polish"), BASE = "7260ef8", PREPASS = opt("--prepass", "");
const ONLY = (opt("--only", "") || "").split(",").filter(Boolean), want = (k) => !ONLY.length || ONLY.includes(k);
mkdirSync(OUT, { recursive: true });
const git = (...a) => execFileSync("git", ["-c", `safe.directory=${ROOT.replace(/\\/g, "/")}`, ...a], { cwd: ROOT });
const OLD = Object.fromEntries(["liquid-cursor.js", "app.js", "styles.css"].map((f) => [f, git("show", `${BASE}:assets/observatory/${f}`).toString("base64")]));
const TYPE = { "liquid-cursor.js": "text/javascript", "app.js": "text/javascript", "styles.css": "text/css" };
// the pre-pass runtime (a copy of liquid-cursor.js as it stood before this pass), when given
const PRE = PREPASS ? { "liquid-cursor.js": readFileSync(join(PREPASS, "liquid-cursor.js")).toString("base64") } : null;
const HIDE = `document.head.insertAdjacentHTML("beforeend", "<style id='__nolc'>.lc-canvas, .lc-canvas-media, .lc-bead, .lc-bead-media { visibility: hidden !important; }</style>")`, SHOW = `document.getElementById("__nolc").remove()`;
try { const r = await fetch(HTTP, { method: "HEAD" }); if (!r.ok) throw new Error("HTTP " + r.status); }
catch (err) { console.log(`the Observatory server is not reachable at ${HTTP} (${err.message}): start python scripts/observatory/serve.py --no-browser`); process.exit(1); }

const B = await launch();
const keepAlive = setInterval(() => {}, 1000);
const metrics = { base: BASE, when: new Date().toISOString(), browser: B.version, viewport: "1920×1080, DPR 1" };
// capture-only page settings: the hero's drift and crossfade are stopped and its montage paused, so versions compare 1:1
const FREEZE = `document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.id = "freeze";
  st.textContent = ".hero-frame img { animation: none !important; } .hero-frame, .hero-stage, .hero-copy, .hero-count { transition: none !important; }"; document.head.appendChild(st); });`;
async function open(url, { old = [], from = OLD, label = "", vw = 1920, vh = 1080, dpr = 1 } = {}) {
  const { targetId } = await B.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await B.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => Promise.race([B.send(m, p, sessionId), new Promise((_, rej) => setTimeout(() => rej(new Error(`CDP ${m} timed out`)), 20000))]), logs = [];
  let lastLayers = null;
  const l = (msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Fetch.requestPaused") { // serve the 7260ef8 (or pre-pass) version of the named front-end files
      const f = old.find((n) => new URL(msg.params.request.url).pathname.endsWith("/" + n));
      if (f) s("Fetch.fulfillRequest", { requestId: msg.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: TYPE[f] }, { name: "Cache-Control", value: "no-store" }], body: from[f] });
      else s("Fetch.continueRequest", { requestId: msg.params.requestId });
    }
    if (msg.method === "Runtime.exceptionThrown") logs.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === "LayerTree.layerTreeDidChange" && msg.params.layers) lastLayers = msg.params.layers;
  };
  B.listeners.add(l);
  await s("Runtime.enable"); await s("Page.enable");
  if (old.length) await s("Fetch.enable", { patterns: old.map((f) => ({ urlPattern: `*/${f}*` })) });
  await s("Emulation.setDeviceMetricsOverride", { width: vw, height: vh, deviceScaleFactor: dpr, mobile: false });
  await s("Page.addScriptToEvaluateOnNewDocument", { source: FREEZE });
  await s("Page.navigate", { url });
  const ev = async (e) => { const r = await s("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(`${label}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`); return r.result.value; };
  for (let i = 0; i < 120; i++) { if (await ev("document.readyState === 'complete' && !!document.querySelector('.section.active') && 'HeliosLiquidCursor' in window").catch(() => false)) break; await sleep(50); }
  await ev("Promise.all([...document.images].filter((i) => i.closest('.section.active') && i.loading !== 'lazy').map((i) => i.decode().catch(() => 0)))");
  await ev(`(() => { const c = document.querySelector(".hero-count"); if (c) c.dispatchEvent(new MouseEvent("mouseenter")); })()`);
  await sleep(2200); // section reveals finish
  const P = {
    ev, logs,
    // a viewport rectangle (CDP clips are document coordinates: add the scroll)
    shot: async (x = 0, y = 0, w = vw, h = vh) => { const [sx, sy] = await ev("[scrollX, scrollY]");
      return Buffer.from((await s("Page.captureScreenshot", { format: "png", clip: { x: sx + Math.max(0, Math.min(x, vw - w)), y: sy + Math.max(0, Math.min(y, vh - h)), width: w, height: h, scale: 1 } })).data, "base64"); },
    frame: async (i) => { await ev(`document.querySelectorAll(".hero-ticks button")[${i}].click()`); await sleep(400); },
    // the composited layers (size, whether they draw, whether they are invisible), as the compositor reports them
    layers: async () => { lastLayers = null; await s("LayerTree.enable"); for (let k = 0; k < 40 && !lastLayers; k++) await sleep(50); await s("LayerTree.disable");
      return (lastLayers || []).map((l) => `${Math.round(l.width)}×${Math.round(l.height)}${l.drawsContent ? " draws" : ""}${l.invisible ? " invisible" : ""}`).sort(); },
    async close() { B.listeners.delete(l); await B.send("Target.closeTarget", { targetId }); },
  };
  return P;
}
// the frame-exact driver over the ?cursor=test hooks (check-observatory.mjs's, at 120 Hz)
function installDriver() {
  const T = window.HeliosLiquidCursor.test, DT = 1000 / 120, H = (window.__pv = { t: 0, T });
  T.setFrozen(true); H.t = 1e5;
  H.feed = (x, y) => { H.t += DT; T.feed(x, y, H.t); T.advance(DT, DT); };
  H.hold = (ms) => { let left = ms; while (left > 1e-6) { const h = Math.min(DT, left); T.advance(h, DT); left -= h; } H.t += ms; };
  H.points = (segs, x1, y1) => { const pts = []; let x = 0, y = 0;
    for (const g of segs) { const nf = Math.round(g.ms / DT);
      for (let f = 1; f <= nf; f++) { const k = g.ramp ? Math.min(1, f * DT / g.ramp) : 1, v = g.v * k * k * (3 - 2 * k) / 1000, a = (g.turn || 0) * f / nf, dx = g.dx * Math.cos(a) - g.dy * Math.sin(a), dy = g.dx * Math.sin(a) + g.dy * Math.cos(a); x += dx * v * DT; y += dy * v * DT; pts.push([x, y]); } }
    const ox = x1 - x, oy = y1 - y; return { start: [ox, oy], pts: pts.map(([px, py]) => [px + ox, py + oy]) }; };
  H.ready = (x, y) => { H.hold(200); H.feed(x, y); H.hold(200); T.resetBody(); H.hold(T.P.dropArmMs + 20); };
  H.run = (segs, x1, y1, extra) => { const p = H.points(segs, x1, y1); H.ready(p.start[0], p.start[1]); H.pts = p.pts.concat(Array(extra || 0).fill(null)); H.i = 0; return H.pts.length; };
  H.stepTo = (f) => { while (H.i < f && H.i < H.pts.length) { const p = H.pts[H.i]; if (p) H.feed(p[0], p[1]); else H.hold(DT); H.i++; } return H.snap(); };
  H.toward = (x1, y1, left) => { const s = H.snap(), k = 1 / Math.max(1, left); H.feed(s.rx + (x1 - s.rx) * k, s.ry + (y1 - s.ry) * k); return H.snap(); }; // one sample, arriving after `left`
  H.glide = (x1, y1, n) => { const out = []; for (let i = 0; i < n; i++) out.push(H.toward(x1, y1, n - i)); return out; };
  H.snap = () => { const S = T.S, D = T.D, O = D.tailOut; return { x: S.renderX, y: S.renderY, rx: S.rawX, ry: S.rawY, E: D.spine.E, L: D.spine.L, tail: O.on, hov: T.B.hov.x, interactive: !!S.interactiveEl, mat: S.mat, media: !!S.mediaEl,
    pts: O.on ? Array.from(O.x).map((v, i) => [v, O.y[i], O.r[i]]) : [], beads: D.slots.filter((q) => q.state !== "IDLE").map((q) => [q.x, q.y, q.r, q.alpha]) }; };
  return 1;
}
// a point inside one glyph of the HELIOS wordmark: fractions (fx, fy) of that glyph's box
const LETTER = (ch, fx, fy) => `(() => { const w = document.querySelector("#hero .wordmark"), t = [...w.childNodes].find((n) => n.nodeType === 3), i = t.textContent.indexOf(${JSON.stringify(ch)}), g = document.createRange();
  g.setStart(t, i); g.setEnd(t, i + 1); const r = g.getBoundingClientRect(), cs = getComputedStyle(w), ls = parseFloat(cs.letterSpacing) || 0, ink = r.width - ls;
  return [Math.round(r.left + ink * ${fx}), Math.round(r.top + r.height * ${fy})]; })()`;
const around = (sn, w, h) => { const xs = [sn.x, ...sn.pts.map((p) => p[0]), ...sn.beads.map((b) => b[0])], ys = [sn.y, ...sn.pts.map((p) => p[1]), ...sn.beads.map((b) => b[1])];
  return [Math.round((Math.min(...xs) + Math.max(...xs)) / 2 - w / 2), Math.round((Math.min(...ys) + Math.max(...ys)) / 2 - h / 2), w, h]; };
const geo = (sn) => JSON.stringify([sn.x, sn.y, sn.E, sn.L, sn.tail, sn.pts, sn.beads, sn.hov]);

// colour: CIE L*C*h of the mean sRGB colour over a disk (skipping the wordmark's dark glyph pixels)
const lch = ([r, g, b]) => { const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; const R = lin(r), G2 = lin(g), Bl = lin(b);
  const X = (0.4124 * R + 0.3576 * G2 + 0.1805 * Bl) / 0.95047, Y = 0.2126 * R + 0.7152 * G2 + 0.0722 * Bl, Z = (0.0193 * R + 0.1192 * G2 + 0.9505 * Bl) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116), a = 500 * (f(X) - f(Y)), bb = 200 * (f(Y) - f(Z));
  return { L: +(116 * f(Y) - 16).toFixed(1), C: +Math.hypot(a, bb).toFixed(2), h: +((Math.atan2(bb, a) * 180 / Math.PI + 360) % 360).toFixed(0) }; };
const lab = ([r, g, b]) => { const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; const R = lin(r), G2 = lin(g), Bl = lin(b);
  const X = (0.4124 * R + 0.3576 * G2 + 0.1805 * Bl) / 0.95047, Y = 0.2126 * R + 0.7152 * G2 + 0.0722 * Bl, Z = (0.0193 * R + 0.1192 * G2 + 0.9505 * Bl) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116); return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
const disk = (img, cx, cy, r) => { let n = 0; const s = [0, 0, 0]; for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) { const p = img.px(x, y); if (p[0] + p[1] + p[2] < 200) continue; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; n++; } return s.map((v) => Math.round(v / n)); };
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
// the large left coral sphere (screen px): disks [x, y, r], or a band [x0, y0, x1, y1] clear of the copy's lines
const SPHERE = { upper: [580, 410, 45], centre: [640, 470, 30], lower: [460, 616, 720, 638] };
const sample = (img, a) => { if (a.length === 3) return disk(img, ...a); const t = [0, 0, 0]; let n = 0;
  for (let y = a[1]; y < a[3]; y++) for (let x = a[0]; x < a[2]; x++) { const p = img.px(x, y); if (p[0] + p[1] + p[2] < 200) continue; t[0] += p[0]; t[1] += p[1]; t[2] += p[2]; n++; } return t.map((v) => Math.round(v / n)); };
const pixDiff = (a, b) => { const A = decodePNG(a.toString("base64")), Bm = decodePNG(b.toString("base64")); let n = 0, max = 0; const rgb = Buffer.alloc(A.w * A.h * 3), box = [Infinity, Infinity, -1, -1];
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) { const p = A.px(x, y), q = Bm.px(x, y), d = Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2])); if (d) { n++; box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); } max = Math.max(max, d); const o = (y * A.w + x) * 3; rgb[o] = d ? 255 : 18; rgb[o + 1] = d ? 40 : 18; rgb[o + 2] = d ? 40 : 18; }
  return { n, max, box: n ? box : null, png: encodePNG(A.w, A.h, rgb) }; };

try {
  // ---------------------------------------------------------------- 1. the Overview hero: wash steps A / B / C, and the render alone
  if (want("1")) {
    const frames = [[0, "reflective"], [1, "bvh_stress"]], crops = {}, hero = {}, fieldImg = {};
    const RAW_CSS = `document.head.insertAdjacentHTML("beforeend", "<style>.hero > :not(.hero-stage), #edge, .rail { visibility: hidden !important; }</style>")`;
    for (const [v, q] of [["A", "&hero=a"], ["B", ""], ["C", "&hero=c"], ["raw", ""]]) {
      const P = await open(HTTP + `?cursor=off${q}#overview`, { label: `hero ${v}` });
      if (v === "raw") { await P.ev(RAW_CSS); await sleep(200); }
      const boxes = await P.ev(`[...document.querySelectorAll(".hero-copy > *:not(.wordmark), .hero-count .scene, #hc-meta, .hero-count .frozen")].map((e) => { const r = e.getBoundingClientRect(); return { sel: e.className || e.id, r: [r.left, r.top, r.width, r.height].map(Math.round), color: getComputedStyle(e).color }; })`);
      for (const [fi, scene] of frames) {
        await P.frame(fi);
        const full = await P.shot(), img = decodePNG(full.toString("base64"));
        writeFileSync(join(OUT, `01-hero-${scene}-${v}.png`), full);
        const entry = (hero[`${scene}-${v}`] = {});
        if (scene === "reflective") {
          crops[`sphere-${v}`] = await P.shot(230, 300, 760, 500); crops[`copy-${v}`] = await P.shot(80, 620, 760, 230);
          entry.sphere = Object.fromEntries(Object.entries(SPHERE).map(([k, a]) => { const c = sample(img, a); return [k, { rgb: c, ...lch(c) }]; }));
          if (v !== "raw") { // the hero text against the background behind it (text hidden): the 10th percentile and the worst pixel
            await P.ev(`document.querySelectorAll(".hero-copy, .hero-count").forEach((e) => (e.style.visibility = "hidden"))`); await sleep(120);
            const bg = decodePNG((await P.shot()).toString("base64"));
            await P.ev(`document.querySelectorAll(".hero-copy, .hero-count").forEach((e) => (e.style.visibility = ""))`);
            entry.contrast = Object.fromEntries(boxes.map((b) => { const tl = lum(b.color.match(/[\d.]+/g).slice(0, 3).map(Number)), Ls = [];
              for (let y = b.r[1]; y < b.r[1] + b.r[3]; y += 2) for (let x = b.r[0]; x < b.r[0] + b.r[2]; x += 2) Ls.push(lum(bg.px(x, y)));
              Ls.sort((p1, p2) => p1 - p2); const cr = (L) => +((L + 0.05) / (tl + 0.05)).toFixed(2); return [b.sel.split(" ")[0], { p10: cr(Ls[Math.floor(0.1 * (Ls.length - 1))]), min: cr(Ls[0]) }]; }));
          }
        } else { crops[`fieldR-${v}`] = await P.shot(1380, 420, 520, 230); crops[`fieldL-${v}`] = await P.shot(0, 470, 620, 200); fieldImg[v] = img; }
      }
      await P.close();
    }
    // the repeating red and blue spheres (bvh_stress): the pixels the raw render shows as clearly red or blue (CIE a* > 12,
    // b* < -14; not the title's glyphs), followed through the versions; separation = the CIE76 distance of the two means
    const field = {};
    for (const [rname, [x0, y0, x1, y1]] of Object.entries({ "right field": [1490, 495, 1790, 590], "left field": [60, 520, 400, 600] })) {
      const red = [], blue = [];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const p = fieldImg.raw.px(x, y), q = fieldImg.A.px(x, y); if (p[0] + p[1] + p[2] < 200 || q[0] + q[1] + q[2] < 200) continue; const [, a, b] = lab(p); if (a > 12) red.push([x, y]); else if (b < -14) blue.push([x, y]); }
      const mean = (img, set) => { const t = [0, 0, 0]; for (const [x, y] of set) { const p = img.px(x, y); t[0] += p[0]; t[1] += p[1]; t[2] += p[2]; } return t.map((v) => v / set.length); };
      field[rname] = Object.fromEntries(["A", "B", "C", "raw"].map((v) => { const r = lab(mean(fieldImg[v], red)), b = lab(mean(fieldImg[v], blue)); return [v, +Math.hypot(r[0] - b[0], r[1] - b[1], r[2] - b[2]).toFixed(2)]; }));
    }
    const summary = {};
    for (const k of Object.keys(SPHERE)) { const c = (v) => hero[`reflective-${v}`].sphere[k].C, r = c("raw");
      summary[`coral sphere ${k}`] = Object.fromEntries(["A", "B", "C"].map((v) => [v, { C: c(v), L: hero[`reflective-${v}`].sphere[k].L, hue: hero[`reflective-${v}`].sphere[k].h, vsA: +((c(v) / c("A") - 1) * 100).toFixed(1) + "%", lossRecoveredVsA: +((c(v) - c("A")) / (r - c("A")) * 100).toFixed(1) + "%" }]).concat([["raw", { C: r }]])); }
    metrics.hero = { scrim: { A: { bottom: [0.8, 0.84, 0.8, 0.28, 0], left: [0.51, 0.16, 0] }, B: { bottom: [0.8, 0.84, 0.8, 0.25, 0], left: [0.49, 0.15, 0] }, C: { bottom: [0.8, 0.84, 0.8, 0.23, 0], left: [0.47, 0.14, 0] },
      unchanged: "the top wash (0.72 → 0 over 110 px) and the 0/14/26% stops", stops: { bottom: "to top: 0%, 14%, 26%, 44%, 62%", left: "100deg: 0%, 34%, 50%" } }, sphere: summary, field,
      contrast: Object.fromEntries(["A", "B", "C"].map((v) => [v, hero[`reflective-${v}`].contrast])), detail: hero };
    const sl = (k) => `coral C ${["A", "B", "C"].map((v) => summary[`coral sphere ${k}`][v].C).join(" / ")} (raw ${summary[`coral sphere ${k}`].raw.C})`;
    writeFileSync(join(OUT, "01-hero-abc.png"), await labelledSheet(B, { title: "Overview hero wash, the final micro step: A (the previous pass's choice) / B (one micro step) / C (one more) / the raw render, 1920×1080 crops",
      note: "Only the scrim's two middle stops change between A, B and C: the bottom scrim's 44% stop 0.28 / 0.25 / 0.23 and the left wash 0.51 / 0.49 / 0.47 (its 34% stop 0.16 / 0.15 / 0.14); the stops behind the description, the evidence row and the top bar are unchanged. The raw render (no scrim, no copy) is shown for reference only. C = CIE chroma.",
      columns: ["A (previous pass)", "B (recommended)", "C", "raw render (reference)"],
      rows: [{ label: `the coral sphere and the title (reflective): ${sl("centre")}; lower ${["A", "B", "C"].map((v) => summary["coral sphere lower"][v].C).join(" / ")}`, cells: ["A", "B", "C", "raw"].map((v) => crops[`sphere-${v}`]) },
        { label: `the red/blue field, right (bvh_stress): separation ${["A", "B", "C", "raw"].map((v) => field["right field"][v]).join(" / ")}`, cells: ["A", "B", "C", "raw"].map((v) => crops[`fieldR-${v}`]) },
        { label: `the red/blue field behind the title (bvh_stress): separation ${["A", "B", "C", "raw"].map((v) => field["left field"][v]).join(" / ")}`, cells: ["A", "B", "C", "raw"].map((v) => crops[`fieldL-${v}`]) },
        { label: `the copy (legibility): description contrast ${["A", "B", "C"].map((v) => hero[`reflective-${v}`].contrast["hero-desc"].p10).join(" / ")} (10th percentile)`, cells: ["A", "B", "C", "raw"].map((v) => crops[`copy-${v}`]) }] }));
    console.log("hero:", JSON.stringify({ centre: summary["coral sphere centre"], lower: summary["coral sphere lower"], field }));
  }

  // ---------------------------------------------------------------- 2 and 3. the cursor over artwork: 7260ef8's difference vs the water candidates
  const COLS = GLASS ? [["Current pre-pass", ["liquid-cursor.js"], "", PRE], ["Liquid Glass Subtle", [], "&glass=subtle"], ["Liquid Glass Balanced", [], "&glass=balanced"], ["Liquid Glass Reference", [], "&glass=reference"]]
    : [["7260ef8 · difference", ["liquid-cursor.js", "app.js"], ""], ...(PRE ? [["pre-pass water", ["liquid-cursor.js"], "", PRE]] : []), ["Water Subtle", [], "&water=subtle"], ["Water Balanced", [], "&water=balanced"], ["Water Strong", [], "&water=strong"]];
  const SCENE = (name) => `(async () => { const b = document.querySelector('#rl-thumbs .film[data-scene="${name}"]'); if (b) b.click(); await new Promise((r) => setTimeout(r, 200)); await document.querySelector("#rl-img").decode().catch(() => 0); return 1; })()`;
  const IMGPT = (ix, iy) => `(() => { const e = document.querySelector("#rl-img"), r = e.getBoundingClientRect(); return [Math.round(r.left + ${ix} * r.width / e.naturalWidth), Math.round(r.top + ${iy} * r.height / e.naturalHeight)]; })()`;
  async function materialSheet(file, title, note, spots, goos) {
    const rows = [], meta = [];
    const place = async (P, spot) => { const [, route, prep, at] = spot; if (prep) { await P.ev(prep); await sleep(400); } return typeof at === "string" ? P.ev(at) : at; };
    for (const spot of spots) {
      const cells = [];
      for (const [col, old, q, from] of COLS) {
        const P = await open(HTTP + `?cursor=test${q}#${spot[1]}`, { old, from, label: `${spot[0]} ${col}` });
        const [x, y] = await place(P, spot);
        await P.ev(`(${installDriver.toString()})()`);
        await P.ev(`__pv.ready(${x - 30}, ${y}), __pv.glide(${x}, ${y}, 10), __pv.hold(100), 1`);
        await sleep(650); // the textures for refraction (a render's image, the hero's snapshot) are made asynchronously
        await P.ev("__pv.hold(1700), 1"); await sleep(120);
        const sn = await P.ev("__pv.snap()"), clip = [Math.round(sn.x - 150), Math.round(sn.y - 110), 300, 220];
        if (col.endsWith("Balanced")) { // and the page alone, the same crop (what the liquid refracts)
          await P.ev(HIDE); await sleep(80); cells.unshift(await P.shot(...clip)); await P.ev(SHOW); await sleep(80);
          meta.push({ spot: spot[0], material: (await P.ev("HeliosLiquidCursor.status()")).material }); }
        const shot = await P.shot(...clip); cells.push(shot);
        if (GLASS && col.endsWith("Balanced") && spot[0].startsWith("the HELIOS title:")) writeFileSync(join(OUT, `glyph-${spot[0].slice(-1)}-balanced.png`), shot);
        if (GLASS && col.endsWith("Balanced") && spot[0].startsWith("rim crossing:")) writeFileSync(join(OUT, `glyph-${spot[0].slice(-1)}-rim-balanced.png`), shot);
        if (P.logs.length) console.log("page errors", spot[0], col, P.logs);
        await P.close();
      }
      rows.push({ label: spot[0], cells });
    }
    for (const spot of goos) { // the goo: a flick that ends on the spot, at its fullest (tail and beads)
      const cells = [];
      for (const [col, old, q, from] of COLS) {
        const P = await open(HTTP + `?cursor=test${q}#${spot[1]}`, { old, from, label: `${spot[0]} goo ${col}` });
        const [x, y] = await place(P, spot);
        await P.ev(`(${installDriver.toString()})()`);
        const segs = [{ dx: x < 960 ? -1 : 1, dy: -0.12, v: 3000, ms: 190, ramp: 28 }];
        await P.ev(`__pv.ready(${x}, ${y}), 1`); await sleep(450); // (the render's texture)
        const n = await P.ev(`__pv.run(${JSON.stringify(segs)}, ${x}, ${y}, 24)`); let best = 1, bl = -1;
        for (let f = 1; f <= n; f++) { const sn = await P.ev(`__pv.stepTo(${f})`); const w = sn.L + 6 * sn.beads.length; if (w > bl) { bl = w; best = f; } }
        await P.ev(`__pv.run(${JSON.stringify(segs)}, ${x}, ${y}, 24)`); const g = await P.ev(`__pv.stepTo(${best})`); await sleep(120);
        const clip = around(g, 300, 220);
        if (col.endsWith("Balanced")) { await P.ev(HIDE); await sleep(80); cells.unshift(await P.shot(...clip)); await P.ev(SHOW); await sleep(80); }
        cells.push(await P.shot(...clip));
        await P.close();
      }
      rows.push({ label: `${spot[0]} (goo)`, cells });
    }
    writeFileSync(join(OUT, file), await labelledSheet(B, { title: GLASS ? "Liquid Glass: " + file + " · current pre-pass / Subtle / Balanced / Reference" : title,
      note: GLASS ? "Helios outputs only, identical deterministic positions and geometry. Independent RGB source sampling bends high-contrast edges into cyan/blue and red/orange fringes; the centre stays comparatively aligned and thin liquid attenuates the effect. Hero imagery and colour are unchanged. Native 300×220 crops." : note,
      columns: ["the page alone (Balanced's crop)", ...COLS.map((c) => c[0])], rows }));
    return meta;
  }
  if (want("2")) {
    const hero = (label, at, prep) => [label, "overview", prep || `document.querySelectorAll(".hero-ticks button")[0].click()`, at]; // (montage frame 1 unless stated)
    const letter = (ch, fx, fy) => hero(`the HELIOS title: ${ch}`, LETTER(ch, fx, fy));
    metrics.waterHero = await materialSheet("02-water-over-hero.png", "The cursor in the Overview hero: 7260ef8's difference, the pre-pass water and the three water candidates (the hero is one water zone that refracts the hero itself)",
      "Frame-exact (?cursor=test, 120 Hz), the same production runtime and geometry; only the material differs. Inside the hero the liquid is water everywhere, its title, copy and links included (hover growth still applies). The water now refracts what lies under it: the montage frames (sampled live) and the scrim, copy, title and top bar (a snapshot taken at idle time, retaken only when they change, never per frame). The crown leaves the page nearly as it is; the rim bends it inward, a mild lens. The pre-pass water only tinted and lit the page. First column: the page alone, Balanced's crop. 300×220 crops at rest; the goo rows at the fullest frame of a flick.",
      [letter("H", 0.5, 0.5), letter("E", 0.3, 0.5), letter("L", 0.3, 0.72), letter("I", 0.5, 0.5), letter("O", 0.22, 0.5), letter("S", 0.5, 0.5),
        hero("supporting text (the description)", `(() => { const r = document.querySelector(".hero-desc").getBoundingClientRect(); return [Math.round(r.left + 170), Math.round(r.top + 22)]; })()`),
        hero("empty hero space (the sky)", [1300, 300]), hero("the render: the coral sphere", [600, 420]), hero("the render: the metallic sphere", [1340, 500]),
        hero("the light panel (near-white)", [960, 70]), hero("the red/blue field (montage frame 2)", [1655, 552], `document.querySelectorAll(".hero-ticks button")[1].click()`),
        hero("the dark lead figure (a link: hover growth)", `(() => { const r = document.querySelector(".evidence li.lead .fig").getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`)],
      [hero("tail and beads over the title and copy", [700, 600]), hero("tail and beads over the render", [1400, 420])]);
    console.log("water hero:", metrics.waterHero.map((m) => `${m.spot}: ${m.material.refracting || "-"}`).join(" · "));
  }
  if (want("3")) {
    const rl = (label, scene, ix, iy) => [label, "render", SCENE(scene), IMGPT(ix, iy)];
    metrics.waterRenders = await materialSheet("03-water-over-renders.png", "The cursor over the Render Lab's renders: 7260ef8's difference, the pre-pass water and the three water candidates, with refraction",
      "Frame-exact, the same production runtime and geometry; only the material differs. Over a render whose image can be sampled the water refracts it: the rim bends the image inward and a mild lens magnifies it; the crown leaves it nearly untouched. First column: the page alone, Balanced's crop. 300×220 crops at rest; the goo rows at the fullest frame of a flick.",
      [rl("the coral sphere", "reflective", 590, 470), rl("the metallic sphere", "reflective", 1320, 470), rl("a reflective highlight (the glass sphere)", "reflective", 905, 372), rl("the red/blue field", "bvh_stress", 1650, 560), rl("a dark reflective region (the metallic sphere)", "reflective", 1330, 640)],
      [rl("tail and beads over the coral sphere", "reflective", 640, 470), rl("tail and beads over the red/blue field", "bvh_stress", 1600, 545)]);
  }

  // 9. Put the content edge on the curved outer surface, rather than centring a straight stroke under the clear crown.
  // This is the same materialSheet driver and source, at identical positions in every candidate.
  if (GLASS && want("9")) {
    const rim = (ch, fx, dx, dy) => [`rim crossing: ${ch}`, "overview", `document.querySelectorAll(".hero-ticks button")[0].click()`,
      `(() => { const p=${LETTER(ch,fx,0.5)}; return [p[0]+${dx},p[1]+${dy}]; })()`];
    metrics.rimCrossings = await materialSheet("09-glyph-rim-crossings.png", "Glyph edges crossing the curved surface", "Native-sized edge crossings", [rim("E",0.55,0,-24),rim("I",0.5,-24,0),rim("O",0.22,-24,0),rim("S",0.5,-24,0)], []);
  }

  // ---------------------------------------------------------------- 4. normal UI: 7260ef8's cursor runtime vs this pass, pixel for pixel
  if (want("4")) {
    const flick = [{ dx: 1, dy: 0, v: 3000, ms: 190, ramp: 25 }];
    const surfaces = [
      ["paper", "stress", null, [1500, 160], "flick"],
      ["text (a paragraph's first line)", "stress", null, "text:.section.active p", "flick-left"],
      ["dark card (the Scheduler's selected policy tab)", "scheduler", null, ".mode[aria-selected='true']", "hover"],
      ["navigation rail", "performance", null, ".rail", "hover"],
      ["chart", "performance", null, "[data-bar]", "hover"],
      ["teal UI (the Hardware thread squares)", "hardware", null, "span.thr", "flick-left"],
      ["technical panel (the image hash)", "correctness", null, ".cx-hash", "flick"],
    ];
    const rows = [], reg = [];
    for (const [label, route, , at, kind] of surfaces) {
      const got = {};
      for (const [ver, old] of [["7260ef8", ["liquid-cursor.js", "app.js"]], ["candidate", []], ["control", []]]) {
        const P = await open(HTTP + `?cursor=test#${route}`, { old, label: `regression ${label} ${ver}` });
        // the first visible match on screen; else the first match, scrolled into view (and its reveal given time)
        const loc = Array.isArray(at) ? { xy: at } : at.startsWith("text:") ? await P.ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(at.slice(5))})].find((x) => { const r = x.getBoundingClientRect(); return r.top > 80 && r.bottom < innerHeight - 40 && x.textContent.trim().length > 60; });
          const t = [...e.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim().length > 30), g = document.createRange(); g.setStart(t, 0); g.setEnd(t, Math.min(40, t.length)); const r = g.getClientRects()[0];
          return { xy: [Math.round(r.left + r.width * 0.6), Math.round(r.top + r.height / 2)] }; })()`) : await P.ev(`(() => { const all = [...document.querySelectorAll(${JSON.stringify(at)})].filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
          let e = all.find((x) => { const r = x.getBoundingClientRect(); return r.top > 60 && r.bottom < innerHeight - 20 && r.left < innerWidth; }), scrolled = false;
          if (!e) { e = all[0]; e.scrollIntoView({ block: "center" }); scrolled = true; } const r = e.getBoundingClientRect(); return { xy: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)], scrolled }; })()`);
        if (loc.scrolled) await sleep(1500);
        const xy = loc.xy;
        await P.ev(`(${installDriver.toString()})()`);
        let sn;
        if (kind.startsWith("flick")) { const segs = kind === "flick-left" ? flick.map((g) => ({ ...g, dx: -g.dx })) : flick;
          const n = await P.ev(`__pv.run(${JSON.stringify(segs)}, ${xy[0]}, ${xy[1]}, 10)`); let best = 0, bl = -1; for (let f = 1; f <= n; f++) { const s = await P.ev(`__pv.stepTo(${f})`); if (s.L > bl) { bl = s.L; best = f; } }
          await P.ev(`__pv.run(${JSON.stringify(segs)}, ${xy[0]}, ${xy[1]}, 10)`); sn = await P.ev(`__pv.stepTo(${best})`); }
        else { await P.ev(`__pv.ready(${xy[0] - 30}, ${xy[1]}), __pv.glide(${xy[0]}, ${xy[1]}, 12), __pv.hold(700), 1`); sn = await P.ev("__pv.snap()"); }
        got[ver] = { crop: await P.shot(...around(sn, 320, 240)), full: await P.shot(), state: geo(sn), material: sn.mat, interactive: sn.interactive, L: sn.L, logs: P.logs.slice() };
        await P.close();
      }
      const d = pixDiff(got["7260ef8"].crop, got.candidate.crop), full = pixDiff(got["7260ef8"].full, got.candidate.full), ctl = pixDiff(got.control.full, got.candidate.full);
      reg.push({ surface: label, kind, cropDiffPixels: d.n, fullViewportDiffPixels: full.n, fullViewportDiffBox: full.box, maxChannelDelta: Math.max(d.max, full.max), controlViewportDiffPixels: ctl.n, controlViewportDiffBox: ctl.box, controlMaxChannelDelta: ctl.max, stateIdentical: got["7260ef8"].state === got.candidate.state, candidateMaterial: got.candidate.material, interactive: got.candidate.interactive, tail: +got.candidate.L.toFixed(1), errors: [...got["7260ef8"].logs, ...got.candidate.logs] });
      rows.push({ label: `${label} (${kind.startsWith("flick") ? `flick, goo ${got.candidate.L.toFixed(0)} px` : "hover growth"}): ${d.n} differing pixels in the crop; full 1920×1080 viewport ${full.n} (max Δ ${full.max}${full.box ? ` at ${full.box.slice(0, 2)}` : ""}; a second load of this pass vs this pass: ${ctl.n}, max Δ ${ctl.max}); state identical ${got["7260ef8"].state === got.candidate.state}`, cells: [got["7260ef8"].crop, got.candidate.crop, d.png] });
    }
    metrics.normalRegression = reg;
    writeFileSync(join(OUT, "04-normal-ui-regression.png"), await labelledSheet(B, { title: "Normal interface surfaces: the cursor runtime of 7260ef8 vs this pass (same page, same frame-exact gesture)",
      note: "Left: 7260ef8's liquid-cursor.js and app.js, served from git. Middle: this pass. Right: the pixel difference around the cursor (red = any channel differs; dark = identical). The page CSS is this pass's in both, so the only variable is the cursor. Over ordinary interface surfaces the approved difference cursor is unchanged, pixel for pixel, with an identical engine state. Elsewhere in the viewport a handful of pixels can differ by 1-2 levels between any two page loads (text and image rasterisation, away from the cursor); the control column of the metrics measures that with two loads of this pass.",
      columns: ["7260ef8", "this pass", "difference"], rows }));
    console.log("regression:", reg.map((r) => `${r.surface}: crop ${r.cropDiffPixels} px, viewport ${r.fullViewportDiffPixels} px, state ${r.stateIdentical}, material ${r.candidateMaterial}`).join(" · "));
  }

  // ---------------------------------------------------------------- 5. the boundaries: the hero's edge and a render's edge (check-observatory's trajectories)
  if (want("5")) {
    const EDGES = [["the hero's edge (the index sliding over it; the hero above)", "overview", "window.scrollTo(0, 330)", `[Math.round(document.querySelector(".index").getBoundingClientRect().top), 1300, -1]`],
      ["a render's edge (the Render Lab frame; the render below)", "render", "", `(() => { const r = document.querySelector(".frame[data-cursor-media]").getBoundingClientRect(); return [Math.round(r.top), Math.round(r.left + r.width * 0.5), 1]; })()`]];
    const BUILD = (edge) => `(() => { const T = HeliosLiquidCursor.test, H = __pv, DT = 1000 / 120;
      const [BY, X, sgn] = ${edge}, Y = (o) => BY + sgn * o;
      const pts = [], cases = [];
      const add = (name, ...parts) => { const a = pts.length; for (const part of parts) for (const q of typeof part === "function" ? part() : part) pts.push(q); cases.push({ name, a, b: pts.length }); };
      const at = () => { for (let i = pts.length - 1; i >= 0; i--) if (pts[i]) return pts[i]; return [X, Y(-150)]; };
      const line = (x1, y1, n) => { const [x0, y0] = at(), o = []; for (let i = 1; i <= n; i++) o.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]); return o; };
      const hold = (n) => Array(n).fill(null);
      const flick = (segs) => { let [x, y] = at(); const o = []; for (const g of segs) { const nf = Math.round(g.ms / DT); for (let f = 1; f <= nf; f++) { const k = g.ramp ? Math.min(1, f * DT / g.ramp) : 1, v = g.v * k * k * (3 - 2 * k) / 1000; x += g.dx * v * DT; y += g.dy * sgn * v * DT; o.push([x, y]); } } return o; };
      const disp = (segs) => { let d = 0; for (const g of segs) { const nf = Math.round(g.ms / DT); for (let f = 1; f <= nf; f++) { const k = g.ramp ? Math.min(1, f * DT / g.ramp) : 1; d += g.v * k * k * (3 - 2 * k) / 1000 * DT; } } return d; };
      add("start", [[X, Y(-150)]], hold(30));
      add("fast entry: the tail spans the edge", () => line(X - 300, Y(-215), 20), hold(30), () => flick([{ dx: 0.8, dy: 0.6, v: 3200, ms: 170, ramp: 25 }]), hold(60));
      add("fast exit", hold(10), () => flick([{ dx: -0.6, dy: -0.8, v: 3200, ms: 140, ramp: 25 }]), hold(60));
      const down = [{ dx: 0.92, dy: 0.39, v: 3600, ms: 120, ramp: 20 }], along = [{ dx: -1, dy: 0, v: 3200, ms: 130 }];
      add("a sharp turn on the edge: beads span it", () => line(X - 100 - disp(down) * 0.92, Y(1 - disp(down) * 0.39), 30), hold(30), () => flick(down), () => flick(along), hold(60));
      add("repeated back-and-forth crossing", () => line(X, BY, 30), Array.from({ length: 150 }, (_, f) => [X + f * 0.5, Y(45 * Math.sin(2 * Math.PI * (f + 1) / 29))]), hold(30));
      H.ready(pts[0][0], pts[0][1]); window.__b = { pts, cases, i: 0, to(k) { while (this.i < k) { const q = this.pts[this.i++]; if (q) H.feed(q[0], q[1]); else H.hold(DT); } return H.snap(); } };
      return { n: pts.length, cases }; })()`;
    const rows = [], picksAll = {};
    for (const [ename, route, prepJs, edge] of EDGES) {
      const prep = async () => { const P = await open(HTTP + `?cursor=test#${route}`, { label: `boundary ${route}` });
        if (prepJs) { await P.ev(prepJs); await sleep(300); }
        await P.ev("Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => 0)))"); await sleep(200);
        await P.ev(`(${installDriver.toString()})()`); return P; };
      let P = await prep(); const info = await P.ev(BUILD(edge));
      const media = []; for (let k = 1; k <= info.n; k++) media.push((await P.ev(`__b.to(${k}).media`)));
      await P.close();
      // the frames to show: around each case's first switch (every second frame; every fourth for the crossing)
      const picks = info.cases.filter((c) => c.name !== "start").map((c) => { const sw = []; for (let k = c.a + 1; k < c.b; k++) if (media[k] !== media[k - 1]) sw.push(k);
        const at = c.name.startsWith("repeated") ? Array.from({ length: 9 }, (_, j) => sw[0] - 2 + j * 4) : Array.from({ length: 9 }, (_, j) => sw[0] - 4 + j * 2); return { name: c.name, at: at.filter((k) => k < c.b) }; });
      picksAll[ename] = picks;
      P = await prep(); await P.ev(BUILD(edge));
      for (const pk of picks) { const cells = [], labs = [];
        for (const k of pk.at) { const sn = await P.ev(`__b.to(${k + 1})`); cells.push(await P.shot(...around(sn, 300, 260))); labs.push(`f${k + 1} water ${sn.mat.toFixed(2)}${sn.tail ? ` tail ${sn.L.toFixed(0)}` : ""}${sn.beads.length ? ` ${sn.beads.length}b` : ""}`); }
        rows.push({ label: `${ename} · ${pk.name}: ${labs.join(" | ")}`, cells }); }
      await P.close();
    }
    metrics.boundary = picksAll;
    writeFileSync(join(OUT, "05-boundaries.png"), await labelledSheet(B, { title: "Crossing an artwork edge, frame-exact at 120 Hz: the hero's edge (the index below it) and a render's edge (the Render Lab frame)",
      note: "The same trajectories as check-observatory.mjs's boundary checks (Water Balanced): the whole liquid (body, tail and beads) crossfades between the difference material and the water in about 100 ms, eased so the half-transparent inversion lasts only a moment, at any speed, with the tail out and beads alive, and reverses smoothly when the pointer crosses back. Every second frame around each case's first switch (every fourth for the crossing); 300×260 crops around the liquid.",
      rows }));
    console.log("boundary:", Object.entries(picksAll).map(([k, v]) => `${k}: ${v.length} cases`).join(" · "));
  }

  // ---------------------------------------------------------------- 6. the compositor: 7260ef8 vs this pass, layer for layer
  if (want("6")) {
    const out = {};
    for (const [where, route, at] of [["interface (Stress & Limits opener)", "stress", [1500, 160]], ["a render (the Render Lab frame)", "render", [760, 620]], ["a render (the Overview hero)", "overview", [1300, 300]]]) {
      const got = {};
      for (const [ver, old] of [["7260ef8", ["liquid-cursor.js", "app.js"]], ["this pass", []]]) {
        const P = await open(HTTP + `?cursor=test#${route}`, { old, label: `layers ${where} ${ver}` });
        await P.ev(`(${installDriver.toString()})()`);
        await P.ev(`__pv.ready(${at[0] - 30}, ${at[1]}), __pv.glide(${at[0]}, ${at[1]}, 12), __pv.hold(400), 1`);
        const sn = await P.ev("__pv.snap()");
        got[ver] = { layers: await P.layers(), material: sn.mat };
        await P.close();
      }
      const a = got["7260ef8"].layers, b = got["this pass"].layers, only = (x, y) => { const m = new Map(); for (const l of y) m.set(l, (m.get(l) || 0) + 1); return x.filter((l) => { const n = m.get(l) || 0; if (n) { m.set(l, n - 1); return false; } return true; }); };
      out[where] = { identical: JSON.stringify(a) === JSON.stringify(b), count: [a.length, b.length], material: got["this pass"].material, only7260ef8: only(a, b), onlyThisPass: only(b, a) };
    }
    metrics.compositor = out;
    console.log("compositor:", Object.entries(out).map(([k, v]) => `${k}: identical ${v.identical} (${v.count.join(" vs ")} layers; only 7260ef8 ${JSON.stringify(v.only7260ef8)}, only this pass ${JSON.stringify(v.onlyThisPass)})`).join(" · "));
  }
  // ---------------------------------------------------------------- 7. a letter as the water passes over it, frame by frame
  if (want("7")) {
    const rows = [], out = {};
    const CASES = (GLASS ? [["O", "", "Liquid Glass Balanced", 0.5], ["O", "", "Current pre-pass", 0.5, PRE], ["O", "&glass=subtle", "Liquid Glass Subtle", 0.5], ["O", "&glass=reference", "Liquid Glass Reference", 0.5], ["E", "", "Liquid Glass Balanced", 0.5], ["S", "", "Liquid Glass Balanced", 0.5]]
      : [["O", "", "Water Balanced", 0.5], ["O", "", "pre-pass water", 0.5, PRE], ["O", "&water=subtle", "Water Subtle", 0.5], ["O", "&water=strong", "Water Strong", 0.5], ["E", "", "Water Balanced", 0.5], ["S", "", "Water Balanced", 0.5]]).filter((c) => !["pre-pass water","Current pre-pass"].includes(c[2]) || PRE);
    for (const [ch, q, col, fy, from] of CASES) {
      const P = await open(HTTP + `?cursor=test${q}#overview`, from ? { old: ["liquid-cursor.js"], from, label: `temporal ${ch} ${col}` } : { label: `temporal ${ch} ${col}` });
      await P.ev(`document.querySelectorAll(".hero-ticks button")[0].click()`); await sleep(400);
      const box = await P.ev(`(() => { const w = document.querySelector("#hero .wordmark"), t = [...w.childNodes].find((n) => n.nodeType === 3), i = t.textContent.indexOf(${JSON.stringify(ch)}), g = document.createRange();
        g.setStart(t, i); g.setEnd(t, i + 1); const r = g.getBoundingClientRect(), ink = r.width - (parseFloat(getComputedStyle(w).letterSpacing) || 0); return [r.left + ink / 2, r.top + r.height * ${fy}, ink / 2]; })()`);
      const [cx, cy, hw] = box.map(Math.round), R = 34, stops = [["before", -(hw + R + 46)], ["entering", -(hw + R) + 26], ...(GLASS ? [["RGB split", -hw]] : []), ["centred", 0], ["exiting", hw + R - 26], ["after", hw + R + 46]];
      await P.ev(`(${installDriver.toString()})()`);
      // a slow, even pass from left to right (the pointer at 300 px/s, 120 Hz), the cursor on the letter's mid-line; each
      // stop is taken when the drawn body (which trails the pointer a little) reaches it
      const x0 = cx + stops[0][1] - 80; await P.ev(`__pv.ready(${x0}, ${cy}), 1`); await sleep(650); await P.ev("__pv.hold(400), 1"); await sleep(120);
      const W = Math.min(1920, 2 * (hw + R + 46 + R + 10)), clip = [cx - W / 2, cy - 90, W, 180].map(Math.round), cells = [], labs = [];
      for (const [name, dx] of stops) {
        await P.ev(`(() => { const S = __pv.T.S; let n = 0; while (S.renderX < ${cx + dx} && n++ < 4000) __pv.feed(S.rawX + 2.5, ${cy}); return 1; })()`);
        await sleep(160); const st = (await P.ev("HeliosLiquidCursor.status()")).material;
        cells.push(await P.shot(...clip)); labs.push(`${name}${st.refracting ? "" : " (no refraction)"}`);
      }
      out[`${ch} · ${col}`] = labs; rows.push({ label: `${ch} · ${col}: ${labs.join(" | ")}`, cells });
      if (P.logs.length) console.log("page errors", ch, col, P.logs);
      await P.close();
    }
    metrics.temporal = out;
    writeFileSync(join(OUT, "07-refraction-temporal.png"), await labelledSheet(B, { title: "A HELIOS letter as the water passes over it, left to right at 300 px/s (frame-exact, 120 Hz)",
      note: GLASS ? "The same real HELIOS glyph: before, entering, separated RGB samples across the stroke, centre, leaving, normal again. The pre-pass row is the previously verified clear-water material, preserved before this optical pass." : "Before: the letter as it is. Entering: the rim reaches the letter's left stroke and bends it inward. Centred: the crown over the letter, nearly unchanged, the rim bending the strokes it crosses. Exiting: the rim over the right stroke. After: the letter as it was (no trail, no stale image). The pre-pass row is the water before this pass (no refraction in the hero).",
      columns: ["before", "entering", ...(GLASS ? ["RGB split"] : []), "centred", "exiting", "after"], rows }));
    console.log("temporal:", JSON.stringify(out));
  }

  // Separable sliding extrema: the same bounded neighbourhood as Section 8, linear cost even with the stronger lens.
  function nearby(src, w, h, r, low = true) {
    let a = src;
    for (const vertical of [false, true]) {
      const n = vertical ? h : w, lines = vertical ? w : h, b = new Float32Array(w * h), q = new Int32Array(n);
      const at = (line, p) => vertical ? p * w + line : line * w + p;
      for (let line = 0; line < lines; line++) { let head = 0, tail = 0, next = 0;
        for (let p = 0; p < n; p++) {
          while (next <= Math.min(n - 1, p + r)) { const v = a[at(line, next)]; while (tail > head && (low ? a[at(line, q[tail - 1])] >= v : a[at(line, q[tail - 1])] <= v)) tail--; q[tail++] = next++; }
          while (q[head] < p - r) head++;
          b[at(line, p)] = a[at(line, q[head])];
        }
      }
      a = b;
    }
    return a;
  }
  function glassDarkness(withB, withoutB, r, threshold) {
    const A = decodePNG(withB.toString("base64")), S = decodePNG(withoutB.toString("base64")), w = A.w, h = A.h;
    const rgb = [0,1,2].map(()=>new Float32Array(w*h)), lum = new Float32Array(w*h), weight = [0.2126,0.7152,0.0722];
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) { const p=S.px(x,y),i=y*w+x; for(let c=0;c<3;c++) rgb[c][i]=p[c]/255; lum[i]=weight.reduce((n,v,c)=>n+v*rgb[c][i],0); }
    const lo=rgb.map(a=>nearby(a,w,h,r)), hi=rgb.map(a=>nearby(a,w,h,r,false)), minLum=nearby(lum,w,h,r);
    let n=0,nNew=0,nScalarNew=0,nColour=0,nChromatic=0,max=0,maxNew=0; const heat=Buffer.alloc(w*h*3);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) { const i=y*w+x,o=i*3,p=A.px(x,y),v=p.map(c=>c/255),L=weight.reduce((n,k,c)=>n+k*v[c],0),d=lum[i]-L;
      // Independent channel samples can legitimately be darker than every *single* source pixel. Preserve that old
      // luminance count, but use the per-channel reachable lower bound to identify darkness no RGB refraction can explain.
      const e=weight.reduce((n,k,c)=>n+k*lo[c][i],0)-L, scalar=minLum[i]-L, span=Math.max(...hi.map((a,c)=>a[i]-lo[c][i]));
      const original=rgb.map(a=>a[i]), chroma=(Math.max(...v)-Math.min(...v))-(Math.max(...original)-Math.min(...original));
      const interior=x>=r&&x<w-r&&y>=r&&y<h-r, chromatic=chroma>0.08, badColour=chromatic&&span<0.12;
      if(interior) { if(d>threshold)n++; if(e>threshold)nNew++; if(scalar>threshold)nScalarNew++; if(chromatic)nChromatic++; if(badColour)nColour++; max=Math.max(max,d); maxNew=Math.max(maxNew,e); }
      const colour=interior&&e>threshold?[255,0,170]:interior&&badColour?[255,160,0]:interior&&(d>threshold||chromatic)?[0,190,230]:p.map(c=>c*0.45);
      for(let c=0;c<3;c++) heat[o+c]=colour[c];
    }
    return {n,nNew,nScalarNew,nColour,nChromatic,max:+(max*100).toFixed(1),maxNew:+(Math.max(0,maxNew)*100).toFixed(1),heat:encodePNG(w,h,heat)};
  }

  // ---------------------------------------------------------------- 8. the fast-motion dark artifact: the pre-pass water vs this pass, the same frames
  if (want("8") && PRE) {
    const THR = 0.04, lumN = (p) => (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255;
    const reachCSS = GLASS ? +readFileSync(join(ROOT,"assets","observatory","liquid-cursor.js"),"utf8").match(/refractMaxPx: ([\d.]+)/)[1] : 8;
    // check-observatory's trajectories over the hero's pale sky and its title (the end point of each gesture)
    const TRAJ = { horizontal: [[{ dx: 1, dy: 0, v: 4200, ms: 200, ramp: 20 }], 1000, 560], diagonal: [[{ dx: 0.7071, dy: 0.7071, v: 4200, ms: 200, ramp: 20 }], 1250, 720],
      "curved whip": [[{ dx: 1, dy: 0, v: 4000, ms: 240, ramp: 20, turn: 2.6 }], 1100, 480], reversal: [[{ dx: 1, dy: 0, v: 4200, ms: 140, ramp: 20 }, { dx: -1, dy: 0, v: 4200, ms: 140 }], 900, 600],
      "long goo": [[{ dx: 1, dy: -0.1, v: 5200, ms: 260, ramp: 15 }], 1550, 430], "whip over the title": [[{ dx: -1, dy: 0.04, v: 4600, ms: 220, ramp: 18 }], 420, 548] };
    // two measures per frame. "darker": pixels the cursor makes darker than the page at the same spot (refraction moving a dark
    // stroke counts here: the stroke is shown a few pixels away). "new darkness": pixels darker than anything the page shows
    // within the refraction's reach (r px), which refraction cannot produce (it only relocates the page's own colours):
    // only shading can, so this is the smear itself
    const darkness = (withB, withoutB, r) => { const A = decodePNG(withB.toString("base64")), Bk = decodePNG(withoutB.toString("base64")), w = A.w, h = A.h;
      if (GLASS) return glassDarkness(withB, withoutB, r, THR);
      const Lp = new Float32Array(w * h), La = new Float32Array(w * h), tmp = new Float32Array(w * h), mn = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { Lp[y * w + x] = lumN(Bk.px(x, y)); La[y * w + x] = lumN(A.px(x, y)); }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 1; for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.min(m, Lp[y * w + k]); tmp[y * w + x] = m; }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 1; for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.min(m, tmp[k * w + x]); mn[y * w + x] = m; }
      let n = 0, nNew = 0, max = 0, maxNew = 0; const heat = Buffer.alloc(w * h * 3);
      for (let i = 0; i < w * h; i++) { const d = Lp[i] - La[i], e = mn[i] - La[i], o = i * 3, p = A.px(i % w, Math.floor(i / w)); if (d > THR) n++; if (e > THR) nNew++; max = Math.max(max, d); maxNew = Math.max(maxNew, e);
        const c = e > THR ? [255, 0, 170] : d > THR ? [0, 190, 230] : [p[0] * 0.45, p[1] * 0.45, p[2] * 0.45]; heat[o] = c[0]; heat[o + 1] = c[1]; heat[o + 2] = c[2]; }
      return { n, nNew, max: +(max * 100).toFixed(1), maxNew: +(Math.max(0, maxNew) * 100).toFixed(1), heat: encodePNG(w, h, heat) }; };
    const VERS = [["pre-pass water", { old: ["liquid-cursor.js"], from: PRE }, ""], ["this pass (Balanced)", {}, ""], ["this pass, shading only (refraction off)", {}, "T.setWater({ bend: 0, mag: 1 });"],
      ...(GLASS ? [["this pass (Subtle)", {}, "", "&glass=subtle"], ["this pass (Reference)", {}, "", "&glass=reference"]] : [])];
    const rows = [], out = {};
    for (const [dprName, vw, vh, dpr] of [["DPR 1, 1920×1080", 1920, 1080, 1], ["DPR 2, 1440×900", 1440, 900, 2]]) {
      const per = {}; // per version: per trajectory, per frame
      for (const [ver, o, setup, query = ""] of VERS) {
        const P = await open(HTTP + `?cursor=test${query}#overview`, { ...o, vw, vh, dpr, label: `dark ${ver} ${dprName}` });
        await P.ev(`document.querySelectorAll(".hero-ticks button")[0].click()`); await sleep(400);
        await P.ev(`(${installDriver.toString()})()`); if (setup) await P.ev(`(() => { const T = __pv.T; ${setup} return 1; })()`);
        await P.ev(`__pv.ready(${vw / 2}, ${vh / 2}), 1`); await sleep(700); // (the hero's snapshot)
        per[ver] = {};
        for (const [name, [segs, X1, Y1]] of Object.entries(TRAJ)) {
          const x1 = Math.round(X1 * vw / 1920), y1 = Math.round(Y1 * vh / 1080), n = await P.ev(`__pv.run(${JSON.stringify(segs)}, ${x1}, ${y1}, 16)`), frames = [];
          for (let k = Math.max(4, n - 18); k <= n; k += 2) { // up to the end of the gesture's 16 trailing frames, every second frame
            await P.ev(`__pv.run(${JSON.stringify(segs)}, ${x1}, ${y1}, 16)`); const sn = await P.ev(`__pv.stepTo(${k})`); await sleep(90);
            const clip = around(sn, 360 + (GLASS ? 2*reachCSS : 0), 240 + (GLASS ? 2*reachCSS : 0)), withB = await P.shot(...clip); await P.ev(HIDE); await sleep(60); const withoutB = await P.shot(...clip); await P.ev(SHOW); await sleep(40);
            const d = darkness(withB, withoutB, Math.ceil(reachCSS * dpr)); frames.push({ k, geo: geo(sn), n: d.n, nNew: d.nNew, nScalarNew:d.nScalarNew||0, nColour:d.nColour||0, nChromatic:d.nChromatic||0, max: d.max, maxNew: d.maxNew, img: withB, heat: d.heat });
          }
          per[ver][name] = frames;
        }
        if (P.logs.length) console.log("page errors", ver, P.logs);
        await P.close();
      }
      for (const name of Object.keys(TRAJ)) {
        const pre = per["pre-pass water"][name], now = per["this pass (Balanced)"][name], shade = per["this pass, shading only (refraction off)"][name];
        const worst = pre.reduce((a, f, i) => (f.nNew > pre[a].nNew || (f.nNew === pre[a].nNew && f.n > pre[a].n) ? i : a), 0), sameGeometry = pre.every((f, i) => f.geo === now[i].geo && f.geo === shade[i].geo && (!GLASS || (f.geo === per["this pass (Subtle)"][name][i].geo && f.geo === per["this pass (Reference)"][name][i].geo)));
        const sum = (fr) => ({ worstNewDarkPx: Math.max(...fr.map((f) => f.nNew)), worstNewDarkPct: Math.max(...fr.map((f) => f.maxNew)), worstDarkerPx: Math.max(...fr.map((f) => f.n)), worstDarkerPct: Math.max(...fr.map((f) => f.max)), framesWithNewDark: fr.filter((f) => f.nNew > 0).length,
          ...(GLASS ? {worstScalarNewDarkPx:Math.max(...fr.map(f=>f.nScalarNew)),worstIsolatedColourPx:Math.max(...fr.map(f=>f.nColour)),worstSourceCompatibleChromaticPx:Math.max(...fr.map(f=>f.nChromatic))}: {}) });
        out[`${name} · ${dprName}`] = { frames: pre.length, sameGeometry, prepass: sum(pre), thisPass: sum(now), thisPassShadingOnly: sum(shade),
          ...(GLASS ? {subtle:sum(per["this pass (Subtle)"][name]),reference:sum(per["this pass (Reference)"][name])}: {}) };
        if (dpr === 1 || name === "whip over the title" || name === "long goo")
          rows.push({ label: `${name} · ${dprName} · frame ${pre[worst].k} (the pre-pass's worst): new darkness ${pre[worst].nNew} px (max ${pre[worst].maxNew}%) → ${now[worst].nNew} px (max ${now[worst].maxNew}%) · darker than the same spot ${pre[worst].n} → ${now[worst].n} px (displaced strokes) · over all ${pre.length} frames: new darkness ${sum(pre).worstNewDarkPx} → ${sum(now).worstNewDarkPx} px (refraction off ${sum(shade).worstNewDarkPx}); geometry identical ${sameGeometry}`,
            cells: [pre[worst].img, pre[worst].heat, now[worst].img, now[worst].heat] });
      }
    }
    metrics.darkArtifact = { threshold: GLASS ? "4% darkness threshold unchanged. 24 CSS px hard shader reach, with a full source halo excluded from the analysis border. New darkness uses reachable per-channel minima for independent RGB samples; the original single-source luminance count is retained separately. Isolated colour: chroma increase >8% without a reachable source contrast >=12%." : "4% luminance. darker: below the page at the same spot (includes dark strokes moved by refraction); new darkness: below the darkest page pixel within 8 CSS px (the refraction's reach), which only shading can cause", reachCSS, results: out };
    writeFileSync(join(OUT, "08-dark-artifact.png"), await labelledSheet(B, { title: "The fast-motion dark smear: the pre-pass water vs this pass on the same frame-exact trajectories over the hero",
      note: GLASS ? "Same deterministic geometry and frames. Magenta: darkness beyond the per-channel source envelope inside the shader's proven 24 CSS px reach. Orange: chromatic change without nearby high-contrast source content. Cyan: source-compatible displacement/colour. A 24 CSS px source halo prevents crop-edge false positives. The scalar-luminance classifier remains recorded, and the shading-only control is independent. The pre-pass is the verified clear-water runtime." : "Each row: the same gesture and frame (the pre-pass's worst), the simulation identical. Magenta = new darkness: pixels more than 4% darker than anything the page shows within 8 CSS px, which refraction cannot produce (it only moves the page's own colours a few pixels): the smear. Cyan = pixels darker than the page at the same spot only because a dark stroke (a letter) is shown displaced by the water's bending. Before, the far-side meniscus and the ink outline stacked on the trailing edge of a stretched body; now the meniscus is capped, lives on the body's broad parts only, and never stacks with the outline.",
      columns: ["pre-pass", "pre-pass: new darkness (magenta) / displaced (cyan)", "this pass", "this pass: new darkness (magenta) / displaced (cyan)"], rows }));
    console.log("dark:", Object.entries(out).map(([k, v]) => `${k}: new ${v.prepass.worstNewDarkPx} → ${v.thisPass.worstNewDarkPx} (refraction off ${v.thisPassShadingOnly.worstNewDarkPx}); darker-at-spot ${v.prepass.worstDarkerPx} → ${v.thisPass.worstDarkerPx}; same ${v.sameGeometry}`).join(" · "));
  }

  const mp = join(OUT, "polish-metrics.json"), prior = ONLY.length && existsSync(mp) ? JSON.parse(readFileSync(mp, "utf8")) : {};
  writeFileSync(mp, JSON.stringify({ ...prior, ...metrics }, null, 1) + "\n");
  console.log("written to", OUT);
} catch (err) { console.log("FAILED", err && err.stack || err); process.exitCode = 1; }
finally { await B.close(); clearInterval(keepAlive); }
