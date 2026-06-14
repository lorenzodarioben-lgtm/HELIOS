// Liquid cursor lab: silhouette diagnosis for the Phase 2 fidelity correction.
// Drives identical scripted trajectories (exact 120 Hz frames, synthetic mouse samples) through body variants, measures
// the actual shader output (readMask) and captures the composited result over the white panel.
//
//   node labs/liquid-cursor/tools/diagnose-silhouette.mjs [--out DIR] [--evidence] [--http URL] [--variants a,b,...] [--extra JSON|@file]
//
// --evidence writes into labs/liquid-cursor/evidence/phase2-refine/diagnosis/. Needs the Observatory server (serve.py).
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openPage, labelledSheet, sleep } from "./cdp.mjs";
import { installHelpers } from "./silhouette.mjs";

const LAB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = argv.includes("--evidence") ? join(LAB, "evidence", "phase2-refine", "diagnosis") : opt("--out", mkdtempSync(join(tmpdir(), "lc-diag-")));
const HTTP = opt("--http", "http://127.0.0.1:8315/labs/liquid-cursor/");
mkdirSync(OUT, { recursive: true });

// Body variants: a preset plus overrides (and harmonic gains for isolating the original's terms).
const OFF = { baseNoise: 0, maxNoise: 0 };
const VARIANTS = {
  original: { preset: "phase2Original", label: "Phase 2 original (harmonics 4/6/9, 0.7 → 2.2 px, exponent 1)" },
  originalNoNoise: { preset: "phase2Original", params: OFF, label: "original, membrane off (pure SDF ellipse)" },
  originalK4: { preset: "phase2Original", diag: { harmonicGains: [1, 0, 0] }, label: "original, k = 4 term only" },
  originalK6: { preset: "phase2Original", diag: { harmonicGains: [0, 1, 0] }, label: "original, k = 6 term only" },
  originalK9: { preset: "phase2Original", diag: { harmonicGains: [0, 0, 1] }, label: "original, k = 9 term only" },
  originalHalfAmp: { preset: "phase2Original", params: { baseNoise: 0.35, maxNoise: 1.1 }, label: "original harmonics at half amplitude" },
  originalFieldNoise: { preset: "phase2Original", params: { membrane: "field" }, label: "original amplitudes, field membrane instead" },
  briefRanges: { preset: "santioniRefined", params: { noiseScale: 26, baseNoise: 0.3, maxNoise: 1.2 }, label: "field at the brief's starting ranges (0.3 → 1.2 px, 26 px)" },
  refinedCell20: { preset: "santioniRefined", params: { noiseScale: 20 }, label: "refined, 20 px features" },
  refinedCell48: { preset: "santioniRefined", params: { noiseScale: 48 }, label: "refined, 48 px features" },
  refinedExact: { preset: "santioniRefined", params: { compressionExponent: 1 }, label: "refined, exponent 1 (1/s, exact area)" },
  refinedSqrt: { preset: "santioniRefined", params: { compressionExponent: 0.5 }, label: "refined, exponent 0.5 (1/√s)" },
  refinedNoNoise: { preset: "santioniRefined", params: OFF, label: "refined, membrane off" },
  refined: { preset: "santioniRefined", label: "Santioni refined (new default)" },
};
const extraArg = opt("--extra", "{}"), EXTRA = JSON.parse(extraArg.startsWith("@") ? readFileSync(extraArg.slice(1), "utf8") : extraArg);
Object.assign(VARIANTS, EXTRA);
const chosen = (opt("--variants", "") || (Object.keys(EXTRA).length ? Object.keys(EXTRA) : Object.keys(VARIANTS)).join(",")).split(",").filter((k) => k in VARIANTS);
const STRIPS = ["original", "refined"].filter((k) => chosen.includes(k));

// Scripted scenarios, all ending with the body centred on C (blank white panel E). Speeds are CSS px/s.
const C = [520, 870], D = Math.SQRT1_2;
const SCENARIOS = {
  restAlive: [`__lc.rest(${C}, 700)`, "rest, 0.7 s (membrane alive)"],
  restStill: [`__lc.rest(${C}, 3600)`, "rest, 3.6 s (membrane stilled)"],
  ordinary: [`__lc.path([{ dx: 1, dy: 0, v: 800, ms: 350, ramp: 100 }], ${C})`, "→ 800 px/s"],
  aggressive: [`__lc.path([{ dx: 1, dy: 0, v: 2600, ms: 300, ramp: 120 }], ${C})`, "→ 2600 px/s"],
  diagonal: [`__lc.path([{ dx: ${D}, dy: ${D}, v: 2600, ms: 300, ramp: 120 }], ${C})`, "↘ 2600 px/s"],
  turn: [`__lc.path([{ dx: 1, dy: 0, v: 2200, ms: 220, ramp: 120 }, { dx: 0, dy: 1, v: 2200, ms: 50 }], ${C})`, "→ then ↓, 50 ms after the turn"],
  stop40: [`(__lc.path([{ dx: 1, dy: 0, v: 2600, ms: 300, ramp: 120 }], ${C}), __lc.hold(40))`, "40 ms after a 2600 px/s stop"],
  stop120: [`(__lc.path([{ dx: 1, dy: 0, v: 2600, ms: 300, ramp: 120 }], ${C}), __lc.hold(120))`, "120 ms after the stop"],
};

async function applyVariant(P, v) {
  await P.ev(`(() => { const s = document.querySelector('#preset'); s.value = ${JSON.stringify(v.preset)}; s.dispatchEvent(new Event('change'));
    const E = liquidCursorLab.engine; E.setParams(${JSON.stringify(v.params || {})}); E.setDiagnostic(${JSON.stringify(v.diag || {})}); return 1; })()`);
}
const at = (P) => P.ev("[liquidCursorLab.engine.state.renderX, liquidCursorLab.engine.state.renderY]");
const crop = async (P, w = 160, h = 112) => { const [x, y] = await at(P); return Buffer.from(await P.shot(Math.round(x - w / 2), Math.round(y - h / 2), w, h), "base64"); };

async function run() {
  const B = await launch(), results = { when: new Date().toISOString(), browser: B.version, centreCss: C, variants: {}, strips: {}, notes: {} };
  try {
    for (const dpr of [2, 1]) {
      const P = await openPage(B, HTTP + "?mode=A", { dpr });
      await P.ev(`(${installHelpers.toString()})(), __lc.begin()`);
      const rows = [];
      for (const key of chosen) {
        const v = VARIANTS[key], cells = [];
        await applyVariant(P, v);
        for (const [name, [script]] of Object.entries(SCENARIOS)) {
          await P.ev(`${script}, 1`); await P.frames(2);
          if (dpr === 2) {
            const m = await P.ev("__lc.analyse()");
            ((results.variants[key] ||= { label: v.label, preset: v.preset, params: v.params || {}, diag: v.diag || {}, scenarios: {} }).scenarios[name] = m);
          }
          cells.push(await crop(P));
        }
        rows.push({ label: v.label, cells });
      }
      const note = `Identical scripted 120 Hz trajectories for every row (headless Edge, DPR ${dpr}, difference mask over the white lab panel, crops 160 × 112 CSS px at native resolution). Harmonic gains isolate one term of the original membrane.`;
      writeFileSync(join(OUT, `diagnosis-dpr${dpr}.png`), await labelledSheet(B, { title: `Primary body silhouette diagnosis · DPR ${dpr}`, note, columns: Object.values(SCENARIOS).map((s) => s[1]), rows }));
      // time strips: resting membrane life and fade (0 to 3.6 s), and a sustained 1500 px/s orbit (boiling check)
      if (dpr === 2 && STRIPS.length) {
        const srows = [], T = [17, 350, 700, 1050, 1400, 2100, 2800, 3600];
        for (const key of STRIPS) {
          await applyVariant(P, VARIANTS[key]);
          const rest = [], restM = []; let prev = 0;
          await P.ev(`__lc.rest(${C}, 0)`);
          for (const t of T) { await P.ev(`__lc.hold(${t - prev})`); prev = t; await P.frames(2); rest.push(await crop(P, 110, 110)); restM.push(await P.ev("(() => { const m = __lc.analyse({ n: 720 }); return { ampCss: m.ampCss, maxResidualCss: m.maxResidualCss, areaCss: m.areaCss, top: m.top[0] }; })()")); }
          srows.push({ label: `${VARIANTS[key].label}: rest, ${T.join(" / ")} ms`, cells: rest });
          const orb = [], orbM = [];
          await P.ev(`__lc.orbitStart(${C[0]}, ${C[1] + 10}, 80), __lc.orbitRun(1500, 400)`);
          for (let i = 0; i < 8; i++) { await P.ev("__lc.orbitRun(1500, 60)"); await P.frames(2); orb.push(await crop(P, 110, 110)); orbM.push(await P.ev("(() => { const m = __lc.analyse({ n: 720 }); return { stretch: m.stretch, ampCss: m.ampCss, maxResidualCss: m.maxResidualCss, areaCss: m.areaCss, top: m.top[0] }; })()")); }
          srows.push({ label: `${VARIANTS[key].label}: 1500 px/s orbit, every 60 ms`, cells: orb });
          results.strips[key] = { restMs: T, rest: restM, orbitEvery60ms: orbM };
        }
        writeFileSync(join(OUT, "strips-dpr2.png"), await labelledSheet(B, { title: "Membrane over time · DPR 2", note: "Top of each pair: the resting membrane from settling until it has stilled. Bottom: a sustained 1500 px/s orbit sampled every 60 ms (looking for boiling, pulsing or jitter).", rows: srows }));
      }
      if (P.logs.length) results.notes[`consoleDpr${dpr}`] = P.logs;
      await P.close();
    }
    // real CDP input (uneven event timing): per-frame stretch and axis jitter during steady sweeps, to see whether
    // velocity smoothing itself adds any frame-to-frame shape noise
    const Q = await openPage(B, HTTP + "?mode=A");
    results.realInput = {};
    for (const key of ["original", "refined"]) {
      await applyVariant(Q, VARIANTS[key]);
      const runs = [];
      for (const [dx, dy] of [[1, 0], [Math.SQRT1_2, Math.SQRT1_2]]) {
        const x0 = 150, y0 = 200; await Q.move(x0, y0); await sleep(400);
        await Q.ev(`window.__rec = []; window.__on = true; (function r() { const B = liquidCursorLab.engine.state.body; __rec.push([performance.now(), B.stretch, Math.atan2(B.ay, B.ax) * 180 / Math.PI]); if (__on) requestAnimationFrame(r); })(), 1`);
        for (let i = 1; i <= 60; i++) { await Q.move(Math.round(x0 + dx * i * 14), Math.round(y0 + dy * i * 14)); await sleep(6); }
        const rec = await Q.ev("window.__on = false, __rec");
        const steady = rec.slice(Math.floor(rec.length * 0.35), Math.floor(rec.length * 0.85)).filter((r) => r[1] > 1.1);
        let j2 = 0, a2 = 0; for (let i = 2; i < steady.length; i++) { j2 += (steady[i][1] - 2 * steady[i - 1][1] + steady[i - 2][1]) ** 2; a2 += (steady[i][2] - 2 * steady[i - 1][2] + steady[i - 2][2]) ** 2; }
        const n = Math.max(1, steady.length - 2);
        runs.push({ direction: dy ? "diagonal" : "horizontal", steadyFrames: steady.length, meanStretch: +(steady.reduce((s, r) => s + r[1], 0) / Math.max(1, steady.length)).toFixed(3), stretchJitterRms: +Math.sqrt(j2 / n).toFixed(4), axisJitterRmsDeg: +Math.sqrt(a2 / n).toFixed(3) });
      }
      results.realInput[key] = runs;
    }
    // post-stop elongation: the pure body dynamics (stepBody) with the engine's raw-velocity model, and ablations of
    // each lag stage, for a short flick, a medium flick and a long sweep that all stop dead
    results.stopContinuation = await Q.ev(`(() => {
      const L = LiquidCursor, CFG = LIQUID_CURSOR_CONFIG;
      function sim(preset, over, follow, V, rampMs, holdMs) {
        const F = { ...CFG.follow, ...follow }, P = L.paramsFromConfig(CFG, { ...CFG.lab.presets[preset].values, ...over });
        const B = L.createBodyState(), dt = 1 / 120, inp = { vx: 0, vy: 0, hover: false, pressed: false }, stopT = (rampMs + holdMs) / 1000;
        let t = 0, vx = 0, since = 0, atStop = 1, peak = 1, peakT = 0, rec = null;
        while (t < stopT + 0.6) {
          if (t < stopT) { vx += (V * Math.min(1, t * 1000 / rampMs) - vx) * (1 - Math.exp(-dt * 1000 / F.velocitySmoothingMs)); since = 0; }
          else { since += dt; if (since * 1000 > F.velocityStaleMs) vx *= Math.exp(-F.velocityDecay * dt); if (Math.abs(vx) < 0.5) vx = 0; }
          inp.vx = vx; L.stepBody(B, P, F.maxSubstep, inp, dt); t += dt;
          if (t <= stopT + 1e-9) atStop = B.stretch; else { if (B.stretch > peak) { peak = B.stretch; peakT = t - stopT; } if (rec === null && B.stretch < 1.02) rec = t - stopT; }
        }
        peak = Math.max(peak, atStop);
        return { stretchAtStop: +atStop.toFixed(3), peakAfterStop: +peak.toFixed(3), extra: +(peak - atStop).toFixed(3), msToPeak: peak > atStop ? Math.round(peakT * 1000) : 0, recoveryTo2pctMs: rec === null ? null : Math.round(rec * 1000) };
      }
      const flicks = { "short flick (100 ms at 2500 px/s)": [2500, 40, 60], "medium flick (200 ms)": [2500, 60, 140], "long sweep (520 ms)": [2500, 120, 400], "short flick at 1200 px/s": [1200, 40, 60] };
      const cases = { "Phase 2 original": ["phase2Original", {}, {}], "Santioni refined": ["santioniRefined", {}, {}], "refined, no 30 ms stale hold": ["santioniRefined", {}, { velocityStaleMs: 0 }],
        "refined, no second smoothing stage": ["santioniRefined", { velocitySmoothingMs: 1 }, {}], "refined, critically damped spring": ["santioniRefined", { deformDamping: 1 }, {}],
        "refined, neither hold nor second stage": ["santioniRefined", { velocitySmoothingMs: 1 }, { velocityStaleMs: 0 }] };
      const out = {};
      for (const [f, [V, r, h]] of Object.entries(flicks)) { out[f] = {}; for (const [c, [p, o, fo]] of Object.entries(cases)) out[f][c] = sim(p, o, fo, V, r, h); }
      return out;
    })()`);
    await Q.close();
  } finally { await B.close(); }
  results.layout = { rows: chosen.map((k) => `${k}: ${VARIANTS[k].label}`), columns: Object.entries(SCENARIOS).map(([k, [, l]]) => `${k}: ${l}`), cropCss: [160, 112] };
  writeFileSync(join(OUT, "diagnosis.json"), JSON.stringify(results, null, 1) + "\n");
  // console summary
  const f = (x) => (x === null || x === undefined ? "–" : typeof x === "number" ? x.toFixed(3) : String(x));
  for (const key of chosen) {
    const r = results.variants[key];
    console.log(`\n${key} · ${r.label}`);
    for (const [name, m] of Object.entries(r.scenarios)) {
      console.log(`  ${name.padEnd(10)} s ${f(m.stretch)} c ${f(m.compression)} amp ${f(m.ampCss)} | maxRes ${f(m.maxResidualCss)} rms ${f(m.rmsResidualCss)} | top k${m.top[0].k} ${f(m.top[0].css)}px (${f(m.top[0].pct)}%) k${m.top[1].k} ${f(m.top[1].css)} k${m.top[2].k} ${f(m.top[2].css)} share ${f(m.topShare)}/${f(m.top3Share)} | curv max ${f(m.curvature.maxDev)} rms ${f(m.curvature.rmsDev)} peaks ${m.curvature.peaksOver15pct} | aspect ${f(m.aspect.measured)}/${f(m.aspect.expected)} | ori ${f(m.orientationDeg)}/${f(m.axisDeg)} | area ${f(m.areaCss)} | shift ${f(m.shiftCss)} | tip/flank k ${f(m.tipFlankWavenumber)}`);
    }
  }
  for (const [key, s] of Object.entries(results.strips)) {
    console.log(`\nstrip ${key}: rest amp ${s.rest.map((m) => f(m.ampCss)).join(" ")} · rest area ${s.rest.map((m) => m.areaCss.toFixed(0)).join(" ")}`);
    console.log(`  orbit stretch ${s.orbitEvery60ms.map((m) => f(m.stretch)).join(" ")} · maxRes ${s.orbitEvery60ms.map((m) => f(m.maxResidualCss)).join(" ")} · area ${s.orbitEvery60ms.map((m) => m.areaCss.toFixed(0)).join(" ")}`);
  }
  for (const [key, runs] of Object.entries(results.realInput || {})) console.log(`real input ${key}: ${runs.map((r) => `${r.direction} mean s ${r.meanStretch}, stretch jitter ${r.stretchJitterRms}, axis jitter ${r.axisJitterRmsDeg}° over ${r.steadyFrames} frames`).join(" · ")}`);
  console.log(`\noutput ${OUT}`);
}
await run();
await sleep(10);
