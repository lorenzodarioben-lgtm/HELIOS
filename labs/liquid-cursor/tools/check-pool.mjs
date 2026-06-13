// Liquid cursor lab, Phase 4 checks: the controlled droplet pool. Imported by check-lab.mjs (group names "pool …").
// Deterministic dynamics in Node (tools/pool-sim.mjs: the lab's own scripts at 60/120/144/165 Hz), then the real page:
// rendering surfaces and inversion, the manual controls, real-input safety, file://, and performance.
// Phase 4.5: the default pool is now rich goo (check-rich.mjs). These checks run the Phase 4 default as the historical
// "balanced" snapshot (?pool=balanced, every value spelled out), so they still test exactly what 0c75065 shipped.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openPage, decodePNG, sleep } from "./cdp.mjs";
import { installHelpers } from "./silhouette.mjs";
import { loadLab, simulate, GESTURES, randomScribble } from "./pool-sim.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const HZ = [60, 120, 144, 165], FRAME = 1000 / 120;

export async function phase4Checks(B, ctx) {
  const { check, info, HTTP, FILE, allLogs } = ctx;
  const G = "pool", GD = "pool dynamics", GR = "pool rendering", GS = "pool safety", GP = "pool performance";
  const ev = {}; info.pool = ev;
  const W = loadLab(), POOLS = W.LIQUID_CURSOR_CONFIG.lab.poolPresets, CUR = POOLS.balanced.values; // the Phase 4 default (0c75065)
  const CFGP = { max: CUR.poolMax, satAngleDeg: CUR.poolSatAngleDeg, spacingMs: CUR.poolSpacingMs, followScale: CUR.poolFollowScale };

  // ---------------------------------------------------------------- the approved Phase 3 unit is unchanged
  {
    const git = (f) => execFileSync("git", ["-c", `safe.directory=${REPO.replace(/\\/g, "/")}`, "show", `d64ec76:labs/liquid-cursor/${f}`], { cwd: REPO, encoding: "utf8" });
    const O = loadLab({ "config.js": git("config.js"), "liquid-cursor.js": git("liquid-cursor.js"), "droplet.js": git("droplet.js") });
    const trace = (Wx, vals, g, hz) => { const r = simulate(Wx, g, { hz, params: vals }); return JSON.stringify(r.events.map((e) => [e.kind === "satellite" ? "s" : "u", e.startMs, e.releaseMs, e.r0, e.ux, e.uy, e.vRelease, e.travel, e.endMs, e.lastAlpha, e.lastR, e.states.join(">")])); };
    let same = 0, total = 0;
    for (const k of ["balanced", "balancedOriginal", "shortNeck", "longNeck"]) for (const hz of HZ) for (const g of ["flick", "turn", "reversal", "zigzag", "scribble", "sweep"]) {
      const ov = O.LIQUID_CURSOR_CONFIG.lab.dropletPresets[k].values, nv = { ...POOLS.single.values, ...W.LIQUID_CURSOR_CONFIG.lab.dropletPresets[k].values };
      total++; if (trace(O, ov, GESTURES[g], hz) === trace(W, nv, GESTURES[g], hz)) same++;
    }
    ev.phase3Identical = { same, total };
    check(G, "the \"Phase 3 approved\" snapshot (capacity 1) reproduces d64ec76 exactly: every droplet snapshot, gesture and frame rate", same === total, `${same}/${total} runs identical (event times, size, direction, release, travel, fade, state sequence)`);
    // with capacity 3 and one event, the pool runs the same unit: identical to Phase 3 frame for frame
    let one = 0, n1 = 0;
    for (const hz of HZ) for (const g of ["flick", "turn", "reversal"]) { n1++; if (trace(W, POOLS.single.values, GESTURES[g], hz) === trace(W, CUR, GESTURES[g], hz)) one++; }
    check(G, "one event in the Phase 4 pool is the approved Phase 3 droplet (bud, neck, thread, pinch, size, direction, release, life, shrink, fade)", one === n1, `${one}/${n1} single-event runs identical to the capacity-1 snapshot at 60/120/144/165 Hz`);
  }

  // ---------------------------------------------------------------- A-H at four frame rates (default pool)
  const runs = {};
  for (const g of ["stationary", "slow", "sweep", "sweepFast", "flick", "extremeFlick", "turn", "extremeTurn", "reversal", "zigzag", "scribble"]) runs[g] = HZ.map((hz) => simulate(W, GESTURES[g], { hz, params: CUR }));
  ev.gestures = Object.fromEntries(Object.entries(runs).map(([g, rs]) => [g, rs.map((r) => ({ hz: r.hz, events: r.events.map((e) => `${e.kind}:${e.r0.toFixed(2)}@${e.startMs}`), peakLive: r.peakLive, meanLive: +r.meanLive.toFixed(3) }))]));
  const kinds = (r) => r.events.map((e) => e.kind[0]).join("");
  check(GD, "A-C · stationary, slow movement and smooth sweeps (2600 and 4000 px/s) shed nothing, at 60/120/144/165 Hz", ["stationary", "slow", "sweep", "sweepFast"].every((g) => runs[g].every((r) => r.emitted === 0)),
    ["stationary", "slow", "sweep", "sweepFast"].map((g) => `${g} ${runs[g].map((r) => r.emitted).join("/")}`).join(" · "));
  for (const [g, label] of [["flick", "D · violent flick"], ["turn", "F · sharp turn"], ["reversal", "H · fast reversal"]])
    check(GD, `${label}: exactly one primary droplet, no follow-up, no satellite, at every frame rate`, runs[g].every((r) => kinds(r) === "p"), runs[g].map((r) => `${r.hz} Hz ${kinds(r) || "none"} (r ${r.events.map((e) => e.r0.toFixed(1)).join(",")})`).join(" · "));
  for (const [g, label] of [["extremeFlick", "E · extreme flick"], ["extremeTurn", "G · extreme sharp turn"]]) {
    const rs = runs[g], ok = rs.every((r) => { const [p, s] = r.events; return kinds(r) === "ps" && s.r0 <= 0.6 * p.r0 + 1e-9 && s.r0 >= 2.5 && s.life < p.life && s.startMs >= p.releaseMs && s.releaseMs - p.releaseMs >= 35 && s.releaseMs - p.releaseMs <= 100; });
    check(GD, `${label}: one primary, then one smaller, shorter-lived residual satellite pinching off 35-100 ms after it, at every frame rate`, ok,
      rs.map((r) => { const [p, s] = r.events; return s ? `${r.hz} Hz p ${p.r0.toFixed(1)} → s ${s.r0.toFixed(1)} px, +${(s.releaseMs - p.releaseMs).toFixed(0)} ms, life ${s.life.toFixed(0)}/${p.life.toFixed(0)}` : `${r.hz} Hz ${kinds(r)}`; }).join(" · "));
  }
  {
    const r = runs.extremeFlick[1], [p, s] = r.events, ang = Math.acos(Math.max(-1, Math.min(1, p.ux * s.ux + p.uy * s.uy)) ) * 180 / Math.PI;
    check(GD, "the satellite pinches off a little to one side of its parent (seeded 0.6-1 x satAngleDeg), never on top of it", ang >= 0.6 * CFGP.satAngleDeg - 0.01 && ang <= CFGP.satAngleDeg + 0.01, `${ang.toFixed(1)}° from the parent's attachment direction (satAngleDeg ${CFGP.satAngleDeg})`);
  }
  check(GD, "I · repeated violent zigzag and back-and-forth scribble: never more than capacity, never two necks, the same at every frame rate",
    ["zigzag", "scribble"].every((g) => runs[g].every((r) => r.peakLive <= CFGP.max && r.maxAttached <= 1)) && ["zigzag", "scribble"].every((g) => new Set(runs[g].map((r) => r.peakLive)).size === 1),
    ["zigzag", "scribble"].map((g) => `${g}: ${runs[g].map((r) => `${r.emitted} ev, peak ${r.peakLive}`).join(" / ")}`).join(" · "));
  check(GD, "every droplet completes its lifecycle and the pool empties (no stuck slot)", Object.values(runs).every((rs) => rs.every((r) => r.endLive === 0 && r.events.every((e) => e.states.join(">") === "BUDDING>NECKING>DETACHING>FREE>FADING"))),
    `${Object.values(runs).flat().reduce((x, r) => x + r.emitted, 0)} droplets, all BUDDING > NECKING > DETACHING > FREE > FADING > free slot`);
  {
    const fr = (g) => runs[g].map((r) => r.events[0]), tr = (g) => fr(g).map((e) => e.travel), rel = (g) => fr(g).map((e) => e.releaseMs - e.startMs);
    // the extreme gestures' bead carries far more abandoned momentum, sampled on whichever frame the trigger fires: the same
    // (approved Phase 3) unit gives the same spread at capacity 1, so they are held to the decision and timing, and 40%
    const ok = ["flick", "turn", "reversal", "extremeFlick", "extremeTurn"].every((g) => Math.max(...rel(g)) - Math.min(...rel(g)) <= 1000 / 60 + 0.5)
      && ["flick", "turn", "reversal"].every((g) => Math.max(...tr(g)) / Math.min(...tr(g)) < 1.12) && ["extremeFlick", "extremeTurn"].every((g) => Math.max(...tr(g)) / Math.min(...tr(g)) < 1.4);
    check(GD, "60/120/144/165 Hz: same release time (within a 60 Hz frame); free flight within 12% (violent) or 40% (extreme, as the Phase 3 unit itself)",
      ok, ["flick", "turn", "reversal", "extremeFlick", "extremeTurn"].map((g) => `${g} ${rel(g).map((x) => x.toFixed(0)).join("/")} ms, ${tr(g).map((x) => x.toFixed(0)).join("/")} px`).join(" · "));
  }
  // continuity: no overwrite, no teleport, no pop, no NaN, over the gestures and 40 random violent scribbles at 3 rates
  {
    let ow = 0, jf = 0, ja = 0, dr = 0, da = 0, nf = 0, n = 0;
    const all = [...Object.values(runs).flat()];
    for (let s = 1; s <= 40; s++) for (const hz of [60, 120, 165]) all.push(simulate(W, randomScribble(s), { hz, params: CUR }));
    for (const r of all) { n++; ow += r.overwrites; jf = Math.max(jf, r.jumpExcess); ja = Math.max(ja, r.attachedExcess); nf += r.nonFinite; if (r.hz >= 120) { dr = Math.max(dr, r.maxDr); da = Math.max(da, r.maxDa); } }
    ev.continuity = { runs: n, overwrites: ow, freeJumpExcess: +jf.toFixed(3), attachedExcess: +ja.toFixed(2), maxDr: +dr.toFixed(3), maxDa: +da.toFixed(3), nonFinite: nf };
    check(GD, "no live droplet is ever overwritten or recycled (slot identity holds until it fades)", ow === 0, `${ow} overwrites in ${n} runs`);
    check(GD, "no teleport: a free bead moves only by its own velocity; an attached bud rides the body's surface", jf <= 0.5 && ja <= 6, `free beads: worst excess ${jf.toFixed(3)} px over v·dt + 1.5 px (a coalescence's momentum merge); buds: worst ${ja.toFixed(2)} px beyond the body centre's move + 4.5 px (surface deformation at up to 4000 px/s, 60 Hz)`);
    check(GD, "no pop: after release, radius and opacity change smoothly (120-165 Hz: < 1 px and < 0.25 per frame, absorption included)", dr < 1 && da < 0.25, `largest per-frame change ${dr.toFixed(3)} px, opacity ${da.toFixed(3)}`);
    check(GD, "no NaN or Infinity in any slot (gestures and 120 random scribbles)", nf === 0, `${nf} non-finite values in ${n} runs`);
  }
  // active-count policy and distributions over 40 seeded random violent scribbles (4 s each, relentless)
  {
    const dist = {};
    for (const pk of ["single", "sparse", "balanced", "rich", "busy"]) {
      let ev2 = 0, share = [0, 0, 0, 0, 0, 0], peaks = [0, 0, 0, 0, 0, 0], att = 0, sizes = [], sat = 0, fol = 0;
      for (let s = 1; s <= 40; s++) { const r = simulate(W, randomScribble(s), { hz: 120, params: POOLS[pk].values }); ev2 += r.emitted; r.share.forEach((x, i) => (share[i] += x / 40)); peaks[r.peakLive]++; att = Math.max(att, r.maxAttached); sat += r.satellites; fol += r.follows; for (const e of r.events) sizes.push([e.kind, e.r0]); }
      dist[pk] = { eventsPerSecond: +(ev2 / 160).toFixed(2), share: share.map((x) => +x.toFixed(3)), runsByPeak: peaks, maxAttached: att, satellites: sat, follows: fol,
        minR0: { primary: Math.min(...sizes.filter(([k]) => k === "primary").map(([, r]) => r)), follow: Math.min(...sizes.filter(([k]) => k === "follow").map(([, r]) => r), Infinity), satellite: Math.min(...sizes.filter(([k]) => k === "satellite").map(([, r]) => r), Infinity) },
        maxR0: { follow: Math.max(...sizes.filter(([k]) => k === "follow").map(([, r]) => r), 0), satellite: Math.max(...sizes.filter(([k]) => k === "satellite").map(([, r]) => r), 0) } };
    }
    ev.distribution = dist;
    const d = dist.balanced, sh3 = d.share[3] + d.share[4] + d.share[5];
    check(GD, "active-count policy (default, 40 relentless random scribbles): mostly 0 or 1 live; 2 now and then; 3 rare; never 4", d.share[0] + d.share[1] > 0.8 && sh3 < 0.03 && d.runsByPeak[4] === 0 && d.runsByPeak[5] === 0 && d.maxAttached === 1,
      `share of time with 0/1/2/3 live ${d.share.slice(0, 4).map((x) => (100 * x).toFixed(1) + "%").join(" / ")}, ${d.eventsPerSecond} events/s (Phase 3: ${dist.single.eventsPerSecond}), at most 1 neck`);
    check(GD, "the busy diagnostic is visibly the failure boundary, the default stays near sparse", dist.busy.share[3] + dist.busy.share[4] + dist.busy.share[5] > 5 * Math.max(0.01, sh3) && dist.busy.eventsPerSecond > 2 * d.eventsPerSecond && d.eventsPerSecond - dist.sparse.eventsPerSecond < dist.busy.eventsPerSecond - d.eventsPerSecond,
      `events/s: single ${dist.single.eventsPerSecond} · sparse ${dist.sparse.eventsPerSecond} · balanced ${d.eventsPerSecond} · rich ${dist.rich.eventsPerSecond} · busy ${dist.busy.eventsPerSecond}; time with 3+ live: balanced ${(100 * sh3).toFixed(1)}%, busy ${(100 * (dist.busy.share[3] + dist.busy.share[4] + dist.busy.share[5])).toFixed(1)}%`);
    check(GD, "sizes: primaries stay the approved 4.2-7.8 px; follow-ups are smaller pieces (3 px or more); satellites 2.5-4.5 px (no dust)",
      d.minR0.primary >= 4.2 - 1e-9 && d.minR0.follow >= 3 && d.minR0.satellite >= 2.5 && d.maxR0.satellite <= 4.5 && d.maxR0.follow <= 7.8 * CFGP.followScale + 1e-9,
      `primary ≥ ${d.minR0.primary.toFixed(2)}, follow-up ${d.minR0.follow.toFixed(2)}-${d.maxR0.follow.toFixed(2)}, satellite ${d.minR0.satellite.toFixed(2)}-${d.maxR0.satellite.toFixed(2)} px`);
  }
  // U, V, W: the hard capacity at 3, 4 and 5 (busy gates, so the cap is what binds), and the manual flood
  {
    const caps = {};
    for (const cap of [3, 4, 5]) { let peak = 0, ow = 0, flood = 0; for (let s = 1; s <= 40; s++) { const r = simulate(W, randomScribble(s), { hz: 120, params: { ...POOLS.busy.values, poolMax: cap } }); peak = Math.max(peak, r.peakLive); ow += r.overwrites; }
      const m = simulate(W, { v: () => [0, 0], ms: 1400 }, { hz: 120, params: { ...CUR, poolMax: cap }, manual: Array.from({ length: 9 }, (_, k) => ({ t: k * 0.13, opts: { angleDeg: k * 40, speed: 300 } })) });
      flood = m.peakLive; caps[cap] = { scribblePeak: peak, overwrites: ow + m.overwrites, manualFloodPeak: flood, manualStarted: m.emitted }; }
    ev.capacity = caps;
    for (const cap of [3, 4, 5]) check(G, `${["U", "V", "W"][cap - 3]} · capacity ${cap}: never more than ${cap} live (busy gates and a 9-shed manual flood), nothing recycled`, caps[cap].scribblePeak <= cap && caps[cap].manualFloodPeak === cap && caps[cap].overwrites === 0,
      `busy scribbles peak ${caps[cap].scribblePeak}, manual flood peak ${caps[cap].manualFloodPeak} (${caps[cap].manualStarted} of 9 sheds started), overwrites ${caps[cap].overwrites}`);
  }
  // budget: suppression is counted, a burst ends with the Phase 3 cooldown, and determinism
  {
    const r = simulate(W, GESTURES.scribble, { hz: 120, params: CUR }), D = r.D;
    const starts = r.events.filter((e) => e.kind !== "satellite").map((e) => e.startMs), gaps = starts.slice(1).map((t, i) => t - starts[i]);
    check(G, "J · emission budget: blocked swings are suppressed and counted (pool full, neck attached, cooldown, burst, spacing, strength), never queued",
      r.suppressed > 0 && Object.values(r.why).reduce((x, y) => x + y, 0) === r.suppressed && gaps.every((g) => g >= CFGP.spacingMs - 1e-6),
      `scribble: ${r.emitted} emitted, ${r.suppressed} suppressed (${Object.entries(r.why).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(", ")}); gaps between natural emissions ${gaps.map((g) => g.toFixed(0)).join(", ")} ms`);
    const a = simulate(W, randomScribble(7), { hz: 144, params: CUR }), b = simulate(W, randomScribble(7), { hz: 144, params: CUR }), c = simulate(W, randomScribble(7), { hz: 144, seed: 12345, params: CUR });
    const sig = (x) => JSON.stringify(x.events.map((e) => [e.kind, e.startMs, e.r0, e.ux, e.uy, e.travel]));
    check(G, "deterministic: the same gesture, seed and frame rate give the same droplets; another seed changes only the small jitter", sig(a) === sig(b) && sig(a) !== sig(c) && a.emitted === c.emitted,
      `seed default: ${a.emitted} droplets twice identical; seed 12345: ${c.emitted} droplets, directions differ by up to ${Math.max(...a.events.map((e, i) => (c.events[i] ? Math.acos(Math.max(-1, Math.min(1, e.ux * c.events[i].ux + e.uy * c.events[i].uy))) * 180 / Math.PI : 0))).toFixed(1)}°`);
  }
  // L: bead-bead coalescence (pure dynamics, manual: a slow bead then a fast one along the same line)
  {
    const r = simulate(W, { v: () => [0, 0], ms: 900 }, { hz: 120, params: CUR, manual: [{ t: 0, opts: { angleDeg: 180, speed: 220 } }, { t: 0.15, opts: { angleDeg: 182, speed: 700 } }] });
    const big = r.events.reduce((a, e) => (e.peak / e.r0 > a.peak / a.r0 ? e : a)), gain = big.peak / big.r0; // the survivor (here the younger, larger one)
    check(G, "L · two free beads that meet coalesce: the smaller flows into the larger, which grows smoothly by at most 25% (no bounce, no pop)", r.merges === 1 && gain <= 1.25 + 1e-9 && gain > 1.05 && r.maxDr < 1 && r.jumpExcess <= 0,
      `${r.merges} merge, the survivor grew ${big.r0.toFixed(2)} → ${big.peak.toFixed(2)} px (×${gain.toFixed(2)}), largest per-frame change ${r.maxDr.toFixed(3)} px`);
  }

  // ---------------------------------------------------------------- the real page (Mode B, the Phase 4 snapshot)
  const P = await openPage(B, HTTP + "?mode=B&pool=balanced");
  await P.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
  {
    const ui = await P.ev(`(() => { const E = liquidCursorLab.engine; return { banner: document.querySelector('#banner-b').textContent, pools: [...document.querySelectorAll('#pool-preset option')].map((o) => o.value), pool: document.querySelector('#pool-preset').value,
      max: E.params.poolMax, burst: E.params.poolBurst, goo: E.params.gooOn, label: E.state.poolPreset, tiles: E.state.bead ? E.state.bead.mode : "none", contexts: document.querySelectorAll('canvas.lc-bead').length }; })()`);
    ev.ui = ui;
    check(G, "?pool=balanced is the Phase 4 pool (capacity 3, 2 per burst, rich goo off); every snapshot is still offered, Phase 3 approved among them",
      ui.banner.startsWith("PHASE 4.5 — REFERENCE GOO") && ["single", "sparse", "balanced", "rich", "busy"].every((k) => ui.pools.includes(k)) && ui.pool === "balanced" && ui.max === 3 && ui.burst === 2 && ui.goo === 0,
      `banner "${ui.banner.slice(0, 40)}…", snapshots ${ui.pools.join(", ")}, this page ${ui.label}, capacity ${ui.max}, burst ${ui.burst}, rich goo ${ui.goo}`);
    const capSel = await P.ev(`(() => { const s = document.querySelector('#pool-cap'), E = liquidCursorLab.engine, out = []; for (const v of ["5", "4", "preset"]) { s.value = v; s.dispatchEvent(new Event("change")); out.push(E.params.poolMax); } return out; })()`);
    check(G, "the capacity selector sets 5, 4, then back to the snapshot's 3", capSel.join(" ") === "5 4 3", capSel.join(" → "));
  }
  // manual controls drive the real lifecycle; the pool limits hold; Clear ends everything
  {
    const m = await P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop, LD = LiquidDroplet; E.setNatural(false); E.clearDroplets(); E.resetBody(); __lc.ready(1300, 440); const tries = [], lives = []; let att = 0, refusedWhileFree = 0;
      for (let k = 0; k < 6; k++) { const before = LD.live(D), a0 = LD.attached(D); const ok = E.triggerDroplet({ angleDeg: k * 60, speed: 320 }); tries.push(ok); if (!ok && before < 3 && !a0) refusedWhileFree++;
        for (let i = 0; i < 18; i++) { __lc.hold(1000 / 120); att = Math.max(att, D.attachedNow); } lives.push(LD.live(D)); }
      const live = Math.max(...lives), ids = D.slots.filter((s) => s.state !== "IDLE").map((s) => s.id).join(","); E.clearDroplets(); const after = LD.live(D);
      __lc.ready(1300, 440); const x = E.triggerDroplet({ angleDeg: 180, speed: 600, strength: 1, extreme: true }); const seq = []; for (let i = 0; i < 40; i++) { __lc.hold(1000 / 120); seq.push(D.slots.map((s) => s.state === "IDLE" ? "-" : s.kind[0] + s.state[0]).join("")); }
      const kinds = [...new Set(D.slots.filter((s) => s.state !== "IDLE").map((s) => s.kind))].join(","), sat = D.slots.find((s) => s.kind === "satellite"), par = D.slots.find((s) => s.kind === "manual");
      const satR = sat ? sat.r0 : 0, parR = par ? par.r0 : 0;
      E.clearDroplets(); E.setNatural(true); return { tries, lives, live, att, refusedWhileFree, ids, after, x, kinds, satR, parR, seq: seq.filter((s, i) => i % 5 === 0).join(" ") }; })()`);
    ev.manual = m;
    check(G, "manual sheds run the real lifecycle within the limits: capacity 3 reached, further sheds refused, one neck at a time; Clear empties the pool",
      m.live === 3 && m.tries.some((t) => !t) && m.refusedWhileFree === 0 && m.att === 1 && m.after === 0, `sheds every 150 ms: accepted ${m.tries.map((t) => (t ? "y" : "n")).join("")} (refused only while 3 were live), live after each ${m.lives.join("/")}, at most ${m.att} neck; after Clear ${m.after}`);
    check(G, "the Extreme control leaves one residual satellite, smaller than its parent, once the parent's bead is free", m.x && m.kinds === "manual,satellite" && m.satR > 0 && m.satR < m.parR,
      `${m.kinds}; parent ${m.parR.toFixed(1)} px, satellite ${m.satR.toFixed(1)} px; slots over time ${m.seq}`);
  }
  // rendering: surfaces, one union per group, exact inversion everywhere (frozen, beads placed directly)
  {
    const place = (beads) => P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop; E.clearDroplets(); E.setNatural(false); __lc.ready(${beads.body}); const B = ${JSON.stringify(beads.list)};
      B.forEach((b, i) => { const s = D.slots[i]; Object.assign(s, { state: "FREE", released: true, x: b[0], y: b[1], r: b[2], r0: b[2], alpha: b[3] ?? 1, life: 600, age: 100, ux: 1, uy: 0, el: 0, vx: 0, vy: 0, id: 900 + i, kind: "manual", layer: "none", tile: -1 }); });
      D.live = B.length; E.advance(0); return D.slots.slice(0, B.length).map((s) => [s.layer, s.tile]); })()`);
    const pix = async (pts) => { await P.frames(2); const on = []; for (const [x, y] of pts) on.push(decodePNG(await P.shot(Math.round(x) - 2, Math.round(y) - 2, 5, 5)).px(2, 2));
      await P.ev("(document.querySelectorAll('.lc-canvas, .lc-bead').forEach((c) => (c.style.opacity = '0')), 1)"); await P.frames(2); const off = []; for (const [x, y] of pts) off.push(decodePNG(await P.shot(Math.round(x) - 2, Math.round(y) - 2, 5, 5)).px(2, 2));
      await P.ev("(document.querySelectorAll('.lc-canvas, .lc-bead').forEach((c) => (c.style.opacity = '')), 1)"); await P.frames(2);
      return pts.map((p, i) => ({ on: on[i], off: off[i], err: Math.max(...on[i].map((v, k) => Math.abs(v - Math.round((255 - off[i][k]) * (p[2] ?? 1) + off[i][k] * (1 - (p[2] ?? 1)))))) })); };
    // three beads: one near the body (body canvas), two far apart (two tiles)
    const a = await place({ body: [900, 440], list: [[960, 440, 6], [300, 330, 5], [1150, 330, 7]] });
    const pa = await pix([[960, 440], [300, 330], [1150, 330]]);
    const tiles = await P.ev("liquidCursorLab.engine.state.bead.tiles.filter((t) => t.visible).length");
    ev.surfaces = { layout: a, pixels: pa, tiles };
    check(GR, "beads anywhere on screen: near the body in the body canvas, far ones each in its own small tile; every bead inverts exactly what is under it",
      a[0][0] === "body" && a[1][0] === "bead" && a[2][0] === "bead" && a[1][1] !== a[2][1] && tiles === 2 && pa.every((p) => p.err <= 6 && Math.max(...p.on.map((v, k) => Math.abs(v - p.off[k]))) > 60),
      `layers ${a.map((x) => x[0] + (x[1] >= 0 ? " " + x[1] : "")).join(", ")}; ${tiles} tiles visible; centre error vs exact inversion ${pa.map((p) => p.err).join("/")}`);
    // two overlapping beads far from the body: one tile, one union (the overlap is inverted once, not twice)
    const o = await place({ body: [400, 440], list: [[1300, 440, 7], [1309, 440, 5]] });
    const po = await pix([[1304, 440], [1296, 440], [1312, 440]]);
    check(GR, "overlapping beads share one surface and are one union: the overlap is inverted once (never inverted twice, never a hole)",
      o[0][0] === "bead" && o[1][0] === "bead" && o[0][1] === o[1][1] && po.every((p) => p.err <= 6), `both in tile ${o[0][1]}; overlap centre ${po[0].on.join("/")} vs backdrop ${po[0].off.join("/")} (error ${po.map((p) => p.err).join("/")})`);
    const ob = await place({ body: [1000, 440], list: [[1060, 440, 7], [1069, 440, 5]] });
    const pob = await pix([[1064, 440]]);
    check(GR, "...and the same next to the body: both in the body canvas, the overlap inverted once", ob[0][0] === "body" && ob[1][0] === "body" && pob[0].err <= 6, `layers ${ob.map((x) => x[0]).join(", ")}; error ${pob[0].err}`);
    // T: window edges (three beads hugging the right and bottom edges)
    const e = await place({ body: [1700, 440], list: [[1912, 300, 6], [1914, 440, 7], [1880, 1072, 6]] });
    const pe = await pix([[1912, 300], [1914, 440], [1880, 1072]]);
    check(GR, "T · beads at the window edges stay visible and exact (only the viewport itself clips)", pe.every((p) => p.err <= 6 && Math.max(...p.on.map((v, k) => Math.abs(v - p.off[k]))) > 60),
      `layers ${e.map((x) => x[0]).join(", ")}; errors ${pe.map((p) => p.err).join("/")}`);
    // a fading bead in a tile: its opacity is honoured exactly (no pop when it changes canvas)
    const f = await place({ body: [400, 440], list: [[1300, 380, 6, 0.45]] });
    const pf = await pix([[1300, 380, 0.45]]);
    check(GR, "a fading bead in a tile has the same partial inversion as in the body canvas", f[0][0] === "bead" && pf[0].err <= 6, `opacity 0.45: centre ${pf[0].on.join("/")} vs backdrop ${pf[0].off.join("/")}, error ${pf[0].err}`);
    // handover of a two-bead group between the body canvas and a tile is pixel-identical
    const hand = [];
    for (const L of ["body", "bead"]) { await P.ev(`liquidCursorLab.engine.setDiagnostic({ beadLayer: "${L}" }), 1`); await place({ body: [1100, 440], list: [[1150, 430, 6], [1164, 436, 4]] }); await P.frames(3); hand.push(decodePNG(await P.shot(1135, 415, 40, 30))); }
    await P.ev("liquidCursorLab.engine.setDiagnostic({}), 1");
    let hd = 0; for (let j = 0; j < hand[0].h; j++) for (let i = 0; i < hand[0].w; i++) { const x = hand[0].px(i, j), y = hand[1].px(i, j); if (x[0] !== y[0] || x[1] !== y[1] || x[2] !== y[2]) hd++; }
    check(GR, "a group of two beads drawn by the body canvas or by a tile gives identical pixels (DPR 1)", hd === 0, `${hd} differing px of ${hand[0].w * hand[0].h}`);
    await P.ev("liquidCursorLab.engine.clearDroplets(), liquidCursorLab.engine.setNatural(true), 1");
    const tmem = await P.ev(`(() => { const L = liquidCursorLab.engine.state.bead; return { mode: L.mode, n: L.tiles.length, backing: L.backing, blend: L.tiles.map((t) => t.canvas.style.mixBlendMode), pe: L.tiles.map((t) => getComputedStyle(t.canvas).pointerEvents), gl: L.tiles.map((t) => !!t.canvas.getContext && t.ctx && t.ctx.constructor.name) }; })()`);
    ev.tiles = tmem;
    check(GR, "bead tiles: one shared WebGL2 context for all of them, 64 CSS px each, difference blend, pointer-events none", tmem.n === 5 && tmem.backing === 64 && tmem.blend.every((b) => b === "difference") && tmem.pe.every((x) => x === "none"),
      `${tmem.mode}; ${tmem.n} tiles × ${tmem.backing}² px (${(tmem.n * tmem.backing * tmem.backing * 4 / 1024).toFixed(0)} KiB at DPR 1 when all are shown); tile contexts ${[...new Set(tmem.gl)].join("/")}`);
  }
  allLogs.push(...P.logs.map((m) => `pool: ${m}`));
  check(G, "no console errors or warnings (pool page)", P.logs.length === 0, P.logs.slice(0, 3).join(" | ") || "none");
  await P.close();

  // ---------------------------------------------------------------- real input: suppression and sanitising with the pool
  {
    const Q = await openPage(B, HTTP + "?mode=B&pool=balanced");
    const events = () => Q.ev("liquidCursorLab.engine.state.drop.events");
    const cdpFlick = async (x0, y, dx, n = 14, buttons = 0) => { let x = x0; for (let i = 1; i <= n; i++) { x += dx * Math.min(1, (i * i) / 25); await Q.move(Math.round(x), y, buttons); await sleep(3); } };
    const [bx, by] = await Q.center("#btn-real");
    await Q.move(bx - 40, by); await sleep(400); let e1 = await events();
    for (let k = 0; k < 3; k++) { await cdpFlick(bx - 40, by, 5, 14); for (let i = 0; i < 4; i++) { await Q.move(bx + (i % 2 ? 40 : -40), by); await sleep(4); } }
    await sleep(700); const hov = (await events()) - e1;
    await Q.move(300, 330); await sleep(600); e1 = await events(); await Q.press(300, 330); await cdpFlick(300, 330, 60, 14, 1); await cdpFlick(1140, 330, -60, 10, 1); await Q.release(500, 330); await sleep(800);
    const clk = (await events()) - e1;
    check(GS, "M, N · hover and click: repeated violent motion over a button, or a pressed drag back and forth, sheds nothing", hov === 0 && clk === 0, `hover ${hov}, pressed ${clk}`);
    const [px, py] = await Q.center("pre.code"), [wx, wy] = await Q.center("#wipe-handle");
    await Q.move(900, 420); await sleep(400); e1 = await events();
    for (let i = 1; i <= 14; i++) { await Q.move(Math.round(900 + (px - 900) * i / 14), Math.round(420 + (py - 420) * i / 14)); await sleep(3); }
    await sleep(200); await cdpFlick(px, py, -40); await sleep(700);
    await Q.move(wx, wy); await sleep(200); await Q.press(wx, wy); for (let i = 1; i <= 14; i++) { await Q.move(wx - i * 50, wy, 1); await sleep(3); } await Q.release(wx - 700, wy); await sleep(80);
    for (let i = 1; i <= 6; i++) { await Q.move(wx - 700 - i * 60, wy); await sleep(3); } await sleep(700);
    const ign = (await events()) - e1;
    check(GS, "O, P · ignored region entry, fast exit and a captured drag: no emission (pool mode keeps the Phase 3 sanitising)", ign === 0, `${ign} event(s)`);
    // re-entry with real input: CDP dispatch stretches a "flick" to 280-460 ms, past the 180 ms arming window, so a
    // genuine flick may legitimately shed one (the Phase 3 snapshot does the same); what must never happen is a burst
    const perEntry = [];
    for (let k = 0; k < 3; k++) { await Q.move(900, 330); await sleep(900); await Q.s("Input.dispatchMouseEvent", { type: "mouseMoved", x: -10, y: -10 }); await sleep(300); e1 = await events();
      await Q.move(1500, 330); await cdpFlick(1500, 330, -60); await sleep(700); perEntry.push((await events()) - e1); }
    check(GS, "re-entry with real input, three times: never a burst (at most the one droplet a genuine flick may shed)", perEntry.every((n) => n <= 1), `events per entry ${perEntry.join(" / ")}`);
    // re-entry, frame-exact: a big unseen jump disarms the trigger, so violent motion inside the arming window sheds
    // nothing; the same flick once the history is clean sheds exactly one
    await Q.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
    const fx = await Q.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop, out = [];
      for (const settle of [0, 260]) { E.clearDroplets(); E.resetBody(); __lc.ready(900, 440); __lc.hold(300); const e0 = D.events;
        __lc.feed(1500, 440); __lc.hold(settle); const p = __lc.points([{ dx: -1, dy: 0, v: 3200, ms: 150, ramp: 25 }], 0, 0), ox = 1500 - p.start[0], oy = 440 - p.start[1];
        for (const q of p.pts) __lc.feed(q[0] + ox, q[1] + oy); __lc.hold(400); out.push(D.events - e0); }
      E.setFrozen(false); return out; })()`);
    check(GS, "re-entry, frame-exact: violent motion right after a big unseen jump sheds nothing; the same flick after a clean history sheds exactly one", fx[0] === 0 && fx[1] === 1, `right after the jump: ${fx[0]}; 260 ms later: ${fx[1]}`);
    // Q: hidden tab with several live beads
    await Q.move(800, 330); await sleep(400);
    await Q.ev(`(window.__vis = [], document.addEventListener("visibilitychange", () => { const D = liquidCursorLab.engine.state.drop; __vis.push([document.visibilityState, performance.now(), D.slots.map((s) => [s.state, s.age, s.x])]); }), liquidCursorLab.engine.triggerDroplet({ angleDeg: 180, speed: 220 }))`); await sleep(160);
    await Q.ev("liquidCursorLab.engine.triggerDroplet({ angleDeg: 0, speed: 220 })"); await sleep(150);
    const before = await Q.ev("[liquidCursorLab.engine.state.drop.live, liquidCursorLab.engine.state.drop.events]");
    const { targetId } = await B.send("Target.createTarget", { url: "about:blank" }); await B.send("Target.activateTarget", { targetId }); await sleep(700);
    await B.send("Target.activateTarget", { targetId: Q.targetId }); await B.send("Target.closeTarget", { targetId }); await sleep(60);
    const after = await Q.ev("[liquidCursorLab.engine.state.drop.live, liquidCursorLab.engine.state.drop.events, __vis]");
    const hid = after[2].find((v) => v[0] === "hidden"), back = after[2].find((v) => v[0] === "visible");
    let okTab = !!hid && !!back && back[1] - hid[1] > 500 && after[1] === before[1];
    let worst = 0; if (okTab) hid[2].forEach((s, i) => { if (s[0] !== "IDLE") { worst = Math.max(worst, back[2][i][1] - s[1], Math.abs(back[2][i][2] - s[2])); } });
    okTab = okTab && worst <= 1 && before[0] >= 2;
    check(GS, "Q · hidden tab with 2 live beads: ages and positions pause, nothing jumps, nothing is emitted on resume", okTab,
      hid && back ? `${before[0]} live; hidden ${(back[1] - hid[1]).toFixed(0)} ms; worst change across the gap ${worst.toFixed(2)} (ms of age / px); events ${before[1]} → ${after[1]}` : "visibility did not change");
    // R, S: resize and DPR change with 2 live beads
    await Q.move(1000, 330); await sleep(500); await Q.ev("liquidCursorLab.engine.triggerDroplet({ angleDeg: 180, speed: 200 })"); await sleep(150); await Q.ev("liquidCursorLab.engine.triggerDroplet({ angleDeg: 90, speed: 200 })"); await sleep(60);
    const r0 = await Q.ev("[liquidCursorLab.engine.state.drop.slots.map((s) => [s.state, s.x, s.y]), liquidCursorLab.engine.state.drop.events]");
    await Q.s("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1.5, mobile: false }); await sleep(60);
    const r1 = await Q.ev("[liquidCursorLab.engine.state.drop.slots.map((s) => [s.state, s.x, s.y]), liquidCursorLab.engine.state.drop.events, liquidCursorLab.engine.state.bead.backing]");
    let moved = 0, alive = 0; r0[0].forEach((s, i) => { if (s[0] !== "IDLE" && r1[0][i][0] !== "IDLE") { alive++; moved = Math.max(moved, Math.hypot(r1[0][i][1] - s[1], r1[0][i][2] - s[2])); } });
    check(GS, "R, S · resize and DPR change with 2 live beads: they keep their screen positions, the tiles are resized, nothing is emitted", alive >= 2 && moved < 20 && r1[2] === 96 && r1[1] === r0[1],
      `${alive} beads moved at most ${moved.toFixed(1)} px in 60 ms; tiles ${r1[2]}² at DPR 1.5; events ${r0[1]} → ${r1[1]}`);
    await Q.s("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }); await sleep(300);
    allLogs.push(...Q.logs.map((m) => `pool input: ${m}`));
    check(GS, "no console errors or warnings (real-input pool checks)", Q.logs.length === 0, Q.logs.slice(0, 3).join(" | ") || "none");
    await Q.close();
    // accessibility: reduced motion and touch keep the liquid (and the pool) off; Mode A never creates the tiles
    const R = await openPage(B, HTTP + "?mode=B", { media: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    const rm = await R.ev("[liquidCursorLab.engine.state.active, liquidCursorLab.engine.triggerDroplet({ angleDeg: 0 }), liquidCursorLab.engine.state.drop.events]"); await R.close();
    const T = await openPage(B, HTTP + "?mode=B", { touch: true });
    const tt = await T.ev("[liquidCursorLab.engine.state.active, liquidCursorLab.engine.triggerDroplet({ angleDeg: 0 }), liquidCursorLab.engine.state.drop.events]"); await T.close();
    const A = await openPage(B, HTTP + "?mode=A");
    const ma = await A.ev("[liquidCursorLab.engine.state.bead === null, liquidCursorLab.engine.dropletsOn(), liquidCursorLab.engine.triggerDroplet({ angleDeg: 0 })]"); await A.close();
    check(GS, "reduced motion, a coarse (touch) pointer and Mode A: no liquid cursor, no droplets, no bead tiles created in Mode A", !rm[0] && !rm[1] && rm[2] === 0 && !tt[0] && !tt[1] && tt[2] === 0 && ma[0] && !ma[1] && !ma[2],
      `reduced motion: active ${rm[0]}, shed ${rm[1]}; touch: active ${tt[0]}, shed ${tt[1]}; Mode A: tiles ${ma[0] ? "none" : "created"}, droplets ${ma[1]}`);
  }

  // ---------------------------------------------------------------- file://
  {
    const F = await openPage(B, FILE + "?mode=B&pool=balanced");
    await F.ev(`(${installHelpers.toString()})(), __lc.begin(), 1`);
    const r = await F.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop; E.setNatural(false); E.resetBody(); __lc.ready(500, 440); E.triggerDroplet({ angleDeg: 180, speed: 0 }); __lc.hold(200);
      for (let i = 1; i <= 20; i++) __lc.feed(500 + i * 40, 440); E.triggerDroplet({ angleDeg: 0, speed: 0 }); __lc.hold(200);
      const t = D.slots.find((s) => s.layer === "bead"); return [D.live, D.slots.filter((s) => s.state !== "IDLE").map((s) => s.layer).join(","), E.state.bead.mode, location.protocol, t ? [t.x, t.y, t.alpha] : null]; })()`);
    let fileOk = r[0] === 2 && r[1].includes("bead") && r[3] === "file:", fileErr = NaN;
    if (fileOk && r[4]) { // the bead in a tile inverts its backdrop exactly (its opacity accounted for)
      await F.frames(2); const on = decodePNG(await F.shot(Math.round(r[4][0]) - 2, Math.round(r[4][1]) - 2, 5, 5)).px(2, 2);
      await F.ev("(document.querySelectorAll('.lc-canvas, .lc-bead').forEach((c) => (c.style.opacity = '0')), 1)"); await F.frames(2); const off = decodePNG(await F.shot(Math.round(r[4][0]) - 2, Math.round(r[4][1]) - 2, 5, 5)).px(2, 2);
      fileErr = Math.max(...on.map((v, k) => Math.abs(v - Math.round((255 - off[k]) * r[4][2] + off[k] * (1 - r[4][2]))))); fileOk = fileErr <= 6 && Math.max(...on.map((v, k) => Math.abs(v - off[k]))) > 40;
    }
    allLogs.push(...F.logs.map((m) => `pool file: ${m}`));
    check(G, "file://: the pool and its bead tiles work without a server (exact inversion), no console errors", fileOk && F.logs.length === 0, `${r[0]} live (${r[1]}), tiles ${r[2]}, ${r[3]}; tile bead inversion error ${fileErr}; console ${F.logs.length ? F.logs[0] : "clean"}`);
    await F.close();
  }

  // ---------------------------------------------------------------- performance
  {
    const Q = await openPage(B, HTTP + "?mode=B&pool=balanced");
    await Q.ev(`(${installHelpers.toString()})(), __lc.begin(), 1`);
    const perf = await Q.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop, out = {}; E.setNatural(false);
      const set = (n) => { E.clearDroplets(); __lc.ready(900, 440); const P = [[860, 440], [300, 330], [1600, 520], [1200, 360], [600, 560]];
        for (let i = 0; i < n; i++) Object.assign(D.slots[i], { state: "FREE", released: true, x: P[i][0], y: P[i][1], r: 6, r0: 6, alpha: 1, life: 1e9, age: 100, ux: 1, uy: 0, el: 0, vx: 30, vy: 10, id: 800 + i, kind: "manual", layer: "none", tile: -1 }); };
      for (const n of [0, 1, 2, 3, 5]) {
        set(n); const t0 = performance.now(); for (let i = 0; i < 300; i++) E.advance(1000 / 120, 1000 / 120); const step = (performance.now() - t0) / 300; // integrate (body + pool) + draw, CPU
        set(n); out[n] = { framePlusDrawMs: +step.toFixed(4), forcedDrawMs: +E.benchDraw(300).toFixed(4), tilesVisible: E.state.bead.tiles.filter((t) => t.visible).length };
      }
      E.clearDroplets(); E.setNatural(true); return out; })()`);
    await Q.ev("liquidCursorLab.engine.setFrozen(false), 1");
    // real time: the same page idle, then repeated manual sheds keeping 2-3 beads alive for 2.5 s (the most the default
    // holds), back to back, so a busy machine affects both windows alike
    const window_ = (sheds) => Q.ev(`new Promise((res) => { const E = liquidCursorLab.engine, S = E.state; S.workMs = 0; S.dropWorkMs = 0; S.dropDrawMs = 0; let n = 0, live = 0, frames = 0, worst = 0, last = 0; const t0 = performance.now();
      const shed = ${sheds} ? setInterval(() => E.triggerDroplet({ angleDeg: (n++ * 97) % 360, speed: 260 }), 170) : 0;
      (function f(t) { if (last) worst = Math.max(worst, t - last); last = t; frames++; live += S.drop.live; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else { clearInterval(shed); res({ fps: +(frames / ((performance.now() - t0) / 1000)).toFixed(1), worstMs: +worst.toFixed(1), meanLive: +(live / frames).toFixed(2), workMs: +S.workMs.toFixed(4), dropStepMs: +S.dropWorkMs.toFixed(4), dropDrawMs: +S.dropDrawMs.toFixed(4) }); } })(performance.now()); })`);
    await sleep(800); const idle = await window_(false), rt = await window_(true);
    // at rest once everything has gone: no draws on the body canvas or any tile
    await Q.move(700, 330); await sleep(2400);
    const d0 = await Q.ev("[liquidCursorLab.engine.state.draws, liquidCursorLab.engine.state.bead.draws, liquidCursorLab.engine.state.drop.live]"); await sleep(1000);
    const d1 = await Q.ev("[liquidCursorLab.engine.state.draws, liquidCursorLab.engine.state.bead.draws, liquidCursorLab.engine.state.bead.visible, liquidCursorLab.engine.state.loopRunning]");
    ev.performance = { frozen: perf, realTimeIdle: idle, realTime: rt, rest: { bodyDrawsPerSec: d1[0] - d0[0], tileDrawsPerSec: d1[1] - d0[1], tilesVisible: d1[2], liveAtStart: d0[2], rafLoop: d1[3] } };
    check(GP, "0/1/2/3/5 live beads: the frame's CPU (integrate + draw) and the forced draw stay well under 1 ms", [0, 1, 2, 3, 5].every((n) => perf[n].framePlusDrawMs < 1 && perf[n].forcedDrawMs < 1),
      [0, 1, 2, 3, 5].map((n) => `${n} live: ${perf[n].framePlusDrawMs} ms CPU, ${perf[n].forcedDrawMs} ms forced draw (${perf[n].tilesVisible} tiles)`).join(" · "));
    check(GP, "real time with 2-3 live beads (sheds every 170 ms for 2.5 s) vs the same page idle: the frame rate holds (≥ 90% of idle); frame callback < 1 ms, droplet step + draw < 0.5 ms", rt.fps >= 0.9 * idle.fps && rt.workMs < 1 && rt.dropStepMs + rt.dropDrawMs < 0.5,
      `idle ${idle.fps} fps (worst frame ${idle.worstMs} ms) · with beads ${rt.fps} fps (worst ${rt.worstMs} ms), mean ${rt.meanLive} live; frame callback ${rt.workMs} ms, droplet step ${rt.dropStepMs} ms, droplet draw ${rt.dropDrawMs} ms (EMA, CPU)`);
    check(GP, "at rest after the pool empties: no draws on the body canvas or any tile (the rAF loop itself keeps running while the cursor is active, as in Phase 1-3)", ev.performance.rest.bodyDrawsPerSec === 0 && ev.performance.rest.tileDrawsPerSec === 0 && !d1[2],
      `body ${ev.performance.rest.bodyDrawsPerSec}/s, tiles ${ev.performance.rest.tileDrawsPerSec}/s, tiles visible ${d1[2]}`);
    allLogs.push(...Q.logs.map((m) => `pool perf: ${m}`));
    await Q.close();
  }
}
