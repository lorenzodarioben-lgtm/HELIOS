// Liquid cursor lab: is the "Phase 2 original" preset still the body committed in 2fff2cc, and is the approved
// "Santioni refined" default still the body committed in 5f6033d (with the droplet system idle)?
// (1) Body dynamics: the 2fff2cc stepBody with its own defaults against today's stepBody with the phase2Original preset,
//     on the same 6000-step input script at 60/120/144/165 Hz (motion, hover, click, rest).
// (2) Shader: both fragment shaders compiled in headless Edge with equivalent uniforms, read back and compared pixel by pixel.
//
//   node labs/liquid-cursor/tools/verify-original.mjs [--evidence] [--http URL]
//
// (3) Phase 4: the approved Phase 3 droplet (d64ec76) against today's capacity-1 snapshot and against one event in the Phase 4
//     pool, through the pure-dynamics simulation (tools/pool-sim.mjs) at 60/120/144/165 Hz.
// (4) Phase 4.5: the Phase 4 default as committed in 0c75065 against today's "Phase 4 · current balanced" snapshot (the
//     default is now rich goo), every gesture at four frame rates and random scribbles.
//
// Reads 2fff2cc, 5f6033d, d64ec76 and 0c75065 through git (safe.directory is passed per command). --evidence writes
// evidence/phase4-reference/body-equivalence.json (earlier records in evidence/phase2-refine/, phase3/ and phase4/ are kept).
// The refined body's only intended difference since 5f6033d is the Phase 3 idle-draw fix: the resting membrane uses the
// same frame's life, so its fading amplitude can differ by a few hundredths of a pixel for a frame.
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openPage } from "./cdp.mjs";
import { loadLab, simulate, GESTURES, randomScribble } from "./pool-sim.mjs";

const LAB = resolve(dirname(fileURLToPath(import.meta.url)), ".."), REPO = resolve(LAB, "..", ".."), REF = "2fff2cc";
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const HTTP = opt("--http", "http://127.0.0.1:8315/labs/liquid-cursor/");
const git = (...a) => execFileSync("git", ["-c", `safe.directory=${REPO.replace(/\\/g, "/")}`, ...a], { cwd: REPO, encoding: "utf8" });
const oldSrc = git("show", `${REF}:labs/liquid-cursor/liquid-cursor.js`), oldCfg = git("show", `${REF}:labs/liquid-cursor/config.js`);
const newSrc = readFileSync(join(LAB, "liquid-cursor.js"), "utf8"), newCfg = readFileSync(join(LAB, "config.js"), "utf8");
const load = (cfg, eng) => { const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(cfg, ctx); vm.runInContext(eng, ctx); return ctx.window; };
const O = load(oldCfg, oldSrc), N = load(newCfg, newSrc);
const REF2 = "5f6033d", r2Src = git("show", `${REF2}:labs/liquid-cursor/liquid-cursor.js`), r2Cfg = git("show", `${REF2}:labs/liquid-cursor/config.js`), R2 = load(r2Cfg, r2Src);

// (1) dynamics
const PO = O.LiquidCursor.paramsFromConfig(O.LIQUID_CURSOR_CONFIG), PN = N.LiquidCursor.paramsFromConfig(N.LIQUID_CURSOR_CONFIG, N.LIQUID_CURSOR_CONFIG.lab.presets.phase2Original.values);
const BO = O.LiquidCursor.createBodyState(), BN = N.LiquidCursor.createBodyState();
const fields = ["stretch", "compression", "noiseAmp", "phase", "radiusScale", "life", "hoverProgress", "ax", "ay", "sspeed", "amount"];
let seed = 7, steps = 0, maxDiff = 0, worst = "", stateMismatch = 0;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let i = 0; i < 6000; i++) {
  const ph = Math.floor(i / 400) % 5, dt = [1 / 60, 1 / 120, 1 / 144, 1 / 165][i % 4];
  const inp = { vx: ph === 0 ? 0 : (rnd() - 0.3) * 4000 * (ph % 2 ? 1 : 0.3), vy: ph === 3 ? (rnd() - 0.5) * 3000 : 0, hover: ph === 2 || (ph === 4 && i % 97 < 50), pressed: ph === 4 && i % 53 < 20 };
  O.LiquidCursor.stepBody(BO, PO, 1 / 240, inp, dt); N.LiquidCursor.stepBody(BN, PN, 1 / 240, { ...inp }, dt); steps++;
  for (const f of fields) { const d = Math.abs(BO[f] - BN[f]); if (d > maxDiff) { maxDiff = d; worst = `${f} at step ${i}`; } }
  if (BO.state !== BN.state) stateMismatch++;
}
const dynamics = { steps, fields, maxAbsDiff: maxDiff, worst: worst || "none", stateMismatches: stateMismatch };
console.log(`dynamics: ${steps} steps, max |2fff2cc − today| = ${maxDiff} (${dynamics.worst}), state mismatches ${stateMismatch}`);
// the approved refined body against 5f6033d: every tunable, and the dynamics on the same input script
const PR = R2.LiquidCursor.paramsFromConfig(R2.LIQUID_CURSOR_CONFIG), PT = N.LiquidCursor.paramsFromConfig(N.LIQUID_CURSOR_CONFIG);
const tunDiff = Object.keys(PR).filter((k) => PR[k] !== PT[k]);
const BR = R2.LiquidCursor.createBodyState(), BT = N.LiquidCursor.createBodyState(), rMax = Object.fromEntries([...fields, "noiseT"].map((f) => [f, 0]));
seed = 7;
for (let i = 0; i < 6000; i++) {
  const ph = Math.floor(i / 400) % 5, dt = [1 / 60, 1 / 120, 1 / 144, 1 / 165][i % 4];
  const inp = { vx: ph === 0 ? 0 : (rnd() - 0.3) * 4000 * (ph % 2 ? 1 : 0.3), vy: ph === 3 ? (rnd() - 0.5) * 3000 : 0, hover: ph === 2 || (ph === 4 && i % 97 < 50), pressed: ph === 4 && i % 53 < 20 };
  R2.LiquidCursor.stepBody(BR, PR, 1 / 240, inp, dt); N.LiquidCursor.stepBody(BT, PT, 1 / 240, { ...inp }, dt);
  for (const f in rMax) rMax[f] = Math.max(rMax[f], Math.abs(BR[f] - BT[f]));
}
const refinedDyn = { tunablesCompared: Object.keys(PR).length, tunablesDiffering: tunDiff, maxAbsDiff: rMax };
const refinedDynOk = tunDiff.length === 0 && Object.entries(rMax).every(([k, v]) => (k === "noiseAmp" ? v < 0.02 : v === 0));
console.log(`refined vs ${REF2}: ${tunDiff.length} of ${Object.keys(PR).length} tunables differ; dynamics differ only in noiseAmp (max ${rMax.noiseAmp.toExponential(2)} px): ${refinedDynOk}`);

// (3) the approved Phase 3 droplet (d64ec76): capacity 1 and a single event in the default pool
const P3 = loadLab({ "config.js": git("show", "d64ec76:labs/liquid-cursor/config.js"), "liquid-cursor.js": git("show", "d64ec76:labs/liquid-cursor/liquid-cursor.js"), "droplet.js": git("show", "d64ec76:labs/liquid-cursor/droplet.js") }), NOW = loadLab();
const trace = (Wx, vals, g, hz) => JSON.stringify(simulate(Wx, g, { hz, params: vals }).events.map((e) => [e.kind === "satellite" ? "s" : "u", e.startMs, e.releaseMs, e.r0, e.ux, e.uy, e.vRelease, e.travel, e.endMs, e.lastAlpha, e.lastR, e.states.join(">")]));
const p3 = { capacity1: { same: 0, total: 0 }, defaultPoolOneEvent: { same: 0, total: 0 } };
for (const k of ["balanced", "balancedOriginal", "shortNeck", "longNeck"]) for (const hz of [60, 120, 144, 165]) for (const g of ["flick", "turn", "reversal", "zigzag", "scribble", "sweep"]) {
  p3.capacity1.total++; if (trace(P3, P3.LIQUID_CURSOR_CONFIG.lab.dropletPresets[k].values, GESTURES[g], hz) === trace(NOW, { ...NOW.LIQUID_CURSOR_CONFIG.lab.dropletPresets[k].values, poolMax: 1 }, GESTURES[g], hz)) p3.capacity1.same++;
}
const NOWP4 = NOW.LIQUID_CURSOR_CONFIG.lab.poolPresets.balanced.values; // the Phase 4 default, kept whole as a snapshot
for (const hz of [60, 120, 144, 165]) for (const g of ["flick", "turn", "reversal"]) { p3.defaultPoolOneEvent.total++; if (trace(P3, {}, GESTURES[g], hz) === trace(NOW, NOWP4, GESTURES[g], hz)) p3.defaultPoolOneEvent.same++; }
const pass3 = p3.capacity1.same === p3.capacity1.total && p3.defaultPoolOneEvent.same === p3.defaultPoolOneEvent.total;
console.log(`approved Phase 3 droplet (d64ec76): capacity 1 ${p3.capacity1.same}/${p3.capacity1.total} identical; one event in the Phase 4 pool ${p3.defaultPoolOneEvent.same}/${p3.defaultPoolOneEvent.total} identical`);
// (4) the Phase 4 default (0c75065) against today's "Phase 4 · current balanced" snapshot
const P4 = loadLab({ "config.js": git("show", "0c75065:labs/liquid-cursor/config.js"), "liquid-cursor.js": git("show", "0c75065:labs/liquid-cursor/liquid-cursor.js"), "droplet.js": git("show", "0c75065:labs/liquid-cursor/droplet.js") });
const trace4 = (Wx, vals, g, hz) => { const r = simulate(Wx, g, { hz, params: vals }); return JSON.stringify(r.events.map((e) => [e.kind, e.startMs, e.releaseMs, e.r0, e.ux, e.uy, e.vRelease, e.travel, e.endMs, e.lastAlpha, e.lastR, e.states.join(">")])) + `|${r.suppressed}|${r.merges}`; };
const p4 = { same: 0, total: 0 };
for (const g of Object.keys(GESTURES)) for (const hz of [60, 120, 144, 165]) { p4.total++; if (trace4(P4, {}, GESTURES[g], hz) === trace4(NOW, NOWP4, GESTURES[g], hz)) p4.same++; }
for (let s = 1; s <= 40; s++) { const hz = [60, 120, 144, 165][s % 4]; p4.total++; if (trace4(P4, {}, randomScribble(s), hz) === trace4(NOW, NOWP4, randomScribble(s), hz)) p4.same++; }
const pass4 = p4.same === p4.total;
console.log(`Phase 4 default (0c75065) vs today's "Phase 4 · current balanced": ${p4.same}/${p4.total} runs identical`);

// (2) shader pixels
const grab = (src, name) => src.match(new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`))[1];
const B = await launch(), P = await openPage(B, HTTP + "?mode=A");
const shader = await P.ev(`(() => {
  const VS = ${JSON.stringify(grab(newSrc, "VS"))}, FO = ${JSON.stringify(grab(oldSrc, "FS"))}, FN = ${JSON.stringify(grab(newSrc, "FS"))}, W = 840;
  function render(fs, U) {
    const c = document.createElement("canvas"); c.width = c.height = W; const gl = c.getContext("webgl2", { premultipliedAlpha: true, antialias: false });
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); gl.useProgram(p);
    gl.bindVertexArray(gl.createVertexArray()); gl.viewport(0, 0, W, W);
    for (const [k, v] of Object.entries(U)) { const l = gl.getUniformLocation(p, k); if (!l) continue; const a = [].concat(v); gl["uniform" + a.length + "f"](l, ...a); }
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const px = new Uint8Array(W * W * 4); gl.readPixels(0, 0, W, W, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.getExtension("WEBGL_lose_context").loseContext(); return px;
  }
  const base = { uSize: [W, W], uCenter: [420.37, 419.61], uAA: 1, uRingR: 54, uRingW: 3, uRaw: [430, 410], uVelRaw: [900, -300], uVelSmooth: [800, -200],
    uPlainAlpha: 0.55, uPlainColor: [0.85, 0.17, 0.55], uAlpha: 1, uNoiseK: 4, uRadius: 68, uRing: 0, uDebug: 0, uPlain: 0 };
  const states = [["rest", { uAxis: [1, 0], uStretch: 1, uNoiseAmp: 1.4, uPhase: 2.3 }], ["full stretch, diagonal", { uAxis: [0.7071, -0.7071], uStretch: 1.42, uNoiseAmp: 4.4, uPhase: 17.9 }],
    ["mid stretch", { uAxis: [0.94, 0.342], uStretch: 1.2, uNoiseAmp: 2.6, uPhase: 40.1 }], ["squash", { uAxis: [0, 1], uStretch: 0.95, uNoiseAmp: 1.5, uPhase: 61.0 }],
    ["hover ring", { uAxis: [1, 0], uStretch: 1.05, uNoiseAmp: 0.6, uPhase: 5, uRing: 1, uRadius: 86 }], ["debug marks", { uAxis: [0.6, 0.8], uStretch: 1.3, uNoiseAmp: 3, uPhase: 9, uDebug: 1 }],
    ["plain mask", { uAxis: [1, 0], uStretch: 1.25, uNoiseAmp: 2, uPhase: 3, uPlain: 1 }]];
  return states.map(([name, st]) => {
    const U = { ...base, ...st }, a = render(FO, U), b = render(FN, { ...U, uCompress: 1 / U.uStretch, uModel: 0, uHarm: [1, 1, 1], uCell: 72, uNoiseT: 0 });
    let diff = 0, maxd = 0, cov = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) diff++; if (d > maxd) maxd = d; if ((i & 3) === 3 && a[i]) cov++; }
    return { name, coveredPixels: cov, differingChannelValues: diff, maxChannelDiff: maxd };
  });
})()`);
// the refined body's field membrane and compression through both shaders, droplet uniforms left at zero (no droplet)
const refinedShader = await P.ev(`(() => {
  const VS = ${JSON.stringify(grab(newSrc, "VS"))}, FR = ${JSON.stringify(grab(r2Src, "FS"))}, FN = ${JSON.stringify(grab(newSrc, "FS"))}, W = 840;
  function render(fs, U) {
    const c = document.createElement("canvas"); c.width = c.height = W; const gl = c.getContext("webgl2", { premultipliedAlpha: true, antialias: false });
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); gl.useProgram(p);
    gl.bindVertexArray(gl.createVertexArray()); gl.viewport(0, 0, W, W);
    for (const [k, v] of Object.entries(U)) { const l = gl.getUniformLocation(p, k); if (!l) continue; const a = [].concat(v); gl["uniform" + a.length + "f"](l, ...a); }
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const px = new Uint8Array(W * W * 4); gl.readPixels(0, 0, W, W, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.getExtension("WEBGL_lose_context").loseContext(); return px;
  }
  const base = { uSize: [W, W], uCenter: [420.37, 419.61], uAA: 1, uRadius: 68, uAlpha: 1, uModel: 1, uCell: 72, uHarm: [1, 1, 1], uNoiseK: 4, uPlainAlpha: 0.55, uPlainColor: [0.85, 0.17, 0.55],
    uRingR: 54, uRingW: 3, uRaw: [430, 410], uVelRaw: [900, -300], uVelSmooth: [800, -200], uRing: 0, uDebug: 0, uPlain: 0 };
  const states = [["rest", { uAxis: [1, 0], uStretch: 1, uCompress: 1, uNoiseAmp: 0.5, uNoiseT: 3.1 }], ["full stretch, diagonal", { uAxis: [0.7071, -0.7071], uStretch: 1.42, uCompress: Math.pow(1.42, -0.75), uNoiseAmp: 1.4, uNoiseT: 17.3 }],
    ["squash", { uAxis: [0, 1], uStretch: 0.95, uCompress: Math.pow(0.95, -0.75), uNoiseAmp: 0.6, uNoiseT: 40 }], ["debug marks", { uAxis: [0.6, 0.8], uStretch: 1.3, uCompress: Math.pow(1.3, -0.75), uNoiseAmp: 1, uNoiseT: 9, uDebug: 1 }],
    ["plain mask", { uAxis: [1, 0], uStretch: 1.25, uCompress: Math.pow(1.25, -0.75), uNoiseAmp: 1, uNoiseT: 5, uPlain: 1 }]];
  return states.map(([name, st]) => { const U = { ...base, ...st }, a = render(FR, U), b = render(FN, U); let diff = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++; return { name, differingChannelValues: diff }; });
})()`);
for (const r of refinedShader) console.log(`refined shader ${r.name.padEnd(24)} ${r.differingChannelValues} differing channel values`);
await P.close(); await B.close();
for (const r of shader) console.log(`shader ${r.name.padEnd(24)} ${r.coveredPixels} covered px, ${r.differingChannelValues} differing channel values, max diff ${r.maxChannelDiff}/255`);
const pass = maxDiff === 0 && stateMismatch === 0 && shader.every((r) => r.differingChannelValues === 0);
const pass2 = refinedDynOk && refinedShader.every((r) => r.differingChannelValues === 0);
const out = { when: new Date().toISOString(), phase2Original: { reference: REF, dynamics, shader, identical: pass },
  santioniRefined: { reference: REF2, dynamics: refinedDyn, shader: refinedShader, unchanged: pass2, note: "noiseAmp may differ by < 0.02 px for a frame while the resting membrane fades (the Phase 3 idle-draw fix); everything else is exact" },
  approvedPhase3Droplet: { reference: "d64ec76", ...p3, identical: pass3, note: "pure dynamics through tools/pool-sim.mjs: event times, size, direction, release, travel, fade and state sequence, at 60/120/144/165 Hz" },
  phase4Pool: { reference: "0c75065", ...p4, identical: pass4, note: "the 0c75065 default against today's \"Phase 4 · current balanced\" snapshot: every gesture at 60/120/144/165 Hz and 40 random scribbles, events, suppression count and merges" } };
if (argv.includes("--evidence")) { const d = join(LAB, "evidence", "phase4-reference"); mkdirSync(d, { recursive: true }); writeFileSync(join(d, "body-equivalence.json"), JSON.stringify(out, null, 1) + "\n"); }
console.log(pass ? `IDENTICAL: the Phase 2 original preset reproduces ${REF}` : `DIFFERENT from ${REF}`);
console.log(pass2 ? `UNCHANGED: the Santioni refined body reproduces ${REF2} (droplet idle)` : `CHANGED since ${REF2}`);
console.log(pass3 ? "REPRODUCED: the approved Phase 3 droplet (d64ec76), one slot at a time" : "CHANGED: the Phase 3 droplet differs from d64ec76");
console.log(pass4 ? "REPRODUCED: the Phase 4 pool (0c75065) as the \"Phase 4 · current balanced\" snapshot" : "CHANGED: the Phase 4 snapshot differs from 0c75065");
process.exit(pass && pass2 && pass3 && pass4 ? 0 : 1);
