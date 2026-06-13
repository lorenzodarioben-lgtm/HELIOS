// Liquid cursor lab, Phase 3 checks: the single-droplet experiment. Imported by check-lab.mjs (group names "droplet …").
// Since Phase 4 every page here opens the "Phase 3 approved" pool snapshot (?pool=single, capacity 1), so these checks keep
// verifying the approved single droplet exactly; the pool has its own checks in check-pool.mjs.
// Deterministic 120 Hz scripted trajectories (tools/silhouette.mjs) for the trigger and lifecycle, real CDP input for the
// browser-level cases (clicks, ignored regions, tab suspension, resize, window entry), and mask or screenshot pixels for
// what the eye sees.
import { openPage, decodePNG, sleep } from "./cdp.mjs";
import { installHelpers } from "./silhouette.mjs";

const W = [960, 330]; // top surfaces row: no interactive or ignored element across its whole width
const FRAME = 1000 / 120;
// per-frame recorder: [t ms, state index, events, x, y, r, alpha, k, gap, connected, vx, vy, bodyX, bodyY, cooldown, signal, stretch, layer]
const STATES = ["IDLE", "BUDDING", "NECKING", "DETACHING", "FREE", "FADING"];
const REC = `(() => { const E = liquidCursorLab.engine, S = E.state, D = S.drop, rows = []; let t = 0;
  __lc.onFrame = (h) => { t += h; const d = D.d; rows.push([t, ${JSON.stringify(STATES)}.indexOf(d.state), D.events, d.x, d.y, d.r, d.alpha, d.k, d.gap, d.connected ? 1 : 0, d.vx, d.vy, S.renderX, S.renderY, D.cooldown, D.trig.signal, S.body.stretch, D.layer]); };
  return rows; })()`;

export async function phase3Checks(B, ctx) {
  const { check, info, HTTP, allLogs } = ctx;
  const G = "droplet", GL = "droplet lifecycle", GF = "droplet safety", GC = "droplet canvas", GP = "droplet performance";
  const P = await openPage(B, HTTP + "?mode=B&pool=single");
  await P.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
  // run a scripted scenario from a clean, armed state; returns the recorded frames and the cause of each event
  const run = async (script, reset = true) => P.ev(`(() => { ${reset ? "liquidCursorLab.engine.resetBody();" : ""} const D = liquidCursorLab.engine.state.drop, e0 = D.events;
    window.__rows = ${REC}; ${script}; __lc.onFrame = null; const causes = [];
    return { rows: window.__rows, events: D.events - e0, cause: D.lastCause, state: D.d.state }; })()`);
  const maxSig = (r) => Math.max(0, ...r.rows.map((x) => x[15]));
  const ev = {};
  info.droplet = ev;

  // ---------------------------------------------------------------- A-C, ordinary motion: never a droplet
  const quiet = {
    "A · stationary pointer (2 s)": `__lc.ready(${W}), __lc.hold(2000)`,
    "B · slow movement (300 px/s)": `__lc.path([{ dx: 1, dy: 0, v: 300, ms: 700, ramp: 120 }], ${W})`,
    "C · smooth fast sweep (2600 px/s)": `__lc.path([{ dx: 1, dy: 0, v: 2600, ms: 450, ramp: 120 }], ${W})`,
    "C · smooth very fast sweep (4000 px/s)": `__lc.path([{ dx: 1, dy: 0, v: 4000, ms: 450, ramp: 150 }], ${W})`,
    "C · fast sweep, then a dead stop": `(__lc.path([{ dx: 1, dy: 0, v: 2600, ms: 400, ramp: 120 }], ${W}), __lc.hold(400))`,
    "ordinary pointing moves (minimum-jerk, 300-1200 px)": `(__lc.minJerk(600, 330, 900, 330, 300), __lc.minJerk(450, 330, 1050, 330, 350), __lc.minJerk(300, 250, 1200, 420, 400), __lc.minJerk(200, 200, 1400, 460, 380), __lc.hold(300))`,
    "a very quick pointing move (400 px in 180 ms)": `(__lc.minJerk(700, 330, 1100, 330, 180), __lc.hold(300))`,
    "gentle 90° curve at 2000 px/s and a 1500 px/s orbit": `(__lc.path([{ dx: 1, dy: 0, v: 2000, ms: 200, ramp: 120 }, { dx: 1, dy: 0, v: 2000, ms: 300, turn: Math.PI / 2 }], ${W}), __lc.orbitStart(${W[0]}, ${W[1]}, 80), __lc.orbitRun(1500, 1500))`,
    "hand tremor at rest (±2 px jitter at 120 Hz)": `(__lc.ready(${W}), (() => { for (let i = 0; i < 240; i++) __lc.feed(${W[0]} + Math.sin(i * 2.3) * 2, ${W[1]} + Math.cos(i * 1.7) * 2); })())`,
  };
  ev.quiet = {};
  let body2600 = 0;
  for (const [name, script] of Object.entries(quiet)) {
    const r = await run(script); ev.quiet[name] = { events: r.events, maxSignal: +maxSig(r).toFixed(3) };
    if (name.includes("2600 px/s)")) body2600 = Math.max(...r.rows.map((x) => x[16]));
    check(G, `${name}: no droplet`, r.events === 0 && r.rows.every((x) => x[1] === 0), `${r.events} events, peak trigger signal ${maxSig(r).toFixed(2)} (fires at 1)`);
  }
  check(G, "C · the smooth sweep still gets the approved full stretch (the droplet system never touches the body)", body2600 >= 1.38 && body2600 <= 1.42 + 1e-9, `peak stretch ${body2600.toFixed(3)}`);

  // ---------------------------------------------------------------- D-F: abrupt motion sheds exactly one droplet
  const abrupt = {
    "D · sudden acceleration (0 → 3200 px/s in 25 ms)": [`(__lc.path([{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], ${W}), __lc.hold(900))`, "acceleration"],
    "E · sharp turn at 2200 px/s": [`(__lc.path([{ dx: 1, dy: 0, v: 2200, ms: 220, ramp: 120 }, { dx: 0, dy: 1, v: 2200, ms: 150 }], ${W}), __lc.hold(900))`, "turn"],
    "F · fast reversal at 2000 px/s": [`(__lc.path([{ dx: 1, dy: 0, v: 2000, ms: 220, ramp: 120 }, { dx: -1, dy: 0, v: 2000, ms: 220 }], ${W}), __lc.hold(900))`, "reversal"],
    "F · reversal within 80 ms at 2000 px/s": [`(__lc.path([{ dx: 1, dy: 0, v: 2000, ms: 220, ramp: 120 }, { dx: -1, dy: 0, v: 2000, ms: 220, ramp: 80 }], ${W}), __lc.hold(900))`, "reversal"],
  };
  ev.abrupt = {};
  let flick = null;
  for (const [name, [script, cause]] of Object.entries(abrupt)) {
    const r = await run(script); ev.abrupt[name] = { events: r.events, cause: r.cause, maxSignal: +maxSig(r).toFixed(3) };
    if (!flick) flick = r;
    check(G, `${name}: exactly one droplet, classified "${cause}"`, r.events === 1 && r.cause === cause, `${r.events} event(s), cause ${r.cause}, peak signal ${maxSig(r).toFixed(2)}`);
  }
  // below-threshold abrupt motion stays clean (the gates are not hair-triggers)
  for (const [name, script] of [["softer flick (0 → 2200 px/s in 60 ms)", `__lc.path([{ dx: 1, dy: 0, v: 2200, ms: 200, ramp: 60 }], ${W})`], ["rounded 90° turn over 60 ms", `__lc.path([{ dx: 1, dy: 0, v: 2200, ms: 220, ramp: 120 }, { dx: 1, dy: 0, v: 2200, ms: 60, turn: Math.PI / 2 }, { dx: 0, dy: 1, v: 2200, ms: 150 }], ${W})`], ["slow reversal at 1200 px/s", `__lc.path([{ dx: 1, dy: 0, v: 1200, ms: 220, ramp: 120 }, { dx: -1, dy: 0, v: 1200, ms: 220 }], ${W})`]]) {
    const r = await run(script);
    check(G, `below the gates: ${name} sheds nothing`, r.events === 0, `peak signal ${maxSig(r).toFixed(2)}`);
  }

  // ---------------------------------------------------------------- lifecycle of the flick (D)
  {
    const rows = flick.rows, seq = []; for (const x of rows) if (seq[seq.length - 1] !== x[1]) seq.push(x[1]);
    const names = seq.map((i) => STATES[i]);
    check(GL, "state progression IDLE → BUDDING → NECKING → DETACHING → FREE → FADING → IDLE", names.join(" ") === "IDLE BUDDING NECKING DETACHING FREE FADING IDLE", names.join(" → "));
    const t = (s) => rows.find((x) => x[1] === s)?.[0] ?? NaN, tIdle = rows.find((x, i) => i > 0 && x[1] === 0 && rows[i - 1][1] === 5)?.[0] ?? NaN;
    const attached = t(4) - t(1), life = tIdle - t(3);
    ev.lifecycle = { budMs: +(t(2) - t(1)).toFixed(1), neckMs: +(t(3) - t(2)).toFixed(1), detachMs: +(t(4) - t(3)).toFixed(1), attachedMs: +attached.toFixed(1), lifeAfterReleaseMs: +life.toFixed(1), visibleMs: +(tIdle - t(1)).toFixed(1) };
    // revised balanced neck (after the user's "neck too fast"): 26 + (60 + 24) + 14 ms; the first version was 26 + 42 + 14
    check(GL, "attached phase (bud + neck and thin thread + pinch) lasts 110-140 ms", attached >= 110 - FRAME && attached <= 140 + FRAME, `bud ${ev.lifecycle.budMs} + neck ${ev.lifecycle.neckMs} + detach ${ev.lifecycle.detachMs} = ${attached.toFixed(0)} ms`);
    const budCfg = await P.ev("liquidCursorLab.engine.params.dropBudMs");
    check(GL, "the longer neck does not slow the bud: budding still lasts budMs (26 ms, within a frame)", budCfg === 26 && Math.abs(ev.lifecycle.budMs - budCfg) <= FRAME + 0.5, `bud ${ev.lifecycle.budMs} ms at 120 Hz, budMs ${budCfg}`);
    check(GL, "bead lives 300-850 ms after release, then returns to IDLE", life >= 300 && life <= 850, `${life.toFixed(0)} ms after release; visible ${(tIdle - t(1)).toFixed(0)} ms in all`);
    // the bead's screen position never jumps: per frame it moves no further than the body does (while riding) or its own
    // velocity allows (free), plus a pixel
    let jump = 0;
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i]; if (!a[1] || !b[1] || a[1] === 1 && b[1] === 1 && i < 2) continue;
      const moved = Math.hypot(b[3] - a[3], b[4] - a[4]), allow = Math.max(Math.hypot(b[12] - a[12], b[13] - a[13]) + 3, Math.hypot(a[10], a[11]) * FRAME / 1000) + 1.5;
      if (b[1] > 1 || a[1] > 1) jump = Math.max(jump, moved - allow);
    }
    check(GL, "no positional jump at separation or anywhere in the lifecycle", jump <= 0, `worst excess over the allowed per-frame move ${Math.max(0, jump).toFixed(2)} px`);
    const fl = rows.filter((x) => x[1] >= 4);
    let rUp = 0, aUp = 0; for (let i = 1; i < fl.length; i++) { rUp = Math.max(rUp, fl[i][5] - fl[i - 1][5]); aUp = Math.max(aUp, fl[i][6] - fl[i - 1][6]); }
    const last = rows.filter((x) => x[1] === 5).pop(), r0 = Math.max(...rows.map((x) => x[5]));
    check(GL, "radius and opacity only decline after release; the bead is tiny and faint when it goes", rUp <= 1e-9 && aUp <= 1e-9 && last[6] <= 0.02 && last[5] <= 0.5 * r0, `last visible frame r ${last[5].toFixed(2)} px (of ${r0.toFixed(2)}), opacity ${last[6].toFixed(3)}`);
    // drag is exact exponential decay
    const fr = rows.filter((x) => x[1] === 4), s0 = Math.hypot(fr[0][10], fr[0][11]), s12 = Math.hypot(fr[12][10], fr[12][11]), dt = (fr[12][0] - fr[0][0]) / 1000;
    const drag = await P.ev("liquidCursorLab.engine.params.dropDrag"), want = Math.exp(-drag * dt);
    ev.momentum = { speedAtFreePxS: +s0.toFixed(1), bodySpeedPxS: +Math.hypot(fr[0][12] - rows[rows.indexOf(fr[0]) - 1][12], fr[0][13] - rows[rows.indexOf(fr[0]) - 1][13]) * 120 };
    check(GL, "free flight: exponential drag, frame-rate independent integration", Math.abs(s12 / s0 - want) < 0.005, `speed ratio over ${(dt * 1000).toFixed(0)} ms ${(s12 / s0).toFixed(4)} vs e^(-${drag}·t) ${want.toFixed(4)}`);
    check(GL, "the bead is left behind: much slower than the body at release", s0 < 0.4 * ev.momentum.bodySpeedPxS, `bead ${s0.toFixed(0)} px/s, body ${ev.momentum.bodySpeedPxS.toFixed(0)} px/s`);
  }

  // ---------------------------------------------------------------- bud, neck and pinch, measured on the rendered mask
  {
    const out = await P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop, res = [];
      E.resetBody(); const p = __lc.points([{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], ${W}); __lc.ready(p.start[0], p.start[1]); __lc.seq(p.pts.concat(Array(40).fill(null)));
      for (let i = 0; i < p.pts.length + 40; i++) { const st = __lc.step(); if (st.state === "IDLE" && res.length && res[res.length - 1].state !== "IDLE") break;
        if (st.state !== "IDLE") { const n = __lc.neck(); res.push({ state: st.state, t: st.t, gap: st.gap, comps: __lc.components(), neck: n ? n.width : null, broken: n ? n.broken : null, layer: st.layer }); } if (res.length > 40) break; }
      return res; })()`);
    ev.neck = out.map((x) => ({ state: x.state, t: +x.t.toFixed(1), comps: x.comps, neckPx: x.neck, gap: +x.gap.toFixed(2) }));
    const bud = out.filter((x) => x.state === "BUDDING"), neck = out.filter((x) => x.state === "NECKING"), free = out.filter((x) => x.state === "FREE" && x.layer === "body");
    check(GL, "the bud begins attached: one connected liquid body, bud centre inside the outline", bud.length > 0 && bud.every((x) => x.comps === 1) && bud[0].gap < 0, `${bud.length} budding frames, components ${[...new Set(bud.map((x) => x.comps))].join("/")}, first gap ${bud[0]?.gap.toFixed(2)} px`);
    const w0 = neck[0]?.neck, wMin = Math.min(...neck.map((x) => x.neck ?? Infinity));
    check(GL, "the neck visibly narrows while still connected, to under 40% of its starting width, then pinches", neck.length >= 3 && neck.every((x) => x.comps === 1 && !x.broken) && wMin < 0.4 * w0 && neck.every((x, i) => i === 0 || x.neck <= neck[i - 1].neck + 0.5),
      `neck width ${neck.map((x) => x.neck).join(" → ")} device px over ${neck.length} frames`);
    check(GL, "after the pinch the bead is a separate piece (two components in the body canvas), with no remaining bridge", free.length > 0 && free.every((x) => x.comps === 2), `components in ${free.length} free frames drawn in the body canvas: ${[...new Set(free.map((x) => x.comps))].join("/")}`);
    // the revised neck must be seen: a narrowing neck, then a thin thread for a few frames, but no dangling string
    const msUnder = (v) => neck.filter((x) => x.neck < v).length * FRAME;
    ev.neckVisibility = { under8Ms: +msUnder(8).toFixed(1), under6Ms: +msUnder(6).toFixed(1), under4Ms: +msUnder(4).toFixed(1), minPx: wMin };
    check(GL, "the neck stays visible: under 6 px for at least 25 ms and under 4 px for at least one frame, with the thin thread (under 4 px) over within 34 ms", msUnder(6) >= 25 && msUnder(4) >= FRAME && msUnder(4) <= 34,
      `under 8 px ${msUnder(8).toFixed(0)} ms, under 6 px ${msUnder(6).toFixed(0)} ms, under 4 px ${msUnder(4).toFixed(0)} ms, thinnest ${wMin} device px (DPR 1)`);
    const det = out.filter((x) => x.state === "DETACHING"), lastNeck = neck[neck.length - 1];
    check(GL, "the pinch is decisive: thinnest on the last attached frame, two separate pieces from the release frame on (no widening, no re-bridge)", lastNeck.neck === wMin && det.length > 0 && det.every((x) => x.comps === 2 && (x.broken || !x.neck)),
      `last neck frame ${lastNeck.neck} px; release frames: ${det.map((x) => `${x.comps} pieces`).join(", ")}`);
  }

  // ---------------------------------------------------------------- the free bead is independent of the pointer
  {
    const traj = async (after) => P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop, out = []; E.resetBody();
      const p = __lc.points([{ dx: 1, dy: 0, v: 3200, ms: 140, ramp: 25 }], 600, 330); __lc.ready(p.start[0], p.start[1]); for (const q of p.pts) __lc.feed(q[0], q[1]);
      while (D.d.state !== "FREE") __lc.hold(1000 / 120);
      const a = ${after}; for (let i = 0; i < 24; i++) { if (a[i]) __lc.feed(a[i][0], a[i][1]); else __lc.hold(1000 / 120); out.push([D.d.x, D.d.y, D.d.state]); } return out; })()`);
    const still = await traj("[]"), moving = await traj(`Array.from({ length: 24 }, (_, i) => [600 + (i + 1) * 12, 330 - (i + 1) * 6])`);
    const diff = Math.max(...still.map((p, i) => Math.hypot(p[0] - moving[i][0], p[1] - moving[i][1])));
    check(GL, "the free bead's screen position is independent of the pointer after release", diff < 1e-6 && still[23][2] !== "IDLE", `max difference ${diff.toExponential(1)} px between a still pointer and one moving away over 200 ms`);
  }

  // ---------------------------------------------------------------- G, H: one event at a time, cooldown, stop after detachment
  {
    const zig = await run(`(__lc.ready(760, 330), (() => { let x = 760, dir = 1; for (let i = 0; i < 360; i++) { if (i % 13 === 0) dir = -dir; x += dir * 2200 / 120; __lc.feed(x, 330); } })(), __lc.hold(900))`);
    const starts = [], ends = [];
    zig.rows.forEach((x, i) => { if (i && x[1] === 1 && zig.rows[i - 1][1] === 0) starts.push(x[0]); if (i && x[1] === 0 && zig.rows[i - 1][1] === 5) ends.push(x[0]); });
    const cd = await P.ev("liquidCursorLab.engine.params.dropCooldownMs");
    const gaps = starts.slice(1).map((s, i) => s - ends[i]);
    ev.zigzag = { events: zig.events, starts: starts.map((s) => Math.round(s)), gapsAfterDeathMs: gaps.map((g) => Math.round(g)) };
    check(G, "G · 3 s of aggressive zigzag: never more than one droplet, and each waits for the last to die plus the cooldown", zig.events >= 2 && gaps.every((g) => g >= cd - FRAME) && starts.length === ends.length + (zig.rows[zig.rows.length - 1][1] ? 1 : 0),
      `${zig.events} events at ${ev.zigzag.starts.join(", ")} ms; next event ${gaps.map((g) => Math.round(g)).join(", ")} ms after the previous vanished (cooldown ${cd} ms)`);
    // H: flick, stop dead; the body recovers while the bead carries on by itself
    const r = await run(`(__lc.path([{ dx: 1, dy: 0, v: 3200, ms: 117, ramp: 25 }], 700, 330), __lc.hold(700))`);
    const stopT = 117 + (await P.ev("liquidCursorLab.engine.params.dropArmMs")) + 20 + 400 + 16.7, rs = r.rows;
    const round = rs.find((x) => x[0] > stopT && x[16] < 1.02 && x[16] > 0.98), after = rs.filter((x) => x[0] > (round ? round[0] : Infinity) && x[1] >= 4);
    const drift = after.length > 1 ? Math.hypot(after[after.length - 1][3] - after[0][3], after[after.length - 1][4] - after[0][4]) : 0;
    check(G, "H · stop after detachment: the body is round again within 250 ms while the bead keeps moving by itself", r.events === 1 && !!round && round[0] - stopT <= 250 && drift > 1,
      round ? `body within 2% of round ${Math.round(round[0] - stopT)} ms after the stop; bead drifted ${drift.toFixed(1)} px afterwards` : "body never recovered");
  }
  // cooldown and the single-event limit, directly
  {
    const r = await P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop; E.resetBody();
      // each flick starts where the pointer is (a real flick never begins with an unseen jump)
      const flick = (dir) => { const q = __lc.points([{ dx: dir, dy: 0, v: 3200, ms: 120, ramp: 25 }], 0, 330), o = E.state.rawX - q.start[0]; for (const p of q.pts) __lc.feed(p[0] + o, 330); };
      __lc.ready(300, 330); flick(1); const during = []; for (let i = 0; i < 6; i++) { flick(i % 2 ? 1 : -1); during.push(D.events); }
      while (D.d.state !== "IDLE") __lc.hold(1000 / 120);
      const e1 = D.events; flick(1); const soon = D.events - e1, cd = D.cooldown;
      __lc.hold(E.params.dropCooldownMs + E.params.dropArmMs + 40); flick(-1); const later = D.events - e1;
      return { first: during[0], during, soon, later, cd }; })()`);
    check(G, "no second droplet while one is active (six more violent flicks during its life)", r.during.every((x) => x === r.during[0]), `event count during the life: ${r.during.join(", ")}`);
    check(G, "cooldown: a violent flick right after the droplet vanishes sheds nothing; after the cooldown it sheds one", r.soon === 0 && r.later === 1, `immediately: ${r.soon}, after the cooldown: ${r.later}`);
    // the manual trigger uses the real lifecycle and honours the single-event limit
    const m = await P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop; E.resetBody(); __lc.ready(${W}); const e0 = D.events;
      const a = E.triggerDroplet({ angleDeg: 180, speed: 420 }), b = E.triggerDroplet({ angleDeg: 0, speed: 420 }); const seq = [D.d.state];
      for (let i = 0; i < 160 && D.d.state !== "IDLE"; i++) { __lc.hold(1000 / 120); if (seq[seq.length - 1] !== D.d.state) seq.push(D.d.state); }
      return { a, b, seq, events: D.events - e0 }; })()`);
    check(G, "manual lab trigger runs the real lifecycle once and refuses a second event while active", m.a === true && m.b === false && m.events === 1 && m.seq.join(" ") === "BUDDING NECKING DETACHING FREE FADING IDLE", `first ${m.a}, second ${m.b}, ${m.seq.join(" → ")}`);
  }

  // ---------------------------------------------------------------- modes, presets and snapshots
  {
    const flickIn = async (mode, extra = "") => { await P.ev(`document.querySelector('input[name=mode][value=${mode}]').click(), __lc.begin(), ${extra} 1`); return run(`(__lc.path([{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], ${W}), __lc.hold(700))`); };
    const a = await flickIn("A"), c0 = await flickIn("C", "liquidCursorLab.engine.setDroplets(false),"), c1 = await flickIn("C", "liquidCursorLab.engine.setDroplets(true),");
    check(G, "Mode A (approved body only) never sheds; Mode C sheds only with its Droplets switch on", a.events === 0 && c0.events === 0 && c1.events === 1, `A ${a.events}, C off ${c0.events}, C on ${c1.events}`);
    await P.ev("document.querySelector('input[name=mode][value=B]').click(), __lc.begin(), 1");
    const sw = await P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop; E.resetBody(); __lc.ready(${W}); E.triggerDroplet({ angleDeg: 180, speed: 300 }); __lc.hold(60);
      const before = D.d.state; document.dispatchEvent(new KeyboardEvent("keydown", { key: "2" })); const after = D.d.state; document.dispatchEvent(new KeyboardEvent("keydown", { key: "3" }));
      return [before, after, E.state.preset]; })()`);
    check(G, "switching preset mid-event ends the droplet at once (no stale liquid, no trigger)", sw[0] !== "IDLE" && sw[1] === "IDLE", `${sw[0]} → ${sw[1]}, preset now ${sw[2]}`);
    const snap = await P.ev(`(() => { const sel = document.querySelector('#drop-preset'), E = liquidCursorLab.engine, D = E.state.drop, out = {}, bodyKeys = Object.keys(LiquidCursor.PARAMS).filter((k) => !k.startsWith("drop"));
      for (const k of ["shortNeck", "longNeck", "balancedOriginal", "balanced"]) { sel.value = k; sel.dispatchEvent(new Event("change"));
        const body = bodyKeys.map((b) => E.params[b]).join("|"); E.resetBody(); __lc.ready(${W}); E.triggerDroplet({ angleDeg: 180, speed: 300 }); let t = 0; while (D.d.state !== "FREE" && t < 500) { __lc.hold(1000 / 120); t += 1000 / 120; }
        out[k] = { attachedMs: Math.round(t), body }; }
      return out; })()`);
    check(G, "droplet snapshots: short neck < first-version balanced (about 83 ms) < revised balanced < long neck, with the approved body identical in all four", snap.shortNeck.attachedMs < snap.balancedOriginal.attachedMs && Math.abs(snap.balancedOriginal.attachedMs - 83) <= FRAME && snap.balancedOriginal.attachedMs < snap.balanced.attachedMs && snap.balanced.attachedMs < snap.longNeck.attachedMs
      && [snap.shortNeck, snap.longNeck, snap.balancedOriginal].every((x) => x.body === snap.balanced.body),
      `attached ${snap.shortNeck.attachedMs} / ${snap.balancedOriginal.attachedMs} / ${snap.balanced.attachedMs} / ${snap.longNeck.attachedMs} ms`);
    ev.snapshots = { shortNeck: snap.shortNeck.attachedMs, balancedOriginal: snap.balancedOriginal.attachedMs, balanced: snap.balanced.attachedMs, longNeck: snap.longNeck.attachedMs };
    const refined = await P.ev("(() => { const CFG = LIQUID_CURSOR_CONFIG, E = liquidCursorLab.engine; return [E.params.compressionExponent, E.params.maxStretch, E.params.membrane, E.params.baseNoise, E.params.maxNoise, E.params.noiseScale, E.params.followResponse, E.state.preset]; })()");
    check(G, "Santioni refined body values are unchanged in Mode B (exponent 0.75, stretch 1.42, field 0.25-0.7 px at 36 px, follow 60)", refined.slice(0, 7).join(" ") === "0.75 1.42 field 0.25 0.7 36 60", refined.join(", "));
  }

  // ---------------------------------------------------------------- frame-rate consistency (pure dynamics, no browser timing)
  {
    const fr = await P.ev(`(() => { const L = LiquidCursor, LD = LiquidDroplet, CFG = LIQUID_CURSOR_CONFIG, F = CFG.follow, P = liquidCursorLab.engine.params;
      function sim(hz, V, rampMs, turnAt) { // pointer model as the engine: samples every frame, per-sample velocity smoothing; the body follows
        const B = L.createBodyState(), D = LD.createDropletSystem(), dt = 1 / hz, body = { x: 0, y: 0, R: 34, s: 1, c: 1, ax: 1, ay: 0 }, ptr = { vx: 0, vy: 0, allowed: true };
        let t = -0.3, px = 0, py = 0, vx = 0, vy = 0, rx = 0, ry = 0, seq = [], tStart = NaN, tFree = NaN, xFree = 0, yFree = 0, travel = 0;
        while (t < 1.4) {
          let ux = 1, uy = 0, sp = 0; if (t >= 0) { const k = Math.min(1, t * 1000 / rampMs); sp = t < 0.35 ? V * k * k * (3 - 2 * k) : 0; if (turnAt && t > turnAt) { ux = 0; uy = 1; } }
          px += ux * sp * dt; py += uy * sp * dt;
          const kv = 1 - Math.exp(-dt * 1000 / F.velocitySmoothingMs); vx += (ux * sp - vx) * kv; vy += (uy * sp - vy) * kv; if (sp === 0) { vx *= Math.exp(-F.velocityDecay * dt); vy *= Math.exp(-F.velocityDecay * dt); }
          L.stepBody(B, P, F.maxSubstep, { vx, vy, hover: false, pressed: false }, dt);
          const a = 1 - Math.exp(-P.followResponse * dt); rx += (px - rx) * a; ry += (py - ry) * a;
          Object.assign(body, { x: rx, y: ry, R: P.radius * B.radiusScale, s: B.stretch, c: B.compression, ax: B.ax, ay: B.ay }); ptr.vx = vx; ptr.vy = vy;
          if (t > -0.25) LD.step(D, P, body, ptr, dt, F.maxSubstep); t += dt;
          if (seq[seq.length - 1] !== D.d.state) { seq.push(D.d.state); if (D.d.state === "BUDDING") tStart = t; if (D.d.state === "DETACHING") { tFree = t; xFree = D.d.x; yFree = D.d.y; } }
          if (D.d.state === "FADING") travel = Math.hypot(D.d.x - xFree, D.d.y - yFree);
        }
        return { hz, events: D.events, attachedMs: (tFree - tStart) * 1000, travel, seq: seq.join(" ") };
      }
      return { flick: [60, 120, 144, 165].map((hz) => sim(hz, 3200, 25, 0)), sweep: [60, 120, 144, 165].map((hz) => sim(hz, 2600, 120, 0)), turn: [60, 120, 144, 165].map((hz) => sim(hz, 2200, 120, 0.22)) }; })()`);
    ev.frameRate = fr;
    const fx = fr.flick, att = fx.map((x) => x.attachedMs), tr = fx.map((x) => x.travel);
    check(G, "60 / 120 / 144 / 165 Hz: the flick sheds exactly one droplet, the smooth sweep none", fx.every((x) => x.events === 1) && fr.sweep.every((x) => x.events === 0) && fr.turn.every((x) => x.events === 1), `flick ${fx.map((x) => x.events).join("/")}, sweep ${fr.sweep.map((x) => x.events).join("/")}, turn ${fr.turn.map((x) => x.events).join("/")}`);
    check(G, "60 / 120 / 144 / 165 Hz: same attached duration (within a 60 Hz frame) and bead travel (within 10%)", Math.max(...att) - Math.min(...att) <= 1000 / 60 + 0.5 && Math.max(...tr) / Math.min(...tr) < 1.1 && att.every(Number.isFinite),
      `attached ${att.map((a) => (Number.isFinite(a) ? a.toFixed(0) : "–")).join(" / ")} ms, travel ${tr.map((a) => (Number.isFinite(a) ? a.toFixed(1) : "–")).join(" / ")} px`);
  }

  // ---------------------------------------------------------------- NaN / Infinity through every state
  {
    const bad = await P.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop; E.resetBody(); let n = 0, frames = 0;
      const p = __lc.points([{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], ${W}); __lc.ready(p.start[0], p.start[1]); __lc.seq(p.pts.concat(Array(120).fill(null)));
      for (let i = 0; i < p.pts.length + 120; i++) { __lc.step(); frames++; const u = E.readUniforms(); for (const v of Object.values(u).flat()) if (typeof v === "number" && !Number.isFinite(v)) n++;
        for (const v of Object.values(D.d)) if (typeof v === "number" && !Number.isFinite(v)) n++; for (const v of Object.values(D.trig)) if (typeof v === "number" && !Number.isFinite(v)) n++; }
      return [n, frames]; })()`);
    check(GL, "no NaN or Infinity in the droplet physics, the trigger or the shader uniforms", bad[0] === 0, `${bad[0]} non-finite values over ${bad[1]} frames`);
  }

  // ---------------------------------------------------------------- canvas: handover, visibility, inversion, memory
  {
    const hand = [];
    for (const dpr of [1, 2]) {
      const Q = await openPage(B, HTTP + "?mode=B&pool=single", { dpr });
      await Q.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
      const st = await Q.ev(`(liquidCursorLab.engine.resetBody(), __lc.ready(700, 330), liquidCursorLab.engine.triggerDroplet({ angleDeg: 180, speed: 300 }), __lc.hold(160), [liquidCursorLab.engine.state.drop.d.x, liquidCursorLab.engine.state.drop.d.y])`);
      const shots = {};
      for (const L of ["body", "bead"]) { await Q.ev(`liquidCursorLab.engine.setDiagnostic({ beadLayer: "${L}" }), 1`); await Q.frames(3); shots[L] = decodePNG(await Q.shot(Math.round(st[0]) - 12, Math.round(st[1]) - 12, 24, 24)); }
      let diff = 0, cov = 0; for (let j = 0; j < shots.body.h; j++) for (let i = 0; i < shots.body.w; i++) { const a = shots.body.px(i, j), b = shots.bead.px(i, j); if (Math.max(...a.map((v, k) => Math.abs(v - b[k])))) diff++; if (a[0] !== shots.body.px(0, 0)[0]) cov++; }
      hand.push({ dpr, diff, cov }); allLogs.push(...Q.logs.map((m) => `droplet canvas dpr ${dpr}: ${m}`)); await Q.close();
    }
    check(GC, "handing a free bead between the body canvas and the bead canvas is pixel-identical (DPR 1 and 2)", hand.every((h) => h.diff === 0 && h.cov > 20), hand.map((h) => `DPR ${h.dpr}: ${h.diff} differing px of ${h.cov} bead px`).join(" · "));
    // the body races 600 px away: the bead stays visible for its whole life (bead canvas) and inverts what is under it
    await P.ev("liquidCursorLab.engine.setDiagnostic({}), 1");
    const vis = [];
    await P.ev(`(liquidCursorLab.engine.resetBody(), (() => { const p = __lc.points([{ dx: 1, dy: 0, v: 3200, ms: 60, ramp: 25 }], 360, 330); __lc.ready(p.start[0], p.start[1]); for (const q of p.pts) __lc.feed(q[0], q[1]); })(), 1)`);
    for (let k = 0; k < 6; k++) {
      await P.ev(`(() => { const D = liquidCursorLab.engine.state.drop; for (let i = 0; i < 9; i++) { __lc.feed(Math.min(1850, liquidCursorLab.engine.state.rawX + 2400 / 120), 330); } return 1; })()`);
      const s = await P.ev("(() => { const S = liquidCursorLab.engine.state, d = S.drop.d; return [d.state, d.x, d.y, d.r, d.alpha, S.drop.layer, S.renderX]; })()");
      await P.frames(2);
      if (s[0] === "FREE" || s[0] === "FADING") {
        await P.ev(`liquidCursorLab.engine.setFrozen(true), 1`);
        const on = decodePNG(await P.shot(Math.round(s[1]) - 6, Math.round(s[2]) - 6, 12, 12));
        await P.ev("(document.querySelectorAll('.lc-canvas, .lc-bead').forEach((c) => (c.style.opacity = '0')), 1)"); await P.frames(2);
        const off = decodePNG(await P.shot(Math.round(s[1]) - 6, Math.round(s[2]) - 6, 12, 12));
        await P.ev("(document.querySelectorAll('.lc-canvas, .lc-bead').forEach((c) => (c.style.opacity = '')), 1)"); await P.frames(2);
        const c = on.px(6, 6), b = off.px(6, 6), expect = b.map((v) => Math.round(Math.abs((255 - v) * s[4] + v * (1 - s[4])))) ;
        vis.push({ state: s[0], layer: s[5], dist: Math.round(Math.abs(s[6] - s[1])), alpha: +s[4].toFixed(2), centre: c, backdrop: b, err: Math.max(...c.map((v, i) => Math.abs(v - expect[i]))) });
      }
    }
    ev.beadVisibility = vis;
    const far = vis.filter((v) => v.layer === "bead" && v.dist > 250);
    check(GC, "the free bead stays visible while the body races away (bead canvas beyond the body canvas), inverting its backdrop", far.length >= 2 && vis.every((v) => v.err <= 6),
      vis.map((v) => `${v.state} ${v.layer} ${v.dist} px from the body, α ${v.alpha}, centre ${v.centre.join("/")} vs backdrop ${v.backdrop.join("/")}`).join(" · "));
    const mem = await P.ev("(() => { const b = liquidCursorLab.engine.state.bead; return b ? [b.backing, b.canvas.style.mixBlendMode, b.canvas.style.pointerEvents, getComputedStyle(b.canvas).position] : null; })()");
    const A = await openPage(B, HTTP + "?mode=A"); const inA = await A.ev("liquidCursorLab.engine.state.bead === null"); await A.close();
    check(GC, "bead canvas: created only once droplets are on, 64 CSS px, difference blend, pointer-events none", !!mem && mem[0] === 64 && mem[1] === "difference" && mem[2] === "none" && mem[3] === "fixed" && inA, mem ? `backing ${mem[0]}² px (${(mem[0] * mem[0] * 4 / 1024).toFixed(0)} KiB), blend ${mem[1]}, pointer-events ${mem[2]}, not created in Mode A: ${inA}` : "missing");
  }
  await P.close();

  // ---------------------------------------------------------------- real browser input: false positives and suspension
  {
    const Q = await openPage(B, HTTP + "?mode=B&pool=single");
    const events = () => Q.ev("liquidCursorLab.engine.state.drop.events");
    // a real flick starts from rest with small samples, then accelerates hard (never an unseen jump)
    const cdpFlick = async (x0, y, dx, n = 14, buttons = 0) => { let x = x0; for (let i = 1; i <= n; i++) { x += dx * Math.min(1, (i * i) / 25); await Q.move(Math.round(x), y, buttons); await sleep(3); } };
    // positive control: a real, violent CDP flick after a rest does shed one. CDP dispatch timing varies, so the achieved
    // speed is recorded and up to three attempts are made; none may ever shed more than one
    await Q.ev(`window.__pk = { speed: 0, signal: 0 }; (function f() { const S = liquidCursorLab.engine.state; __pk.speed = Math.max(__pk.speed, S.speed); __pk.signal = Math.max(__pk.signal, S.drop.trig.signal); requestAnimationFrame(f); })(), 1`);
    const attempts = [];
    for (let a = 0; a < 3 && !attempts.some((x) => x.events === 1); a++) {
      await Q.move(300, 330); await sleep(500); await Q.ev("(__pk.speed = 0, __pk.signal = 0, 1)"); const e0 = await events();
      await cdpFlick(300, 330, 70, 13); await sleep(900);
      const pk = await Q.ev("__pk"); attempts.push({ events: (await events()) - e0, peakSpeed: Math.round(pk.speed), peakSignal: +pk.signal.toFixed(2) });
    }
    ev.realInputFlick = attempts;
    check(GF, "real input positive control: a violent flick after a rest sheds exactly one droplet", attempts.some((x) => x.events === 1) && attempts.every((x) => x.events <= 1),
      attempts.map((x, i) => `attempt ${i + 1}: ${x.events} event(s), peak ${x.peakSpeed} px/s, signal ${x.peakSignal}`).join(" · "));
    // I: hover and click
    const [bx, by] = await Q.center("#btn-real");
    await Q.move(bx - 40, by); await sleep(400); let e1 = await events(); await cdpFlick(bx - 40, by, 5, 14); await sleep(400);
    for (let i = 0; i < 4; i++) { await Q.move(bx + (i % 2 ? 40 : -40), by); await sleep(4); } await sleep(700);
    const hov = (await events()) - e1;
    await Q.move(300, 330); await sleep(600); e1 = await events(); await Q.press(300, 330); await cdpFlick(300, 330, 60, 14, 1); await Q.release(1140, 330); await sleep(800);
    const clk = (await events()) - e1;
    check(GF, "I · hover and click: violent motion over a button or while pressed sheds nothing", hov === 0 && clk === 0, `hover ${hov}, pressed ${clk}`);
    // J: ignored region entry, exit (a jump across the gap) and a captured drag
    const [px, py] = await Q.center("pre.code"), [wx, wy] = await Q.center("#wipe-handle");
    await Q.move(900, 420); await sleep(400); e1 = await events();
    for (let i = 1; i <= 14; i++) { await Q.move(Math.round(900 + (px - 900) * i / 14), Math.round(420 + (py - 420) * i / 14)); await sleep(3); } // in fast
    await sleep(200); await cdpFlick(px, py, -40); await sleep(700); // out fast
    await Q.move(wx, wy); await sleep(200); await Q.press(wx, wy); for (let i = 1; i <= 14; i++) { await Q.move(wx - i * 50, wy, 1); await sleep(3); } await Q.release(wx - 700, wy); await sleep(80);
    for (let i = 1; i <= 6; i++) { await Q.move(wx - 700 - i * 60, wy); await sleep(3); } await sleep(700);
    const ign = (await events()) - e1;
    check(GF, "J · ignored region: no droplet on entry, on a fast exit, during a captured drag or just after it", ign === 0, `${ign} event(s)`);
    // M: entering the window with a big jump and violent motion
    await Q.s("Input.dispatchMouseEvent", { type: "mouseMoved", x: -10, y: -10 }); await sleep(300); e1 = await events();
    await Q.move(1500, 330); await cdpFlick(1500, 330, -60); await sleep(700);
    const entry = (await events()) - e1;
    check(GF, "window entry: the first samples after entering never read as a flick", entry === 0, `${entry} event(s)`);
    // K: a free bead survives a hidden tab without teleporting, a jump in age, or a trigger on resume. The page itself
    // timestamps the visibility changes, so the check does not depend on CDP latency.
    await Q.move(700, 330); await sleep(400);
    await Q.ev(`(window.__vis = [], document.addEventListener("visibilitychange", () => { const d = liquidCursorLab.engine.state.drop.d; __vis.push([document.visibilityState, performance.now(), d.age, d.x]); }), liquidCursorLab.engine.triggerDroplet({ angleDeg: 180, speed: 250 }))`); await sleep(140);
    const before = await Q.ev("[liquidCursorLab.engine.state.drop.d.state, liquidCursorLab.engine.state.drop.d.x, liquidCursorLab.engine.state.drop.d.age, liquidCursorLab.engine.state.drop.events]");
    const { targetId } = await B.send("Target.createTarget", { url: "about:blank" }); await B.send("Target.activateTarget", { targetId }); await sleep(700);
    await B.send("Target.activateTarget", { targetId: Q.targetId }); await B.send("Target.closeTarget", { targetId }); await sleep(60);
    const after = await Q.ev("[liquidCursorLab.engine.state.drop.d.state, liquidCursorLab.engine.state.drop.d.x, liquidCursorLab.engine.state.drop.d.age, liquidCursorLab.engine.state.drop.events, performance.now(), __vis]");
    const hid = after[5].find((v) => v[0] === "hidden"), back = after[5].find((v) => v[0] === "visible");
    ev.tabSuspension = { before, visibility: after[5], after: after.slice(0, 5) };
    const ok = !!hid && !!back && back[1] - hid[1] > 500 && back[2] - hid[2] <= 1 && after[2] - back[2] <= after[4] - back[1] + 20 && after[3] === before[3] && Math.abs(back[3] - hid[3]) < 0.5;
    check(GF, "K · tab suspension: the bead pauses while hidden and resumes in place (no teleport, no age jump, no trigger)", ok,
      hid && back ? `hidden ${(back[1] - hid[1]).toFixed(0)} ms: age ${hid[2].toFixed(0)} → ${back[2].toFixed(0)} ms, position moved ${Math.abs(back[3] - hid[3]).toFixed(2)} px; after resume age +${(after[2] - back[2]).toFixed(0)} ms in ${(after[4] - back[1]).toFixed(0)} ms of wall time; events ${before[3]} → ${after[3]}` : "visibility did not change");
    // L: resize and DPR change while a bead is free, and a bead near the window edge
    await Q.move(1000, 330); await sleep(400); await Q.ev("liquidCursorLab.engine.triggerDroplet({ angleDeg: 180, speed: 200 })"); await sleep(120);
    const r0 = await Q.ev("[liquidCursorLab.engine.state.drop.d.x, liquidCursorLab.engine.state.drop.d.y, liquidCursorLab.engine.state.drop.d.state]");
    await Q.s("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1.5, mobile: false }); await sleep(60);
    const r1 = await Q.ev("[liquidCursorLab.engine.state.drop.d.x, liquidCursorLab.engine.state.drop.d.y, liquidCursorLab.engine.state.drop.d.state, liquidCursorLab.engine.state.bead ? liquidCursorLab.engine.state.bead.backing : 0, liquidCursorLab.engine.state.drop.events]");
    check(GF, "L · resize and DPR change mid-flight: the bead keeps its screen position; the bead canvas is resized", Math.hypot(r1[0] - r0[0], r1[1] - r0[1]) < 20 && r1[2] !== "IDLE" && r1[3] === 96,
      `moved ${Math.hypot(r1[0] - r0[0], r1[1] - r0[1]).toFixed(1)} px in 60 ms, ${r0[2]} → ${r1[2]}, bead backing ${r1[3]}² at DPR 1.5`);
    await Q.s("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }); await sleep(300);
    // window edge: a frame-exact flick ending 70 px from the right edge (the body canvas then hangs off-screen), stepped until
    // the bead is free; its inverted pixels must sit exactly at its screen position
    await Q.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, liquidCursorLab.engine.resetBody(), 1`);
    const edge = await Q.ev(`(() => { const E = liquidCursorLab.engine, S = E.state, D = S.drop, e0 = D.events; __lc.path([{ dx: 1, dy: 0, v: 3200, ms: 150, ramp: 25 }], 1850, 330);
      for (let i = 0; i < 60 && !(D.d.state === "FREE" && D.d.age > 60); i++) __lc.hold(1000 / 120); const d = D.d; return [d.state, d.x, d.y, D.layer, d.alpha, S.renderX, D.events - e0]; })()`);
    await Q.frames(2);
    const eOn = decodePNG(await Q.shot(Math.round(edge[1]) - 6, Math.round(edge[2]) - 6, 12, 12));
    await Q.ev("(document.querySelectorAll('.lc-canvas, .lc-bead').forEach((c) => (c.style.opacity = '0')), 1)"); await Q.frames(2);
    const eOff = decodePNG(await Q.shot(Math.round(edge[1]) - 6, Math.round(edge[2]) - 6, 12, 12));
    await Q.ev("(document.querySelectorAll('.lc-canvas, .lc-bead').forEach((c) => (c.style.opacity = '')), 1)");
    const ec = eOn.px(6, 6), eb = eOff.px(6, 6), eErr = Math.max(...ec.map((v, i) => Math.abs(v - Math.round((255 - eb[i]) * edge[4] + eb[i] * (1 - edge[4])))));
    check(GF, "L · flick into the window edge: one droplet, its inverted pixels exactly at its screen position", edge[6] === 1 && edge[0] === "FREE" && eErr <= 6 && Math.max(...ec.map((v, i) => Math.abs(v - eb[i]))) > 60,
      `${edge[0]} at ${edge[1].toFixed(0)}, ${edge[2].toFixed(0)} in the ${edge[3]} layer (body at x ${edge[5].toFixed(0)}, window 1920 wide); centre ${ec.join("/")} vs backdrop ${eb.join("/")}`);
    allLogs.push(...Q.logs.map((m) => `droplet input: ${m}`));
    check(GF, "no console errors or warnings (real-input droplet checks)", Q.logs.length === 0, Q.logs.slice(0, 3).join(" | ") || "none");
    await Q.close();
    // touch emulation: coarse pointer keeps the cursor (and droplets) off; a touch on a fine pointer suspends the body
    const T = await openPage(B, HTTP + "?mode=B&pool=single", { touch: true });
    const tt = await T.ev("[liquidCursorLab.engine.state.active, liquidCursorLab.engine.dropletsOn(), liquidCursorLab.engine.state.drop.events]");
    await T.close();
    const T2 = await openPage(B, HTTP + "?mode=B&pool=single"); await T2.move(500, 330); await sleep(300);
    await T2.s("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 520, y: 330 }] });
    for (let i = 1; i <= 10; i++) await T2.s("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 520, y: 330 + i * 12 }] }); // vertical: a horizontal swipe is history navigation
    await T2.s("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(400);
    const t2 = await T2.ev("[liquidCursorLab.engine.state.drop.events, liquidCursorLab.engine.state.suspended]"); await T2.close();
    check(GF, "touch: the coarse-pointer page has no cursor and no droplets; a touch swipe on a fine pointer sheds nothing", !tt[0] && tt[2] === 0 && t2[0] === 0, `coarse: active ${tt[0]}, events ${tt[2]}; touch swipe: events ${t2[0]}, suspended "${t2[1]}"`);
  }

  // ---------------------------------------------------------------- performance: Phase 2 body alone vs each droplet state
  {
    const perf = {};
    for (const mode of ["A", "B"]) {
      const Q = await openPage(B, HTTP + `?mode=${mode}&pool=single`);
      await Q.move(1220, 280); await sleep(500);
      const a = await Q.state();
      for (let i = 0; i <= 240; i++) { const th = i / 240 * 4 * Math.PI; await Q.move(Math.round(1100 + 120 * Math.cos(th)), Math.round(280 + 120 * Math.sin(th))); }
      const b = await Q.state(), work = await Q.ev("liquidCursorLab.engine.state.workMs"), dropWork = await Q.ev("liquidCursorLab.engine.state.dropWorkMs");
      perf[mode] = { avgFps: +b.avgFps.toFixed(1), frameWorkMsEMA: +work.toFixed(4), dropletStepMsEMA: +dropWork.toFixed(4), worstFrameMs: +(await Q.ev("Math.max(...liquidCursorLab.engine.state.frameTimes)")).toFixed(2), events: await Q.ev("liquidCursorLab.engine.state.drop.events") };
      if (mode === "B") {
        // forced-draw cost in each state (GPU-inclusive, gl.finish): no droplet, attached, free in the body canvas, free in the bead canvas, fading
        await Q.ev(`(${installHelpers.toString()})(), __lc.begin(), __lc.armed = true, 1`);
        perf.drawMs = await Q.ev(`(() => { const E = liquidCursorLab.engine, D = E.state.drop, out = {}; E.resetBody(); __lc.ready(900, 330);
          out.none = E.benchDraw(300); E.triggerDroplet({ angleDeg: 180, speed: 600 }); __lc.hold(50); out.attached = E.benchDraw(300);
          while (D.d.state !== "FREE") __lc.hold(1000 / 120); E.setDiagnostic({ beadLayer: "body" }); out.freeInBodyCanvas = E.benchDraw(300);
          E.setDiagnostic({ beadLayer: "bead" }); out.freeInBeadCanvas = E.benchDraw(300);
          while (D.d.state !== "FADING") __lc.hold(1000 / 120); E.setDiagnostic({}); out.fading = E.benchDraw(300);
          for (const k in out) out[k] = +out[k].toFixed(4); return out; })()`);
        // repeated triggers under a cooldown, in real time: aggressive zigzag for 3 s
        await Q.ev("liquidCursorLab.engine.setFrozen(false), liquidCursorLab.engine.resetBody(), 1"); await Q.move(900, 330); await sleep(400);
        const z0 = await Q.state(), e0 = await Q.ev("liquidCursorLab.engine.state.drop.events");
        for (let i = 0; i < 300; i++) { await Q.move(900 + ((Math.floor(i / 6) % 2) ? -1 : 1) * ((i % 6) * 50 - 125), 330); await sleep(4); }
        const z1 = await Q.state();
        perf.zigzag = { avgFps: +z1.avgFps.toFixed(1), events: (await Q.ev("liquidCursorLab.engine.state.drop.events")) - e0, frameWorkMsEMA: +(await Q.ev("liquidCursorLab.engine.state.workMs")).toFixed(4), worstFrameMs: +(await Q.ev("Math.max(...liquidCursorLab.engine.state.frameTimes)")).toFixed(2), drawsPerFrame: +((z1.draws - z0.draws) / Math.max(1, z1.frames - z0.frames)).toFixed(2) };
        // at rest after everything has died: no draws on either canvas
        await sleep(3800); const r0 = await Q.state(), bd0 = await Q.ev("liquidCursorLab.engine.state.bead.draws"); await sleep(1000); const r1 = await Q.state(), bd1 = await Q.ev("liquidCursorLab.engine.state.bead.draws");
        perf.rest = { bodyDrawsPerSec: r1.draws - r0.draws, beadDrawsPerSec: bd1 - bd0, beadVisible: await Q.ev("liquidCursorLab.engine.state.bead.visible") };
      }
      allLogs.push(...Q.logs.map((m) => `droplet perf ${mode}: ${m}`));
      await Q.close();
    }
    info.dropletPerformance = perf;
    check(GP, "no active droplet: Mode B costs the same as the approved body alone (fps, < 1 ms CPU)", perf.B.avgFps >= 0.95 * perf.A.avgFps && perf.B.frameWorkMsEMA < 1 && perf.B.dropletStepMsEMA < 0.1,
      `Mode A ${perf.A.avgFps} fps, ${perf.A.frameWorkMsEMA} ms · Mode B ${perf.B.avgFps} fps, ${perf.B.frameWorkMsEMA} ms (droplet step ${perf.B.dropletStepMsEMA} ms), worst frame ${perf.A.worstFrameMs} / ${perf.B.worstFrameMs} ms`);
    const dm = perf.drawMs;
    check(GP, "every droplet state draws cheaply (forced draw < 1 ms, GPU-inclusive)", Object.values(dm).every((v) => v < 1), Object.entries(dm).map(([k, v]) => `${k} ${v} ms`).join(" · "));
    check(GP, "repeated triggers with the cooldown (3 s real-input zigzag): fps holds, at most one draw per frame", perf.zigzag.avgFps >= 0.95 * perf.A.avgFps && perf.zigzag.drawsPerFrame <= 1.05 && perf.zigzag.frameWorkMsEMA < 1,
      `${perf.zigzag.avgFps} fps, ${perf.zigzag.events} events, ${perf.zigzag.frameWorkMsEMA} ms CPU, worst frame ${perf.zigzag.worstFrameMs} ms, ${perf.zigzag.drawsPerFrame} draws/frame`);
    check(GP, "at rest after the droplet has gone: no draws on the body or the bead canvas", perf.rest.bodyDrawsPerSec === 0 && perf.rest.beadDrawsPerSec === 0 && !perf.rest.beadVisible, `body ${perf.rest.bodyDrawsPerSec}/s, bead ${perf.rest.beadDrawsPerSec}/s, bead canvas visible ${perf.rest.beadVisible}`);
  }
  allLogs.push(...P.logs.map((m) => `droplet: ${m}`));
  check(G, "no console errors or warnings (droplet checks)", P.logs.length === 0, P.logs.slice(0, 3).join(" | ") || "none");
}
