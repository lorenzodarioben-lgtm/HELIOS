/* Liquid cursor lab, Phases 3 and 4: the transient droplet system.
   Independent of the primary body: it READS the body's rendered position, shape and the pointer velocity, and never
   writes to them. The body shader draws the one attached bud and neck as a second SDF source (smooth union), and free
   beads while they are inside the body canvas; small bead tiles (createBeadTiles) take over beads that drift away.
   Classic script, no modules, so it runs from file:// like the rest of the lab.

   Phase 4 pool: a fixed set of MAX slots, allocated once and reused. Each slot runs the approved Phase 3 event
   unchanged (the "unit"); the pool only decides when another unit may start. Capacity 1 (`poolMax` 1) is the approved
   Phase 3 single droplet, decision for decision.

   Lifecycle of one slot:
     IDLE      free slot
     BUDDING   a small bud grows out of the body perimeter, smooth-unioned into it
     NECKING   the bud moves out and the union radius shrinks: the bridge narrows steadily to a thin neck (ease-out,
               neckMs), then the thin thread keeps thinning towards the breaking point (threadMs, neck model 2)
     DETACHING the bead is released with its own momentum; the union radius collapses, the bridge snaps and both
               fillets retract (the only "recoil"; the body itself is not touched)
     FREE      the bead flies in screen space with exponential drag and slowly shrinks
     FADING    it keeps shrinking and fades to nothing, then the slot is free again

   Trigger: a velocity swing against a lagged reference velocity (braking removed, so stops never fire), confirmed by a
   recent acceleration peak and a recent jerk peak (the swing must be abrupt), at a meaningful pointer speed, held for
   a short debounce, and only after the motion history has been clean for armMs. Smooth fast sweeps and ordinary
   pointing movements stay below the acceleration and jerk gates.

   Emission budget (Phase 4, above the trigger): the trigger says "violent enough to shed"; the budget says "may another
   piece go now". At most one slot is ever attached. The first event of a burst is the Phase 3 event (needs the pool
   empty and the Phase 3 cooldown over). While beads are still alive, a further swing may shed a follow-up only if it is
   stronger (signal >= 1 + step x live beads), spaced from the last emission, and within the burst budget; it is smaller.
   An extreme event (its velocity swing well past the trigger's) may leave one residual satellite: once its own bead is
   free, a smaller bud pinches off the same spot.
   When the pool empties the burst ends and the Phase 3 cooldown starts. A blocked emission is suppressed, never queued,
   and a live bead is never recycled.

   Phase 4.5 rich goo (gooOn 1, the default; gooOn 0 is the Phase 4 pool above, decision for decision): the rich-fission
   scheduler. One trigger event breaks into a hierarchy of pieces of the same liquid, staggered with seeded jitter:
     PRIMARY    the approved Phase 3 unit (bud 26, neck 60, thin thread 24, detach 14 ms), a little larger, thicker neck
     SECONDARY  once the event's peak swing qualifies (secSwing), 30-70 ms later, a smaller bud beside it: a shorter
                thick bud, neck and pinch (secNeckMs)
     MICRO      on a stronger swing (microSwing), 60-130 ms later, a small brief pull on the other side
     WAKE       while the event is hot, the strongly stretched, fast-swinging body accumulates tail stress; at a seeded
                threshold the rear surface sheds one more micro (stretch and swing drive it, never distance travelled)
   Several necks may be attached at once (one primary-class neck and its residuals, maxAttached); each bridges only to
   the body, never to another neck. A token budget (pieces per burst, refilling) and a short recovery after the pool
   empties replace the Phase 4 burst rule. Free pieces are heavier: less inherited momentum, a gentler snap, early
   cohesion drag and size-dependent drag; young pieces close together are briefly smooth-unioned (cohesion), and pieces
   that meet coalesce. While a primary is pulled out, the body's rear lengthens a little (taper, render only) and then
   recoils; with no fission in progress the taper is exactly 0 and the approved body is untouched. */
"use strict";
(function () {
  const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const STATES = ["IDLE", "BUDDING", "NECKING", "DETACHING", "FREE", "FADING"];
  const MAX = 5; // slots allocated once; the live capacity is P.poolMax (1-5)
  const isAttached = (s) => s === "BUDDING" || s === "NECKING" || s === "DETACHING";
  const capacity = (P) => Math.max(1, Math.min(MAX, Math.round(P.poolMax || 1)));
  // Phase 4.5: the rich-fission scheduler runs when goo is on and the pool has room for more than one piece
  const rich = (P, cap) => P.gooOn > 0 && cap > 1;
  // the hierarchy class of a slot's kind: 0 PRIMARY (primary, follow, manual), 1 SECONDARY, 2 MICRO (micro, wake and the
  // Phase 4 satellite, which is micro-sized)
  const CLASSES = ["PRIMARY", "SECONDARY", "MICRO"];
  const classOf = (kind) => (kind === "secondary" ? 1 : kind === "micro" || kind === "wake" || kind === "satellite" || kind === "splash" ? 2 : 0); // a wake bulb is PRIMARY
  const SCHED = 8, PLAN = 4; // scheduled residuals and manual burst steps (fixed arrays, no allocation)

  function createTrigger() {
    return { armedMs: 0, primed: false, lastVx: 0, lastVy: 0, since: 0, ax: 0, ay: 0, lastAx: 0, lastAy: 0, accel: 0, jerk: 0, aPeak: 0, jPeak: 0, aAge: 0, jAge: 0,
      rvx: 0, rvy: 0, speed: 0, impulse: 0, turnDeg: 0, rImpulse: 0, rAccel: 0, rJerk: 0, rSpeed: 0, signal: 0, overMs: 0, pend: false, done: false, latchVx: 0, latchVy: 0 };
  }
  // one slot's fields; resetSlot writes them back in place (no allocation per event)
  const SLOT = Object.freeze({ state: "IDLE", t: 0, age: 0, life: 0, x: 0, y: 0, vx: 0, vy: 0, r: 0, r0: 0, alpha: 0, k: 0, ux: 1, uy: 0, off: 0, gap: 0,
    el: 0, elV: 0, strength: 0, cause: "", refVx: 0, refVy: 0, manual: false, launch: 0, neck: 0, connected: false, released: false, absorbed: false, absorbT: 0,
    absR: 0, absA: 0, id: 0, kind: "", born: 0, peak: 0, timeScale: 1, energy: 1, satOk: false, layer: "none", tile: -1, stamp: -1, endFrame: -1,
    into: -1, ox: 0, oy: 0, g0: 0, g1: 0, growT: 0,
    // Phase 4.5: union-radius factor (1 = the approved neck), rich-goo flight, source, size drag, cohesion, hierarchy links
    uf: 1, goo: 0, src: "", dragK: 1, freeAt: -1, kc: 0, side: 1, parent: -1, pid: 0, attMs: 0 });
  function resetSlot(d) { for (const k in SLOT) d[k] = SLOT[k]; return d; }
  function createDropletState() { return resetSlot({ slot: 0 }); }
  function createDropletSystem(seed) {
    const slots = []; for (let i = 0; i < MAX; i++) { const s = createDropletState(); s.slot = i; slots.push(s); }
    return {
      trig: createTrigger(), slots, d: slots[0], // d: the focus slot, the most recently started event (Phase 3: the only one)
      body: { vx: 0, vy: 0, px: NaN, py: NaN }, // the body's rendered velocity, smoothed (what an attached bud rides with)
      cooldown: 0, seed0: (seed >>> 0) || 0x2f6b1d3, seed: (seed >>> 0) || 0x2f6b1d3,
      events: 0, blocked: 0, lastCause: "", lastReset: "", stateLog: [], layer: "none",
      history: new Float32Array(240), hIndex: 0, // trigger-signal history for the debug sparkline
      // Phase 4 pool bookkeeping (all numbers, no allocation per frame)
      clock: 0, frame: 0, lastEmit: -1e9, burst: 0, nextId: 0, satLast: -1e9, satellites: 0, follows: 0, merges: 0,
      suppressed: 0, why: { full: 0, attached: 0, cooldown: 0, burst: 0, spacing: 0, strength: 0, crowded: 0 }, lastSuppress: "",
      recent: new Float64Array(8), rIndex: 0,
      live: 0, attachedNow: 0, peakLive: 0, liveSum: 0, liveFrames: 0, eligible: "",
      lay: { attached: -1, nAtt: 0, att: new Int8Array(3), nBody: 0, body: new Int8Array(MAX), root: new Int8Array(MAX), want: new Int8Array(MAX), ext: new Float64Array(MAX),
        nTiles: 0, used: new Uint8Array(MAX), cx: new Float64Array(MAX), cy: new Float64Array(MAX), count: new Uint8Array(MAX), members: new Int8Array(MAX * MAX), taken: new Uint8Array(MAX) },
      // Phase 4.5 rich goo: budget tokens, scheduled residuals, the manual burst plan, tail stress, the body taper (render
      // only), and the visible-count histogram (frames with 0..5 live)
      tokens: -1, lastPrimary: -1e9, lastPiece: -1e9, stress: 0, wakeTh: 1, residuals: 0, wakes: 0, skipped: 0, peakSignal: 0, lastSource: "",
      sched: { on: new Uint8Array(SCHED), kind: new Uint8Array(SCHED), due: new Float64Array(SCHED), dead: new Float64Array(SCHED), par: new Int8Array(SCHED), pid: new Float64Array(SCHED), ang: new Float64Array(SCHED) }, pendWhy: "",
      plan: { on: new Uint8Array(PLAN), at: new Float64Array(PLAN), angle: new Float64Array(PLAN), peak: new Float64Array(PLAN), speed: new Float64Array(PLAN), until: new Float64Array(PLAN) },
      tp: 0, tpV: 0, tsg: 1, liveHist: new Float64Array(MAX + 1),
      // Phase 4.5 correction: the connected goo wake (one tail at a time) and its counters
      wake: createWake(), tails: 0, pinches: 0, tailMerges: 0, catches: 0, material: 0, matHist: new Float64Array(MAX + 2),
      // the reference goo spine, and the one tail the renderer draws (filled by the wake or the spine; on false: none)
      spine: createSpine(), spineTx: new Float64Array(WN), spineTy: new Float64Array(WN),
      tailOut: { on: false, k: 0, x: new Float64Array(WN), y: new Float64Array(WN), r: new Float64Array(WN), owner: 0 },
    };
  }
  // deterministic xorshift32 in [0, 1): the same pointer events give the same droplets
  function rand(D) { let s = D.seed; s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; D.seed = s; return s / 4294967296; }

  // forget the motion history (instrumentation artifacts must never look like a flick); keep the lifecycle
  function disarm(D) {
    const T = D.trig;
    T.armedMs = 0; T.overMs = 0; T.primed = false; T.ax = T.ay = T.lastAx = T.lastAy = T.accel = T.jerk = T.aPeak = T.jPeak = T.aAge = T.jAge = 0;
    T.since = 0; T.signal = 0; T.impulse = 0; T.turnDeg = 0; T.rImpulse = T.rAccel = T.rJerk = T.rSpeed = 0; T.rvx = T.lastVx; T.rvy = T.lastVy;
    T.pend = false; T.done = false;
  }
  // end every droplet at once (body hidden, mode or preset switch) and forget the motion history
  function reset(D, P, why) {
    const gooOn = rich(P, capacity(P));
    for (let i = 0; i < MAX; i++) {
      const d = D.slots[i];
      if (d.state !== "IDLE") { D.cooldown = gooOn ? P.gooCooldownMs : P.dropCooldownMs; D.lastReset = why || "reset"; if (d === D.d) log(D, d, "IDLE"); }
      resetSlot(d);
    }
    D.body.px = NaN; D.layer = "none"; D.burst = 0; D.live = D.attachedNow = 0;
    if (D.wake.state !== "IDLE") { D.cooldown = P.wakeCooldownMs; D.lastReset = why || "reset"; }
    D.wake.state = "IDLE"; D.wake.t = D.wake.age = 0;
    D.spine.on = false; D.spine.E = D.spine.L = D.spine.mE = 0; D.spine.hn = 0; D.tailOut.on = false;
    D.sched.on.fill(0); D.plan.on.fill(0); D.tokens = -1; D.stress = 0; D.tp = D.tpV = 0; // rich goo: a fresh budget, no residuals pending
    disarm(D);
  }
  function log(D, d, s) { d.state = s; d.t = 0; if (d === D.d && D.stateLog.length < 64) D.stateLog.push(s); }
  function live(D) { let n = 0; for (let i = 0; i < MAX; i++) if (D.slots[i].state !== "IDLE") n++; return n; }
  function attached(D) { for (let i = 0; i < MAX; i++) if (isAttached(D.slots[i].state)) return D.slots[i]; return null; }
  // fresh: skip a slot whose droplet finished this very frame, so a slot is always seen free for a frame before reuse
  function freeSlot(D, cap, fresh) { for (let i = 0; i < cap; i++) { const s = D.slots[i]; if (s.state === "IDLE" && !(fresh && s.endFrame === D.frame)) return s; } return null; }

  // ---------------------------------------------------------------- trigger detector (runs every frame, cheap, no allocation)
  // v: pointer velocity (CSS px/s, the engine's per-sample smoothed velocity); returns true when an event should start
  function stepTrigger(D, P, vx, vy, dt, allowed) {
    const T = D.trig, dtMs = dt * 1000;
    // derivatives only when the velocity actually changes: irregular sample intervals and frames without a sample must
    // not read as acceleration spikes
    T.since += dt;
    if (vx !== T.lastVx || vy !== T.lastVy) {
      const h = Math.max(T.since, 1e-4);
      if (T.primed) {
        const ka = 1 - Math.exp(-h * 1000 / P.dropAccelMs), kj = 1 - Math.exp(-h * 1000 / P.dropJerkMs);
        T.ax += ((vx - T.lastVx) / h - T.ax) * ka; T.ay += ((vy - T.lastVy) / h - T.ay) * ka;
        T.jerk += (Math.hypot(T.ax - T.lastAx, T.ay - T.lastAy) / h - T.jerk) * kj;
        T.lastAx = T.ax; T.lastAy = T.ay;
      }
      T.primed = true; T.lastVx = vx; T.lastVy = vy; T.since = 0;
    }
    T.accel = Math.hypot(T.ax, T.ay);
    // recent peaks, held flat for peakHoldMs and then released quickly: the onset (jerk) and the push (acceleration) come
    // before the velocity swing, so "a peak above threshold within the last peakHoldMs" is what the gates test
    const kr0 = Math.exp(-dtMs / 20);
    if (T.accel >= T.aPeak) { T.aPeak = T.accel; T.aAge = 0; } else if ((T.aAge += dtMs) > P.dropPeakHoldMs) T.aPeak *= kr0;
    if (T.jerk >= T.jPeak) { T.jPeak = T.jerk; T.jAge = 0; } else if ((T.jAge += dtMs) > P.dropPeakHoldMs) T.jPeak *= kr0;
    const kr = 1 - Math.exp(-dtMs / P.dropReferenceMs); // lagged reference: "where the liquid's momentum was"
    T.rvx += (vx - T.rvx) * kr; T.rvy += (vy - T.rvy) * kr;
    const sp = Math.hypot(vx, vy), dvx = vx - T.rvx, dvy = vy - T.rvy;
    let par = 0, lat = Math.hypot(dvx, dvy);
    if (sp > 1) { par = (dvx * vx + dvy * vy) / sp; lat = Math.hypot(dvx - par * vx / sp, dvy - par * vy / sp); }
    T.speed = sp; T.impulse = Math.hypot(Math.max(0, par), P.dropTurnGain * lat); // braking (par < 0) never counts: stops never fire
    const rs = Math.hypot(T.rvx, T.rvy);
    T.turnDeg = sp > 1 && rs > 1 ? Math.acos(Math.max(-1, Math.min(1, (vx * T.rvx + vy * T.rvy) / (sp * rs)))) * 180 / Math.PI : 0;
    // direction change makes breakup easier: past 30° (full at 90°) the acceleration and jerk gates scale down by turnGain
    const tf = 1 + (P.dropTurnGain - 1) * clamp01((T.turnDeg - 30) / 60);
    T.rSpeed = sp / P.dropMinSpeed; T.rImpulse = T.impulse / P.dropImpulse; T.rAccel = T.aPeak * tf / P.dropAccel; T.rJerk = T.jPeak * tf / P.dropJerk;
    T.signal = Math.min(T.rSpeed, T.rImpulse, T.rAccel, T.rJerk); // >= 1 only when every gate is open
    D.history[D.hIndex] = T.signal; D.hIndex = (D.hIndex + 1) % D.history.length;
    if (allowed) T.armedMs += dtMs; else { T.armedMs = 0; T.overMs = 0; return false; }
    T.overMs = T.signal >= 1 ? T.overMs + dtMs : 0;
    return T.armedMs >= P.dropArmMs && T.overMs >= P.dropDebounceMs;
  }
  const causeOf = (T) => (T.turnDeg > 150 ? "reversal" : T.turnDeg > 50 ? "turn" : "acceleration");

  // boundary distance of the body's noise-free ellipse from its centre, in direction (ux, uy); CSS px.
  // Phase 4.5 taper (render only, owned by this system): on the side of the axis given by body.tsg the semi-axis along
  // the stretch is (1 + body.tp) longer, exactly as the shader draws it (an egg; C1 at the minor axis). tp 0: unchanged.
  const tapered = (body, ca) => (body.tp && ca * body.tsg > 0 ? 1 + body.tp : 1);
  function edge(body, ux, uy) {
    const ca = ux * body.ax + uy * body.ay, sa = -ux * body.ay + uy * body.ax;
    const a = body.R * body.s * tapered(body, ca), b = body.R * body.c;
    return 1 / Math.sqrt((ca / a) * (ca / a) + (sa / b) * (sa / b));
  }

  // The approved body's membrane, ported exactly from the shader's "field" model in liquid-cursor.js (the same pcg3d
  // lattice hash, quintic gradient noise and soft limit), so the revised neck can sit on the surface the shader really
  // draws. Read-only: the body is never changed. No allocation.
  const HS = new Uint32Array(3);
  function pcg3d(x, y, z) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0; y = (Math.imul(y, 1664525) + 1013904223) >>> 0; z = (Math.imul(z, 1664525) + 1013904223) >>> 0;
    x = (x + Math.imul(y, z)) >>> 0; y = (y + Math.imul(z, x)) >>> 0; z = (z + Math.imul(x, y)) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0; y = (y ^ (y >>> 16)) >>> 0; z = (z ^ (z >>> 16)) >>> 0;
    x = (x + Math.imul(y, z)) >>> 0; y = (y + Math.imul(z, x)) >>> 0; z = (z + Math.imul(x, y)) >>> 0;
    HS[0] = x; HS[1] = y; HS[2] = z;
  }
  function corner(ix, iy, iz, ox, oy, oz, fx, fy, fz) {
    pcg3d((ix + ox + 4096) >>> 0, (iy + oy + 4096) >>> 0, (iz + oz) & 63);
    const k = 2 / 16777215;
    return ((HS[0] >>> 8) * k - 1) * (fx - ox) + ((HS[1] >>> 8) * k - 1) * (fy - oy) + ((HS[2] >>> 8) * k - 1) * (fz - oz);
  }
  const quintic = (f) => f * f * f * (f * (f * 6 - 15) + 10), mix = (a, b, t) => a + (b - a) * t;
  function gnoise(qx, qy, qz) {
    const ix = Math.floor(qx), iy = Math.floor(qy), iz = Math.floor(qz), fx = qx - ix, fy = qy - iy, fz = qz - iz;
    const ux = quintic(fx), uy = quintic(fy), uz = quintic(fz);
    const a = mix(corner(ix, iy, iz, 0, 0, 0, fx, fy, fz), corner(ix, iy, iz, 1, 0, 0, fx, fy, fz), ux);
    const b = mix(corner(ix, iy, iz, 0, 1, 0, fx, fy, fz), corner(ix, iy, iz, 1, 1, 0, fx, fy, fz), ux);
    const c = mix(corner(ix, iy, iz, 0, 0, 1, fx, fy, fz), corner(ix, iy, iz, 1, 0, 1, fx, fy, fz), ux);
    const e = mix(corner(ix, iy, iz, 0, 1, 1, fx, fy, fz), corner(ix, iy, iz, 1, 1, 1, fx, fy, fz), ux);
    return mix(mix(a, b, uy), mix(c, e, uy), uz);
  }
  // outward displacement (CSS px) of the drawn membrane at the body edge in direction (ux, uy). body.amp, body.cell and
  // body.nt are the shader's amplitude and cell size (CSS px) and its noise clock; amp is 0 for the harmonic Phase 2 original
  function surface(body, ux, uy, E) {
    if (!(body.amp > 0)) return 0;
    const px = ux * E / body.cell, py = -uy * E / body.cell; // the shader's frame: y up
    const x = Math.min(1, Math.max(-1, 2.2 * gnoise(0.8 * px - 0.6 * py, 0.6 * px + 0.8 * py, body.nt)));
    // the shader displaces its first-order ellipse distance; along this ray that moves the edge by amp n x |grad lr| / L
    const ca = ux * body.ax + uy * body.ay, sa = -ux * body.ay + uy * body.ax, s = body.s * tapered(body, ca), L2 = (ca / s) ** 2 + (sa / body.c) ** 2;
    return body.amp * x * (1.5 - 0.5 * x * x) * Math.hypot(ca / (s * s), sa / (body.c * body.c)) / L2;
  }

  // start one event in slot d. opts (manual trigger only): { angleDeg, speed, strength, extreme }.
  // kind: "primary" (the Phase 3 event), "follow" (a later swing while beads are alive: smaller) or "manual"
  // goo (Phase 4.5): a rich-goo primary-class event (larger, thicker neck, heavier flight, residuals scheduled by the caller)
  function begin(D, P, body, cause, opts, d, kind, liveNow, goo) {
    const T = D.trig;
    resetSlot(d);
    let ux, uy;
    if (opts && Number.isFinite(opts.angleDeg)) { const a = opts.angleDeg * Math.PI / 180; ux = Math.cos(a); uy = Math.sin(a); }
    // the liquid's own inertia: only the part of the pre-event momentum the body abandoned (a turn or a reversal).
    // A straight flick abandons none, so its bead is simply left behind.
    const sl0 = Math.hypot(T.lastVx, T.lastVy), hx = sl0 > 1 ? T.lastVx / sl0 : 0, hy = sl0 > 1 ? T.lastVy / sl0 : 0, along = Math.max(0, T.rvx * hx + T.rvy * hy);
    d.refVx = T.rvx - hx * along; d.refVy = T.rvy - hy * along;
    if (!(opts && Number.isFinite(opts.angleDeg))) {
      // bud where the liquid will separate towards: the predicted bead velocity relative to the body at release
      const rx = (P.dropMomentum - 1) * T.lastVx + P.dropCarry * d.refVx, ry = (P.dropMomentum - 1) * T.lastVy + P.dropCarry * d.refVy, rl = Math.hypot(rx, ry);
      if (rl > 1) { ux = rx / rl; uy = ry / rl; }
      else { const sl = Math.hypot(T.lastVx, T.lastVy); ux = sl > 1 ? -T.lastVx / sl : -1; uy = sl > 1 ? -T.lastVy / sl : 0; }
      const j = (rand(D) - 0.5) * 2 * P.dropSpreadDeg * Math.PI / 180, cj = Math.cos(j), sj = Math.sin(j); // never exactly the same angle
      const nx = ux * cj - uy * sj; uy = ux * sj + uy * cj; ux = nx;
    }
    d.ux = ux; d.uy = uy;
    d.strength = opts ? clamp01(opts.strength ?? 0.5) : clamp01((T.rImpulse - 1) / 1.2);
    d.r0 = Math.min(10, Math.max(3, P.dropRadius * (1 + P.dropRadiusSpread * (2 * d.strength - 1))));
    // a follow-up is a smaller piece of what is left: followScale per bead still alive (never under 3 px)
    if (kind === "follow") d.r0 = Math.max(3, d.r0 * Math.pow(goo ? P.gooFollowScale : P.poolFollowScale, liveNow));
    if (goo) d.r0 = Math.min(8.5, Math.max(5, d.r0 * P.gooScale)); // rich goo primary: 5-8.5 px
    d.life = P.dropLifeMs * Math.sqrt(d.r0 / P.dropRadius);
    d.manual = !!opts; d.launch = opts ? Math.max(0, +opts.speed || 0) : 0; d.cause = cause;
    d.kind = kind; d.id = ++D.nextId; d.born = D.clock; d.peak = opts ? (opts.extreme ? Infinity : 0) : T.rImpulse; d.stamp = D.frame; // not advanced on its first frame
    if (goo) {
      d.goo = 1; d.uf = P.gooUnion; d.life *= P.gooLife; d.dragK = sizeDrag(P, d.r0); d.src = opts ? "manual" : "trigger"; d.side = rand(D) < 0.5 ? -1 : 1;
      if (opts) d.peak = Number.isFinite(+opts.peak) ? +opts.peak : opts.extreme ? 2 : 1; // a manual event's synthetic swing (residual eligibility)
    }
    D.events++; D.lastCause = cause; D.stateLog.length = 0; D.d = d; log(D, d, "BUDDING");
    emitted(D, kind);
    place(D, d, P, body, 0);
  }
  // Phase 4.5: larger pieces keep their momentum longer, smaller ones slow sooner (bounded 0.75-1.5 x)
  const sizeDrag = (P, r0) => Math.min(1.5, Math.max(0.75, Math.pow(P.dropRadius / Math.max(1, r0), P.gooDragSize)));
  function emitted(D, kind) {
    D.lastEmit = D.clock; D.burst++; if (kind === "follow") D.follows++;
    D.recent[D.rIndex] = D.clock; D.rIndex = (D.rIndex + 1) % D.recent.length;
  }
  // a residual satellite: once an extreme event's bead is free, a smaller bud pinches off the same spot (a little to one
  // side), with less energy and a shorter life. Its whole lifecycle is the same unit, time-scaled by satTime.
  function beginSatellite(D, P, body, parent, d) {
    resetSlot(d);
    const sgn = rand(D) < 0.5 ? -1 : 1, a = sgn * P.poolSatAngleDeg * (0.6 + 0.4 * rand(D)) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    d.ux = parent.ux * ca - parent.uy * sa; d.uy = parent.ux * sa + parent.uy * ca;
    d.refVx = parent.refVx; d.refVy = parent.refVy; d.strength = parent.strength;
    d.r0 = Math.min(4.5, Math.max(2.5, P.poolSatScale * parent.r0));
    d.timeScale = Math.max(0.2, P.poolSatTime); d.energy = P.poolSatEnergy;
    d.life = P.dropLifeMs * Math.sqrt(d.r0 / P.dropRadius) * P.poolSatLife;
    d.manual = parent.manual; d.launch = parent.launch * P.poolSatEnergy; d.cause = "satellite";
    d.kind = "satellite"; d.id = ++D.nextId; d.born = D.clock; d.stamp = D.frame;
    D.events++; D.satellites++; D.satLast = D.clock; D.stateLog.length = 0; D.d = d; log(D, d, "BUDDING");
    D.recent[D.rIndex] = D.clock; D.rIndex = (D.rIndex + 1) % D.recent.length;
    place(D, d, P, body, 0);
  }

  // attached bud: rides the body at a perimeter point; o = centre offset past the edge, k = union radius (CSS px).
  // u: progress through the state (NECKING: through neckMs + threadMs)
  function place(D, d, P, body, u) {
    const r0 = d.r0, k0 = P.dropUnion * d.uf * r0, k1 = 0.8 * k0; // uf: Phase 4.5 thicker rich-goo neck (1: the approved one)
    if (d.state === "BUDDING") {
      const e = smooth(u);
      d.r = r0 * (0.5 + 0.5 * e); d.k = k0; d.el = 0; d.gap = -r0 * (1.05 - 0.45 * e) - 0.1 * r0 * (1 - e);
    } else { // NECKING, in two parts. Narrowing (neckMs): the union tightens while the gap closes in on just under the
      // bridge-breaking gap (k / 2) with an ease-out, so the neck narrows steadily. Thin thread (threadMs, neck model 2):
      // the gap creeps on from 0.43 k to threadGap x k; the width goes about as the root of the remaining margin, so the
      // thread thins ever faster into the pinch (the bead rides the body: it is not pulled, so nothing stretches).
      // DETACHING then snaps it.
      const U = clamp01(u), N = P.dropNeckMs, T = threadMs(P), tn = U * (N + T);
      const uu = T > 0 ? Math.min(1, tn / N) : U, g0 = -0.6 * r0, k = k0 + (k1 - k0) * uu, gc = 0.43 * k, gc0 = 0.43 * k0;
      d.r = r0; d.k = k; d.el = P.dropPinchStretch * Math.pow(U, 1.5); d.gap = gc - (gc0 - g0) * Math.pow(1 - uu, P.dropPinchCurve);
      if (T > 0 && tn > N) { const v = Math.min(1, (tn - N) / T); d.gap = k * (0.43 + (Math.min(0.495, P.dropThreadGap) - 0.43) * v); }
    }
    d.alpha = 1; // attached liquid is part of the body (its own opacity only matters once free)
    d.off = d.r * (1 + d.el) + d.gap; // centre past the boundary: the surface gap along the attachment direction is `gap`
    // neck model 2 measures that gap from the membrane the shader draws, not from the noise-free ellipse: at speed the
    // membrane slides under the bud by up to its amplitude (0.7 px), as much as a thin thread's whole margin
    const E0 = edge(body, d.ux, d.uy), E = E0 + (P.dropNeckModel >= 2 ? surface(body, d.ux, d.uy, E0) : 0);
    d.x = body.x + d.ux * (E + d.off); d.y = body.y + d.uy * (E + d.off);
    d.connected = d.gap < d.k / 2; // polynomial smooth union bridges two surfaces while their gap is under k / 2
    d.neck = d.k > 0 ? clamp01(1 - Math.max(0, d.gap) / (d.k / 2)) : 0;
  }

  // neck model 1 is the first version (4f71aee), kept exactly for the comparison snapshots. Model 2 is the revised
  // balanced neck: a thin-thread stage after the narrowing, the gap measured from the drawn membrane, and no re-bridging
  // after the pinch (snap)
  const threadMs = (P) => (P.dropNeckModel >= 2 ? Math.max(0, P.dropThreadMs) : 0);
  const neckTotal = (P) => P.dropNeckMs + threadMs(P); // the whole NECKING state: narrowing + thin thread

  function release(D, d, P) {
    if (d.goo) { releaseGoo(D, d, P); return; }
    const bv = D.body;
    let vx, vy;
    if (d.manual) { vx = bv.vx + d.ux * d.launch; vy = bv.vy + d.uy * d.launch; }
    else {
      vx = P.dropMomentum * bv.vx + P.dropCarry * d.energy * d.refVx; vy = P.dropMomentum * bv.vy + P.dropCarry * d.energy * d.refVy;
      const side = (rand(D) - 0.5) * 2 * 0.12 * Math.hypot(vx - bv.vx, vy - bv.vy); // a little perpendicular variation
      vx += -d.uy * side; vy += d.ux * side;
    }
    // the snapping neck pushes the bead away (a satellite gets the full kick: its smaller neck retracts at least as fast;
    // only its share of the abandoned momentum is smaller, so it does not cling to a body that has stopped)
    if (!d.manual) { vx += d.ux * P.dropSnapKick; vy += d.uy * P.dropSnapKick; }
    const rel = (vx - bv.vx) * d.ux + (vy - bv.vy) * d.uy; // never drift back into the body: a minimum separation speed
    if (rel < P.dropMinSeparation) { vx += d.ux * (P.dropMinSeparation - rel); vy += d.uy * (P.dropMinSeparation - rel); }
    d.vx = vx; d.vy = vy; d.age = 0; d.released = true; d.elV = 0; d.alpha = 1;
  }
  // Phase 4.5 rich goo release: the same terms, heavier. Less of the body's momentum and of the abandoned momentum
  // (gooMomentum), a gentler snap and minimum separation (gooKick): a piece of liquid left behind, not fired away
  function releaseGoo(D, d, P) {
    const bv = D.body, m = P.gooMomentum, kick = P.dropSnapKick * P.gooKick, minSep = P.dropMinSeparation * Math.max(0.5, P.gooKick);
    let vx, vy;
    if (d.manual) { vx = bv.vx + d.ux * d.launch; vy = bv.vy + d.uy * d.launch; }
    else {
      vx = P.dropMomentum * m * bv.vx + P.dropCarry * m * d.energy * d.refVx; vy = P.dropMomentum * m * bv.vy + P.dropCarry * m * d.energy * d.refVy;
      const side = (rand(D) - 0.5) * 2 * 0.12 * Math.hypot(vx - bv.vx, vy - bv.vy);
      vx += -d.uy * side; vy += d.ux * side;
      vx += d.ux * kick; vy += d.uy * kick;
    }
    const rel = (vx - bv.vx) * d.ux + (vy - bv.vy) * d.uy;
    if (rel < minSep) { vx += d.ux * (minSep - rel); vy += d.uy * (minSep - rel); }
    d.vx = vx; d.vy = vy; d.age = 0; d.released = true; d.elV = 0; d.alpha = 1; d.attMs = D.clock - d.born;
  }

  // the union collapses over detachMs (called after fly, so the gap is this frame's). Model 2 also keeps it under 1.5 x the
  // live surface gap: in a flick the release frame carries the bead a little towards where the body now is, and the
  // collapsing union must not bridge it again, so the pinch happens on the release frame, decisively
  function snap(d, P) {
    let k = 0.8 * P.dropUnion * d.uf * d.r0 * (1 - smooth(Math.max(d.t, 4) / (P.dropDetachMs * d.timeScale)));
    if (P.dropNeckModel >= 2) k = Math.min(k, 1.5 * Math.max(0, d.gap));
    d.k = k; d.connected = false; d.neck = 0;
  }

  // free flight: exact exponential drag (frame-rate independent), shape recoil spring, shrink and fade curves; a bead the
  // body runs into (a flick then a dead stop, or doubling back over it) coalesces: it shrinks and fades into the body
  // instead of passing through it
  function fly(d, P, dt, maxSubstep, body) {
    if (d.goo) flyGoo(d, P, dt, maxSubstep);
    else { const lam = Math.max(1e-3, P.dropDrag), e = Math.exp(-lam * dt), f = (1 - e) / lam;
      d.x += d.vx * f; d.y += d.vy * f; d.vx *= e; d.vy *= e; }
    { const dx = d.x - body.x, dy = d.y - body.y, dl = Math.hypot(dx, dy), E = dl > 1e-6 ? edge(body, dx / dl, dy / dl) : 0;
      d.gap = dl - E - d.r; // live surface gap to the body (debug readout; model 2: from the membrane, elongation included)
      if (P.dropNeckModel >= 2 && dl > 1e-6) d.gap -= surface(body, dx / dl, dy / dl, E) + d.r * Math.max(0, d.el);
      if (!d.absorbed && d.state !== "DETACHING" && (dl < 1e-6 || dl < E + 0.25 * d.r)) { d.absorbed = true; d.absorbT = 0; d.absR = d.r; d.absA = d.alpha; d.into = -1; } }
    const n = Math.max(1, Math.ceil(dt / maxSubstep)), h = dt / n, w = P.dropRecoil, z = 0.35;
    for (let i = 0; i < n; i++) { d.elV += (-w * w * d.el - 2 * z * w * d.elV) * h; d.el += d.elV * h; }
    d.age += dt * 1000;
    if (d.g1 > 0) { // it is taking in a smaller bead (Phase 4 coalescence): its own size grows smoothly by the absorbed area
      d.growT += dt * 1000; d.r0 = d.g0 + (d.g1 - d.g0) * smooth(d.growT / P.dropAbsorbMs);
      if (d.growT >= P.dropAbsorbMs) d.g1 = 0;
    }
    if (d.absorbed) { // coalescing: gone within absorbMs, whatever its age
      d.absorbT += dt * 1000; const q = smooth(d.absorbT / P.dropAbsorbMs);
      d.r = d.absR * (1 - 0.6 * q); d.alpha = d.absA * (1 - q); d.kc = 0;
      return d.absorbT >= P.dropAbsorbMs ? 1 : Math.max(P.dropFreeShare, d.age / d.life);
    }
    const u = d.age / d.life, us = clamp01((u - 0.2) / 0.8), uf = clamp01((u - P.dropFreeShare) / (1 - P.dropFreeShare));
    d.r = d.r0 * (1 - (1 - P.dropEndScale) * Math.pow(us, P.dropShrinkCurve));
    if (d.kind === "splash") d.r *= 0.35 + 0.65 * smooth(d.age / 45); // a splash bead grows out of the snapping neck (no pop)
    d.alpha = 1 - Math.pow(uf, P.dropFadeCurve);
    if (d.goo) d.kc = cohesion(d, P);
    return u;
  }
  // Phase 4.5 free flight: drag = the Phase 3 drag x gooDrag x the size factor, plus an early cohesion drag that fades over
  // gooEarlyMs (the piece is left behind where it broke off). Exact exponentials over equal substeps (60-165 Hz agree).
  function flyGoo(d, P, dt, maxSubstep) {
    const n = Math.max(1, Math.ceil(dt / maxSubstep)), h = dt / n, base = P.dropDrag * P.gooDrag * d.dragK;
    for (let i = 0; i < n; i++) {
      const age = d.age + (i + 0.5) * h * 1000, lam = Math.max(1e-3, base + P.gooEarlyDrag * Math.max(0, 1 - age / Math.max(1, P.gooEarlyMs)));
      const e = Math.exp(-lam * h), f = (1 - e) / lam;
      d.x += d.vx * f; d.y += d.vy * f; d.vx *= e; d.vy *= e;
    }
  }
  // Phase 4.5 cohesion radius (CSS px) of a young free piece: ramps in over 35 ms from the moment it is free (so a bridge to
  // a neighbour grows from nothing, never pops), holds to 70 ms, and is gone by 130 ms, while the piece is fully opaque
  const cohesion = (d, P) => {
    if (!(P.gooCohesion > 0) || d.freeAt < 0 || d.absorbed || d.alpha < 0.999) return 0;
    const t = d.age - d.freeAt;
    return P.gooCohesion * d.r0 * (t < 35 ? smooth(t / 35) : t < 70 ? 1 : 1 - smooth((t - 70) / 60));
  };

  // one slot's frame (the approved Phase 3 state machine; time-scaled for a satellite)
  function advance(D, d, P, body, dt, maxSubstep, cap) {
    d.t += dt * 1000;
    const ts = d.timeScale, budMs = P.dropBudMs * ts, neckMs = neckTotal(P) * ts, detMs = P.dropDetachMs * ts;
    switch (d.state) {
      // state changes carry the leftover time, so phase durations do not round up to whole frames (60-165 Hz agree)
      case "BUDDING": if (d.t >= budMs) { const c = d.t - budMs; log(D, d, "NECKING"); d.t = c; place(D, d, P, body, c / neckMs); } else place(D, d, P, body, d.t / budMs); break;
      case "NECKING":
        if (d.t >= neckMs) {
          const c = d.t - neckMs; place(D, d, P, body, 1); release(D, d, P); log(D, d, "DETACHING"); d.t = c; fly(d, P, dt, maxSubstep, body); snap(d, P);
          // a residual satellite is decided at the pinch: an extreme event, satellites on, none recently (Phase 4 only: rich
          // goo schedules its residuals at the event's start)
          d.satOk = cap > 1 && d.kind !== "satellite" && P.poolSatellite > 0 && d.peak >= P.poolSatSwing && D.clock - D.satLast >= P.poolSatCooldownMs && !rich(P, cap);
        } else place(D, d, P, body, d.t / neckMs);
        break;
      case "DETACHING": // the union collapses: the bridge snaps and both fillets retract (starting on the release frame itself)
        fly(d, P, dt, maxSubstep, body); snap(d, P);
        if (d.t >= detMs) {
          const c = d.t - detMs; d.k = 0; log(D, d, "FREE"); d.t = c; d.freeAt = d.age;
          if (d.satOk) { d.satOk = false; const s = freeSlot(D, cap, true); if (s && !attached(D)) beginSatellite(D, P, body, d, s); }
        }
        break;
      case "FREE": if (fly(d, P, dt, maxSubstep, body) >= P.dropFreeShare) log(D, d, "FADING"); break;
      case "FADING":
        if (fly(d, P, dt, maxSubstep, body) >= 1 || d.alpha <= 0.002) {
          log(D, d, "IDLE"); resetSlot(d); d.endFrame = D.frame;
          if (d === D.d) D.layer = "none";
          if (live(D) === 0 && D.wake.state === "IDLE" && !D.spine.on) { // the burst is over (Phase 3: the droplet has gone)
            const gooOn = rich(P, cap);
            D.cooldown = gooOn ? P.gooCooldownMs : P.dropCooldownMs; D.burst = 0; disarm(D);
            if (gooOn) D.sched.on.fill(0);
          }
        }
        break;
    }
  }

  // Phase 4 coalescence of two free beads: when they overlap, the smaller (or, equal, the younger) flows into the other
  // within absorbMs: it shrinks and fades while closing on its centre; the other gains its area smoothly (at most +25% in
  // radius) and the pair keeps the area-weighted momentum. Deterministic, no bouncing.
  function coalesce(D, P) {
    const S = D.slots, jf = P.gooOn > 0 ? P.gooJoin : 0.85; // Phase 4.5 rich goo leans further into coalescence (gooJoin)
    for (let i = 0; i < MAX; i++) {
      const a = S[i]; if ((a.state !== "FREE" && a.state !== "FADING") || a.absorbed) continue;
      for (let j = i + 1; j < MAX; j++) {
        const b = S[j]; if ((b.state !== "FREE" && b.state !== "FADING") || b.absorbed || a.absorbed) continue;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist >= jf * (a.r + b.r)) continue;
        const small = a.r < b.r || (a.r === b.r && a.id > b.id) ? a : b, big = small === a ? b : a;
        const As = small.r * small.r, Ab = big.r * big.r, vx = (Ab * big.vx + As * small.vx) / (Ab + As), vy = (Ab * big.vy + As * small.vy) / (Ab + As);
        big.vx = small.vx = vx; big.vy = small.vy = vy;
        small.absorbed = true; small.absorbT = 0; small.absR = small.r; small.absA = small.alpha; small.into = big.slot; small.ox = small.x - big.x; small.oy = small.y - big.y;
        big.g0 = big.r0; big.g1 = Math.min(1.25 * big.r0, Math.sqrt(big.r0 * big.r0 + small.r0 * small.r0 * (small.r / Math.max(1e-6, small.r0)) ** 2)); big.growT = 0;
        D.merges++;
      }
    }
    // Phase 4.5: with several necks, the body can carry an attached bud over a free piece (a turn, a zigzag): the piece
    // rejoins the liquid there, exactly as when the body itself runs into it (it shrinks and fades in within absorbMs),
    // instead of overlapping a neck and looking re-attached
    if (P.gooOn > 0) for (let i = 0; i < MAX; i++) {
      const f = S[i]; if ((f.state !== "FREE" && f.state !== "FADING") || f.absorbed) continue;
      for (let j = 0; j < MAX; j++) {
        const a = S[j]; if (!isAttached(a.state)) continue;
        if (Math.hypot(f.x - a.x, f.y - a.y) < f.r + a.r * (1 + Math.max(0, a.el))) { f.absorbed = true; f.absorbT = 0; f.absR = f.r; f.absA = f.alpha; f.into = -1; D.catches = (D.catches || 0) + 1; break; }
      }
    }
    if ((P.wakeOn > 0 || P.spineOn > 0) && P.gooOn > 0) tailCatch(D, P);
    for (let i = 0; i < MAX; i++) { // an absorbed bead closes on the bead taking it in
      const s = S[i]; if (!s.absorbed || s.into < 0) continue;
      const t = S[s.into]; if (t.state !== "FREE" && t.state !== "FADING") { s.into = -1; continue; }
      const q = 1 - smooth(s.absorbT / P.dropAbsorbMs); s.x = t.x + s.ox * q; s.y = t.y + s.oy * q;
    }
  }

  // ---------------------------------------------------------------- Phase 4.5 correction: the connected goo wake
  // A strong event no longer sheds a bud first: it pulls the body's rear into a short connected tail. Five points in
  // screen space: 0 the root on the body's rear surface (kinematic: it rides the body), 1-3 a light strand, 4 a heavy
  // bulb. Damped springs join them; the points start with little of the body's momentum (and the momentum the body
  // abandoned in a turn or reversal), so the body drags them out behind it: the strand stretches, curves through turns
  // and swings out on reversals, the bulb lags most. The shader draws the tail as one chain of round cones smooth-
  // unioned into the body (body, thick tail, bulb), never as separate circles.
  //   PULL     the tail is drawn out (soft springs, a soft and then hard length limit)
  //   NECK     the strand just before the bulb thins to a thread (neckMs)
  //   (pinch)  the bulb becomes a free piece with its own velocity; a few splash beads spray from the snapping neck
  //   RETRACT  the rest of the strand snaps back into the body and is gone within retractMs
  //   MERGE    instead of pinching, the bulb is pulled back into a body that has slowed: the whole tail rejoins it
  const WN = 5;
  function createWake() {
    return { state: "IDLE", t: 0, age: 0, x: new Float64Array(WN), y: new Float64Array(WN), vx: new Float64Array(WN), vy: new Float64Array(WN), r: new Float64Array(WN),
      ux: 1, uy: 0, strength: 0, peak: 0, lenMax: 0, len: 0, maxLen: 0, rb: 0, neck: 0, cause: "", manual: false, id: 0, born: 0, pullMs: 0, splash: 0, k: 0, ax1: 0, ay1: 0, neckDur: 45, vPeak: 0, hurry: false };
  }
  const wakeOn = (P, cap) => P.wakeOn > 0 && P.gooOn > 0 && cap > 1;
  const tailActive = (D) => D.wake.state !== "IDLE";
  // the length the tail may reach for this event (root to bulb centre, CSS px), from its swing: wakeLenMin at the trigger
  // level, wakeLenMax at twice the swing threshold
  const tailLen = (P, s) => P.wakeLenMin + (P.wakeLenMax - P.wakeLenMin) * s;
  function startWake(D, P, body, cause, manual) {
    const T = D.trig, W = D.wake, bv = D.body;
    // the liquid left behind: the momentum the body abandoned (a turn or reversal) and little of its current velocity
    const sl0 = Math.hypot(T.lastVx, T.lastVy), hx = sl0 > 1 ? T.lastVx / sl0 : 0, hy = sl0 > 1 ? T.lastVy / sl0 : 0, along = Math.max(0, T.rvx * hx + T.rvy * hy);
    const refVx = T.rvx - hx * along, refVy = T.rvy - hy * along;
    let ux, uy;
    if (manual) { const a = manual.angleDeg * Math.PI / 180; ux = Math.cos(a); uy = Math.sin(a); }
    else {
      const rx = (P.wakeLag - 1) * T.lastVx + P.wakeCarry * refVx, ry = (P.wakeLag - 1) * T.lastVy + P.wakeCarry * refVy, rl = Math.hypot(rx, ry);
      if (rl > 1) { ux = rx / rl; uy = ry / rl; } else { ux = sl0 > 1 ? -hx : -1; uy = sl0 > 1 ? -hy : 0; }
      const j = (rand(D) - 0.5) * 2 * P.dropSpreadDeg * Math.PI / 180, cj = Math.cos(j), sj = Math.sin(j), nx = ux * cj - uy * sj; uy = ux * sj + uy * cj; ux = nx;
    }
    W.state = "PULL"; W.t = W.age = 0; W.ux = ux; W.uy = uy; W.cause = cause; W.manual = !!manual; W.neck = 0; W.maxLen = 0; W.pullMs = 0; W.splash = 0; W.vPeak = 0; W.hurry = false;
    W.peak = manual ? manual.peak : T.rImpulse; W.strength = clamp01(W.peak - 1); W.lenMax = tailLen(P, W.strength);
    W.rb = P.wakeBulb * (0.85 + 0.3 * W.strength);
    const E = edge(body, ux, uy) - 0.3 * W.rb, x0 = body.x + ux * E, y0 = body.y + uy * E;
    for (let i = 0; i < WN; i++) {
      W.x[i] = x0 + ux * i * 0.5; W.y[i] = y0 + uy * i * 0.5;
      if (manual) { const sp = manual.speed * (0.45 + 0.15 * i); W.vx[i] = bv.vx + ux * sp; W.vy[i] = bv.vy + uy * sp; } // a still body: thrown out, pulled back
      else { W.vx[i] = P.wakeLag * bv.vx + P.wakeCarry * refVx + ux * P.wakeKick; W.vy[i] = P.wakeLag * bv.vy + P.wakeCarry * refVy + uy * P.wakeKick; }
    }
    W.id = ++D.nextId; W.born = D.clock; D.tails = (D.tails || 0) + 1; D.events++; D.lastCause = cause; D.lastSource = manual ? "manual" : "trigger";
    D.lastPrimary = D.lastPiece = D.clock; D.lastEmit = D.clock;
    shapeWake(D, P, body);
  }
  // radii of the five points: a tapering tube, thick where it leaves the body (the root sits inside it and the union turns
  // it into a broad fillet) and narrowing towards the bulb; it thins a little as it stretches (volume) but never to a
  // hairline; the neck before the bulb thins only to pinch
  function shapeWake(D, P, body) {
    const W = D.wake, rs = P.wakeStrand, grow = 0.7 + 0.3 * smooth(W.age / 25);
    const th = Math.min(1, Math.max(0.72, Math.sqrt(Math.max(1, 0.6 * W.lenMax) / Math.max(1, W.len))));
    let fade = 1;
    if (W.state === "RETRACT" || W.state === "MERGE") fade = 1 - 0.8 * smooth(W.t / P.wakeRetractMs);
    W.r[0] = rs * 1.9 * grow * fade; W.r[1] = rs * 1.45 * th * grow * fade; W.r[2] = rs * 1.08 * th * grow * fade;
    W.r[3] = (rs * 0.86 * th * (1 - W.neck) + P.wakeThreadPx * W.neck) * grow * fade;
    W.r[4] = W.state === "RETRACT" ? 0 : W.rb * (0.7 + 0.3 * smooth(W.age / 40)) * (W.state === "MERGE" ? fade : 1);
  }
  function stepWake(D, P, body, dt, maxSubstep, cap) {
    const W = D.wake; if (W.state === "IDLE") return;
    const T = D.trig, bv = D.body, dtMs = dt * 1000;
    W.t += dtMs; W.age += dtMs;
    if (W.state === "PULL" && !W.manual) { W.peak = Math.max(W.peak, T.rImpulse); W.strength = clamp01(W.peak - 1); W.lenMax = Math.max(W.lenMax, tailLen(P, W.strength)); W.rb = Math.max(W.rb, P.wakeBulb * (0.85 + 0.3 * W.strength)); }
    // the root follows where the strand actually is (it slides around the rear as the tail swings)
    { let dx = W.x[1] - body.x, dy = W.y[1] - body.y; const dl = Math.hypot(dx, dy), retracting = W.state === "RETRACT" || W.state === "MERGE";
      // (not while snapping back, nor while the strand is inside the body: there its direction means nothing)
      if (!retracting && dl > 1 && dl > 0.8 * edge(body, dx / dl, dy / dl)) { dx /= dl; dy /= dl; const kr = 1 - Math.exp(-40 * dt); // the same turning rate at 60-165 Hz
        let nx = W.ux + (dx - W.ux) * kr, ny = W.uy + (dy - W.uy) * kr; const nl = Math.hypot(nx, ny); if (nl > 1e-6) { W.ux = nx / nl; W.uy = ny / nl; } }
      const E = edge(body, W.ux, W.uy) - 0.3 * W.rb; W.ax1 = body.x + W.ux * E; W.ay1 = body.y + W.uy * E; }
    // the root moves smoothly across the substeps (a whole frame's jump at 60 Hz would slingshot the strand)
    const ax0 = W.x[0], ay0 = W.y[0], avx = (W.ax1 - ax0) / dt, avy = (W.ay1 - ay0) / dt; W.vx[0] = avx; W.vy[0] = avy;
    const retract = W.state === "RETRACT" || W.state === "MERGE", segMax0 = W.lenMax / (WN - 1);
    let segMax = segMax0; // shrinking smoothly across the substeps while snapping back
    // while pulling, the rest length keeps the tail out near its limit (the body drags it, it does not collapse into a
    // stub); snapping back, the rest length is 0 and the springs stiffen
    const w = retract ? P.wakeOmega * 2.2 : P.wakeOmega * (0.45 + 0.55 * smooth(W.age / 120)), z = P.wakeDamping, rest = retract ? 0 : P.wakeRest * segMax0;
    const n = Math.max(1, Math.ceil(dt / maxSubstep)), h = dt / n, ed = Math.exp(-P.wakeDrag * h);
    for (let s = 0; s < n; s++) {
      W.x[0] = ax0 + (W.ax1 - ax0) * (s + 1) / n; W.y[0] = ay0 + (W.ay1 - ay0) * (s + 1) / n;
      if (retract) segMax = segMax0 * (1 - smooth((W.t - dtMs + (s + 1) * h * 1000) / P.wakeRetractMs));
      for (let i = 1; i < WN; i++) {
        const dx = W.x[i] - W.x[i - 1], dy = W.y[i] - W.y[i - 1], l = Math.hypot(dx, dy); if (l < 1e-6) continue;
        const nx = dx / l, ny = dy / l, relv = (W.vx[i] - W.vx[i - 1]) * nx + (W.vy[i] - W.vy[i - 1]) * ny;
        const stiff = 1 + 60 * Math.max(0, l / Math.max(1, segMax) - 0.8) ** 2; // stiffens hard near its limit (elastic, not rubber)
        const f = (w * w * stiff * (l - rest) + 2 * z * w * relv) * h, mi = i === WN - 1 ? P.wakeBulbMass : 1;
        W.vx[i] -= nx * f / mi; W.vy[i] -= ny * f / mi;
        if (i > 1) { W.vx[i - 1] += nx * f; W.vy[i - 1] += ny * f; }
      }
      for (let i = 1; i < WN; i++) { // air drag, and no point faster than wakeMaxRel relative to the root (a whip, never a jump)
        W.vx[i] *= ed; W.vy[i] *= ed;
        const rvx = W.vx[i] - W.vx[0], rvy = W.vy[i] - W.vy[0], rv = Math.hypot(rvx, rvy);
        if (rv > P.wakeMaxRel) { W.vx[i] = W.vx[0] + rvx * P.wakeMaxRel / rv; W.vy[i] = W.vy[0] + rvy * P.wakeMaxRel / rv; }
        W.x[i] += W.vx[i] * h; W.y[i] += W.vy[i] * h;
      }
      for (let i = 1; i < WN; i++) { // the hard limit: no segment longer than its share, no point outside the body canvas
        let dx = W.x[i] - W.x[i - 1], dy = W.y[i] - W.y[i - 1], l = Math.hypot(dx, dy);
        if (l > 1.1 * segMax && l > 1e-6) { const nx = dx / l, ny = dy / l; W.x[i] = W.x[i - 1] + nx * 1.1 * segMax; W.y[i] = W.y[i - 1] + ny * 1.1 * segMax;
          const vr = (W.vx[i] - W.vx[i - 1]) * nx + (W.vy[i] - W.vy[i - 1]) * ny; if (vr > 0) { W.vx[i] -= nx * vr; W.vy[i] -= ny * vr; } }
        dx = W.x[i] - body.x; dy = W.y[i] - body.y; l = Math.hypot(dx, dy); const lim = P.wakeBound - W.r[i];
        if (l > lim) { W.x[i] = body.x + dx / l * lim; W.y[i] = body.y + dy / l * lim; }
      }
    }
    let len = 0; for (let i = 1; i < WN; i++) len += Math.hypot(W.x[i] - W.x[i - 1], W.y[i] - W.y[i - 1]);
    W.len = len; W.maxLen = Math.max(W.maxLen, len);
    const bx = W.x[WN - 1] - body.x, by = W.y[WN - 1] - body.y, bl = Math.hypot(bx, by), inside = bl < 1e-6 || bl < edge(body, bx / bl, by / bl) + 0.2 * W.rb;
    switch (W.state) {
      case "PULL":
        W.pullMs += dtMs; W.vPeak = Math.max(W.vPeak || 0, T.speed); // the pointer's speed: it brakes a frame before the body does
        if (W.age > 70 && inside) { W.state = "MERGE"; W.t = 0; D.tailMerges = (D.tailMerges || 0) + 1; } // the body caught up with its tail
        // the tail is held out for wakeHoldMs (longer for stronger swings) so the connected goo is seen, then the neck
        // forms; if the pointer brakes first (the pull is ending), the strand snaps at once instead
        else if (W.age >= P.wakeHoldMs * (1 + 0.4 * W.strength) || W.age >= P.wakeMaxPullMs) { W.state = "NECK"; W.t = 0; W.neckDur = P.wakeNeckMs; W.hurry = false; }
        else if (W.age >= P.wakeMinPullMs && T.speed < P.wakeBrake * W.vPeak) { W.state = "NECK"; W.t = 0; W.neckDur = 0.15 * P.wakeNeckMs; W.hurry = true; } // the pull ends: the strand snaps
        break;
      case "NECK":
        if (!W.hurry && T.speed < P.wakeBrake * W.vPeak) { W.hurry = true; W.neckDur = Math.min(W.neckDur, W.t + 0.15 * P.wakeNeckMs); } // braking mid-neck: snap now
        W.neck = smooth(W.t / W.neckDur);
        if (inside) { W.state = "MERGE"; W.t = 0; W.neck = 0; D.tailMerges = (D.tailMerges || 0) + 1; }
        else if (W.t >= W.neckDur) pinchWake(D, P, body, cap);
        break;
      case "RETRACT": case "MERGE":
        if (W.t >= P.wakeRetractMs) { W.state = "IDLE"; W.t = 0; D.cooldown = Math.max(D.cooldown, P.wakeCooldownMs); if (live(D) === 0) { D.burst = 0; disarm(D); } }
        break;
    }
    if (W.state !== "IDLE") shapeWake(D, P, body);
    const O = D.tailOut; O.on = W.state !== "IDLE"; O.owner = W.id; O.k = P.wakeUnion * P.wakeStrand;
    if (O.on) for (let i = 0; i < WN; i++) { O.x[i] = W.x[i]; O.y[i] = W.y[i]; O.r[i] = W.r[i]; }
  }
  // the bulb pinches off as a free piece, keeping wakeRelease of its velocity (left behind, as the approved droplet); a few
  // splash beads spray from the snapping neck, close to the tail, irregular in size and direction. Without a free slot or
  // budget, the bulb rejoins instead.
  function pinchWake(D, P, body, cap) {
    const W = D.wake, b = WN - 1, s = freeSlot(D, cap, true);
    if (!s || (!W.manual && D.tokens < 1)) { W.state = "MERGE"; W.t = 0; W.neck = 0; suppress(D, s ? "burst" : "full"); D.tailMerges = (D.tailMerges || 0) + 1; return; }
    const ex = W.x[b] - W.x[b - 1], ey = W.y[b] - W.y[b - 1], el = Math.hypot(ex, ey) || 1, ux = ex / el, uy = ey / el;
    // released like the approved droplet: it keeps a share of its velocity (wakeRelease) and is left behind, not thrown
    const rv = P.wakeRelease, bvx = rv * W.vx[b] + (1 - rv) * 0.12 * D.body.vx, bvy = rv * W.vy[b] + (1 - rv) * 0.12 * D.body.vy;
    // part of the bulb's liquid goes back with the strand: the free piece is 0.85 of it, still elongated along the strand
    freePiece(D, P, s, "bulb", W.x[b] - ux * 0.15 * W.rb, W.y[b] - uy * 0.15 * W.rb, bvx, bvy, 0.85 * W.rb, ux, uy, 0.4, P.wakeBulbLife, W);
    if (!W.manual) D.tokens -= 1;
    // splash: on average wakeSplash x (0.6 + 0.8 x strength) beads, each a seeded size and lateral throw
    const want = Math.max(0, Math.round(P.wakeSplash * (0.6 + 0.8 * W.strength) + (rand(D) - 0.5)));
    const nx = W.x[b - 1], ny = W.y[b - 1], vx = bvx, vy = bvy;
    for (let k = 0; k < want; k++) {
      const q = freeSlot(D, cap, true); if (!q || (!W.manual && D.tokens < 1)) { suppress(D, q ? "burst" : "full"); break; }
      const side = rand(D) < 0.5 ? -1 : 1, lat = side * (50 + 110 * rand(D)), back = 20 + 60 * rand(D), rr = 2.5 + 1.7 * rand(D);
      const px = -uy, py = ux, sx = vx + px * lat + ux * back * 0.3, sy = vy + py * lat + uy * back * 0.3, sl = Math.hypot(sx - vx, sy - vy) || 1;
      freePiece(D, P, q, "splash", nx + px * side * 0.6 * W.r[b - 1], ny + py * side * 0.6 * W.r[b - 1], sx, sy, rr, (sx - vx) / sl, (sy - vy) / sl, 0.35, P.gooMicroLife, W);
      if (!W.manual) D.tokens -= 1;
      W.splash++;
    }
    W.state = "RETRACT"; W.t = 0; W.neck = 1; D.pinches = (D.pinches || 0) + 1;
  }
  // a free rich-goo piece born from the wake (the bulb or a splash bead): FREE at once, its own velocity, a recoiling
  // elongation along (ux, uy), the rich-goo flight; life = the Phase 3 life for its size x gooLife x lifeScale
  function freePiece(D, P, d, kind, x, y, vx, vy, r0, ux, uy, el, lifeScale, W) {
    resetSlot(d);
    d.state = "FREE"; d.released = true; d.goo = 1; d.kind = kind; d.cause = kind; d.src = "wake"; d.x = x; d.y = y; d.vx = vx; d.vy = vy;
    d.r0 = d.r = r0; d.alpha = 1; d.ux = ux; d.uy = uy; d.el = el; d.elV = 0; d.age = 0; d.freeAt = 0; d.dragK = sizeDrag(P, r0);
    d.life = P.dropLifeMs * Math.sqrt(r0 / P.dropRadius) * P.gooLife * lifeScale; d.strength = W.strength; d.peak = W.peak; d.pid = W.id; d.manual = W.manual;
    d.id = ++D.nextId; d.born = D.clock; d.stamp = D.frame; d.attMs = D.clock - W.born;
    D.events++; D.residuals++; D.lastPiece = D.clock; D.burst++; D.recent[D.rIndex] = D.clock; D.rIndex = (D.rIndex + 1) % D.recent.length;
    D.stateLog.length = 0; D.d = d; if (D.stateLog.length < 64) D.stateLog.push("FREE");
  }
  // the trigger fired with the wake on: a new tail may start when none is out, the cooldown is over and a piece is in
  // the budget; a blocked swing keeps being watched while it lasts (as budgetRich)
  function budgetWake(D, P, body, cap, liveNow) {
    const T = D.trig;
    if (!T.pend || T.done) return;
    let why = "";
    if (tailActive(D)) why = "attached";
    else if (D.cooldown > 0) why = "cooldown";
    else if (D.tokens < 1) why = "burst";
    else if (liveNow > 0 && D.clock - D.lastPiece < 18) why = "spacing";
    if (why) { D.pendWhy = why; return; }
    T.done = true; T.latchVx = T.lastVx; T.latchVy = T.lastVy; D.pendWhy = "";
    startWake(D, P, body, causeOf(T), null);
  }
  // free goo pieces that run into the tail rejoin it (they merge, as with the body), except the wake's own fresh pieces
  function tailCatch(D, P) {
    const O = D.tailOut; if (!O.on) return;
    const own = P.spineOn > 0 ? D.spine.id : D.wake.id, young = P.spineOn > 0 ? 220 : 160;
    for (let i = 0; i < MAX; i++) {
      const f = D.slots[i]; if ((f.state !== "FREE" && f.state !== "FADING") || f.absorbed || (f.pid === own && f.age < young)) continue;
      for (let k = 1; k < WN; k++) if (O.r[k] > 0.5 && Math.hypot(f.x - O.x[k], f.y - O.y[k]) < f.r + O.r[k]) { f.absorbed = true; f.absorbT = 0; f.absR = f.r; f.absA = f.alpha; f.into = -1; D.catches = (D.catches || 0) + 1; break; }
    }
  }

  // ---------------------------------------------------------------- Phase 4.5 reference goo: the curved metaball spine
  // The user's reference (a thick lime goo cursor): one asymmetric liquid form while moving fast, a heavy rounded mass
  // leading, a narrow neck trailing back along the path it came by, a fatter terminal lobe, and beads of many sizes left
  // irregularly along that path. Motion drives it continuously (not a rare event): zero at rest and in slow or medium
  // motion, growing smoothly with speed (and a little with acceleration), shrinking when the pointer slows so the goo
  // catches up and merges. Five points, drawn by the same round-cone chain as the wake, smooth-unioned into the body:
  //   0 a bulb node just ahead of the body centre (the fuller leading mass)
  //   1 the root, behind the centre (the rear of the teardrop)
  //   2, 3 the neck   4 the terminal lobe
  // Points 1-4 are sprung (with lag, deeper points softer) towards places on a short trajectory history, at path
  // distances behind the body: the tail lies where the liquid was a moment ago, bends with the path, whips on reversals.
  // A stretched terminal sheds beads at seeded stress thresholds (irregular), sizes shrinking through a burst; a hard
  // braking pinches a larger blob off; free pieces the tail or body runs into rejoin it.
  const HN = 64;
  function createSpine() {
    return { E: 0, L: 0, on: false, id: 0, born: 0, peak: 0, strength: 0, manual: false, ePeak: 0, pinched: false,
      x: new Float64Array(WN), y: new Float64Array(WN), vx: new Float64Array(WN), vy: new Float64Array(WN), r: new Float64Array(WN), dx: 1, dy: 0,
      hx: new Float64Array(HN), hy: new Float64Array(HN), hn: 0, hi: 0, stress: 0, th: 1, burstN: 0, termK: 1, ph: new Float64Array(4), t: 0,
      mE: 0, mHold: 0, mdx: 1, mdy: 0, shed: 0, slowMs: 0, ptx: new Float64Array(WN), pty: new Float64Array(WN), fresh: true };
  }
  const spineOn = (P, cap) => P.spineOn > 0 && P.gooOn > 0 && cap > 1;
  // a point on the recent path, path distance s behind the body (a manual throw uses a straight path along its direction)
  const SP = { x: 0, y: 0 };
  function pathAt(D, body, s) {
    const S = D.spine;
    if (S.mE > 0.01) { SP.x = body.x - S.mdx * s; SP.y = body.y - S.mdy * s; return SP; }
    let px = body.x, py = body.y, left = s;
    for (let k = 0; k < S.hn; k++) {
      const j = (S.hi - 1 - k + HN) % HN, qx = S.hx[j], qy = S.hy[j], l = Math.hypot(qx - px, qy - py);
      if (l >= left && l > 1e-9) { SP.x = px + (qx - px) * left / l; SP.y = py + (qy - py) * left / l; return SP; }
      left -= l; px = qx; py = qy;
    }
    SP.x = px; SP.y = py; return SP; // the path is shorter than s: the oldest point (a tail only grows as the body travels)
  }
  const SPINE_F = [null, null, [0, 1], [0, 0.5, 1], [0, 0.3, 0.64, 1]]; // per node count: the tail points' share of the tail length, root to terminal
  function stepSpine(D, P, body, ptr, dt, maxSubstep, cap) {
    const S = D.spine, T = D.trig, bv = D.body, dtMs = dt * 1000, R = body.R;
    S.hx[S.hi] = body.x; S.hy[S.hi] = body.y; S.hi = (S.hi + 1) % HN; S.hn = Math.min(HN, S.hn + 1);
    // motion energy: speed past spineVOn (full at spineVFull), plus a little for acceleration; nothing while hovering,
    // pressing or hidden, nor for the trigger's arming time after them (the body catching up after a drag, a re-entry or
    // an ignored region is not a flick). It rises quickly and holds a while (so the goo is seen), then decays
    const v = Math.hypot(bv.vx, bv.vy), ac = clamp01(T.rAccel - 1);
    let e = ptr.allowed && T.armedMs >= P.dropArmMs ? Math.min(1, smooth((v - P.spineVOn) / Math.max(1, P.spineVFull - P.spineVOn)) * (1 + P.spineAccel * ac)) : 0;
    if (S.mE > 0.01) { e = Math.max(e, S.mE); if (S.mHold > 0) S.mHold -= dtMs; else { S.mE *= Math.exp(-dt / 0.08); if (S.mE < 0.12) S.mE = 0; } } // a manual throw: a held flick, then a stop
    S.E += (e - S.E) * (1 - Math.exp(-dtMs / (e > S.E ? P.spineRiseMs : P.spineHoldMs)));
    if (S.E < 1e-3 && e === 0) S.E = 0;
    // the tail shortens with retractMs, and once the body has been slow a moment it catches up quickly and merges (a
    // reversal passes through slow too briefly to lose its whip)
    S.slowMs = v < P.spineVOn && S.mE < 0.01 ? S.slowMs + dtMs : 0; // (a manual throw from a still body is not a stop)
    const Lt = P.spineLength * S.E * (1 - smooth((S.slowMs - 20) / 40)); S.L += (Lt - S.L) * (1 - Math.exp(-dtMs / (Lt > S.L ? 30 : v < P.spineVOn ? 0.4 * P.spineRetractMs : P.spineRetractMs)));
    if (v < P.spineVOn && e === 0) S.E *= Math.exp(-dt / 0.06); // stopped: the energy goes quickly too
    if (!S.on) {
      if (S.E < 0.05) { D.tailOut.on = false; return; } // (starts at 0.05, ends under 0.02: no flicker at the onset)
      S.on = true; S.id = ++D.nextId; S.born = D.clock; S.t = 0; S.burstN = 0; S.pinched = false; S.ePeak = 0; S.termK = 1; S.stress = 0; S.th = 0.6 + 0.8 * rand(D);
      for (let k = 0; k < 4; k++) S.ph[k] = rand(D) * 6.283;
      for (let i = 0; i < WN; i++) { S.x[i] = body.x; S.y[i] = body.y; S.vx[i] = bv.vx; S.vy[i] = bv.vy; }
      S.fresh = true;
      D.tails = (D.tails || 0) + 1; D.lastSource = S.mE > 0 ? "manual" : "motion";
    }
    S.t += dtMs; S.ePeak = Math.max(S.ePeak, S.E); S.peak = Math.max(S.peak, T.rImpulse); S.strength = S.E; // ePeak: this burst's peak (reset when the goo has nearly gone)
    // the leading direction: the body's motion (it holds its last direction while slowing)
    if (v > 60) { S.dx = bv.vx / v; S.dy = bv.vy / v; } else if (S.mE > 0.01) { S.dx = -S.mdx; S.dy = -S.mdy; }
    // g grows the whole form in from nothing; a tail still drawn out keeps its thickness while it catches up (a stubby
    // teardrop shortening into the body, never a thin stick)
    const g = smooth(Math.max(S.E, S.L / Math.max(1, P.spineLength)) / 0.2), nodes = Math.max(2, Math.min(4, Math.round(P.spineNodes)));
    // targets: the bulb ahead of the centre, the root behind it on the path, the neck and terminal further back
    const tx = D.spineTx, ty = D.spineTy;
    tx[0] = body.x + S.dx * P.spineBulbAhead * R * g; ty[0] = body.y + S.dy * P.spineBulbAhead * R * g;
    const s0 = P.spineRootBehind * R * g, FR = SPINE_F[nodes];
    for (let k = 1; k < WN; k++) { const q = pathAt(D, body, s0 + S.L * FR[Math.min(k - 1, nodes - 1)]); tx[k] = q.x; ty[k] = q.y; } // fewer nodes: the rest sit on the terminal
    // irregular silhouette: the neck and terminal sit a little to seeded, slowly drifting sides of the path (a bulge on
    // one flank, a tip that bends), small next to the radii so the form stays one smooth lens, never lobes
    const tt = S.t / 1000;
    for (let k = WN - 1; k >= 2; k--) {
      const ux = tx[k] - tx[k - 1], uy = ty[k] - ty[k - 1], ul = Math.hypot(ux, uy);
      if (ul < 1e-6) continue;
      const a = P.spineIrregular * R * g * Math.sin(tt * (1.7 + 0.6 * k) + S.ph[k - 1]) * (k === WN - 1 ? 1.3 : 1);
      tx[k] -= uy / ul * a; ty[k] += ux / ul * a;
    }
    // springs towards the targets, damped against each target's own velocity along the path (so steady motion leaves no
    // lag: the tail is as long as the path says); deeper points are softer, so in a turn the rear keeps going the old way
    S.x[0] = tx[0]; S.y[0] = ty[0];
    if (S.fresh) { S.fresh = false; for (let k = 0; k < WN; k++) { S.ptx[k] = tx[k]; S.pty[k] = ty[k]; } }
    const n = Math.max(1, Math.ceil(dt / maxSubstep)), h = dt / n, z = P.spineDamping;
    for (let k = 1; k < WN; k++) {
      let tvx = (tx[k] - S.ptx[k]) / dt, tvy = (ty[k] - S.pty[k]) / dt; const tv = Math.hypot(tvx, tvy), cap = 2 * Math.max(v, 1000);
      if (tv > cap) { tvx *= cap / tv; tvy *= cap / tv; } // a target jumping along the path (the tail lengthening) is not a velocity to chase
      S.ptx[k] = tx[k]; S.pty[k] = ty[k];
      const w = P.spineStiffness * (k === 1 ? 1.6 : 1 - P.spineLag * (k - 2) / 2);
      for (let s = 0; s < n; s++) {
        S.vx[k] += (w * w * (tx[k] - S.x[k]) - 2 * z * w * (S.vx[k] - tvx)) * h;
        S.vy[k] += (w * w * (ty[k] - S.y[k]) - 2 * z * w * (S.vy[k] - tvy)) * h;
        S.x[k] += S.vx[k] * h; S.y[k] += S.vy[k] * h;
      }
    }
    for (let k = 1; k < WN; k++) { // never torn apart (a gap would break the connected surface), never flung past 1.4x its path share, inside the body canvas
      const px = S.x[k - 1], py = S.y[k - 1], ddx = S.x[k] - px, ddy = S.y[k] - py, l = Math.hypot(ddx, ddy), lim = (k === 1 ? 1.2 * R : 1.4 * S.L * (FR[Math.min(k - 1, nodes - 1)] - FR[Math.min(k - 2, nodes - 1)]) + 6);
      if (l > lim) { S.x[k] = px + ddx / l * lim; S.y[k] = py + ddy / l * lim; }
      const bx = S.x[k] - body.x, by = S.y[k] - body.y, bl = Math.hypot(bx, by), bound = P.wakeBound - S.r[k];
      if (bl > bound) { S.x[k] = body.x + bx / bl * bound; S.y[k] = body.y + by / bl * bound; }
    }
    // radii: a fuller leading bulb, a wide root, a thin neck that wobbles a little (irregular, never periodic lobes), a
    // fatter terminal lobe that loses material when it sheds and regrows; everything grows in from nothing (g)
    S.termK += (1 - S.termK) * (1 - Math.exp(-dtMs / 90));
    const st = Math.min(1, Math.max(0.88, Math.sqrt(Math.max(1, 0.55 * P.spineLength) / Math.max(1, S.L))));
    const wob = (k) => 1 + 0.09 * Math.sin(tt * (6.1 + k) + S.ph[k]) * Math.sin(tt * (2.3 + 0.7 * k) + S.ph[(k + 1) % 4]);
    // the thickness profile "====---__--": the bulb and root, the neck narrowing gradually (spineTaper: its first point
    // sits that share of the way from the neck radius back to the root's), thinnest before the fatter terminal lobe
    const neck = R * P.spineNeck * st, rr = (j) => (j === 0 ? R * P.spineRoot : j === nodes - 1 ? R * P.spineTerminal * S.termK * wob(2)
      : (j === 1 && nodes === 4 ? neck + P.spineTaper * (R * P.spineRoot - neck) : neck) * wob(j - 1));
    S.r[0] = R * P.spineBulb * g;
    for (let k = 1; k < WN; k++) S.r[k] = rr(Math.min(k - 1, nodes - 1)) * g;
    // shedding: a stretched terminal under aggressive motion accumulates stress; at a seeded threshold it sheds a bead (at
    // most spineSplashCount - 1 per burst: the last one is kept for the pinch when the pointer brakes)
    if (S.E > P.spineShedMin && S.L > 0.65 * P.spineLength && S.burstN < P.spineSplashCount - 1) {
      S.stress += dt * P.spineShedRate * (S.E - P.spineShedMin) / (1 - P.spineShedMin) * (1 + 0.6 * ac);
      if (S.stress >= S.th) { S.stress = 0; S.th = 0.5 + 0.7 * rand(D); shedSpine(D, P, cap, Math.max(P.spineSplashMin, Math.min(P.spineSplashMax, P.spineSplashMax * (0.8 + 0.2 * rand(D)) * Math.pow(0.74, S.burstN))), 0.55); }
    }
    // a hard braking with the tail drawn out: the terminal lobe pinches off as one larger blob
    if (!S.pinched && S.ePeak > 0.75 && S.E < 0.6 * S.ePeak && S.L > 0.5 * P.spineLength && e < S.E && S.burstN < P.spineSplashCount) { S.pinched = true; shedSpine(D, P, cap, Math.max(P.spineSplashMin, Math.min(P.spineSplashMax * 1.1, S.r[4] * 0.95)), 0.3); }
    if (S.E < 0.15) { S.burstN = 0; S.pinched = false; S.ePeak = S.E; }
    // fully caught up: the approved body again, exactly (the union radius goes to 0 with g)
    if (S.E < 0.02 && S.L < 1) { S.on = false; D.tailOut.on = false; return; }
    const O = D.tailOut; O.on = true; O.k = P.spineUnion * R * g;
    for (let i = 0; i < WN; i++) { O.x[i] = S.x[i]; O.y[i] = S.y[i]; O.r[i] = Math.max(0, S.r[i]); }
  }
  // a bead from the terminal lobe: left where it was (a share spineSplashMomentum of the lobe's velocity), a little to a
  // seeded side; the lobe loses that material (termK) and regrows
  function shedSpine(D, P, cap, r0, keep) {
    const S = D.spine, q = freeSlot(D, cap, true), b = WN - 1;
    if (!q || D.tokens < 1) { suppress(D, q ? "burst" : "full"); return; }
    const ux = S.x[b] - S.x[b - 1], uy = S.y[b] - S.y[b - 1], ul = Math.hypot(ux, uy) || 1, side = rand(D) < 0.5 ? -1 : 1, lat = side * (40 + 100 * rand(D));
    const m = P.spineSplashMomentum, vx = m * S.vx[b] - uy / ul * lat, vy = m * S.vy[b] + ux / ul * lat;
    freePiece(D, P, q, S.burstN === 0 ? "bulb" : "splash", S.x[b] - uy / ul * side * 0.3 * S.r[b], S.y[b] + ux / ul * side * 0.3 * S.r[b], vx, vy, r0, ux / ul, uy / ul, 0.3, P.spineSplashLife, S);
    D.tokens -= 1; S.burstN++; S.shed++; S.termK = keep;
  }

  // Phase 4 emission budget: the trigger fired; may another piece go now? Returns nothing; starts at most one event
  function budget(D, P, body, cap, liveNow, att) {
    const T = D.trig;
    if (!T.pend || T.done) return;
    let why = "";
    const free = freeSlot(D, cap);
    if (!free) why = "full";
    else if (att) why = "attached";
    else if (liveNow === 0) { if (D.cooldown > 0) why = "cooldown"; }
    else if (D.burst >= P.poolBurst) why = "burst";
    else if (D.clock - D.lastEmit < P.poolSpacingMs * (1 + P.poolSpacingGrowth * (liveNow - 1))) why = "spacing";
    else if (T.signal < 1 + P.poolStep * liveNow) return; // not strong enough (yet): keep watching this swing
    T.done = true; T.latchVx = T.lastVx; T.latchVy = T.lastVy; // this swing is decided (its direction is remembered)
    if (why) { D.suppressed++; D.why[why]++; D.lastSuppress = why; return; }
    begin(D, P, body, causeOf(T), null, free, liveNow === 0 ? "primary" : "follow", liveNow);
  }

  // ---------------------------------------------------------------- Phase 4.5: the rich-fission scheduler
  const primaryAttached = (D) => { for (let i = 0; i < MAX; i++) { const s = D.slots[i]; if (isAttached(s.state) && classOf(s.kind) === 0) return s; } return null; };
  const attachedCount = (D) => { let n = 0; for (let i = 0; i < MAX; i++) if (isAttached(D.slots[i].state)) n++; return n; };
  const maxAtt = (P) => Math.max(1, Math.min(3, Math.round(P.gooMaxAttached || 1)));
  const unitMs = (P) => P.dropBudMs + neckTotal(P) + P.dropDetachMs; // the approved unit's attached time (124 ms)
  // a new bud must not crowd an attached one: at least 18° apart around the body
  function crowded(D, ux, uy) { for (let i = 0; i < MAX; i++) { const s = D.slots[i]; if (isAttached(s.state) && ux * s.ux + uy * s.uy > 0.951) return true; } return false; }
  function suppress(D, why) { D.suppressed++; D.why[why]++; D.lastSuppress = why; }

  // The trigger fired: may a primary-class event start now? A blocked swing keeps being watched while it lasts (the neck
  // may release, the spacing pass, a piece refill); if it ends still blocked it is counted as suppressed, by reason.
  function budgetRich(D, P, body, cap, liveNow) {
    const T = D.trig;
    if (!T.pend || T.done) return;
    const free = freeSlot(D, cap), strong = clamp01(T.rImpulse - 1); // 0 at the swing threshold, 1 at twice it
    let why = "";
    if (!free) why = "full";
    else if (primaryAttached(D) || attachedCount(D) >= maxAtt(P)) why = "attached";
    else if (liveNow === 0 && D.cooldown > 0) why = "cooldown";
    else if (D.tokens < 1) why = "burst";
    else if (liveNow > 0 && (D.clock - D.lastPrimary < P.gooSpacingMs * (1 - 0.45 * strong) || D.clock - D.lastPiece < 18)) why = "spacing"; // never two starts on one frame
    else if (liveNow > 0 && T.signal < 1 + P.gooStep * liveNow) why = "strength";
    if (why) { D.pendWhy = why; return; }
    T.done = true; T.latchVx = T.lastVx; T.latchVy = T.lastVy; D.pendWhy = "";
    begin(D, P, body, causeOf(T), null, free, liveNow === 0 ? "primary" : "follow", liveNow, true);
    D.tokens -= 1; D.lastPrimary = D.lastPiece = D.clock; D.lastSource = "trigger";
    scheduleResiduals(D, P, free);
  }
  // the residuals of a primary-class event: a secondary and a micro, each due at a seeded delay; whether each breaks off
  // is decided when due (the event's running peak swing against secSwing / microSwing), until shortly after the pinch
  function addSched(D, kind, due, dead, par, ang) {
    const S = D.sched;
    for (let i = 0; i < SCHED; i++) if (!S.on[i]) { S.on[i] = 1; S.kind[i] = kind; S.due[i] = due; S.dead[i] = dead; S.par[i] = par.slot; S.pid[i] = par.id; S.ang[i] = ang; return; }
    D.skipped++;
  }
  function scheduleResiduals(D, P, par) {
    const t0 = D.clock, u = unitMs(P), deg = Math.PI / 180;
    addSched(D, 1, t0 + P.gooSecDelayMs + (2 * rand(D) - 1) * 20, t0 + u + 20, par, par.side * P.gooSecAngleDeg * (0.95 + 0.25 * rand(D)) * deg);
    addSched(D, 2, t0 + P.gooMicroDelayMs + (2 * rand(D) - 1) * 35, t0 + u + 60, par, -par.side * P.gooMicroAngleDeg * (0.75 + 0.4 * rand(D)) * deg);
  }
  function runSchedule(D, P, body, cap) {
    const S = D.sched;
    for (let i = 0; i < SCHED; i++) {
      if (!S.on[i] || D.clock < S.due[i]) continue;
      const par = D.slots[S.par[i]], late = D.clock > S.dead[i], kind = S.kind[i];
      if (par.id !== S.pid[i] || par.state === "IDLE" || par.absorbed) { S.on[i] = 0; D.skipped++; continue; } // the parent has gone
      if (par.peak < (kind === 1 ? P.gooSecSwing : P.gooMicroSwing)) { if (late) { S.on[i] = 0; D.skipped++; } continue; } // not violent enough (yet)
      const ca = Math.cos(S.ang[i]), sa = Math.sin(S.ang[i]), ux = par.ux * ca - par.uy * sa, uy = par.ux * sa + par.uy * ca;
      const free = freeSlot(D, cap, true);
      let why = "";
      if (!free) why = "full";
      else if (attachedCount(D) >= maxAtt(P)) why = "attached";
      else if (!par.manual && D.tokens < 1) why = "burst";
      else if (D.clock - D.lastPiece < 18) why = "spacing"; // two pieces never start on the same frame
      else if (crowded(D, ux, uy)) why = "crowded";
      if (why) { if (late) { S.on[i] = 0; suppress(D, why); } continue; }
      S.on[i] = 0;
      beginResidual(D, P, body, par, free, kind === 1 ? "secondary" : "micro", ux, uy, "residual");
    }
  }
  // a secondary, micro or wake piece in slot d: the same unit, smaller and faster (secNeckMs / microNeckMs), with a share
  // of the parent's abandoned momentum; a wake piece has no parent (the rear surface itself)
  function beginResidual(D, P, body, par, d, kind, ux, uy, src) {
    resetSlot(d);
    const sec = kind === "secondary", base = par ? par.r0 : P.dropRadius * P.gooScale;
    d.ux = ux; d.uy = uy;
    if (par) { d.refVx = par.refVx; d.refVy = par.refVy; d.strength = par.strength; d.manual = par.manual; d.parent = par.slot; d.pid = par.id; d.side = par.side; d.peak = par.peak; }
    else d.strength = 0.5;
    d.r0 = sec ? Math.min(6, Math.max(3.5, P.gooSecScale * base)) : Math.min(4, Math.max(2.5, P.gooMicroScale * base * (par ? 1 : 0.85 + 0.3 * rand(D))));
    d.timeScale = Math.max(0.15, (sec ? P.gooSecNeckMs : P.gooMicroNeckMs) / unitMs(P));
    d.energy = sec ? 0.7 : 0.5; d.uf = sec ? P.gooUnion : 1;
    d.life = P.dropLifeMs * Math.sqrt(d.r0 / P.dropRadius) * P.gooLife * P.gooWakeLife * (sec ? 1 : P.gooMicroLife);
    d.launch = par ? par.launch * d.energy : 0;
    d.cause = kind; d.kind = kind; d.src = src; d.goo = 1; d.dragK = sizeDrag(P, d.r0);
    d.id = ++D.nextId; d.born = D.clock; d.stamp = D.frame;
    D.events++; D.residuals++; if (kind === "wake") D.wakes++; D.lastSource = src; D.stateLog.length = 0; D.d = d; log(D, d, "BUDDING");
    if (!d.manual) D.tokens -= 1;
    D.lastPiece = D.clock; D.burst++; D.recent[D.rIndex] = D.clock; D.rIndex = (D.rIndex + 1) % D.recent.length;
    place(D, d, P, body, 0);
  }
  // wake: while an event is hot, a strongly stretched (over 60% of the maximum stretch), fast-swinging body accumulates tail
  // stress; at a seeded threshold (0.8-1.25) the rear surface, behind the motion, sheds one micro. Stretch and swing drive
  // it: a body that keeps moving without a new swing stops shedding, and distance travelled plays no part.
  function wakeStep(D, P, body, cap, dt, allowed) {
    const T = D.trig, hot = P.gooWakeFree > 0 || D.clock - D.lastPrimary < P.gooWakeMs || !!primaryAttached(D);
    if (!(P.gooWake > 0) || !hot || !allowed) { D.stress = 0; return; }
    // stretch share over 60% of the maximum, times the swing past gooWakeSwing or the held acceleration peak past its gate
    const sx = clamp01(((body.s - 1) / Math.max(1e-3, P.maxStretch - 1) - 0.6) / 0.4), ix = Math.min(1.5, Math.max(0, (T.rImpulse - P.gooWakeSwing) / 0.6, (T.rAccel - 1) / 2));
    D.stress += dt * 6 * P.gooWake * sx * ix;
    if (D.stress < D.wakeTh) return;
    const bv = D.body, sp = Math.hypot(bv.vx, bv.vy);
    if (sp < 300) return;
    const a = (rand(D) < 0.5 ? -1 : 1) * (3 + 11 * rand(D)) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), rx = -bv.vx / sp, ry = -bv.vy / sp;
    const ux = rx * ca - ry * sa, uy = rx * sa + ry * ca, free = freeSlot(D, cap, true);
    let why = "";
    if (!free) why = "full";
    else if (attachedCount(D) >= maxAtt(P)) why = "attached";
    else if (D.tokens < 1) why = "burst";
    else if (D.clock - D.lastPiece < 35) why = "spacing";
    else if (crowded(D, ux, uy)) why = "crowded";
    if (why) { D.stress = 0.5 * D.wakeTh; suppress(D, why); return; }
    D.stress = 0; D.wakeTh = 0.8 + 0.45 * rand(D);
    beginResidual(D, P, body, null, free, "wake", ux, uy, "wake");
  }
  // the body taper (render only): while a primary-class bud is pulled out, the rear (the axis side of the bud) lengthens
  // towards gooTaper; at the pinch it springs back with a small elastic undershoot (the recoil), then is exactly 0
  function taperStep(D, P, body, dt, maxSubstep) {
    const m = primaryAttached(D);
    let tgt = 0;
    if (m && P.gooTaper > 0 && (m.state === "BUDDING" || m.state === "NECKING")) {
      const ts = m.timeScale, w = m.state === "BUDDING" ? 0.35 * smooth(m.t / (P.dropBudMs * ts)) : 0.35 + 0.65 * smooth(m.t / (neckTotal(P) * ts));
      tgt = P.gooTaper * w * (0.75 + 0.25 * m.strength);
      const ca = m.ux * body.ax + m.uy * body.ay; if (Math.abs(ca) > 0.05) D.tsg = ca > 0 ? 1 : -1;
    }
    if (tgt !== 0 || D.tp !== 0 || D.tpV !== 0) {
      const n = Math.max(1, Math.ceil(dt / maxSubstep)), h = dt / n, w = 46, z = 0.5;
      for (let i = 0; i < n; i++) { D.tpV += (w * w * (tgt - D.tp) - 2 * z * w * D.tpV) * h; D.tp += D.tpV * h; }
      D.tp = Math.max(-0.3 * P.gooTaper, Math.min(1.5 * P.gooTaper, D.tp));
      if (tgt === 0 && Math.abs(D.tp) < 5e-4 && Math.abs(D.tpV) < 5e-3) D.tp = D.tpV = 0; // 0.02 px of the rear: settled
    }
    body.tp = D.tp; body.tsg = D.tsg;
  }
  // lab-only manual primary through the scheduler (Strong / Extreme / Rich goo burst / Heavy burst): bypasses the trigger,
  // the cooldown and the piece budget, never the capacity or the neck rules; peak is its synthetic swing
  function manualPrimary(D, P, body, d, angleDeg, speed, peak) {
    begin(D, P, body, "manual", { angleDeg, speed, strength: clamp01((peak - 1) / 1.2), peak }, d, "manual", live(D) - 1, true);
    D.lastPrimary = D.lastPiece = D.clock; D.lastSource = "manual"; D.cooldown = 0;
    scheduleResiduals(D, P, d);
  }
  function runPlan(D, P, body, cap) {
    const L = D.plan;
    for (let i = 0; i < PLAN; i++) {
      if (!L.on[i] || D.clock < L.at[i]) continue;
      if (P.spineOn > 0) { const S = D.spine; L.on[i] = 0; S.mE = Math.min(1, 0.6 + 0.4 * (L.peak[i] - 1)); S.mHold = 190; S.mdx = Math.cos(L.angle[i] * Math.PI / 180); S.mdy = Math.sin(L.angle[i] * Math.PI / 180); continue; }
      if (P.wakeOn > 0) { // the connected wake: one tail at a time
        if (tailActive(D)) { if (D.clock > L.until[i]) { L.on[i] = 0; suppress(D, "attached"); } continue; }
        L.on[i] = 0; startWake(D, P, body, "manual", { angleDeg: L.angle[i], speed: L.speed[i], peak: L.peak[i] }); continue;
      }
      const free = freeSlot(D, cap, true);
      if (!free || primaryAttached(D) || attachedCount(D) >= maxAtt(P)) { if (D.clock > L.until[i]) { L.on[i] = 0; suppress(D, free ? "attached" : "full"); } continue; }
      L.on[i] = 0; manualPrimary(D, P, body, free, L.angle[i], L.speed[i], L.peak[i]);
    }
  }
  function stepRich(D, P, body, ptr, dt, maxSubstep, cap, n) {
    const T = D.trig;
    if (D.tokens < 0) D.tokens = P.gooBudget;
    D.tokens = Math.min(P.gooBudget, D.tokens + dt * 1000 / Math.max(1, P.gooRefillMs));
    const fire = stepTrigger(D, P, ptr.vx, ptr.vy, dt, ptr.allowed);
    for (let i = 0; i < MAX; i++) { const s = D.slots[i]; if (isAttached(s.state) && classOf(s.kind) === 0 && !s.manual) s.peak = Math.max(s.peak, T.rImpulse); }
    if (T.overMs === 0) { if (T.pend && !T.done) suppress(D, D.pendWhy || "strength"); T.pend = T.done = false; D.pendWhy = ""; }
    else if (T.done) { // a turn of more than 60° is a new swing (as Phase 4)
      const sp = Math.hypot(T.lastVx, T.lastVy), sl = Math.hypot(T.latchVx, T.latchVy);
      if (sp > 1 && sl > 1 && (T.lastVx * T.latchVx + T.lastVy * T.latchVy) / (sp * sl) < 0.5) T.pend = T.done = false;
    }
    if (fire) T.pend = true;
    if (T.signal > D.peakSignal) D.peakSignal = T.signal;
    if (P.spineOn > 0) { // Phase 4.5 reference goo: the curved metaball spine (motion-driven)
      runPlan(D, P, body, cap);
      stepSpine(D, P, body, ptr, dt, maxSubstep, cap);
      return;
    }
    if (P.wakeOn > 0) { // Phase 4.5 correction: connected goo first, detached pieces second
      if (P.wakeFree > 0 && !tailActive(D) && ptr.allowed && D.cooldown === 0 && Math.hypot(ptr.vx, ptr.vy) > P.wakeFree && T.armedMs >= P.dropArmMs) startWake(D, P, body, "speed", null); // boundary diagnostic only
      budgetWake(D, P, body, cap, n + (tailActive(D) ? 1 : 0));
      runPlan(D, P, body, cap);
      stepWake(D, P, body, dt, maxSubstep, cap);
      return;
    }
    taperStep(D, P, body, dt, maxSubstep); // first, so this frame's buds sit on the surface the shader draws
    budgetRich(D, P, body, cap, n);
    runPlan(D, P, body, cap);
    runSchedule(D, P, body, cap);
    wakeStep(D, P, body, cap, dt, ptr.allowed);
  }

  // one frame. body: { x, y (rendered centre, CSS px), R, s, c, ax, ay, amp, cell, nt }; ptr: pointer velocity and gates
  function step(D, P, body, ptr, dt, maxSubstep) {
    if (!(dt > 0)) return;
    const bv = D.body, dtMs = dt * 1000;
    if (Number.isNaN(bv.px)) { bv.vx = bv.vy = 0; }
    else { const kb = 1 - Math.exp(-dtMs / 24); // as long as the pointer's own smoothing: the same momentum at 60-165 Hz
      bv.vx += ((body.x - bv.px) / dt - bv.vx) * kb; bv.vy += ((body.y - bv.py) / dt - bv.vy) * kb; }
    bv.px = body.x; bv.py = body.y;
    D.clock += dtMs; D.frame++;
    const cap = capacity(P), att = attached(D);
    let n = live(D);
    if (n === 0 && D.cooldown > 0) D.cooldown = Math.max(0, D.cooldown - dtMs);
    body.tp = D.tp; body.tsg = D.tsg; // the taper this system draws: exactly 0 unless rich goo is pulling a primary out
    if (cap > 1 && P.gooOn > 0) stepRich(D, P, body, ptr, dt, maxSubstep, cap, n); // Phase 4.5 rich goo
    else if (cap <= 1) {
      // the approved Phase 3 single droplet: the trigger runs only while no droplet is alive and the cooldown is over
      const fire = stepTrigger(D, P, ptr.vx, ptr.vy, dt, ptr.allowed && n === 0 && D.cooldown === 0);
      if (n === 0) {
        if (fire) begin(D, P, body, causeOf(D.trig), null, D.slots[0], "primary", 0);
        else if (ptr.allowed && D.trig.signal >= 1 && D.cooldown > 0) D.blocked++;
        tally(D); return;
      }
    } else {
      // the pool: the trigger keeps its history whenever the pointer is sane; the budget decides each swing once
      const T = D.trig, fire = stepTrigger(D, P, ptr.vx, ptr.vy, dt, ptr.allowed);
      if (att) att.peak = Math.max(att.peak, T.rImpulse); // how violent the event's swing became (satellite eligibility; the
      // swing ratio reads the same at 60-165 Hz, where a one-frame ramp under-reads acceleration and jerk at 60 Hz)
      if (T.overMs === 0) { if (T.pend && !T.done) { D.suppressed++; D.why.strength++; D.lastSuppress = "strength"; } T.pend = T.done = false; }
      else if (T.done) { // a zigzag keeps the signal over 1 across reversals: a turn of more than 60° is a new swing
        const sp = Math.hypot(T.lastVx, T.lastVy), sl = Math.hypot(T.latchVx, T.latchVy);
        if (sp > 1 && sl > 1 && (T.lastVx * T.latchVx + T.lastVy * T.latchVy) / (sp * sl) < 0.5) T.pend = T.done = false;
      }
      if (fire) T.pend = true;
      budget(D, P, body, cap, n, att);
    }
    for (let i = 0; i < MAX; i++) { const s = D.slots[i]; if (s.state !== "IDLE" && s.stamp !== D.frame) advance(D, s, P, body, dt, maxSubstep, cap); }
    if (cap > 1) coalesce(D, P);
    tally(D);
  }
  function tally(D) { // pool statistics for the debug panel and the checks
    let n = 0, a = 0; for (let i = 0; i < MAX; i++) { const s = D.slots[i].state; if (s !== "IDLE") { n++; if (isAttached(s)) a++; } }
    D.live = n; D.attachedNow = a; if (n > D.peakLive) D.peakLive = n; D.liveSum += n; D.liveFrames++; D.liveHist[n]++;
    D.material = n + (D.tailOut.on ? 1 : 0); D.matHist[D.material]++; // pieces of liquid apart from the body (the tail counts once)
  }
  const scheduled = (D) => { let n = 0; for (let i = 0; i < SCHED; i++) n += D.sched.on[i]; for (let i = 0; i < PLAN; i++) n += D.plan.on[i]; return n; };
  function recentCount(D, ms) { let c = 0; for (let i = 0; i < D.recent.length; i++) if (D.recent[i] > 0 && D.clock - D.recent[i] <= ms) c++; return c; }

  // lab-only manual event: the real lifecycle from the current body, bypassing the trigger and the cooldown (never the
  // capacity or the one-attached rule). opts.extreme makes the event eligible for a residual satellite.
  // Phase 4.5 rich goo: the manual event goes through the scheduler (its residuals follow its synthetic swing opts.peak:
  // default 1, strong 1.3, extreme 2.05), and opts.plan [{ ms, deg, peak, speed }] queues further manual primaries (the lab's
  // Rich goo burst and Heavy burst), each started as soon as the neck rules allow.
  function trigger(D, P, body, opts) {
    const cap = capacity(P), T = D.trig;
    let d;
    if (spineOn(P, cap)) { // the reference goo: a manual throw drives the spine along a straight path (energy decays)
      let a = opts && Number.isFinite(+opts.angleDeg) ? +opts.angleDeg : NaN;
      if (!Number.isFinite(a)) { const sl = Math.hypot(T.lastVx, T.lastVy); a = sl > 40 ? Math.atan2(-T.lastVy, -T.lastVx) * 180 / Math.PI : 180 * (rand(D) * 2 - 1); }
      const S = D.spine, peak = opts && Number.isFinite(+opts.peak) ? +opts.peak : opts && opts.extreme ? 2.05 : opts && opts.strength >= 0.9 ? 1.3 : 1;
      S.mE = Math.min(1, 0.6 + 0.4 * (peak - 1)); S.mHold = 190; S.mdx = Math.cos(a * Math.PI / 180); S.mdy = Math.sin(a * Math.PI / 180); S.manual = true;
      if (opts && Array.isArray(opts.plan)) for (let k = 0, j = 0; k < opts.plan.length && j < PLAN; j++) {
        if (D.plan.on[j]) continue; const s = opts.plan[k++], L = D.plan;
        L.on[j] = 1; L.at[j] = D.clock + (+s.ms || 0) + 200; L.until[j] = L.at[j] + 400; L.angle[j] = a + (+s.deg || 0); L.peak[j] = +s.peak || 1; L.speed[j] = 0;
      }
      return true;
    }
    if (wakeOn(P, cap)) { // the connected wake: a manual tail thrown out from a still body and pulled back
      if (tailActive(D)) return false;
      body.tp = 0; body.tsg = 1;
      let a = opts && Number.isFinite(+opts.angleDeg) ? +opts.angleDeg : NaN;
      if (!Number.isFinite(a)) { const sl = Math.hypot(T.lastVx, T.lastVy); a = sl > 40 ? Math.atan2(-T.lastVy, -T.lastVx) * 180 / Math.PI : 180 * (rand(D) * 2 - 1); }
      const speed = opts && Number.isFinite(+opts.speed) ? +opts.speed : 420, peak = opts && Number.isFinite(+opts.peak) ? +opts.peak : opts && opts.extreme ? 2.05 : opts && opts.strength >= 0.9 ? 1.3 : 1;
      startWake(D, P, body, "manual", { angleDeg: a, speed: speed * P.wakeManualThrow, peak });
      if (opts && Array.isArray(opts.plan)) for (let k = 0, j = 0; k < opts.plan.length && j < PLAN; j++) {
        if (D.plan.on[j]) continue; const s = opts.plan[k++], L = D.plan;
        L.on[j] = 1; L.at[j] = D.clock + (+s.ms || 0) + 240; L.until[j] = L.at[j] + 400; L.angle[j] = a + (+s.deg || 0); L.peak[j] = +s.peak || 1; L.speed[j] = (Number.isFinite(+s.speed) ? +s.speed : speed) * P.wakeManualThrow;
      }
      D.cooldown = 0;
      return true;
    }
    if (rich(P, cap)) {
      if (primaryAttached(D) || attachedCount(D) >= maxAtt(P)) return false;
      d = freeSlot(D, cap); if (!d) return false;
      body.tp = D.tp; body.tsg = D.tsg;
      let a = opts && Number.isFinite(+opts.angleDeg) ? +opts.angleDeg : NaN;
      if (!Number.isFinite(a)) { const sl = Math.hypot(T.lastVx, T.lastVy); a = sl > 40 ? Math.atan2(-T.lastVy, -T.lastVx) * 180 / Math.PI : 180 * (rand(D) * 2 - 1); }
      const speed = opts && Number.isFinite(+opts.speed) ? +opts.speed : 420, peak = opts && Number.isFinite(+opts.peak) ? +opts.peak : opts && opts.extreme ? 2.05 : opts && opts.strength >= 0.9 ? 1.3 : 1;
      manualPrimary(D, P, body, d, a, speed, peak);
      if (opts && Array.isArray(opts.plan)) for (let k = 0, j = 0; k < opts.plan.length && j < PLAN; j++) {
        if (D.plan.on[j]) continue; const s = opts.plan[k++], L = D.plan;
        L.on[j] = 1; L.at[j] = D.clock + (+s.ms || 0); L.until[j] = L.at[j] + 220; L.angle[j] = a + (+s.deg || 0); L.peak[j] = +s.peak || 1; L.speed[j] = Number.isFinite(+s.speed) ? +s.speed : speed;
      }
      return true;
    }
    if (cap <= 1) { if (D.d.state !== "IDLE") return false; d = D.slots[0]; }
    else { if (attached(D)) return false; d = freeSlot(D, cap); if (!d) return false; }
    let a = opts && Number.isFinite(+opts.angleDeg) ? +opts.angleDeg : NaN;
    if (!Number.isFinite(a)) { const sl = Math.hypot(T.lastVx, T.lastVy); a = sl > 40 ? Math.atan2(-T.lastVy, -T.lastVx) * 180 / Math.PI : 180 * (rand(D) * 2 - 1); }
    begin(D, P, body, "manual", { angleDeg: a, speed: opts && Number.isFinite(+opts.speed) ? +opts.speed : 420, strength: opts && Number.isFinite(+opts.strength) ? +opts.strength : 0.5, extreme: !!(opts && opts.extreme) }, d, "manual", live(D) - 1);
    D.cooldown = 0;
    return true;
  }

  // ---------------------------------------------------------------- surfaces: which canvas draws each live slot
  // The attached slot (at most one) is always the body canvas (smooth union). A free bead is drawn by the body canvas
  // while it is well inside it (the Phase 3 margins, 16 px hysteresis), else by a bead tile. Beads that touch or nearly
  // touch (edge gap under joinPx) share one surface, so overlapping beads are one union and never invert twice.
  // tx, ty: the body canvas origin (CSS px); size: its CSS size; forced: "auto" | "body" | "bead" (lab diagnostic).
  function root(L, i) { while (L.root[i] !== i) i = L.root[i]; return i; }
  function layout(D, tx, ty, size, margin, forced, tilesOk, tileCss, joinPx) {
    const S = D.slots, L = D.lay;
    L.attached = -1; L.nAtt = 0; L.nBody = 0; L.nTiles = 0; L.used.fill(0); L.count.fill(0); L.taken.fill(0);
    for (let i = 0; i < MAX; i++) {
      const d = S[i]; L.root[i] = i; L.want[i] = 0;
      if (d.state === "IDLE") { d.layer = "none"; d.tile = -1; continue; }
      // attached necks (Phase 3-4: at most one; rich goo: up to three) are always drawn by the body canvas
      if (isAttached(d.state)) { if (L.attached < 0) L.attached = i; if (L.nAtt < 3) L.att[L.nAtt++] = i; d.layer = "body"; d.tile = -1; continue; }
      const ext = d.r * (1 + Math.abs(d.el)), lx = d.x - tx, ly = d.y - ty;
      let inBody;
      if (!tilesOk) inBody = true;
      else if (forced === "body" || forced === "bead") inBody = forced === "body";
      else { const m = margin + ext + 2 + (d.layer === "bead" ? 16 : 0); inBody = lx >= m && lx <= size - m && ly >= m && ly <= size - m; }
      L.want[i] = inBody ? 1 : 2; L.ext[i] = ext;
    }
    for (let i = 0; i < MAX; i++) if (L.want[i]) for (let j = i + 1; j < MAX; j++) if (L.want[j]) {
      if (Math.hypot(S[i].x - S[j].x, S[i].y - S[j].y) - L.ext[i] - L.ext[j] < joinPx) { const a = root(L, i), b = root(L, j); if (a !== b) L.root[Math.max(a, b)] = Math.min(a, b); }
    }
    for (let r = 0; r < MAX; r++) {
      if (!L.want[r] || root(L, r) !== r) continue;
      let anyTile = false, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, members = 0;
      for (let i = r; i < MAX; i++) if (L.want[i] && root(L, i) === r) {
        members++; if (L.want[i] === 2) anyTile = true;
        x0 = Math.min(x0, S[i].x - L.ext[i]); x1 = Math.max(x1, S[i].x + L.ext[i]); y0 = Math.min(y0, S[i].y - L.ext[i]); y1 = Math.max(y1, S[i].y + L.ext[i]);
      }
      const fits = x1 - x0 <= tileCss - 6 && y1 - y0 <= tileCss - 6;
      if (anyTile && (fits || members === 1)) {
        // one tile for the group: keep the tile a member already had, so a bead never hops canvases needlessly
        let t = -1;
        for (let i = r; i < MAX && t < 0; i++) if (L.want[i] && root(L, i) === r && S[i].tile >= 0 && !L.taken[S[i].tile]) t = S[i].tile;
        for (let k = 0; k < MAX && t < 0; k++) if (!L.taken[k]) t = k;
        L.taken[t] = 1; L.used[t] = 1; L.nTiles++;
        if (members === 1) { L.cx[t] = S[r].x; L.cy[t] = S[r].y; } else { L.cx[t] = (x0 + x1) / 2; L.cy[t] = (y0 + y1) / 2; }
        for (let i = r; i < MAX; i++) if (L.want[i] && root(L, i) === r) { S[i].layer = "bead"; S[i].tile = t; L.members[t * MAX + L.count[t]++] = i; }
      } else {
        for (let i = r; i < MAX; i++) if (L.want[i] && root(L, i) === r) {
          if (L.want[i] === 1 || !anyTile) { S[i].layer = "body"; S[i].tile = -1; L.body[L.nBody++] = i; }
          else { // a group too wide for one tile (a chain of beads): each takes its own tile (it may overlap briefly)
            let t = S[i].tile >= 0 && !L.taken[S[i].tile] ? S[i].tile : -1;
            for (let k = 0; k < MAX && t < 0; k++) if (!L.taken[k]) t = k;
            L.taken[t] = 1; L.used[t] = 1; L.nTiles++; L.cx[t] = S[i].x; L.cy[t] = S[i].y;
            S[i].layer = "bead"; S[i].tile = t; L.members[t * MAX + L.count[t]++] = i;
          }
        }
      }
    }
    D.layer = D.d.layer;
    return L;
  }

  // ---------------------------------------------------------------- bead tiles: small canvases for free beads away from the body
  // One shared WebGL2 context renders every tile (an OffscreenCanvas; each tile shows its frame through a bitmaprenderer
  // context, without a copy). Without OffscreenCanvas WebGL2 the shared context is a detached canvas copied into 2D tiles.
  // The bead SDF and coverage are the body shader's free-bead term, so a bead handed between canvases is pixel-identical.
  const BVS = `#version 300 es
void main() { vec2 p = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0; gl_Position = vec4(p, 0.0, 1.0); }`;
  const BFS = `#version 300 es
precision highp float;
uniform vec2 uSize; uniform vec4 uBead[5]; uniform vec3 uBeadShape[5]; uniform float uBeadK[5]; uniform float uAA;
uniform float uPlain; uniform float uPlainAlpha; uniform vec3 uPlainColor; uniform float uDebug;
out vec4 outColor;
float cover(float d) { return clamp(0.5 - d / uAA, 0.0, 1.0); }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float beadDist(vec2 q, vec3 sh, float r) {
  float s = 1.0 + sh.z, c = inversesqrt(s);
  vec2 l = vec2(dot(q, sh.xy) / s, dot(q, vec2(-sh.y, sh.x)) / c);
  float lr = length(l), g = length(vec2(l.x / s, l.y / c)) / max(lr, 1e-4);
  return (lr - r) / max(g, 1e-4);
}
void main() {
  float a = 0.0; // beads in one tile are one union: overlapping beads never invert twice
  float dc = 1e6, kc = 0.0; bool anyC = false; // Phase 4.5 cohesion: young rich-goo pieces close together, smooth-unioned
  for (int i = 0; i < 5; i++) if (uBead[i].z > 0.0) {
    float db = beadDist(gl_FragCoord.xy - uBead[i].xy, uBeadShape[i], uBead[i].z);
    a = max(a, cover(db) * uBead[i].w);
    if (uBeadK[i] > 0.0) { if (anyC) { dc = smin(dc, db, min(kc, uBeadK[i])); kc = max(kc, uBeadK[i]); } else { dc = db; kc = uBeadK[i]; anyC = true; } }
  }
  if (anyC) a = max(a, cover(dc));
  float marks = 0.0;
  if (uDebug > 0.5) { vec2 e = min(gl_FragCoord.xy, uSize - gl_FragCoord.xy); marks = cover(min(e.x, e.y) - 1.0); }
  if (uPlain > 0.5) { float al = max(a * uPlainAlpha, marks); outColor = vec4(uPlainColor * a * uPlainAlpha * (1.0 - marks) + vec3(0.08) * marks, al); }
  else { float m = abs(a - marks); outColor = vec4(vec3(m), m); }
}`;
  const BU = ["uSize", "uBead", "uBeadShape", "uBeadK", "uAA", "uPlain", "uPlainAlpha", "uPlainColor", "uDebug"];
  function createBeadTiles(cssSize, zIndex, RND) {
    const L = { ok: false, error: "", mode: "", tiles: [], canvas: null, visible: false, draws: 0, eff: 1, backing: 0, x: NaN, y: NaN, dprCap: 1 };
    const attrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power" };
    let gl = null, prog = null, vao = null, glc = null, sizeDirty = true;
    const U = {}, bead = new Float32Array(4 * MAX), shape = new Float32Array(3 * MAX), beadK = new Float32Array(MAX), SIG = 9 + 8 * MAX;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(x) || "bead shader failed"); return x; };
    function init() {
      L.ok = false;
      try {
        if (!glc) {
          if (typeof OffscreenCanvas === "function") { try { glc = new OffscreenCanvas(1, 1); gl = glc.getContext("webgl2", attrs); L.mode = "offscreen + bitmaprenderer"; } catch { gl = null; } }
          if (!gl) { glc = document.createElement("canvas"); gl = glc.getContext("webgl2", attrs); L.mode = "detached canvas + 2D copy"; }
          if (glc.addEventListener) { glc.addEventListener("webglcontextlost", (e) => { e.preventDefault(); L.ok = false; }); glc.addEventListener("webglcontextrestored", () => { init(); L.size(L.dprCap); }); }
        }
        if (!gl) { L.error = "WebGL2 context unavailable"; return; }
        prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, BVS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, BFS)); gl.linkProgram(prog);
      } catch (err) { L.error = String(err.message || err); return; }
      vao = gl.createVertexArray(); BU.forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
      gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0); L.ok = true; sizeDirty = true;
      for (const T of L.tiles) T.prev.fill(NaN);
    }
    const copy = () => L.mode.startsWith("detached");
    for (let i = 0; i < MAX; i++) { // the tiles themselves are plain DOM canvases (no WebGL context each)
      const canvas = document.createElement("canvas"), cs = canvas.style;
      canvas.className = "lc-bead"; canvas.setAttribute("aria-hidden", "true");
      cs.position = "fixed"; cs.left = "0"; cs.top = "0"; cs.width = cssSize + "px"; cs.height = cssSize + "px";
      cs.pointerEvents = "none"; cs.zIndex = String(zIndex); cs.visibility = "hidden"; cs.willChange = "transform"; cs.contain = "strict"; cs.mixBlendMode = "difference";
      document.body.appendChild(canvas);
      L.tiles.push({ canvas, cs, ctx: null, visible: false, px: NaN, py: NaN, x: NaN, y: NaN, cur: new Float32Array(SIG), prev: new Float32Array(SIG).fill(NaN), draws: 0 });
    }
    L.canvas = L.tiles[0].canvas;
    init();
    for (const T of L.tiles) T.ctx = T.canvas.getContext(copy() ? "2d" : "bitmaprenderer");
    L.size = (dprCap) => {
      L.dprCap = dprCap; const b = Math.max(1, Math.round(cssSize * dprCap));
      if (glc && glc.width !== b) { glc.width = b; glc.height = b; }
      for (const T of L.tiles) { if (T.canvas.width !== b) { T.canvas.width = b; T.canvas.height = b; } T.px = NaN; T.prev.fill(NaN); }
      L.backing = b; L.eff = b / cssSize; sizeDirty = true;
    };
    // a hidden tile gives its bitmap back (memory only while a bead is shown) and redraws in full when next used
    function hideTile(T) { if (T.visible) { T.visible = false; T.cs.visibility = "hidden"; T.prev.fill(NaN); if (!copy() && L.ok) T.ctx.transferFromImageBitmap(null); } }
    L.hide = () => { for (const T of L.tiles) hideTile(T); L.visible = false; };
    L.invalidate = () => { for (const T of L.tiles) T.prev.fill(NaN); }; // debug: force the next draw (cost measurements)
    L.finish = () => { if (gl) gl.finish(); };
    function render(T) {
      const c = T.cur;
      gl.useProgram(prog); gl.bindVertexArray(vao);
      if (sizeDirty) { sizeDirty = false; gl.viewport(0, 0, L.backing, L.backing); gl.uniform2f(U.uSize, L.backing, L.backing); gl.uniform3f(U.uPlainColor, RND.plainColor[0], RND.plainColor[1], RND.plainColor[2]); gl.uniform1f(U.uPlainAlpha, RND.plainAlpha); }
      for (let k = 0; k < MAX; k++) {
        const o = 9 + 8 * k; bead[4 * k] = c[o]; bead[4 * k + 1] = c[o + 1]; bead[4 * k + 2] = c[o + 2]; bead[4 * k + 3] = c[o + 3];
        shape[3 * k] = c[o + 4]; shape[3 * k + 1] = c[o + 5]; shape[3 * k + 2] = c[o + 6]; beadK[k] = c[o + 7];
      }
      gl.uniform4fv(U.uBead, bead); gl.uniform3fv(U.uBeadShape, shape); gl.uniform1fv(U.uBeadK, beadK); gl.uniform1f(U.uAA, c[2]); gl.uniform1f(U.uPlain, c[3]); gl.uniform1f(U.uDebug, c[4]);
      gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function present(T) {
      if (copy()) { T.ctx.clearRect(0, 0, L.backing, L.backing); T.ctx.drawImage(glc, 0, 0); }
      else T.ctx.transferFromImageBitmap(glc.transferToImageBitmap());
    }
    // draw tile t around (cx, cy) CSS px with the slots listed in lay.members; returns false when unavailable
    L.drawTile = (t, cx, cy, slots, lay, dpr, aa, plain, debug, blend) => {
      if (!L.ok) return false;
      const T = L.tiles[t], half = cssSize / 2, tx = Math.round((cx - half) * dpr) / dpr, ty = Math.round((cy - half) * dpr) / dpr, e = L.eff, c = T.cur;
      if (tx !== T.px || ty !== T.py) { T.px = tx; T.py = ty; T.cs.transform = `translate3d(${tx}px, ${ty}px, 0)`; }
      if (!T.visible) { T.visible = true; T.cs.visibility = "visible"; }
      if (T.cs.mixBlendMode !== blend) T.cs.mixBlendMode = blend;
      T.x = cx; T.y = cy;
      c.fill(0); c[0] = L.backing; c[1] = RND.plainAlpha; c[2] = aa; c[3] = plain; c[4] = debug;
      for (let k = 0; k < lay.count[t]; k++) {
        const d = slots[lay.members[t * MAX + k]], o = 9 + 8 * k;
        c[o] = (d.x - tx) * e; c[o + 1] = L.backing - (d.y - ty) * e; c[o + 2] = Math.max(1e-3, d.r) * e; c[o + 3] = d.alpha; c[o + 4] = d.ux; c[o + 5] = -d.uy; c[o + 6] = d.el; c[o + 7] = d.kc * e;
      }
      let same = !sizeDirty; for (let i = 0; same && i < SIG; i++) if (c[i] !== T.prev[i]) same = false;
      if (same) return true;
      T.prev.set(c); render(T); present(T); T.draws++; L.draws++;
      return true;
    };
    // after a frame's drawTile calls: hide the tiles nobody used
    L.endFrame = (lay) => {
      let any = false;
      for (let t = 0; t < MAX; t++) { if (lay && lay.used[t]) any = true; else hideTile(L.tiles[t]); }
      L.visible = any; L.x = L.y = NaN;
      for (let t = 0; t < MAX; t++) if (L.tiles[t].visible) { L.x = L.tiles[t].x; L.y = L.tiles[t].y; break; }
    };
    L.readMask = (t = 0) => { // debug only (allocates): redraw tile t and read it back, RGBA with the bottom row first
      const T = L.tiles[t]; if (!L.ok || !T || !T.visible) return null;
      render(T); const b = L.backing, out = new Uint8Array(b * b * 4); gl.readPixels(0, 0, b, b, gl.RGBA, gl.UNSIGNED_BYTE, out); present(T);
      return { w: b, h: b, px: out, tx: T.px, ty: T.py };
    };
    return L;
  }

  window.LiquidDroplet = { STATES, MAX, capacity, isAttached, createDropletSystem, createTrigger, step, trigger, reset, disarm, edge, surface, live, attached,
    layout, recentCount, createBeadTiles, CLASSES, classOf, rich, scheduled, attachedCount, wakeOn, spineOn, WN };
})();
