// Liquid cursor lab, Phase 4.5 redesign checks: the reference goo (the curved metaball spine, the default). Imported by
// check-lab.mjs (group names "spine …"). Deterministic dynamics in Node (the lab's own scripts at 60/120/144/165 Hz):
// quiet motion, the five deterministic gestures, the form's proportions against the reference, the bead hierarchy, the
// catch-up, frame-rate independence, the presets and the scribble density. Then the real page: the default and its
// controls, the tail on screen as one surface with the body, inversion, the untouched body, the manual controls, Mode C,
// file:// and performance.
import { openPage, decodePNG, sleep } from "./cdp.mjs";
import { installHelpers } from "./silhouette.mjs";
import { loadLab, GESTURES, RICH_GESTURES, randomScribble } from "./pool-sim.mjs";

const HZ = [60, 120, 144, 165];
const ease = (t, ms) => { const k = Math.min(1, Math.max(0, t * 1000 / ms)); return k * k * (3 - 2 * k); };
const seg = (legs) => { let T = 0; const L = legs.map((l) => { const o = { ...l, t0: T }; T += l.ms / 1000; return o; });
  return (t) => { for (const l of L) if (t >= l.t0 && t < l.t0 + l.ms / 1000) { const s = l.v * (l.ramp ? ease(t - l.t0, l.ramp) : 1); return [l.dx * s, l.dy * s]; } return [0, 0]; }; };
// the evidence gestures (tools/ref-goo-evidence.mjs), as pointer velocities
export const SPINE_GESTURES = {
  straightFlick: { v: seg([{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }]), ms: 1400, stopMs: 200 },
  curvedFlick: { v: (t) => { if (t < 0 || t >= 0.26) return [0, 0]; const a = -0.95 + 1.9 * t / 0.26, s = 3200 * ease(t, 25); return [Math.cos(a) * s, Math.sin(a) * s]; }, ms: 1400, stopMs: 260 }, // an arch: up-right turning to down-right
  turn90: { v: seg([{ dx: 1, dy: 0, v: 2800, ms: 200, ramp: 60 }, { dx: 0, dy: -1, v: 2800, ms: 110 }]), ms: 1400, stopMs: 310 },
  reversal: { v: seg([{ dx: 1, dy: 0, v: 2800, ms: 200, ramp: 60 }, { dx: -1, dy: 0, v: 2800, ms: 150 }]), ms: 1400, stopMs: 350 },
  extremeWhip: { v: seg([{ dx: 1, dy: 0, v: 4600, ms: 150, ramp: 18 }, { dx: -0.95, dy: 0.31, v: 4200, ms: 120 }]), ms: 1400, stopMs: 270 },
};
// one run of the lab's scripts with per-frame records of the spine (the shader's tail chain) and the free pieces
export function spineRun(W, g, { hz = 120, params = {}, preMs = 300 } = {}) {
  const L = W.LiquidCursor, LD = W.LiquidDroplet, CFG = W.LIQUID_CURSOR_CONFIG, F = CFG.follow, P = L.paramsFromConfig(CFG, params);
  const B = L.createBodyState(), D = LD.createDropletSystem(), dt = 1 / hz, S = D.spine, O = D.tailOut;
  const body = { x: 0, y: 0, R: 34, s: 1, c: 1, ax: 1, ay: 0, amp: 0, cell: 36, nt: 0 }, ptr = { vx: 0, vy: 0, allowed: true };
  let t = -preMs / 1000, px = 0, py = 0, vx = 0, vy = 0, rx = 0, ry = 0, nonFinite = 0;
  const out = { maxE: 0, maxL: 0, maxRatio: 0, visibleMs: 0, onMs: 0, offAt: -1, onAt: -1, bend: 0, maxExcessStep: 0, peakMaterial: 0, pieces: [], material: [], bursts: 0 };
  const seen = new Set(), prev = new Float64Array(10); let had = false, pbx = 0, pby = 0, lastMove = -1;
  while (t < g.ms / 1000) {
    const [gx, gy] = t >= 0 ? g.v(t) : [0, 0]; px += gx * dt; py += gy * dt; if (gx || gy) lastMove = t;
    const kv = 1 - Math.exp(-dt * 1000 / F.velocitySmoothingMs); vx += (gx - vx) * kv; vy += (gy - vy) * kv;
    if (gx === 0 && gy === 0) { vx *= Math.exp(-F.velocityDecay * dt); vy *= Math.exp(-F.velocityDecay * dt); }
    L.stepBody(B, P, F.maxSubstep, { vx, vy, hover: false, pressed: false }, dt);
    const a = 1 - Math.exp(-P.followResponse * dt); rx += (px - rx) * a; ry += (py - ry) * a;
    Object.assign(body, { x: rx, y: ry, R: P.radius * B.radiusScale, s: B.stretch, c: B.compression, ax: B.ax, ay: B.ay, amp: B.noiseAmp, cell: P.noiseScale, nt: B.noiseT });
    ptr.vx = vx; ptr.vy = vy; LD.step(D, P, body, ptr, dt, F.maxSubstep); t += dt;
    if (t <= 0) { pbx = body.x; pby = body.y; continue; }
    const ms = t * 1000; out.material.push(D.material); out.peakMaterial = Math.max(out.peakMaterial, D.material);
    for (let k = 0; k < 5; k++) if (!Number.isFinite(O.x[k]) || !Number.isFinite(O.y[k]) || !Number.isFinite(O.r[k])) nonFinite++;
    for (const q of D.slots) if (q.state !== "IDLE" && !seen.has(q.id)) { seen.add(q.id); out.pieces.push({ kind: q.kind, r0: q.r0, ms }); }
    if (O.on) {
      if (out.onAt < 0) out.onAt = ms; out.offAt = -1; out.onMs += dt * 1000;
      out.maxE = Math.max(out.maxE, S.E); out.maxL = Math.max(out.maxL, S.L);
      const [x0, y0] = [O.x[0], O.y[0]], len = Math.max(body.R, O.r[0]) + Math.max(...[0, 1, 2, 3, 4].map((k) => Math.hypot(O.x[k] - x0, O.y[k] - y0) + O.r[k]));
      out.maxRatio = Math.max(out.maxRatio, len / (2 * body.R));
      if (Math.max(...[1, 2, 3, 4].map((k) => Math.hypot(O.x[k] - body.x, O.y[k] - body.y) + O.r[k])) > body.R + 12) out.visibleMs += dt * 1000;
      if (S.L > 30 && Math.hypot(O.x[3] - O.x[1], O.y[3] - O.y[1]) > 15 && Math.hypot(O.x[4] - O.x[3], O.y[4] - O.y[3]) > 10) { // the tail's bend: root → second neck point against the last segment
        const a1 = Math.atan2(O.y[3] - O.y[1], O.x[3] - O.x[1]), a2 = Math.atan2(O.y[4] - O.y[3], O.x[4] - O.x[3]);
        let d = Math.abs(a1 - a2); if (d > Math.PI) d = 2 * Math.PI - d; out.bend = Math.max(out.bend, d * 180 / Math.PI);
      }
      if (had) { const bs = Math.hypot(body.x - pbx, body.y - pby); for (let k = 1; k < 5; k++) out.maxExcessStep = Math.max(out.maxExcessStep, (Math.hypot(O.x[k] - prev[2 * k], O.y[k] - prev[2 * k + 1]) - bs) / dt); } // px/s beyond the body's own motion
      for (let k = 0; k < 5; k++) { prev[2 * k] = O.x[k]; prev[2 * k + 1] = O.y[k]; } had = true;
    } else { if (had && out.offAt < 0) out.offAt = ms; had = false; }
    pbx = body.x; pby = body.y;
  }
  out.beads = S.shed; out.bursts = D.tails || 0; out.nonFinite = nonFinite; out.lastMoveMs = lastMove * 1000; out.capacity = LD.capacity(P);
  out.goneAfterStopMs = out.offAt >= 0 ? out.offAt - lastMove * 1000 : Infinity;
  return out;
}

export async function spineChecks(B, ctx) {
  const { check, info, HTTP, FILE, allLogs } = ctx;
  const G = "spine", GD = "spine dynamics", GR = "spine rendering", GP = "spine performance";
  const ev = {}; info.spine = ev;
  const W = loadLab(), CFG = W.LIQUID_CURSOR_CONFIG, POOLS = CFG.lab.poolPresets, SP = CFG.spine;
  const R = (g, hz, params = {}) => spineRun(W, g, { hz, params });
  const runs = {};
  const GS_ = { stationary: GESTURES.stationary, slow: GESTURES.slow, mediumSweep: RICH_GESTURES.mediumSweep, navigation: RICH_GESTURES.navigation, sweep: GESTURES.sweep, fastNav: RICH_GESTURES.fastNav, ...SPINE_GESTURES };
  for (const [g, gest] of Object.entries(GS_)) runs[g] = HZ.map((hz) => ({ hz, ...R(gest, hz) }));
  const brief = (r) => ({ hz: r.hz, maxE: +r.maxE.toFixed(2), maxL: +r.maxL.toFixed(1), ratio: +r.maxRatio.toFixed(2), beads: r.beads, sizes: r.pieces.map((p) => +p.r0.toFixed(1)), visibleMs: Math.round(r.visibleMs), goneAfterStopMs: Number.isFinite(r.goneAfterStopMs) ? Math.round(r.goneAfterStopMs) : null, bend: Math.round(r.bend), excessSpeed: Math.round(r.maxExcessStep), peakMaterial: r.peakMaterial, bursts: r.bursts });
  ev.scenarios = Object.fromEntries(Object.entries(runs).map(([g, rs]) => [g, rs.map(brief)]));
  const show = (g, f) => runs[g].map((r) => `${r.hz} Hz ${f(r)}`).join(" · ");

  check(G, "the default is \"Reference goo · balanced\" (spine on, the config defaults); the comparison snapshots Phase 4 · rich goo · connected goo previous · reference sparse / heavy / boundary are defined, and the rejected connected goo is kept whole (wake on, spine off)",
    CFG.lab.defaultPoolPreset === "refBalanced" && Object.keys(POOLS.refBalanced.values).length === 0 && SP.on === 1 && CFG.goo.on === 1 && ["balanced", "richBalanced", "connectedBalanced", "refSparse", "refHeavy", "refBoundary"].every((k) => POOLS[k])
      && POOLS.connectedBalanced.values.wakeOn === 1 && POOLS.connectedBalanced.values.spineOn === 0 && POOLS.richBalanced.values.spineOn === 0 && POOLS.balanced.values.spineOn === 0,
    `default ${CFG.lab.defaultPoolPreset}; spine.on ${SP.on}, goo.on ${CFG.goo.on}, pool.max ${CFG.pool.max}; connectedBalanced wakeOn ${POOLS.connectedBalanced.values.wakeOn} spineOn ${POOLS.connectedBalanced.values.spineOn}`);
  // ---------------------------------------------------------------- rest and ordinary motion stay the approved body
  check(GD, "rest and ordinary motion stay the approved body: stationary, slow and a smooth medium sweep grow no goo at all; ordinary navigation (minimum-jerk moves of 150-750 px) sheds nothing and at most a short teardrop, at 60/120/144/165 Hz",
    ["stationary", "slow", "mediumSweep"].every((g) => runs[g].every((r) => r.bursts === 0 && r.beads === 0 && r.maxL === 0)) && runs.navigation.every((r) => r.beads === 0 && r.maxL <= 45),
    ["stationary", "slow", "mediumSweep", "navigation"].map((g) => `${g} ${runs[g].map((r) => `${r.bursts}/${r.maxL.toFixed(0)}px/${r.beads}b`).join(" ")}`).join(" · "));
  // ---------------------------------------------------------------- the five gestures
  const sizes = (r) => r.pieces.map((p) => p.r0);
  check(GD, "straight flick: the body becomes one heavy teardrop trailing a neck (energy ≥ 0.9, tail 55-75 px along the path, the form 2.1-2.6× as long as it is wide: 70-87% of the reference's 3.0), then 3-6 beads in a size hierarchy (the first 5-7 px), at every frame rate",
    runs.straightFlick.every((r) => r.maxE >= 0.9 && r.maxL >= 55 && r.maxL <= 75 && r.maxRatio >= 2.1 && r.maxRatio <= 2.6 && r.pieces.length >= 3 && r.pieces.length <= 6 && sizes(r)[0] >= 5 && sizes(r)[0] <= 7 && sizes(r)[1] < sizes(r)[0]),
    show("straightFlick", (r) => `E ${r.maxE.toFixed(2)} tail ${r.maxL.toFixed(0)} px form ${r.maxRatio.toFixed(2)}× beads ${sizes(r).map((x) => x.toFixed(1)).join("/")}`));
  check(GD, "extreme whip: the strongest form stays within 70-92% of the reference's proportions (2.1-2.75× as long as wide, tail ≤ its length limit) with 4-6 beads of 2-8.5 px, at every frame rate",
    runs.extremeWhip.every((r) => r.maxRatio >= 2.1 && r.maxRatio <= 2.75 && r.maxL <= SP.length + 0.5 && r.pieces.length >= 4 && r.pieces.length <= 6 && sizes(r).every((x) => x >= 2 && x <= 8.5)),
    show("extremeWhip", (r) => `form ${r.maxRatio.toFixed(2)}× tail ${r.maxL.toFixed(0)} px beads ${sizes(r).map((x) => x.toFixed(1)).join("/")}`));
  check(GD, "the tail follows the path it came by: through a 90° turn at 2800 px/s and along an arch it bends (≥ 25°), and it never jumps (no point moves more than 3500 px/s faster than the body)",
    runs.turn90.every((r) => r.bend >= 25) && runs.curvedFlick.every((r) => r.bend >= 25) && ["straightFlick", "curvedFlick", "turn90", "reversal", "extremeWhip"].every((g) => runs[g].every((r) => r.maxExcessStep <= 3500)),
    `bend turn ${runs.turn90.map((r) => r.bend.toFixed(0) + "°").join("/")}, arch ${runs.curvedFlick.map((r) => r.bend.toFixed(0) + "°").join("/")} · worst point speed beyond the body's ${Math.max(...["straightFlick", "curvedFlick", "turn90", "reversal", "extremeWhip"].flatMap((g) => runs[g].map((r) => r.maxExcessStep))).toFixed(0)} px/s`);
  check(GD, "curved flick (an arch at 3200 px/s): the teardrop and its tail (energy ≥ 0.8, form 2.0-2.75×) with 3-6 beads left along the curve; reversal at 2800 px/s: a teardrop with a tail (energy ≥ 0.6, form 1.8-2.75×) that rejoins, at most 3 beads",
    runs.curvedFlick.every((r) => r.maxE >= 0.8 && r.maxRatio >= 2.0 && r.maxRatio <= 2.75 && r.pieces.length >= 3 && r.pieces.length <= 6) && runs.reversal.every((r) => r.maxE >= 0.6 && r.maxRatio >= 1.8 && r.maxRatio <= 2.75 && r.pieces.length <= 3),
    `curved ${show("curvedFlick", (r) => `E ${r.maxE.toFixed(2)} form ${r.maxRatio.toFixed(2)}× ${r.pieces.length}b`)} · reversal ${show("reversal", (r) => `E ${r.maxE.toFixed(2)} form ${r.maxRatio.toFixed(2)}× ${r.pieces.length}b`)}`);
  check(GD, "the expressive state is brief and catches up: the tail is visibly out 120-420 ms per gesture and gone (the approved body again) within 320 ms of the pointer stopping",
    ["straightFlick", "curvedFlick", "turn90", "reversal", "extremeWhip"].every((g) => runs[g].every((r) => r.visibleMs >= 120 && r.visibleMs <= 420 && r.goneAfterStopMs <= 320)),
    ["straightFlick", "curvedFlick", "turn90", "reversal", "extremeWhip"].map((g) => `${g} ${runs[g].map((r) => `${r.visibleMs.toFixed(0)}/${Number.isFinite(r.goneAfterStopMs) ? r.goneAfterStopMs.toFixed(0) : "∞"}`).join(" ")} ms`).join(" · "));
  const spread = (g, f) => { const v = runs[g].map(f); return Math.max(...v) - Math.min(...v); };
  check(GD, "frame-rate independent: across 60/120/144/165 Hz the tail length differs by ≤ 8 px, the proportions by ≤ 0.3 and the bead count by ≤ 1 for every gesture; no non-finite values",
    Object.keys(SPINE_GESTURES).every((g) => spread(g, (r) => r.maxL) <= 8 && spread(g, (r) => r.maxRatio) <= 0.3 && spread(g, (r) => r.pieces.length) <= 1) && Object.values(runs).every((rs) => rs.every((r) => r.nonFinite === 0)),
    Object.keys(SPINE_GESTURES).map((g) => `${g} ±${spread(g, (r) => r.maxL).toFixed(1)} px / ±${spread(g, (r) => r.maxRatio).toFixed(2)} / ±${spread(g, (r) => r.pieces.length)}b`).join(" · "));
  {
    const pres = ["refSparse", "refBalanced", "refHeavy", "refBoundary"], st = {};
    for (const k of pres) { const vals = POOLS[k].values, rs = HZ.map((hz) => R(SPINE_GESTURES.straightFlick, hz, vals)), ws = HZ.map((hz) => R(SPINE_GESTURES.extremeWhip, hz, vals));
      st[k] = { tail: +(rs.reduce((a, r) => a + r.maxL, 0) / rs.length).toFixed(1), ratio: +(rs.reduce((a, r) => a + r.maxRatio, 0) / rs.length).toFixed(2), beads: +(ws.reduce((a, r) => a + r.pieces.length, 0) / ws.length).toFixed(2) }; }
    ev.presets = st;
    check(GD, "the reference presets are a clear progression: sparse < balanced < heavy < boundary in tail length and proportions, and never fewer beads in the whip",
      pres.every((k, i) => i === 0 || (st[k].tail > st[pres[i - 1]].tail && st[k].ratio > st[pres[i - 1]].ratio && st[k].beads >= st[pres[i - 1]].beads)), pres.map((k) => `${k} ${st[k].tail} px / ${st[k].ratio}× / ${st[k].beads} beads`).join(" < "));
  }
  {
    // density: 24 seeded relentless violent scribbles at 120 Hz
    let frames = 0, mat = new Array(8).fill(0), beads = 0, peak = 0, nf = 0, cap = 0;
    for (let s = 1; s <= 24; s++) { const r = R(randomScribble(s), 120); for (const m of r.material) mat[Math.min(7, m)]++; frames += r.material.length; beads += r.beads; peak = Math.max(peak, r.peakMaterial); nf += r.nonFinite; cap = r.capacity; }
    ev.density = { timeWithMaterial: mat.map((x) => +(100 * x / frames).toFixed(1)), beadsPerSecond: +(beads / (24 * 4)).toFixed(2), peakMaterial: peak };
    check(GD, "relentless violent scribbling stays bounded: never more pieces than the capacity (the tail counts once), at most 6 beads per second on average, no non-finite values",
      peak <= cap + 1 && beads / (24 * 4) <= 6 && nf === 0, `capacity ${cap}; peak material ${peak}; ${ev.density.beadsPerSecond} beads/s; time with 0..7 pieces ${ev.density.timeWithMaterial.join("/")} %`);
  }

  // ---------------------------------------------------------------- the real page (Mode B, the default)
  const P = await openPage(B, HTTP + "?mode=B");
  await P.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
  const TUNE = ["spineLength", "spineNodes", "spineStiffness", "spineLag", "spineVOn", "spineRoot", "spineBulb", "spineNeck", "spineTaper", "spineTerminal", "spineIrregular", "spineUnion", "spineHoldMs", "spineRetractMs", "spineShedMin", "spineShedRate", "spineSplashCount", "spineSplashMin", "spineSplashMax", "spineSplashLife", "spineSplashMomentum", "gooJoin"];
  {
    const ui = await P.ev(`(() => { const E = liquidCursorLab.engine; const out = { banner: document.querySelector('#banner-b').textContent, pool: document.querySelector('#pool-preset').value, label: E.state.poolPreset, spine: E.params.spineOn,
      groups: [...document.querySelectorAll('#pool-preset optgroup')].map((g) => g.label + ": " + [...g.children].map((o) => o.value).join(",")),
      tune: ${JSON.stringify(TUNE)}.filter((k) => !document.querySelector('#tune-' + k)) };
      out.keys = ["4", "5", "6", "7", "9", "0", "8"].map((k) => { document.dispatchEvent(new KeyboardEvent("keydown", { key: k })); return E.state.poolPreset + "|" + E.params.spineOn + "|" + E.params.wakeOn; }); return out; })()`);
    ev.ui = ui;
    check(GR, "Mode B opens on \"Reference goo · balanced\" with its banner; keys 4-9 and 0 switch Phase 4 · rich goo · connected goo (previous) · reference sparse · heavy · boundary and back; the 22 reference-goo tuning controls exist",
      ui.pool === "refBalanced" && ui.spine === 1 && ui.banner.startsWith("PHASE 4.5 — REFERENCE GOO") && ui.tune.length === 0 && ui.groups[0].endsWith("balanced,richBalanced,connectedBalanced,refSparse,refBalanced,refHeavy,refBoundary")
        && ui.keys[0].startsWith("Phase 4") && ui.keys[0].endsWith("|0|0") && ui.keys[1].startsWith("Rich goo droplets") && ui.keys[2].startsWith("Connected goo · previous") && ui.keys[2].endsWith("|0|1")
        && ui.keys[3].startsWith("Reference goo · sparse|1") && ui.keys[4].startsWith("Reference goo · heavy|1") && ui.keys[5].startsWith("Reference boundary") && ui.keys[6].startsWith("Reference goo · balanced (default)|1"),
      `${ui.label}; keys → ${ui.keys.map((k) => k.split("|")[0]).join(" → ")}; missing controls ${ui.tune.join(",") || "none"}`);
  }
  {
    // the form on screen: a straight flick at its fullest: one connected surface with the body, solid along the neck and at the
    // terminal lobe, clear space beside the neck
    const t = await P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop, S = D.spine, O = D.tailOut; E.clearDroplets(); E.resetBody(); const p = __lc.points([{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], 1050, 440); __lc.ready(p.start[0], p.start[1]); __lc.seq(p.pts.concat(Array(60).fill(null)));
      let best = null; for (let i = 0; i < 60; i++) { __lc.step(); if (O.on && S.L >= 55) { const u = E.readUniforms(), m = E.readMask(), e = E.state.effDpr, tx = E.state.renderX - 210, ty = E.state.renderY - 210;
        const A = (x, y) => { const px = Math.round((x - tx) * e - 0.5), py = Math.round(m.h - (y - ty) * e - 0.5); return px < 0 || py < 0 || px >= m.w || py >= m.h ? 0 : m.px[(py * m.w + px) * 4 + 3]; };
        const ux = O.x[4] - O.x[2], uy = O.y[4] - O.y[2], ul = Math.hypot(ux, uy) || 1, neck = [O.x[3], O.y[3]], term = [O.x[4], O.y[4]], beside = [O.x[3] - uy / ul * (O.r[3] + 7), O.y[3] + ux / ul * (O.r[3] + 7)];
        best = { frame: i, L: S.L, k: u.uWakeK, comps: __lc.components(), aNeck: A(...neck), aTerm: A(...term), aBeside: A(...beside), neckR: O.r[3], termR: O.r[4], bulbR: O.r[0], neck, term }; break; } }
      return best; })()`);
    ev.tailOnScreen = t;
    check(GR, "the goo is drawn as one surface with the body (one connected piece of liquid), solid along the neck and at the terminal lobe, with clear space beside the neck",
      !!t && t.k > 0 && t.comps === 1 && t.aNeck > 200 && t.aTerm > 200 && t.aBeside < 30, t ? `frame ${t.frame}: tail ${t.L.toFixed(0)} px, ${t.comps} connected piece(s), coverage neck ${t.aNeck}/255 (r ${t.neckR.toFixed(1)}), terminal ${t.aTerm}/255 (r ${t.termR.toFixed(1)}), beside the neck ${t.aBeside}/255; bulb r ${t.bulbR.toFixed(1)}` : "no frame with a drawn-out tail");
    if (t) {
      await P.frames(2); const pts = [t.neck, t.term], on = []; for (const [x, y] of pts) on.push(decodePNG(await P.shot(Math.round(x) - 2, Math.round(y) - 2, 5, 5)).px(2, 2));
      await P.ev("(document.querySelectorAll('.lc-canvas, .lc-bead').forEach((c) => (c.style.opacity = '0')), 1)"); await P.frames(2); const off = []; for (const [x, y] of pts) off.push(decodePNG(await P.shot(Math.round(x) - 2, Math.round(y) - 2, 5, 5)).px(2, 2));
      await P.ev("(document.querySelectorAll('.lc-canvas, .lc-bead').forEach((c) => (c.style.opacity = '')), 1)");
      const err = on.map((p, i) => Math.max(...p.map((v, k) => Math.abs(v - (255 - off[i][k])))));
      check(GR, "difference inversion stays exact over the neck and the terminal lobe: one material with the body, no new colour", err.every((x) => x <= 6) && on.every((p, i) => Math.max(...p.map((v, k) => Math.abs(v - off[i][k]))) > 40), `centre error vs exact inversion: neck ${err[0]}, terminal ${err[1]}`);
    }
    // below the onset speed the body is the approved body: Mode A and the reference goo give identical masks frame by frame
    const maskSig = `(() => { const m = liquidCursorLab.engine.readMask(); let h = 2166136261 >>> 0; for (let i = 0; i < m.px.length; i += 4) { h ^= m.px[i + 3]; h = Math.imul(h, 16777619) >>> 0; } return h; })()`;
    const body = [];
    for (const mode of ["A", "B"]) { await P.ev(`liquidCursorLab.engine.setMode("${mode}"), 1`); await P.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
      body.push(await P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop; E.clearDroplets(); E.resetBody(); const p = __lc.points([{ dx: 1, dy: 0, v: 1200, ms: 400, ramp: 160 }, { dx: 0.6, dy: 0.8, v: 900, ms: 300 }], 1100, 500); __lc.ready(p.start[0], p.start[1]); const t0 = D.tails || 0; __lc.seq(p.pts.concat(Array(40).fill(null)));
        const out = []; let k = 0; for (let i = 0; i < 110; i++) { __lc.step(); k = Math.max(k, E.readUniforms().uWakeK); if (i % 5 === 0) out.push(${maskSig}); } return { sig: out, tails: (D.tails || 0) - t0, k }; })()`)); }
    const same = body[0].sig.filter((h, i) => h === body[1].sig[i]).length;
    ev.bodyUnchanged = { framesCompared: body[0].sig.length, identical: same, tails: body[1].tails };
    check(GR, "the approved body is untouched below the goo's onset: the same 1200 px/s sweep and curve in Mode A and in the reference goo give bit-identical masks on every sampled frame (tail union radius 0)",
      same === body[0].sig.length && body[1].tails === 0 && body[1].k === 0, `${same}/${body[0].sig.length} sampled frames identical; ${body[1].tails} goo bursts; uWakeK ${body[1].k}`);
  }
  {
    // manual controls: a still body thrown into goo along a straight path; the extreme one longer and shedding; Clear ends everything
    const m = await P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop, S = D.spine, out = {}; E.setNatural(false);
      const go = (opts, frames) => { E.clearDroplets(); E.resetBody(); __lc.ready(1250, 440); const b0 = S.shed, t0 = D.tails || 0; let maxL = 0, peak = 0; const ok = E.triggerDroplet(opts);
        for (let i = 0; i < frames; i++) { __lc.hold(1000 / 120); maxL = Math.max(maxL, S.L); peak = Math.max(peak, D.material); }
        return { ok, maxL: Math.round(maxL), beads: S.shed - b0, bursts: (D.tails || 0) - t0, peak, endOn: D.tailOut.on }; };
      out.shed = go({ angleDeg: 180, speed: 420 }, 90); out.strong = go({ angleDeg: 180, speed: 567, strength: 0.9, peak: 1.3 }, 90); out.extreme = go({ angleDeg: 180, speed: 672, strength: 1, extreme: true, peak: 2.05 }, 100);
      out.heavy = go({ angleDeg: 160, speed: 630, strength: 1, peak: 2.1, plan: [{ ms: 120, deg: 70, peak: 1.8 }, { ms: 240, deg: -60, peak: 1.6 }] }, 220);
      E.triggerDroplet({ angleDeg: 0, extreme: true }); __lc.hold(80); E.clearDroplets(); out.after = [D.live, D.tailOut.on, S.on]; E.setNatural(true); return out; })()`);
    ev.manual = m;
    check(GR, "manual controls throw a still body into goo (the tail grows and catches up again), the extreme one longer and shedding beads; the heavy burst shapes more goo; never over capacity; Clear ends everything",
      [m.shed, m.strong, m.extreme, m.heavy].every((x) => x.ok && x.maxL >= 20 && !x.endOn && x.peak <= 6) && m.extreme.maxL > m.shed.maxL && m.extreme.beads >= 1 && m.after[0] === 0 && !m.after[1] && !m.after[2],
      `shed ${m.shed.maxL} px/${m.shed.beads}b · strong ${m.strong.maxL} px/${m.strong.beads}b · extreme ${m.extreme.maxL} px/${m.extreme.beads}b · heavy ${m.heavy.maxL} px/${m.heavy.beads}b, peak ${m.heavy.peak}; after Clear ${m.after.join("/")}`);
  }
  allLogs.push(...P.logs.map((x) => `spine: ${x}`));
  check(GR, "no console errors or warnings (reference goo page)", P.logs.length === 0, P.logs.slice(0, 3).join(" | ") || "none");
  await P.close();
  {
    const C = await openPage(B, HTTP + "?mode=C");
    await C.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
    await C.ev(`(() => { const E = liquidCursorLab.engine; E.clearDroplets(); E.resetBody(); const p = __lc.points([{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], 1050, 440); __lc.ready(p.start[0], p.start[1]); __lc.seq(p.pts.concat(Array(30).fill(null))); for (let i = 0; i < 18; i++) __lc.step(); return 1; })()`);
    await sleep(450);
    const row = await C.ev(`(() => { const dt = [...document.querySelectorAll('#debug dt')].find((d) => d.textContent === "Reference goo"); return dt ? dt.nextElementSibling.textContent : ""; })()`);
    ev.modeC = row;
    check(GR, "Mode C reads out the goo: state, energy and its peak, tail length against its limit, the five radii, beads shed, stress, history and material",
      /^(on|idle) · energy [\d.]+ \(peak [\d.]+\) · tail \d+\/\d+ px · radii [\d./]+ px · beads shed \d+ · stress [\d.]+\/[\d.]+ · history \d+ samples · material \d+$/.test(row), row || "row missing");
    allLogs.push(...C.logs.map((x) => `spine mode C: ${x}`));
    await C.close();
  }
  {
    const F = await openPage(B, FILE + "?mode=B");
    await F.ev(`(${installHelpers.toString()})(), __lc.begin(), 1`);
    const r = await F.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop, S = D.spine; E.setNatural(false); E.resetBody(); __lc.ready(700, 440); const ok = E.triggerDroplet({ angleDeg: 180, extreme: true }); let maxL = 0, wasOn = false;
      for (let i = 0; i < 90; i++) { __lc.hold(1000 / 120); maxL = Math.max(maxL, S.L); wasOn = wasOn || D.tailOut.on; } return [ok, Math.round(maxL), wasOn, D.tailOut.on, E.state.poolPreset, location.protocol]; })()`);
    allLogs.push(...F.logs.map((x) => `spine file: ${x}`));
    check(G, "file://: the reference goo runs without a server (the default snapshot, a manual throw through its whole life), console clean", r[0] && r[1] >= 30 && r[2] && !r[3] && r[4].startsWith("Reference goo · balanced") && r[5] === "file:" && F.logs.length === 0,
      `${r[4]} · tail ${r[1]} px · ended ${!r[3]} · ${r[5]} · console ${F.logs.length ? F.logs[0] : "clean"}`);
    await F.close();
  }
  {
    const Q = await openPage(B, HTTP + "?mode=B");
    await Q.ev(`(${installHelpers.toString()})(), __lc.begin(), 1`);
    const perf = await Q.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop, out = {}; E.setNatural(false);
      const goo = () => { E.clearDroplets(); E.resetBody(); __lc.ready(900, 440); E.triggerDroplet({ angleDeg: 180, extreme: true }); __lc.hold(90); };
      goo(); let t0 = performance.now(); for (let i = 0; i < 6; i++) E.advance(1000 / 120, 1000 / 120); out.gooFrameMs = +((performance.now() - t0) / 6).toFixed(4);
      goo(); out.gooForcedDrawMs = +E.benchDraw(300).toFixed(4); out.gooOn = D.tailOut.on;
      E.clearDroplets(); __lc.ready(900, 440); out.idleForcedDrawMs = +E.benchDraw(300).toFixed(4);
      E.clearDroplets(); E.setNatural(true); return out; })()`);
    ev.perf = perf;
    allLogs.push(...Q.logs.map((x) => `spine perf: ${x}`));
    check(GP, "the reference goo is cheap: a frame with the goo out costs under 1 ms of script; the forced draw with the goo out stays within 1.5× of the idle draw (+0.1 ms)",
      perf.gooOn && perf.gooFrameMs < 1 && perf.gooForcedDrawMs <= perf.idleForcedDrawMs * 1.5 + 0.1, `frame ${perf.gooFrameMs} ms; forced draw goo ${perf.gooForcedDrawMs} ms vs idle ${perf.idleForcedDrawMs} ms`);
    await Q.close();
  }
}
