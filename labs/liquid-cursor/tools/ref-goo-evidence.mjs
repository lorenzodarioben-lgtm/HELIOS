// Liquid cursor lab, Phase 4.5 redesign: visual evidence of the reference goo (the curved metaball spine) against the
// user's reference image and the rejected first connected goo. Real WebGL output of the composited page (never mockups),
// frame-exact 120 Hz scripted trajectories (tools/silhouette.mjs).
//
//   node labs/liquid-cursor/tools/ref-goo-evidence.mjs [--out DIR] [--evidence] [--http URL] [--ref PNG] [--only name,name]
//
// --evidence writes into labs/liquid-cursor/evidence/phase4-reference/ (earlier evidence is never rewritten). --ref is the
// reference image for sheet 00 (without it, column A says so). GIF clips need Python with Pillow (skipped otherwise).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openPage, labelledSheet, decodePNG, grid } from "./cdp.mjs";
import { installHelpers } from "./silhouette.mjs";

const LAB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = argv.includes("--evidence") ? join(LAB, "evidence", "phase4-reference") : opt("--out", mkdtempSync(join(tmpdir(), "lc-ref-")));
const HTTP = opt("--http", "http://127.0.0.1:8315/labs/liquid-cursor/"), REF = opt("--ref", "");
const ONLY = (opt("--only", "") || "").split(",").filter(Boolean), want = (n) => !ONLY.length || ONLY.includes(n);
mkdirSync(OUT, { recursive: true });
const FRAME = 1000 / 120;

// the five deterministic gestures over the top surfaces row of Mode B (paper 32-533, dark 557-958, swatches 982-1303, image 1327-1888)
const G = {
  straightFlick: { label: "straight flick (0 → 3200 px/s in 25 ms, 200 ms, stop)", path: [{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], to: [1050, 440] },
  curvedFlick: { label: "curved flick (an arch at 3200 px/s: up-right turning 110° to down-right over 260 ms, stop)", path: [{ dx: 0.5817, dy: -0.8134, v: 3200, ms: 260, ramp: 25, turn: 1.9 }], to: [1210, 520] },
  turn90: { label: "90° turn at 2800 px/s (right, then up)", path: [{ dx: 1, dy: 0, v: 2800, ms: 200, ramp: 60 }, { dx: 0, dy: -1, v: 2800, ms: 110 }], to: [1000, 300] },
  reversal: { label: "reversal at 2800 px/s", path: [{ dx: 1, dy: 0, v: 2800, ms: 200, ramp: 60 }, { dx: -1, dy: 0, v: 2800, ms: 150 }], to: [760, 440] },
  extremeWhip: { label: "extreme whip (0 → 4600 px/s in 18 ms, then a hard reversal down-left at 4200 px/s)", path: [{ dx: 1, dy: 0, v: 4600, ms: 150, ramp: 18 }, { dx: -0.95, dy: 0.31, v: 4200, ms: 120 }], to: [900, 470] },
};
const ORDER = ["straightFlick", "curvedFlick", "turn90", "reversal", "extremeWhip"];

async function page(B, pool, { dpr = 1, mode = "B" } = {}) {
  const P = await openPage(B, `${HTTP}?mode=${mode}&pool=${pool}`, { dpr });
  await P.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
  return P;
}
// generic tail state: the shader's tail chain (tailOut, written by the spine or by the previous wake) plus each one's own state
const STATE = `(() => { const s = __lc.step(), D = liquidCursorLab.engine.state.drop, O = D.tailOut, Sp = D.spine, W = D.wake;
  s.tail = { on: O.on, pts: Array.from(O.x).map((x, k) => [x, O.y[k]]), r: Array.from(O.r) }; s.spine = { on: Sp.on, E: Sp.E, L: Sp.L, shed: Sp.shed }; s.wake = { state: W.state, len: W.len };
  s.R = liquidCursorLab.engine.state.params.radius;
  s.pool = D.slots.filter((q) => q.state !== "IDLE").map((q) => ({ id: q.id, kind: q.kind, x: q.x, y: q.y, r: q.r, r0: q.r0 })); s.material = D.material; return s; })()`;
// how far the form reaches: the farthest tail point (plus its radius) from the body centre; and its whole length, bulb front to tail end
const reach = (f) => (f.tail.on ? Math.max(...f.tail.pts.map((p, k) => Math.hypot(p[0] - f.bodyX, p[1] - f.bodyY) + f.tail.r[k])) : 0);
const formLen = (f) => { if (!f.tail.on) return 0; const [x0, y0] = f.tail.pts[0]; return Math.max(f.R, f.tail.r[0]) + Math.max(...f.tail.pts.map((p, k) => Math.hypot(p[0] - x0, p[1] - y0) + f.tail.r[k])); };
async function run(P, g, { pick = () => true, crop = null, hold = 520, maxFrames = 400 } = {}) {
  await P.ev("liquidCursorLab.engine.clearDroplets(), liquidCursorLab.engine.resetBody(), 1");
  const n = await P.ev(`(() => { const p = __lc.points(${JSON.stringify(g.path)}, ${g.to}); __lc.ready(p.start[0], p.start[1]); return __lc.seq(p.pts.concat(Array(${Math.round(hold / FRAME)}).fill(null))); })()`);
  const frames = [];
  for (let i = 0; i < Math.min(n, maxFrames); i++) {
    const st = await P.ev(STATE); st.ms = +(i * FRAME).toFixed(1); st.i = i;
    if (pick(st, i)) { await P.frames(2); st.png = Buffer.from(await P.shot(...crop(st)), "base64"); }
    frames.push(st);
  }
  return frames;
}
// a crop around the body, the tail and every piece, at least w x h CSS px
const around = (w, h) => (f) => { const tp = f.tail.on ? f.tail.pts : [], xs = [f.bodyX, ...f.pool.map((s) => s.x), ...tp.map((p) => p[0])], ys = [f.bodyY, ...f.pool.map((s) => s.y), ...tp.map((p) => p[1])];
  const x0 = Math.min(...xs) - 50, x1 = Math.max(...xs) + 50, y0 = Math.min(...ys) - 50, y1 = Math.max(...ys) + 50, W = Math.max(w, x1 - x0), H = Math.max(h, y1 - y0);
  return [Math.round((x0 + x1 - W) / 2), Math.round((y0 + y1 - H) / 2), Math.round(W), Math.round(H)]; };
const fixed = (w, h) => (f) => { const tp = f.tail.on ? f.tail.pts : [[f.bodyX, f.bodyY]], cx = (Math.min(f.bodyX, ...tp.map((p) => p[0])) + Math.max(f.bodyX, ...tp.map((p) => p[0]))) / 2,
  cy = (Math.min(f.bodyY, ...tp.map((p) => p[1])) + Math.max(f.bodyY, ...tp.map((p) => p[1]))) / 2; return [Math.round(cx - w / 2), Math.round(cy - h / 2), w, h]; };
const lab = (f, t0 = 0) => `+${(f.ms - t0).toFixed(0)} ms${f.spine.on ? ` · energy ${f.spine.E.toFixed(2)}, tail ${f.spine.L.toFixed(0)} px` : f.wake.state !== "IDLE" ? ` · wake ${f.wake.state.toLowerCase()} ${f.wake.len.toFixed(0)} px` : ""}${f.tail.on ? `, form ${(formLen(f) / (2 * f.R)).toFixed(1)}× its width` : ""}${f.pool.length ? " · " + f.pool.map((s) => `${s.kind === "bulb" ? "b" : s.kind === "splash" ? "s" : s.kind[0]}${s.r.toFixed(1)}`).join(" ") : ""}`;
const stats = (fr) => { const ids = new Map(); let conn = 0, maxL = 0, maxE = 0, ratio = 0, peak = 0; for (const f of fr) { if (f.tail.on && reach(f) > f.R + 12) conn += FRAME; maxL = Math.max(maxL, f.spine.L); maxE = Math.max(maxE, f.spine.E); ratio = Math.max(ratio, formLen(f) / (2 * f.R)); peak = Math.max(peak, f.material);
    for (const s of f.pool) if (!ids.has(s.id)) ids.set(s.id, `${s.kind}:${s.r0.toFixed(1)}`); }
  return { maxEnergy: +maxE.toFixed(2), maxTailPx: +maxL.toFixed(0), formLengthOverWidth: +ratio.toFixed(2), visibleTailMs: +conn.toFixed(0), pieces: [...ids.values()], peakMaterial: peak }; };
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

const results = { when: new Date().toISOString(), scenarios: {}, files: [], console: [] };
const keep = (name, buf) => { writeFileSync(join(OUT, name), buf); results.files.push(name); };
const B = await launch();
results.browser = B.version;
try {
  // 00: THE sheet. A the reference (a header), then per gesture B the rejected connected goo and C the candidate, each at its
  // fullest form and 83 ms later
  if (want("compare")) {
    const per = {};
    for (const pool of ["connectedBalanced", "refBalanced"]) {
      const P = await page(B, pool);
      for (const g of ORDER) {
        const fr = await run(P, G[g], { pick: () => false });
        results.scenarios[`${pool}:${g}`] = stats(fr);
        let iMax = fr.reduce((a, f, i) => (reach(f) > reach(fr[a]) ? i : a), 0);
        if (!fr[iMax].tail.on) iMax = fr.reduce((a, f, i) => (f.pool.length > fr[a].pool.length ? i : a), Math.min(fr.length - 1, 30));
        const ks = [iMax, Math.min(fr.length - 1, iMax + 10)];
        const got = await run(P, G[g], { pick: (f, i) => ks.includes(i), crop: fixed(380, 270), maxFrames: ks[1] + 1 });
        per[`${pool}:${g}`] = ks.map((k) => got[k]);
      }
      results.console.push(...P.logs); await P.close();
    }
    const head = await labelledSheet(B, {
      title: "A · the user's reference  ·  B · the rejected connected goo  ·  C · the redesigned candidate (reference goo · balanced)",
      note: "A: the reference image as given (another cursor, lime on dark). The form to match: a heavy rounded mass, a neck narrowing along the path it came by, a small terminal knob, beads of many sizes along the old path; about 3.0x as long as it is wide. B and C below: the composited lab page, headless Edge, DPR 1, native pixels, identical 120 Hz scripted gestures; per gesture the fullest form and 83 ms later. Labels give the form's length over its width (the reference about 3.0; the target 70-85% of it, 2.1-2.55).",
      rows: [{ label: REF && existsSync(REF) ? "A · reference (the user's image, unscaled)" : "A · reference (pass --ref to embed it)", cells: REF && existsSync(REF) ? [readFileSync(REF)] : [] }] });
    const body = await labelledSheet(B, { title: "", columns: ["B · previous · fullest", "B · previous · +83 ms", "C · candidate · fullest", "C · candidate · +83 ms"],
      rows: ORDER.map((g) => { const b2 = per[`connectedBalanced:${g}`], c2 = per[`refBalanced:${g}`];
        return { label: `${G[g].label} · B: ${b2.map((f) => lab(f)).join(" | ")} · C: ${c2.map((f) => lab(f)).join(" | ")}`, cells: [...b2, ...c2].map((f) => f.png) }; }) });
    keep("00-reference-vs-previous-vs-candidate.png", grid([[decodePNG(head.toString("base64"))], [decodePNG(body.toString("base64"))]], 0));
  }
  // 01-05: the candidate through each gesture, tail-following crops of every second frame from just before the goo starts
  const P = await page(B, "refBalanced");
  for (const [k, g] of ORDER.entries()) {
    const file = `${String(k + 1).padStart(2, "0")}-${g.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}`;
    if (!want(g)) continue;
    const probe = await run(P, G[g], { pick: () => false });
    results.scenarios[`refBalanced:${g}`] = stats(probe);
    const t0 = Math.max(0, probe.findIndex((f) => f.tail.on) - 2), picks = new Set(); for (let i = t0; i <= Math.min(probe.length - 1, t0 + 46); i += 2) picks.add(i);
    const fr = await run(P, G[g], { pick: (f, i) => picks.has(i), crop: around(400, 240), maxFrames: t0 + 47 });
    const cells = fr.filter((f) => f.png), rows = [];
    for (let j = 0; j < cells.length; j += 4) rows.push({ label: cells.slice(j, j + 4).map((f) => lab(f, cells[0].ms)).join(" | "), cells: cells.slice(j, j + 4).map((f) => f.png) });
    keep(`${file}.png`, await labelledSheet(B, { title: `Reference goo · balanced · ${G[g].label}`, note: "Composited page (headless Edge, DPR 1, 120 Hz scripted input, difference mask over the lab surfaces). Crops follow the body, its tail and every piece, native pixels; every second frame, left to right, then down. Labels: motion energy, tail length along the path, the form's length over its width, free pieces (b first bead / pinched blob, s splash; radius px).", rows }));
    if (g === "straightFlick" || g === "extremeWhip" || g === "curvedFlick") {
      const all = await run(P, G[g], { pick: (f, i) => i >= t0 - 6 && i <= t0 + 60, crop: fixed(640, 360), maxFrames: t0 + 61 });
      const span = all.filter((f) => f.png);
      if (gif(span, join(OUT, `${file}-slow.gif`), 50)) results.files.push(`${file}-slow.gif`);
      if (gif(span.filter((f, i) => i % 2 === 0), join(OUT, `${file}-realtime.gif`), 17)) results.files.push(`${file}-realtime.gif`);
    }
  }
  // 06: rest, ordinary navigation and a medium sweep: the approved body, no goo
  if (want("quiet")) {
    const rows = [];
    await P.ev("liquidCursorLab.engine.clearDroplets(), liquidCursorLab.engine.resetBody(), __lc.ready(760, 440), 1"); await P.frames(2);
    rows.push({ label: "rest: the approved round body", cells: [Buffer.from(await P.shot(560, 330, 400, 230), "base64")] });
    const nav = await P.ev(`(() => { const E = liquidCursorLab.engine; E.clearDroplets(); E.resetBody(); __lc.ready(300, 400); __lc.hold(200); const D = E.state.drop, t0 = D.tails || 0, s0 = D.spine.shed;
      for (const [x0, y0, x1, y1, ms] of [[300, 400, 620, 360, 420], [620, 360, 900, 470, 380], [900, 470, 640, 420, 400], [640, 420, 1100, 390, 480], [1100, 390, 900, 440, 360]]) { __lc.minJerk(x0, y0, x1, y1, ms); __lc.hold(150); }
      return { tails: (D.tails || 0) - t0, beads: D.spine.shed - s0, x: E.state.renderX, y: E.state.renderY }; })()`);
    await P.frames(2); rows.push({ label: `ordinary navigation (5 minimum-jerk moves of 200-460 px in 360-480 ms): ${nav.tails} goo bursts, ${nav.beads} beads`, cells: [Buffer.from(await P.shot(Math.round(nav.x) - 200, Math.round(nav.y) - 115, 400, 230), "base64")] });
    const sw = await run(P, { path: [{ dx: 1, dy: 0, v: 1000, ms: 500, ramp: 160 }], to: [1100, 440] }, { pick: (f, i) => i === 40, crop: fixed(400, 230), hold: 200 });
    rows.push({ label: `medium sweep at 1000 px/s, mid-sweep: ${sw.some((f) => f.tail.on) ? "goo" : "no goo"}`, cells: [sw[40].png] });
    results.scenarios.quiet = { navigation: nav, mediumSweep: stats(sw) };
    keep("06-rest-navigation-medium-sweep.png", await labelledSheet(B, { title: "Rest, ordinary navigation and a medium sweep: the approved body, no goo", note: "Reference goo · balanced, DPR 1, 120 Hz scripted input. The goo grows from 1500 px/s of rendered speed; beads need aggressive motion (energy above 0.6).", rows }));
  }
  results.console.push(...P.logs); await P.close();
  // 07: the reference presets side by side (the same moments of the straight flick and the extreme whip)
  if (want("presets")) {
    const cols = [["straightFlick", 19, "straight flick +158 ms"], ["curvedFlick", 29, "curved flick +242 ms"], ["extremeWhip", 22, "extreme whip +183 ms"], ["extremeWhip", 30, "extreme whip +250 ms"]], rows = [];
    for (const [key, label] of [["refSparse", "Reference goo · sparse"], ["refBalanced", "Reference goo · balanced (default)"], ["refHeavy", "Reference goo · heavy"], ["refBoundary", "Reference boundary · longer and denser"], ["connectedBalanced", "Connected goo · previous (rejected)"]]) {
      const Q = await page(B, key), cells = [], labels = [];
      for (const [g, i] of cols) { const fr = await run(Q, G[g], { pick: (f, j) => j === i, crop: fixed(440, 300), maxFrames: i + 1 }); cells.push(fr[i].png); labels.push(lab(fr[i])); results.scenarios[`${key}:${g}`] = results.scenarios[`${key}:${g}`] || stats(await run(Q, G[g], { pick: () => false })); }
      rows.push({ label: `${label} · ${labels.join(" | ")}`, cells });
      results.console.push(...Q.logs); await Q.close();
    }
    keep("07-reference-presets.png", await labelledSheet(B, { title: "The reference presets at the same moments: sparse · balanced · heavy · boundary, and the rejected connected goo", note: "Identical 120 Hz scripted gestures, DPR 1, native pixels, a fixed crop centred on the body and its tail.", columns: cols.map((c) => c[2]), rows }));
  }
  // 08: DPR 2 close-ups of the fullest forms
  if (want("closeups")) {
    const Q = await page(B, "refBalanced", { dpr: 2 }), cells = [], labels = [];
    for (const g of ORDER) {
      const fr = await run(Q, G[g], { pick: () => false }), i = fr.reduce((a, f, j) => (reach(f) > reach(fr[a]) ? j : a), 0);
      const got = await run(Q, G[g], { pick: (f, j) => j === i, crop: fixed(300, 220), maxFrames: i + 1 }); cells.push(got[i].png); labels.push(`${g} ${lab(got[i])}`);
    }
    keep("08-fullest-forms-dpr2.png", await labelledSheet(B, { title: "The fullest form of each gesture at DPR 2 (native pixels)", note: "Reference goo · balanced. Heavy leading bulb, neck narrowing along the recent path, terminal knob; one surface with the body.", columns: ORDER, rows: [{ label: labels.join(" | "), cells }] }));
    results.console.push(...Q.logs); await Q.close();
  }
} finally { await B.close(); }

if (ONLY.length && existsSync(join(OUT, "ref-goo-evidence.json"))) { const old = JSON.parse(readFileSync(join(OUT, "ref-goo-evidence.json"), "utf8")); results.scenarios = { ...old.scenarios, ...results.scenarios }; results.files = [...new Set([...old.files, ...results.files])]; }
writeFileSync(join(OUT, "ref-goo-evidence.json"), JSON.stringify(results, null, 1) + "\n");
for (const [n, s] of Object.entries(results.scenarios)) console.log(n.padEnd(30), JSON.stringify(s).slice(0, 220));
console.log(`files: ${results.files.length} · console: ${results.console.length ? results.console.join(" | ") : "clean"} · output ${OUT}`);
