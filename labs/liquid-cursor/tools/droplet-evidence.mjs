// Liquid cursor lab, Phase 3: visual evidence of the single-droplet experiment (the real WebGL output, never mockups).
// Frame-exact 120 Hz scripted trajectories (tools/silhouette.mjs); every frame is captured from the composited page.
//
//   node labs/liquid-cursor/tools/droplet-evidence.mjs [--out DIR] [--evidence] [--http URL] [--only name,name]
//
// --evidence writes into labs/liquid-cursor/evidence/phase3/droplet/. GIF clips need Python with Pillow (skipped otherwise).
// --only neck makes just the revised-neck evidence: neck-stages.png (the eight stages of one balanced event),
// neck-compare.png (the same flick with all four snapshots, frame by frame), neck-balanced-slow.gif, and the measured
// widths in droplet-evidence.json (`neck`).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openPage, labelledSheet, sleep } from "./cdp.mjs";
import { installHelpers } from "./silhouette.mjs";

const LAB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = argv.includes("--evidence") ? join(LAB, "evidence", "phase3", "droplet") : opt("--out", mkdtempSync(join(tmpdir(), "lc-drop-")));
const HTTP = opt("--http", "http://127.0.0.1:8315/labs/liquid-cursor/");
const ONLY = (opt("--only", "") || "").split(",").filter(Boolean);
mkdirSync(OUT, { recursive: true });

// Scenarios over the blank lower part of the white panel E (x 40-740, y 735-1015); `path` segments end at `to`.
const WIDE = [40, 815, 700, 110], TALL = [40, 735, 700, 280];
const SCEN = {
  flick: { title: "Violent flick from rest (0 → 3200 px/s in 25 ms), the pointer keeps going, then stops", region: WIDE,
    path: [{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], to: [700, 870], hold: 560 },
  flickStop: { title: "Violent flick, then a dead stop 117 ms later (the body halts while the bead is shed)", region: WIDE,
    path: [{ dx: 1, dy: 0, v: 3200, ms: 117, ramp: 25 }], to: [440, 870], hold: 640 },
  turn: { title: "Sharp turn at 2200 px/s: right, then straight down", region: TALL,
    path: [{ dx: 1, dy: 0, v: 2200, ms: 220, ramp: 120 }, { dx: 0, dy: 1, v: 2200, ms: 70 }], to: [470, 945], hold: 600 },
  reversal: { title: "Fast reversal at 2000 px/s: right, then straight back left", region: WIDE,
    path: [{ dx: 1, dy: 0, v: 2000, ms: 220, ramp: 120 }, { dx: -1, dy: 0, v: 2000, ms: 150 }], to: [150, 870], hold: 600 },
  sweep: { title: "Smooth fast sweep (0 → 2600 px/s over 120 ms): full stretch, no droplet", region: WIDE,
    path: [{ dx: 1, dy: 0, v: 2600, ms: 250, ramp: 120 }], to: [600, 870], hold: 250 },
  manual: { title: "Manual lab trigger at rest (launch ← 420 px/s): the same lifecycle on demand", region: WIDE,
    manual: { at: [480, 870], angleDeg: 190, speed: 420 }, hold: 760 },
};
const ATTACHED = new Set(["BUDDING", "NECKING", "DETACHING"]);

async function page(B, mode, dpr) {
  const P = await openPage(B, `${HTTP}?mode=${mode}&pool=single`, { dpr }); // the approved Phase 3 droplet (capacity 1), as recorded
  await P.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
  return P;
}
// run one scenario frame by frame; returns every frame's state and PNG (composited page crop)
async function run(P, sc, { keepAll = true } = {}) {
  await P.ev("liquidCursorLab.engine.resetBody(), 1");
  let n;
  if (sc.manual) n = await P.ev(`(__lc.ready(${sc.manual.at}), __lc.seq(Array(${Math.round(sc.hold / (1000 / 120))}).fill(null)))`);
  else n = await P.ev(`(() => { const p = __lc.points(${JSON.stringify(sc.path)}, ${sc.to}); __lc.ready(p.start[0], p.start[1]);
    return __lc.seq(p.pts.concat(Array(${Math.round(sc.hold / (1000 / 120))}).fill(null))); })()`);
  const frames = [];
  let manualDone = !sc.manual, idleAfter = 0, seen = false;
  for (let i = 0; i < n; i++) {
    const st = await P.ev("__lc.step()");
    if (!manualDone) { await P.ev(`liquidCursorLab.engine.triggerDroplet({ angleDeg: ${sc.manual.angleDeg}, speed: ${sc.manual.speed} })`); manualDone = true; }
    seen = seen || st.state !== "IDLE";
    await P.frames(2);
    const [x, y, w, h] = sc.region;
    frames.push({ ms: +(st.i * 1000 / 120).toFixed(1), ...st, png: keepAll || ATTACHED.has(st.state) ? Buffer.from(await P.shot(x, y, w, h), "base64") : null });
    if (seen && st.state === "IDLE" && ++idleAfter > 6) break;
  }
  return frames;
}
const label = (f) => `${f.ms.toFixed(0)} ms · ${f.state}${f.state === "IDLE" ? "" : ` · r ${f.r.toFixed(1)} px · α ${f.alpha.toFixed(2)}${ATTACHED.has(f.state) ? ` · gap ${f.gap.toFixed(1)} · union ${f.k.toFixed(1)}${f.connected ? " · connected" : ""}` : ` · ${Math.round(Math.hypot(f.vx, f.vy))} px/s`} · ${f.layer}`}`;

function gif(frames, file, frameMs) {
  const dir = mkdtempSync(join(tmpdir(), "lc-gif-"));
  const list = frames.filter((f) => f.png).map((f, i) => { const p = join(dir, `f${String(i).padStart(4, "0")}.png`); writeFileSync(p, f.png); return [p, label(f)]; });
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

const results = { when: new Date().toISOString(), scenarios: {}, files: [] };
const keep = (name, buf) => { writeFileSync(join(OUT, name), buf); results.files.push(name); };
const B = await launch();
results.browser = B.version;
try {
  const P = await page(B, "B", 2);
  for (const [name, sc] of Object.entries(SCEN)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    const frames = await run(P, sc);
    const log = frames.map(({ png, ...f }) => ({ ...f, ms: f.ms }));
    const states = []; for (const f of log) if (states[states.length - 1] !== f.state) states.push(f.state);
    const events = states.filter((s0) => s0 === "BUDDING").length;
    results.scenarios[name] = { title: sc.title, frames: log.length, stateSequence: states, eventsDuringRun: events };
    // strip: every attached frame, then every 3rd frame (every 2nd for the sweep)
    const pick = frames.filter((f, i) => ATTACHED.has(f.state) || i % (name === "sweep" ? 2 : 3) === 0);
    keep(`${name}-strip.png`, await labelledSheet(B, { title: sc.title, note: "Timestamped frames of the composited page (headless Edge, DPR 2, 120 Hz scripted input, difference mask over the white lab panel). Every attached frame is shown; after that every third frame.", rows: pick.map((f) => ({ label: label(f), cells: [f.png] })) }));
    if (gif(frames, join(OUT, `${name}-slow4x.gif`), 30)) results.files.push(`${name}-slow4x.gif`); // 8.3 ms frames shown 30 ms: about 3.6x slower
    if (gif(frames.filter((f, i) => i % 2 === 0), join(OUT, `${name}-realtime.gif`), 20)) results.files.push(`${name}-realtime.gif`); // 16.7 ms steps at 20 ms
    if (name === "flick") { // key stills of the lifecycle
      const find = (fn) => frames.find(fn) || null, bud = frames.filter((f) => f.state === "BUDDING"), neck = frames.filter((f) => f.state === "NECKING");
      const free = frames.filter((f) => f.state === "FREE"), fade = frames.filter((f) => f.state === "FADING");
      const stills = [["00-baseline", frames[0]], ["01-initial-bud", bud[Math.floor(bud.length / 2)]], ["02-visible-neck", neck[Math.floor(neck.length * 0.35)]],
        ["03-narrowing-neck", neck[neck.length - 1]], ["04-pinch-off", find((f) => f.state === "DETACHING")], ["05-detached-bead", free[1]], ["06-bead-moving-independently", free[Math.floor(free.length / 2)]],
        ["07-bead-shrinking", fade[Math.floor(fade.length / 3)]], ["08-final-fade", fade[fade.length - 2]], ["09-gone", find((f, i) => i > 0 && f.state === "IDLE" && frames[i - 1].state === "FADING")]];
      for (const [n, f] of stills) if (f) keep(`still-${n}.png`, f.png);
      results.stills = stills.map(([n, f]) => ({ file: `still-${n}.png`, ms: f ? f.ms : null, state: f ? f.state : null }));
    }
    if (name === "flick") results.flickFrames = log;
  }
  // Revised neck ("neck too fast"): the lifecycle stages of the balanced neck, and the same flick with every snapshot.
  // Crops follow the body (it is the same body in every snapshot), native DPR 2 pixels; widths from the rendered mask.
  if (!ONLY.length || ONLY.includes("neck")) {
    const crop = (st) => [Math.round(st.bodyX) - 150, Math.round(st.bodyY) - 55, 210, 110];
    const neckRun = async (key, framesAfter = 30) => {
      await P.ev(`(() => { const sel = document.querySelector('#drop-preset'); sel.value = ${JSON.stringify(key)}; sel.dispatchEvent(new Event("change")); return 1; })()`);
      await P.ev("liquidCursorLab.engine.resetBody(), 1");
      const n = await P.ev(`(() => { const p = __lc.points(${JSON.stringify(SCEN.flick.path)}, 600, 870); __lc.ready(p.start[0], p.start[1]); return __lc.seq(p.pts.concat(Array(40).fill(null))); })()`);
      const out = []; let t0 = NaN, after = 0;
      for (let i = 0; i < n; i++) {
        const st = await P.ev("(() => { const s = __lc.step(), nk = s.state === 'IDLE' ? null : __lc.neck(); s.neckPx = nk ? (nk.broken ? 0 : nk.width / liquidCursorLab.engine.state.effDpr) : null; s.pieces = s.state === 'IDLE' ? 0 : __lc.components(); return s; })()");
        if (st.state === "BUDDING" && !Number.isFinite(t0)) t0 = st.i * 1000 / 120;
        const keepIt = Number.isFinite(t0) || out.length === 0 || st.state === "IDLE";
        await P.frames(2);
        const f = { ...st, ms: Number.isFinite(t0) ? +(st.i * 1000 / 120 - t0).toFixed(1) : -FRAME_MS, png: keepIt ? Buffer.from(await P.shot(...crop(st)), "base64") : null };
        if (!Number.isFinite(t0)) out[0] = f; else out.push(f); // keep the last frame before the bud, then everything after it
        if (Number.isFinite(t0) && ++after >= framesAfter) break;
      }
      return out;
    };
    const FRAME_MS = 1000 / 120, lab = (f) => `${f.ms >= 0 ? "+" : ""}${f.ms.toFixed(0)} ms · ${f.state}${f.neckPx === null ? "" : f.neckPx > 0 ? ` · neck ${f.neckPx.toFixed(1)} px` : ` · ${f.pieces} pieces`}`;
    const runs = {};
    for (const k of ["balanced", "shortNeck", "balancedOriginal", "longNeck"]) runs[k] = await neckRun(k, 34);
    await P.ev(`(() => { const sel = document.querySelector('#drop-preset'); sel.value = "balanced"; sel.dispatchEvent(new Event("change")); return 1; })()`);
    const bal = runs.balanced, nk = bal.filter((f) => f.state === "NECKING"), conn = (f) => f.neckPx > 0;
    const pickW = (lo, hi) => nk.find((f) => f.neckPx < hi && f.neckPx >= lo) || null;
    const stages = [["1 · body before the bud", bal[0]], ["2 · bud", bal.filter((f) => f.state === "BUDDING")[1] || bal[1]],
      ["3 · early neck", nk[1]], ["4 · middle neck", pickW(6, 9)], ["5 · thin neck", pickW(4, 6)], ["6 · very thin neck", nk.filter(conn).pop()],
      ["7 · pinch (release frame)", bal.find((f) => f.state === "DETACHING")], ["8 · detached bead", bal.filter((f) => f.state === "FREE")[0]]];
    keep("neck-stages.png", await labelledSheet(B, { title: "Revised balanced neck: the eight stages of one natural event",
      note: "Violent flick (0 → 3200 px/s in 25 ms), 120 Hz frames, headless Edge at DPR 2, native pixels, crop following the body. Times from the first budding frame; widths are the narrowest connected cross-section of the rendered mask (CSS px).",
      rows: stages.filter(([, f]) => f).map(([n, f]) => ({ label: `${n} · ${lab(f)}`, cells: [f.png] })) }));
    const cols = ["shortNeck", "balancedOriginal", "balanced", "longNeck"], names = { shortNeck: "Short neck", balancedOriginal: "Balanced · first version", balanced: "Balanced · revised", longNeck: "Long neck" };
    const rowsAt = [-1, 0, 2, 4, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 25, 28];
    keep("neck-compare.png", await labelledSheet(B, { title: "Same flick, same timeline: short neck · first-version balanced · revised balanced · long neck",
      note: "One identical scripted flick per column (the trigger fires on the same frame in all four). Rows are 120 Hz frames counted from the first budding frame. DPR 2, native pixels, crop following the body.",
      columns: cols.map((k) => names[k]), rows: rowsAt.map((j) => ({ label: `${j < 0 ? "before" : `+${(j * FRAME_MS).toFixed(0)} ms`}`, cells: cols.map((k) => (runs[k][j + 1] || runs[k][runs[k].length - 1]).png) })) }));
    results.neck = {};
    for (const k of cols) {
      const r = runs[k], att = r.filter((f) => ["BUDDING", "NECKING", "DETACHING"].includes(f.state)), c = r.filter((f) => f.ms >= 0 && conn(f) && f.pieces === 1);
      const nck = r.filter((f) => f.state === "NECKING"), under = (v) => +(nck.filter((f) => f.neckPx < v).length * FRAME_MS).toFixed(1);
      results.neck[k] = { attachedMs: +(att.length * FRAME_MS).toFixed(1), connectedMs: +(c.length * FRAME_MS).toFixed(1), under8Ms: under(8), under6Ms: under(6), under4Ms: under(4),
        minConnectedPx: +Math.min(...nck.map((f) => f.neckPx)).toFixed(2), widths: r.map((f) => ({ ms: f.ms, state: f.state, neckPx: f.neckPx, pieces: f.pieces })) };
    }
    if (gif(bal.filter((f) => f.png), join(OUT, "neck-balanced-slow.gif"), 60)) results.files.push("neck-balanced-slow.gif"); // 8.3 ms frames shown 60 ms: about 7x slower
  }
  // approved body alone (Mode A) vs the same body with the droplet (Mode B), same trajectory and times
  if (!ONLY.length || ONLY.includes("compare")) {
    const at = [42, 83, 117, 133, 175, 250, 350, 470], cols = {};
    for (const mode of ["A", "B"]) {
      const Q = mode === "B" ? P : await page(B, "A", 2);
      const frames = await run(Q, SCEN.flick);
      cols[mode] = at.map((ms) => (frames.find((f) => f.ms >= ms) || frames[frames.length - 1]).png);
      if (mode === "A") await Q.close();
    }
    keep("baseline-vs-hybrid.png", await labelledSheet(B, { title: "The approved body alone vs the same body with the single-droplet experiment",
      note: "Identical scripted flick (0 → 3200 px/s in 25 ms). Left: Mode A, the approved Santioni refined body alone. Right: Mode B, the same body with the Phase 3 droplet. DPR 2, native pixels.",
      columns: ["Mode A · approved body alone", "Mode B · with the droplet"], rows: at.map((ms, i) => ({ label: `${ms} ms`, cells: [cols.A[i], cols.B[i]] })) }));
  }
  // inversion over real content: a flick across the dark panel and one across the paper text (DPR 2)
  if (!ONLY.length || ONLY.includes("surfaces")) {
    for (const [name, sc] of [["dark", { title: "Over the dark panel", region: [557, 360, 401, 128], path: [{ dx: 1, dy: 0, v: 3200, ms: 110, ramp: 25 }], to: [930, 424], hold: 420 }],
      ["paper", { title: "Over the paper text", region: [33, 290, 500, 130], path: [{ dx: 1, dy: 0, v: 3200, ms: 110, ramp: 25 }], to: [500, 340], hold: 420 }]]) {
      const frames = await run(P, sc);
      const pick = frames.filter((f) => ATTACHED.has(f.state) || f.state === "FREE").filter((f, i) => i % 2 === 0).slice(0, 10);
      keep(`surface-${name}.png`, await labelledSheet(B, { title: `Difference inversion ${sc.title.toLowerCase()}: attached neck and free bead`, rows: pick.map((f) => ({ label: label(f), cells: [f.png] })) }));
    }
  }
  // Mode C: instrumentation during the neck and during free flight
  if (!ONLY.length || ONLY.includes("debug")) {
    await P.ev("document.querySelector('input[name=mode][value=C]').click(), __lc.begin(), 1");
    await P.ev("liquidCursorLab.engine.resetBody(), 1");
    const n = await P.ev(`(() => { const p = __lc.points(${JSON.stringify(SCEN.flick.path)}, ${SCEN.flick.to}); __lc.ready(p.start[0], p.start[1]); return __lc.seq(p.pts.concat(Array(40).fill(null))); })()`);
    let shotNeck = false, shotFree = false;
    for (let i = 0; i < n && !(shotNeck && shotFree); i++) {
      const st = await P.ev("__lc.step()");
      if (!shotNeck && st.state === "NECKING" && st.t > 20) { await P.frames(2); await sleep(260); keep("debug-neck-fullpage.png", Buffer.from(await P.shot(0, 0, 1920, 1080), "base64")); keep("debug-neck-crop.png", Buffer.from(await P.shot(Math.round(st.bodyX) - 170, Math.round(st.bodyY) - 70, 340, 140), "base64")); shotNeck = true; }
      if (!shotFree && st.state === "FREE" && st.age > 90) { await P.frames(2); await sleep(260); keep("debug-free-fullpage.png", Buffer.from(await P.shot(0, 0, 1920, 1080), "base64")); shotFree = true; }
    }
  }
  results.console = P.logs;
  await P.close();
} finally { await B.close(); }
writeFileSync(join(OUT, "droplet-evidence.json"), JSON.stringify(results, null, 1) + "\n");
for (const [n, s] of Object.entries(results.scenarios)) console.log(`${n.padEnd(10)} ${s.frames} frames · ${s.stateSequence.join(" → ")}`);
console.log(`files: ${results.files.length} · console: ${results.console.length ? results.console.join(" | ") : "clean"} · output ${OUT}`);
