// Liquid cursor: the production runtime (assets/observatory/liquid-cursor.js) against the approved lab preset
// ("Reference goo · balanced", ?pool=refBalanced). Two proofs:
//   A. dynamics, in Node: every value the production code reads equals the lab's, and the production core run side by
//      side with the lab's own scripts over the same pointer input gives the same state on every frame (body, motion
//      history, spine, tail, beads, bead layout), compared exactly (===), at 60/120/144/165 Hz, for the five evidence
//      gestures, ordinary and fast navigation, sweeps, scribbles, and hover / press / hidden segments;
//   B. pixels, in headless Edge: the lab page and the real Observatory (?cursor=test) driven through the same frame-exact
//      trajectories (with a neutral hit-test overlay, so neither page's own elements change the cursor), reading back the
//      body canvas and every bead tile: state and mask bytes compared, at DPR 1 and 2.
//
//   node labs/liquid-cursor/tools/verify-production.mjs [--evidence] [--http URL] [--skip-browser] [--prod PATH]
//
// --evidence writes labs/liquid-cursor/evidence/integration/production-equivalence.json. Exit code 1 on any difference.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { loadLab, GESTURES, RICH_GESTURES, randomScribble } from "./pool-sim.mjs";
import { SPINE_GESTURES } from "./check-spine.mjs";

const LAB = resolve(dirname(fileURLToPath(import.meta.url)), ".."), ROOT = resolve(LAB, "..", "..");
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const PROD = resolve(opt("--prod", join(ROOT, "assets", "observatory", "liquid-cursor.js"))); // --prod: another copy (the mutation self-test)
const HTTP = opt("--http", "http://127.0.0.1:8315/");
const out = { when: new Date().toISOString(), production: "assets/observatory/liquid-cursor.js", labPreset: "refBalanced", params: {}, dynamics: {}, pixels: {} };
let failures = 0;
const report = (name, pass, detail) => { if (!pass) failures++; console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  ·  " + detail : ""}`); return pass; };

// ---------------------------------------------------------------- A. dynamics in Node
function loadProd() {
  const ctx = { window: {}, Math, performance: { now: () => 0 } };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(PROD, "utf8"), ctx, { filename: "liquid-cursor.js" });
  return ctx.window.HeliosLiquidCursor;
}
const W = loadLab(), L = W.LiquidCursor, LD = W.LiquidDroplet, CFG = W.LIQUID_CURSOR_CONFIG;
const LP = L.paramsFromConfig(CFG, CFG.lab.poolPresets.refBalanced.values);
const prod = loadProd(), K = prod.core, PP = K.P;
{
  const diff = Object.keys(PP).filter((k) => PP[k] !== LP[k]);
  const fdiff = Object.keys(K.F).filter((k) => K.F[k] !== (k === "velocitySmoothingMs" ? CFG.follow.velocitySmoothingMs : CFG.follow[k]));
  out.params = { compared: Object.keys(PP).length + Object.keys(K.F).length, differing: [...diff, ...fdiff], labFlags: { membrane: LP.membrane, spineOn: LP.spineOn, gooOn: LP.gooOn, poolMax: LP.poolMax, hoverRing: LP.hoverRing } };
  report("every value the production runtime reads equals the lab's Reference goo · balanced value", diff.length === 0 && fdiff.length === 0 && LP.membrane === "field" && LP.spineOn === 1 && LP.gooOn === 1 && LP.hoverRing === false,
    `${out.params.compared} values compared${diff.length + fdiff.length ? "; differing: " + [...diff, ...fdiff].join(", ") : ""}; lab flags membrane ${LP.membrane}, spine ${LP.spineOn}, goo ${LP.gooOn}, capacity ${LP.poolMax}`);
}
// the engine's per-frame pipeline (raw velocity smoothing and decay, body, following, goo), identical for both
function runBoth(g, hz, { hover = () => false, pressed = () => false, hidden = () => false, preMs = 300 } = {}) {
  const F = CFG.follow, dt = 1 / hz;
  const lab = { B: L.createBodyState(), D: LD.createDropletSystem() }, pro = { B: K.createBodyState(), D: K.createGoo() };
  const lbody = { x: 0, y: 0, R: 34, s: 1, c: 1, ax: 1, ay: 0, amp: 0, cell: 36, nt: 0 }, pbody = { x: 0, y: 0, R: 34, s: 1, c: 1, ax: 1, ay: 0 };
  const lptr = { vx: 0, vy: 0, allowed: true }, pptr = { vx: 0, vy: 0, allowed: true };
  let t = -preMs / 1000, px = 0, py = 0, vx = 0, vy = 0, rx = 0, ry = 0, frames = 0, first = null, maxDiff = 0, goo = 0, beads = 0, tiles = 0;
  const cmp = (label, a, b) => { if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return; const d = typeof a === "number" ? Math.abs(a - b) : Infinity; maxDiff = Math.max(maxDiff, d); if (!first) first = { frame: frames, t: +(t * 1000).toFixed(2), label, lab: a, production: b }; };
  while (t < g.ms / 1000) {
    const [gx, gy] = t >= 0 ? g.v(t) : [0, 0]; px += gx * dt; py += gy * dt;
    const kv = 1 - Math.exp(-dt * 1000 / F.velocitySmoothingMs); vx += (gx - vx) * kv; vy += (gy - vy) * kv;
    if (gx === 0 && gy === 0) { vx *= Math.exp(-F.velocityDecay * dt); vy *= Math.exp(-F.velocityDecay * dt); }
    const hv = hover(t), pr = pressed(t), hd = hidden(t);
    const inp = { vx, vy, hover: hv, pressed: pr };
    L.stepBody(lab.B, LP, F.maxSubstep, inp, dt); K.stepBody(pro.B, F.maxSubstep, { ...inp }, dt);
    const a = 1 - Math.exp(-LP.followResponse * dt); rx += (px - rx) * a; ry += (py - ry) * a;
    const LB = lab.B, PB = pro.B;
    Object.assign(lbody, { x: rx, y: ry, R: LP.radius * LB.radiusScale, s: LB.stretch, c: LB.compression, ax: LB.ax, ay: LB.ay, amp: LB.noiseAmp, cell: Math.max(1, LP.noiseScale), nt: LB.noiseT });
    Object.assign(pbody, { x: rx, y: ry, R: PP.radius * PB.radiusScale, s: PB.stretch, c: PB.compression, ax: PB.ax, ay: PB.ay });
    lptr.vx = pptr.vx = vx; lptr.vy = pptr.vy = vy;
    lptr.allowed = pptr.allowed = !hd && !pr; // the production gate: hovering never disarms the goo (it still grows the body)
    if (hd) { LD.reset(lab.D, LP, "hidden"); K.reset(pro.D); }
    LD.step(lab.D, LP, lbody, lptr, dt, F.maxSubstep); K.step(pro.D, pbody, pptr, dt, F.maxSubstep);
    t += dt;
    if (t <= 0) continue;
    frames++;
    for (const k of ["svx", "svy", "sspeed", "ax", "ay", "amount", "stretch", "compression", "radiusScale", "noiseAmp", "noiseT", "hoverProgress", "life", "idle"]) cmp("body." + k, LB[k], PB[k]);
    for (const k of ["x", "v"]) { cmp("body.def." + k, LB.def[k], PB.def[k]); cmp("body.hov." + k, LB.hov[k], PB.hov[k]); cmp("body.clk." + k, LB.clk[k], PB.clk[k]); }
    const LDs = lab.D, PDs = pro.D;
    for (const k of ["armedMs", "ax", "ay", "accel", "aPeak", "aAge", "rvx", "rvy", "turnDeg", "rAccel", "lastVx", "lastVy"]) cmp("trigger." + k, LDs.trig[k], PDs.trig[k]);
    for (const k of ["vx", "vy", "px", "py"]) cmp("bodyVelocity." + k, LDs.body[k], PDs.body[k]);
    cmp("tokens", LDs.tokens, PDs.tokens); cmp("seed", LDs.seed, PDs.seed); cmp("nextId", LDs.nextId, PDs.nextId);
    const LS = LDs.spine, PS = PDs.spine;
    for (const k of ["E", "L", "on", "id", "ePeak", "pinched", "dx", "dy", "hn", "hi", "stress", "th", "burstN", "termK", "t", "shed", "slowMs"]) cmp("spine." + k, LS[k], PS[k]);
    for (let i = 0; i < 5; i++) for (const k of ["x", "y", "vx", "vy", "r"]) cmp(`spine.${k}[${i}]`, LS[k][i], PS[k][i]);
    const LO = LDs.tailOut, PO = PDs.tailOut;
    cmp("tail.on", LO.on, PO.on); if (LO.on) { cmp("tail.k", LO.k, PO.k); for (let i = 0; i < 5; i++) for (const k of ["x", "y", "r"]) cmp(`tail.${k}[${i}]`, LO[k][i], PO[k][i]); }
    if (LO.on) goo++;
    let live = 0;
    for (let i = 0; i < 5; i++) {
      const ls = LDs.slots[i], ps = PDs.slots[i];
      cmp(`slot${i}.state`, ls.state, ps.state);
      if (ls.state !== "IDLE") { live++; for (const k of ["x", "y", "vx", "vy", "r", "r0", "alpha", "el", "elV", "kc", "age", "life", "ux", "uy", "absorbed", "kind", "id", "pid", "dragK", "g0", "g1", "growT"]) cmp(`slot${i}.${k}`, ls[k], ps[k]); }
    }
    beads = Math.max(beads, live);
    if (live) { // the bead layout the renderer uses (DPR 1 canvas origin), with its hysteresis carried frame to frame
      const tx = Math.round(rx - 210), ty = Math.round(ry - 210);
      const ll = LD.layout(LDs, tx, ty, 420, 6, "auto", true, 64, LP.poolJoinPx), pl = K.layout(PDs, tx, ty, 420, 6, true, 64, PP.poolJoinPx);
      cmp("layout.nBody", ll.nBody, pl.nBody); cmp("layout.nTiles", ll.nTiles, pl.nTiles); tiles = Math.max(tiles, pl.nTiles);
      for (let k = 0; k < 5; k++) { cmp(`layout.used[${k}]`, ll.used[k], pl.used[k]); if (pl.used[k]) { cmp(`layout.cx[${k}]`, ll.cx[k], pl.cx[k]); cmp(`layout.cy[${k}]`, ll.cy[k], pl.cy[k]); cmp(`layout.count[${k}]`, ll.count[k], pl.count[k]); } }
      for (let i = 0; i < 5; i++) { cmp(`slot${i}.layer`, LDs.slots[i].layer, PDs.slots[i].layer); cmp(`slot${i}.tile`, LDs.slots[i].tile, PDs.slots[i].tile); }
    }
  }
  return { frames, first, maxDiff, gooFrames: goo, peakBeads: beads, peakTiles: tiles, shed: pro.D.spine.shed };
}
{
  const G = { ...SPINE_GESTURES, stationary: GESTURES.stationary, slow: GESTURES.slow, mediumSweep: RICH_GESTURES.mediumSweep, sweep: GESTURES.sweep, sweepFast: GESTURES.sweepFast,
    navigation: RICH_GESTURES.navigation, fastNav: RICH_GESTURES.fastNav, zigzag: RICH_GESTURES.zigzag, extremeFlick: GESTURES.extremeFlick };
  for (let s = 1; s <= 12; s++) G["scribble" + s] = randomScribble(s);
  // the gates: hover, press and a hidden body in the middle of strong motion
  const gated = { hoverMidFlick: [SPINE_GESTURES.extremeWhip, { hover: (t) => t > 0.08 && t < 0.2 }], pressMidFlick: [SPINE_GESTURES.straightFlick, { pressed: (t) => t > 0.05 && t < 0.15 }],
    hiddenMidScribble: [randomScribble(3), { hidden: (t) => t > 0.9 && t < 1.2 }] };
  let total = 0, same = 0; const fails = [];
  for (const [name, g] of Object.entries(G)) for (const hz of [60, 120, 144, 165]) {
    const r = runBoth(g, hz); total++; if (!r.first) same++; else fails.push(`${name}@${hz}: ${JSON.stringify(r.first)}`);
    out.dynamics[`${name}@${hz}`] = { frames: r.frames, identical: !r.first, firstDifference: r.first, gooFrames: r.gooFrames, peakBeads: r.peakBeads, peakTiles: r.peakTiles, beadsShed: r.shed };
  }
  for (const [name, [g, o]] of Object.entries(gated)) for (const hz of [60, 120, 165]) {
    const r = runBoth(g, hz, o); total++; if (!r.first) same++; else fails.push(`${name}@${hz}: ${JSON.stringify(r.first)}`);
    out.dynamics[`${name}@${hz}`] = { frames: r.frames, identical: !r.first, firstDifference: r.first, gooFrames: r.gooFrames, peakBeads: r.peakBeads, beadsShed: r.shed };
  }
  const goo = Object.values(out.dynamics).filter((x) => x.gooFrames > 0).length, beadRuns = Object.values(out.dynamics).filter((x) => x.peakBeads > 0).length, tileRuns = Object.values(out.dynamics).filter((x) => x.peakTiles > 0).length;
  const frames = Object.values(out.dynamics).reduce((n, x) => n + x.frames, 0);
  out.dynamicsSummary = { runs: total, identical: same, frames, runsWithGoo: goo, runsWithBeads: beadRuns, runsWithBeadTiles: tileRuns };
  report("production dynamics are bit-identical to the lab preset: body, motion history, spine, tail, beads and bead layout on every frame", same === total,
    `${same}/${total} runs identical (${frames} frames; ${goo} runs with goo, ${beadRuns} with beads, ${tileRuns} with bead tiles)${fails.length ? "; first: " + fails[0] : ""}`);
}

// ---------------------------------------------------------------- B. pixels in headless Edge
if (!argv.includes("--skip-browser")) {
  try { const r = await fetch(HTTP + "assets/observatory/index.html", { method: "HEAD" }); if (!r.ok) throw new Error("HTTP " + r.status); }
  catch (err) { report(`the Observatory server is reachable at ${HTTP} (start python scripts/observatory/serve.py --no-browser)`, false, err.message); process.exit(1); }
  const { launch, sleep } = await import("./cdp.mjs");
  // page-side driver: the lab helpers' exact 120 Hz stepping (tools/silhouette.mjs), for either engine
  function installDriver() {
    const T = window.HeliosLiquidCursor && window.HeliosLiquidCursor.test;
    if (T) T.setMaterial(0); // compare the unchanged geometric mask shader, independent of the default glass policy
    const E = T ? { setFrozen: T.setFrozen, advance: T.advance, feed: T.feed, resetBody: T.resetBody, readMask: T.readMask, arm: T.P.dropArmMs,
      readBead: (t) => { const L = T.tiles(); return L && L.visible ? L.readMask(t) : null; }, S: T.S, D: T.D, B: T.B }
      : (() => { const X = window.liquidCursorLab.engine; return { setFrozen: X.setFrozen, advance: X.advance, feed: X.feed, resetBody: X.resetBody, readMask: X.readMask, arm: X.params.dropArmMs,
        readBead: (t) => (X.state.bead && X.state.bead.visible ? X.state.bead.readMask(t) : null), S: X.state, D: X.state.drop, B: X.state.body }; })();
    const DT = 1000 / 120, H = (window.__pv = { t: 0, E });
    // a neutral hit-test surface: both pages see the same (non-interactive) element under the pointer
    const ov = document.createElement("div"); ov.id = "pv-neutral"; ov.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:transparent"; document.body.appendChild(ov);
    E.setFrozen(true); H.t = 1e5; // one time base in both pages: sample intervals are then bit-identical
    H.feed = (x, y) => { H.t += DT; E.feed(x, y, H.t); E.advance(DT, DT); };
    H.hold = (ms) => { let left = ms; while (left > 1e-6) { const h = Math.min(DT, left); E.advance(h, DT); left -= h; } H.t += ms; };
    H.points = (segs, x1, y1) => { const pts = []; let x = 0, y = 0;
      for (const g of segs) { const nf = Math.round(g.ms / DT);
        for (let f = 1; f <= nf; f++) { const k = g.ramp ? Math.min(1, f * DT / g.ramp) : 1, v = g.v * k * k * (3 - 2 * k) / 1000, a = (g.turn || 0) * f / nf, dx = g.dx * Math.cos(a) - g.dy * Math.sin(a), dy = g.dx * Math.sin(a) + g.dy * Math.cos(a); x += dx * v * DT; y += dy * v * DT; pts.push([x, y]); } }
      const ox = x1 - x, oy = y1 - y; return { start: [ox, oy], pts: pts.map(([px, py]) => [px + ox, py + oy]) }; };
    H.ready = (x, y) => { H.hold(200); H.feed(x, y); H.hold(200); E.resetBody(); H.hold(E.arm + 20); };
    H.state = () => { const S = E.S, D = E.D, O = D.tailOut; return { x: S.renderX, y: S.renderY, stretch: E.B.stretch, noiseT: E.B.noiseT, E: D.spine.E, L: D.spine.L, tail: O.on ? Array.from(O.x).concat(Array.from(O.y), Array.from(O.r)) : null,
      beads: D.slots.filter((s) => s.state !== "IDLE").map((s) => [s.x, s.y, s.r, s.alpha, s.layer, s.tile]) }; };
    const fnv = (px) => { let h = 2166136261 >>> 0; for (let i = 0; i < px.length; i++) { h ^= px[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
    H.mask = (bytes) => { const m = E.readMask(); let cov = 0; for (let i = 3; i < m.px.length; i += 4) if (m.px[i]) cov++; H.last = m.px; return { w: m.w, h: m.h, hash: fnv(m.px), covered: cov, bytes: bytes ? Array.from(m.px) : null }; };
    H.beadMasks = () => { const outT = []; for (let t = 0; t < 5; t++) { const m = E.readBead(t); if (m) outT.push({ t, w: m.w, tx: m.tx, ty: m.ty, hash: fnv(m.px) }); } return outT; };
    return 1;
  }
  const traj = {
    straightFlick: [[{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], 1050, 440],
    curvedFlick: [[{ dx: 0.5817, dy: -0.8134, v: 3200, ms: 260, ramp: 25, turn: 1.9 }], 1210, 520],
    extremeWhip: [[{ dx: 1, dy: 0, v: 4600, ms: 150, ramp: 18 }, { dx: -0.95, dy: 0.31, v: 4200, ms: 120 }], 900, 470],
  };
  const picks = [0, 6, 12, 18, 24, 30, 36, 44, 52, 60]; // frames after the gesture's first sample
  const B = await launch();
  try {
    async function page(url, ready) {
      const { targetId } = await B.send("Target.createTarget", { url: "about:blank" });
      await B.send("Target.activateTarget", { targetId });
      const { sessionId } = await B.send("Target.attachToTarget", { targetId, flatten: true });
      const s = (m, p) => B.send(m, p, sessionId), logs = [];
      const l = (msg) => { if (msg.sessionId === sessionId && (msg.method === "Runtime.exceptionThrown" || (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error"))) logs.push(JSON.stringify(msg.params).slice(0, 300)); };
      B.listeners.add(l);
      await s("Runtime.enable"); await s("Page.enable");
      const ev = async (e) => { const r = await s("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
      return { s, ev, logs, targetId, ready, url, close: async () => { B.listeners.delete(l); await B.send("Target.closeTarget", { targetId }); } };
    }
    async function load(P, dpr) {
      await P.s("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: dpr, mobile: false });
      await P.s("Page.navigate", { url: P.url });
      for (let i = 0; i < 100; i++) { if (await P.ev(P.ready).catch(() => false)) break; await sleep(60); }
      await P.ev(`(${installDriver.toString()})()`);
    }
    const labP = await page(`${HTTP}labs/liquid-cursor/index.html?mode=B&pool=refBalanced`, "document.readyState === 'complete' && !!window.liquidCursorLab");
    const proP = await page(`${HTTP}assets/observatory/index.html?cursor=test`, "document.readyState === 'complete' && !!(window.HeliosLiquidCursor && window.HeliosLiquidCursor.test)");
    let frames = 0, identical = 0, bead = 0, beadSame = 0, stateSame = 0; const diffs = [];
    for (const dpr of [1, 2]) {
      await load(labP, dpr); await load(proP, dpr);
      for (const [name, [segs, x1, y1]] of Object.entries(traj)) {
        const prep = `(() => { const p = __pv.points(${JSON.stringify(segs)}, ${x1}, ${y1}); __pv.ready(p.start[0], p.start[1]); __pv.pts = p.pts; __pv.i = 0; return p.pts.length; })()`;
        await labP.ev(prep); await proP.ev(prep);
        let done = 0;
        for (const f of picks) {
          const adv = `(() => { while (__pv.i < ${f}) { const p = __pv.pts[__pv.i]; if (p) __pv.feed(p[0], p[1]); else __pv.hold(1000 / 120); __pv.i++; } return 1; })()`;
          await labP.ev(adv); await proP.ev(adv); done = f;
          const [ls, ps] = [await labP.ev("__pv.state()"), await proP.ev("__pv.state()")];
          const sSame = JSON.stringify(ls) === JSON.stringify(ps); if (sSame) stateSame++;
          else if (!out.firstStateDiff) { const d = {}; for (const k of Object.keys(ls)) if (JSON.stringify(ls[k]) !== JSON.stringify(ps[k])) d[k] = { lab: ls[k], production: ps[k] }; out.firstStateDiff = { at: `${name} dpr${dpr} f${f}`, d }; console.log("first state difference", JSON.stringify(out.firstStateDiff).slice(0, 900)); }
          let [lm, pm] = [await labP.ev("__pv.mask(false)"), await proP.ev("__pv.mask(false)")];
          let nd = 0, md = 0;
          if (lm.hash !== pm.hash || lm.w !== pm.w) { // quantify a difference byte by byte
            [lm, pm] = [await labP.ev("__pv.mask(true)"), await proP.ev("__pv.mask(true)")];
            for (let i = 0; i < Math.min(lm.bytes.length, pm.bytes.length); i++) { const d = Math.abs(lm.bytes[i] - pm.bytes[i]); if (d) { nd++; md = Math.max(md, d); } }
            if (lm.bytes.length !== pm.bytes.length) nd = Math.max(nd, 1);
          }
          frames++; if (nd === 0 && lm.w === pm.w) identical++; else diffs.push(`${name} dpr${dpr} f${f}: ${nd} bytes differ (max ${md})`);
          const [lb, pb] = [await labP.ev("__pv.beadMasks()"), await proP.ev("__pv.beadMasks()")];
          for (const t of pb) { const o = lb.find((x) => x.t === t.t); bead++; if (o && o.tx === t.tx && o.ty === t.ty && o.w === t.w && o.hash === t.hash) beadSame++; else diffs.push(`${name} dpr${dpr} f${f} tile ${t.t} differs`); }
          if (lb.length !== pb.length) diffs.push(`${name} dpr${dpr} f${f}: ${lb.length} vs ${pb.length} tiles`);
          out.pixels[`${name}@dpr${dpr}@f${f}`] = { stateIdentical: sSame, maskBytesDiffering: nd, maxByteDiff: md, covered: pm.covered, tail: !!ps.tail, beads: ps.beads.length, beadTiles: pb.length };
        }
        void done;
      }
    }
    out.pixelsSummary = { frames, identicalMasks: identical, identicalStates: stateSame, beadTiles: bead, identicalBeadTiles: beadSame, differences: diffs.slice(0, 10) };
    report("the real Observatory draws the same pixels as the lab preset: the body canvas and every bead tile, byte for byte, with the same engine state", identical === frames && beadSame === bead && stateSame === frames && labP.logs.length + proP.logs.length === 0,
      `${identical}/${frames} body-canvas masks identical, ${stateSame}/${frames} engine states identical, ${beadSame}/${bead} bead tiles identical (3 gestures × 10 moments × DPR 1 and 2)${diffs.length ? "; " + diffs.slice(0, 3).join("; ") : ""}${labP.logs.length + proP.logs.length ? "; console: " + [...labP.logs, ...proP.logs][0] : ""}`);
    await labP.close(); await proP.close();
  } finally { await B.close(); }
}

if (argv.includes("--evidence")) { const d = join(LAB, "evidence", "integration"); mkdirSync(d, { recursive: true }); writeFileSync(join(d, "production-equivalence.json"), JSON.stringify(out, null, 1) + "\n"); console.log("written", join(d, "production-equivalence.json")); }
console.log(failures ? `${failures} failure(s)` : "all equivalent");
process.exit(failures ? 1 : 0);
