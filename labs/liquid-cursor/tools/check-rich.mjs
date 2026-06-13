// Liquid cursor lab, Phase 4.5 checks: rich goo. Imported by check-lab.mjs (group names "rich …").
// Deterministic dynamics in Node (tools/pool-sim.mjs: the lab's own scripts at 60/120/144/165 Hz): the historical
// equivalence of Phase 3 and Phase 4, the brief's scenario targets, the hierarchy, density, the trail detector, cohesion,
// coalescence and the taper. Then the real page: the default snapshot, the manual controls, several necks and cohesion
// on screen, the untouched body, inversion, real-input safety, Mode C, file:// and performance.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openPage, decodePNG, sleep } from "./cdp.mjs";
import { installHelpers } from "./silhouette.mjs";
import { loadLab, simulate, GESTURES, RICH_GESTURES, randomScribble, trailMetrics } from "./pool-sim.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const HZ = [60, 120, 144, 165];

export async function richChecks(B, ctx) {
  const { check, info, HTTP, FILE, allLogs } = ctx;
  const G = "rich", GD = "rich dynamics", GT = "rich trail", GR = "rich rendering", GS = "rich safety", GP = "rich performance";
  const ev = {}; info.rich = ev;
  const W = loadLab(), CFG = W.LIQUID_CURSOR_CONFIG, POOLS = CFG.lab.poolPresets, GOO = CFG.goo;
  const RB = POOLS.richBalanced.values, P4 = POOLS.balanced.values;
  const sig = (r) => JSON.stringify(r.events.map((e) => [e.kind, e.startMs, e.releaseMs, e.r0, e.ux, e.uy, e.vRelease, e.travel, e.endMs, e.lastAlpha, e.lastR, e.states.join(">")]))
    + `|${r.suppressed}|${["full", "attached", "cooldown", "burst", "spacing", "strength"].map((k) => r.why[k]).join(",")}|${r.merges}`;

  // ---------------------------------------------------------------- history is not mutated
  {
    const git = (f) => execFileSync("git", ["-c", `safe.directory=${REPO.replace(/\\/g, "/")}`, "show", `0c75065:labs/liquid-cursor/${f}`], { cwd: REPO, encoding: "utf8" });
    const O = loadLab({ "config.js": git("config.js"), "liquid-cursor.js": git("liquid-cursor.js"), "droplet.js": git("droplet.js") }), OP = O.LIQUID_CURSOR_CONFIG.lab.poolPresets;
    let same = 0, total = 0;
    for (const g of Object.keys(GESTURES)) for (const hz of HZ) { total++; if (sig(simulate(O, GESTURES[g], { hz })) === sig(simulate(W, GESTURES[g], { hz, params: P4 }))) same++; }
    for (let s = 1; s <= 40; s++) { total++; if (sig(simulate(O, randomScribble(s), { hz: [60, 120, 144, 165][s % 4] })) === sig(simulate(W, randomScribble(s), { hz: [60, 120, 144, 165][s % 4], params: P4 }))) same++; }
    ev.phase4Identical = { same, total };
    check(G, "the \"Phase 4 · current balanced\" snapshot reproduces the 0c75065 default exactly (every gesture at 60/120/144/165 Hz and 40 random scribbles)", same === total,
      `${same}/${total} runs identical (event times, kinds, sizes, directions, release, travel, fade, suppression by reason, merges)`);
    let s2 = 0, t2 = 0;
    for (const k of ["single", "sparse", "rich", "busy"]) for (let s = 1; s <= 10; s++) for (const hz of [60, 144]) { t2++; if (sig(simulate(O, randomScribble(s), { hz, params: OP[k].values })) === sig(simulate(W, randomScribble(s), { hz, params: POOLS[k].values }))) s2++; }
    check(G, "the other historical snapshots (Phase 3 single, Phase 4 sparse, rich, busy) reproduce their 0c75065 versions", s2 === t2, `${s2}/${t2} random-scribble runs identical`);
    const keys = Object.keys(POOLS), cfgGoo = Object.fromEntries(Object.entries(GOO).map(([k, v]) => ["goo" + k[0].toUpperCase() + k.slice(1), v]));
    // the goo group now serves the reference goo, whose budget is 6 refilling every 160 ms; the rich attempt keeps its 4 / 320 ms
    const own = { gooBudget: 4, gooRefillMs: 320 }, sameGoo = Object.entries(cfgGoo).filter(([k, v]) => k in RB && (k in own ? RB[k] === own[k] : RB[k] === v)).length;
    check(G, "the droplet-centric first attempt is kept whole as \"Rich goo droplets (previous attempt)\": every goo value spelled out (its budget 4 refilling every 320 ms), the connected wake and the spine off, capacity 4; all snapshots defined",
      RB.wakeOn === 0 && RB.spineOn === 0 && RB.gooOn === 1 && RB.poolMax === 4 && sameGoo === Object.keys(cfgGoo).length && ["single", "balanced", "richSparse", "richBalanced", "richHeavy", "aecyncBoundary", "sparse", "rich", "busy", "connectedBalanced", "refBalanced"].every((k) => keys.includes(k)),
      `richBalanced: wakeOn ${RB.wakeOn}, spineOn ${RB.spineOn}, gooOn ${RB.gooOn}, capacity ${RB.poolMax}, ${sameGoo}/${Object.keys(cfgGoo).length} goo values as the attempt had them; snapshots ${keys.join(", ")}`);
  }

  // ---------------------------------------------------------------- the brief's scenarios at four frame rates (rich goo · balanced)
  const sc = {};
  const GS_ = { stationary: GESTURES.stationary, slow: GESTURES.slow, navigation: RICH_GESTURES.navigation, mediumSweep: RICH_GESTURES.mediumSweep, sweep: GESTURES.sweep, sweepFast: GESTURES.sweepFast,
    fastNav: RICH_GESTURES.fastNav, strongFlick: RICH_GESTURES.strongFlick, sharpTurn: RICH_GESTURES.sharpTurn, fastReversal: RICH_GESTURES.fastReversal, extremeFlick: GESTURES.extremeFlick,
    extremeWhip: RICH_GESTURES.extremeWhip, zigzag: RICH_GESTURES.zigzag };
  for (const [g, gest] of Object.entries(GS_)) sc[g] = HZ.map((hz) => simulate(W, gest, { hz, params: RB }));
  const kinds = (r) => r.events.map((e) => e.kind[0]).join("") || "-";
  ev.scenarios = Object.fromEntries(Object.entries(sc).map(([g, rs]) => [g, rs.map((r) => ({ hz: r.hz, pieces: kinds(r), peak: r.peakLive, maxAttached: r.maxAttached }))]));
  const show = (g) => sc[g].map((r) => `${r.hz} Hz ${kinds(r)} (peak ${r.peakLive})`).join(" · ");
  check(GD, "A-E · stationary, slow, ordinary navigation (14 minimum-jerk moves), smooth medium and fast sweeps (1400-4000 px/s): no goo at all, at 60/120/144/165 Hz",
    ["stationary", "slow", "navigation", "mediumSweep", "sweep", "sweepFast"].every((g) => sc[g].every((r) => r.emitted === 0)), ["stationary", "slow", "navigation", "mediumSweep", "sweep", "sweepFast"].map((g) => `${g} ${sc[g].map((r) => r.emitted).join("/")}`).join(" · "));
  check(GD, "K · repeated fast navigation (18 quick moves of 250-800 px) never becomes a trail: nothing sheds", sc.fastNav.every((r) => r.emitted === 0), show("fastNav"));
  for (const [g, label] of [["strongFlick", "F · strong flick"], ["sharpTurn", "G · sharp turn"], ["fastReversal", "H · fast reversal"]])
    check(GD, `${label}: 2-3 visible pieces (a primary and a secondary at least), the same at every frame rate`, sc[g].every((r) => r.peakLive >= 2 && r.peakLive <= 3 && r.events[0].cls === 0 && r.events.some((e) => e.kind === "secondary")) && new Set(sc[g].map((r) => r.peakLive)).size === 1, show(g));
  for (const [g, label] of [["extremeFlick", "I · extreme flick"], ["extremeWhip", "I · extreme whip (a flick and a hard reversal)"]])
    check(GD, `${label}: 3-4 visible pieces (primary, secondary and micro), never over the capacity`, sc[g].every((r) => r.peakLive >= 3 && r.peakLive <= 4 && r.events.some((e) => e.kind === "micro" || e.kind === "wake") && r.events.some((e) => e.kind === "secondary")), show(g));
  check(GD, "J · compound zigzag: 2-4 pieces coexist, at most 3 necks at once, never over the capacity of 4", sc.zigzag.every((r) => r.peakLive >= 2 && r.peakLive <= 4 && r.maxAttached <= 3), show("zigzag"));
  // staggering, hierarchy and timing from the gestures and 40 relentless random scribbles
  const scr = []; for (let s = 1; s <= 40; s++) scr.push(simulate(W, randomScribble(s), { hz: [60, 120, 144, 165][s % 4], params: RB }));
  {
    const all = [...Object.values(sc).flat(), ...scr]; let minGap = Infinity, secD = [], micD = [], sizes = { p: [], s: [], m: [] }, smaller = 0, pairs = 0;
    for (const r of all) {
      const evs = [...r.events].sort((a, b) => a.startMs - b.startMs);
      for (let i = 1; i < evs.length; i++) minGap = Math.min(minGap, evs[i].startMs - evs[i - 1].startMs);
      for (const e of evs) {
        sizes[["p", "s", "m"][e.cls]].push(e.r0);
        const par = evs.find((x) => x.id === e.parentId);
        if (par && e.kind === "secondary") { secD.push(e.startMs - par.startMs); pairs++; if (e.r0 < par.r0) smaller++; }
        if (par && e.kind === "micro") { micD.push(e.startMs - par.startMs); pairs++; if (e.r0 < par.r0) smaller++; }
      }
    }
    const rng = (xs) => [Math.min(...xs), Math.max(...xs)].map((x) => +x.toFixed(1));
    ev.hierarchy = { minStartGapMs: +minGap.toFixed(1), secondaryDelayMs: rng(secD), microDelayMs: rng(micD), r0: { primary: rng(sizes.p), secondary: rng(sizes.s), micro: rng(sizes.m) } };
    check(GD, "staggered breakup: no two pieces ever start on the same frame (at least 15 ms apart); a secondary 30-150 ms after its primary (seeded 30-70, later only while the swing grows); a micro after its primary has pinched, by 205 ms",
      minGap >= 15 && secD.length > 20 && micD.length > 10 && Math.min(...secD) >= 29 && Math.max(...secD) <= 151 && Math.min(...micD) >= 110 && Math.max(...micD) <= 205,
      `closest starts ${minGap.toFixed(1)} ms; secondary delays ${rng(secD).join("-")} ms (${secD.length}); micro delays ${rng(micD).join("-")} ms (${micD.length})`);
    check(GD, "a clear size hierarchy: primaries 5-8.5 px, secondaries 3.5-6 px, micros 2.5-4 px, and every residual smaller than its own primary (no dust under 2.5 px)",
      Math.min(...sizes.p) >= 5 - 1e-9 && Math.max(...sizes.p) <= 8.5 + 1e-9 && Math.min(...sizes.s) >= 3.5 - 1e-9 && Math.max(...sizes.s) <= 6 + 1e-9 && Math.min(...sizes.m) >= 2.5 - 1e-9 && Math.max(...sizes.m) <= 4 + 1e-9 && smaller === pairs,
      `primary ${rng(sizes.p).join("-")}, secondary ${rng(sizes.s).join("-")}, micro ${rng(sizes.m).join("-")} px; ${smaller}/${pairs} residuals smaller than their primary`);
  }
  {
    const att = { 0: [], 1: [], 2: [] }, con = { 0: [], 1: [], 2: [] }, life = { 0: [], 1: [], 2: [] };
    for (const r of [...Object.values(sc).flat(), ...scr]) for (const e of r.events) if (e.releaseMs !== undefined) { att[e.cls].push(e.releaseMs - e.startMs); con[e.cls].push(e.connectedMs || 0); life[e.cls].push(e.life); }
    const rng = (xs) => [Math.min(...xs), Math.max(...xs)].map((x) => Math.round(x));
    ev.timing = { attachedMs: { primary: rng(att[0]), secondary: rng(att[1]), micro: rng(att[2]) }, connectedMs: { primary: rng(con[0]), secondary: rng(con[1]), micro: rng(con[2]) }, lifeMs: { primary: rng(life[0]), secondary: rng(life[1]), micro: rng(life[2]) } };
    check(GD, "the primary keeps the approved neck timing (bud 26 + neck 60 + thread 24 ms to the pinch); the secondary is a short thick neck, the micro a brief pull",
      Math.min(...att[0]) >= 108 && Math.max(...att[0]) <= 120 && Math.min(...att[1]) >= 60 && Math.max(...att[1]) <= 85 && Math.min(...att[2]) >= 30 && Math.max(...att[2]) <= 52,
      `budding to pinch: primary ${rng(att[0]).join("-")} ms, secondary ${rng(att[1]).join("-")} ms, micro ${rng(att[2]).join("-")} ms (frame-quantised)`);
    check(GD, "not honey: no neck stays connected longer than 120 ms (no rubber bands or syrup strings)", Math.max(...con[0], ...con[1], ...con[2]) <= 120,
      `longest connected bridge: primary ${Math.max(...con[0]).toFixed(0)}, secondary ${Math.max(...con[1]).toFixed(0)}, micro ${Math.max(...con[2]).toFixed(0)} ms`);
    check(GD, "slightly longer persistence for goo: lives (after the pinch) primary 450-760 ms, secondary 350-650 ms, micro 200-450 ms",
      Math.min(...life[0]) >= 450 && Math.max(...life[0]) <= 760 && Math.min(...life[1]) >= 350 && Math.max(...life[1]) <= 650 && Math.min(...life[2]) >= 200 && Math.max(...life[2]) <= 450,
      `primary ${rng(life[0]).join("-")}, secondary ${rng(life[1]).join("-")}, micro ${rng(life[2]).join("-")} ms`);
  }
  {
    const tr = (rs) => { const t = rs.flatMap((r) => r.events.filter((e) => e.travel !== undefined && !(e.lastAlpha > 0.05 && e.endMs - e.releaseMs < 0.4 * e.life)).map((e) => e.travel)); return t.reduce((a, b) => a + b, 0) / t.length; };
    const p4 = []; for (let s = 1; s <= 40; s++) p4.push(simulate(W, randomScribble(s), { hz: [60, 120, 144, 165][s % 4], params: P4 }));
    const tRich = tr(scr), tP4 = tr(p4), dk = scr.flatMap((r) => r.events.filter((e) => e.goo).map((e) => [e.r0, e.dragK]));
    const big = dk.filter(([r]) => r >= 6).map(([, k]) => k), small = dk.filter(([r]) => r <= 3.5).map(([, k]) => k), mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    ev.flight = { meanTravelRich: +tRich.toFixed(1), meanTravelPhase4: +tP4.toFixed(1), dragFactorLarge: +mean(big).toFixed(3), dragFactorSmall: +mean(small).toFixed(3) };
    check(GD, "heavier pieces, left behind rather than fired away: mean free travel under 60% of Phase 4's in the same scribbles; larger pieces keep momentum longer (size drag 0.75-1.5x)",
      tRich < 0.6 * tP4 && mean(big) < 1 && mean(small) > 1 && Math.min(...dk.map(([, k]) => k)) >= 0.75 && Math.max(...dk.map(([, k]) => k)) <= 1.5,
      `mean travel ${tRich.toFixed(1)} px (Phase 4 ${tP4.toFixed(1)} px); drag factor ${mean(big).toFixed(2)} for r ≥ 6 px, ${mean(small).toFixed(2)} for r ≤ 3.5 px`);
  }
  // density and the progression of snapshots (40 relentless random scribbles each, 120 Hz)
  {
    const dens = {};
    for (const k of ["single", "balanced", "richSparse", "richBalanced", "richHeavy", "aecyncBoundary"]) {
      let share = [0, 0, 0, 0, 0, 0], ev2 = 0, peak = 0; for (let s = 1; s <= 40; s++) { const r = simulate(W, randomScribble(s), { hz: 120, params: POOLS[k].values }); ev2 += r.emitted; r.share.forEach((x, i) => (share[i] += x / 40)); peak = Math.max(peak, r.peakLive); }
      dens[k] = { piecesPerSecond: +(ev2 / 160).toFixed(2), share: share.map((x) => +(100 * x).toFixed(1)), mean: +share.reduce((a, x, i) => a + x * i, 0).toFixed(3), peak };
    }
    ev.density = dens;
    const d = dens.richBalanced, p = dens.balanced, b = dens.aecyncBoundary, place = (d.mean - p.mean) / (b.mean - p.mean);
    check(GD, "aggressive scribbling shifts clearly upward from Phase 4: time with nothing under 40% (Phase 4: 57%), mean live pieces at least twice Phase 4's, 3+ pieces now common, never 5 at capacity 4",
      d.share[0] < 40 && d.mean >= 2 * p.mean && d.share[3] + d.share[4] > 15 && d.share[5] === 0 && d.peak === 4,
      `time with 0/1/2/3/4/5 live: ${d.share.join(" / ")} % (Phase 4: ${p.share.join(" / ")} %); mean ${d.mean} vs ${p.mean}; ${d.piecesPerSecond} pieces/s vs ${p.piecesPerSecond}`);
    const order = ["single", "balanced", "richSparse", "richBalanced", "richHeavy", "aecyncBoundary"];
    check(GD, "the comparison is a clear progression: Phase 3 < Phase 4 < rich sparse < balanced < heavy < boundary (mean live pieces), with balanced 35-65% of the way from Phase 4 to the boundary",
      order.every((k, i) => i === 0 || dens[k].mean > dens[order[i - 1]].mean) && place >= 0.35 && place <= 0.65,
      `${order.map((k) => `${k} ${dens[k].mean}`).join(" < ")}; balanced sits ${(100 * place).toFixed(0)}% of the way`);
  }
  // ---------------------------------------------------------------- the trail detector
  {
    const tm = scr.map((r) => trailMetrics(r)), avg = (k) => { const xs = tm.map((x) => x[k]).filter((x) => x !== null && Number.isFinite(x)); return xs.reduce((a, b) => a + b, 0) / xs.length; };
    const t = { spacingCV: avg("spacingCV"), intervalCV: avg("intervalCV"), perKpx: avg("perKpx"), speedOnly: avg("speedOnlyShare"), corrSpeed: avg("corrSpeed"), corrSignal: avg("corrSignal"), minInterval: Math.min(...tm.map((x) => x.minIntervalMs ?? Infinity)) };
    const bnd = HZ.map((hz) => simulate(W, RICH_GESTURES.fastNav, { hz, params: POOLS.aecyncBoundary.values })), bt = bnd.map((r) => trailMetrics(r));
    const bsw = HZ.map((hz) => simulate(W, GESTURES.sweepFast, { hz, params: POOLS.aecyncBoundary.values }));
    ev.trail = { balanced: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, +v.toFixed(3)])), boundaryFastNav: bt.map((x) => ({ pieces: x.pieces, speedOnlyShare: +x.speedOnlyShare.toFixed(2), perKpx: +x.perKpx.toFixed(2) })), boundarySweepPieces: bsw.map((r) => r.emitted) };
    check(GT, "no spatial or temporal regularity: release-point spacing and emission intervals vary widely (coefficient of variation over 0.5; a procedural trail is near 0)", t.spacingCV > 0.5 && t.intervalCV > 0.5,
      `spacing CV ${t.spacingCV.toFixed(2)}, interval CV ${t.intervalCV.toFixed(2)}, closest emissions ${t.minInterval.toFixed(0)} ms apart, ${t.perKpx.toFixed(2)} pieces per 1000 px of travel`);
    check(GT, "pieces follow swings, not speed: none is born without a swing over the threshold in the last 250 ms, and emission correlates more with the trigger signal than with speed", t.speedOnly === 0 && t.corrSignal > t.corrSpeed,
      `speed-only share ${(100 * t.speedOnly).toFixed(1)}%; corr(emission, signal) ${t.corrSignal.toFixed(3)} vs corr(emission, speed) ${t.corrSpeed.toFixed(3)}`);
    check(GT, "the detector catches the failure mode: the boundary diagnostic (wake without a trigger) trails during fast navigation and sweeps, every piece speed-only; balanced sheds nothing there",
      bt.every((x) => x.pieces >= 10 && x.speedOnlyShare === 1) && bsw.every((r) => r.emitted >= 2) && sc.fastNav.every((r) => r.emitted === 0) && sc.sweepFast.every((r) => r.emitted === 0),
      `boundary fast navigation ${bt.map((x) => `${x.pieces} pieces (${(100 * x.speedOnlyShare).toFixed(0)}% speed-only)`).join(", ")}; boundary 4000 px/s sweep ${bsw.map((r) => r.emitted).join("/")}; balanced 0 and 0`);
  }
  // ---------------------------------------------------------------- limits, continuity, determinism
  {
    const runs = []; for (const k of ["richSparse", "richBalanced", "richHeavy", "aecyncBoundary"]) for (let s = 1; s <= 20; s++) for (const hz of [60, 165]) runs.push([k, simulate(W, randomScribble(s), { hz, params: POOLS[k].values })]);
    let ow = 0, jf = 0, jr = 0, ja = 0, dr = 0, da = 0, nf = 0, over = 0, att = 0, endLive = 0;
    for (const [k, r] of runs) { ow += r.overwrites; jf = Math.max(jf, r.jumpExcess); jr = Math.max(jr, r.releaseExcess); ja = Math.max(ja, r.attachedExcess); nf += r.nonFinite; if (r.hz >= 120) { dr = Math.max(dr, r.maxDr); da = Math.max(da, r.maxDa); } if (r.peakLive > (POOLS[k].values.poolMax || CFG.pool.max)) over++; att = Math.max(att, r.maxAttached); endLive += r.endLive; }
    const flood = [4, 5].map((cap) => simulate(W, { v: () => [0, 0], ms: 1600 }, { hz: 120, params: { ...RB, poolMax: cap }, manual: Array.from({ length: 6 }, (_, k) => ({ t: k * 0.13, opts: { angleDeg: k * 50, speed: 300, peak: 2.05, plan: [{ ms: 60, deg: 40, peak: 2 }] } })) }));
    ev.limits = { runs: runs.length, overwrites: ow, overCapacity: over, maxAttached: att, freeJumpExcess: +jf.toFixed(3), releaseExcess: +jr.toFixed(2), attachedExcess: +ja.toFixed(2), maxDr: +dr.toFixed(3), maxDa: +da.toFixed(3), nonFinite: nf, floodPeak: flood.map((r) => r.peakLive), floodSuppressed: flood.map((r) => r.suppressed) };
    check(G, "hard capacity: never more live pieces than the snapshot's capacity (4 balanced, 5 heavy and boundary), never more than 3 necks, nothing recycled; a manual flood fills the pool and is cleanly suppressed",
      ow === 0 && over === 0 && att <= 3 && flood[0].peakLive === 4 && flood[1].peakLive === 5 && flood.every((r) => r.overwrites === 0 && r.suppressed > 0),
      `${runs.length} scribble runs: ${over} over capacity, ${ow} overwrites, at most ${att} necks; manual floods at capacity 4 / 5 peak ${flood.map((r) => r.peakLive).join(" / ")} with ${flood.map((r) => r.suppressed).join(" / ")} suppressed`);
    // buds ride a surface that also lengthens with the rear taper (up to about 0.7 px per 60 Hz frame on top of Phase 4's
    // deformation), so the riding bound is 7 px here against Phase 4's 6
    check(G, "continuity in every rich snapshot: no teleport (a free piece moves by its own velocity; a bud rides the body surface up to its release frame, within 7 px of the body move + 4.5 px at 60 Hz), no pop, no NaN, every pool empties",
      jf <= 0.5 && jr <= 7 && ja <= 7 && dr < 1 && da < 0.25 && nf === 0 && endLive === 0,
      `free pieces: worst excess ${jf.toFixed(3)} px over v·dt + 1.5; buds and release frames ${ja.toFixed(2)} / ${jr.toFixed(2)} px beyond the body move + 4.5 px; per-frame radius ${dr.toFixed(3)} px, opacity ${da.toFixed(3)}; ${nf} non-finite; ${endLive} left at the end`);
    const a = simulate(W, randomScribble(9), { hz: 144, params: RB }), b = simulate(W, randomScribble(9), { hz: 144, params: RB }), c = simulate(W, randomScribble(9), { hz: 144, params: RB, seed: 4242 });
    check(G, "deterministic: the same gesture, seed and frame rate give the same goo; another seed varies only the seeded jitter", sig(a) === sig(b) && sig(a) !== sig(c), `${a.emitted} pieces twice identical; seed 4242: ${c.emitted} pieces`);
  }
  // cohesion, coalescence and the taper
  {
    const all = [...Object.values(sc).flat(), ...scr]; for (const k of ["richHeavy", "aecyncBoundary"]) for (let s = 1; s <= 20; s++) all.push(simulate(W, randomScribble(s), { hz: 120, params: POOLS[k].values }));
    const conn = all.reduce((x, r) => x + r.bridgeConnects, 0), maxPer = Math.max(...all.map((r) => r.bridgeMaxPerPair)), overlap = Math.min(...all.map((r) => r.neckOverlap));
    ev.neckOverlapPx = +overlap.toFixed(2);
    check(G, "a free piece never sits inside an attached neck: when the body carries a bud over a piece, the piece rejoins the liquid (it merges, as with the body) instead of looking re-attached",
      overlap >= -2.5, `deepest overlap of a non-merging free piece with an attached bead: ${(-Math.min(0, overlap)).toFixed(2)} px over ${all.length} runs (the contact frame itself, before the merge starts)`);
    ev.cohesion = { bridgesFormed: conn, maxConnectsPerPair: maxPer, runs: all.length };
    check(G, "cohesion never flickers: a smooth-union bridge between young free pieces forms at most once per pair and never re-forms", maxPer <= 1, `${conn} bridges formed over ${all.length} runs, at most ${maxPer} per pair`);
    // the second shed waits until the first piece is clear of the body (else its bud would take that piece in) and catches it
    const m = simulate(W, { v: () => [0, 0], ms: 1100 }, { hz: 120, params: RB, manual: [{ t: 0, opts: { angleDeg: 180, speed: 600 } }, { t: 0.25, opts: { angleDeg: 180, speed: 1400 } }] });
    const big = m.events.reduce((x, e) => (e.peak / e.r0 > x.peak / x.r0 ? e : x)), gain = big.peak / big.r0;
    ev.coalescence = { merges: m.merges, gain: +gain.toFixed(3), maxDr: +m.maxDr.toFixed(3) };
    check(G, "coalescence: two rich pieces that meet merge into one (the smaller flows into the larger, which grows by at most 25%; no bounce, no pop)", m.merges >= 1 && gain <= 1.25 + 1e-9 && gain > 1.03 && m.maxDr < 1,
      `${m.merges} merge(s), the survivor grew ×${gain.toFixed(2)}, largest per-frame radius change ${m.maxDr.toFixed(3)} px`);
    const quietT = ["stationary", "slow", "navigation", "mediumSweep", "sweep", "sweepFast", "fastNav"].every((g) => sc[g].every((r) => r.taperMax === 0 && r.taperMin === 0));
    const tmax = Math.max(...all.map((r) => r.taperMax)), tmin = Math.min(...all.map((r) => r.taperMin)), idle = all.reduce((x, r) => x + r.taperIdleNonZero, 0), late = all.reduce((x, r) => x + r.taperLate, 0), fl = sc.strongFlick[1];
    ev.taper = { max: +tmax.toFixed(4), min: +tmin.toFixed(4), framesNonZeroWithNoPiece: idle, framesNonZero150msAfterLastPiece: late, strongFlick: [+fl.taperMax.toFixed(4), +fl.taperMin.toFixed(4)] };
    check(G, "the rear taper exists only during fission: exactly 0 in every quiet gesture, settled to exactly 0 within 150 ms of the last piece; bounded (≤ 1.5 × taper, recoil ≥ −0.3 × taper); a flick pulls it out and it recoils",
      quietT && late === 0 && tmax <= 1.5 * 0.14 + 1e-9 && tmin >= -0.3 * 0.14 - 1e-9 && fl.taperMax > 0.03 && fl.taperMin < 0,
      `quiet gestures ${quietT ? "0" : "non-zero"}; ${late} frames still non-zero 150 ms after the last piece (${idle} settling frames in all); range ${tmin.toFixed(4)} … ${tmax.toFixed(4)}; strong flick ${fl.taperMax.toFixed(3)} then ${fl.taperMin.toFixed(4)}`);
  }

  // ---------------------------------------------------------------- the real page (Mode B, the rich goo snapshot)
  const P = await openPage(B, HTTP + "?mode=B&pool=richBalanced");
  await P.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
  {
    const ui = await P.ev(`(() => { const E = liquidCursorLab.engine, out = { pool: document.querySelector('#pool-preset').value, label: E.state.poolPreset, goo: E.params.gooOn, max: E.params.poolMax,
      groups: [...document.querySelectorAll('#pool-preset optgroup')].map((g) => g.label + ": " + [...g.children].map((o) => o.value).join(",")),
      buttons: ["#drop-strong", "#drop-extreme", "#drop-goo", "#drop-heavy", "#drop-clear"].map((s) => !!document.querySelector(s)),
      tune: ["gooSecSwing", "gooMicroSwing", "gooBudget", "gooSpacingMs", "poolMax", "gooSecScale", "gooMicroScale", "gooSecDelayMs", "gooMicroDelayMs", "gooSecNeckMs", "gooWakeLife", "gooMomentum", "gooDrag", "gooLife", "gooJoin"].filter((k) => !document.querySelector('#tune-' + k)) };
      const keys = []; for (const k of ["4", "6", "0", "5"]) { document.dispatchEvent(new KeyboardEvent("keydown", { key: k })); keys.push(E.state.poolPreset + "|" + E.params.gooOn + "|" + E.params.poolMax + "|" + E.params.wakeOn); } out.keys = keys; return out; })()`);
    ev.ui = ui;
    check(GR, "?pool=richBalanced opens the droplet-centric attempt (rich goo on, wake off, capacity 4); snapshots grouped; keys 4, 6, 0 and 5 switch Phase 4 → connected goo (previous) → reference boundary → back to rich goo; the manual buttons and the 15 rich tuning controls exist",
      ui.pool === "richBalanced" && ui.goo === 1 && ui.max === 4 && ui.groups.length === 2 && ui.groups[0].endsWith("balanced,richBalanced,connectedBalanced,refSparse,refBalanced,refHeavy,refBoundary") && ui.buttons.every(Boolean) && ui.tune.length === 0
      && ui.keys[0].endsWith("|0|3|0") && ui.keys[1].startsWith("Connected goo · previous") && ui.keys[1].endsWith("|1") && ui.keys[2].startsWith("Reference boundary") && ui.keys[2].includes("|1|5|") && ui.keys[3].startsWith("Rich goo droplets (previous attempt)|1|4|0"),
      `${ui.label} (goo ${ui.goo}, capacity ${ui.max}); ${ui.groups.join(" · ")}; keys → ${ui.keys.join(" → ")}; missing controls ${ui.tune.join(",") || "none"}`);
  }
  // the manual controls run the real scheduler
  {
    const m = await P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop, out = {}; E.setNatural(false);
      const go = (opts, frames) => { E.clearDroplets(); E.resetBody(); __lc.ready(1250, 440); const seen = new Map(); let peak = 0, att = 0; const ok = E.triggerDroplet(opts);
        for (let i = 0; i < frames; i++) { __lc.hold(1000 / 120); peak = Math.max(peak, D.live); att = Math.max(att, D.attachedNow); for (const s of D.slots) if (s.state !== "IDLE" && !seen.has(s.id)) seen.set(s.id, s.kind); }
        return { ok, kinds: [...seen.values()].join(","), peak, att, suppressed: D.suppressed }; };
      out.strong = go({ angleDeg: 180, speed: 420, strength: 0.9, peak: 1.3 }, 60); out.extreme = go({ angleDeg: 180, speed: 600, strength: 1, extreme: true, peak: 2.05 }, 80);
      out.goo = go({ angleDeg: 200, speed: 500, strength: 0.6, peak: 1.6, plan: [{ ms: 140, deg: 75, peak: 1.35 }] }, 110);
      out.heavy = go({ angleDeg: 160, speed: 630, strength: 1, peak: 2.1, plan: [{ ms: 120, deg: 70, peak: 1.8 }, { ms: 240, deg: -60, peak: 1.6 }] }, 140);
      E.clearDroplets(); out.after = D.live; E.setNatural(true); return out; })()`);
    ev.manual = m;
    const has = (k, s) => k.split(",").filter((x) => x === s).length;
    check(GR, "manual controls drive the real scheduler: Strong flick = primary + secondary; Extreme flick = primary + secondary + micro; Rich goo burst and Heavy burst queue more primaries with residuals, within capacity 4; Clear empties the pool",
      m.strong.kinds === "manual,secondary" && has(m.extreme.kinds, "manual") === 1 && has(m.extreme.kinds, "secondary") === 1 && has(m.extreme.kinds, "micro") === 1 && has(m.goo.kinds, "manual") >= 2 && has(m.heavy.kinds, "manual") >= 2
      && [m.strong, m.extreme, m.goo, m.heavy].every((x) => x.ok && x.peak <= 4 && x.att <= 3) && m.after === 0,
      `strong ${m.strong.kinds} · extreme ${m.extreme.kinds} · goo burst ${m.goo.kinds} (peak ${m.goo.peak}) · heavy burst ${m.heavy.kinds} (peak ${m.heavy.peak}, ${m.heavy.suppressed} suppressed); after Clear ${m.after}`);
  }
  // several necks on screen, the untouched body, cohesion on screen, inversion
  {
    const necks = await P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop; E.clearDroplets(); E.resetBody(); const p = __lc.points([{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], 1050, 440); __lc.ready(p.start[0], p.start[1]); __lc.seq(p.pts.concat(Array(60).fill(null)));
      let best = null; for (let i = 0; i < 60; i++) { __lc.step(); const att = D.slots.filter((s) => LiquidDroplet.isAttached(s.state)); const freeHere = D.slots.filter((s) => (s.state === "FREE" || s.state === "FADING") && s.layer === "body").length;
        if (att.length >= 2 && att.every((s) => s.connected) && freeHere === 0) { const u = E.readUniforms(); best = { frame: i, n: att.length, kinds: att.map((s) => s.kind).join(","), u0: u.uDrop[2] > 0, u1: u.uDrop1 && u.uDrop1[2] > 0, comps: __lc.components(), taper: u.uTaper[0] }; break; } }
      return best; })()`);
    ev.necks = necks;
    check(GR, "several necks are drawn at once in the body canvas, each bridged to the body (the body and its attached pieces are one connected surface) while the rear taper is drawn",
      !!necks && necks.n >= 2 && necks.u0 && necks.u1 && necks.comps === 1 && necks.taper > 0, necks ? `frame ${necks.frame}: ${necks.n} necks (${necks.kinds}), uniforms set ${necks.u0}/${necks.u1}, ${necks.comps} connected piece(s), taper ${necks.taper.toFixed(3)}` : "no frame with two connected necks");
    // the body with no fission in progress is the approved body: Mode A and rich goo give identical masks frame by frame
    const maskSig = `(() => { const m = liquidCursorLab.engine.readMask(); let h = 2166136261 >>> 0; for (let i = 0; i < m.px.length; i += 4) { h ^= m.px[i + 3]; h = Math.imul(h, 16777619) >>> 0; } return h; })()`;
    const body = [];
    for (const mode of ["A", "B"]) { await P.ev(`liquidCursorLab.engine.setMode("${mode}"), 1`); await P.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
      body.push(await P.ev(`(() => { const E = liquidCursorLab.engine, e0 = E.state.drop.events; E.clearDroplets(); E.resetBody(); const p = __lc.points([{ dx: 1, dy: 0, v: 2600, ms: 300, ramp: 120 }, { dx: 0.6, dy: 0.8, v: 1200, ms: 200 }], 1100, 500); __lc.ready(p.start[0], p.start[1]); __lc.seq(p.pts.concat(Array(40).fill(null)));
        const out = []; for (let i = 0; i < 100; i++) { const s = __lc.step(); if (i % 5 === 0) out.push(${maskSig}); } return { sig: out, events: E.state.drop.events - e0, taper: E.readUniforms().uTaper[0] }; })()`)); }
    const same = body[0].sig.filter((h, i) => h === body[1].sig[i]).length;
    ev.bodyUnchanged = { framesCompared: body[0].sig.length, identical: same, richEvents: body[1].events };
    check(GR, "primary body unchanged when no fission is active: the same sweep and curve in Mode A and in rich goo give bit-identical masks on every sampled frame (taper uniform 0)",
      same === body[0].sig.length && body[1].events === 0 && body[1].taper === 0, `${same}/${body[0].sig.length} sampled frames identical; ${body[1].events} pieces in Mode B; taper ${body[1].taper}`);
    // cohesion on screen: two young pieces 2.5 px apart are one surface with cohesion, two without; body canvas = tile
    const place = (kc, layer) => P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop; E.setDiagnostic({ beadLayer: "${layer}" }); E.clearDroplets(); E.setNatural(false); __lc.ready(900, 440);
      [[1000, 440, 5], [1011.5, 440, 4]].forEach((b, i) => Object.assign(D.slots[i], { state: "FREE", released: true, x: b[0], y: b[1], r: b[2], r0: b[2], alpha: 1, life: 600, age: 40, freeAt: 14, ux: 1, uy: 0, el: 0, vx: 0, vy: 0, id: 950 + i, kind: "micro", goo: 1, kc: ${kc}, layer: "none", tile: -1 }));
      D.live = 2; E.advance(0); return [__lc.components(), D.slots[0].layer, D.slots[1].layer]; })()`);
    const c1 = await place(8, "body"), c0 = await place(0, "body");
    const hand = []; for (const L of ["body", "bead"]) { await place(8, L); await P.frames(3); hand.push(decodePNG(await P.shot(985, 425, 40, 30))); }
    await P.ev("liquidCursorLab.engine.setDiagnostic({}), liquidCursorLab.engine.clearDroplets(), liquidCursorLab.engine.setNatural(true), 1");
    let hd = 0; for (let j = 0; j < hand[0].h; j++) for (let i = 0; i < hand[0].w; i++) { const x = hand[0].px(i, j), y = hand[1].px(i, j); if (x[0] !== y[0] || x[1] !== y[1] || x[2] !== y[2]) hd++; }
    ev.cohesionScreen = { withCohesion: c1, without: c0, handoverDiffPx: hd };
    check(GR, "cohesion on screen: two young pieces 2.5 px apart are bridged into one surface (body + 1 piece) with cohesion and stay two without; body canvas and tile draw the bridge identically",
      c1[0] === 2 && c0[0] === 3 && c1[1] === "body" && hd === 0, `components with cohesion ${c1[0]}, without ${c0[0]} (body included); body/tile handover ${hd} differing px of ${hand[0].w * hand[0].h}`);
    // inversion stays exact over pieces of every class drawn by the body canvas and by tiles
    const lay = await P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop; E.clearDroplets(); E.setNatural(false); __lc.ready(900, 440);
      const B = [[960, 440, 6, "follow"], [1500, 360, 4.3, "secondary"], [300, 360, 3, "micro"]];
      B.forEach((b, i) => Object.assign(D.slots[i], { state: "FREE", released: true, x: b[0], y: b[1], r: b[2], r0: b[2], alpha: 1, life: 600, age: 300, freeAt: 14, ux: 1, uy: 0, el: 0, vx: 0, vy: 0, id: 970 + i, kind: b[3], goo: 1, kc: 0, layer: "none", tile: -1 }));
      D.live = 3; E.advance(0); return D.slots.slice(0, 3).map((s) => s.layer); })()`);
    const pts = [[960, 440], [1500, 360], [300, 360]];
    await P.frames(2); const on = []; for (const [x, y] of pts) on.push(decodePNG(await P.shot(x - 2, y - 2, 5, 5)).px(2, 2));
    await P.ev("(document.querySelectorAll('.lc-canvas, .lc-bead').forEach((c) => (c.style.opacity = '0')), 1)"); await P.frames(2); const off = []; for (const [x, y] of pts) off.push(decodePNG(await P.shot(x - 2, y - 2, 5, 5)).px(2, 2));
    await P.ev("(document.querySelectorAll('.lc-canvas, .lc-bead').forEach((c) => (c.style.opacity = '')), 1), liquidCursorLab.engine.clearDroplets(), liquidCursorLab.engine.setNatural(true), 1");
    const err = on.map((p, i) => Math.max(...p.map((v, k) => Math.abs(v - (255 - off[i][k])))));
    check(GR, "difference inversion stays exact over a primary near the body (body canvas) and a secondary and a micro far away (tiles): one material, no new colour",
      lay[0] === "body" && lay[1] === "bead" && lay[2] === "bead" && err.every((e) => e <= 6), `layers ${lay.join(", ")}; centre error vs exact inversion ${err.join("/")}`);
  }
  allLogs.push(...P.logs.map((m) => `rich: ${m}`));
  check(GR, "no console errors or warnings (rich goo page)", P.logs.length === 0, P.logs.slice(0, 3).join(" | ") || "none");
  await P.close();
  // Mode C readout
  {
    const C = await openPage(B, HTTP + "?mode=C&pool=richBalanced");
    await C.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
    await C.ev(`(() => { const E = liquidCursorLab.engine; E.clearDroplets(); E.resetBody(); const p = __lc.points([{ dx: 1, dy: 0, v: 4600, ms: 150, ramp: 18 }, { dx: -0.95, dy: 0.31, v: 4200, ms: 120 }], 900, 470); __lc.ready(p.start[0], p.start[1]); __lc.seq(p.pts.concat(Array(40).fill(null))); for (let i = 0; i < 36; i++) __lc.step(); return 1; })()`);
    await sleep(500);
    const rows = await C.ev(`Object.fromEntries([...document.querySelectorAll('#debug dt')].map((dt) => [dt.textContent, dt.nextElementSibling.textContent]))`);
    ev.modeC = Object.fromEntries(["Rich goo", "Pieces by class", "Trigger strength", "Visible count", "Slot 1", "Slot 2", "Suppressed"].map((k) => [k, rows[k]]));
    const slots = Object.entries(rows).filter(([k]) => k.startsWith("Slot ")).map(([, v]) => v).join(" | ");
    check(GR, "Mode C classifies the goo: budget, scheduled residuals, cooldown and taper; pieces by class; trigger strength; average and peak visible count with the time histogram; per slot the class, kind, source, radius, age, velocity, opacity and gap to the body",
      /budget .*pieces .* scheduled · cooldown .* taper/.test(rows["Rich goo"] || "") && /PRIMARY \d+ · SECONDARY \d+ · MICRO \d+/.test(rows["Pieces by class"] || "") && /signal .* swing .* peak signal/.test(rows["Trigger strength"] || "")
      && /mean .* peak \d .* time with 0\/1\/2\/3\/4\/5/.test(rows["Visible count"] || "") && /(PRIMARY|SECONDARY|MICRO) \(/.test(slots) && /gap to body/.test(slots) && /px\/s · r [\d.]+ α/.test(slots),
      `${rows["Rich goo"]} · ${rows["Pieces by class"]} · ${rows["Visible count"]}`);
    allLogs.push(...C.logs.map((m) => `rich mode C: ${m}`));
    await C.close();
  }

  // ---------------------------------------------------------------- real input safety (default rich page)
  {
    const Q = await openPage(B, HTTP + "?mode=B");
    // any liquid counts: pieces (events) and goo bursts (the reference goo tails); a re-entry is judged by its bursts (its primaries without the spine)
    const events = () => Q.ev("liquidCursorLab.engine.state.drop.events + (liquidCursorLab.engine.state.drop.tails || 0)"), primaries = () => Q.ev("(() => { const E = liquidCursorLab.engine, D = E.state.drop; return E.params.spineOn > 0 ? D.tails || 0 : D.events - D.residuals; })()");
    const cdpFlick = async (x0, y, dx, n = 14, buttons = 0) => { let x = x0; for (let i = 1; i <= n; i++) { x += dx * Math.min(1, (i * i) / 25); await Q.move(Math.round(x), y, buttons); await sleep(3); } };
    const [bx, by] = await Q.center("#btn-real");
    await Q.move(bx - 40, by); await sleep(400); let e1 = await events();
    for (let k = 0; k < 3; k++) { await cdpFlick(bx - 40, by, 5, 14); for (let i = 0; i < 4; i++) { await Q.move(bx + (i % 2 ? 40 : -40), by); await sleep(4); } }
    await sleep(700); const hov = (await events()) - e1;
    await Q.move(300, 330); await sleep(600); e1 = await events(); await Q.press(300, 330); await cdpFlick(300, 330, 60, 14, 1); await cdpFlick(1140, 330, -60, 10, 1); await Q.release(500, 330); await sleep(800);
    const clk = (await events()) - e1;
    const [px, py] = await Q.center("pre.code"), [wx, wy] = await Q.center("#wipe-handle");
    // an ordinary pointing move into the ignored block (minimum-jerk, about 0.35 s): a violent approach would be a genuine flick
    await Q.move(900, 420); await sleep(400); e1 = await events(); const e1Pieces = await Q.ev("liquidCursorLab.engine.state.drop.events");
    for (let i = 1; i <= 36; i++) { const u = i / 36, k = u * u * u * (10 - 15 * u + 6 * u * u); await Q.move(Math.round(900 + (px - 900) * k), Math.round(420 + (py - 420) * k)); await sleep(8); }
    // the approach is ordinary motion (with the reference goo a fast pointing move may show a teardrop, never beads); count from inside the block
    await sleep(200); const approach = (await events()) - e1, approachBeads = await Q.ev("liquidCursorLab.engine.state.drop.events") - e1Pieces; e1 = await events();
    await cdpFlick(px, py, -40); await sleep(700);
    await Q.move(wx, wy); await sleep(200); await Q.press(wx, wy); for (let i = 1; i <= 14; i++) { await Q.move(wx - i * 50, wy, 1); await sleep(3); } await Q.release(wx - 700, wy); await sleep(80);
    for (let i = 1; i <= 6; i++) { await Q.move(wx - 700 - i * 60, wy); await sleep(3); } await sleep(700);
    const ign = (await events()) - e1;
    check(GS, "M, N, O · the liquid (reference goo, the default) stays out of hover, press and ignored regions: violent motion over a button, a pressed drag, an ignored-region entry and a captured drag start nothing", hov === 0 && clk === 0 && ign === 0 && approachBeads === 0, `hover ${hov}, pressed ${clk}, ignored/captured ${ign}; the ordinary approach: ${approach} liquid, ${approachBeads} beads`);
    const perEntry = [];
    for (let k = 0; k < 3; k++) { await Q.move(900, 330); await sleep(900); await Q.s("Input.dispatchMouseEvent", { type: "mouseMoved", x: -10, y: -10 }); await sleep(300); e1 = await primaries();
      await Q.move(1500, 330); await cdpFlick(1500, 330, -60); await sleep(900); perEntry.push((await primaries()) - e1); }
    const res = await Q.ev("[liquidCursorLab.engine.state.drop.events + (liquidCursorLab.engine.state.drop.tails || 0), liquidCursorLab.engine.state.drop.live]");
    await Q.s("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1.5, mobile: false }); await sleep(300);
    const { targetId } = await B.send("Target.createTarget", { url: "about:blank" }); await B.send("Target.activateTarget", { targetId }); await sleep(500);
    await B.send("Target.activateTarget", { targetId: Q.targetId }); await B.send("Target.closeTarget", { targetId }); await sleep(300);
    await Q.s("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }); await sleep(400);
    const res2 = await Q.ev("[liquidCursorLab.engine.state.drop.events + (liquidCursorLab.engine.state.drop.tails || 0), liquidCursorLab.engine.state.drop.live]");
    check(GS, "P · re-entry, resize, DPR change and a hidden tab never cause a burst (default page): at most one tail per genuine re-entry flick, nothing from resize / DPR / tab switches",
      perEntry.every((n) => n <= 1) && res2[0] === res[0], `goo bursts / primaries per re-entry ${perEntry.join(" / ")}; events ${res[0]} → ${res2[0]} across resize, DPR 1.5 and a tab switch`);
    allLogs.push(...Q.logs.map((m) => `rich input: ${m}`));
    check(GS, "no console errors or warnings (rich real-input checks)", Q.logs.length === 0, Q.logs.slice(0, 3).join(" | ") || "none");
    await Q.close();
  }
  // file://
  {
    const F = await openPage(B, FILE + "?mode=B&pool=richBalanced");
    await F.ev(`(${installHelpers.toString()})(), __lc.begin(), 1`);
    const r = await F.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop; E.setNatural(false); E.resetBody(); __lc.ready(700, 440); const ok = E.triggerDroplet({ angleDeg: 180, speed: 500, strength: 1, extreme: true, peak: 2.05 });
      const seen = new Set(); for (let i = 0; i < 40; i++) { __lc.hold(1000 / 120); for (const s of D.slots) if (s.state !== "IDLE") seen.add(s.kind); } return [ok, [...seen].join(","), E.state.poolPreset, location.protocol, E.state.bead ? E.state.bead.mode : "none"]; })()`);
    allLogs.push(...F.logs.map((m) => `rich file: ${m}`));
    check(G, "file://: rich goo runs without a server (its snapshot, the scheduler's hierarchy, bead tiles), console clean", r[0] && r[1] === "manual,secondary,micro" && r[2].startsWith("Rich goo droplets") && r[3] === "file:" && F.logs.length === 0,
      `${r[2]} · ${r[1]} · tiles ${r[4]} · ${r[3]} · console ${F.logs.length ? F.logs[0] : "clean"}`);
    await F.close();
  }
  // ---------------------------------------------------------------- performance
  {
    const Q = await openPage(B, HTTP + "?mode=B&pool=richBalanced");
    await Q.ev(`(${installHelpers.toString()})(), __lc.begin(), 1`);
    const perf = await Q.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop, out = {}; E.setNatural(false);
      const set = (n) => { E.clearDroplets(); __lc.ready(900, 440); const P = [[860, 440], [300, 330], [1600, 520], [1200, 360], [600, 560]];
        for (let i = 0; i < n; i++) Object.assign(D.slots[i], { state: "FREE", released: true, x: P[i][0], y: P[i][1], r: 5, r0: 5, alpha: 1, life: 1e9, age: 300, freeAt: 14, ux: 1, uy: 0, el: 0, vx: 30, vy: 10, id: 800 + i, kind: i ? "micro" : "primary", goo: 1, dragK: 1, kc: 0, layer: "none", tile: -1 }); };
      for (const n of [0, 1, 2, 3, 4, 5]) {
        set(n); const t0 = performance.now(); for (let i = 0; i < 300; i++) E.advance(1000 / 120, 1000 / 120); const step = (performance.now() - t0) / 300;
        set(n); out[n] = { framePlusDrawMs: +step.toFixed(4), forcedDrawMs: +E.benchDraw(300).toFixed(4), tilesVisible: E.state.bead.tiles.filter((t) => t.visible).length };
      }
      E.clearDroplets(); E.setNatural(true); return out; })()`);
    await Q.ev("liquidCursorLab.engine.setFrozen(false), 1");
    const window_ = (sheds) => Q.ev(`new Promise((res) => { const E = liquidCursorLab.engine, S = E.state; S.workMs = 0; S.dropWorkMs = 0; S.dropDrawMs = 0; let n = 0, live = 0, frames = 0, worst = 0, last = 0, peak = 0; const t0 = performance.now();
      const shed = ${sheds} ? setInterval(() => E.triggerDroplet({ angleDeg: (n++ * 97) % 360, speed: 420, strength: 0.6, peak: 1.6, plan: [{ ms: 140, deg: 75, peak: 1.35 }] }), 420) : 0;
      (function f(t) { if (last) worst = Math.max(worst, t - last); last = t; frames++; live += S.drop.live; peak = Math.max(peak, S.drop.live); if (performance.now() - t0 < 2500) requestAnimationFrame(f); else { clearInterval(shed); res({ fps: +(frames / ((performance.now() - t0) / 1000)).toFixed(1), worstMs: +worst.toFixed(1), meanLive: +(live / frames).toFixed(2), peakLive: peak, workMs: +S.workMs.toFixed(4), dropStepMs: +S.dropWorkMs.toFixed(4), dropDrawMs: +S.dropDrawMs.toFixed(4) }); } })(performance.now()); })`);
    await sleep(800); const idle = await window_(false), rt = await window_(true);
    await Q.move(700, 330); await sleep(2400);
    const d0 = await Q.ev("[liquidCursorLab.engine.state.draws, liquidCursorLab.engine.state.bead.draws]"); await sleep(1000);
    const d1 = await Q.ev("[liquidCursorLab.engine.state.draws, liquidCursorLab.engine.state.bead.draws, liquidCursorLab.engine.state.bead.visible, liquidCursorLab.engine.state.drop.tp]");
    ev.performance = { frozen: perf, realTimeIdle: idle, realTimeGooBursts: rt, rest: { bodyDrawsPerSec: d1[0] - d0[0], tileDrawsPerSec: d1[1] - d0[1], tilesVisible: d1[2], taper: d1[3] } };
    check(GP, "0-5 live rich pieces: frame CPU (integrate + draw) and the forced draw stay well under 1 ms", [0, 1, 2, 3, 4, 5].every((n) => perf[n].framePlusDrawMs < 1 && perf[n].forcedDrawMs < 1),
      [0, 1, 2, 3, 4, 5].map((n) => `${n}: ${perf[n].framePlusDrawMs} / ${perf[n].forcedDrawMs} ms (${perf[n].tilesVisible} tiles)`).join(" · "));
    check(GP, "real time with Rich goo bursts every 420 ms for 2.5 s vs the same page idle: frame rate ≥ 90% of idle, frame callback < 1 ms, droplet step + draw < 0.5 ms", rt.fps >= 0.9 * idle.fps && rt.workMs < 1 && rt.dropStepMs + rt.dropDrawMs < 0.5,
      `idle ${idle.fps} fps (worst ${idle.worstMs} ms) · goo bursts ${rt.fps} fps (worst ${rt.worstMs} ms), mean ${rt.meanLive} live, peak ${rt.peakLive}; callback ${rt.workMs} ms, step ${rt.dropStepMs} ms, draw ${rt.dropDrawMs} ms (EMA)`);
    check(GP, "idle shutdown: once the goo has gone, no draws on the body canvas or any tile, taper 0", ev.performance.rest.bodyDrawsPerSec === 0 && ev.performance.rest.tileDrawsPerSec === 0 && !d1[2] && d1[3] === 0,
      `body ${ev.performance.rest.bodyDrawsPerSec}/s, tiles ${ev.performance.rest.tileDrawsPerSec}/s, tiles visible ${d1[2]}, taper ${d1[3]}`);
    allLogs.push(...Q.logs.map((m) => `rich perf: ${m}`));
    await Q.close();
  }
}
