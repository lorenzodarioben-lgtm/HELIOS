// Liquid cursor lab, Phase 4.5 correction checks: the connected goo wake (rejected by the user, kept whole as the snapshot
// "Connected goo · previous (rejected)", ?pool=connectedBalanced; the default is now the reference goo, check-spine.mjs). Imported by check-lab.mjs (group
// names "wake …"). Deterministic dynamics in Node (tools/pool-sim.mjs at 60/120/144/165 Hz): quiet motion, the brief's
// gestures, tail length, connectivity, the bulb and splash hierarchy, the speed-trail detector, limits and frame rates.
// Then the real page (pinned to the snapshot): the tail on screen as one surface with the body, inversion, the untouched body, the
// manual controls, Mode C, file:// and performance.
import { openPage, decodePNG, sleep } from "./cdp.mjs";
import { installHelpers } from "./silhouette.mjs";
import { loadLab, simulate, GESTURES, RICH_GESTURES, randomScribble } from "./pool-sim.mjs";

const HZ = [60, 120, 144, 165];

export async function wakeChecks(B, ctx) {
  const { check, info, HTTP, FILE, allLogs } = ctx;
  const G = "wake", GD = "wake dynamics", GR = "wake rendering", GP = "wake performance";
  const ev = {}; info.wake = ev;
  const W = loadLab(), CFG = W.LIQUID_CURSOR_CONFIG, POOLS = CFG.lab.poolPresets, WK = CFG.wake, CB = POOLS.connectedBalanced.values;
  const sc = {};
  const GS_ = { stationary: GESTURES.stationary, slow: GESTURES.slow, navigation: RICH_GESTURES.navigation, mediumSweep: RICH_GESTURES.mediumSweep, sweep: GESTURES.sweep, sweepFast: GESTURES.sweepFast,
    fastNav: RICH_GESTURES.fastNav, strongFlick: RICH_GESTURES.strongFlick, sharpTurn: RICH_GESTURES.sharpTurn, fastReversal: RICH_GESTURES.fastReversal, extremeFlick: GESTURES.extremeFlick,
    extremeWhip: RICH_GESTURES.extremeWhip, zigzag: RICH_GESTURES.zigzag, catch: { v: (t) => (t < 0.117 ? [3200 * Math.min(1, t / 0.025), 0] : [0, 0]), ms: 1400 } };
  for (const [g, gest] of Object.entries(GS_)) sc[g] = HZ.map((hz) => simulate(W, gest, { hz, params: CB }));
  const tl = (t) => `${t.outcome}:${t.maxLen.toFixed(0)}px/${t.connectedMs.toFixed(0)}ms/bulb ${t.rb.toFixed(1)}/+${t.splash}`;
  const show = (g) => sc[g].map((r) => `${r.hz} Hz ${r.tails.map(tl).join(" ") || "no tail"}`).join(" · ");
  ev.scenarios = Object.fromEntries(Object.entries(sc).map(([g, rs]) => [g, rs.map((r) => ({ hz: r.hz, tails: r.tails.map((t) => ({ outcome: t.outcome, maxLen: +t.maxLen.toFixed(1), connectedMs: +t.connectedMs.toFixed(0), rb: +t.rb.toFixed(2), splash: t.splash, curvature: +t.curvature.toFixed(2) })), pieces: r.events.map((e) => e.kind).join(","), peakMaterial: r.peakMaterial }))]));

  check(G, "\"Connected goo · previous (rejected)\" keeps the first connected goo whole (wake on, spine off, rich goo on for the pieces' flight and budget, capacity 4, every value spelled out); its sparse / heavy / too-much variants are kept in the history group",
    CB.wakeOn === 1 && CB.spineOn === 0 && CB.gooOn === 1 && CB.poolMax === 4 && Object.keys(W.LiquidCursor.PARAMS).filter((k) => k.startsWith("wake")).every((k) => k in CB) && ["connectedSparse", "connectedHeavy", "connectedBoundary"].every((k) => POOLS[k] && POOLS[k].values.spineOn === 0),
    `connectedBalanced: wakeOn ${CB.wakeOn}, spineOn ${CB.spineOn}, gooOn ${CB.gooOn}, capacity ${CB.poolMax}, ${Object.keys(CB).filter((k) => k.startsWith("wake")).length} of ${Object.keys(W.LiquidCursor.PARAMS).filter((k) => k.startsWith("wake")).length} wake values spelled out`);
  // ---------------------------------------------------------------- quiet motion stays clean
  check(GD, "normal motion stays clean: stationary, slow, ordinary navigation, smooth medium and fast sweeps and repeated fast navigation pull no tail and shed nothing, at 60/120/144/165 Hz",
    ["stationary", "slow", "navigation", "mediumSweep", "sweep", "sweepFast", "fastNav"].every((g) => sc[g].every((r) => r.tails.length === 0 && r.emitted === 0)),
    ["stationary", "slow", "navigation", "mediumSweep", "sweep", "sweepFast", "fastNav"].map((g) => `${g} ${sc[g].map((r) => r.tails.length + r.emitted).join("/")}`).join(" · "));
  // ---------------------------------------------------------------- the gestures: connected shape first
  const conn = (g, minLen, maxLen, minMs) => sc[g].every((r) => r.tails.length >= 1 && r.tails[0].maxLen >= minLen && r.tails[0].maxLen <= maxLen && r.tails[0].connectedMs >= minMs && r.tails[0].rb >= 8);
  check(GD, "strong flick: a connected tail with a bulb (60-110 px, connected at least 100 ms, bulb ≥ 8 px), then the bulb pinches off with at most 2 splash beads or rejoins, at every frame rate",
    conn("strongFlick", 60, 110, 100) && sc.strongFlick.every((r) => r.tails[0].splash <= 2 && r.emitted <= 3), show("strongFlick"));
  check(GD, "sharp turn and fast reversal: a connected tail with a bulb (60-115 px, at least 100 ms) and at most 2 supporting beads; through a turn the tail curves",
    conn("sharpTurn", 60, 115, 100) && conn("fastReversal", 60, 115, 100) && [...sc.sharpTurn, ...sc.fastReversal].every((r) => r.emitted <= 3) && sc.sharpTurn.some((r) => r.tails[0].curvature >= 0.1),
    `turn ${show("sharpTurn")} (bend ${sc.sharpTurn.map((r) => r.tails[0].curvature.toFixed(2)).join("/")}) · reversal ${show("fastReversal")}`);
  {
    const sl = Math.max(...sc.strongFlick.map((r) => r.tails[0].maxLen)), wl = Math.min(...sc.extremeWhip.map((r) => r.tails[0].maxLen));
    check(GD, "extreme whip: the strongest tail (at least 15 px longer than a strong flick's), the largest bulb (≥ 10 px) and a few extra beads, still within the length limit",
      sc.extremeWhip.every((r) => r.tails[0].rb >= 10 && r.tails[0].maxLen <= WK.lenMax + 15 && (r.tails[0].outcome === "merge" || r.tails[0].splash >= 2)) && wl >= sl + 15, `${show("extremeWhip")}; shortest whip tail ${wl.toFixed(0)} px vs longest strong-flick tail ${sl.toFixed(0)} px`);
  }
  check(GD, "a flick that stops dead: the body catches its own tail, which rejoins it (merge) or leaves its bulb close by; nothing is flung away",
    sc.catch.every((r) => r.tails.length >= 1 && r.events.every((e) => (e.travel ?? 0) < 120)), show("catch"));
  check(GD, "compound zigzag: a tail per hard swing (one at a time), pieces never over the capacity, material (tail + pieces) at most 5",
    sc.zigzag.every((r) => r.tails.length >= 1 && r.peakLive <= 4 && r.peakMaterial <= 5), `${sc.zigzag.map((r) => `${r.hz} Hz ${r.tails.length} tails, ${r.emitted} pieces, peak material ${r.peakMaterial}`).join(" · ")}`);
  // ---------------------------------------------------------------- length, thickness, timing over the gestures and 40 random violent scribbles
  const scr = []; for (let s = 1; s <= 40; s++) scr.push(simulate(W, randomScribble(s), { hz: HZ[s % 4], params: CB }));
  const allT = [...Object.values(sc).flat(), ...scr].flatMap((r) => r.tails), allR = [...Object.values(sc).flat(), ...scr];
  {
    const maxLen = Math.max(...allT.map((t) => t.maxLen)), reach = Math.max(...allT.map((t) => t.maxReach)), thin = Math.min(...allT.map((t) => t.minStrandR)), con = Math.max(...allT.map((t) => t.connectedMs)), life = Math.max(...allT.map((t) => t.lifeMs));
    ev.limits = { tails: allT.length, maxLenPx: +maxLen.toFixed(1), maxReachPx: +reach.toFixed(1), thinnestStrandPx: +thin.toFixed(2), longestConnectedMs: +con.toFixed(0), longestTailLifeMs: +life.toFixed(0) };
    check(GD, "a short expressive tail, never a long ribbon: never past its hard limit (1.1 x the 120 px strongest-motion length, root to bulb), every point inside the 420 px body canvas (≤ 204 px from its centre)",
      maxLen <= 1.1 * WK.lenMax + 0.5 && reach <= 204, `${allT.length} tails: longest ${maxLen.toFixed(0)} px, furthest point ${reach.toFixed(0)} px from the body centre`);
    check(GD, "thick, not stringy: once grown in, the strand is never thinner than 4 px in radius (no hairline) until the neck forms; no tail stays connected longer than 260 ms or lives longer than 420 ms",
      thin >= 4 && con <= 260 && life <= 420, `thinnest strand radius ${thin.toFixed(2)} px; longest connected ${con.toFixed(0)} ms; longest tail life ${life.toFixed(0)} ms`);
  }
  {
    const pieces = allR.flatMap((r) => r.events.filter((e) => e.src === "wake")), bulbs = pieces.filter((e) => e.kind === "bulb"), splash = pieces.filter((e) => e.kind === "splash");
    const perPinch = allT.filter((t) => t.outcome === "pinch").map((t) => t.splash), lifeB = bulbs.map((e) => e.life), lifeS = splash.map((e) => e.life);
    ev.pieces = { bulbs: bulbs.length, splash: splash.length, bulbR: [Math.min(...bulbs.map((e) => e.r0)), Math.max(...bulbs.map((e) => e.r0))].map((x) => +x.toFixed(2)), splashR: [Math.min(...splash.map((e) => e.r0)), Math.max(...splash.map((e) => e.r0))].map((x) => +x.toFixed(2)),
      splashPerPinch: [Math.min(...perPinch), Math.max(...perPinch)], bulbLifeMs: [Math.min(...lifeB), Math.max(...lifeB)].map(Math.round), splashLifeMs: [Math.min(...lifeS), Math.max(...lifeS)].map(Math.round), pinches: perPinch.length, merges: allT.filter((t) => t.outcome === "merge").length };
    check(GD, "hierarchy: body > tail > bulb > splash; a pinched bulb is 6.5-12 px, splash beads 2.5-4.2 px, 0-3 per pinch; short lives (bulb ≤ 520 ms, splash ≤ 420 ms): accents of the tail, not marbles",
      Math.min(...bulbs.map((e) => e.r0)) >= 6.5 && Math.max(...bulbs.map((e) => e.r0)) <= 12 && Math.min(...splash.map((e) => e.r0)) >= 2.5 && Math.max(...splash.map((e) => e.r0)) <= 4.21 && Math.max(...perPinch) <= 3 && Math.max(...lifeB) <= 520 && Math.max(...lifeS) <= 420,
      `${bulbs.length} bulbs ${ev.pieces.bulbR.join("-")} px (life ${ev.pieces.bulbLifeMs.join("-")} ms), ${splash.length} splash beads ${ev.pieces.splashR.join("-")} px (life ${ev.pieces.splashLifeMs.join("-")} ms), ${ev.pieces.splashPerPinch.join("-")} per pinch; ${ev.pieces.pinches} pinches, ${ev.pieces.merges} rejoins`);
    const tr = pieces.map((e) => e.travel ?? 0), meanTr = tr.reduce((a, b) => a + b, 0) / tr.length;
    check(GD, "pieces stay by the tail: a pinched bulb or splash bead is left behind where it broke off (mean free travel under 55 px; Phase 4 droplets: 76 px)", meanTr < 55, `mean travel ${meanTr.toFixed(1)} px over ${tr.length} pieces`);
  }
  // ---------------------------------------------------------------- event-driven, not a speed trail
  {
    const speedOnly = allT.filter((t) => !(t.swingAtStart >= 1)).length;
    const bnd = HZ.map((hz) => simulate(W, RICH_GESTURES.fastNav, { hz, params: POOLS.connectedBoundary.values })), bsw = HZ.map((hz) => simulate(W, GESTURES.sweepFast, { hz, params: POOLS.connectedBoundary.values }));
    ev.trail = { tails: allT.length, speedOnlyTails: speedOnly, boundaryFastNavTails: bnd.map((r) => r.tails.length), boundarySweepTails: bsw.map((r) => r.tails.length) };
    check(G, "event-driven: every tail starts on a swing over the trigger threshold (none from speed or distance alone); the too-much diagnostic, which also pulls tails from speed, trails during fast navigation and sweeps, and balanced does not",
      speedOnly === 0 && bnd.every((r) => r.tails.length >= 3 && r.tails.every((t) => t.swingAtStart < 1 || t.cause === "speed")) && bsw.every((r) => r.tails.length >= 1),
      `${allT.length} tails, ${speedOnly} without a swing; too-much diagnostic: fast navigation ${bnd.map((r) => r.tails.length).join("/")} tails, 4000 px/s sweep ${bsw.map((r) => r.tails.length).join("/")}`);
  }
  // ---------------------------------------------------------------- limits, continuity, frame rates, presets
  {
    let ow = 0, nf = 0, over = 0, endBusy = 0, step = 0;
    for (const r of allR) { ow += r.overwrites; nf += r.nonFinite; if (r.peakLive > 4) over++; if (r.endLive !== 0 || r.endTail !== "IDLE") endBusy++; for (const t of r.tails) step = Math.max(step, t.maxStep); }
    const flood = simulate(W, { v: () => [0, 0], ms: 2600 }, { hz: 120, params: CB, manual: Array.from({ length: 8 }, (_, k) => ({ t: k * 0.3, opts: { angleDeg: k * 45, speed: 700, peak: 2.05, extreme: true } })) });
    ev.continuity = { runs: allR.length, overwrites: ow, nonFinite: nf, overCapacity: over, notEmptied: endBusy, fastestPointPxPerS: +step.toFixed(0), floodPeak: flood.peakLive, floodPeakMaterial: flood.peakMaterial, floodSuppressed: flood.suppressed };
    check(G, "limits and continuity: never more than 4 free pieces or one tail, nothing recycled, no NaN; the tail moves continuously (no drawn point faster than 4500 px/s beyond the body's own move: it whips, it never jumps); everything ends; a manual flood is cleanly suppressed",
      ow === 0 && nf === 0 && over === 0 && endBusy === 0 && step <= 4500 && flood.peakLive <= 4 && flood.overwrites === 0 && flood.endLive === 0,
      `${allR.length} runs: ${over} over capacity, ${ow} overwrites, ${nf} non-finite, ${endBusy} not emptied; fastest tail point ${step.toFixed(0)} px/s beyond the body; manual flood peak ${flood.peakLive} pieces (material ${flood.peakMaterial}), ${flood.suppressed} suppressed`);
    const fr = (g) => sc[g].map((r) => r.tails[0] ? r.tails[0].connectedMs : NaN), spread = (g) => Math.max(...fr(g)) - Math.min(...fr(g));
    check(GD, "frame-rate independent: a strong flick, sharp turn, fast reversal and extreme whip pull a tail at 60, 120, 144 and 165 Hz alike (connected time within 45 ms across rates, the 60 Hz frame and the snap included)",
      ["strongFlick", "sharpTurn", "fastReversal", "extremeWhip"].every((g) => sc[g].every((r) => r.tails.length >= 1) && spread(g) <= 45),
      ["strongFlick", "sharpTurn", "fastReversal", "extremeWhip"].map((g) => `${g} ${fr(g).map((x) => x.toFixed(0)).join("/")} ms`).join(" · "));
    const D = {};
    for (const k of ["connectedSparse", "connectedBalanced", "connectedHeavy", "connectedBoundary"]) {
      let len = 0, n = 0, mat = 0, frames = 0, rb = 0;
      for (let s = 1; s <= 20; s++) { const r = simulate(W, randomScribble(s), { hz: 120, params: POOLS[k].values }); for (const t of r.tails) { len += t.maxLen; rb += t.rb; n++; } mat += r.material.reduce((a, b) => a + b, 0); frames += r.material.length; }
      D[k] = { meanTailLen: +(len / n).toFixed(1), meanBulb: +(rb / n).toFixed(2), meanMaterial: +(mat / frames).toFixed(3) };
    }
    ev.presets = D;
    const o = ["connectedSparse", "connectedBalanced", "connectedHeavy", "connectedBoundary"];
    check(GD, "the connected presets are a clear progression: sparse < balanced < heavy < too much in mean tail length, bulb size and material", o.every((k, i) => i === 0 || (D[k].meanTailLen > D[o[i - 1]].meanTailLen && D[k].meanBulb > D[o[i - 1]].meanBulb && D[k].meanMaterial > D[o[i - 1]].meanMaterial)),
      o.map((k) => `${k} ${D[k].meanTailLen} px / bulb ${D[k].meanBulb} / material ${D[k].meanMaterial}`).join(" < "));
  }

  // ---------------------------------------------------------------- the real page (Mode B, the snapshot)
  const P = await openPage(B, HTTP + "?mode=B&pool=connectedBalanced");
  await P.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
  {
    const ui = await P.ev(`(() => { const E = liquidCursorLab.engine; return { banner: document.querySelector('#banner-b').textContent, pool: document.querySelector('#pool-preset').value, label: E.state.poolPreset, wake: E.params.wakeOn,
      tune: ["wakeLenMin", "wakeLenMax", "wakeStrand", "wakeBulb", "wakeUnion", "wakeHoldMs", "wakeNeckMs", "wakeSplash", "wakeRelease", "wakeBulbLife", "wakeOmega", "wakeLag"].filter((k) => !document.querySelector('#tune-' + k)),
      keys: ["8", "6"].map((k) => { document.dispatchEvent(new KeyboardEvent("keydown", { key: k })); return E.state.poolPreset + "|" + E.params.wakeOn + "|" + E.params.spineOn; }) }; })()`);
    ev.ui = ui;
    check(GR, "?pool=connectedBalanced opens the rejected connected goo (wake on); key 8 goes to the reference goo and key 6 back to it; the 12 connected-goo tuning controls exist",
      ui.pool === "connectedBalanced" && ui.wake === 1 && ui.label === "Connected goo · previous (rejected)" && ui.tune.length === 0 && ui.keys[0].startsWith("Reference goo · balanced (default)|") && ui.keys[0].endsWith("|1") && ui.keys[1] === "Connected goo · previous (rejected)|1|0",
      `${ui.label}; keys → ${ui.keys.join(" → ")}; missing controls ${ui.tune.join(",") || "none"}`);
  }
  {
    // the tail on screen: a strong flick, at the frame the tail is longest: one connected surface with the body, the bulb drawn
    const t = await P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop, W = D.wake; E.clearDroplets(); E.resetBody(); const p = __lc.points([{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], 1050, 440); __lc.ready(p.start[0], p.start[1]); __lc.seq(p.pts.concat(Array(60).fill(null)));
      let best = null; for (let i = 0; i < 60; i++) { __lc.step(); if (W.state === "PULL" && W.len >= 55 && W.age > 50) { const u = E.readUniforms(), m = E.readMask(), e = E.state.effDpr, tx = E.state.renderX - 210, ty = E.state.renderY - 210;
        const A = (x, y) => { const px = Math.round((x - tx) * e - 0.5), py = Math.round(m.h - (y - ty) * e - 0.5); return px < 0 || py < 0 || px >= m.w || py >= m.h ? 0 : m.px[(py * m.w + px) * 4 + 3]; };
        const mid = [(W.x[2]), (W.y[2])], bulb = [W.x[4], W.y[4]], beside = [W.x[2] - (W.y[4] - W.y[0]) / W.len * (W.r[2] + 6), W.y[2] + (W.x[4] - W.x[0]) / W.len * (W.r[2] + 6)];
        best = { frame: i, len: W.len, k: u.uWakeK, comps: __lc.components(), aMid: A(...mid), aBulb: A(...bulb), aBeside: A(...beside), bulbR: W.r[4], strandR: W.r[2], mid, bulb }; break; } }
      return best; })()`);
    ev.tailOnScreen = t;
    check(GR, "the tail is drawn as one surface with the body (one connected piece of liquid), solid along the strand and at the bulb, with clear space beside the strand",
      !!t && t.k > 0 && t.comps === 1 && t.aMid > 200 && t.aBulb > 200 && t.aBeside < 30, t ? `frame ${t.frame}: tail ${t.len.toFixed(0)} px, ${t.comps} connected piece(s), coverage strand ${t.aMid}/255, bulb ${t.aBulb}/255 (r ${t.bulbR.toFixed(1)} px), beside the strand ${t.aBeside}/255` : "no frame with a drawn-out tail");
    if (t) { // difference inversion over the strand and the bulb is exact
      await P.frames(2); const pts = [t.mid, t.bulb], on = []; for (const [x, y] of pts) on.push(decodePNG(await P.shot(Math.round(x) - 2, Math.round(y) - 2, 5, 5)).px(2, 2));
      await P.ev("(document.querySelectorAll('.lc-canvas, .lc-bead').forEach((c) => (c.style.opacity = '0')), 1)"); await P.frames(2); const off = []; for (const [x, y] of pts) off.push(decodePNG(await P.shot(Math.round(x) - 2, Math.round(y) - 2, 5, 5)).px(2, 2));
      await P.ev("(document.querySelectorAll('.lc-canvas, .lc-bead').forEach((c) => (c.style.opacity = '')), 1)");
      const err = on.map((p, i) => Math.max(...p.map((v, k) => Math.abs(v - (255 - off[i][k])))));
      check(GR, "difference inversion stays exact over the tail and its bulb: one material with the body, no new colour", err.every((x) => x <= 6) && on.every((p, i) => Math.max(...p.map((v, k) => Math.abs(v - off[i][k]))) > 40), `centre error vs exact inversion: strand ${err[0]}, bulb ${err[1]}`);
    }
    // the body with no tail out is the approved body: Mode A and connected goo give identical masks frame by frame
    const maskSig = `(() => { const m = liquidCursorLab.engine.readMask(); let h = 2166136261 >>> 0; for (let i = 0; i < m.px.length; i += 4) { h ^= m.px[i + 3]; h = Math.imul(h, 16777619) >>> 0; } return h; })()`;
    const body = [];
    for (const mode of ["A", "B"]) { await P.ev(`liquidCursorLab.engine.setMode("${mode}"), 1`); await P.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
      body.push(await P.ev(`(() => { const E = liquidCursorLab.engine, e0 = E.state.drop.events; E.clearDroplets(); E.resetBody(); const p = __lc.points([{ dx: 1, dy: 0, v: 2600, ms: 300, ramp: 120 }, { dx: 0.6, dy: 0.8, v: 1200, ms: 200 }], 1100, 500); __lc.ready(p.start[0], p.start[1]); __lc.seq(p.pts.concat(Array(40).fill(null)));
        const out = []; for (let i = 0; i < 100; i++) { __lc.step(); if (i % 5 === 0) out.push(${maskSig}); } return { sig: out, events: E.state.drop.events - e0, k: E.readUniforms().uWakeK }; })()`)); }
    const same = body[0].sig.filter((h, i) => h === body[1].sig[i]).length;
    ev.bodyUnchanged = { framesCompared: body[0].sig.length, identical: same, tails: body[1].events };
    check(GR, "primary body unchanged when no tail is out: the same sweep and curve in Mode A and in connected goo give bit-identical masks on every sampled frame (tail union radius 0)",
      same === body[0].sig.length && body[1].events === 0 && body[1].k === 0, `${same}/${body[0].sig.length} sampled frames identical; ${body[1].events} tails; uWakeK ${body[1].k}`);
  }
  {
    // manual controls: the real tail lifecycle from a still body; Clear ends everything
    const m = await P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop, W = D.wake, out = {}; E.setNatural(false);
      const go = (opts, frames) => { E.clearDroplets(); E.resetBody(); __lc.ready(1250, 440); const states = [], kinds = new Set(); let peak = 0, maxLen = 0; const ok = E.triggerDroplet(opts);
        for (let i = 0; i < frames; i++) { __lc.hold(1000 / 120); if (states[states.length - 1] !== W.state) states.push(W.state); maxLen = Math.max(maxLen, W.len); peak = Math.max(peak, D.live); for (const s of D.slots) if (s.state !== "IDLE") kinds.add(s.kind); }
        return { ok, states: states.join(">"), kinds: [...kinds].join(","), peak, maxLen: Math.round(maxLen), tails: D.tails }; };
      out.shed = go({ angleDeg: 180, speed: 420 }, 70); out.strong = go({ angleDeg: 180, speed: 567, strength: 0.9, peak: 1.3 }, 70); out.extreme = go({ angleDeg: 180, speed: 672, strength: 1, extreme: true, peak: 2.05 }, 80);
      out.heavy = go({ angleDeg: 160, speed: 630, strength: 1, peak: 2.1, plan: [{ ms: 120, deg: 70, peak: 1.8 }, { ms: 240, deg: -60, peak: 1.6 }] }, 200);
      E.clearDroplets(); out.after = [D.live, W.state]; E.setNatural(true); return out; })()`);
    ev.manual = m;
    const life = (x) => /^IDLE>PULL>NECK>(RETRACT|MERGE)>IDLE/.test(x.states) || /^PULL>NECK>(RETRACT|MERGE)>IDLE/.test(x.states) || /^IDLE>PULL>(MERGE)>IDLE/.test(x.states);
    check(GR, "manual controls throw a real tail from a still body (pull, neck, pinch or rejoin, snap back), the extreme one longer; the heavy burst queues more tails one at a time; never over capacity; Clear ends everything",
      [m.shed, m.strong, m.extreme].every((x) => x.ok && life(x)) && m.extreme.maxLen > m.shed.maxLen && m.heavy.tails - m.extreme.tails >= 2 && [m.shed, m.strong, m.extreme, m.heavy].every((x) => x.peak <= 4) && m.after[0] === 0 && m.after[1] === "IDLE",
      `shed ${m.shed.states} ${m.shed.maxLen} px (${m.shed.kinds}) · strong ${m.strong.maxLen} px · extreme ${m.extreme.maxLen} px (${m.extreme.kinds}) · heavy burst ${m.heavy.tails - m.extreme.tails} tails, peak ${m.heavy.peak} pieces; after Clear ${m.after.join("/")}`);
  }
  allLogs.push(...P.logs.map((x) => `wake: ${x}`));
  check(GR, "no console errors or warnings (connected goo page)", P.logs.length === 0, P.logs.slice(0, 3).join(" | ") || "none");
  await P.close();
  {
    const C = await openPage(B, HTTP + "?mode=C&pool=connectedBalanced");
    await C.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
    await C.ev(`(() => { const E = liquidCursorLab.engine; E.clearDroplets(); E.resetBody(); const p = __lc.points([{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], 1050, 440); __lc.ready(p.start[0], p.start[1]); __lc.seq(p.pts.concat(Array(30).fill(null))); for (let i = 0; i < 18; i++) __lc.step(); return 1; })()`);
    await sleep(450);
    const row = await C.ev(`(() => { const dt = [...document.querySelectorAll('#debug dt')].find((d) => d.textContent === "Connected goo"); return dt ? dt.nextElementSibling.textContent : ""; })()`);
    ev.modeC = row;
    check(GR, "Mode C reads out the tail: state, age, length against its limit, bulb radius, neck, strength, cause, the tail / pinch / rejoin counts and the material count", /^tail (PULL|NECK) \d+ ms · length \d+\/\d+ px · bulb r [\d.]+ · neck \d+% · strength [\d.]+ · \w+ · tails \d+ \(pinched \d+, rejoined \d+\) · catches \d+ · material \d+$/.test(row), row);
    allLogs.push(...C.logs.map((x) => `wake mode C: ${x}`));
    await C.close();
  }
  {
    const F = await openPage(B, FILE + "?mode=B&pool=connectedBalanced");
    await F.ev(`(${installHelpers.toString()})(), __lc.begin(), 1`);
    const r = await F.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop, W = D.wake; E.setNatural(false); E.resetBody(); __lc.ready(700, 440); const ok = E.triggerDroplet({ angleDeg: 180, speed: 600, peak: 1.6 }); let maxLen = 0; const st = [];
      for (let i = 0; i < 60; i++) { __lc.hold(1000 / 120); maxLen = Math.max(maxLen, W.len); if (st[st.length - 1] !== W.state) st.push(W.state); } return [ok, Math.round(maxLen), st.join(">"), E.state.poolPreset, location.protocol]; })()`);
    allLogs.push(...F.logs.map((x) => `wake file: ${x}`));
    check(G, "file://: the connected goo runs without a server (its snapshot, a tail through its whole lifecycle), console clean", r[0] && r[1] >= 40 && /NECK>(RETRACT|MERGE)>IDLE/.test(r[2]) && r[3].startsWith("Connected goo · previous") && r[4] === "file:" && F.logs.length === 0,
      `${r[3]} · tail ${r[1]} px · ${r[2]} · ${r[4]} · console ${F.logs.length ? F.logs[0] : "clean"}`);
    await F.close();
  }
  {
    const Q = await openPage(B, HTTP + "?mode=B&pool=connectedBalanced");
    await Q.ev(`(${installHelpers.toString()})(), __lc.begin(), 1`);
    const perf = await Q.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop, W = D.wake, out = {}; E.setNatural(false);
      const tail = () => { E.clearDroplets(); E.resetBody(); __lc.ready(900, 440); E.triggerDroplet({ angleDeg: 180, speed: 700, peak: 2 }); __lc.hold(60); }; // a drawn-out tail
      tail(); let t0 = performance.now(); for (let i = 0; i < 6; i++) E.advance(1000 / 120, 1000 / 120); out.tailFrameMs = +((performance.now() - t0) / 6).toFixed(4);
      tail(); out.tailForcedDrawMs = +E.benchDraw(300).toFixed(4); out.tailState = W.state;
      E.clearDroplets(); __lc.ready(900, 440); out.idleForcedDrawMs = +E.benchDraw(300).toFixed(4);
      E.clearDroplets(); E.setNatural(true); return out; })()`);
    await Q.ev("liquidCursorLab.engine.setFrozen(false), 1");
    const window_ = (sheds) => Q.ev(`new Promise((res) => { const E = liquidCursorLab.engine, S = E.state; S.workMs = 0; S.dropWorkMs = 0; S.dropDrawMs = 0; let n = 0, frames = 0, worst = 0, last = 0, tails = S.drop.tails; const t0 = performance.now();
      const shed = ${sheds} ? setInterval(() => E.triggerDroplet({ angleDeg: (n++ * 97) % 360, speed: 650, peak: 1.8 }), 380) : 0;
      (function f(t) { if (last) worst = Math.max(worst, t - last); last = t; frames++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else { clearInterval(shed); res({ fps: +(frames / ((performance.now() - t0) / 1000)).toFixed(1), worstMs: +worst.toFixed(1), tails: S.drop.tails - tails, workMs: +S.workMs.toFixed(4), dropStepMs: +S.dropWorkMs.toFixed(4), dropDrawMs: +S.dropDrawMs.toFixed(4) }); } })(performance.now()); })`);
    await sleep(800); const idle = await window_(false), rt = await window_(true);
    await Q.move(700, 330); await sleep(2400);
    const d0 = await Q.ev("[liquidCursorLab.engine.state.draws, liquidCursorLab.engine.state.bead.draws]"); await sleep(1000);
    const d1 = await Q.ev("[liquidCursorLab.engine.state.draws, liquidCursorLab.engine.state.bead.draws, liquidCursorLab.engine.state.drop.wake.state]");
    ev.performance = { frozen: perf, realTimeIdle: idle, realTimeTails: rt, rest: { bodyDrawsPerSec: d1[0] - d0[0], tileDrawsPerSec: d1[1] - d0[1], tail: d1[2] } };
    check(GP, "a drawn-out tail costs little: frame CPU (integrate + draw) and the forced draw with the tail under 1 ms", perf.tailFrameMs < 1 && perf.tailForcedDrawMs < 1 && perf.tailState !== "IDLE",
      `with a tail (${perf.tailState}): ${perf.tailFrameMs} ms CPU per frame, ${perf.tailForcedDrawMs} ms forced draw (idle body ${perf.idleForcedDrawMs} ms)`);
    check(GP, "real time with a tail every 380 ms for 2.5 s vs the same page idle: frame rate ≥ 90% of idle, frame callback < 1 ms, droplet step + draw < 0.5 ms; then idle again: no draws, no tail",
      rt.fps >= 0.9 * idle.fps && rt.workMs < 1 && rt.dropStepMs + rt.dropDrawMs < 0.5 && ev.performance.rest.bodyDrawsPerSec === 0 && ev.performance.rest.tileDrawsPerSec === 0 && d1[2] === "IDLE",
      `idle ${idle.fps} fps (worst ${idle.worstMs} ms) · with ${rt.tails} tails ${rt.fps} fps (worst ${rt.worstMs} ms); callback ${rt.workMs} ms, step ${rt.dropStepMs} ms, draw ${rt.dropDrawMs} ms (EMA); at rest ${ev.performance.rest.bodyDrawsPerSec} body / ${ev.performance.rest.tileDrawsPerSec} tile draws per s`);
    allLogs.push(...Q.logs.map((x) => `wake perf: ${x}`));
    await Q.close();
  }
}
