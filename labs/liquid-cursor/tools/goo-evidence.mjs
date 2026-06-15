// Liquid cursor lab, Phase 4.5 correction: visual evidence of the connected goo wake (the real WebGL output of the
// composited page, never mockups), with the droplet-centric attempt and Phase 4 alongside for comparison. Frame-exact
// 120 Hz scripted trajectories (tools/silhouette.mjs), the lab's real manual controls, and the pure-dynamics records.
//
//   node labs/liquid-cursor/tools/goo-evidence.mjs [--out DIR] [--evidence] [--http URL] [--only name,name]
//
// --evidence writes into labs/liquid-cursor/evidence/phase4-connected/ (earlier evidence is never rewritten). GIF clips
// need Python with Pillow (skipped otherwise).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openPage, labelledSheet } from "./cdp.mjs";
import { installHelpers } from "./silhouette.mjs";
import { loadLab, simulate, GESTURES, RICH_GESTURES, randomScribble } from "./pool-sim.mjs";

const LAB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = argv.includes("--evidence") ? join(LAB, "evidence", "phase4-connected") : opt("--out", mkdtempSync(join(tmpdir(), "lc-goo-")));
const HTTP = opt("--http", "http://127.0.0.1:8315/labs/liquid-cursor/");
const ONLY = (opt("--only", "") || "").split(",").filter(Boolean), want = (n) => !ONLY.length || ONLY.includes(n);
mkdirSync(OUT, { recursive: true });
const FRAME = 1000 / 120;
const PRESETS = [["balanced", "A · Phase 4 current (droplets)"], ["richBalanced", "B · Rich goo droplets (previous attempt)"], ["connectedSparse", "C · Connected goo sparse"],
  ["connectedBalanced", "D · Connected goo balanced (default)"], ["connectedHeavy", "E · Connected goo heavy"], ["connectedBoundary", "F · Too much (boundary diagnostic)"]];

// Gestures over the top surfaces row of Mode B (paper 32-533, dark 557-958, swatches 982-1303, image 1327-1888; y 276-606).
const zig = (n, legMs, v, dy, ramp = 30) => Array.from({ length: n }, (_, i) => ({ dx: i % 2 ? -1 : 1, dy: (i < n / 2 ? 1 : -1) * dy, v, ms: legMs, ramp: i === 0 ? ramp : 0 }));
const G = {
  strongFlick: { label: "strong flick (0 → 3200 px/s in 25 ms, 200 ms, then stop)", path: [{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], to: [1050, 440], hold: 700, region: [300, 300, 900, 290] },
  sharpTurn: { label: "sharp turn at 2200 px/s (right, then up)", path: [{ dx: 1, dy: 0, v: 2200, ms: 220, ramp: 120 }, { dx: 0, dy: -1, v: 2200, ms: 120 }], to: [1000, 300], hold: 700, region: [380, 278, 760, 328] },
  reversal: { label: "fast reversal at 2000 px/s", path: [{ dx: 1, dy: 0, v: 2000, ms: 220, ramp: 120 }, { dx: -1, dy: 0, v: 2000, ms: 150 }], to: [760, 440], hold: 700, region: [360, 300, 800, 290] },
  extremeWhip: { label: "extreme whip (0 → 4600 px/s in 18 ms, then a hard reversal down-left at 4200 px/s)", path: [{ dx: 1, dy: 0, v: 4600, ms: 150, ramp: 18 }, { dx: -0.95, dy: 0.31, v: 4200, ms: 120 }], to: [900, 470], hold: 700, region: [540, 278, 1000, 328] },
  zigzag: { label: "compound scribble: 8 legs of 170 ms at 3000 px/s back and forth", path: zig(8, 170, 3000, 0.12), to: [700, 330], hold: 900, region: [480, 278, 900, 328] },
  wscribble: { label: "compound W scribble: 6 legs of 130 ms at 3000 px/s with 77° turns, moving on", path: Array.from({ length: 6 }, (_, i) => ({ dx: 0.78, dy: i % 2 ? -0.62 : 0.62, v: 3000, ms: 130, ramp: i === 0 ? 30 : 0 })), to: [1660, 320], hold: 700, region: [80, 296, 1700, 290] },
  sweep: { label: "fast smooth sweep (0 → 2600 px/s over 120 ms)", path: [{ dx: 1, dy: 0, v: 2600, ms: 300, ramp: 120 }], to: [1100, 440], hold: 300, region: [440, 330, 760, 230] },
  catch: { label: "strong flick, dead stop: the body catches its own tail", path: [{ dx: 1, dy: 0, v: 3200, ms: 117, ramp: 25 }, { dx: 0, dy: 0, v: 0, ms: 260 }, { dx: -1, dy: 0, v: 700, ms: 360, ramp: 60 }], to: [700, 440], hold: 400, region: [260, 300, 700, 290] },
};

async function page(B, pool, { dpr = 1, mode = "B" } = {}) {
  const P = await openPage(B, `${HTTP}?mode=${mode}&pool=${pool}`, { dpr });
  await P.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
  return P;
}
const STATE = `(() => { const s = __lc.step(), D = liquidCursorLab.engine.state.drop, W = D.wake; s.wake = { state: W.state, len: W.len, rb: W.r[4], neck: W.neck, pts: Array.from(W.x).map((x, i) => [x, W.y[i]]) };
  s.pool = D.slots.filter((q) => q.state !== "IDLE").map((q) => ({ id: q.id, kind: q.kind, state: q.state, x: q.x, y: q.y, r: q.r, r0: q.r0 })); s.material = D.material; return s; })()`;
// run one gesture (or a manual scenario) frame by frame; capture when pick(frame, i) says so, the crop from crop(frame) or region
async function run(P, g, { region, pick = () => true, crop = null, maxFrames = 400, manual = null } = {}) {
  await P.ev("liquidCursorLab.engine.clearDroplets(), liquidCursorLab.engine.resetBody(), 1");
  const n = manual ? await P.ev(`(__lc.ready(${manual.at}), __lc.seq(Array(${Math.round(manual.hold / FRAME)}).fill(null)))`)
    : await P.ev(`(() => { const p = __lc.points(${JSON.stringify(g.path)}, ${g.to}); __lc.ready(p.start[0], p.start[1]); return __lc.seq(p.pts.concat(Array(${Math.round(g.hold / FRAME)}).fill(null))); })()`);
  const frames = [];
  for (let i = 0; i < Math.min(n, maxFrames); i++) {
    if (manual && manual.sheds) for (const s of manual.sheds.filter((x) => x.frame === i)) await P.ev(`liquidCursorLab.engine.triggerDroplet(${JSON.stringify(s.opts)})`);
    const st = await P.ev(STATE); st.ms = +(i * FRAME).toFixed(1); st.i = i;
    if (pick(st, i)) { await P.frames(2); st.png = Buffer.from(await P.shot(...(crop ? crop(st) : region)), "base64"); }
    frames.push(st);
  }
  return frames;
}
const tailOut = (f) => f.wake && f.wake.state !== "IDLE";
const lab = (f) => `${f.ms.toFixed(0)} ms${tailOut(f) ? ` · tail ${f.wake.state.toLowerCase()} ${f.wake.len.toFixed(0)} px${f.wake.rb > 0 ? `, bulb ${f.wake.rb.toFixed(1)}` : ""}` : ""}${f.pool.length ? " · " + f.pool.map((s) => `${s.kind === "bulb" ? "bulb" : s.kind === "splash" ? "s" : s.kind[0]}${s.r.toFixed(1)}${s.state === "FADING" ? "↓" : ""}`).join(" ") : ""}`;
// a crop around the body, the tail and every piece, at least w x h CSS px
const around = (w, h) => (f) => { const tp = tailOut(f) ? f.wake.pts : [], xs = [f.bodyX, ...f.pool.map((s) => s.x), ...tp.map((p) => p[0])], ys = [f.bodyY, ...f.pool.map((s) => s.y), ...tp.map((p) => p[1])];
  const x0 = Math.min(...xs) - 50, x1 = Math.max(...xs) + 50, y0 = Math.min(...ys) - 50, y1 = Math.max(...ys) + 50, W = Math.max(w, x1 - x0), H = Math.max(h, y1 - y0);
  return [Math.round((x0 + x1 - W) / 2), Math.round((y0 + y1 - H) / 2), Math.round(W), Math.round(H)]; };
function gif(frames, file, frameMs) {
  const dir = mkdtempSync(join(tmpdir(), "lc-gif-"));
  const list = frames.filter((f) => f.png).map((f, i) => { const p = join(dir, `f${String(i).padStart(4, "0")}.png`); writeFileSync(p, f.png); return [p, lab(f)]; });
  writeFileSync(join(dir, "list.json"), JSON.stringify(list));
  const py = `import json, sys
from PIL import Image, ImageDraw
items = json.load(open(sys.argv[1])); out = sys.argv[2]; ms = int(sys.argv[3]); ims = []
for p, t in items:
    im = Image.open(p).convert("RGB"); d = ImageDraw.Draw(im); d.rectangle([0, 0, im.width, 22], fill=(255, 255, 255)); d.text((8, 5), t, fill=(27, 30, 33)); ims.append(im.quantize(colors=64))
ims[0].save(out, save_all=True, append_images=ims[1:], duration=ms, loop=0, optimize=True)`;
  try { execFileSync("python", ["-c", py, join(dir, "list.json"), file, String(frameMs)], { stdio: "pipe" }); return true; }
  catch (e) { console.log(`GIF skipped (${file}): ${String(e.message).split("\n")[0]}`); return false; }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
const stats = (frames) => { const ids = new Map(); let peak = 0, maxLen = 0, conn = 0, rb = 0; for (const f of frames) { peak = Math.max(peak, f.material); if (tailOut(f)) { maxLen = Math.max(maxLen, f.wake.len); rb = Math.max(rb, f.wake.rb); if (f.wake.state === "PULL" || f.wake.state === "NECK") conn += FRAME; }
    for (const s of f.pool) if (!ids.has(s.id)) ids.set(s.id, { kind: s.kind, r0: +s.r0.toFixed(2), startMs: f.ms }); }
  return { pieces: [...ids.values()], peakMaterial: peak, maxTailLenPx: +maxLen.toFixed(1), tailConnectedMs: +conn.toFixed(0), maxBulbPx: +rb.toFixed(2) }; };
// frames as a grid (four per row), each crop at native pixels
async function grid(B, title, note, frames) { const rows = []; for (let k = 0; k < frames.length; k += 4) rows.push({ label: frames.slice(k, k + 4).map(lab).join(" | "), cells: frames.slice(k, k + 4).map((f) => f.png) }); return labelledSheet(B, { title, note, rows }); }

const results = { when: new Date().toISOString(), scenarios: {}, files: [] };
const keep = (name, buf) => { writeFileSync(join(OUT, name), buf); results.files.push(name); };
const logs = [];
const B = await launch();
results.browser = B.version;
try {
  const P = await page(B, "connectedBalanced");
  if (want("quiet")) { // rest, ordinary navigation, a fast smooth sweep: no goo
    const rows = [];
    await P.ev("liquidCursorLab.engine.clearDroplets(), liquidCursorLab.engine.resetBody(), __lc.ready(760, 440), 1"); await P.frames(2);
    rows.push({ label: "1 · rest: the approved round body", cells: [Buffer.from(await P.shot(560, 330, 400, 230), "base64")] });
    const nav = await P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop, e0 = D.events; E.clearDroplets(); E.resetBody();
      for (const [x0, y0, x1, y1, ms] of [[300, 400, 820, 330, 320], [820, 330, 1220, 520, 280], [1220, 520, 640, 480, 360], [640, 480, 1500, 380, 420], [1500, 380, 900, 440, 300]]) { __lc.minJerk(x0, y0, x1, y1, ms); __lc.hold(150); }
      return { events: D.events - e0, x: E.state.renderX, y: E.state.renderY }; })()`);
    await P.frames(2); rows.push({ label: `2 · normal motion (5 minimum-jerk pointing moves of 470-860 px in 280-420 ms): ${nav.events} tails or pieces`, cells: [Buffer.from(await P.shot(Math.round(nav.x) - 200, Math.round(nav.y) - 115, 400, 230), "base64")] });
    const sw = await run(P, G.sweep, { region: G.sweep.region, pick: (f, i) => i === 26 });
    results.scenarios.quiet = { normalMotionEvents: nav.events, sweep: stats(sw) };
    rows.push({ label: `3 · fast smooth sweep at full stretch (+${sw[26].ms} ms): ${sw.filter(tailOut).length ? "a tail" : "no tail"}, ${stats(sw).pieces.length} pieces`, cells: [sw[26].png] });
    keep("01-03-rest-normal-motion-sweep.png", await labelledSheet(B, { title: "Rest, normal motion and a fast smooth sweep: clean, no goo (connected goo · balanced)", note: "Composited page, headless Edge, DPR 1, 120 Hz scripted input. Deformation only; the wake needs an abrupt swing.", rows }));
  }
  // 4-9: the gestures as tail-following grids (every second frame from just before the tail starts); GIFs from fixed regions
  for (const [name, file] of [["strongFlick", "04-strong-flick"], ["sharpTurn", "05-sharp-turn"], ["reversal", "06-reversal"], ["extremeWhip", "07-extreme-whip"], ["zigzag", "08-compound-scribble"], ["catch", "09-flick-stop-rejoin"]]) {
    if (!want(name)) continue;
    const all = await run(P, G[name], { region: G[name].region, pick: () => true }); // fixed region, every frame (GIF)
    results.scenarios[name] = { label: G[name].label, ...stats(all) };
    const t0 = Math.max(0, all.findIndex(tailOut) - 2), tEnd = Math.min(all.length - 1, t0 + (name === "zigzag" ? 150 : 52));
    const pickI = new Set(); for (let i = t0; i <= tEnd; i += name === "zigzag" ? 4 : 2) pickI.add(i);
    const fr = await run(P, G[name], { crop: around(440, 260), pick: (f, i) => pickI.has(i), maxFrames: tEnd + 1 });
    keep(`${file}.png`, await grid(B, `Connected goo · balanced · ${G[name].label}`, "Composited page (headless Edge, DPR 1, 120 Hz scripted input, difference mask over the lab surfaces). Crops follow the body and its tail, native pixels; left to right, then down. Labels: tail state, its length (root to bulb) and bulb radius; free pieces (bulb, s splash; radius in px; ↓ fading).", fr.filter((f) => f.png)));
    if (["strongFlick", "extremeWhip", "zigzag"].includes(name)) {
      const span = all.slice(Math.max(0, t0 - 6), Math.min(all.length, tEnd + 30));
      if (gif(span, join(OUT, `${file}-slow.gif`), 50)) results.files.push(`${file}-slow.gif`);
      if (gif(span.filter((f, i) => i % 2 === 0), join(OUT, `${file}-realtime.gif`), 17)) results.files.push(`${file}-realtime.gif`);
    }
  }
  // 15: the window edge (manual tails thrown towards and along the right edge)
  if (want("edge")) {
    const frames = await run(P, null, { region: [1640, 270, 280, 340], manual: { at: [1860, 440], hold: 700, sheds: [{ frame: 0, opts: { angleDeg: 0, speed: 700, peak: 2 } }, { frame: 40, opts: { angleDeg: -50, speed: 650, peak: 1.8 } }] } });
    results.scenarios.edge = stats(frames);
    const longest = frames.reduce((a, f) => (tailOut(f) && f.wake.len > (tailOut(a) ? a.wake.len : 0) ? f : a), frames[0]);
    keep("15-window-edge.png", await labelledSheet(B, { title: "At the right window edge: the tail and its pieces are drawn wherever they are (only the viewport clips)", note: "The body 60 px from the right edge of a 1920 px window; manual tails thrown right and up-right. DPR 1.",
      rows: [longest, frames[Math.min(frames.length - 1, longest.i + 12)], frames[Math.min(frames.length - 1, 52)], frames[Math.min(frames.length - 1, 64)]].map((f) => ({ label: lab(f), cells: [f.png] })) }));
  }
  results.console = [...logs, ...P.logs];
  await P.close();
  // 10-12: DPR 2 close-ups at native pixels: connected tails, rear bulbs, and 2, 3 and 4 pieces of material
  if (want("closeups")) {
    const Q = await page(B, "connectedBalanced", { dpr: 2 });
    const probe = (g) => run(Q, g, { pick: () => false });
    const shot = async (g, k, crop) => (await run(Q, g, { maxFrames: k + 1, pick: (f, i) => i === k, crop }))[k];
    const tails = [], bulbs = [], mats = {};
    for (const name of ["strongFlick", "sharpTurn", "reversal", "extremeWhip", "zigzag", "wscribble"]) {
      const fr = await probe(G[name]);
      const iLong = fr.reduce((a, f, i) => (tailOut(f) && f.wake.state === "PULL" && f.wake.len > (fr[a] && tailOut(fr[a]) ? fr[a].wake.len : 0) ? i : a), -1);
      if (iLong >= 0 && tails.length < 4 && name !== "wscribble" && name !== "zigzag") tails.push([name, iLong]);
      const iNeck = fr.findIndex((f) => tailOut(f) && f.wake.state === "NECK" && f.wake.neck > 0.4);
      if (iNeck >= 0 && bulbs.length < 4 && name !== "wscribble") bulbs.push([name, iNeck]);
      for (const n of [2, 3, 4]) if (!mats[n]) { const i = fr.findIndex((f) => f.material === n && tailOut(f)) >= 0 ? fr.findIndex((f) => f.material === n && tailOut(f)) : fr.findIndex((f) => f.material === n); if (i >= 0) mats[n] = [name, i]; }
    }
    results.scenarios.closeups = { tails, bulbs, materials: mats };
    const cells = async (list) => { const out = []; for (const [name, i] of list) out.push(await shot(G[name], i, around(300, 200))); return out; };
    const tf = await cells(tails);
    keep("10-connected-tail-examples.png", await labelledSheet(B, { title: "Connected tails at their longest: body, thick tapering strand and rear bulb as one surface", note: "Rich, natural emission (connected goo · balanced). DPR 2, native pixels, one crop per gesture around the body and its tail.",
      columns: tails.map(([n]) => G[n].label.split(" (")[0]), rows: [{ label: tf.map(lab).join(" | "), cells: tf.map((f) => f.png) }] }));
    const bf = await cells(bulbs);
    keep("11-rear-bulb-examples.png", await labelledSheet(B, { title: "The rear bulb as the neck thins before it pinches off", note: "DPR 2, native pixels, crop around the body and its tail.",
      columns: bulbs.map(([n]) => G[n].label.split(" (")[0]), rows: [{ label: bf.map(lab).join(" | "), cells: bf.map((f) => f.png) }] }));
    const mf = await cells([2, 3, 4].filter((n) => mats[n]).map((n) => mats[n]));
    keep("12-material-2-3-4.png", await labelledSheet(B, { title: "Two, three and four pieces of material (the tail counts once): natural emission", note: "DPR 2, native pixels, crop around the body, its tail and every piece.",
      columns: [2, 3, 4].filter((n) => mats[n]).map((n) => `${n} pieces · ${G[mats[n][0]].label.split(" (")[0]}`), rows: [{ label: mf.map(lab).join(" | "), cells: mf.map((f) => f.png) }] }));
    results.console.push(...Q.logs); await Q.close();
  }
  // 13, 14: inversion over paper text and over the dark panel (DPR 2)
  if (want("surfaces")) {
    const Q = await page(B, "connectedBalanced", { dpr: 2 });
    for (const [name, to, region] of [["paper", [480, 440], [40, 300, 490, 290]], ["dark", [930, 440], [557, 300, 400, 290]]]) {
      const g = { path: [{ dx: 1, dy: 0, v: 3000, ms: 160, ramp: 25 }], to, hold: 500 };
      const frames = await run(Q, g, { region, pick: (f) => tailOut(f) || f.pool.length > 0 });
      const picks = frames.filter((f) => f.png).filter((f, i) => i % 4 === 0).slice(0, 8);
      keep(`${name === "paper" ? "13" : "14"}-inversion-${name}.png`, await labelledSheet(B, { title: `Difference inversion over the ${name === "paper" ? "paper text" : "dark panel"}: body, tail and pieces are one material`, note: "A flick ending at the panel's right side, DPR 2, native pixels. No new colour, outline, shadow or glow.", rows: picks.map((f) => ({ label: lab(f), cells: [f.png] })) }));
    }
    results.console.push(...Q.logs); await Q.close();
  }
  // 16: Mode C during a drawn-out tail
  if (want("debug")) {
    const Q = await page(B, "connectedBalanced", { mode: "C" });
    const g = G.strongFlick;
    await Q.ev("liquidCursorLab.engine.clearDroplets(), liquidCursorLab.engine.resetBody(), 1");
    const n = await Q.ev(`(() => { const p = __lc.points(${JSON.stringify(g.path)}, ${g.to}); __lc.ready(p.start[0], p.start[1]); return __lc.seq(p.pts.concat(Array(60).fill(null))); })()`);
    for (let i = 0; i < n; i++) { const st = await Q.ev(STATE); if (tailOut(st) && st.wake.len > 60) break; }
    await Q.frames(2); await new Promise((r) => setTimeout(r, 450));
    keep("16-mode-c-diagnostics.png", Buffer.from(await Q.shot(0, 0, 1920, 1080), "base64"));
    results.console.push(...Q.logs); await Q.close();
  }
  // THE comparison: the same deterministic gestures across the six snapshots (DPR 1, native pixels)
  if (want("compare")) {
    const cols = [["strongFlick", 12, "strong flick +100 ms"], ["strongFlick", 22, "strong flick +183 ms"], ["extremeWhip", 12, "extreme whip +100 ms"], ["extremeWhip", 21, "extreme whip +175 ms"], ["zigzag", 70, "compound scribble +583 ms"]];
    const wcol = 96, rows = [], wrows = [];
    for (const [key, label] of PRESETS) {
      const Q = await page(B, key), info = {};
      for (const g of [...new Set(cols.map((c) => c[0]))]) { const w_ = cols.filter((c) => c[0] === g).map((c) => c[1]); info[g] = await run(Q, G[g], { region: G[g].region, pick: (f, i) => w_.includes(i), maxFrames: Math.max(...w_) + 1 }); }
      rows.push({ label: `${label} · ${cols.map(([g, i]) => (tailOut(info[g][i]) ? "tail" : "") + (info[g][i].pool.length ? `${info[g][i].pool.length}p` : "") || "–").join(" / ")}`, cells: cols.map(([g, i]) => info[g][i].png) });
      const wf = await run(Q, G.wscribble, { region: G.wscribble.region, pick: (f, i) => i === wcol, maxFrames: wcol + 1 });
      wrows.push({ label: `${label} · ${lab(wf[wcol])}`, cells: [wf[wcol].png] });
      const full = {}; for (const g of ["strongFlick", "extremeWhip", "zigzag"]) full[g] = stats(await run(Q, G[g], { pick: () => false }));
      results.scenarios[`compare-${key}`] = full;
      results.console.push(...Q.logs); await Q.close();
    }
    keep("20-comparison-sheet.png", await labelledSheet(B, { title: "The same deterministic gestures: Phase 4 droplets · rich goo droplets · connected goo sparse / balanced / heavy · too much",
      note: "Identical 120 Hz scripted gestures and backdrops, headless Edge, DPR 1, native pixels. Columns: a strong flick (0 → 3200 px/s in 25 ms) and an extreme whip (4600 px/s, then a hard reversal) at two moments each, and a back-and-forth compound scribble. Row labels: per column, a tail out and/or n free pieces.",
      columns: cols.map((c) => c[2]), rows }));
    keep("21-comparison-w-scribble.png", await labelledSheet(B, { title: "The same compound W scribble across the six snapshots, 800 ms in", note: "6 legs of 130 ms at 3000 px/s with 77° turns, moving left to right; DPR 1, native pixels.", rows: wrows }));
  }
} finally { await B.close(); }

// the measurements behind the policy (pure dynamics, the lab's own scripts)
if (want("density")) {
  const W = loadLab(), POOLS = W.LIQUID_CURSOR_CONFIG.lab.poolPresets, D = {};
  for (const [key] of PRESETS) {
    const vals = POOLS[key].values; let mat = new Array(7).fill(0), frames = 0, pieces = 0, tails = [], conn = [];
    for (let s = 1; s <= 40; s++) { const r = simulate(W, randomScribble(s), { hz: 120, params: vals }); for (const m of r.material) mat[m]++; frames += r.material.length; pieces += r.emitted; for (const t of r.tails) { tails.push(t.maxLen); conn.push(t.connectedMs); } }
    const gest = {};
    for (const [gname, g] of Object.entries({ strongFlick: RICH_GESTURES.strongFlick, sharpTurn: RICH_GESTURES.sharpTurn, fastReversal: RICH_GESTURES.fastReversal, extremeWhip: RICH_GESTURES.extremeWhip, navigation: RICH_GESTURES.navigation, fastNav: RICH_GESTURES.fastNav, sweepFast: GESTURES.sweepFast }))
      gest[gname] = [60, 120, 144, 165].map((hz) => { const r = simulate(W, g, { hz, params: vals }); return { hz, tails: r.tails.map((t) => `${t.outcome}:${t.maxLen.toFixed(0)}px/${t.connectedMs.toFixed(0)}ms/bulb${t.rb.toFixed(1)}/+${t.splash}`), pieces: r.events.map((e) => e.kind[0]).join(""), peakMaterial: r.peakMaterial }; });
    D[key] = { timeWithMaterial: mat.map((x) => +(100 * x / frames).toFixed(1)), meanMaterial: +(mat.reduce((a, x, i) => a + x * i, 0) / frames).toFixed(3), piecesPerSecond: +(pieces / 160).toFixed(2),
      tailsPerSecond: +(tails.length / 160).toFixed(2), tailLenPx: tails.length ? [Math.round(Math.min(...tails)), Math.round(Math.max(...tails))] : null, tailConnectedMs: conn.length ? [Math.round(Math.min(...conn)), Math.round(Math.max(...conn))] : null, gestures: gest };
  }
  results.density = { note: "40 seeded relentless 4 s random violent scribbles at 120 Hz per snapshot; material = free pieces + the tail (counted once)", snapshots: D };
}
if (ONLY.length && existsSync(join(OUT, "goo-evidence.json"))) { const old = JSON.parse(readFileSync(join(OUT, "goo-evidence.json"), "utf8")); results.scenarios = { ...old.scenarios, ...results.scenarios }; results.files = [...new Set([...old.files, ...results.files])]; if (!results.density) results.density = old.density; }
writeFileSync(join(OUT, "goo-evidence.json"), JSON.stringify(results, null, 1) + "\n");
for (const [n, s] of Object.entries(results.scenarios)) console.log(n.padEnd(24), JSON.stringify(s).slice(0, 230));
console.log(`files: ${results.files.length} · console: ${results.console && results.console.length ? results.console.join(" | ") : "clean"} · output ${OUT}`);
