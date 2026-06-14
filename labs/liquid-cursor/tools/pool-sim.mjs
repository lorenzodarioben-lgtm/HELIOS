// Liquid cursor lab, Phase 4: pure-dynamics simulation of the body and the droplet pool, outside the browser.
// Loads the lab's own config.js, liquid-cursor.js and droplet.js into a Node vm (classic scripts, no DOM needed for the
// dynamics) and drives them with the engine's pointer model at any frame rate. Deterministic: the same gesture, seed and
// frame rate give the same droplets. Used by check-pool.mjs (frame-rate consistency, distributions) and for tuning.
//
//   import { loadLab, simulate, GESTURES } from "./pool-sim.mjs";
//   const W = loadLab(); simulate(W, GESTURES.flick, { hz: 120, params: { poolMax: 4 } })
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LAB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// load from the working tree, or from given sources (e.g. an older commit through git show)
export function loadLab(src = {}) {
  const ctx = { window: {}, Math, performance: { now: () => 0 } };
  vm.createContext(ctx);
  for (const f of ["config.js", "liquid-cursor.js", "droplet.js"]) vm.runInContext(src[f] ?? readFileSync(join(LAB, f), "utf8"), ctx, { filename: f });
  return ctx.window;
}

const ease = (t, ms) => { const k = Math.min(1, Math.max(0, t * 1000 / ms)); return k * k * (3 - 2 * k); };
// A gesture is a pointer velocity v(t) = [vx, vy] in px/s for t >= 0 (seconds), plus how long to run. Before t = 0 the
// pointer rests (long enough for the trigger to arm).
const seg = (legs) => { // legs: [{ dx, dy, v, ms, ramp }] one after another, then rest
  let T = 0; const L = legs.map((l) => { const o = { ...l, t0: T }; T += l.ms / 1000; return o; });
  return (t) => { for (const l of L) if (t >= l.t0 && t < l.t0 + l.ms / 1000) { const s = l.v * (l.ramp ? ease(t - l.t0, l.ramp) : 1); return [l.dx * s, l.dy * s]; } return [0, 0]; };
};
const zig = (legMs, v, ms, dyv = 0) => (t) => (t >= 0 && t < ms / 1000 ? [(Math.floor(t * 1000 / legMs) % 2 ? -1 : 1) * v, dyv * (Math.floor(t * 1000 / 900) % 2 ? -1 : 1)] : [0, 0]);
export const GESTURES = {
  stationary: { v: () => [0, 0], ms: 2000, label: "A · stationary pointer" },
  slow: { v: seg([{ dx: 1, dy: 0, v: 300, ms: 700, ramp: 120 }]), ms: 1200, label: "B · slow movement, 300 px/s" },
  sweep: { v: seg([{ dx: 1, dy: 0, v: 2600, ms: 450, ramp: 120 }]), ms: 1200, label: "C · smooth fast sweep, 2600 px/s" },
  sweepFast: { v: seg([{ dx: 1, dy: 0, v: 4000, ms: 450, ramp: 150 }]), ms: 1200, label: "C · smooth very fast sweep, 4000 px/s" },
  flick: { v: seg([{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }]), ms: 1600, label: "D · violent flick, 0 → 3200 px/s in 25 ms" },
  extremeFlick: { v: seg([{ dx: 1, dy: 0, v: 5200, ms: 160, ramp: 16 }]), ms: 1600, label: "E · extreme flick, 0 → 5200 px/s in 16 ms" },
  turn: { v: seg([{ dx: 1, dy: 0, v: 2200, ms: 220, ramp: 120 }, { dx: 0, dy: 1, v: 2200, ms: 150 }]), ms: 1600, label: "F · sharp turn at 2200 px/s" },
  extremeTurn: { v: seg([{ dx: 1, dy: 0, v: 3600, ms: 200, ramp: 100 }, { dx: 0, dy: 1, v: 3600, ms: 120 }]), ms: 1600, label: "G · extreme sharp turn at 3600 px/s" },
  reversal: { v: seg([{ dx: 1, dy: 0, v: 2000, ms: 220, ramp: 120 }, { dx: -1, dy: 0, v: 2000, ms: 150 }]), ms: 1600, label: "H · fast reversal at 2000 px/s" },
  zigzag: { v: zig(108, 2200, 3000), ms: 4500, label: "I · repeated violent zigzag, 2200 px/s, a reversal every 108 ms" },
  scribble: { v: zig(170, 3000, 3000, 700), ms: 4500, label: "I · compound scribble: reversals every 170 ms at 3000 px/s, drifting 700 px/s" },
};
// Phase 4.5: ordinary human pointing (minimum-jerk moves, Flash & Hogan 1985) and the rich-goo scenario gestures
const minJerk = (moves) => { // moves: [{ dx, dy, ms, pause }] one after another
  let T = 0; const L = moves.map((m) => { const o = { ...m, t0: T }; T += (m.ms + (m.pause || 0)) / 1000; return o; });
  return (t) => { for (const m of L) { const u = (t - m.t0) * 1000 / m.ms; if (u >= 0 && u <= 1) { const k = (30 * u * u - 60 * u ** 3 + 30 * u ** 4) * 1000 / m.ms; return [m.dx * k, m.dy * k]; } } return [0, 0]; };
};
const navMoves = (n, seed, fast) => { let s = seed; const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  return Array.from({ length: n }, () => { const a = r() * 2 * Math.PI, d = (fast ? 250 : 150) + r() * (fast ? 550 : 600); return { dx: d * Math.cos(a), dy: d * Math.sin(a), ms: (fast ? 170 : 260) + r() * (fast ? 120 : 260) + d * (fast ? 0.12 : 0.25), pause: (fast ? 60 : 200) + r() * (fast ? 140 : 500) }; }); };
export const RICH_GESTURES = {
  navigation: { v: minJerk(navMoves(14, 11, false)), ms: 12000, label: "C · ordinary pointer navigation: 14 minimum-jerk moves of 150-750 px" },
  fastNav: { v: minJerk(navMoves(18, 23, true)), ms: 9000, label: "K · repeated fast navigation: 18 quick minimum-jerk moves of 250-800 px, short pauses" },
  mediumSweep: { v: seg([{ dx: 1, dy: 0, v: 1400, ms: 500, ramp: 160 }]), ms: 1300, label: "D · smooth medium sweep, 1400 px/s" },
  strongFlick: { ...GESTURES.flick, label: "F · strong flick, 0 → 3200 px/s in 25 ms" },
  sharpTurn: { ...GESTURES.turn, label: "G · sharp turn at 2200 px/s" },
  fastReversal: { ...GESTURES.reversal, label: "H · fast reversal at 2000 px/s" },
  extremeWhip: { v: seg([{ dx: 1, dy: 0, v: 4600, ms: 150, ramp: 18 }, { dx: -0.3, dy: 1, v: 4200, ms: 130 }]), ms: 1800, label: "I · extreme whip: 0 → 4600 px/s in 18 ms, then a hard 107° turn" },
  zigzag: { v: zig(150, 2800, 1500, 500), ms: 2600, label: "J · compound zigzag: reversals every 150 ms at 2800 px/s for 1.5 s, drifting" },
};

// Phase 4.5 trail detector: what a generic particle trail would show and rich fission must not. From one run's events:
// - spacing regularity: the coefficient of variation of the distance between consecutive release points (a trail
//   emitted every N px gives a CV near 0)
// - interval regularity: the CV of the intervals between consecutive piece starts (a timed emitter: near 0)
// - pieces per 1000 px of pointer travel
// - speed vs swing: the share of pieces born while the pointer was merely fast (no recent swing over the threshold),
//   and the Pearson correlation of per-frame emission with speed and with the trigger signal
export function trailMetrics(r) {
  const ev = r.events.filter((e) => e.releaseMs !== undefined).sort((a, b) => a.startMs - b.startMs);
  const cv = (xs) => { if (xs.length < 2) return null; const m = xs.reduce((a, b) => a + b, 0) / xs.length; const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); return m > 0 ? sd / m : null; };
  const gaps = ev.slice(1).map((e, i) => Math.hypot(e.x0 - ev[i].x0, e.y0 - ev[i].y0)), ints = ev.slice(1).map((e, i) => e.startMs - ev[i].startMs);
  const corr = (a, b) => { const n = a.length; if (n < 3) return null; const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let sab = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return sa > 0 && sb > 0 ? sab / Math.sqrt(sa * sb) : null; };
  return { pieces: ev.length, spacingCV: cv(gaps), intervalCV: cv(ints), minIntervalMs: ints.length ? Math.min(...ints) : null, perKpx: r.travelPx > 0 ? 1000 * ev.length / r.travelPx : 0,
    speedOnlyShare: ev.length ? ev.filter((e) => !(e.swingAtStart >= 1)).length / ev.length : 0, corrSpeed: corr(r.frameEmit, r.frameSpeed), corrSignal: corr(r.frameEmit, r.frameSignal) };
}

// Run one gesture. opts: { hz, params, seed, preMs }. Returns per-event records, the live-count history and totals.
export function simulate(W, g, opts = {}) {
  const { hz = 120, params = {}, seed, preMs = 300 } = opts;
  const L = W.LiquidCursor, LD = W.LiquidDroplet, CFG = W.LIQUID_CURSOR_CONFIG, F = CFG.follow, P = L.paramsFromConfig(CFG, params);
  const B = L.createBodyState(), D = LD.createDropletSystem(seed), dt = 1 / hz;
  const body = { x: 0, y: 0, R: 34, s: 1, c: 1, ax: 1, ay: 0, amp: 0, cell: 36, nt: 0 }, ptr = { vx: 0, vy: 0, allowed: true };
  let t = -preMs / 1000, px = 0, py = 0, vx = 0, vy = 0, rx = 0, ry = 0, frames = 0, nonFinite = 0;
  const events = [], seen = new Map(), live = [], attachedMax = [0];
  // continuity: a live slot never changes identity (no overwrite), never jumps further than it can move, and its radius
  // and opacity never pop; prev holds each slot's last frame
  // a pre-Phase 4 droplet system (one droplet, D.d) is read as a pool of one slot, so older commits run unchanged
  const SL = D.slots || [D.d], isAtt = LD.isAttached || ((st) => st === "BUDDING" || st === "NECKING" || st === "DETACHING");
  const sid = (s) => (s.id !== undefined ? s.id : D.events), sslot = (s) => (s.slot !== undefined ? s.slot : 0);
  const prev = SL.map(() => null); let overwrites = 0, jump = 0, jumpAtt = 0, jumpRel = 0, dr = 0, da = 0, pbx = 0, pby = 0, worstJump = null;
  const manual = opts.manual || [];
  // Phase 4.5 records: pointer travel, per-frame emission / speed / trigger signal (trail detector), the recent trigger
  // signal at each piece's start, per-class live counts, the body taper, and cohesion bridges between free pieces
  let travelPx = 0, taperMax = 0, taperMin = 0, taperIdleNonZero = 0, taperLate = 0, emptySince = -1, maxClass = [0, 0, 0], neckOverlap = Infinity;
  const frameEmit = [], frameSpeed = [], frameSignal = [], sigHist = [], bridge = new Map(); let bridgeConnects = 0, bridgeMaxPerPair = 0, bridgeFrames = 0;
  // the connected goo wake (Phase 4.5 correction): one record per tail, and the material count (pieces + the tail)
  const tails = [], material = []; let curTail = null;
  const cls = LD.classOf || (() => 0);
  while (t < g.ms / 1000) {
    const [gx, gy] = t >= 0 ? g.v(t) : [0, 0];
    px += gx * dt; py += gy * dt;
    if (t >= 0) travelPx += Math.hypot(gx, gy) * dt;
    const kv = 1 - Math.exp(-dt * 1000 / F.velocitySmoothingMs); vx += (gx - vx) * kv; vy += (gy - vy) * kv;
    if (gx === 0 && gy === 0) { vx *= Math.exp(-F.velocityDecay * dt); vy *= Math.exp(-F.velocityDecay * dt); }
    L.stepBody(B, P, F.maxSubstep, { vx, vy, hover: false, pressed: false }, dt);
    const a = 1 - Math.exp(-P.followResponse * dt); rx += (px - rx) * a; ry += (py - ry) * a;
    Object.assign(body, { x: rx, y: ry, R: P.radius * B.radiusScale, s: B.stretch, c: B.compression, ax: B.ax, ay: B.ay, amp: P.membrane === "harmonic" ? 0 : B.noiseAmp, cell: Math.max(1, P.noiseScale), nt: B.noiseT });
    ptr.vx = vx; ptr.vy = vy;
    for (const m of manual) if (Math.abs(t - m.t) < dt / 2) LD.trigger(D, P, body, m.opts); // lab-style manual sheds at given times
    LD.step(D, P, body, ptr, dt, F.maxSubstep);
    t += dt; frames++;
    for (const s of (D.slots || [D.d])) {
      const q = prev[sslot(s)];
      if (s.state !== "IDLE" && q && q.id !== sid(s)) overwrites++;
      if (s.state !== "IDLE" && q && q.id === sid(s) && !s.absorbed) {
        // attached: it rides the body (plus, on the release frame, one frame of its own new velocity); free: its velocity
        const moved = Math.hypot(s.x - q.x, s.y - q.y), allow = isAtt(q.state) && !q.released ? Math.hypot(rx - pbx, ry - pby) + 4.5 + (s.released && !q.released ? Math.hypot(s.vx, s.vy) * dt / Math.exp(-P.dropDrag * dt) : 0) : Math.hypot(q.vx, q.vy) * dt + 1.5;
        if (isAtt(q.state) && !q.released && !s.released) jumpAtt = Math.max(jumpAtt, moved - allow); // a bud riding a fast-deforming body surface
        else if (isAtt(q.state) && !q.released) jumpRel = Math.max(jumpRel, moved - allow); // the release frame: it rode the surface, then flew
        else if (moved - allow > jump) { jump = moved - allow; worstJump = { ms: +(t * 1000).toFixed(1), kind: s.kind, from: q.state, to: s.state, moved: +moved.toFixed(2), allow: +allow.toFixed(2) }; }
        if (q.released && s.released) { dr = Math.max(dr, Math.abs(s.r - q.r)); da = Math.max(da, Math.abs(s.alpha - q.alpha)); }
      }
      prev[sslot(s)] = s.state === "IDLE" ? null : { id: sid(s), x: s.x, y: s.y, vx: s.vx, vy: s.vy, r: s.r, alpha: s.alpha, state: s.state, released: s.released };
    }
    pbx = rx; pby = ry;
    let n = 0, att = 0, born = 0;
    const T = D.trig; sigHist.push(T.signal); const recentSig = Math.max(...sigHist.slice(-Math.ceil(0.25 * hz)));
    const perClass = [0, 0, 0];
    for (const s of (D.slots || [D.d])) {
      if (s.state === "IDLE") continue;
      n++; if (isAtt(s.state)) att++; perClass[cls(s.kind)]++;
      for (const v of [s.x, s.y, s.r, s.alpha, s.vx, s.vy, s.k]) if (!Number.isFinite(v)) nonFinite++;
      let e = seen.get(sid(s));
      if (!e) { e = { id: sid(s), kind: s.kind || "primary", cause: s.cause, slot: sslot(s), startMs: +(t * 1000).toFixed(2), r0: s.r0, ux: s.ux, uy: s.uy, life: s.life, peak: 0, states: [],
        cls: cls(s.kind), src: s.src || "", parentId: s.pid || 0, swingAtStart: recentSig, bodySpeed: Math.hypot(vx, vy), dragK: s.dragK ?? 1, goo: s.goo || 0 }; seen.set(sid(s), e); events.push(e); if (t >= 0) born++; }
      if (e.states[e.states.length - 1] !== s.state) e.states.push(s.state);
      // the release record (wake pieces are born free: their first frame)
      if ((s.state === "DETACHING" || (s.released && s.state === "FREE")) && e.releaseMs === undefined) { e.signal = s.peak; e.releaseMs = +(t * 1000).toFixed(2); e.vRelease = Math.hypot(s.vx, s.vy); e.x0 = s.x; e.y0 = s.y; e.bodyAtRelease = [rx, ry]; }
      if (s.released && e.x0 !== undefined) { e.travel = Math.hypot(s.x - e.x0, s.y - e.y0); e.lastAlpha = s.alpha; e.lastR = s.r; e.endMs = +(t * 1000).toFixed(2); }
      if (s.connected) e.connectedMs = (e.connectedMs || 0) + dt * 1000;
      e.peak = Math.max(e.peak, s.r);
    }
    live.push(n); attachedMax[0] = Math.max(attachedMax[0], att); for (let k = 0; k < 3; k++) maxClass[k] = Math.max(maxClass[k], perClass[k]);
    const Wk = D.wake;
    if (Wk) {
      if (Wk.state !== "IDLE" && (!curTail || curTail.id !== Wk.id)) { curTail = { id: Wk.id, startMs: +(t * 1000).toFixed(2), maxLen: 0, connectedMs: 0, pullMs: 0, outcome: "", splash: 0, strength: 0, rb: 0, curvature: 0, states: [],
        swingAtStart: recentSig, minStrandR: Infinity, maxReach: 0, lifeMs: 0, cause: Wk.cause, maxStep: 0, px: null }; tails.push(curTail); }
      if (curTail && Wk.id === curTail.id && Wk.state !== "IDLE") {
        if (curTail.states[curTail.states.length - 1] !== Wk.state) curTail.states.push(Wk.state);
        if (Wk.state === "PULL" || Wk.state === "NECK") curTail.connectedMs += dt * 1000;
        curTail.lifeMs += dt * 1000;
        if (Wk.state === "PULL" && Wk.age > 30) curTail.minStrandR = Math.min(curTail.minStrandR, Wk.r[1], Wk.r[2]); // the strand, once grown in
        for (let k = 0; k < 5; k++) curTail.maxReach = Math.max(curTail.maxReach, Math.hypot(Wk.x[k] - rx, Wk.y[k] - ry) + Wk.r[k]); // how far from the body centre
        if (curTail.px) for (let k = 1; k < 5; k++) if (Wk.r[k] > 0.5) curTail.maxStep = Math.max(curTail.maxStep, hz * (Math.hypot(Wk.x[k] - curTail.px[2 * k], Wk.y[k] - curTail.px[2 * k + 1]) - Math.hypot(rx - curTail.bx, ry - curTail.by))); // px/s beyond the body's own move
        curTail.px = Array.from(Wk.x).flatMap((x, k) => [x, Wk.y[k]]); curTail.bx = rx; curTail.by = ry;
        curTail.maxLen = Math.max(curTail.maxLen, Wk.len); curTail.strength = Wk.strength; curTail.rb = Math.max(curTail.rb, Wk.r[4]); curTail.splash = Wk.splash;
        if (Wk.state === "RETRACT" && !curTail.outcome) curTail.outcome = "pinch"; if (Wk.state === "MERGE" && !curTail.outcome) curTail.outcome = "merge";
        if (Wk.state === "PULL" || Wk.state === "NECK") { // how far the strand bends: the largest distance of a strand point from the root-bulb line
          const ax = Wk.x[0], ay = Wk.y[0], bx = Wk.x[4] - ax, by = Wk.y[4] - ay, bl = Math.hypot(bx, by);
          if (bl > 20) for (let k = 1; k < 4; k++) curTail.curvature = Math.max(curTail.curvature, Math.abs((Wk.x[k] - ax) * by - (Wk.y[k] - ay) * bx) / bl / bl); }
      }
    }
    material.push(n + (Wk && Wk.state !== "IDLE" ? 1 : 0));
    if (t >= 0) { frameEmit.push(born); frameSpeed.push(Math.hypot(vx, vy)); frameSignal.push(T.signal); }
    const tp = D.tp || 0; taperMax = Math.max(taperMax, tp); taperMin = Math.min(taperMin, tp); if (n === 0 && tp !== 0) taperIdleNonZero++;
    if (n > 0) emptySince = -1; else if (emptySince < 0) emptySince = t; if (n === 0 && tp !== 0 && t - emptySince > 0.15) taperLate++; // still drawn 150 ms after the last piece
    // a free piece that is not merging must never overlap an attached neck's bead (it would look re-attached)
    for (const a of SL) if (isAtt(a.state)) for (const f of SL) if ((f.state === "FREE" || f.state === "FADING") && !f.absorbed)
      neckOverlap = Math.min(neckOverlap, Math.hypot(a.x - f.x, a.y - f.y) - a.r * (1 + Math.max(0, a.el || 0)) - f.r * (1 + Math.max(0, f.el || 0)));
    // cohesion bridges between free pieces (gap under half the smaller cohesion radius): each pair may connect once
    const fr = SL.filter((s) => (s.state === "FREE" || s.state === "FADING") && s.kc > 0);
    for (let i = 0; i < fr.length; i++) for (let j = i + 1; j < fr.length; j++) {
      const a = fr[i], b = fr[j], key = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`, on = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r < Math.min(a.kc, b.kc) / 2;
      const st = bridge.get(key) || { on: false, n: 0 }; if (on && !st.on) { st.n++; bridgeConnects++; bridgeMaxPerPair = Math.max(bridgeMaxPerPair, st.n); } if (on) bridgeFrames++; st.on = on; bridge.set(key, st);
    }
  }
  const during = live.slice(Math.round(preMs / 1000 * hz));
  const hist = [0, 0, 0, 0, 0, 0]; for (const n of during) hist[n]++;
  return { hz, events, emitted: events.length, primaries: events.filter((e) => e.kind === "primary").length, follows: events.filter((e) => e.kind === "follow").length,
    satellites: events.filter((e) => e.kind === "satellite").length, peakLive: Math.max(0, ...live), maxAttached: attachedMax[0],
    meanLive: during.reduce((x, y) => x + y, 0) / Math.max(1, during.length), share: hist.map((h) => h / Math.max(1, during.length)),
    suppressed: D.suppressed, why: { ...D.why }, merges: D.merges, nonFinite, endLive: live[live.length - 1], frames, overwrites, jumpExcess: jump, worstJump, attachedExcess: jumpAtt, maxDr: dr, maxDa: da, D,
    // Phase 4.5
    secondaries: events.filter((e) => e.kind === "secondary").length, micros: events.filter((e) => e.kind === "micro").length, wakes: events.filter((e) => e.kind === "wake").length,
    maxClass, travelPx, frameEmit, frameSpeed, frameSignal, taperMax, taperMin, taperIdleNonZero, taperLate, bridgeConnects, bridgeMaxPerPair, bridgeFrames, duringLive: during, releaseExcess: jumpRel, neckOverlap,
    tails, material: material.slice(Math.round(preMs / 1000 * hz)), peakMaterial: Math.max(0, ...material), endTail: D.wake ? D.wake.state : "IDLE" };
}

// A seeded random violent compound gesture (for distributions): legs of 90-260 ms at 1600-4200 px/s in random
// directions, some smooth, some abrupt, for ms milliseconds. Deterministic for a given seed.
export function randomScribble(seed, ms = 4000) {
  let s = (seed >>> 0) || 1; const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const legs = []; let T = 0, a = r() * 2 * Math.PI;
  while (T < ms) { const d = 90 + r() * 170; a += (r() < 0.5 ? 1 : -1) * (0.4 + r() * 2.6); legs.push({ dx: Math.cos(a), dy: Math.sin(a), v: 1600 + r() * 2600, ms: d, ramp: r() < 0.35 ? 60 + r() * 60 : 0 }); T += d; }
  return { v: seg(legs), ms: ms + 1500, label: `random violent scribble #${seed}` };
}
