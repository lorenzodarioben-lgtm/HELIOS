// Liquid cursor lab, Phase 4.5: visual evidence of rich goo (the real WebGL output of the composited page, never
// mockups). Frame-exact 120 Hz scripted trajectories (tools/silhouette.mjs), the lab's real manual controls, and the
// pure-dynamics measurements (tools/pool-sim.mjs) for the density and trail-detector record.
//
//   node labs/liquid-cursor/tools/rich-evidence.mjs [--out DIR] [--evidence] [--http URL] [--only name,name]
//
// --evidence writes into labs/liquid-cursor/evidence/phase4-rich/ (Phase 1-4 evidence is never rewritten). GIF clips
// need Python with Pillow (skipped otherwise). Mode B pages, "Rich goo · balanced" unless a scenario says otherwise.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openPage, labelledSheet } from "./cdp.mjs";
import { installHelpers } from "./silhouette.mjs";
import { loadLab, simulate, GESTURES, RICH_GESTURES, randomScribble, trailMetrics } from "./pool-sim.mjs";

const LAB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = argv.includes("--evidence") ? join(LAB, "evidence", "phase4-rich") : opt("--out", mkdtempSync(join(tmpdir(), "lc-rich-")));
const HTTP = opt("--http", "http://127.0.0.1:8315/labs/liquid-cursor/");
const ONLY = (opt("--only", "") || "").split(",").filter(Boolean), want = (n) => !ONLY.length || ONLY.includes(n);
mkdirSync(OUT, { recursive: true });
const FRAME = 1000 / 120;
const PRESETS = [["balanced", "A · Phase 4 current (droplets)"], ["richBalanced", "B · Rich goo droplets (previous attempt)"], ["connectedSparse", "C · Connected goo sparse"], ["connectedBalanced", "D · Connected goo balanced (default)"], ["connectedHeavy", "E · Connected goo heavy"], ["connectedBoundary", "F · Too much (boundary diagnostic)"]];

// Gestures over the top surfaces row of Mode B (paper 32-533, dark 557-958, swatches 982-1303, image 1327-1888;
// y 276-606: nothing interactive or ignored). `to` is where the path ends.
const zig = (n, legMs, v, dy, ramp = 30) => Array.from({ length: n }, (_, i) => ({ dx: i % 2 ? -1 : 1, dy: (i < n / 2 ? 1 : -1) * dy, v, ms: legMs, ramp: i === 0 ? ramp : 0 }));
const G = {
  strongFlick: { label: "strong flick (0 → 3200 px/s in 25 ms)", path: [{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], to: [1050, 440], hold: 760, region: [380, 330, 760, 230] },
  extremeWhip: { label: "extreme whip (0 → 4600 px/s in 18 ms, then a hard reversal down-left at 4200 px/s)", path: [{ dx: 1, dy: 0, v: 4600, ms: 150, ramp: 18 }, { dx: -0.95, dy: 0.31, v: 4200, ms: 120 }], to: [900, 470], hold: 760, region: [560, 280, 960, 320] },
  sharpTurn: { label: "sharp turn at 2200 px/s (right, then up)", path: [{ dx: 1, dy: 0, v: 2200, ms: 220, ramp: 120 }, { dx: 0, dy: -1, v: 2200, ms: 120 }], to: [1000, 300], hold: 700, region: [380, 280, 740, 326] },
  reversal: { label: "fast reversal at 2000 px/s", path: [{ dx: 1, dy: 0, v: 2000, ms: 220, ramp: 120 }, { dx: -1, dy: 0, v: 2000, ms: 150 }], to: [760, 440], hold: 700, region: [360, 330, 760, 230] },
  zigzag: { label: "compound zigzag: 8 legs of 170 ms at 3000 px/s back and forth (the body sweeps back over its own pieces)", path: zig(8, 170, 3000, 0.12), to: [700, 330], hold: 900, region: [560, 280, 760, 326] },
  wscribble: { label: "compound W scribble: 6 legs of 130 ms at 3000 px/s with 77° turns, moving on", path: Array.from({ length: 6 }, (_, i) => ({ dx: 0.78, dy: i % 2 ? -0.62 : 0.62, v: 3000, ms: 130, ramp: i === 0 ? 30 : 0 })), to: [1660, 320], hold: 700, region: [80, 280, 1700, 326] },
  sweep: { label: "fast smooth sweep (0 → 2600 px/s over 120 ms)", path: [{ dx: 1, dy: 0, v: 2600, ms: 300, ramp: 120 }], to: [1100, 440], hold: 300, region: [440, 330, 760, 230] },
  catch: { label: "strong flick, dead stop, then the body goes back over its pieces", path: [{ dx: 1, dy: 0, v: 3200, ms: 117, ramp: 25 }, { dx: 0, dy: 0, v: 0, ms: 260 }, { dx: -1, dy: 0, v: 700, ms: 360, ramp: 60 }], to: [700, 440], hold: 400, region: [300, 330, 640, 230] },
};

async function page(B, pool, { dpr = 1, mode = "B" } = {}) {
  const P = await openPage(B, `${HTTP}?mode=${mode}&pool=${pool}`, { dpr });
  await P.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
  return P;
}
const POOLSTATE = `liquidCursorLab.engine.state.drop.slots.filter((s) => s.state !== "IDLE").map((s) => ({ slot: s.slot, id: s.id, kind: s.kind, cls: LiquidDroplet.classOf(s.kind), state: s.state, src: s.src,
  x: s.x, y: s.y, r: s.r, r0: s.r0, alpha: s.alpha, connected: s.connected, k: s.k, gap: s.gap, kc: s.kc, absorbed: s.absorbed, age: s.age }))`;
// run one gesture (or a manual scenario) frame by frame; capture `region` every `every` frames (or `pick(frame)`)
async function run(P, g, { region, every = 1, maxFrames = 400, manual = null, pick = null, crop = null } = {}) {
  await P.ev("liquidCursorLab.engine.clearDroplets(), liquidCursorLab.engine.resetBody(), 1");
  const n = manual ? await P.ev(`(__lc.ready(${manual.at}), __lc.seq(Array(${Math.round(manual.hold / FRAME)}).fill(null)))`)
    : await P.ev(`(() => { const p = __lc.points(${JSON.stringify(g.path)}, ${g.to}); __lc.ready(p.start[0], p.start[1]); return __lc.seq(p.pts.concat(Array(${Math.round(g.hold / FRAME)}).fill(null))); })()`);
  const frames = [];
  for (let i = 0; i < Math.min(n, maxFrames); i++) {
    if (manual && manual.sheds) for (const s of manual.sheds.filter((x) => x.frame === i)) await P.ev(`liquidCursorLab.engine.triggerDroplet(${JSON.stringify(s.opts)})`);
    const st = await P.ev(`(() => { const s = __lc.step(), W = liquidCursorLab.engine.state.drop.wake; s.pool = ${POOLSTATE}; s.taper = liquidCursorLab.engine.state.drop.tp;
      s.wake = { state: W.state, len: W.len, rb: W.r[4], neck: W.neck, pts: Array.from(W.x).map((x, i) => [x, W.y[i]]) }; return s; })()`);
    st.ms = +(i * FRAME).toFixed(1);
    const take = pick ? pick(st, i) : i % every === 0 || i === n - 1;
    if (take) { await P.frames(2); const rg = crop ? crop(st) : region; st.png = Buffer.from(await P.shot(...rg), "base64"); st.region = rg; }
    frames.push(st);
  }
  return frames;
}
const C = ["P", "S", "M"];
const lab = (f) => `${f.ms.toFixed(0)} ms${f.wake && f.wake.state !== "IDLE" ? ` · tail ${f.wake.state.toLowerCase()} ${f.wake.len.toFixed(0)} px${f.wake.rb > 0 ? `, bulb ${f.wake.rb.toFixed(1)}` : ""}` : ""} · ${f.live} free${f.attached ? ` (${f.attached} neck${f.attached > 1 ? "s" : ""})` : ""}${f.pool.length ? " · " + f.pool.map((s) => `${s.kind === "bulb" ? "B" : s.kind === "splash" ? "s" : C[s.cls]}${s.r.toFixed(1)}${s.state === "FADING" ? "↓" : ["BUDDING", "NECKING", "DETACHING"].includes(s.state) ? "~" : ""}`).join(" ") : ""}`;
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
const stats = (frames) => { const ids = new Map(); let peak = 0, sum = 0, att = 0, taper = 0; for (const f of frames) { peak = Math.max(peak, f.live); sum += f.live; att = Math.max(att, f.attached); taper = Math.max(taper, f.taper || 0); for (const s of f.pool) if (!ids.has(s.id)) ids.set(s.id, { kind: s.kind, cls: C[s.cls], r0: +s.r0.toFixed(2), src: s.src, startMs: f.ms }); }
  return { pieces: [...ids.values()], peakLive: peak, meanLive: +(sum / frames.length).toFixed(3), maxAttached: att, taperMax: +taper.toFixed(4) }; };
// a crop around the body and every live piece (DPR 2 close-ups), at least w x h CSS px
const around = (w, h) => (f) => { const tp = f.wake && f.wake.state !== "IDLE" ? f.wake.pts : [], xs = [f.bodyX, ...f.pool.map((s) => s.x), ...tp.map((p) => p[0])], ys = [f.bodyY, ...f.pool.map((s) => s.y), ...tp.map((p) => p[1])];
  const x0 = Math.min(...xs) - 50, x1 = Math.max(...xs) + 50, y0 = Math.min(...ys) - 50, y1 = Math.max(...ys) + 50, W = Math.max(w, x1 - x0), H = Math.max(h, y1 - y0);
  return [Math.round((x0 + x1 - W) / 2), Math.round((y0 + y1 - H) / 2), Math.round(W), Math.round(H)]; };

const results = { when: new Date().toISOString(), scenarios: {}, files: [] };
const keep = (name, buf) => { writeFileSync(join(OUT, name), buf); results.files.push(name); };
const logs = [];
const B = await launch();
results.browser = B.version;
try {
  const P = await page(B, "connectedBalanced");
  // 1 rest, 2 ordinary navigation, 3 fast smooth sweep (nothing sheds)
  if (want("quiet")) {
    const rows = [];
    await P.ev("liquidCursorLab.engine.clearDroplets(), liquidCursorLab.engine.resetBody(), __lc.ready(760, 440), 1"); await P.frames(2);
    rows.push({ label: "1 · rest: the approved round body, no piece", cells: [Buffer.from(await P.shot(560, 330, 400, 230), "base64")] });
    const nav = await P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop, e0 = D.events; E.clearDroplets(); E.resetBody(); const out = [];
      const moves = [[300, 400, 820, 330, 320], [820, 330, 1220, 520, 280], [1220, 520, 640, 480, 360], [640, 480, 1500, 380, 420], [1500, 380, 900, 440, 300]];
      for (const [x0, y0, x1, y1, ms] of moves) { __lc.minJerk(x0, y0, x1, y1, ms); __lc.hold(150); }
      return { events: D.events - e0, x: E.state.renderX, y: E.state.renderY }; })()`);
    await P.frames(2); rows.push({ label: `2 · ordinary navigation (5 minimum-jerk moves of 470-860 px in 280-420 ms): ${nav.events} pieces`, cells: [Buffer.from(await P.shot(Math.round(nav.x) - 200, Math.round(nav.y) - 115, 400, 230), "base64")] });
    const sw = await run(P, G.sweep, { region: G.sweep.region, pick: (f, i) => i === 26 });
    results.scenarios.quiet = { navigationPieces: nav.events, sweep: stats(sw) };
    rows.push({ label: `3 · fast smooth sweep at full stretch (frame +${sw[26].ms} ms): ${stats(sw).pieces.length} pieces`, cells: [sw[26].png] });
    keep("01-03-rest-navigation-sweep.png", await labelledSheet(B, { title: "Rest, ordinary navigation and a fast smooth sweep: no goo (rich goo · balanced)", note: "Composited page, headless Edge, DPR 1, 120 Hz scripted input. Deformation only; fission needs an abrupt swing.", rows }));
  }
  // 4-9: the gestures (DPR 1 strips); strong flick, extreme whip and the zigzag also as GIFs
  for (const [name, file, every, until] of [["strongFlick", "04-05-strong-flick-sequence", 3, 700], ["sharpTurn", "06-sharp-turn", 3, 640], ["reversal", "07-reversal", 3, 640], ["extremeWhip", "08-extreme-whip", 3, 760], ["zigzag", "09-compound-zigzag", 4, 1700], ["catch", "16-body-catch", 3, 760]]) {
    if (!want(name)) continue;
    const frames = await run(P, G[name], { region: G[name].region, every: 1 });
    results.scenarios[name] = { label: G[name].label, ...stats(frames) };
    const pick = frames.filter((f, i) => f.png && i % every === 0 && f.ms <= until).slice(0, 42);
    keep(`${file}.png`, await labelledSheet(B, { title: `Rich goo · balanced · ${G[name].label}`, note: "Composited page (headless Edge, DPR 1, 120 Hz scripted input, difference mask over the lab surfaces). Labels: live pieces (P primary, S secondary, M micro; radius in px; ~ attached, ↓ fading).", rows: pick.map((f) => ({ label: lab(f), cells: [f.png] })) }));
    if (["strongFlick", "extremeWhip", "zigzag"].includes(name)) {
      if (gif(frames.filter((f) => f.ms <= until + 200), join(OUT, `${file.replace(/-sequence$/, "")}-slow.gif`), 50)) results.files.push(`${file.replace(/-sequence$/, "")}-slow.gif`);
      if (gif(frames.filter((f, i) => i % 2 === 0 && f.ms <= until + 300), join(OUT, `${file.replace(/-sequence$/, "")}-realtime.gif`), 17)) results.files.push(`${file.replace(/-sequence$/, "")}-realtime.gif`);
    }
  }
  // 15: two pieces meet and coalesce (manual: a slow primary, then a faster one along nearly the same line)
  if (want("coalesce")) {
    const frames = await run(P, null, { region: [930, 380, 290, 120], manual: { at: [1180, 440], hold: 560, sheds: [{ frame: 0, opts: { angleDeg: 180, speed: 200 } }, { frame: 16, opts: { angleDeg: 181, speed: 720 } }] } });
    results.scenarios.coalesce = { ...stats(frames), merges: await P.ev("liquidCursorLab.engine.state.drop.merges") };
    keep("15-coalescence.png", await labelledSheet(B, { title: "Two pieces meet: the smaller flows into the larger (deterministic, no bounce)", note: "Manual lab sheds through the rich scheduler from a still body: a slow piece, then 133 ms later a faster one along nearly the same line. DPR 1.", rows: frames.filter((f, i) => i >= 18 && i <= 64 && i % 2 === 0).map((f) => ({ label: lab(f), cells: [f.png] })) }));
  }
  // 19: pieces at the window edge
  if (want("edge")) {
    const frames = await run(P, null, { region: [1700, 280, 220, 300], manual: { at: [1880, 440], hold: 360, sheds: [{ frame: 0, opts: { angleDeg: 0, speed: 300, peak: 1.6 } }, { frame: 24, opts: { angleDeg: -60, speed: 420 } }] } });
    results.scenarios.edge = stats(frames);
    const best = frames.reduce((a, f) => (f.live > a.live ? f : a), frames[0]);
    keep("19-window-edge.png", await labelledSheet(B, { title: "Pieces at the right window edge: drawn wherever they are (tiles follow them; only the viewport clips)", note: "The body 40 px from the right edge of a 1920 px window; a strong manual shed (primary + secondary + micro through the scheduler), then another. DPR 1.", rows: [frames[22], best, frames[Math.min(frames.length - 1, 70)]].map((f) => ({ label: lab(f), cells: [f.png] })) }));
  }
  results.console = [...logs, ...P.logs];
  await P.close();

  // 10-14: DPR 2 close-ups at native pixels: 2, 3 and 4 pieces, a thick secondary neck, a micro residual
  if (want("closeups")) {
    const Q = await page(B, "richBalanced", { dpr: 2 });
    const found = {};
    const probe = async (g, name) => { const fr = await run(Q, g, { region: [0, 0, 8, 8], every: 1e9 }); return fr; };
    const shotAt = async (g, k, crop) => { const fr = await run(Q, g, { region: [0, 0, 8, 8], every: 1e9, maxFrames: k + 1, pick: (f, i) => i === k, crop }); return fr[k]; };
    for (const [gname, g] of [["strongFlick", G.strongFlick], ["extremeWhip", G.extremeWhip], ["zigzag", G.zigzag]]) {
      const fr = await probe(g, gname);
      for (const n of [2, 3, 4]) if (!found[n]) { const i = fr.findIndex((f) => f.live === n && f.attached === 0) >= 0 ? fr.findIndex((f) => f.live === n && f.attached === 0) : fr.findIndex((f) => f.live === n); if (i >= 0) found[n] = [g, i, gname]; }
      if (!found.neck) { const i = fr.findIndex((f) => f.pool.some((s) => s.kind === "secondary" && s.state === "NECKING" && s.connected && s.gap > -0.5)); if (i >= 0) found.neck = [g, i, gname]; }
      if (!found.micro) { const i = fr.findIndex((f) => f.pool.some((s) => (s.kind === "micro" || s.kind === "wake") && (s.state === "NECKING" || s.state === "DETACHING"))); if (i >= 0) found.micro = [g, i, gname]; }
    }
    results.scenarios.closeups = Object.fromEntries(Object.entries(found).map(([k, v]) => [k, { gesture: v[2], frame: v[1] }]));
    for (const [n, file, title] of [[2, "10-two-pieces.png", "Two pieces of goo"], [3, "11-three-pieces.png", "Three pieces of goo"], [4, "12-four-pieces.png", "Four pieces of goo (the balanced capacity)"]]) {
      if (!found[n]) continue; const [g, i, gname] = found[n], f = await shotAt(g, i, around(420, 260));
      keep(file, await labelledSheet(B, { title: `${title}: natural emission, rich goo · balanced`, note: `${G[gname].label}, frame +${f.ms} ms. DPR 2, native pixels, crop around the body and every piece.`, rows: [{ label: lab(f), cells: [f.png] }] }));
    }
    for (const [key, file, title, span] of [["neck", "13-thick-secondary-neck.png", "The secondary's thick, short neck: bud, neck and pinch beside the primary", [-3, 12]], ["micro", "14-micro-residual.png", "A micro: a brief metaball pull, then separation", [-3, 9]]]) {
      if (!found[key]) continue; const [g, i, gname] = found[key], rows = [];
      for (let k = Math.max(0, i + span[0]); k <= i + span[1]; k += 1) { const f = await shotAt(g, k, (s) => [Math.round(s.bodyX) - 120, Math.round(s.bodyY) - 75, 240, 150]); rows.push({ label: lab(f), cells: [f.png] }); }
      keep(file, await labelledSheet(B, { title: `${title} (every 120 Hz frame)`, note: `${G[gname].label}. DPR 2, native pixels, crop following the body.`, rows }));
    }
    results.console.push(...Q.logs); await Q.close();
  }
  // 17, 18: inversion over paper text and over the dark panel (DPR 2)
  if (want("surfaces")) {
    const Q = await page(B, "richBalanced", { dpr: 2 });
    for (const [name, to, region] of [["paper", [90, 330], [40, 290, 480, 300]], ["dark", [600, 330], [560, 290, 400, 300]]]) {
      const g = { ...G.zigzag, path: zig(6, 130, 2600, 0.12), to };
      const frames = await run(Q, g, { region, every: 1 });
      const picks = frames.filter((f) => f.live >= 2).filter((f, i) => i % 7 === 0).slice(0, 6);
      keep(`${name === "paper" ? "17" : "18"}-inversion-${name}.png`, await labelledSheet(B, { title: `Difference inversion over the ${name === "paper" ? "paper text" : "dark panel"}: body and goo are one material`, note: "Compound zigzag, DPR 2, native pixels. No new colour, outline, shadow or glow.", rows: picks.map((f) => ({ label: lab(f), cells: [f.png] })) }));
    }
    results.console.push(...Q.logs); await Q.close();
  }
  // 20: Mode C diagnostics during a multi-piece moment
  if (want("debug")) {
    const Q = await page(B, "richBalanced", { mode: "C" });
    const g = G.extremeWhip;
    await Q.ev("liquidCursorLab.engine.clearDroplets(), liquidCursorLab.engine.resetBody(), 1");
    const n = await Q.ev(`(() => { const p = __lc.points(${JSON.stringify(g.path)}, ${g.to}); __lc.ready(p.start[0], p.start[1]); return __lc.seq(p.pts.concat(Array(60).fill(null))); })()`);
    for (let i = 0; i < n; i++) { const st = await Q.ev("__lc.step()"); if (st.live >= 3 && i > 20) break; }
    await Q.frames(2); await new Promise((r) => setTimeout(r, 450));
    keep("20-mode-c-diagnostics.png", Buffer.from(await Q.shot(0, 0, 1920, 1080), "base64"));
    results.console.push(...Q.logs); await Q.close();
  }
  // THE comparison: the same deterministic gestures across A-F (DPR 1, native pixels)
  if (want("compare")) {
    const cols = [["strongFlick", 22, "strong flick +183 ms"], ["strongFlick", 40, "strong flick +333 ms"], ["extremeWhip", 26, "extreme whip +217 ms"], ["extremeWhip", 48, "extreme whip +400 ms"], ["zigzag", 120, "compound zigzag +1000 ms"]];
    const wcol = 96, rows = [], wrows = [];
    for (const [key, label] of PRESETS) {
      const Q = await page(B, key), cells = [], info = {};
      for (const g of [...new Set(cols.map((c) => c[0]))]) {
        const want_ = cols.filter((c) => c[0] === g).map((c) => c[1]);
        const fr = await run(Q, G[g], { region: G[g].region, every: 1e9, pick: (f, i) => want_.includes(i), maxFrames: Math.max(...want_) + 1 });
        info[g] = fr; }
      for (const [g, i] of cols) cells.push(info[g][i].png);
      rows.push({ label: `${label} · ${cols.map(([g, i]) => `${info[g][i].live}`).join("/")} live`, cells });
      const wf = await run(Q, G.wscribble, { region: [80, 296, 1700, 290], every: 1e9, pick: (f, i) => i === wcol, maxFrames: wcol + 1 });
      wrows.push({ label: `${label} · ${lab(wf[wcol])}`, cells: [wf[wcol].png] });
      results.scenarios[`compare-${key}`] = { strongFlick: stats(info.strongFlick), extremeWhip: stats(info.extremeWhip), zigzag: stats(info.zigzag) };
      results.console.push(...Q.logs); await Q.close();
    }
    keep("36-comparison-sheet.png", await labelledSheet(B, { title: "The same deterministic gestures across Phase 3 · Phase 4 · rich goo sparse / balanced / heavy · the Aecync boundary",
      note: "Identical 120 Hz scripted gestures and backdrops, headless Edge, DPR 1, native pixels. Columns: a strong flick (0 → 3200 px/s in 25 ms) and an extreme whip (4600 px/s, then a hard reversal) at two moments each, and a back-and-forth compound zigzag. Row labels list the live pieces per column.",
      columns: cols.map((c) => c[2]), rows }));
    keep("36b-comparison-w-scribble.png", await labelledSheet(B, { title: "The same compound W scribble across the six snapshots, 800 ms in (the goo left along the path)",
      note: "6 legs of 130 ms at 3000 px/s with 77° turns, moving left to right; DPR 1, native pixels. Labels: live pieces (P primary, S secondary, M micro; radius in px; ~ attached, ↓ fading).", rows: wrows }));
  }
} finally { await B.close(); }

// the measurements behind the policy: density, trail detector, lifetimes (pure dynamics, the lab's own scripts)
if (want("density")) {
  const W = loadLab(), POOLS = W.LIQUID_CURSOR_CONFIG.lab.poolPresets, D = {};
  for (const [key] of PRESETS) {
    const vals = POOLS[key].values; let share = [0, 0, 0, 0, 0, 0], ev = 0, act = [], tm = [], br = 0, brMax = 0, life = [[], [], []], att = [[], [], []], trav = [[], [], []];
    for (let s = 1; s <= 40; s++) {
      const r = simulate(W, randomScribble(s), { hz: 120, params: vals });
      ev += r.emitted; r.share.forEach((x, i) => (share[i] += x / 40)); act.push(...r.duringLive.filter((n) => n > 0)); tm.push(trailMetrics(r)); br += r.bridgeConnects; brMax = Math.max(brMax, r.bridgeMaxPerPair);
      for (const e of r.events) if (e.endMs !== undefined) { life[e.cls].push(e.endMs - e.startMs); att[e.cls].push(e.releaseMs - e.startMs); trav[e.cls].push(e.travel); }
    }
    act.sort((a, b) => a - b);
    const avg = (xs) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3) : null), rng = (xs) => (xs.length ? [Math.round(Math.min(...xs)), Math.round(Math.max(...xs))] : null);
    const tmA = (k) => avg(tm.map((x) => x[k]).filter((x) => x !== null && Number.isFinite(x)));
    const gest = {};
    for (const [gname, g] of Object.entries({ ...RICH_GESTURES, extremeFlick: GESTURES.extremeFlick, sweep: GESTURES.sweep, sweepFast: GESTURES.sweepFast })) gest[gname] = [60, 120, 144, 165].map((hz) => { const r = simulate(W, g, { hz, params: vals }); return { hz, pieces: r.events.map((e) => e.kind[0]).join(""), peak: r.peakLive, trail: gname === "fastNav" ? trailMetrics(r) : undefined }; });
    D[key] = { piecesPerSecond: +(ev / 160).toFixed(2), timeWithLive: share.map((x) => +(100 * x).toFixed(1)), meanLive: +share.reduce((a, x, i) => a + x * i, 0).toFixed(2), medianWhileActive: act.length ? act[Math.floor(act.length / 2)] : 0,
      trail: { spacingCV: tmA("spacingCV"), intervalCV: tmA("intervalCV"), perKpx: tmA("perKpx"), speedOnlyShare: tmA("speedOnlyShare"), corrSpeed: tmA("corrSpeed"), corrSignal: tmA("corrSignal") },
      cohesionBridges: br, bridgeMaxPerPair: brMax, visibleLifeMs: { primary: rng(life[0]), secondary: rng(life[1]), micro: rng(life[2]) }, attachedMs: { primary: rng(att[0]), secondary: rng(att[1]), micro: rng(att[2]) },
      meanTravelPx: { primary: avg(trav[0]), secondary: avg(trav[1]), micro: avg(trav[2]) }, gestures: gest };
  }
  results.density = { note: "40 seeded relentless 4 s random violent scribbles at 120 Hz per snapshot (tools/pool-sim.mjs randomScribble), plus the scenario gestures at 60/120/144/165 Hz", snapshots: D };
}
if (ONLY.length && existsSync(join(OUT, "rich-evidence.json"))) { const old = JSON.parse(readFileSync(join(OUT, "rich-evidence.json"), "utf8")); results.scenarios = { ...old.scenarios, ...results.scenarios }; results.files = [...new Set([...old.files, ...results.files])]; if (!results.density) results.density = old.density; }
writeFileSync(join(OUT, "rich-evidence.json"), JSON.stringify(results, null, 1) + "\n");
for (const [n, s] of Object.entries(results.scenarios)) console.log(n.padEnd(22), JSON.stringify(s.pieces ? { pieces: s.pieces.map((e) => e.cls + e.r0).join(" "), peak: s.peakLive, mean: s.meanLive, att: s.maxAttached, taper: s.taperMax } : s).slice(0, 240));
console.log(`files: ${results.files.length} · console: ${results.console && results.console.length ? results.console.join(" | ") : "clean"} · output ${OUT}`);
