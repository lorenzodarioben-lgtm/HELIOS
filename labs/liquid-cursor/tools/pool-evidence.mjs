// Liquid cursor lab, Phase 4: visual evidence of the droplet pool (the real WebGL output of the composited page, never
// mockups). Frame-exact 120 Hz scripted trajectories (tools/silhouette.mjs) and the lab's real manual controls.
//
//   node labs/liquid-cursor/tools/pool-evidence.mjs [--out DIR] [--evidence] [--http URL] [--only name,name]
//
// --evidence writes into labs/liquid-cursor/evidence/phase4/ (Phase 1-3 evidence is never rewritten). GIF clips need
// Python with Pillow (skipped otherwise). Mode B pages, default pool unless a scenario says otherwise.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openPage, labelledSheet, decodePNG } from "./cdp.mjs";
import { installHelpers } from "./silhouette.mjs";

const LAB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = argv.includes("--evidence") ? join(LAB, "evidence", "phase4") : opt("--out", mkdtempSync(join(tmpdir(), "lc-pool-")));
const HTTP = opt("--http", "http://127.0.0.1:8315/labs/liquid-cursor/");
const ONLY = (opt("--only", "") || "").split(",").filter(Boolean), want = (n) => !ONLY.length || ONLY.includes(n);
mkdirSync(OUT, { recursive: true });
const FRAME = 1000 / 120;

// Gestures over the top surfaces row of Mode B (paper 32-533, dark 557-958, swatches 982-1303, image 1327-1888; y 276-606:
// nothing interactive or ignored). `to` is where the path ends.
const zig = (n, legMs, v, dy, ramp = 30) => Array.from({ length: n }, (_, i) => ({ dx: i % 2 ? -1 : 1, dy: (i < n / 2 ? 1 : -1) * dy, v, ms: legMs, ramp: i === 0 ? ramp : 0 }));
const G = {
  flick: { label: "violent flick (0 → 3200 px/s in 25 ms)", path: [{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], to: [1000, 440], hold: 700 },
  extremeFlick: { label: "extreme flick (0 → 5200 px/s in 16 ms)", path: [{ dx: 1, dy: 0, v: 5200, ms: 160, ramp: 16 }], to: [1150, 440], hold: 700 },
  turn: { label: "sharp turn at 2200 px/s (right, then up)", path: [{ dx: 1, dy: 0, v: 2200, ms: 220, ramp: 120 }, { dx: 0, dy: -1, v: 2200, ms: 120 }], to: [1000, 300], hold: 700 },
  reversal: { label: "fast reversal at 2000 px/s", path: [{ dx: 1, dy: 0, v: 2000, ms: 220, ramp: 120 }, { dx: -1, dy: 0, v: 2000, ms: 150 }], to: [760, 440], hold: 700 },
  scribble: { label: "back-and-forth scribble: 8 legs of 170 ms at 3000 px/s (the body sweeps back over its own beads)", path: zig(8, 170, 3000, 0.12), to: [700, 330], hold: 900 },
  wscribble: { label: "compound W scribble: 6 legs of 130 ms at 3000 px/s with 77° turns, moving on", path: Array.from({ length: 6 }, (_, i) => ({ dx: 0.78, dy: i % 2 ? -0.62 : 0.62, v: 3000, ms: 130, ramp: i === 0 ? 30 : 0 })), to: [1660, 320], hold: 900 },
  sweep: { label: "smooth fast sweep (0 → 2600 px/s over 120 ms): no droplet", path: [{ dx: 1, dy: 0, v: 2600, ms: 300, ramp: 120 }], to: [1100, 440], hold: 300 },
  catch: { label: "flick, dead stop, then the body goes back over its bead", path: [{ dx: 1, dy: 0, v: 3200, ms: 117, ramp: 25 }, { dx: 0, dy: 0, v: 0, ms: 260 }, { dx: -1, dy: 0, v: 700, ms: 360, ramp: 60 }], to: [700, 440], hold: 400 },
};
const regions = { wscribble: [80, 280, 1700, 330], flick: [300, 300, 860, 290], extremeFlick: [300, 300, 900, 290], turn: [380, 280, 740, 330], reversal: [360, 300, 760, 290], scribble: [560, 280, 760, 330], sweep: [440, 300, 760, 290], catch: [300, 300, 640, 290] };

async function page(B, pool, { dpr = 1, mode = "B", cap = "" } = {}) {
  const P = await openPage(B, `${HTTP}?mode=${mode}&pool=${pool}${cap ? `&cap=${cap}` : ""}`, { dpr });
  await P.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
  return P;
}
// run one gesture frame by frame; capture `region` (or a crop around the body) every `every` frames, and every frame
// with 2+ live beads when `keepBusy`; returns the frames with the pool's state
async function run(P, g, { region, every = 1, maxFrames = 400, manual = null } = {}) {
  await P.ev("liquidCursorLab.engine.clearDroplets(), liquidCursorLab.engine.resetBody(), 1");
  const n = manual ? await P.ev(`(__lc.ready(${manual.at}), __lc.seq(Array(${Math.round(manual.hold / FRAME)}).fill(null)))`)
    : await P.ev(`(() => { const p = __lc.points(${JSON.stringify(g.path)}, ${g.to}); __lc.ready(p.start[0], p.start[1]); return __lc.seq(p.pts.concat(Array(${Math.round(g.hold / FRAME)}).fill(null))); })()`);
  const frames = [];
  for (let i = 0; i < Math.min(n, maxFrames); i++) {
    if (manual && manual.sheds) for (const s of manual.sheds.filter((x) => x.frame === i)) await P.ev(`liquidCursorLab.engine.triggerDroplet(${JSON.stringify(s.opts)})`);
    const st = await P.ev("(() => { const s = __lc.step(); s.pool = __lc.pool(); return s; })()");
    if (i % every === 0 || i === n - 1) { await P.frames(2); st.png = Buffer.from(await P.shot(...region), "base64"); }
    st.ms = +(i * FRAME).toFixed(1); frames.push(st);
  }
  return frames;
}
const lab = (f) => `${f.ms.toFixed(0)} ms · ${f.live} live${f.attached ? " (1 neck)" : ""}${f.pool.length ? " · " + f.pool.map((s) => `${s.kind[0]}${s.r.toFixed(1)}${s.state === "FADING" ? "↓" : ""}`).join(" ") : ""}`;
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
const stats = (frames) => { const ids = new Map(); let peak = 0, sum = 0, att = 0; for (const f of frames) { peak = Math.max(peak, f.live); sum += f.live; att = Math.max(att, f.attached); for (const s of f.pool) if (!ids.has(s.id)) ids.set(s.id, { kind: s.kind, r0: +s.r0.toFixed(2), cause: s.cause, startMs: f.ms }); }
  return { events: [...ids.values()], peakLive: peak, meanLive: +(sum / frames.length).toFixed(3), maxAttached: att }; };

const results = { when: new Date().toISOString(), scenarios: {}, files: [] };
const keep = (name, buf) => { writeFileSync(join(OUT, name), buf); results.files.push(name); };
const B = await launch();
results.browser = B.version;
const logs = [];
try {
  // 1. the approved Phase 3 droplet against the default pool, same flick (DPR 2): identical pixels frame by frame
  if (want("equivalence")) {
    const cols = {}, diffs = [];
    for (const pool of ["single", "balanced"]) { const P = await page(B, pool, { dpr: 2 }); cols[pool] = await run(P, G.flick, { region: [560, 360, 300, 160] }); logs.push(...P.logs); await P.close(); }
    for (let i = 0; i < cols.single.length; i++) { const a = decodePNG(cols.single[i].png.toString("base64")), b = decodePNG(cols.balanced[i].png.toString("base64")); let d = 0; for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const p = a.px(x, y), q = b.px(x, y); if (p[0] !== q[0] || p[1] !== q[1] || p[2] !== q[2]) d++; } diffs.push(d); }
    results.scenarios.equivalence = { frames: diffs.length, differingPixelsPerFrame: diffs, totalDiffering: diffs.reduce((x, y) => x + y, 0), single: stats(cols.single), pool: stats(cols.balanced) };
    const pick = cols.single.map((f, i) => i).filter((i) => i >= 4 && i <= 40 && i % 3 === 0);
    keep("01-single-equivalence.png", await labelledSheet(B, { title: "Approved Phase 3 droplet vs the Phase 4 default pool: the same violent flick",
      note: `Left: the "Phase 3 approved · one droplet" snapshot (capacity 1). Right: the default pool (capacity ${3}). Same scripted 120 Hz flick, DPR 2, native pixels. Differing pixels per frame are listed; one event never uses the pool, so they must all be 0.`,
      columns: ["Phase 3 approved (single)", "Phase 4 default pool"], rows: pick.map((i) => ({ label: `${lab(cols.single[i])} · ${diffs[i]} px differ`, cells: [cols.single[i].png, cols.balanced[i].png] })) }));
  }
  // 2-6, 17: the gestures in the default pool (DPR 1 strips); the scribble also as GIFs
  const P = await page(B, "balanced");
  for (const [name, file, every] of [["flick", "02-strong-flick", 3], ["extremeFlick", "03-extreme-flick", 3], ["turn", "04-sharp-turn", 3], ["reversal", "05-reversal", 3], ["wscribble", "06-compound-scribble", 5], ["scribble", "06b-back-and-forth-scribble", 3], ["sweep", "17-smooth-sweep-no-droplet", 3], ["catch", "11-body-catches-bead", 3]]) {
    if (!want(name)) continue;
    const frames = await run(P, G[name], { region: regions[name], every: 1 });
    results.scenarios[name] = { label: G[name].label, ...stats(frames) };
    const pick = frames.filter((f, i) => f.png && i % every === 0 && f.ms <= (name.includes("scribble") ? 1500 : 760)).slice(0, name === "wscribble" ? 18 : 40);
    keep(`${file}.png`, await labelledSheet(B, { title: `Default pool · ${G[name].label}`, note: "Composited page (headless Edge, DPR 1, 120 Hz scripted input, difference mask over the lab surfaces). Labels: live beads (p primary, f follow-up, s satellite, then radius in px; ↓ fading).", rows: pick.map((f) => ({ label: lab(f), cells: [f.png] })) }));
    if (name === "wscribble") {
      if (gif(frames, join(OUT, "06-compound-scribble-slow.gif"), 40)) results.files.push("06-compound-scribble-slow.gif");
      if (gif(frames.filter((f, i) => i % 2 === 0), join(OUT, "06-compound-scribble-realtime.gif"), 17)) results.files.push("06-compound-scribble-realtime.gif");
      const two = frames.find((f) => f.live === 2 && !f.attached);
      results.scenarios.wscribble.stills = { two: two ? two.ms : null };
    }
  }
  // 12: two free beads overlap and coalesce (manual: a slow bead, then a fast one along the same line)
  if (want("coalesce")) {
    const frames = await run(P, null, { region: [960, 380, 260, 120], manual: { at: [1180, 440], hold: 520, sheds: [{ frame: 0, opts: { angleDeg: 180, speed: 220 } }, { frame: 18, opts: { angleDeg: 182, speed: 700 } }] } });
    results.scenarios.coalesce = { ...stats(frames), merges: await P.ev("liquidCursorLab.engine.state.drop.merges") };
    keep("12-bead-bead-coalescence.png", await labelledSheet(B, { title: "Two free beads meet: the smaller flows into the larger (deterministic, no bounce)", note: "Manual lab sheds from a still body: a slow bead, then 150 ms later a faster one along nearly the same line. DPR 1.", rows: frames.filter((f, i) => i >= 16 && i <= 60 && i % 2 === 0).map((f) => ({ label: lab(f), cells: [f.png] })) }));
  }
  // 10: pool full (capacity 3): three beads, a fourth shed is refused; nothing is recycled
  if (want("full")) {
    const frames = await run(P, null, { region: [1060, 330, 300, 220], manual: { at: [1220, 440], hold: 420, sheds: [0, 17, 34, 51, 68].map((frame, k) => ({ frame, opts: { angleDeg: [180, 120, -120, 150, -150][k], speed: 380 } })) } });
    const st = stats(frames);
    results.scenarios.full = { ...st, started: st.events.length, attemptedSheds: 5 };
    keep("10-pool-full-suppression.png", await labelledSheet(B, { title: "Pool full (capacity 3): the extra sheds are refused; no live bead is recycled or moved", note: `Five manual sheds, one every 17 frames (142 ms): ${st.events.length} started, the pool never exceeded ${st.peakLive}. DPR 1.`, rows: frames.filter((f, i) => i % 8 === 0).map((f) => ({ label: lab(f), cells: [f.png] })) }));
  }
  // 13: beads at the window edge (body near the right edge, sheds toward and along it)
  if (want("edge")) {
    const frames = await run(P, null, { region: [1700, 280, 220, 300], manual: { at: [1880, 440], hold: 320, sheds: [{ frame: 0, opts: { angleDeg: 0, speed: 300 } }, { frame: 17, opts: { angleDeg: -60, speed: 420 } }, { frame: 34, opts: { angleDeg: 60, speed: 420 } }] } });
    results.scenarios.edge = stats(frames);
    const best = frames.reduce((a, f) => (f.live > a.live ? f : a), frames[0]);
    keep("13-window-edge.png", await labelledSheet(B, { title: "Beads at the right window edge: drawn wherever they are (tiles follow them; only the viewport clips)", note: "The body sits 40 px from the right edge of a 1920 px window; three sheds. DPR 1.", rows: [frames[20], best, frames[Math.min(frames.length - 1, 70)]].map((f) => ({ label: lab(f), cells: [f.png] })) }));
  }
  results.console = [...logs, ...P.logs];
  await P.close();
  // 7, 8 and the satellite: DPR 2 close-ups (native pixels) around the live beads
  if (want("closeups")) {
    const Q = await page(B, "balanced", { dpr: 2 });
    const around = async (pool, w = 360, h = 220) => { const xs = pool.map((s) => s.x), ys = pool.map((s) => s.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      await Q.frames(2); return Buffer.from(await Q.shot(Math.round(cx - w / 2), Math.round(cy - h / 2), w, h), "base64"); };
    // two live from the natural W scribble (a primary and a smaller follow-up)
    let fr = await run(Q, G.wscribble, { region: [0, 0, 8, 8], every: 1000 });
    const i2 = fr.findIndex((f) => f.live === 2 && !f.attached);
    if (i2 >= 0) { // the two beads are far apart (left at different turns): one native-resolution cell around each
      await run(Q, G.wscribble, { region: [0, 0, 8, 8], every: 1000, maxFrames: i2 + 1 });
      const [a, b] = fr[i2].pool, cells = [await around([a], 240, 160), await around([b], 240, 160)];
      keep("07-pool-two-active.png", await labelledSheet(B, { title: "Two live beads from one compound gesture (default pool, natural emission)", note: `W scribble, DPR 2, native pixels, one crop around each bead: ${Math.hypot(a.x - b.x, a.y - b.y).toFixed(0)} px apart, left at different turns, different sizes and ages. ${lab(fr[i2])}.`,
        columns: [`${a.kind} · r ${a.r.toFixed(1)} px · α ${a.alpha.toFixed(2)} · ${a.state}`, `${b.kind} · r ${b.r.toFixed(1)} px · α ${b.alpha.toFixed(2)} · ${b.state}`], rows: [{ label: lab(fr[i2]), cells }] })); }
    // three live (capacity 3): manual sheds a few frames apart
    fr = await run(Q, null, { region: [0, 0, 8, 8], every: 1000, manual: { at: [1220, 440], hold: 700, sheds: [{ frame: 0, opts: { angleDeg: 200, speed: 380 } }, { frame: 17, opts: { angleDeg: 120, speed: 300, strength: 0.2 } }, { frame: 34, opts: { angleDeg: -60, speed: 460, strength: 0.8 } }] } });
    const i3 = fr.findIndex((f) => f.live === 3 && !f.attached);
    if (i3 >= 0) { await run(Q, null, { region: [0, 0, 8, 8], every: 1000, maxFrames: i3 + 1, manual: { at: [1220, 440], hold: 700, sheds: [{ frame: 0, opts: { angleDeg: 200, speed: 380 } }, { frame: 17, opts: { angleDeg: 120, speed: 300, strength: 0.2 } }, { frame: 34, opts: { angleDeg: -60, speed: 460, strength: 0.8 } }] } });
      keep("08-pool-three-active.png", await labelledSheet(B, { title: "Three live beads: the default capacity, full (manual lab sheds; naturally this is rare, about 1.4% of the time even in relentless scribbling)", note: `DPR 2, native pixels, crop around the beads and the body. ${lab(fr[i3])}.`, rows: [{ label: lab(fr[i3]), cells: [await around([...fr[i3].pool, { x: 1220, y: 440 }], 400, 260)] }] })); }
    // the extreme flick's satellite, frame by frame at DPR 2 around the body
    fr = await run(Q, G.extremeFlick, { region: [0, 0, 8, 8], every: 1000 });
    const sat0 = fr.findIndex((f) => f.pool.some((s) => s.kind === "satellite")), rows = [];
    if (sat0 >= 0) for (let k = sat0 - 2; k < Math.min(fr.length, sat0 + 34); k += 3) { await run(Q, G.extremeFlick, { region: [0, 0, 8, 8], every: 1000, maxFrames: k + 1 }); const st = await Q.ev("[liquidCursorLab.engine.state.renderX, liquidCursorLab.engine.state.renderY]"); await Q.frames(2); rows.push({ label: lab(fr[k]), cells: [Buffer.from(await Q.shot(Math.round(st[0]) - 150, Math.round(st[1]) - 70, 260, 140), "base64")] }); }
    if (rows.length) keep("03b-extreme-flick-satellite-dpr2.png", await labelledSheet(B, { title: "The residual satellite of an extreme flick, frame by frame (every 3rd 120 Hz frame)", note: "Default pool, DPR 2, native pixels, crop following the body. The primary has already left (to the left, out of this crop); a smaller bud pinches off the same spot a little to one side and drifts away.", rows }));
    results.console.push(...Q.logs); await Q.close();
  }
  // 14, 15: inversion over paper text and over the dark panel (the same scribble, moved)
  if (want("surfaces")) {
    const Q = await page(B, "balanced", { dpr: 2 });
    for (const [name, to, region] of [["paper", [90, 330], [40, 290, 480, 300]], ["dark", [600, 330], [560, 290, 400, 300]]]) {
      const g = { ...G.scribble, path: zig(6, 130, 2600, 0.12), to };
      const frames = await run(Q, g, { region, every: 1 });
      const picks = frames.filter((f) => f.live >= 1 && !f.attached).filter((f, i) => i % 6 === 0).slice(0, 6);
      keep(`${name === "paper" ? "14" : "15"}-inversion-${name}.png`, await labelledSheet(B, { title: `Difference inversion over the ${name === "paper" ? "paper text" : "dark panel"}: body and beads are one material`, note: "Compound scribble, DPR 2, native pixels. No new colour, outline, shadow or glow.", rows: picks.map((f) => ({ label: lab(f), cells: [f.png] })) }));
    }
    results.console.push(...Q.logs); await Q.close();
  }
  // 9: capacity diagnostic, busy pool (capacity 5) through the same scribble
  // 38: the comparison: Phase 3 approved · default pool, strong flick · default pool, extreme flick · busy diagnostic, scribble
  if (want("compare")) {
    const runs = {};
    for (const [key, pool, g] of [["phase3", "single", "wscribble"], ["sparse", "sparse", "wscribble"], ["balanced", "balanced", "wscribble"], ["rich", "rich", "wscribble"], ["busy", "busy", "wscribble"],
      ["p3flick", "single", "flick"], ["strong", "balanced", "flick"], ["extreme", "balanced", "extremeFlick"]]) {
      const Q = await page(B, pool); runs[key] = await run(Q, G[g], { region: regions[g], every: 1 }); results.console.push(...Q.logs); await Q.close();
      results.scenarios[`compare-${key}`] = { pool, gesture: g, ...stats(runs[key]) };
    }
    const sc = ["phase3", "sparse", "balanced", "rich", "busy"], names = { phase3: "Phase 3 approved (1)", sparse: "Pool · sparse", balanced: "Pool · balanced (default)", rich: "Pool · rich (4)", busy: "Pool · busy diagnostic (5)" };
    keep("38-comparison-scribble.png", await labelledSheet(B, { title: "The same compound scribble through every pool snapshot",
      note: "Identical 120 Hz scripted gesture (the W scribble: 6 legs of 130 ms at 3000 px/s with 77° turns), identical backdrop, DPR 1. Rows: from the approved Phase 3 single droplet down to the busy failure boundary; columns: frame time.",
      rows: sc.flatMap((k) => [48, 84, 120].map((j) => ({ label: `${names[k]} · ${lab(runs[k][j] || runs[k][runs[k].length - 1])}`, cells: [(runs[k][j] || runs[k][runs[k].length - 1]).png] }))) }));
    const busyBest = runs.busy.reduce((a, f) => (f.live > a.live ? f : a), runs.busy[0]);
    keep("09-capacity-diagnostic-busy.png", await labelledSheet(B, { title: `Busy diagnostic (capacity 5): the failure boundary, at its fullest (${busyBest.live} live)`, note: "The same scribble as 06 with the busy snapshot: every gate relaxed. This is what the default must not look like.", rows: [{ label: lab(busyBest), cells: [busyBest.png] }] }));
    const at2 = [4, 10, 16, 22, 28, 34, 40, 50, 60, 70, 80];
    keep("38-comparison-gestures.png", await labelledSheet(B, { title: "Phase 3 approved · Phase 4 default with a strong event · Phase 4 default with an extreme event",
      note: "Columns 1-2: the same violent flick (one droplet either way). Column 3: an extreme flick (one primary, then one residual satellite). The busy diagnostic (upper-bound stress) is the last block of 38-comparison-scribble. DPR 1; rows are frames from the gesture start.",
      columns: ["Phase 3 approved · violent flick", "Phase 4 default · violent flick", "Phase 4 default · extreme flick"],
      rows: at2.map((j) => ({ label: `+${(j * FRAME).toFixed(0)} ms`, cells: [runs.p3flick[j].png, runs.strong[j].png, runs.extreme[j].png] })) }));
    if (gif(runs.busy.filter((f, i) => i % 2 === 0), join(OUT, "09-busy-diagnostic-realtime.gif"), 17)) results.files.push("09-busy-diagnostic-realtime.gif");
  }
  // 16: Mode C diagnostics during a multi-bead moment; 18: hover suppression
  if (want("debug")) {
    const Q = await page(B, "balanced", { mode: "C" });
    const g = G.wscribble;
    await Q.ev("liquidCursorLab.engine.clearDroplets(), liquidCursorLab.engine.resetBody(), 1");
    const n = await Q.ev(`(() => { const p = __lc.points(${JSON.stringify(g.path)}, ${g.to}); __lc.ready(p.start[0], p.start[1]); return __lc.seq(p.pts.concat(Array(60).fill(null))); })()`);
    for (let i = 0; i < n; i++) { const st = await Q.ev("__lc.step()"); if (st.live >= 2 && !st.attached && i > 40) break; }
    await Q.frames(2); await new Promise((r) => setTimeout(r, 450));
    keep("16-mode-c-diagnostics.png", Buffer.from(await Q.shot(0, 0, 1920, 1080), "base64"));
    results.console.push(...Q.logs); await Q.close();
  }
  if (want("hover")) {
    const Q = await page(B, "balanced");
    const [bx, by] = await Q.center("#btn-real");
    // violent back-and-forth over the real button (hovered the whole time) vs the same motion over the paper
    const res = {};
    for (const [k, cx, cy] of [["hover", bx, by], ["paper", 280, 440]]) {
      res[k] = await Q.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop; E.clearDroplets(); E.resetBody(); __lc.ready(${cx - 40}, ${cy}); const e0 = D.events;
        for (let i = 0; i < 96; i++) { const k = i % 6, x = ${cx} + (k < 3 ? -50 + 100 * (k + 1) / 3 : 50 - 100 * (k - 2) / 3); __lc.feed(x, ${cy}); } __lc.hold(400);
        return { events: D.events - e0, hover: !!E.state.interactiveEl }; })()`);
    }
    await Q.ev(`(() => { liquidCursorLab.engine.clearDroplets(); __lc.ready(${bx}, ${by}); return 1; })()`); await Q.frames(3);
    const shot = Buffer.from(await Q.shot(bx - 160, by - 60, 320, 120), "base64");
    results.scenarios.hover = res;
    keep("18-hover-suppression.png", await labelledSheet(B, { title: `Hover suppression: the same violent jitter (±50 px at 4000 px/s, 800 ms) sheds ${res.paper.events} over the paper, ${res.hover.events} over the real button`, note: "Over an interactive target the body enlarges and stabilises and no droplet is ever started (existing beads would simply finish). DPR 1.", rows: [{ label: "hovering the real button, after the jitter", cells: [shot] }] }));
    results.console.push(...Q.logs); await Q.close();
  }
} finally { await B.close(); }
// a partial run (--only) updates the scenarios it ran and keeps the rest of an existing record
if (ONLY.length && existsSync(join(OUT, "pool-evidence.json"))) { const old = JSON.parse(readFileSync(join(OUT, "pool-evidence.json"), "utf8")); results.scenarios = { ...old.scenarios, ...results.scenarios }; results.files = [...new Set([...old.files, ...results.files])]; }
writeFileSync(join(OUT, "pool-evidence.json"), JSON.stringify(results, null, 1) + "\n");
for (const [n, s] of Object.entries(results.scenarios)) console.log(n.padEnd(20), JSON.stringify(Array.isArray(s.events) ? { events: s.events.map((e) => e.kind[0] + e.r0).join(" "), peak: s.peakLive, mean: s.meanLive, maxAttached: s.maxAttached } : s).slice(0, 220));
console.log(`files: ${results.files.length} · console: ${results.console.length ? results.console.join(" | ") : "clean"} · output ${OUT}`);
