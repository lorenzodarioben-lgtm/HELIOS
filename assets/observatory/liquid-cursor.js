/* Helios Observatory · liquid cursor (production runtime).
   The visually approved "Reference goo · balanced" cursor of the liquid cursor lab (labs/liquid-cursor at 9cce8a5, approved
   by the user on 2026-10-03), transplanted into one self-contained classic script:
     - the Santioni-style primary body: exponential following, velocity deformation along a smoothed axis, a screen-space
       noise membrane that stills at rest, hover growth over interactive targets, click compression;
     - the reference goo spine: motion energy shapes a five-node, path-following metaball tail (a heavy bulb, a thick
       root, a neck narrowing along the recent path, a terminal knob), smooth-unioned into the body, that sheds a few
       residual beads under aggressive motion and catches up when the pointer stops.
   One bounded WebGL2 canvas travels with the body; free beads that drift away use small bead tiles fed by one shared
   context. Everything is a white mask composited with mix-blend-mode: difference, except over artwork: the whole
   Overview hero (one zone, its title and copy included) and the renders marked data-cursor-media elsewhere (the Render Lab
   and Correctness renders, the film strip, the loupe) show the same geometry, drawn from the same state, as clear water
   with normal compositing: a convex surface (each part of the liquid curved at its own thickness) with a Fresnel edge,
   a faint depth and two highlights, refracting what lies beneath it: a marked render's own image, and in the hero a
   reconstruction of the hero (its montage frames as drawn this frame, under a snapshot of everything laid over them,
   taken only when that overlay changes). The performance summary inside the hero stays glass; the Overview index and
   other interface regions retain difference blending, and precision controls remain native. The two presentations crossfade in
   about 100 ms and never touch the motion.
   The values and arithmetic are the lab's, verbatim, restricted to the code paths the approved preset uses (the lab's
   historical snapshots, tuning, debug drawing and manual controls are not shipped). The lab stays the visual reference
   and the regression oracle: labs/liquid-cursor/tools/verify-production.mjs compares this file with the lab preset,
   state for state and pixel for pixel. Nothing here loads anything from labs/ (or anywhere else) at runtime.

   A pure observer: pointer-events none, passive listeners, never preventDefault, never stopPropagation, no keyboard
   handling. It stays off and the native cursor stays as it is when: ?cursor=off (the kill switch), recording mode
   (?mode=recording, unless ?cursor=on), no fine pointer, prefers-reduced-motion, forced colours, no WebGL2, a shader that
   fails to compile, a lost context, or any runtime error. The native cursor is hidden only while the liquid cursor is
   running and has a pointer to follow; ignored regions (precision and native controls) always keep their native cursor.
   Classic script, inline GLSL, no fetch and no modules: file:// and http://127.0.0.1 alike. */
"use strict";
(function () {
  const VERSION = "reference-goo-balanced@9cce8a5";
  const api = { version: VERSION, active: false, reason: "not started" };
  window.HeliosLiquidCursor = api;

  // ------------------------------------------------------------------ the approved values
  // labs/liquid-cursor/config.js at 9cce8a5 with the "Reference goo · balanced" preset (the lab defaults), restricted to the
  // values these code paths read. verify-production.mjs checks every one against the lab.
  const P = Object.freeze({
    // the primary body (Santioni refined)
    followResponse: 60, radius: 34, maxStretch: 1.42, stretchSpeed: 1300, stretchCurve: 1.6, compressionExponent: 0.75, velocitySmoothingMs: 28,
    stretchResponse: 38, recoveryResponse: 36, deformDamping: 0.6, axisResponse: 28, axisMinSpeed: 40, axisFullSpeed: 300,
    baseNoise: 0.25, maxNoise: 0.7, noiseCurve: 1, noiseScale: 36, noiseSpeed: 0.3, noiseSpeedGain: 2, idleFadeMs: 1400, stillNoise: 0,
    hoverScale: 1.27, hoverResponse: 32, hoverDamping: 0.7, hoverNoiseMultiplier: 0.45, hoverDeformMultiplier: 0.6,
    clickCompression: 0.1, clickResponse: 48, releaseDamping: 0.45, presenceResponse: 22,
    // the motion history the goo reads (the lab's droplet trigger: its acceleration estimate and its arming time)
    dropAccelMs: 12, dropPeakHoldMs: 90, dropReferenceMs: 90, dropTurnGain: 1.3, dropAccel: 40000, dropArmMs: 180, dropGapJumpPx: 48,
    // residual beads: life, flight, shrink and fade, coalescence (the lab's Phase 3 unit with the rich-goo flight)
    dropRadius: 6, dropLifeMs: 560, dropDrag: 7, dropFreeShare: 0.45, dropShrinkCurve: 1.3, dropFadeCurve: 1.6, dropEndScale: 0.35, dropRecoil: 55, dropAbsorbMs: 70,
    gooBudget: 6, gooRefillMs: 160, gooDrag: 1, gooDragSize: 0.35, gooEarlyDrag: 12, gooEarlyMs: 100, gooLife: 1.12, gooJoin: 1, gooCohesion: 1.1,
    poolJoinPx: 8, poolMax: 5, wakeBound: 196,
    // the reference goo spine
    spineVOn: 1500, spineVFull: 3200, spineAccel: 0.35, spineRiseMs: 45, spineHoldMs: 120, spineRetractMs: 90, spineLength: 70, spineNodes: 4,
    spineStiffness: 34, spineDamping: 0.7, spineLag: 0.45, spineBulb: 0.9, spineBulbAhead: 0.2, spineRoot: 0.85, spineRootBehind: 1.1,
    spineNeck: 0.42, spineTaper: 0.55, spineIrregular: 0.12, spineTerminal: 0.46, spineUnion: 0.6, spineShedMin: 0.6, spineShedRate: 28,
    spineSplashCount: 5, spineSplashMin: 2.2, spineSplashMax: 6.8, spineSplashLife: 1.05, spineSplashMomentum: 0.15,
  });
  const F = Object.freeze({ velocitySmoothingMs: 24, velocityStaleMs: 30, velocityDecay: 50, gapResetMs: 120, maxDt: 0.05, maxSubstep: 1 / 240 });
  const C = Object.freeze({
    cssSize: 420, maxDpr: 3, edgeMargin: 6, beadCssSize: 64, aaWidth: 1,
    zIndex: 100, // just above the Observatory's own ladder (its top is the skip link, 99): above every page layer and overlay
    // the water over artwork: its light and shadow colours, the faint ink outline's width, the material crossfade, the
    // refraction's fade-in once a render's texture is ready, and how many render textures are kept
    mediaPearl: [0.99, 0.985, 0.975], mediaInk: [0.106, 0.118, 0.129], mediaEdgePx: 1.5, mediaFadeMs: 100, refractFadeMs: 140, refractCache: 6,
    // the hero's optical snapshot: its resolution (device px per CSS px, at most), and how soon after a change it is retaken
    heroOpticScale: 1.5, heroOpticMinMs: 400, heroSettleMs: 160, refractMaxPx: 48,
  });
  // Liquid Glass reference match: three optical review candidates (?glass=match1|target|max; target by default). The historical
  // water query remains an alias. body: the clear body's opacity; rim: the Fresnel edge light; spec and sheen: the highlights;
  // broad soft one; men: the faint depth on the side away from the light (capped, body only); edge: a faint ink outline that
  // keeps the shape legible on near-white; bend: refraction at the outline, as a fraction of the local radius; mag: the
  // body's mild lens (apparent magnification at its middle); dispersion: RGB separation along the curved refraction, scaled
  // down on thin liquid. Virtual optical scale affects sampling only. Main-body reach is candidate-specific; thin parts
  // retain an 8 CSS px cap. The global ceiling and the source's own bounds guard every channel.
  const WATER = Object.freeze({
    match1: Object.freeze({ body: 0.012, rim: 0.16, spec: 1.15, specPower: 110, sheen: 0.14, rimLine: 0.16, men: 0.14, edge: 0.05, bend: 0.48, mag: 1.10, dispersion: 0.18, opticalScale: 1.25, reach: 24 }),
    target: Object.freeze({ body: 0.012, rim: 0.18, spec: 1.25, specPower: 120, sheen: 0.16, rimLine: 0.20, men: 0.14, edge: 0.05, bend: 0.50, mag: 1.12, dispersion: 0.42, opticalScale: 1.55, reach: 32 }),
    max: Object.freeze({ body: 0.012, rim: 0.20, spec: 1.35, specPower: 130, sheen: 0.18, rimLine: 0.24, men: 0.14, edge: 0.05, bend: 0.54, mag: 1.15, dispersion: 0.52, opticalScale: 1.9, reach: 40 }),
  });
  // The Observatory's interaction map. Hover growth over things that lead somewhere; native cursor (and no goo) over
  // precision and native controls: the convergence view and its wipe handle (pointer capture, ew-resize), the Workload
  // Microscope tile canvas (crosshair inspection), the Scheduler Lab timeline (click to seek) and scrubber, form fields,
  // selects, code blocks and copy-to-clipboard paths (text selection, copy cursor).
  const SEL = Object.freeze({
    interactive: 'a[href], button:not(:disabled), summary, label, [role="button"], [role="tab"], input[type="checkbox"], input[type="radio"], tr.row, [data-bar], .rail, [data-cursor-interactive]',
    ignore: '[data-cursor-ignore], input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), select, textarea, [contenteditable]:not([contenteditable="false"]), ' +
      '.cv-view, .wipe-handle, .field canvas, .tl canvas, pre, [data-copy]',
    // real renders: the liquid keeps its shape and motion but stops inverting (a control on a render is still interface)
    media: "[data-cursor-media]",
    // the Overview hero is artwork as a whole: inside it (its render, title, copy and controls) the liquid is water throughout
    zone: '[data-cursor-media="zone"]',
    // Only the top bar inherits the hero beneath it. The nav rail/panel retain their own difference presentation.
    chrome: "#edge",
    // The numbered list's full-width links need local hover hit-testing; this does not select its material.
    index: "#sec-overview > section.index",
  });

  // ------------------------------------------------------------------ body dynamics (the lab's stepBody, verbatim)
  const FIELD_PERIOD = 64; // the membrane noise is periodic over 64 cells in time
  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-6, b - a))); return t * t * (3 - 2 * t); };
  function createBodyState() {
    return { svx: 0, svy: 0, sspeed: 0, ax: 1, ay: 0, amount: 0, def: { x: 0, v: 0 }, hov: { x: 1, v: 0 }, clk: { x: 1, v: 0 },
      hoverProgress: 0, stretch: 1, compression: 1, radiusScale: 1, noiseAmp: 0, noiseT: 0, life: 1, idle: 0, hovering: false, pressed: false };
  }
  function spring(o, target, w, z, h) { o.v += (w * w * (target - o.x) - 2 * z * w * o.v) * h; o.x += o.v * h; }
  function resetMotion(B) { B.svx = B.svy = B.sspeed = 0; B.amount = 0; B.def.x = B.def.v = 0; B.stretch = B.compression = 1; }
  // inp: { vx, vy (raw velocity, CSS px/s), hover, pressed }; dt in seconds
  function stepBody(B, maxSubstep, inp, dt) {
    if (!(dt > 0)) return;
    const kv = 1 - Math.exp(-dt * 1000 / Math.max(1, P.velocitySmoothingMs)); // second velocity stage, smoothed as a vector
    B.svx += (inp.vx - B.svx) * kv; B.svy += (inp.vy - B.svy) * kv;
    B.sspeed = Math.hypot(B.svx, B.svy);
    if (B.sspeed > P.axisMinSpeed) { // the stretch axis is a line: it turns the short way and holds still when direction is noise
      let dx = B.svx / B.sspeed, dy = B.svy / B.sspeed;
      if (dx * B.ax + dy * B.ay < 0) { dx = -dx; dy = -dy; }
      const ka = 1 - Math.exp(-P.axisResponse * smoothstep(P.axisMinSpeed, P.axisFullSpeed, B.sspeed) * dt);
      const nx = B.ax + (dx - B.ax) * ka, ny = B.ay + (dy - B.ay) * ka, nl = Math.hypot(nx, ny);
      if (nl > 1e-6) { B.ax = nx / nl; B.ay = ny / nl; }
    }
    B.amount = 1 - Math.exp(-Math.pow(B.sspeed / Math.max(1, P.stretchSpeed), P.stretchCurve)); // flat when slow, saturating when fast
    const changed = inp.hover !== B.hovering || inp.pressed !== B.pressed;
    B.hovering = inp.hover; B.pressed = inp.pressed;
    const hoverTarget = inp.hover ? P.hoverScale : 1, clickTarget = inp.pressed ? 1 - P.clickCompression : 1;
    const wDef = B.amount > B.def.x ? P.stretchResponse : P.recoveryResponse, zClick = inp.pressed ? 1 : P.releaseDamping;
    const n = Math.max(1, Math.ceil(dt / maxSubstep)), h = dt / n;
    for (let i = 0; i < n; i++) {
      spring(B.def, B.amount, wDef, P.deformDamping, h);
      spring(B.hov, hoverTarget, P.hoverResponse, P.hoverDamping, h);
      spring(B.clk, clickTarget, P.clickResponse, zClick, h);
    }
    B.hoverProgress += ((inp.hover ? 1 : 0) - B.hoverProgress) * (1 - Math.exp(-P.hoverResponse * 0.6 * dt));
    const calm = 1 + (P.hoverDeformMultiplier - 1) * B.hoverProgress;
    const m = B.def.x * calm;
    B.stretch = Math.min(P.maxStretch, Math.max(0.92, 1 + (P.maxStretch - 1) * m));
    B.compression = Math.pow(B.stretch, -P.compressionExponent);
    B.radiusScale = B.hov.x * B.clk.x;
    const mm = Math.min(1, Math.abs(m));
    // membrane life: alive while anything moves, then it stills (no idle pulsing, no idle redraws)
    const busy = changed || B.sspeed > 5 || Math.abs(B.def.x) > 0.004 || Math.abs(B.def.v) > 0.02 || Math.abs(B.hov.v) > 0.01 || Math.abs(B.clk.v) > 0.01;
    B.idle = busy ? 0 : B.idle + dt;
    B.life += ((B.idle * 1000 < P.idleFadeMs ? 1 : 0) - B.life) * (1 - Math.exp(-4 * dt));
    if (B.life < 0.002) B.life = 0;
    const rest = P.baseNoise * (P.stillNoise + (1 - P.stillNoise) * B.life);
    B.noiseAmp = (rest + (P.maxNoise - P.baseNoise) * Math.pow(mm, P.noiseCurve)) * (1 + (P.hoverNoiseMultiplier - 1) * B.hoverProgress);
    if (B.noiseAmp < 1e-6) B.noiseAmp = 0;
    B.noiseT += dt * P.noiseSpeed * B.life * (1 + P.noiseSpeedGain * mm);
    if (B.noiseT >= FIELD_PERIOD) B.noiseT -= FIELD_PERIOD;
  }

  // ------------------------------------------------------------------ the goo (the lab's droplet system, spine path only)
  // It READS the body's rendered position and shape and the pointer velocity, and never writes to them.
  const MAX = 5, WN = 5, HN = 64;
  const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  // one bead slot; resetSlot writes it back in place (no allocation per piece)
  const SLOT = Object.freeze({ state: "IDLE", t: 0, age: 0, life: 0, x: 0, y: 0, vx: 0, vy: 0, r: 0, r0: 0, alpha: 0, ux: 1, uy: 0, el: 0, elV: 0, kind: "",
    id: 0, pid: 0, stamp: -1, endFrame: -1, absorbed: false, absorbT: 0, absR: 0, absA: 0, into: -1, ox: 0, oy: 0, g0: 0, g1: 0, growT: 0,
    freeAt: -1, kc: 0, dragK: 1, layer: "none", tile: -1 });
  function resetSlot(d) { for (const k in SLOT) d[k] = SLOT[k]; return d; }
  function createGoo() {
    const slots = []; for (let i = 0; i < MAX; i++) { const s = resetSlot({ slot: i }); slots.push(s); }
    return {
      trig: { armedMs: 0, primed: false, lastVx: 0, lastVy: 0, since: 0, ax: 0, ay: 0, accel: 0, aPeak: 0, aAge: 0, rvx: 0, rvy: 0, turnDeg: 0, rAccel: 0 },
      slots, body: { vx: 0, vy: 0, px: NaN, py: NaN }, seed: 0x2f6b1d3, clock: 0, frame: 0, nextId: 0, tokens: -1,
      lay: { nBody: 0, body: new Int8Array(MAX), root: new Int8Array(MAX), want: new Int8Array(MAX), ext: new Float64Array(MAX),
        nTiles: 0, used: new Uint8Array(MAX), cx: new Float64Array(MAX), cy: new Float64Array(MAX), count: new Uint8Array(MAX), members: new Int8Array(MAX * MAX), taken: new Uint8Array(MAX) },
      spine: { E: 0, L: 0, on: false, id: 0, ePeak: 0, pinched: false, x: new Float64Array(WN), y: new Float64Array(WN), vx: new Float64Array(WN), vy: new Float64Array(WN),
        r: new Float64Array(WN), dx: 1, dy: 0, hx: new Float64Array(HN), hy: new Float64Array(HN), hn: 0, hi: 0, stress: 0, th: 1, burstN: 0, termK: 1,
        ph: new Float64Array(4), t: 0, shed: 0, slowMs: 0, ptx: new Float64Array(WN), pty: new Float64Array(WN), fresh: true },
      tx: new Float64Array(WN), ty: new Float64Array(WN),
      // the one tail the renderer draws (on false: none)
      tailOut: { on: false, k: 0, x: new Float64Array(WN), y: new Float64Array(WN), r: new Float64Array(WN) },
    };
  }
  // deterministic xorshift32 in [0, 1): the same pointer motion gives the same goo
  function rand(D) { let s = D.seed; s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; D.seed = s; return s / 4294967296; }
  // forget the motion history (browser artifacts must never read as a flick)
  function disarm(D) {
    const T = D.trig;
    T.armedMs = 0; T.primed = false; T.ax = T.ay = T.accel = T.aPeak = T.aAge = 0; T.since = 0; T.turnDeg = 0; T.rAccel = 0; T.rvx = T.lastVx; T.rvy = T.lastVy;
  }
  // end every piece and the tail at once (the body hid or reappeared) and forget the motion history
  function reset(D) {
    for (let i = 0; i < MAX; i++) resetSlot(D.slots[i]);
    D.body.px = NaN;
    D.spine.on = false; D.spine.E = D.spine.L = 0; D.spine.hn = 0; D.tailOut.on = false;
    D.tokens = -1;
    disarm(D);
  }
  function live(D) { let n = 0; for (let i = 0; i < MAX; i++) if (D.slots[i].state !== "IDLE") n++; return n; }
  // fresh: skip a slot whose piece finished this very frame, so a slot is always seen free for a frame before reuse
  function freeSlot(D, fresh) { for (let i = 0; i < MAX; i++) { const s = D.slots[i]; if (s.state === "IDLE" && !(fresh && s.endFrame === D.frame)) return s; } return null; }
  // the pointer's motion history: its acceleration (held peak, eased past a turn) and how long it has been clean
  function stepTrigger(D, vx, vy, dt, allowed) {
    const T = D.trig, dtMs = dt * 1000;
    T.since += dt; // derivatives only when the velocity actually changes (frames without a sample are not spikes)
    if (vx !== T.lastVx || vy !== T.lastVy) {
      const h = Math.max(T.since, 1e-4);
      if (T.primed) { const ka = 1 - Math.exp(-h * 1000 / P.dropAccelMs); T.ax += ((vx - T.lastVx) / h - T.ax) * ka; T.ay += ((vy - T.lastVy) / h - T.ay) * ka; }
      T.primed = true; T.lastVx = vx; T.lastVy = vy; T.since = 0;
    }
    T.accel = Math.hypot(T.ax, T.ay);
    const kr0 = Math.exp(-dtMs / 20);
    if (T.accel >= T.aPeak) { T.aPeak = T.accel; T.aAge = 0; } else if ((T.aAge += dtMs) > P.dropPeakHoldMs) T.aPeak *= kr0;
    const kr = 1 - Math.exp(-dtMs / P.dropReferenceMs); // lagged reference velocity
    T.rvx += (vx - T.rvx) * kr; T.rvy += (vy - T.rvy) * kr;
    const sp = Math.hypot(vx, vy), rs = Math.hypot(T.rvx, T.rvy);
    T.turnDeg = sp > 1 && rs > 1 ? Math.acos(Math.max(-1, Math.min(1, (vx * T.rvx + vy * T.rvy) / (sp * rs)))) * 180 / Math.PI : 0;
    const tf = 1 + (P.dropTurnGain - 1) * clamp01((T.turnDeg - 30) / 60);
    T.rAccel = T.aPeak * tf / P.dropAccel;
    if (allowed) T.armedMs += dtMs; else T.armedMs = 0;
  }
  // boundary distance of the body's noise-free ellipse from its centre in direction (ux, uy); CSS px
  function edge(body, ux, uy) {
    const ca = ux * body.ax + uy * body.ay, sa = -ux * body.ay + uy * body.ax, a = body.R * body.s, b = body.R * body.c;
    return 1 / Math.sqrt((ca / a) * (ca / a) + (sa / b) * (sa / b));
  }
  // larger pieces keep their momentum longer, smaller ones slow sooner (bounded 0.75-1.5 x)
  const sizeDrag = (r0) => Math.min(1.5, Math.max(0.75, Math.pow(P.dropRadius / Math.max(1, r0), P.gooDragSize)));
  // free flight: exact exponential drag over equal substeps plus an early cohesion drag that fades over gooEarlyMs
  function flyGoo(d, dt, maxSubstep) {
    const n = Math.max(1, Math.ceil(dt / maxSubstep)), h = dt / n, base = P.dropDrag * P.gooDrag * d.dragK;
    for (let i = 0; i < n; i++) {
      const age = d.age + (i + 0.5) * h * 1000, lam = Math.max(1e-3, base + P.gooEarlyDrag * Math.max(0, 1 - age / Math.max(1, P.gooEarlyMs)));
      const e = Math.exp(-lam * h), f = (1 - e) / lam;
      d.x += d.vx * f; d.y += d.vy * f; d.vx *= e; d.vy *= e;
    }
  }
  // cohesion radius (CSS px) of a young free piece: in over 35 ms, held to 70 ms, gone by 130 ms, while fully opaque
  const cohesion = (d) => {
    if (!(P.gooCohesion > 0) || d.freeAt < 0 || d.absorbed || d.alpha < 0.999) return 0;
    const t = d.age - d.freeAt;
    return P.gooCohesion * d.r0 * (t < 35 ? smooth(t / 35) : t < 70 ? 1 : 1 - smooth((t - 70) / 60));
  };
  // one free piece's frame: flight, shape recoil, growth while taking in a smaller piece, coalescence into the body,
  // shrink and fade; returns its life fraction
  function fly(d, dt, maxSubstep, body) {
    flyGoo(d, dt, maxSubstep);
    { const dx = d.x - body.x, dy = d.y - body.y, dl = Math.hypot(dx, dy), E = dl > 1e-6 ? edge(body, dx / dl, dy / dl) : 0;
      if (!d.absorbed && (dl < 1e-6 || dl < E + 0.25 * d.r)) { d.absorbed = true; d.absorbT = 0; d.absR = d.r; d.absA = d.alpha; d.into = -1; } }
    const n = Math.max(1, Math.ceil(dt / maxSubstep)), h = dt / n, w = P.dropRecoil, z = 0.35;
    for (let i = 0; i < n; i++) { d.elV += (-w * w * d.el - 2 * z * w * d.elV) * h; d.el += d.elV * h; }
    d.age += dt * 1000;
    if (d.g1 > 0) { d.growT += dt * 1000; d.r0 = d.g0 + (d.g1 - d.g0) * smooth(d.growT / P.dropAbsorbMs); if (d.growT >= P.dropAbsorbMs) d.g1 = 0; }
    if (d.absorbed) {
      d.absorbT += dt * 1000; const q = smooth(d.absorbT / P.dropAbsorbMs);
      d.r = d.absR * (1 - 0.6 * q); d.alpha = d.absA * (1 - q); d.kc = 0;
      return d.absorbT >= P.dropAbsorbMs ? 1 : Math.max(P.dropFreeShare, d.age / d.life);
    }
    const u = d.age / d.life, us = clamp01((u - 0.2) / 0.8), uf = clamp01((u - P.dropFreeShare) / (1 - P.dropFreeShare));
    d.r = d.r0 * (1 - (1 - P.dropEndScale) * Math.pow(us, P.dropShrinkCurve));
    if (d.kind === "splash") d.r *= 0.35 + 0.65 * smooth(d.age / 45); // a splash bead grows out of the knob (no pop)
    d.alpha = 1 - Math.pow(uf, P.dropFadeCurve);
    d.kc = cohesion(d);
    return u;
  }
  function advance(D, d, body, dt, maxSubstep) {
    d.t += dt * 1000;
    if (d.state === "FREE") { if (fly(d, dt, maxSubstep, body) >= P.dropFreeShare) { d.state = "FADING"; d.t = 0; } }
    else if (d.state === "FADING" && (fly(d, dt, maxSubstep, body) >= 1 || d.alpha <= 0.002)) {
      resetSlot(d); d.endFrame = D.frame;
      if (live(D) === 0 && !D.spine.on) disarm(D); // the burst is over
    }
  }
  // overlapping free beads merge: the smaller (or, equal, the younger) flows into the other within absorbMs while the
  // other gains its area smoothly (at most +25% in radius); free beads the tail runs into rejoin it
  function coalesce(D) {
    const S = D.slots, jf = P.gooJoin;
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
      }
    }
    const O = D.tailOut;
    if (O.on) for (let i = 0; i < MAX; i++) { // the tail catches free pieces (except its own fresh ones)
      const f = S[i]; if ((f.state !== "FREE" && f.state !== "FADING") || f.absorbed || (f.pid === D.spine.id && f.age < 220)) continue;
      for (let k = 1; k < WN; k++) if (O.r[k] > 0.5 && Math.hypot(f.x - O.x[k], f.y - O.y[k]) < f.r + O.r[k]) { f.absorbed = true; f.absorbT = 0; f.absR = f.r; f.absA = f.alpha; f.into = -1; break; }
    }
    for (let i = 0; i < MAX; i++) { // an absorbed bead closes on the bead taking it in
      const s = S[i]; if (!s.absorbed || s.into < 0) continue;
      const t = S[s.into]; if (t.state !== "FREE" && t.state !== "FADING") { s.into = -1; continue; }
      const q = 1 - smooth(s.absorbT / P.dropAbsorbMs); s.x = t.x + s.ox * q; s.y = t.y + s.oy * q;
    }
  }
  // a residual bead from the terminal knob: FREE at once, its own velocity, a recoiling elongation along (ux, uy)
  function freePiece(D, d, kind, x, y, vx, vy, r0, ux, uy, el, lifeScale) {
    resetSlot(d);
    d.state = "FREE"; d.kind = kind; d.x = x; d.y = y; d.vx = vx; d.vy = vy; d.r0 = d.r = r0; d.alpha = 1; d.ux = ux; d.uy = uy; d.el = el; d.elV = 0;
    d.age = 0; d.freeAt = 0; d.dragK = sizeDrag(r0); d.life = P.dropLifeMs * Math.sqrt(r0 / P.dropRadius) * P.gooLife * lifeScale;
    d.pid = D.spine.id; d.id = ++D.nextId; d.stamp = D.frame;
  }

  // The reference goo spine. Motion drives it continuously: zero at rest and in slow or medium motion, growing with
  // speed (and a little with acceleration), shrinking when the pointer slows so the goo catches up and merges. Five
  // points: 0 a bulb just ahead of the body centre, 1 the root behind it, 2-3 the neck, 4 the terminal knob. Points 1-4
  // are sprung (deeper points softer) towards places on a short trajectory history at path distances behind the body,
  // so the tail lies where the liquid was a moment ago, bends with the path and whips on reversals.
  const SP = { x: 0, y: 0 };
  function pathAt(D, body, s) { // a point on the recent path, path distance s behind the body
    const S = D.spine;
    let px = body.x, py = body.y, left = s;
    for (let k = 0; k < S.hn; k++) {
      const j = (S.hi - 1 - k + HN) % HN, qx = S.hx[j], qy = S.hy[j], l = Math.hypot(qx - px, qy - py);
      if (l >= left && l > 1e-9) { SP.x = px + (qx - px) * left / l; SP.y = py + (qy - py) * left / l; return SP; }
      left -= l; px = qx; py = qy;
    }
    SP.x = px; SP.y = py; return SP;
  }
  const SPINE_F = [null, null, [0, 1], [0, 0.5, 1], [0, 0.3, 0.64, 1]]; // per node count: the tail points' share of the tail length
  function stepSpine(D, body, ptr, dt, maxSubstep) {
    const S = D.spine, T = D.trig, bv = D.body, dtMs = dt * 1000, R = body.R;
    S.hx[S.hi] = body.x; S.hy[S.hi] = body.y; S.hi = (S.hi + 1) % HN; S.hn = Math.min(HN, S.hn + 1);
    // motion energy: speed past spineVOn (full at spineVFull), plus a little for acceleration; nothing while hovering,
    // pressing or hidden, nor for the arming time after them. It rises quickly and holds a while, then decays
    const v = Math.hypot(bv.vx, bv.vy), ac = clamp01(T.rAccel - 1);
    const e = ptr.allowed && T.armedMs >= P.dropArmMs ? Math.min(1, smooth((v - P.spineVOn) / Math.max(1, P.spineVFull - P.spineVOn)) * (1 + P.spineAccel * ac)) : 0;
    S.E += (e - S.E) * (1 - Math.exp(-dtMs / (e > S.E ? P.spineRiseMs : P.spineHoldMs)));
    if (S.E < 1e-3 && e === 0) S.E = 0;
    // the tail shortens with retractMs, and once the body has been slow a moment it catches up quickly and merges
    S.slowMs = v < P.spineVOn ? S.slowMs + dtMs : 0;
    const Lt = P.spineLength * S.E * (1 - smooth((S.slowMs - 20) / 40)); S.L += (Lt - S.L) * (1 - Math.exp(-dtMs / (Lt > S.L ? 30 : v < P.spineVOn ? 0.4 * P.spineRetractMs : P.spineRetractMs)));
    if (v < P.spineVOn && e === 0) S.E *= Math.exp(-dt / 0.06);
    if (!S.on) {
      if (S.E < 0.05) { D.tailOut.on = false; return; } // starts at 0.05, ends under 0.02: no flicker at the onset
      S.on = true; S.id = ++D.nextId; S.t = 0; S.burstN = 0; S.pinched = false; S.ePeak = 0; S.termK = 1; S.stress = 0; S.th = 0.6 + 0.8 * rand(D);
      for (let k = 0; k < 4; k++) S.ph[k] = rand(D) * 6.283;
      for (let i = 0; i < WN; i++) { S.x[i] = body.x; S.y[i] = body.y; S.vx[i] = bv.vx; S.vy[i] = bv.vy; }
      S.fresh = true;
    }
    S.t += dtMs; S.ePeak = Math.max(S.ePeak, S.E);
    if (v > 60) { S.dx = bv.vx / v; S.dy = bv.vy / v; } // the leading direction (held while slowing)
    // g grows the whole form in from nothing; a tail still drawn out keeps its thickness while it catches up
    const g = smooth(Math.max(S.E, S.L / Math.max(1, P.spineLength)) / 0.2), nodes = Math.max(2, Math.min(4, Math.round(P.spineNodes)));
    const tx = D.tx, ty = D.ty;
    tx[0] = body.x + S.dx * P.spineBulbAhead * R * g; ty[0] = body.y + S.dy * P.spineBulbAhead * R * g;
    const s0 = P.spineRootBehind * R * g, FR = SPINE_F[nodes];
    for (let k = 1; k < WN; k++) { const q = pathAt(D, body, s0 + S.L * FR[Math.min(k - 1, nodes - 1)]); tx[k] = q.x; ty[k] = q.y; }
    // irregular silhouette: the neck and knob sit a little to seeded, slowly drifting sides of the path
    const tt = S.t / 1000;
    for (let k = WN - 1; k >= 2; k--) {
      const ux = tx[k] - tx[k - 1], uy = ty[k] - ty[k - 1], ul = Math.hypot(ux, uy);
      if (ul < 1e-6) continue;
      const a = P.spineIrregular * R * g * Math.sin(tt * (1.7 + 0.6 * k) + S.ph[k - 1]) * (k === WN - 1 ? 1.3 : 1);
      tx[k] -= uy / ul * a; ty[k] += ux / ul * a;
    }
    // springs towards the targets, damped against each target's own velocity along the path (no steady lag)
    S.x[0] = tx[0]; S.y[0] = ty[0];
    if (S.fresh) { S.fresh = false; for (let k = 0; k < WN; k++) { S.ptx[k] = tx[k]; S.pty[k] = ty[k]; } }
    const n = Math.max(1, Math.ceil(dt / maxSubstep)), h = dt / n, z = P.spineDamping;
    for (let k = 1; k < WN; k++) {
      let tvx = (tx[k] - S.ptx[k]) / dt, tvy = (ty[k] - S.pty[k]) / dt; const tv = Math.hypot(tvx, tvy), cap = 2 * Math.max(v, 1000);
      if (tv > cap) { tvx *= cap / tv; tvy *= cap / tv; } // a target jumping along the path is not a velocity to chase
      S.ptx[k] = tx[k]; S.pty[k] = ty[k];
      const w = P.spineStiffness * (k === 1 ? 1.6 : 1 - P.spineLag * (k - 2) / 2);
      for (let s = 0; s < n; s++) {
        S.vx[k] += (w * w * (tx[k] - S.x[k]) - 2 * z * w * (S.vx[k] - tvx)) * h;
        S.vy[k] += (w * w * (ty[k] - S.y[k]) - 2 * z * w * (S.vy[k] - tvy)) * h;
        S.x[k] += S.vx[k] * h; S.y[k] += S.vy[k] * h;
      }
    }
    for (let k = 1; k < WN; k++) { // never torn apart, never flung past 1.4x its path share, inside the body canvas
      const px = S.x[k - 1], py = S.y[k - 1], ddx = S.x[k] - px, ddy = S.y[k] - py, l = Math.hypot(ddx, ddy), lim = (k === 1 ? 1.2 * R : 1.4 * S.L * (FR[Math.min(k - 1, nodes - 1)] - FR[Math.min(k - 2, nodes - 1)]) + 6);
      if (l > lim) { S.x[k] = px + ddx / l * lim; S.y[k] = py + ddy / l * lim; }
      const bx = S.x[k] - body.x, by = S.y[k] - body.y, bl = Math.hypot(bx, by), bound = P.wakeBound - S.r[k];
      if (bl > bound) { S.x[k] = body.x + bx / bl * bound; S.y[k] = body.y + by / bl * bound; }
    }
    // radii: the profile "====---__--" (bulb and root, a gradually narrowing neck, a fatter knob that loses material when
    // it sheds and regrows), wobbling a little, irregularly; everything grows in from nothing (g)
    S.termK += (1 - S.termK) * (1 - Math.exp(-dtMs / 90));
    const st = Math.min(1, Math.max(0.88, Math.sqrt(Math.max(1, 0.55 * P.spineLength) / Math.max(1, S.L))));
    const wob = (k) => 1 + 0.09 * Math.sin(tt * (6.1 + k) + S.ph[k]) * Math.sin(tt * (2.3 + 0.7 * k) + S.ph[(k + 1) % 4]);
    const neck = R * P.spineNeck * st, rr = (j) => (j === 0 ? R * P.spineRoot : j === nodes - 1 ? R * P.spineTerminal * S.termK * wob(2)
      : (j === 1 && nodes === 4 ? neck + P.spineTaper * (R * P.spineRoot - neck) : neck) * wob(j - 1));
    S.r[0] = R * P.spineBulb * g;
    for (let k = 1; k < WN; k++) S.r[k] = rr(Math.min(k - 1, nodes - 1)) * g;
    // shedding: a stretched knob under aggressive motion accumulates stress; at a seeded threshold it sheds a bead (at most
    // spineSplashCount - 1 per burst: the last one is kept for the pinch when the pointer brakes)
    if (S.E > P.spineShedMin && S.L > 0.65 * P.spineLength && S.burstN < P.spineSplashCount - 1) {
      S.stress += dt * P.spineShedRate * (S.E - P.spineShedMin) / (1 - P.spineShedMin) * (1 + 0.6 * ac);
      if (S.stress >= S.th) { S.stress = 0; S.th = 0.5 + 0.7 * rand(D); shedSpine(D, Math.max(P.spineSplashMin, Math.min(P.spineSplashMax, P.spineSplashMax * (0.8 + 0.2 * rand(D)) * Math.pow(0.74, S.burstN))), 0.55); }
    }
    // a hard braking with the tail drawn out: the knob pinches off as one larger blob
    if (!S.pinched && S.ePeak > 0.75 && S.E < 0.6 * S.ePeak && S.L > 0.5 * P.spineLength && e < S.E && S.burstN < P.spineSplashCount) { S.pinched = true; shedSpine(D, Math.max(P.spineSplashMin, Math.min(P.spineSplashMax * 1.1, S.r[4] * 0.95)), 0.3); }
    if (S.E < 0.15) { S.burstN = 0; S.pinched = false; S.ePeak = S.E; }
    if (S.E < 0.02 && S.L < 1) { S.on = false; D.tailOut.on = false; return; } // caught up: the approved body again, exactly
    const O = D.tailOut; O.on = true; O.k = P.spineUnion * R * g;
    for (let i = 0; i < WN; i++) { O.x[i] = S.x[i]; O.y[i] = S.y[i]; O.r[i] = Math.max(0, S.r[i]); }
  }
  // a bead from the knob: left where it was (spineSplashMomentum of the knob's velocity), a little to a seeded side; the
  // knob loses that material (termK) and regrows
  function shedSpine(D, r0, keep) {
    const S = D.spine, q = freeSlot(D, true), b = WN - 1;
    if (!q || D.tokens < 1) return;
    const ux = S.x[b] - S.x[b - 1], uy = S.y[b] - S.y[b - 1], ul = Math.hypot(ux, uy) || 1, side = rand(D) < 0.5 ? -1 : 1, lat = side * (40 + 100 * rand(D));
    const m = P.spineSplashMomentum, vx = m * S.vx[b] - uy / ul * lat, vy = m * S.vy[b] + ux / ul * lat;
    freePiece(D, q, S.burstN === 0 ? "bulb" : "splash", S.x[b] - uy / ul * side * 0.3 * S.r[b], S.y[b] + ux / ul * side * 0.3 * S.r[b], vx, vy, r0, ux / ul, uy / ul, 0.3, P.spineSplashLife);
    D.tokens -= 1; S.burstN++; S.shed++; S.termK = keep;
  }
  // one frame. body: { x, y (rendered centre, CSS px), R, s, c, ax, ay }; ptr: { vx, vy (pointer velocity), allowed }
  function step(D, body, ptr, dt, maxSubstep) {
    if (!(dt > 0)) return;
    const bv = D.body, dtMs = dt * 1000;
    if (Number.isNaN(bv.px)) { bv.vx = bv.vy = 0; }
    else { const kb = 1 - Math.exp(-dtMs / 24); bv.vx += ((body.x - bv.px) / dt - bv.vx) * kb; bv.vy += ((body.y - bv.py) / dt - bv.vy) * kb; } // the body's rendered velocity
    bv.px = body.x; bv.py = body.y;
    D.clock += dtMs; D.frame++;
    if (D.tokens < 0) D.tokens = P.gooBudget; // the piece budget refills one piece per gooRefillMs
    D.tokens = Math.min(P.gooBudget, D.tokens + dt * 1000 / Math.max(1, P.gooRefillMs));
    stepTrigger(D, ptr.vx, ptr.vy, dt, ptr.allowed);
    stepSpine(D, body, ptr, dt, maxSubstep);
    for (let i = 0; i < MAX; i++) { const s = D.slots[i]; if (s.state !== "IDLE" && s.stamp !== D.frame) advance(D, s, body, dt, maxSubstep); }
    coalesce(D);
  }
  // Which canvas draws each live bead: the body canvas while it is well inside it (16 px hysteresis), else a bead tile.
  // Beads that touch or nearly touch (edge gap under poolJoinPx) share one surface, so they never invert twice.
  function rootOf(L, i) { while (L.root[i] !== i) i = L.root[i]; return i; }
  function layout(D, tx, ty, size, margin, tilesOk, tileCss, joinPx) {
    const S = D.slots, L = D.lay;
    L.nBody = 0; L.nTiles = 0; L.used.fill(0); L.count.fill(0); L.taken.fill(0);
    for (let i = 0; i < MAX; i++) {
      const d = S[i]; L.root[i] = i; L.want[i] = 0;
      if (d.state === "IDLE") { d.layer = "none"; d.tile = -1; continue; }
      const ext = d.r * (1 + Math.abs(d.el)), lx = d.x - tx, ly = d.y - ty;
      let inBody;
      if (!tilesOk) inBody = true;
      else { const m = margin + ext + 2 + (d.layer === "bead" ? 16 : 0); inBody = lx >= m && lx <= size - m && ly >= m && ly <= size - m; }
      L.want[i] = inBody ? 1 : 2; L.ext[i] = ext;
    }
    for (let i = 0; i < MAX; i++) if (L.want[i]) for (let j = i + 1; j < MAX; j++) if (L.want[j]) {
      if (Math.hypot(S[i].x - S[j].x, S[i].y - S[j].y) - L.ext[i] - L.ext[j] < joinPx) { const a = rootOf(L, i), b = rootOf(L, j); if (a !== b) L.root[Math.max(a, b)] = Math.min(a, b); }
    }
    for (let r = 0; r < MAX; r++) {
      if (!L.want[r] || rootOf(L, r) !== r) continue;
      let anyTile = false, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, members = 0;
      for (let i = r; i < MAX; i++) if (L.want[i] && rootOf(L, i) === r) {
        members++; if (L.want[i] === 2) anyTile = true;
        x0 = Math.min(x0, S[i].x - L.ext[i]); x1 = Math.max(x1, S[i].x + L.ext[i]); y0 = Math.min(y0, S[i].y - L.ext[i]); y1 = Math.max(y1, S[i].y + L.ext[i]);
      }
      const fits = x1 - x0 <= tileCss - 6 && y1 - y0 <= tileCss - 6;
      if (anyTile && (fits || members === 1)) { // one tile for the group (keep the tile a member already had)
        let t = -1;
        for (let i = r; i < MAX && t < 0; i++) if (L.want[i] && rootOf(L, i) === r && S[i].tile >= 0 && !L.taken[S[i].tile]) t = S[i].tile;
        for (let k = 0; k < MAX && t < 0; k++) if (!L.taken[k]) t = k;
        L.taken[t] = 1; L.used[t] = 1; L.nTiles++;
        if (members === 1) { L.cx[t] = S[r].x; L.cy[t] = S[r].y; } else { L.cx[t] = (x0 + x1) / 2; L.cy[t] = (y0 + y1) / 2; }
        for (let i = r; i < MAX; i++) if (L.want[i] && rootOf(L, i) === r) { S[i].layer = "bead"; S[i].tile = t; L.members[t * MAX + L.count[t]++] = i; }
      } else {
        for (let i = r; i < MAX; i++) if (L.want[i] && rootOf(L, i) === r) {
          if (L.want[i] === 1 || !anyTile) { S[i].layer = "body"; S[i].tile = -1; L.body[L.nBody++] = i; }
          else { // a group too wide for one tile: each takes its own tile
            let t = S[i].tile >= 0 && !L.taken[S[i].tile] ? S[i].tile : -1;
            for (let k = 0; k < MAX && t < 0; k++) if (!L.taken[k]) t = k;
            L.taken[t] = 1; L.used[t] = 1; L.nTiles++; L.cx[t] = S[i].x; L.cy[t] = S[i].y;
            S[i].layer = "bead"; S[i].tile = t; L.members[t * MAX + L.count[t]++] = i;
          }
        }
      }
    }
    return L;
  }
  // the pure core, for the lab's equivalence tools (they run it in Node without a page)
  api.core = { P, F, createBodyState, stepBody, createGoo, step, reset, disarm, layout, live };

  // The rest needs a page. Off before anything is created: the kill switch, and recording mode (an author tool for
  // screen capture: its automated captures and the recorded video keep the native cursor) unless ?cursor=on.
  if (typeof document === "undefined" || !document.body) { api.reason = "no document"; return; }
  const QS = new URLSearchParams(location.search), SW = (QS.get("cursor") || "").toLowerCase(), TEST = SW === "test";
  const WQ = (QS.get("glass") || QS.get("water") || "").toLowerCase(), WATER_NAME = Object.prototype.hasOwnProperty.call(WATER, WQ) ? WQ : "target";
  let WM = WATER[WATER_NAME]; // (?cursor=test can override it for diagnostics)
  if (SW === "off") { api.reason = "switched off (?cursor=off)"; return; }
  if (QS.get("mode") === "recording" && SW !== "on" && !TEST) { api.reason = "recording mode"; return; }

  // ------------------------------------------------------------------ shaders (the lab's, restricted to what this preset draws)
  const VS = `#version 300 es
void main() {
  vec2 p = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  gl_Position = vec4(p, 0.0, 1.0);
}`;
  // All lengths are device pixels in GL window space (origin bottom-left, y up).
  const FS = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uSize;        // backing store size
uniform vec2 uCenter;      // body centre
uniform vec2 uAxis;        // unit stretch axis
uniform float uStretch;    // longitudinal scale s
uniform float uCompress;   // across-axis scale c = s^-exponent
uniform float uRadius;     // isotropic radius: base x hover x click
uniform float uNoiseAmp;   // peak membrane displacement
uniform float uCell;       // membrane feature size
uniform float uNoiseT;     // membrane time coordinate, periodic over [0, 64)
uniform vec4 uBead[5];     // free beads drawn in this canvas (hard union, own opacity): xy centre, z radius, w opacity; z = 0: unused
uniform vec3 uBeadShape[5];// xy unit elongation axis, z elongation
uniform float uBeadK[5];   // cohesion radius of a young bead; 0: hard union
uniform vec4 uWake[5];     // the goo tail, bulb to knob: xy centre, z radius
uniform float uWakeK;      // its smooth-union radius with the body; 0: no tail (the body alone)
uniform float uAlpha;      // presence fade
uniform float uAA;
out vec4 outColor;

float cover(float d) { return clamp(0.5 - d / uAA, 0.0, 1.0); } // signed distance -> pixel coverage

// screen-space 3D gradient noise (x, y in screen space, z = time), periodic in z over 64 cells. Lattice hash: pcg3d
// (Jarzynski & Olano, "Hash Functions for GPU Rendering", JCGT 2020).
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
float corner(ivec3 i, ivec3 o, vec3 f) {
  ivec3 c = i + o;
  uvec3 h = pcg3d(uvec3(uint(c.x + 4096), uint(c.y + 4096), uint(c.z & 63)));
  vec3 g = vec3(h >> 8u) * (2.0 / 16777215.0) - 1.0;
  return dot(g, f - vec3(o));
}
float gnoise(vec3 q) {
  vec3 fl = floor(q), f = q - fl;
  ivec3 i = ivec3(fl);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = mix(corner(i, ivec3(0, 0, 0), f), corner(i, ivec3(1, 0, 0), f), u.x);
  float b = mix(corner(i, ivec3(0, 1, 0), f), corner(i, ivec3(1, 1, 0), f), u.x);
  float c = mix(corner(i, ivec3(0, 0, 1), f), corner(i, ivec3(1, 0, 1), f), u.x);
  float d = mix(corner(i, ivec3(0, 1, 1), f), corner(i, ivec3(1, 1, 1), f), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}
float field(vec2 p) {
  vec2 q = mat2(0.8, 0.6, -0.6, 0.8) * p / uCell; // a fixed rotation keeps lattice axes off the screen axes
  float x = clamp(2.2 * gnoise(vec3(q, uNoiseT)), -1.0, 1.0);
  return x * (1.5 - 0.5 * x * x);
}
// a bead: an ellipse elongated along an axis (area-neutral), first-order distance in screen px
float beadDist(vec2 q, vec3 sh, float r) {
  float s = 1.0 + sh.z, c = inversesqrt(s);
  vec2 l = vec2(dot(q, sh.xy) / s, dot(q, vec2(-sh.y, sh.x)) / c);
  float lr = length(l), g = length(vec2(l.x / s, l.y / c)) / max(lr, 1e-4);
  return (lr - r) / max(g, 1e-4);
}
// polynomial smooth minimum: bridges two surfaces while their gap is under k / 2, with a smooth hourglass neck
float smin(float a, float b, float k) {
  if (k <= 0.0) return min(a, b);
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
// exact distance to a round cone (a capsule whose radius goes from ra at a to rb at b): one tail segment
float roundCone(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 ba = b - a; float h = length(ba);
  if (h <= abs(ra - rb) + 1e-3) return min(length(p - a) - ra, length(p - b) - rb);
  vec2 d = ba / h, q = vec2(abs(dot(p - a, vec2(-d.y, d.x))), dot(p - a, d));
  float sb = (ra - rb) / h, ca = sqrt(1.0 - sb * sb), k = dot(q, vec2(-sb, ca));
  if (k < 0.0) return length(q) - ra;
  if (k > ca * h) return length(q - vec2(0.0, h)) - rb;
  return dot(q, vec2(ca, sb)) - ra;
}

void main() {
  vec2 p = gl_FragCoord.xy - uCenter;
  vec2 perp = vec2(-uAxis.y, uAxis.x);
  vec2 l = vec2(dot(p, uAxis) / uStretch, dot(p, perp) / uCompress);
  float lr = length(l);
  float gl = length(vec2(l.x / uStretch, l.y / uCompress)) / max(lr, 1e-4); // gradient length of lr: local value -> screen distance
  gl = max(gl, 1e-4);
  float d0 = (lr - uRadius) / gl; // noise-free ellipse distance, screen px
  float n = 0.0;
  if (abs(d0) < uNoiseAmp + 2.0 * uAA + 1.0) n = field(p); // the membrane only matters near the edge
  float dist = d0 - uNoiseAmp * n;
  float body = cover(dist);
  float drop = 0.0;
  bool anyDrop = false;
  if (uWakeK > 0.0) { // the goo tail: one surface with the body, joints softened, a knob at the end
    float dt = 1e6;
    for (int i = 0; i < 4; i++) if (uWake[i + 1].z > 0.0) {
      float s = roundCone(gl_FragCoord.xy, uWake[i].xy, uWake[i + 1].xy, uWake[i].z, uWake[i + 1].z);
      dt = i == 0 ? s : smin(dt, s, 0.5 * min(uWake[i].z, uWake[i + 1].z));
    }
    dist = smin(dist, dt, uWakeK); body = cover(dist); anyDrop = true;
  }
  float dc = 1e6, kc = 0.0; bool anyC = false;
  for (int i = 0; i < 5; i++) if (uBead[i].z > 0.0) {
    float db = beadDist(gl_FragCoord.xy - uBead[i].xy, uBeadShape[i], uBead[i].z);
    anyDrop = true; drop = max(drop, cover(db) * uBead[i].w);
    if (uBeadK[i] > 0.0) { if (anyC) { dc = smin(dc, db, min(kc, uBeadK[i])); kc = max(kc, uBeadK[i]); } else { dc = db; kc = uBeadK[i]; anyC = true; } }
  }
  if (anyC) drop = max(drop, cover(dc)); // a brief metaball pull between young pieces
  float m = anyDrop ? max(body * uAlpha, drop) : body * uAlpha; // white mask for mix-blend-mode: difference
  outColor = vec4(vec3(m), m); // premultiplied
}`;
  const UNIFORMS = ["uSize", "uCenter", "uAxis", "uStretch", "uCompress", "uRadius", "uNoiseAmp", "uCell", "uNoiseT", "uBead", "uBeadShape", "uBeadK", "uWake", "uWakeK", "uAlpha", "uAA"];
  // The water variants are derived from these sources by exact substitutions, so the geometry (and the difference shaders,
  // used as they are) cannot drift apart: the same coverage, written out as water instead of a white mask.
  const MEDIA_UNIFORMS = ["uCoupled", "uBody", "uRim", "uSpec", "uSpecPower", "uSheen", "uRimLine", "uMen", "uEdge", "uEdgeW", "uDome", "uPearl", "uInk"];
  const REFRACT_UNIFORMS = ["uRefract", "uBend", "uMag", "uDispersion", "uOpticalScale", "uReach", "uOrg", "uEff", "uBox", "uMap", "uImg", "uOpA", "uOver", "uHeroBg", "uImgB", "uMapB", "uOpB", "uOverTex", "uOverMap"];
  const MEDIA_DECL = `uniform float uCoupled;   // presentation only: reuse the body's approved deformation
uniform float uBody;      // the clear body's opacity (a breath of white)
uniform float uRim;       // the Fresnel edge light
uniform float uSpec;      // the small sharp highlight
uniform float uSpecPower;
uniform float uSheen;     // the broad soft highlight
uniform float uRimLine;   // directional glint on the curved coverage edge, never a coloured outline
uniform float uMen;       // the faint depth on the side away from the light
uniform float uEdge;      // a faint ink outline (legibility on near-white)
uniform float uEdgeW;     // its width, device px
uniform float uDome;      // the dome's radius, device px (the body's)
uniform vec3 uPearl;      // the light's colour
uniform vec3 uInk;        // the shadow's colour (the Observatory's ink)
out vec4 outColor;
vec4 over(vec4 top, vec4 bottom) { return top + bottom * (1.0 - top.a); } // premultiplied
// water over what shows through (col): N the dome normal, g the outward direction, d the distance to the outline (px), W the
// local radius (px)
vec4 water(vec4 col, vec3 N, vec2 g, float d, float W) {
  vec3 L = normalize(vec3(-0.35, 0.55, 0.75)), H = normalize(L + vec3(0.0, 0.0, 1.0)); // light from the upper left
  float lit = dot(g, normalize(L.xy)), tilt = max(1.0 - N.z, 0.0); // (rounding can put N.z a hair above 1: pow() of a negative is NaN)
  col = over(vec4(uPearl * uBody, uBody), col);                          // the clear body
  float rim = pow(tilt, 2.5) * (0.55 + 0.45 * max(lit, 0.0)) * uRim;
  col = over(vec4(uPearl * rim, rim), col);                              // the outline catches the light (Fresnel)
  // a faint depth on the far side of the body (capped; it fades out on strands and beads, and never stacks with the outline:
  // together the two darkened a pale page into a smear behind fast motion), and a faint ink outline for near-white
  float depth = min(pow(tilt, 2.0) * max(-lit, 0.0) * uMen * smoothstep(0.35, 0.7, W / uDome), 0.05);
  float ink = max(depth, (1.0 - smoothstep(0.0, uEdgeW, -d)) * uEdge);
  col = over(vec4(uInk * ink, ink), col);
  // one small sharp highlight (on the body's crown only: a strand or a bead is too thin to hold a clean glint) and one
  // broad soft one
  float nh = max(dot(N, H), 0.0), sp = min(1.0, pow(nh, uSpecPower) * uSpec * smoothstep(0.35, 0.6, -d / uDome) + pow(nh, 18.0) * uSheen);
  col = over(vec4(vec3(sp), sp), col);
  float line = exp(-pow(d / max(uEdgeW * 1.4, 0.1), 2.0)) * pow(tilt, 0.75) * (0.25 + 0.75 * max(lit, 0.0)) * uRimLine * smoothstep(0.15, 0.6, W / uDome);
  return over(vec4(vec3(line), line), col);
}`;
  const REFRACT_DECL = `
uniform float uRefract;   // refraction presence (0: nothing to refract)
uniform float uBend;      // refraction at the outline, as a fraction of the local radius
uniform float uMag;       // the body's mild lens (apparent magnification at its middle)
uniform float uDispersion; // channel separation, concentrated on the curved outer surface
uniform float uOpticalScale; // virtual optical thickness: no effect on coverage or simulation radius
uniform float uReach;     // maximum legal displacement of every channel, device px
uniform vec2 uOrg;        // this canvas's top left, CSS px
uniform float uEff;       // device px per CSS px
uniform vec4 uBox;        // where the source is valid, CSS px (x0, y0, x1, y1)
uniform vec4 uMap;        // image A's whole box, CSS px (x, y, w, h)
uniform sampler2D uImg;   // image A: the render, or the hero frame drawn on top
uniform float uOpA;       // its opacity (the hero's montage crossfade)
uniform float uOver;      // 1: the hero (its colour, frames A and B, then its overlay); 0: a render alone
uniform vec3 uHeroBg;     // the hero's own colour, under its frames
uniform sampler2D uImgB;  // image B: the hero frame below (during a crossfade)
uniform vec4 uMapB;
uniform float uOpB;
uniform sampler2D uOverTex; // the hero's overlay (scrim, title, copy, evidence, top bar), premultiplied
uniform vec4 uOverMap;    // its box, CSS px
// Each channel samples the same reconstructed source, with its own bounded position. Alpha is composited before channels
// are separated, so transparent text edges cannot introduce black or leak colour beyond the liquid mask.
vec3 sourceAt(vec2 f) {
  vec2 co = uOrg + vec2(f.x, uSize.y - f.y) / uEff;
  co = clamp(co, uBox.xy + 0.5, uBox.zw - 0.5);
  vec3 sc = texture(uImg, clamp((co - uMap.xy) / uMap.zw, 0.0, 1.0)).rgb;
  if (uOver > 0.0) {
    vec3 base = uHeroBg;
    if (uOpB > 0.0) base = mix(base, texture(uImgB, clamp((co - uMapB.xy) / uMapB.zw, 0.0, 1.0)).rgb, uOpB);
    sc = mix(base, sc, uOpA);
    vec4 o = texture(uOverTex, clamp((co - uOverMap.xy) / uOverMap.zw, 0.0, 1.0));
    sc = o.rgb + sc * (1.0 - o.a);
  }
  return sc;
}
vec2 boundedOffset(vec2 v, float reach) { return v * min(1.0, reach / max(length(v), 1e-4)); }`;
  // the beads' surface (both shaders) and the whole liquid's, without the membrane noise (it moves the outline by under a
  // pixel): what the water's dome is built on
  const BEADS_AT = `float beadsAt(vec2 f) {
  float d = 1e6, dc = 1e6, kc = 0.0; bool anyC = false;
  for (int i = 0; i < 5; i++) if (uBead[i].z > 0.0) {
    float db = beadDist(f - uBead[i].xy, uBeadShape[i], uBead[i].z); d = min(d, db);
    if (uBeadK[i] > 0.0) { if (anyC) { dc = smin(dc, db, min(kc, uBeadK[i])); kc = max(kc, uBeadK[i]); } else { dc = db; kc = uBeadK[i]; anyC = true; } }
  }
  return anyC ? min(d, dc) : d;
}`;
  // the local radius of the liquid: the body's (across its narrow axis), a tail segment's, a bead's, blended between parts
  const BEADS_R = `float beadsR(vec2 f, inout float sw) {
  float sr = 0.0;
  for (int i = 0; i < 5; i++) if (uBead[i].z > 0.0) { float dd = max(length(f - uBead[i].xy) - uBead[i].z, 0.0), w = 1.0 / (1.0 + dd * dd * 0.0625); sw += w; sr += w * uBead[i].z; }
  return sr;
}`;
  const SHAPE_AT = `${BEADS_AT}
${BEADS_R}
float localR(vec2 f) {
  vec2 p = f - uCenter, perp = vec2(-uAxis.y, uAxis.x);
  vec2 l = vec2(dot(p, uAxis) / uStretch, dot(p, perp) / uCompress);
  float lr = length(l), gr = max(length(vec2(l.x / uStretch, l.y / uCompress)) / max(lr, 1e-4), 1e-4);
  float dd = max((lr - uRadius) / gr, 0.0), sw = 1.0 / (1.0 + dd * dd * 0.0625), sr = sw * uRadius * min(uStretch, uCompress);
  if (uWakeK > 0.0) for (int i = 0; i < 4; i++) if (uWake[i + 1].z > 0.0) {
    vec2 a = uWake[i].xy, ba = uWake[i + 1].xy - a; float t = clamp(dot(f - a, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
    float r = mix(uWake[i].z, uWake[i + 1].z, t), de = max(length(f - a - ba * t) - r, 0.0), w = 1.0 / (1.0 + de * de * 0.0625);
    sw += w; sr += w * r;
  }
  sr += beadsR(f, sw);
  return sr / sw;
}
float shapeAt(vec2 f) {
  vec2 p = f - uCenter, perp = vec2(-uAxis.y, uAxis.x);
  vec2 l = vec2(dot(p, uAxis) / uStretch, dot(p, perp) / uCompress);
  float lr = length(l), gr = max(length(vec2(l.x / uStretch, l.y / uCompress)) / max(lr, 1e-4), 1e-4);
  float d = (lr - uRadius) / gr;
  if (uWakeK > 0.0) {
    float dt = 1e6;
    for (int i = 0; i < 4; i++) if (uWake[i + 1].z > 0.0) {
      float s = roundCone(f, uWake[i].xy, uWake[i + 1].xy, uWake[i].z, uWake[i + 1].z);
      dt = i == 0 ? s : smin(dt, s, 0.5 * min(uWake[i].z, uWake[i + 1].z));
    }
    d = smin(d, dt, uWakeK);
  }
  return min(d, beadsAt(f));
}`;
  // a dome over the surface, each part curved at its own thickness (W): steep at the outline, level along its crown, so a
  // strand levels off along its centre line instead of creasing there. The normal comes from the noise-free distance field
  // (a stencil scaled to the part); where that field's gradient still collapses the surface levels off, and its height
  // never reaches zero (no undefined normal at a thin outline)
  const DOME = `if (m <= 0.0) { outColor = vec4(0.0); return; }
  vec2 f = gl_FragCoord.xy;
  float d = shapeAt(f), W = clamp(localR(f), 1.0, uDome), st = clamp(W * 0.25, 1.0, 3.0);
  vec2 g = vec2(shapeAt(f + vec2(st, 0.0)) - shapeAt(f - vec2(st, 0.0)), shapeAt(f + vec2(0.0, st)) - shapeAt(f - vec2(0.0, st))) / (2.0 * st);
  float crest = smoothstep(0.3, 0.9, length(g));
  g /= max(length(g), 1e-4);
  float r01 = clamp(1.0 + d / W, 0.0, 1.0), h = sqrt(1.0 - r01 * r01);
  vec3 N = normalize(vec3(g * r01 * crest, max(h * 1.15, 0.05)));
  vec4 col = vec4(0.0);`;
  // The legacy dome divides an anisotropic screen-space distance by the body's *minor* radius. Under stretch that
  // flattens the long-axis crown and reduces its optical power in every direction. Evaluate the body crown in its
  // normalized liquid coordinates instead, then transform its gradient back by the inverse deformation. The existing
  // union SDF remains authoritative at the tail/root boundary. Rest, coverage, simulation and free beads are untouched.
  const BODY_DOME = `if (uCoupled > 0.5 && abs(uStretch - 1.0) + abs(uCompress - 1.0) > 0.001) {
    vec2 p = f - uCenter, perpendicular = vec2(-uAxis.y, uAxis.x);
    vec2 local = vec2(dot(p, uAxis) / uStretch, dot(p, perpendicular) / uCompress);
    float lr = length(local), gradient = max(length(vec2(local.x / uStretch, local.y / uCompress)) / max(lr, 1e-4), 1e-4);
    float bodyDistance = (lr - uRadius) / gradient;
    float bodyShare = 1.0 - smoothstep(0.0, max(uWakeK, 1.0), max(bodyDistance - d, 0.0));
    float bodyR = clamp(lr / max(uRadius, 1.0), 0.0, 1.0);
    vec2 bodySlope = (uAxis * local.x / uStretch + perpendicular * local.y / uCompress) / max(uRadius, 1.0);
    vec2 slope = mix(g * r01 * crest, bodySlope, bodyShare);
    r01 = mix(r01, bodyR, bodyShare); h = sqrt(max(1.0 - r01 * r01, 0.0));
    N = normalize(vec3(slope, max(h * 1.15, 0.05)));
    g = slope / max(length(slope), 1e-4);
    W = mix(W, min(uRadius, uDome), bodyShare);
  }`;
  // what lies beneath, displaced the way a convex drop bends it: little at the crown, more over the curve, most near the rim
  // (scaled by the part's own radius: a strand or a bead bends less), plus the body's mild lens. Sampled only where the
  // source is valid (clamped inside it, never outside an image); the hero is rebuilt from its colour, its frames and its
  // overlay. Where the displacement is negligible the page itself shows through
  const REFRACT = `if (uRefract > 0.0) {
    float thickness = mix(0.25, 1.0, smoothstep(0.15, 1.0, W / uDome));
    float full = smoothstep(0.25, 0.75, W / uDome), scale = mix(1.0, uOpticalScale, full), reach = mix(min(8.0 * uEff, uReach), uReach, full);
    vec2 bend = -N.xy * r01 * pow(1.0 - h, 0.35) * uBend * W * thickness * scale;
    vec2 pb = f - uCenter, lb = vec2(dot(pb, uAxis) / uStretch, dot(pb, vec2(-uAxis.y, uAxis.x)) / uCompress);
    vec2 lens = -pb * (1.0 - 1.0 / uMag) * (1.0 - smoothstep(0.9, 1.4, length(lb) / uRadius));
    float spread = uDispersion * smoothstep(0.25, 0.9, r01) * pow(r01, 0.7) * thickness;
    vec2 off = boundedOffset(lens + bend, reach), red = boundedOffset(lens + bend * (1.0 + spread), reach), blue = boundedOffset(lens + bend * (1.0 - spread), reach);
    vec2 c = uOrg + vec2(f.x, uSize.y - f.y) / uEff;
    float inBox = step(uBox.x, c.x) * step(c.x, uBox.z) * step(uBox.y, c.y) * step(c.y, uBox.w);
    vec3 sc = vec3(sourceAt(f + red).r, sourceAt(f + off).g, sourceAt(f + blue).b);
    float ra = smoothstep(0.05, 0.6, length(off)) * inBox * uRefract;
    col = vec4(sc * ra, ra);
  }`;
  function variant(src, pairs) { // null when a substitution no longer matches (the media layer then stays off)
    for (const [a, b] of pairs) { if (src.split(a).length !== 2) return null; src = src.replace(a, b); }
    return src;
  }
  const FS_MEDIA = variant(FS, [
    ["out vec4 outColor;", MEDIA_DECL + REFRACT_DECL],
    ["void main() {", `${SHAPE_AT}\nvoid main() {`],
    [`float m = anyDrop ? max(body * uAlpha, drop) : body * uAlpha; // white mask for mix-blend-mode: difference
  outColor = vec4(vec3(m), m); // premultiplied`, `float m = anyDrop ? max(body * uAlpha, drop) : body * uAlpha;
  if (m <= 0.0) { outColor = vec4(0.0); return; } // exactly transparent: no dome, dispersion or source samples needed
  ${DOME}
  ${BODY_DOME}
  ${REFRACT}
  outColor = water(col, N, g, d, W) * m;`],
  ]);

  // ------------------------------------------------------------------ bead tiles (the lab's, without its diagnostic modes)
  // One shared WebGL2 context renders every tile (an OffscreenCanvas; each tile shows its frame through a bitmaprenderer
  // context). Without OffscreenCanvas WebGL2 the shared context is a detached canvas copied into 2D tiles. The bead SDF
  // and coverage are the body shader's, so a bead handed between canvases is pixel-identical.
  const BVS = VS;
  const BFS = `#version 300 es
precision highp float;
uniform vec2 uSize; uniform vec4 uBead[5]; uniform vec3 uBeadShape[5]; uniform float uBeadK[5]; uniform float uAA;
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
  float dc = 1e6, kc = 0.0; bool anyC = false;
  for (int i = 0; i < 5; i++) if (uBead[i].z > 0.0) {
    float db = beadDist(gl_FragCoord.xy - uBead[i].xy, uBeadShape[i], uBead[i].z);
    a = max(a, cover(db) * uBead[i].w);
    if (uBeadK[i] > 0.0) { if (anyC) { dc = smin(dc, db, min(kc, uBeadK[i])); kc = max(kc, uBeadK[i]); } else { dc = db; kc = uBeadK[i]; anyC = true; } }
  }
  if (anyC) a = max(a, cover(dc));
  outColor = vec4(vec3(a), a);
}`;
  const BU = ["uSize", "uBead", "uBeadShape", "uBeadK", "uAA"];
  const BFS_MEDIA = variant(BFS, [ // the water on free beads (no refraction: they are a few pixels across)
    ["out vec4 outColor;", MEDIA_DECL],
    ["void main() {", `${BEADS_AT}\n${BEADS_R}\nfloat shapeAt(vec2 f) { return beadsAt(f); }\nfloat localR(vec2 f) { float sw = 1e-6; float sr = beadsR(f, sw); return sr / sw; }\nvoid main() {`],
    ["float a = 0.0;", "float m = 0.0;"],
    ["a = max(a, cover(db) * uBead[i].w);", "m = max(m, cover(db) * uBead[i].w);"],
    [`if (anyC) a = max(a, cover(dc));
  outColor = vec4(vec3(a), a);`, `if (anyC) m = max(m, cover(dc));
  ${DOME}
  outColor = water(col, N, g, d, W) * m;`],
  ]);
  // the water's uniforms: the chosen candidate's constants, and its depths in device px (eff: device px per CSS px)
  function mediaConstants(g, Ux) {
    g.uniform1f(Ux.uCoupled, QS.get("motionOptics") === "legacy" ? 0 : 1);
    g.uniform1f(Ux.uBody, WM.body); g.uniform1f(Ux.uRim, WM.rim); g.uniform1f(Ux.uSpec, WM.spec); g.uniform1f(Ux.uSpecPower, WM.specPower); g.uniform1f(Ux.uSheen, WM.sheen); g.uniform1f(Ux.uRimLine, WM.rimLine); g.uniform1f(Ux.uMen, WM.men); g.uniform1f(Ux.uEdge, WM.edge);
    g.uniform3fv(Ux.uPearl, C.mediaPearl); g.uniform3fv(Ux.uInk, C.mediaInk);
    if (Ux.uBend) { g.uniform1f(Ux.uBend, WM.bend); g.uniform1f(Ux.uMag, WM.mag); g.uniform1f(Ux.uDispersion, WM.dispersion); g.uniform1f(Ux.uOpticalScale, WM.opticalScale); g.uniform1i(Ux.uImg, 0); g.uniform1i(Ux.uImgB, 1); g.uniform1i(Ux.uOverTex, 2); }
  }
  function mediaDepths(g, Ux, eff) { g.uniform1f(Ux.uEdgeW, C.mediaEdgePx * eff); g.uniform1f(Ux.uDome, P.radius * eff); if (Ux.uReach) g.uniform1f(Ux.uReach, Math.min(WM.reach, C.refractMaxPx) * eff); }
  // media: the media-safe instance (pearl, normal compositing; its own shared context and tiles)
  // Query completion without waiting for the driver. Shader status/uniform queries occur only after linking finishes.
  // Browsers without the extension keep the same synchronous fallback and all failures retain the native cursor.
  async function linkedProgram(g, vertex, fragment, label) {
    const extension = g.getExtension("KHR_parallel_shader_compile"), shaders = [], program = g.createProgram();
    let ready = false;
    try {
      for (const [type, source] of [[g.VERTEX_SHADER, vertex], [g.FRAGMENT_SHADER, fragment]]) {
        const shader = g.createShader(type); shaders.push(shader); g.shaderSource(shader, source); g.compileShader(shader); g.attachShader(program, shader);
      }
      g.linkProgram(program);
      if (extension) while (!g.getProgramParameter(program, extension.COMPLETION_STATUS_KHR)) {
        if (failed) throw new Error(label + " initialization cancelled");
        await new Promise(resolve => setTimeout(resolve, 16));
      }
      if (failed || g.isContextLost()) throw new Error(label + " initialization cancelled or context lost");
      for (const shader of shaders) if (!g.getShaderParameter(shader, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(shader) || label + " shader compile failed");
      if (!g.getProgramParameter(program, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(program) || label + " program link failed");
      ready = true; return program;
    } finally { for (const shader of shaders) { g.detachShader(program, shader); g.deleteShader(shader); } if (!ready) g.deleteProgram(program); }
  }
  async function createBeadTiles(cssSize, zIndex, created, media) {
    const L = { ok: false, error: "", mode: "", tiles: [], visible: false, draws: 0, eff: 1, backing: 0, dprCap: 1 };
    const attrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power" };
    let gl = null, prog = null, vao = null, glc = null, sizeDirty = true;
    const U = {}, bead = new Float32Array(4 * MAX), shape = new Float32Array(3 * MAX), beadK = new Float32Array(MAX), SIG = 9 + 8 * MAX;
    async function init() {
      L.ok = false;
      try {
        if (!glc) {
          if (typeof OffscreenCanvas === "function") { try { glc = new OffscreenCanvas(1, 1); gl = glc.getContext("webgl2", attrs); L.mode = "offscreen + bitmaprenderer"; } catch { gl = null; } }
          if (!gl) { glc = document.createElement("canvas"); gl = glc.getContext("webgl2", attrs); L.mode = "detached canvas + 2D copy"; }
          if (glc && glc.addEventListener) { glc.addEventListener("webglcontextlost", (e) => { e.preventDefault(); L.ok = false; L.hide?.(); }); glc.addEventListener("webglcontextrestored", async () => { await init(); L.size(L.dprCap); }); }
        }
        if (!gl) { L.error = "WebGL2 context unavailable"; return; }
        if (media && !BFS_MEDIA) { L.error = "media bead shader unavailable"; return; }
        prog = await linkedProgram(gl, BVS, media ? BFS_MEDIA : BFS, "bead");
      } catch (err) { L.error = String(err.message || err); return; }
      vao = gl.createVertexArray(); BU.forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
      if (media) { MEDIA_UNIFORMS.forEach((n) => { U[n] = gl.getUniformLocation(prog, n); }); gl.useProgram(prog); mediaConstants(gl, U); }
      gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0); L.ok = true; sizeDirty = true;
      for (const T of L.tiles) T.prev.fill(NaN);
    }
    const copy = () => L.mode.startsWith("detached");
    for (let i = 0; i < MAX; i++) { // the tiles themselves are plain DOM canvases (no WebGL context each)
      const canvas = document.createElement("canvas"), cs = canvas.style;
      canvas.className = media ? "lc-bead-media" : "lc-bead"; canvas.setAttribute("aria-hidden", "true");
      cs.position = "fixed"; cs.left = "0"; cs.top = "0"; cs.width = cssSize + "px"; cs.height = cssSize + "px"; cs.margin = "0"; cs.padding = "0"; cs.border = "0";
      cs.pointerEvents = "none"; cs.zIndex = String(zIndex); cs.visibility = "hidden"; cs.willChange = "transform"; cs.contain = "strict";
      if (!media) cs.mixBlendMode = "difference";
      document.body.appendChild(canvas); created.push(canvas);
      L.tiles.push({ canvas, cs, ctx: null, visible: false, px: NaN, py: NaN, cur: new Float32Array(SIG), prev: new Float32Array(SIG).fill(NaN), draws: 0 });
    }
    await init();
    for (const T of L.tiles) T.ctx = T.canvas.getContext(copy() ? "2d" : "bitmaprenderer");
    L.size = (dprCap) => {
      L.dprCap = dprCap; const b = Math.max(1, Math.round(cssSize * dprCap));
      if (glc && glc.width !== b) { glc.width = b; glc.height = b; }
      for (const T of L.tiles) { if (T.canvas.width !== b) { T.canvas.width = b; T.canvas.height = b; } T.px = NaN; T.prev.fill(NaN); }
      L.backing = b; L.eff = b / cssSize; sizeDirty = true;
    };
    // a hidden tile gives its bitmap back (memory only while a bead is shown) and redraws in full when next used
    function hideTile(T) { if (T.visible) { T.visible = false; T.cs.visibility = "hidden"; T.prev.fill(NaN); if (!copy() && L.ok && T.ctx) T.ctx.transferFromImageBitmap(null); } }
    L.hide = () => { for (const T of L.tiles) hideTile(T); L.visible = false; };
    L.invalidate = () => { for (const T of L.tiles) T.prev.fill(NaN); };
    L.reapply = () => { if (L.ok && media) { gl.useProgram(prog); mediaConstants(gl, U); L.invalidate(); } }; // the water's constants changed (diagnostics)
    L.fade = (o) => { const v = o < 1 ? String(o) : ""; for (const T of L.tiles) T.cs.opacity = v; }; // the material crossfade
    L.display = (on) => { for (const T of L.tiles) T.cs.display = on ? "" : "none"; }; // out of the compositor while unused
    L.finish = () => { if (gl) gl.finish(); };
    function render(T) {
      const c = T.cur;
      gl.useProgram(prog); gl.bindVertexArray(vao);
      if (sizeDirty) { sizeDirty = false; gl.viewport(0, 0, L.backing, L.backing); gl.uniform2f(U.uSize, L.backing, L.backing); if (media) mediaDepths(gl, U, L.eff); }
      for (let k = 0; k < MAX; k++) {
        const o = 9 + 8 * k; bead[4 * k] = c[o]; bead[4 * k + 1] = c[o + 1]; bead[4 * k + 2] = c[o + 2]; bead[4 * k + 3] = c[o + 3];
        shape[3 * k] = c[o + 4]; shape[3 * k + 1] = c[o + 5]; shape[3 * k + 2] = c[o + 6]; beadK[k] = c[o + 7];
      }
      gl.uniform4fv(U.uBead, bead); gl.uniform3fv(U.uBeadShape, shape); gl.uniform1fv(U.uBeadK, beadK); gl.uniform1f(U.uAA, c[2]);
      gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function present(T) {
      if (copy()) { T.ctx.clearRect(0, 0, L.backing, L.backing); T.ctx.drawImage(glc, 0, 0); }
      else T.ctx.transferFromImageBitmap(glc.transferToImageBitmap());
    }
    // draw tile t around (cx, cy) CSS px with the slots listed in lay.members; false when unavailable
    L.drawTile = (t, cx, cy, slots, lay, dpr, aa) => {
      if (!L.ok) return false;
      const T = L.tiles[t], half = cssSize / 2, tx = Math.round((cx - half) * dpr) / dpr, ty = Math.round((cy - half) * dpr) / dpr, e = L.eff, c = T.cur;
      if (tx !== T.px || ty !== T.py) { T.px = tx; T.py = ty; T.cs.transform = `translate3d(${tx}px, ${ty}px, 0)`; }
      if (!T.visible) { T.visible = true; T.cs.visibility = "visible"; }
      c.fill(0); c[0] = L.backing; c[2] = aa;
      for (let k = 0; k < lay.count[t]; k++) {
        const d = slots[lay.members[t * MAX + k]], o = 9 + 8 * k;
        c[o] = (d.x - tx) * e; c[o + 1] = L.backing - (d.y - ty) * e; c[o + 2] = Math.max(1e-3, d.r) * e; c[o + 3] = d.alpha; c[o + 4] = d.ux; c[o + 5] = -d.uy; c[o + 6] = d.el; c[o + 7] = d.kc * e;
      }
      let same = !sizeDirty; for (let i = 0; same && i < SIG; i++) if (c[i] !== T.prev[i]) same = false;
      if (same) return true;
      T.prev.set(c); render(T); present(T); T.draws++; L.draws++;
      return true;
    };
    L.endFrame = (lay) => { // after a frame's drawTile calls: hide the tiles nobody used
      let any = false;
      for (let t = 0; t < MAX; t++) { if (lay && lay.used[t]) any = true; else hideTile(L.tiles[t]); }
      L.visible = any;
    };
    L.readMask = (t = 0) => { // diagnostics only (allocates): redraw tile t and read it back, RGBA with the bottom row first
      const T = L.tiles[t]; if (!L.ok || !T || !T.visible) return null;
      render(T); const b = L.backing, out = new Uint8Array(b * b * 4); gl.readPixels(0, 0, b, b, gl.RGBA, gl.UNSIGNED_BYTE, out); present(T);
      return { w: b, h: b, px: out, tx: T.px, ty: T.py };
    };
    return L;
  }

  // ------------------------------------------------------------------ the engine
  const created = [], cleanups = [];
  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); cleanups.push(() => target.removeEventListener(type, fn, opts)); };
  let failed = false;
  // any failure: tear everything down and leave the native cursor exactly as the page has it
  function fail(why) {
    if (failed) return; failed = true;
    try { cancelAnimationFrame(raf); } catch { /* nothing to cancel */ }
    for (const c of cleanups.splice(0)) { try { c(); } catch { /* already gone */ } }
    document.documentElement.classList.remove("lc-active", "lc-hide-native");
    for (const el of created.splice(0)) { try { el.remove(); } catch { /* already gone */ } }
    api.active = false; api.reason = "failed: " + why;
  }
  let raf = 0;
  api.kill = () => fail("switched off at runtime");
  (async function boot() {
  try {
    let bootReady = false;
    const root = document.documentElement, B = createBodyState(), D = createGoo();
    const S = {
      active: false, visible: false, suspended: "awaiting pointer", reasons: "", frozen: false, sleeping: false, quiet: 0,
      webgl2: false, glError: "", contextLost: false,
      coalescedSupported: typeof PointerEvent !== "undefined" && "getCoalescedEvents" in PointerEvent.prototype,
      hasPointer: false, inside: true, pointerType: "", buttons: 0,
      rawX: 0, rawY: 0, renderX: 0, renderY: 0, vx: 0, vy: 0, speed: 0, sinceSample: 0, lastSampleT: 0,
      interactiveEl: null, ignoreEl: null, presence: 0, frames: 0, draws: 0, sleeps: 0, wakes: 0, disarms: 0, workMs: 0, loopRunning: false,
      mediaEl: null, indexEl: null, mat: 0, matForce: null, // the material: 0 difference, 1 media-safe (matForce: test captures only)
      dpr: 1, effDpr: 1, backingW: 0, backingH: 0, finePointer: false, reducedMotion: false, forcedColors: false,
    };
    const inp = { vx: 0, vy: 0, hover: false, pressed: false };
    const dropBody = { x: 0, y: 0, R: 0, s: 1, c: 1, ax: 1, ay: 0 }, dropPtr = { vx: 0, vy: 0, allowed: false };
    let vBaseX = 0, vBaseY = 0, vBaseT = 0, lastTarget = null, lastTs = 0, scrollCheck = false, sizeDirty = true, posX = NaN, posY = NaN;
    // draw-skip signature: 0-12 the body, 13 + 9 k the k-th free bead drawn here, 58 + k its cohesion radius, 63 + 3 i the
    // i-th tail point (x, y, r), 78 the tail's union radius
    const NU = 79, cur = new Float32Array(NU), prev = new Float32Array(NU).fill(NaN);
    const wakeU = new Float32Array(20), beadU = new Float32Array(20), beadShapeU = new Float32Array(15), beadKU = new Float32Array(5);

    // the native-cursor rules: hidden everywhere except in ignored regions, which keep the page's own cursors; an ignored
    // element without one gets the native default back (the cursor property inherits, so it would otherwise inherit none).
    // The reset has zero specificity, so any cursor the page sets (crosshair, ew-resize, copy, pointer) wins
    const style = document.createElement("style");
    style.id = "lc-native-cursor";
    style.textContent = `html.lc-hide-native, html.lc-hide-native :not(${SEL.ignore.split(",").map((s) => `${s.trim()}, ${s.trim()} *`).join(", ")}) { cursor: none !important; }
` +
      `:where(html.lc-hide-native) :where(${SEL.ignore}) { cursor: auto; }`;
    document.head.appendChild(style); created.push(style);

    // one bounded canvas that travels with the body, at the root level (never inside a clipping or stacking ancestor)
    const canvas = document.createElement("canvas");
    canvas.className = "lc-canvas";
    canvas.setAttribute("aria-hidden", "true");
    const cs = canvas.style;
    cs.position = "fixed"; cs.left = "0"; cs.top = "0"; cs.width = C.cssSize + "px"; cs.height = C.cssSize + "px"; cs.margin = "0"; cs.padding = "0"; cs.border = "0";
    cs.pointerEvents = "none"; cs.zIndex = String(C.zIndex); cs.visibility = "hidden"; cs.willChange = "transform"; cs.contain = "strict"; cs.mixBlendMode = "difference";
    document.body.appendChild(canvas); created.push(canvas);
    // the media-safe presentation of the same body: normal compositing, shown only over renders (never a second simulation:
    // it draws the frame's geometry signature, cur, exactly as the difference canvas does)
    const M = { ok: false, error: "", canvas: document.createElement("canvas"), cs: null, gl: null, prog: null, vao: null, U: {}, prev: new Float32Array(NU).fill(NaN), sizeDirty: true, tiles: null, draws: 0 };
    M.canvas.className = "lc-canvas-media"; M.canvas.setAttribute("aria-hidden", "true"); M.cs = M.canvas.style;
    M.cs.position = "fixed"; M.cs.left = "0"; M.cs.top = "0"; M.cs.width = C.cssSize + "px"; M.cs.height = C.cssSize + "px"; M.cs.margin = "0"; M.cs.padding = "0"; M.cs.border = "0";
    M.cs.pointerEvents = "none"; M.cs.zIndex = String(C.zIndex); M.cs.visibility = "hidden"; M.cs.willChange = "transform"; M.cs.contain = "strict"; M.cs.display = "none";
    document.body.appendChild(M.canvas); created.push(M.canvas);
    // the render under the water, for refraction: its texture (made asynchronously at its displayed resolution; a few are
    // kept) and where it is on screen this frame (rf: presence, canvas origin, scale, the render's box, the image's box)
    // rf (this frame's refraction uniforms, also the water's draw-skip signature): presence, canvas origin, scale, the valid
    // box, image A's box and opacity, image B's box and opacity, the overlay's box, hero or render, the hero's colour, texture ids
    const RF = 30, R = { want: 0, mix: 0, gen: 0, canvasGen: -1, texA: null, texB: null, blank: null, cache: new Map(), pending: new Set(), refused: new Set(), ids: 0, rf: new Float32Array(RF), prev: new Float32Array(RF).fill(NaN),
      el: null, ready: false, tex: null, own: null, fit: "fill", src: "", bw: 0, bh: 0, // a marked render
      // the hero's overlay snapshot: its texture, the viewport and scroll it was taken at, whether it is stale, how often taken
      hero: { z: null, obs: null, over: null, ok: false, w: 0, h: 0, scroll: 0, dirty: true, busy: false, gen: 0, last: -1e9, captures: 0, cacheHits: 0, snapshots: new Map(), ms: 0, mainMs: 0, css: null, fix: "", gw: 0, gh: 0, gs: 0, geoT: 0, settle: 0, failed: "", sc: "", bg: [0.592, 0.635, 0.694] } };

    let gl = null, prog = null, vao = null;
    const U = {};
    async function initGL() {
      S.glError = "";
      gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power" });
      if (!gl) { S.webgl2 = false; S.glError = "WebGL2 context unavailable"; return false; }
      try {
        prog = await linkedProgram(gl, VS, FS, "body");
      } catch (err) { S.webgl2 = false; S.glError = String(err.message || err); gl = null; return false; }
      vao = gl.createVertexArray();
      UNIFORMS.forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0);
      S.webgl2 = true; sizeDirty = true; prev.fill(NaN);
      return true;
    }
    on(canvas, "webglcontextlost", (e) => { e.preventDefault(); S.contextLost = true; S.webgl2 = false; evaluate(); });
    on(canvas, "webglcontextrestored", async () => {
      S.contextLost = false; await initGL(); if (failed || !S.webgl2) return;
      // A loss during initial linking may precede creation of the other presentations. Restore the complete cursor.
      if (!tiles) tiles = await createBeadTiles(C.beadCssSize, C.zIndex, created, false);
      if (!M.ok) await initMedia();
      if (failed) return; sizeBacking(); evaluate();
    });
    // the media layer: on any failure the cursor simply keeps the difference material everywhere
    async function initMedia() {
      M.ok = false; M.error = "";
      try {
        if (!FS_MEDIA) throw new Error("media shader unavailable");
        const g = M.gl || M.canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power" });
        if (!g) throw new Error("WebGL2 context unavailable");
        M.gl = g;
        M.prog = await linkedProgram(g, VS, FS_MEDIA, "media");
        M.vao = g.createVertexArray();
        UNIFORMS.concat(MEDIA_UNIFORMS, REFRACT_UNIFORMS).forEach((n) => { M.U[n] = g.getUniformLocation(M.prog, n); });
        g.useProgram(M.prog); mediaConstants(g, M.U);
        // fresh textures (a restored context has none); a 1×1 stand-in stays bound while no render is refracted
        R.cache = new Map(); R.pending = new Set(); R.own = null; R.el = null; R.ready = false; R.mix = 0; R.want = 0; R.gen++; R.prev.fill(NaN);
        Object.assign(R.hero, { over: null, ok: false, dirty: true, busy: false }); R.hero.gen++;
        R.blank = g.createTexture(); g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, R.blank); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, 1, 1, 0, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array(4));
        R.tex = R.texA = R.texB = R.blank; R.blank.lcId = 0;
        for (const u of [1, 2]) { g.activeTexture(g.TEXTURE0 + u); g.bindTexture(g.TEXTURE_2D, R.blank); }
        g.disable(g.DEPTH_TEST); g.disable(g.BLEND); g.clearColor(0, 0, 0, 0);
        if (!M.tiles && tiles) { M.tiles = await createBeadTiles(C.beadCssSize, C.zIndex, created, true); M.tiles.display(false); }
        if (tiles && tiles.ok && !(M.tiles && M.tiles.ok)) throw new Error("media bead tiles unavailable: " + (M.tiles ? M.tiles.error : ""));
        M.ok = true; M.sizeDirty = true; M.prev.fill(NaN);
      } catch (err) { M.ok = false; M.error = String(err.message || err); }
    }
    on(M.canvas, "webglcontextlost", (e) => { e.preventDefault(); M.ok = false; M.error = "WebGL context lost"; applyLayers(); });
    on(M.canvas, "webglcontextrestored", async () => { await initMedia(); if (failed) return; sizeBacking(); wake(); });

    // ---- media policy: a fine pointer, no reduced motion, no forced colours
    const mqFine = matchMedia("(pointer: fine)"), mqReduced = matchMedia("(prefers-reduced-motion: reduce)"), mqForced = matchMedia("(forced-colors: active)");
    [mqFine, mqReduced, mqForced].forEach((m) => on(m, "change", evaluate));
    let mqDpr = null;
    function watchDpr() { // a zoom or monitor change alters devicePixelRatio; this fires even without a resize
      if (mqDpr) mqDpr.removeEventListener("change", onDprChange);
      mqDpr = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`); mqDpr.addEventListener("change", onDprChange);
    }
    function onDprChange() { sizeBacking(); watchDpr(); wake(); }
    cleanups.push(() => { if (mqDpr) mqDpr.removeEventListener("change", onDprChange); });

    let tiles = null;
    function dropReset() { reset(D); if (tiles) tiles.hide(); }
    const dropDisarm = () => { S.disarms++; disarm(D); }; // browser or input artifacts must never read as a flick
    // the native cursor is hidden only while the liquid cursor runs and has a pointer to follow
    function syncNative() { root.classList.toggle("lc-hide-native", S.active && S.hasPointer && S.pointerType !== "touch"); }
    function evaluate() {
      S.finePointer = mqFine.matches; S.reducedMotion = mqReduced.matches; S.forcedColors = mqForced.matches;
      const why = [];
      if (!bootReady) why.push("initializing");
      if (!S.webgl2) why.push(S.contextLost ? "WebGL context lost" : S.glError ? "WebGL2 unavailable (" + S.glError + ")" : "WebGL2 unavailable");
      if (!S.finePointer) why.push("no fine pointer");
      if (S.forcedColors) why.push("forced colours");
      if (S.reducedMotion) why.push("reduced motion");
      S.reasons = why.join(", ");
      S.active = why.length === 0;
      api.active = S.active; api.reason = S.active ? "" : S.reasons;
      root.classList.toggle("lc-active", S.active);
      syncNative();
      if (S.active && document.visibilityState === "visible") start(); else stop();
      updateVisibility();
    }

    function sizeBacking() {
      S.dpr = window.devicePixelRatio || 1;
      const d = Math.min(S.dpr, C.maxDpr), px = Math.max(1, Math.round(C.cssSize * d));
      if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
      S.backingW = canvas.width; S.backingH = canvas.height; S.effDpr = S.backingW / C.cssSize;
      posX = NaN; sizeDirty = true;
      if (tiles) tiles.size(d);
      if (M.canvas.width !== px) { M.canvas.width = px; M.canvas.height = px; }
      M.sizeDirty = true; M.prev.fill(NaN);
      if (M.tiles) M.tiles.size(d);
      dropDisarm();
    }

    // ---- input (observe only: passive, never preventDefault, never stop propagation)
    function sample(x, y, t) {
      if (!S.hasPointer) {
        S.hasPointer = true; S.rawX = S.renderX = vBaseX = x; S.rawY = S.renderY = vBaseY = y; vBaseT = S.lastSampleT = t; S.vx = S.vy = 0;
        dropDisarm(); syncNative(); return;
      }
      const gap = t - S.lastSampleT, jump = Math.hypot(x - S.rawX, y - S.rawY);
      S.rawX = x; S.rawY = y; S.lastSampleT = t; S.sinceSample = 0;
      if (gap > F.gapResetMs) { // no velocity across a tracking gap
        vBaseX = x; vBaseY = y; vBaseT = t; S.vx = S.vy = 0;
        if (jump > P.dropGapJumpPx) dropDisarm(); // the pointer moved unseen: not a flick
        return;
      }
      const dtMs = t - vBaseT;
      if (dtMs >= 1) { // same-timestamp samples accumulate until time has advanced
        const k = 1 - Math.exp(-dtMs / F.velocitySmoothingMs);
        S.vx += ((x - vBaseX) / dtMs * 1000 - S.vx) * k; S.vy += ((y - vBaseY) / dtMs * 1000 - S.vy) * k;
        vBaseX = x; vBaseY = y; vBaseT = t;
      }
    }
    function classify(el) {
      const previous = S.mediaEl;
      lastTarget = el;
      const ig = el && el.closest ? el.closest(SEL.ignore) : null;
      S.ignoreEl = ig;
      S.indexEl = !ig && el && el.closest ? el.closest(SEL.index) : null;
      S.interactiveEl = indexHoverTarget(!ig && el && el.closest ? el.closest(SEL.interactive) : null);
      // the hero zone: water throughout. Elsewhere over a render, unless the pointer is on a control laid over it (a render
      // inside a control, a film frame, stays art). Only the top bar joins the hero's zone where it lies beneath it.
      const md = !ig && el && el.closest ? el.closest(SEL.media) : null;
      if (md && md.matches(SEL.zone)) S.mediaEl = md;
      else if (md) S.mediaEl = !S.interactiveEl || S.interactiveEl.contains(md) ? md : null;
      else S.mediaEl = !ig && el && el.closest && el.closest(SEL.chrome) ? zoneBeneath(S.rawX, S.rawY) : null;
      if (previous !== S.mediaEl && ((previous && previous.matches(SEL.zone)) || (S.mediaEl && S.mediaEl.matches(SEL.zone)))) staleHero("source transition", false);
      updateVisibility();
    }
    // An index row's content boxes, measured once and reused while the pointer stays on that row: every row change alters
    // :hover styles, so measuring on each pointer move forced a style and layout pass inside the input handler. They are
    // remeasured on a new row, after a scroll (onScroll clears them) and every 150 ms (the title's hover shift, the
    // thumbnail fading in).
    const idxBoxes = { link: null, at: -1e9, boxes: [] };
    function indexHoverTarget(link) {
      if (!S.indexEl || !link || !link.matches(".toc a")) return link;
      // The anchor remains clickable across the whole row. Only its visible content asks the body to grow/calm;
      // empty row space and dividers remain eligible for the frozen Goo simulation. Existing tail/beads keep drawing.
      const now = performance.now();
      if (link !== idxBoxes.link || now - idxBoxes.at > 150) {
        const boxes = []; idxBoxes.link = link; idxBoxes.at = now; idxBoxes.boxes = boxes;
        const range = document.createRange();
        for (const el of link.querySelectorAll(".n, .t, .d, .k")) { range.selectNodeContents(el); for (const b of range.getClientRects()) boxes.push(b); }
        const thumb = link.querySelector(".thumb");
        if (thumb && +getComputedStyle(thumb).opacity > 0) boxes.push(thumb.getBoundingClientRect());
      }
      for (const b of idxBoxes.boxes) if (S.rawX >= b.left && S.rawX <= b.right && S.rawY >= b.top && S.rawY <= b.bottom) return link;
      return null;
    }
    function zoneBeneath(x, y) { // the first element under the chrome at this point: is it the hero's?
      for (const e of document.elementsFromPoint(x, y)) { if (e.closest(SEL.chrome)) continue; return e.closest(SEL.zone); }
      return null;
    }
    function onMove(e) {
      S.pointerType = e.pointerType; S.buttons = e.buttons;
      if (e.pointerType === "touch") { syncNative(); updateVisibility(); return; }
      S.inside = true;
      const list = S.coalescedSupported ? e.getCoalescedEvents() : null;
      if (list && list.length) for (let i = 0; i < list.length; i++) sample(list[i].clientX, list[i].clientY, list[i].timeStamp);
      else sample(e.clientX, e.clientY, e.timeStamp);
      // under pointer capture the target stays the capturing element, so a drag that began in an ignored region stays ignored
      if (e.target !== lastTarget || S.indexEl) classify(e.target); else updateVisibility();
      syncNative(); wake();
    }
    function onButtons(e) { S.pointerType = e.pointerType; S.buttons = e.buttons; dropDisarm(); if (e.target !== lastTarget || S.indexEl) classify(e.target); else updateVisibility(); syncNative(); wake(); }
    function onOut(e) { if (!e.relatedTarget) { S.inside = false; updateVisibility(); } }
    // content moved under a still pointer (a scroll or a page change): re-hit-test once, next frame. Positions are viewport
    // coordinates, so the page moving underneath is never pointer motion
    function onScroll() { scrollCheck = true; idxBoxes.link = null; R.hero.geoT = performance.now(); staleHero("scroll geometry"); wake(); }
    function onNavigate() { scrollCheck = true; staleHero("navigation"); dropDisarm(); wake(); }
    on(window, "pointermove", onMove, { capture: true, passive: true });
    on(window, "pointerdown", onButtons, { capture: true, passive: true });
    on(window, "pointerup", onButtons, { capture: true, passive: true });
    on(window, "pointercancel", onButtons, { capture: true, passive: true });
    on(window, "pointerout", onOut, { capture: true, passive: true });
    on(window, "scroll", onScroll, { capture: true, passive: true });
    on(window, "hashchange", onNavigate, { passive: true });
    on(window, "resize", () => { sizeBacking(); wake(); }, { passive: true });
    on(document, "visibilitychange", () => { dropDisarm(); evaluate(); });
    const navSurface = document.getElementById("nav");
    if (navSurface) on(navSurface, "transitionend", (e) => {
      if (e.target.matches(".navpanel") && e.propertyName === "transform") { scrollCheck = true; wake(); }
    }, { passive: true }); // opening/closing the panel moves a surface under a still pointer

    function updateVisibility() {
      const why = !S.hasPointer ? "awaiting pointer" : S.pointerType === "touch" ? "touch input" : !S.inside ? "pointer outside window" : S.ignoreEl ? "ignored target" : "";
      S.suspended = why;
      const show = S.active && !why;
      if (show === S.visible) return;
      S.visible = show;
      dropReset();
      if (show) { // reappearing: start round and centred, fade in, rebuild velocity from fresh samples
        resetMotion(B); S.renderX = S.rawX; S.renderY = S.rawY; S.presence = 0; prev.fill(NaN); wake();
        S.mat = materialTarget(); // it appears in the material of what is under it (no crossfade from nothing)
      }
      applyLayers();
    }

    // ---- the material: one value for the whole liquid (body, tail and beads alike) at any moment, chosen by what is under
    // the pointer and crossfaded over C.mediaFadeMs. It is presentation only: the simulation never reads it
    let shownU = 0, diffShown = false, mediaShown = false;
    function resolveCursorPresentation() {
      if (!M.ok) return { mode: "fallback", material: 0 };
      if (S.matForce !== null) return { mode: "diagnostic", material: S.matForce };
      if (S.ignoreEl) return { mode: "nativePrecision", material: 0 };
      if (S.mediaEl) return { mode: "mediaGlass", material: 1 };
      return { mode: "difference", material: 0 };
    }
    function materialTarget() { return resolveCursorPresentation().material; }
    function stepMaterial(dt) {
      const target = materialTarget();
      if (S.mat !== target) { const k = dt * 1000 / C.mediaFadeMs; S.mat = target > S.mat ? Math.min(target, S.mat + k) : Math.max(target, S.mat - k); }
      const rt = R.want; // the refraction appears once what it samples is ready
      if (R.mix !== rt) { const k = dt * 1000 / C.refractFadeMs; R.mix = rt > R.mix ? Math.min(rt, R.mix + k) : Math.max(rt, R.mix - k); }
    }
    // the two layers from the material: the difference canvas alone at 0 (exactly as before), the water alone at 1. A layer
    // the material has put aside is display: none (the water's when it is not in use; the difference canvas's over artwork).
    // The crossfade is eased so the inversion leaves early and arrives late: its half-transparent grey lasts only a moment
    let diffAside = false;
    function applyLayers() {
      const u = M.ok ? S.mat : 0, xs = u * u * (3 - 2 * u), dOp = (1 - xs) ** 3, dv = S.visible && u < 1, mv = S.visible && u > 0, aside = S.visible && u === 1;
      if (dv !== diffShown) { diffShown = dv; cs.visibility = dv ? "visible" : "hidden"; prev.fill(NaN); } // not drawn while hidden
      if (aside !== diffAside) { diffAside = aside; cs.display = aside ? "none" : ""; if (tiles) tiles.display(!aside); }
      if (mv !== mediaShown) { mediaShown = mv; M.cs.visibility = mv ? "visible" : "hidden"; M.cs.display = mv ? "" : "none"; if (M.tiles) M.tiles.display(mv); M.prev.fill(NaN); }
      if (u !== shownU) {
        shownU = u; cs.opacity = u > 0 ? String(dOp) : ""; M.cs.opacity = u < 1 ? String(1 - dOp) : "";
        if (tiles) tiles.fade(dOp);
        if (M.tiles) M.tiles.fade(1 - dOp);
      }
    }

    // ---- frame loop: it sleeps once nothing can change (no pointer motion, the body still, no goo, nothing drawn for 30
    // frames) and wakes on the next input, scroll, resize or page change
    function start() { if (!S.loopRunning && !failed) { S.loopRunning = true; S.sleeping = false; S.quiet = 0; lastTs = 0; raf = requestAnimationFrame(frame); } }
    function stop() { if (S.loopRunning) { S.loopRunning = false; cancelAnimationFrame(raf); lastTs = 0; } }
    function wake() {
      if (!S.sleeping || !S.active || failed || document.visibilityState !== "visible") return;
      S.sleeping = false; S.wakes++; S.quiet = 0;
      if (!S.loopRunning) { S.loopRunning = true; lastTs = performance.now(); raf = requestAnimationFrame(frame); }
    }
    function sleep() { stop(); S.sleeping = true; S.sleeps++; }
    function integrate(dt) {
      S.sinceSample += dt;
      if (S.sinceSample * 1000 > F.velocityStaleMs) { // a still mouse sends no events: raw velocity decays
        const k = Math.exp(-F.velocityDecay * dt); S.vx *= k; S.vy *= k;
        if (Math.abs(S.vx) < 0.5 && Math.abs(S.vy) < 0.5) { S.vx = 0; S.vy = 0; }
      }
      S.speed = Math.hypot(S.vx, S.vy);
      inp.vx = S.vx; inp.vy = S.vy; inp.hover = !!S.interactiveEl; inp.pressed = (S.buttons & 1) === 1 && S.pointerType !== "touch";
      stepBody(B, F.maxSubstep, inp, dt);
      const a = 1 - Math.exp(-P.followResponse * dt); // exponential following, frame-rate independent
      S.renderX += (S.rawX - S.renderX) * a; S.renderY += (S.rawY - S.renderY) * a;
      S.presence += (1 - S.presence) * (1 - Math.exp(-P.presenceResponse * dt));
      if (S.presence > 0.999) S.presence = 1;
      // the goo reads the body and the pointer after both have moved; it never writes back
      dropBody.x = S.renderX; dropBody.y = S.renderY; dropBody.R = P.radius * B.radiusScale; dropBody.s = B.stretch; dropBody.c = B.compression; dropBody.ax = B.ax; dropBody.ay = B.ay;
      dropPtr.vx = S.vx; dropPtr.vy = S.vy;
      // The goo follows the pointer's own motion over ordinary controls too: hovering, entering or crossing a link or button
      // never disarms it (hover still grows and calms the body). A press, a hidden body and touch input still do.
      dropPtr.allowed = S.visible && !inp.pressed && S.pointerType !== "touch";
      step(D, dropBody, dropPtr, dt, F.maxSubstep);
      stepMaterial(dt); // after the simulation, which never reads it
    }
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      try {
        const w0 = performance.now();
        const rawDtMs = lastTs ? Math.max(0, ts - lastTs) : 0; // the first frame after start integrates nothing
        lastTs = ts;
        let dt = rawDtMs / 1000;
        if (dt > F.maxDt) { dt = F.maxDt; if (!S.frozen) dropDisarm(); } // a stall is not a flick
        if (rawDtMs > 0) S.frames++;
        if (window.devicePixelRatio !== S.dpr) { sizeBacking(); watchDpr(); } // a DPR change that came without a resize or a media event
        if (scrollCheck && S.hasPointer) { scrollCheck = false; classify(document.elementFromPoint(S.rawX, S.rawY)); }
        if (!S.frozen && dt > 0) integrate(dt);
        const drew = S.visible ? draw() : false;
        if (S.active) prewarmHero(w0);
        S.workMs += (performance.now() - w0 - S.workMs) * 0.05; // EMA of this callback's own cost
        S.quiet = drew ? 0 : S.quiet + 1;
        if (!S.frozen && S.quiet >= 30 && S.vx === 0 && S.vy === 0 && live(D) === 0 && !D.spine.on && !scrollCheck && (!S.visible || S.presence === 1) && S.mat === materialTarget() && R.mix === R.want) sleep();
      } catch (err) { fail(String((err && err.message) || err)); }
    }

    function draw() {
      if (!gl || gl.isContextLost()) return false;
      // read before writing: what the water refracts is measured before this frame's style writes (no forced layout)
      const optic = S.mat > 0 && M.ok ? readOptics() : null;
      applyLayers();
      const half = C.cssSize / 2, dpr = S.dpr, e = S.effDpr, u = shownU;
      // snap the canvas to whole device pixels (no resampling blur); the sub-pixel remainder goes to the shader
      const tx = Math.round((S.renderX - half) * dpr) / dpr, ty = Math.round((S.renderY - half) * dpr) / dpr;
      if (tx !== posX || ty !== posY) { posX = tx; posY = ty; cs.transform = M.cs.transform = `translate3d(${tx}px, ${ty}px, 0)`; }
      let radius = P.radius * B.radiusScale; // keep the whole body inside the bounded canvas
      const span = Math.max(B.stretch, B.compression), limit = half - C.edgeMargin, extent = radius * span + B.noiseAmp;
      if (extent > limit) radius *= (limit - B.noiseAmp) / (radius * span);
      cur[0] = (S.renderX - tx) * e; cur[1] = S.backingH - (S.renderY - ty) * e;
      cur[2] = B.ax; cur[3] = -B.ay; cur[4] = B.stretch; cur[5] = radius * e; cur[6] = B.noiseAmp * e; cur[7] = S.presence;
      cur[8] = S.backingW; cur[9] = e; cur[10] = B.compression; cur[11] = Math.max(1, P.noiseScale) * e; cur[12] = B.noiseT;
      for (let i = 13; i < NU; i++) cur[i] = 0;
      let lay = null;
      if (live(D) > 0) { // a free bead is drawn here while it is well inside this canvas, else by a bead tile (same SDF)
        lay = layout(D, tx, ty, C.cssSize, C.edgeMargin, !!(tiles && tiles.ok), C.beadCssSize, P.poolJoinPx);
        for (let k = 0; k < lay.nBody; k++) {
          const d = D.slots[lay.body[k]], o = 13 + 9 * k;
          cur[o] = (d.x - tx) * e; cur[o + 1] = S.backingH - (d.y - ty) * e; cur[o + 2] = Math.max(1e-3, d.r) * e; cur[o + 3] = d.alpha;
          cur[o + 4] = d.ux; cur[o + 5] = -d.uy; cur[o + 6] = d.el;
          cur[58 + k] = d.kc * e;
        }
        if (tiles) {
          const aa = C.aaWidth * Math.min(1, tiles.eff / dpr);
          for (let t = 0; t < MAX; t++) if (lay.used[t]) {
            if (u < 1) tiles.drawTile(t, lay.cx[t], lay.cy[t], D.slots, lay, dpr, aa);
            if (u > 0 && M.tiles) M.tiles.drawTile(t, lay.cx[t], lay.cy[t], D.slots, lay, dpr, aa);
          }
        }
      }
      if (D.tailOut.on) { // the goo tail (always this canvas: it is one surface with the body)
        const W = D.tailOut;
        for (let i = 0; i < WN; i++) { cur[63 + 3 * i] = (W.x[i] - tx) * e; cur[64 + 3 * i] = S.backingH - (W.y[i] - ty) * e; cur[65 + 3 * i] = Math.max(0, W.r[i]) * e; }
        cur[78] = W.k * e;
      }
      if (tiles) tiles.endFrame(u < 1 ? lay : null);
      if (M.tiles) M.tiles.endFrame(u > 0 ? lay : null);
      let drew = false;
      if (u < 1) { // the difference canvas (the approved presentation)
        let same = !sizeDirty;
        for (let i = 0; same && i < NU; i++) if (cur[i] !== prev[i]) same = false;
        if (!same) {
          prev.set(cur);
          gl.useProgram(prog); gl.bindVertexArray(vao);
          if (sizeDirty) {
            sizeDirty = false;
            gl.viewport(0, 0, S.backingW, S.backingH);
            gl.uniform2f(U.uSize, S.backingW, S.backingH);
            gl.uniform1f(U.uAA, C.aaWidth * Math.min(1, e / dpr)); // above maxDpr the browser upscales: keep the ramp about 1 device px
          }
          paint(gl, U);
          S.draws++; drew = true;
        }
      }
      if (u === 0 && (R.el || R.want)) { R.el = null; R.ready = false; R.mix = 0; R.want = 0; R.gen++; }
      if (u > 0 && M.ok && !M.gl.isContextLost()) { // the water canvas: the same geometry, the same uniforms, and the refraction
        refraction(tx, ty, e, optic);
        let same = !M.sizeDirty;
        for (let i = 0; same && i < NU; i++) if (cur[i] !== M.prev[i]) same = false;
        for (let i = 0; same && i < RF; i++) if (R.rf[i] !== R.prev[i]) same = false;
        if (!same) {
          M.prev.set(cur); R.prev.set(R.rf);
          const g = M.gl; g.useProgram(M.prog); g.bindVertexArray(M.vao);
          if (M.sizeDirty) {
            M.sizeDirty = false;
            g.viewport(0, 0, S.backingW, S.backingH);
            g.uniform2f(M.U.uSize, S.backingW, S.backingH);
            g.uniform1f(M.U.uAA, C.aaWidth * Math.min(1, e / dpr));
            mediaDepths(g, M.U, e);
          }
          refractUniforms(g);
          paint(g, M.U);
          M.draws++; drew = true;
        }
      }
      return drew;
    }
    // ---- optics: what the water refracts. A marked render: its own image (a texture at its displayed resolution, made
    // asynchronously; a few are kept). The hero: rebuilt from its colour, the montage frames as they are drawn this frame (their
    // boxes and crossfade opacities), and a snapshot of everything laid over them, taken in idle time only when that overlay
    // changes (never per frame), its controls and performance summary included; chrome
    // above the hero does not refract. After a resize or a scroll it waits until the page has settled
    // (no snapshot is taken while it moves) and then for a fresh snapshot
    function refractSource(md) { // a marked render's image or canvas
      if (!md || md.matches(SEL.zone)) return null;
      const el = md.matches("img, canvas") ? md : md.querySelector("img, canvas");
      return el && (el.tagName === "CANVAS" ? el.width > 0 && el.height > 0 : el.complete && el.naturalWidth > 0) ? el : null;
    }
    function readOptics() { // every DOM read the refraction needs this frame, taken before any write
      const md = S.mediaEl;
      if (!md) return null;
      // The hero zone, its controls and the performance summary included, refracts its own composition: the live montage
      // frames under the overlay snapshot. (The whole-page ripple source is retaken only when the page is still, so a
      // lens that waited for it lost its rainbow for as long as the pointer kept moving.)
      if (!md.matches(SEL.zone)) { const el = refractSource(md); return el ? { kind: 1, el, b: el.getBoundingClientRect() } : null; }
      const zb = md.getBoundingClientRect(), idx = md.parentElement && md.parentElement.querySelector(".index");
      const bottom = Math.min(innerHeight, zb.bottom, idx && idx.offsetParent ? idx.getBoundingClientRect().top : Infinity);
      const fr = [];
      for (const f of md.querySelectorAll(".hero-frame")) { const op = +getComputedStyle(f).opacity, im = f.querySelector("img"); if (op > 0.002 && im && im.complete && im.naturalWidth) fr.push({ img: im, op, b: im.getBoundingClientRect() }); }
      const inZone = lastTarget && md.contains(lastTarget);
      return { kind: 2, z: md, box: [Math.max(0, zb.left), Math.max(0, zb.top), Math.min(innerWidth, zb.right), bottom], A: fr[fr.length - 1] || null, B: fr.length > 1 ? fr[fr.length - 2] : null,
        w: innerWidth, h: innerHeight, scroll: scrollY, refractable: !!inZone };
    }
    function texFrom(src, key, opts, done) { // an image's texture (cached by key; made asynchronously), or null while it is made
      if (key && R.cache.has(key)) { const t = R.cache.get(key); R.cache.delete(key); R.cache.set(key, t); return t; }
      if (key && (R.pending.has(key) || R.refused.has(key))) return null;
      const gen = R.gen; if (key) R.pending.add(key);
      const imageSource = src.tagName === "IMG" ? src.currentSrc || src.src : "";
      Promise.resolve().then(async () => {
        // No decode() of the page's <img> (see mediaData): it changes how the displayed image is rasterized.
        if (imageSource && imageSource !== (src.currentSrc || src.src)) { if (key) R.pending.delete(key); return null; }
        if (failed || !M.ok || M.gl.isContextLost()) { if (key) R.pending.delete(key); return null; }
        return createImageBitmap(src, opts);
      }).then((bmp) => {
        if (!bmp) return;
        if (key) R.pending.delete(key);
        if (failed || !M.ok || M.gl.isContextLost() || (!key && gen !== R.gen)) { bmp.close(); return; }
        const g = M.gl, t = g.createTexture(); t.lcId = ++R.ids;
        g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, t);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
        g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, bmp); bmp.close();
        if (key) { R.cache.set(key, t); while (R.cache.size > C.refractCache) { const [k0, t0] = R.cache.entries().next().value; R.cache.delete(k0); if (t0 !== R.texA && t0 !== R.texB) g.deleteTexture(t0); } }
        if (done) done(t);
        wake();
      }).catch(() => { if (key) { R.pending.delete(key); R.refused.add(key); } }); // (a page that may not read its own images, such as file://: no refraction, asked once)
      return null;
    }
    function fitBox(el, b, fit) { // the whole image's box in CSS px (object-fit cover or contain; otherwise the element's box)
      if (el.tagName !== "IMG" || (fit !== "cover" && fit !== "contain")) return { x: b.left, y: b.top, w: b.width, h: b.height };
      const k = (fit === "cover" ? Math.max : Math.min)(b.width / el.naturalWidth, b.height / el.naturalHeight), w = el.naturalWidth * k, h = el.naturalHeight * k;
      return { x: b.left + (b.width - w) / 2, y: b.top + (b.height - h) / 2, w, h };
    }
    function renderTexture(el, b) { // a marked render at its displayed resolution
      const img = el.tagName === "IMG";
      if (!img && R.canvasGen === R.gen) return; // (a canvas is requested once per visit)
      if (!img) R.canvasGen = R.gen;
      R.fit = img ? getComputedStyle(el).objectFit : "fill"; R.src = img ? el.currentSrc || el.src : ""; R.bw = b.width; R.bh = b.height;
      const fb = fitBox(el, b, R.fit), dp = Math.min(S.dpr, C.maxDpr), w = Math.max(1, Math.round(fb.w * dp)), h = Math.max(1, Math.round(fb.h * dp));
      const t = texFrom(el, img ? `${R.src}@${w}x${h}` : "", img ? { resizeWidth: w, resizeHeight: h, resizeQuality: "high" } : {}, img ? null : (tc) => { if (R.own && R.own !== tc) M.gl.deleteTexture(R.own); R.own = tc; if (R.el === el) { R.tex = tc; R.ready = true; } });
      if (t) { R.tex = t; R.ready = true; } else if (img) R.ready = false;
    }
    // the hero's overlay snapshot (everything laid over its frames, plus the top bar and the rail), through an SVG
    // foreignObject: the page's own CSS, its system fonts, no external resource. Decoded asynchronously, then drawn into a 2D
    // canvas (an image bitmap of a foreignObject is refused by WebGL as cross-origin; a canvas it was drawn into is not)
    function watchHero(z) {
      const H = R.hero;
      if (H.obs) H.obs.disconnect();
      H.z = z; H.dirty = true; H.sc = z.style.getPropertyValue("--sc");
      H.obs = new MutationObserver((list) => { let soft = false; for (const m of list) {
        const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (t && t.closest && t.closest(".hero-stage")) continue; // the frames are drawn live, not snapshotted
        if (m.type === "attributes" && t === z && m.attributeName === "style") { const sc = z.style.getPropertyValue("--sc"); if (sc === H.sc) continue; H.sc = sc; } // (parallax only: ignore)
        // added or removed elements may move what the snapshot shows: never reused. Text and attribute changes (the
        // montage counter, aria-current) keep the snapshot until a fresh one replaces it
        if (m.type === "childList" && [...m.addedNodes, ...m.removedNodes].some((n) => n.nodeType === 1)) { staleHero("hero overlay change"); return; }
        soft = true; }
        if (soft) staleHero("hero overlay content", false); });
      H.obs.observe(z, { subtree: true, childList: true, characterData: true, attributes: true });
      const edge = document.getElementById("edge"); if (edge) H.obs.observe(edge, { subtree: true, childList: true, characterData: true, attributes: true });
    }
    cleanups.push(() => { if (R.hero.obs) R.hero.obs.disconnect(); clearTimeout(R.hero.settle); for (const bitmap of R.hero.snapshots.values()) bitmap.close(); R.hero.snapshots.clear(); });
    // hard: the geometry may have changed (scroll, navigation, replaced content), so the snapshot is never used again.
    // soft: only content the snapshot shows may have changed (a counter's text, an attribute, the pointer entering or
    // leaving the zone); the current snapshot, still checked against the viewport and scroll it was taken at, stays in
    // use until a fresh one replaces it, so the refraction never blinks out while the overlay is retaken
    function staleHero(reason, hard = true) {
      const H = R.hero; H.dirty = true; H.gen++; H.reason = reason;
      if (!hard) return;
      H.ok = false; R.mix = R.want = 0; R.prev.fill(NaN); M.prev.fill(NaN);
    }
    // Chromium serializes a rule that pairs a var() shorthand with one of its longhands (font: … var(--f-display) and
    // font-variation-settings, say) as empty longhands, which the snapshot would lose: the elements such a rule styles get
    // those groups from their computed style instead
    const COMPUTED = ["font-style", "font-weight", "font-stretch", "font-size", "line-height", "font-family", "font-variant-caps", "font-variant-numeric", "font-variant-ligatures", "font-feature-settings",
      "font-variation-settings", "font-kerning", "font-optical-sizing", "background-color", "background-image", "background-position", "background-size", "background-repeat", "background-origin", "background-clip"];
    function readCss(H) { // once: the page's rules as text, and the selectors of the rules that text loses
      let css = ""; const lost = [];
      const scan = (rules) => { for (const r of rules) { if (r.selectorText && r.cssText.includes(": ;") && !r.selectorText.includes("::")) lost.push(r.selectorText); if (r.cssRules) scan(r.cssRules); } };
      for (const sh of document.styleSheets) { scan(sh.cssRules); for (const r of sh.cssRules) css += r.cssText + "\n"; }
      H.css = css.split("<").join("\\3c "); H.fix = lost.join(", ");
    }
    function inlineComputed(live, copy, sel) {
      if (copy.style && live.matches(sel)) { const cs = getComputedStyle(live); for (const p of COMPUTED) copy.style.setProperty(p, cs.getPropertyValue(p)); }
      for (let i = 0, a = live.children, b = copy.children; i < a.length && i < b.length; i++) if (!a[i].classList.contains("hero-stage")) inlineComputed(a[i], b[i], sel);
    }
    function captureHero(z) {
      const H = R.hero;
      if (H.busy || H.never || failed || performance.now() - H.last < C.heroOpticMinMs) return;
      H.busy = true; H.last = performance.now(); const gen = ++H.gen;
      const run = async () => {
        const t0 = performance.now();
        try {
          if (H.css === null) readCss(H);
          const W = innerWidth, Hh = innerHeight, scroll = scrollY, zb = z.getBoundingClientRect(), ser = new XMLSerializer(), clone = z.cloneNode(true);
          if (H.fix) inlineComputed(z, clone, H.fix);
          const stage = clone.querySelector(".hero-stage"); if (stage) stage.remove();
          // These variables affect only the removed montage. Normalize the equivalent zero scroll pose so a return
          // to the same overlay can reuse its exact pixels; content, geometry, CSS and DPR remain part of the full key.
          clone.style.removeProperty("--px"); clone.style.removeProperty("--py"); clone.style.setProperty("--sc", String(Number(z.style.getPropertyValue("--sc")) || 0));
          let body = ser.serializeToString(clone);
          for (const sel of ["#edge", "#nav .rail"]) { const n = document.querySelector(sel); if (n) { const c = n.cloneNode(true); if (H.fix) inlineComputed(n, c, H.fix); body += ser.serializeToString(c); } }
          const bs = getComputedStyle(document.body), rs = getComputedStyle(document.documentElement);
          const font = `font:${bs.fontStyle} ${bs.fontWeight} ${bs.fontSize}/${bs.lineHeight} ${bs.fontFamily.replace(/"/g, "'")};color:${bs.color};font-variant-numeric:${bs.fontVariantNumeric}`;
          const extra = `*{animation:none!important;transition:none!important;caret-color:transparent!important}` +
            `.hero{position:absolute!important;left:${zb.left}px!important;top:${zb.top}px!important;width:${zb.width}px!important;height:${zb.height}px!important;margin:0!important;background:transparent!important}`;
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" style="font-size:${rs.fontSize}"><foreignObject x="0" y="0" width="${W}" height="${Hh}">` +
            `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${W}px;height:${Hh}px;overflow:hidden;${font}"><style>${H.css}${extra}</style>${body}</div></foreignObject></svg>`;
          const t1 = performance.now(), sourceDpr = S.dpr, k = Math.min(sourceDpr, C.heroOpticScale), cw = Math.round(W * k), chh = Math.round(Hh * k), key = sourceDpr + ":" + cw + "x" + chh + ":" + svg;
          let overlay = H.snapshots.get(key), cached = !!overlay, img;
          if (!cached) { img = new Image(); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); await img.decode(); }
          if (gen !== H.gen || failed || !S.active || !M.ok || M.gl.isContextLost() || W !== innerWidth || Hh !== innerHeight || scroll !== scrollY || sourceDpr !== S.dpr) return;
          const t2 = performance.now();
          if (!cached) {
            if (!H.cv || H.cv.width !== cw || H.cv.height !== chh) { H.cv = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(cw, chh) : Object.assign(document.createElement("canvas"), { width: cw, height: chh }); H.cx = H.cv.getContext("2d"); }
            H.cx.clearRect(0, 0, cw, chh); H.cx.drawImage(img, 0, 0, cw, chh);
            overlay = typeof H.cv.transferToImageBitmap === "function" ? H.cv.transferToImageBitmap() : H.cv;
          }
          if (overlay !== H.cv) { H.snapshots.delete(key); H.snapshots.set(key, overlay); while (H.snapshots.size > 2) { const [oldKey, bitmap] = H.snapshots.entries().next().value; H.snapshots.delete(oldKey); bitmap.close(); } }
          const g = M.gl, t = H.over || g.createTexture();
          if (!H.over) { t.lcId = ++R.ids; g.activeTexture(g.TEXTURE2); g.bindTexture(g.TEXTURE_2D, t);
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE); }
          g.activeTexture(g.TEXTURE2); g.bindTexture(g.TEXTURE_2D, t);
          g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
          if (H.over && H.texW === cw && H.texH === chh) g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, g.RGBA, g.UNSIGNED_BYTE, overlay);
          else g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, overlay);
          H.texW = cw; H.texH = chh; g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); // (premultiplied: no dark fringe at text edges)
          t.lcId = ++R.ids; // (a new snapshot redraws the water)
          const bg = getComputedStyle(z).backgroundColor.match(/[\d.]+/g);
          Object.assign(H, { over: t, ok: true, w: W, h: Hh, scroll, captures: H.captures + (cached ? 0 : 1), cacheHits: H.cacheHits + (cached ? 1 : 0), ms: performance.now() - t0, mainMs: (t1 - t0) + (performance.now() - t2), bg: bg ? bg.slice(0, 3).map((v) => v / 255) : H.bg });
          if (gen === H.gen) H.dirty = false;
          wake();
        } catch (err) { H.failed = String((err && err.message) || err); H.ok = false; if (H.css === null) H.never = true; } // (file:// keeps its stylesheet rules unreadable: no hero refraction, asked once)
        finally { H.busy = false; wake(); }
      };
      if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 300 }); else setTimeout(run, 50);
    }
    // After a scroll, a resize or a navigation the hero's snapshot is retaken as soon as the page settles, before the
    // pointer reaches the hero, so the water arriving there refracts at once. Only a snapshot that no longer fits the
    // viewport is retaken here (a content change is refreshed by refraction() while the water is there), and never while
    // the pointer is in the sidebar
    let prewarmAt = 0;
    function prewarmHero(now) {
      const H = R.hero;
      if (!M.ok || H.busy || H.never || now - prewarmAt < 120 || (S.mediaEl && S.mediaEl.matches(SEL.zone))) return;
      prewarmAt = now;
      const w = innerWidth, h = innerHeight, scroll = scrollY;
      if (H.ok && H.w === w && H.h === h && Math.abs(H.scroll - scroll) < 0.5) return;
      if (lastTarget && lastTarget.closest && lastTarget.closest("#nav")) return;
      const z = document.querySelector(".section.active " + SEL.zone);
      if (!z) return;
      const b = z.getBoundingClientRect(); if (b.bottom <= 0 || b.top >= h) return;
      // (the hero stays put while the index scrolls over it: only a hero whose lower part, the summary strip, is exposed)
      const exposed = document.elementFromPoint(innerWidth / 2, Math.max(0, Math.min(h, b.bottom) - 40)); if (!exposed || !z.contains(exposed)) return;
      if (H.z !== z) watchHero(z);
      if (w !== H.gw || h !== H.gh || scroll !== H.gs) { if (H.gw) H.geoT = now; H.gw = w; H.gh = h; H.gs = scroll; }
      // (a longer settle than the water's own: a pause between bursts of wheel scrolling is not the page coming to rest)
      const wait = 400 - (now - H.geoT);
      if (wait <= 0) captureHero(z); else if (!H.settle) H.settle = setTimeout(() => { H.settle = 0; wake(); }, wait + 10);
    }
    function refraction(tx, ty, e, o) {
      const rf = R.rf; rf.fill(0); R.want = 0;
      if (!o) { if (R.el) { R.el = null; R.ready = false; R.mix = 0; R.gen++; } return; }
      rf[1] = tx; rf[2] = ty; rf[3] = e;
      if (o.kind === 1) { // a marked render
        const el = o.el, b = o.b;
        if (el !== R.el) { R.el = el; R.ready = false; R.mix = 0; R.gen++; }
        else if (el.tagName === "IMG" && (Math.abs(b.width - R.bw) > 0.5 || Math.abs(b.height - R.bh) > 0.5 || (el.currentSrc || el.src) !== R.src)) { R.ready = false; R.mix = 0; } // a new image or size
        if (!R.ready) renderTexture(el, b); // (picked up from the cache once made)
        if (!R.ready) return;
        R.want = 1; if (R.mix <= 0) return;
        const fb = fitBox(el, b, R.fit); R.texA = R.tex; R.texB = R.blank;
        rf[0] = R.mix; rf[4] = b.left; rf[5] = b.top; rf[6] = b.right; rf[7] = b.bottom; rf[8] = fb.x; rf[9] = fb.y; rf[10] = fb.w; rf[11] = fb.h; rf[12] = 1; rf[26] = R.tex.lcId;
        return;
      }
      if (R.el) { R.el = null; R.ready = false; R.gen++; }
      const H = R.hero;
      if (H.z !== o.z) watchHero(o.z);
      if (o.w !== H.gw || o.h !== H.gh || o.scroll !== H.gs) { if (H.gw) H.geoT = performance.now(); H.gw = o.w; H.gh = o.h; H.gs = o.scroll; } // (the page scrolling or resizing)
      const fits = H.ok && H.w === o.w && H.h === o.h && Math.abs(H.scroll - o.scroll) < 0.5;
      if (!fits || H.dirty) {
        const wait = C.heroSettleMs - (performance.now() - H.geoT);
        if (wait <= 0) captureHero(o.z);
        else if (!H.settle) H.settle = setTimeout(() => { H.settle = 0; wake(); }, wait + 10); // (once it has settled, even if the drop is still)
      }
      if (!fits) { R.mix = 0; return; } // (a snapshot of another geometry is never used)
      let A = o.A, B = o.B, tA = A ? texFrom(A.img, "hero:" + (A.img.currentSrc || A.img.src), {}) : null, tB = B ? texFrom(B.img, "hero:" + (B.img.currentSrc || B.img.src), {}) : null;
      // a montage frame that has only begun to fade in, whose texture is still being made: the frame beneath it alone
      // (the new one is nearly transparent then), so the water never blinks out at a montage step
      if (!tA && tB) { A = B; tA = tB; B = null; tB = null; }
      if (!tA || (B && !tB) || !o.refractable || o.box[2] <= o.box[0] || o.box[3] <= o.box[1]) return;
      R.want = 1; if (R.mix <= 0) return;
      // (the frames drift slowly: their boxes are kept to a quarter pixel, so a resting drop is not redrawn every frame)
      const q = (v) => Math.round(v * 4) / 4, fa = fitBox(A.img, A.b, "cover"); R.texA = tA; R.texB = tB || R.blank;
      rf[0] = R.mix; rf[4] = o.box[0]; rf[5] = o.box[1]; rf[6] = o.box[2]; rf[7] = o.box[3]; rf[8] = q(fa.x); rf[9] = q(fa.y); rf[10] = q(fa.w); rf[11] = q(fa.h); rf[12] = Math.round(A.op * 255) / 255;
      if (B) { const fb = fitBox(B.img, B.b, "cover"); rf[13] = q(fb.x); rf[14] = q(fb.y); rf[15] = q(fb.w); rf[16] = q(fb.h); rf[17] = Math.round(B.op * 255) / 255; }
      rf[18] = 0; rf[19] = 0; rf[20] = H.w; rf[21] = H.h; rf[22] = 1; rf[23] = H.bg[0]; rf[24] = H.bg[1]; rf[25] = H.bg[2];
      rf[26] = tA.lcId; rf[27] = tB ? tB.lcId : 0; rf[28] = H.over.lcId;
    }
    function refractUniforms(g) {
      const rf = R.rf, Ux = M.U, on = rf[0] > 0, bind = (unit, t) => { g.activeTexture(g.TEXTURE0 + unit); g.bindTexture(g.TEXTURE_2D, t || R.blank); };
      g.uniform1f(Ux.uRefract, rf[0]);
      bind(0, on ? R.texA : R.blank); bind(1, on && rf[17] > 0 ? R.texB : R.blank); bind(2, on && rf[22] > 0 ? R.hero.over : R.blank);
      if (!on) return;
      g.uniform2f(Ux.uOrg, rf[1], rf[2]); g.uniform1f(Ux.uEff, rf[3]); g.uniform4f(Ux.uBox, rf[4], rf[5], rf[6], rf[7]);
      g.uniform4f(Ux.uMap, rf[8], rf[9], rf[10], rf[11]); g.uniform1f(Ux.uOpA, rf[12]); g.uniform4f(Ux.uMapB, rf[13], rf[14], Math.max(rf[15], 1), Math.max(rf[16], 1)); g.uniform1f(Ux.uOpB, rf[17]);
      g.uniform4f(Ux.uOverMap, rf[18], rf[19], Math.max(rf[20], 1), Math.max(rf[21], 1)); g.uniform1f(Ux.uOver, rf[22]); g.uniform3f(Ux.uHeroBg, rf[23], rf[24], rf[25]);
    }
    // this frame's geometry (cur) into one presentation's program, then one full-canvas draw
    function paint(g, Ux) {
      g.uniform2f(Ux.uCenter, cur[0], cur[1]); g.uniform2f(Ux.uAxis, cur[2], cur[3]); g.uniform1f(Ux.uStretch, cur[4]); g.uniform1f(Ux.uCompress, cur[10]);
      g.uniform1f(Ux.uRadius, cur[5]); g.uniform1f(Ux.uNoiseAmp, cur[6]); g.uniform1f(Ux.uCell, cur[11]); g.uniform1f(Ux.uNoiseT, cur[12]); g.uniform1f(Ux.uAlpha, cur[7]);
      for (let i = 0; i < WN; i++) { wakeU[4 * i] = cur[63 + 3 * i]; wakeU[4 * i + 1] = cur[64 + 3 * i]; wakeU[4 * i + 2] = cur[65 + 3 * i]; wakeU[4 * i + 3] = 0; }
      g.uniform4fv(Ux.uWake, wakeU); g.uniform1f(Ux.uWakeK, cur[78]);
      for (let k = 0; k < MAX; k++) {
        const o = 13 + 9 * k;
        beadU[4 * k] = cur[o]; beadU[4 * k + 1] = cur[o + 1]; beadU[4 * k + 2] = cur[o + 2]; beadU[4 * k + 3] = cur[o + 3];
        beadShapeU[3 * k] = cur[o + 4]; beadShapeU[3 * k + 1] = cur[o + 5]; beadShapeU[3 * k + 2] = cur[o + 6];
        beadKU[k] = cur[58 + k];
      }
      g.uniform4fv(Ux.uBead, beadU); g.uniform3fv(Ux.uBeadShape, beadShapeU); g.uniform1fv(Ux.uBeadK, beadKU);
      g.clear(g.COLOR_BUFFER_BIT);
      // The shader/output are unchanged. Clear the entire old frame, then shade only a conservative physical union
      // (body, noise, root/neck, body beads, AA/cohesion padding and the maximum optical reach). Tile beads own their bounds.
      let join = cur[78]; for (let k = 0; k < MAX; k++) join = Math.max(join, cur[58 + k]);
      const pad = 2 * join + (C.aaWidth + 2 + (g === M.gl ? 48 : 0)) * S.effDpr;
      const stretch = Math.max(cur[4], cur[10], 1), r = (cur[5] + cur[6] / Math.max(0.1, Math.min(cur[4], cur[10])) + pad) * stretch;
      let left = cur[0] - r, right = cur[0] + r, bottom = cur[1] - r, top = cur[1] + r;
      const include = (x, y, radius) => { left = Math.min(left, x - radius); right = Math.max(right, x + radius); bottom = Math.min(bottom, y - radius); top = Math.max(top, y + radius); };
      for (let k = 0; k < MAX; k++) { const o = 13 + 9 * k; if (cur[o + 2] > 0) include(cur[o], cur[o + 1], cur[o + 2] * (1 + cur[o + 6]) + pad); }
      if (cur[78] > 0) for (let k = 0; k < WN; k++) { const o = 63 + 3 * k; if (cur[o + 2] > 0) include(cur[o], cur[o + 1], cur[o + 2] + pad); }
      left = Math.max(0, Math.floor(left)); bottom = Math.max(0, Math.floor(bottom)); right = Math.min(S.backingW, Math.ceil(right)); top = Math.min(S.backingH, Math.ceil(top));
      g.enable(g.SCISSOR_TEST); g.scissor(left, bottom, Math.max(0, right - left), Math.max(0, top - bottom));
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
      g.disable(g.SCISSOR_TEST);
    }

    // ---- boot: the native cursor stays until this has fully succeeded
    await initGL();
    if (failed) return;
    tiles = S.webgl2 ? await createBeadTiles(C.beadCssSize, C.zIndex, created, false) : null;
    if (failed) return;
    if (S.webgl2) await initMedia();
    if (failed) return;
    sizeBacking(); watchDpr(); bootReady = true; evaluate();

    // Independent, temporary viewport optics. The cursor's state, sources and loop never read the ripple.
    const ripple = viewportRipple(() => S.active && !failed, on, created, cleanups, readCss, () => wake());

    // a read-only status (for the Observatory's own integration checks)
    api.status = () => ({ version: VERSION, active: S.active, reason: api.reason, visible: S.visible, suspended: S.suspended, sleeping: S.sleeping, loop: S.loopRunning,
      webgl2: S.webgl2, glError: S.glError, contextLost: S.contextLost, nativeHidden: root.classList.contains("lc-hide-native"),
      interactive: !!S.interactiveEl, ignored: !!S.ignoreEl, pointerType: S.pointerType, raw: [S.rawX, S.rawY], render: [S.renderX, S.renderY], v: [S.vx, S.vy],
      armedMs: D.trig.armedMs, disarms: S.disarms, goo: { on: D.spine.on, energy: D.spine.E, tail: D.spine.L, beads: live(D), shed: D.spine.shed },
      frames: S.frames, draws: S.draws, beadDraws: tiles ? tiles.draws : 0, sleeps: S.sleeps, wakes: S.wakes, workMs: S.workMs,
      dpr: S.dpr, backing: [S.backingW, S.backingH], zIndex: C.zIndex, ripple: ripple.status(),
      material: { media: !!S.mediaEl, zone: !!(S.mediaEl && S.mediaEl.matches(SEL.zone)), value: S.mat, shown: shownU, ok: M.ok, error: M.error, draws: M.draws, beadDraws: M.tiles ? M.tiles.draws : 0,
        water: WATER_NAME, glass: WATER_NAME, presentation: resolveCursorPresentation().mode, refraction: R.mix, refracting: R.rf[22] > 0 ? "hero" : R.el ? R.el.id || R.el.tagName.toLowerCase() : R.rf[0] > 0 ? "viewport" : null,
        heroOptic: { ok: R.hero.ok, captures: R.hero.captures, cacheHits: R.hero.cacheHits, cacheEntries: R.hero.snapshots.size, ms: R.hero.ms, mainMs: R.hero.mainMs, dirty: R.hero.dirty, failed: R.hero.failed } } });
    // ?cursor=test: frame-exact hooks for the lab's equivalence and integration tools (no visible difference)
    let loseExt = null;
    if (TEST) api.test = {
      P, D, B, S, M, R, canvas, tiles: () => tiles,
      ripple: ripple.test,
      setMotionOptics(coupled) { if (M.ok) { M.gl.useProgram(M.prog); M.gl.uniform1f(M.U.uCoupled, coupled ? 1 : 0); M.prev.fill(NaN); } },
      setMaterial(v) { S.matForce = v === 0 || v === 1 ? v : null; wake(); }, // captures only: 0 or 1 forces a material, null releases
      // diagnostics only: override some of the water's constants (null restores the candidate); the geometry is untouched
      setWater(over) { WM = over ? Object.assign({}, WATER[WATER_NAME], over) : WATER[WATER_NAME]; if (M.ok) { M.gl.useProgram(M.prog); mediaConstants(M.gl, M.U); M.sizeDirty = true; M.prev.fill(NaN); } if (M.tiles) M.tiles.reapply(); wake(); return Object.assign({}, WM); },
      setFrozen(onFrozen) { S.frozen = !!onFrozen; if (!onFrozen) lastTs = 0; wake(); },
      advance(ms, stepMs = 1000 / 120) { let left = ms; while (left > 1e-6) { const h = Math.min(stepMs, left); integrate(h / 1000); left -= h; } prev.fill(NaN); if (S.visible) draw(); },
      feed(x, y, t) { S.pointerType = "mouse"; S.buttons = 0; S.inside = true; sample(x, y, t); classify(document.elementFromPoint(x, y)); },
      resetBody() { Object.assign(B, createBodyState()); dropReset(); D.seed = 0x2f6b1d3; D.body.px = NaN; prev.fill(NaN); },
      readMask() { if (!gl || gl.isContextLost()) return null; prev.fill(NaN); draw(); const w = S.backingW, h = S.backingH, px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return { w, h, px }; },
      readBeadMask(t) { return tiles && tiles.visible ? tiles.readMask(t) : null; },
      readMediaMask() { if (!M.ok || shownU === 0) return null; M.prev.fill(NaN); draw(); const w = S.backingW, h = S.backingH, px = new Uint8Array(w * h * 4); M.gl.readPixels(0, 0, w, h, M.gl.RGBA, M.gl.UNSIGNED_BYTE, px); return { w, h, px }; },
      benchDraw(n = 200) { if (!gl || gl.isContextLost()) return NaN; const fin = () => { gl.finish(); if (tiles) tiles.finish(); if (M.ok) { M.gl.finish(); if (M.tiles) M.tiles.finish(); } };
        fin(); const t0 = performance.now(); for (let i = 0; i < n; i++) { prev.fill(NaN); M.prev.fill(NaN); R.prev.fill(NaN); if (tiles) tiles.invalidate(); if (M.tiles) M.tiles.invalidate(); draw(); } fin(); return (performance.now() - t0) / n; },
      loseContext() { loseExt = gl && gl.getExtension("WEBGL_lose_context"); if (loseExt) loseExt.loseContext(); return !!loseExt; },
      restoreContext() { if (loseExt) loseExt.restoreContext(); return !!loseExt; }, // (a lost context hands out no extensions: keep the one used to lose it)
      failNow() { fail("forced by a test"); },
    };
    api.kill = () => fail("switched off at runtime");
  } catch (err) { fail(String((err && err.message) || err)); }
  })();

  function viewportRipple(allowed, listen, nodes, disposers, readPageCss, changed) {
    // CSS px throughout; DPR changes only the backing texture. Neutral RGB sampling: the cursor alone disperses colour.
    const preset = QS.get("ripple") === "strong" ? "strong" : "reference";
    const cfg = Object.freeze({ speed: 500, width: 110, amplitude: preset === "strong" ? 20 : 14, recovery: 0.24, recoveryDelay: 0.65, attack: 0.055, decay: 1.8, distance: 1100, lifetime: 3, endFade: 2.35, minVisible: 160, scrollThreshold: 8, max: 8, cap: 24, maxDpr: 2, maxPixels: 8400000 });
    const state = { enabled: location.protocol !== "file:" && QS.get("ripple") !== "off", reason: "", ready: false, busy: false, dirty: true,
      draws: 0, captures: 0, uploads: 0, callbackMs: 0, maxCallbackMs: 0, captureMs: 0, mainMs: 0, latencyMs: 0, frames: 0,
      cancellations: 0, lastCancel: "", memoryBytes: 0, active: false, lastCaptured: 0, w: 0, h: 0, dpr: 1, scroll: 0, hash: "" };
    const waves = [], packed = new Float32Array(32), imageCache = new Map(), css = { css: null, fix: "" };
    let canvas = null, g = null, program = null, texture = null, vao = null, meshBuffer = null, uniforms = {}, frameId = 0, refresh = 0, idleId = 0, epoch = 0, dead = false, frozen = false;
    let mesh = new Float32Array(0), meshBytes = 0;
    let plate = null, composite = null, sourceFrame = null, textureW = 0, textureH = 0, capturePromise = null, maxTexture = 8192, pendingClick = null, sourceScrolls = new WeakMap(), sourceRevision = 0, lastMotion = -Infinity, lastScroll = -Infinity;
    const canvasStamps = new Map(), scratch = document.createElement("canvas"); scratch.width = 32; scratch.height = 16;
    const navPanel = document.getElementById("nav");
    const scratchContext = scratch.getContext("2d", { willReadFrequently: true });
    function canvasStamp(el) {
      scratchContext.clearRect(0, 0, 32, 16); scratchContext.drawImage(el, 0, 0, 32, 16);
      const data = scratchContext.getImageData(0, 0, 32, 16).data; let hash = 2166136261;
      for (const byte of data) hash = Math.imul(hash ^ byte, 16777619); return el.width + ':' + el.height + ':' + (hash >>> 0);
    }
    const own = el => el && el.closest && el.closest('.lc-canvas, .lc-canvas-media, .lc-bead, .lc-bead-media, .lc-ripple, #lc-native-cursor');
    const sourceUsable = () => location.protocol !== "file:" && allowed() && !dead && document.visibilityState === "visible";
    const usable = () => state.enabled && sourceUsable();
    const backingScale = () => Math.min(devicePixelRatio || 1, cfg.maxDpr, Math.sqrt(cfg.maxPixels / Math.max(1, innerWidth * innerHeight)), maxTexture / innerWidth, maxTexture / innerHeight);
    const geometryFits = () => state.ready && state.w === innerWidth && state.h === innerHeight && state.dpr === backingScale() && Math.abs(state.scroll - scrollY) <= cfg.scrollThreshold && state.hash === location.hash;
    const fits = () => geometryFits() && !state.dirty;
    function clear(reason) {
      epoch++; pendingClick = null; waves.length = 0; if (frameId) cancelAnimationFrame(frameId); frameId = 0; state.active = false;
      if (canvas) canvas.style.display = "none";
      if (reason) { state.lastCancel = reason; state.cancellations++; }
    }
    function schedule() {
      clearTimeout(refresh); if (idleId && typeof cancelIdleCallback === "function") cancelIdleCallback(idleId); idleId = 0;
      if (!sourceUsable()) return;
      refresh = setTimeout(() => {
        refresh = 0;
        const run = () => {
          idleId = 0;
          if (!sourceUsable() || state.active || !state.dirty) return;
          // Idle prewarming yields to real input. Native clicks still request their source immediately. Nor does it run
          // while the sidebar is open: a page snapshot with the panel open is invalid as soon as the panel closes.
          if (performance.now() - lastMotion < 160 || performance.now() - lastScroll < 320 || (navPanel && navPanel.classList.contains("open"))) { schedule(); return; }
          capture();
        };
        if (typeof requestIdleCallback === "function") idleId = requestIdleCallback(run, { timeout: 400 }); else run();
      }, 320);
    }
    function invalidate(reason, hard = true) {
      sourceRevision++;
      state.dirty = true; state.lastInvalidation = reason;
      if (hard) { state.ready = false; clear(reason); changed(); }
      schedule();
    }
    let initPromise = null;
    function init() {
      if (!initPromise) initPromise = initContext().finally(() => { initPromise = null; });
      return initPromise;
    }
    async function initContext() {
      if (g && g.isContextLost()) return false; // wait for restoration; compiling a lost context would disable recovery
      if (g && !g.isContextLost()) return true;
      try {
        if (!canvas) {
          canvas = document.createElement("canvas"); canvas.className = "lc-ripple"; canvas.setAttribute("aria-hidden", "true");
          canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;pointer-events:none;z-index:99;display:none;contain:strict';
          document.body.appendChild(canvas); nodes.push(canvas);
          listen(canvas, "webglcontextlost", e => { e.preventDefault(); state.ready = false; state.memoryBytes = 0; invalidate("ripple context lost"); }, false);
          listen(canvas, "webglcontextrestored", () => { g = null; texture = null; state.ready = false; schedule(); }, false);
        }
        g = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
        if (!g) throw new Error("WebGL2 unavailable");
        maxTexture = g.getParameter(g.MAX_TEXTURE_SIZE);
        const fragment = `#version 300 es
precision highp float;
uniform sampler2D uSource; uniform vec2 uViewport; uniform float uDpr; uniform int uCount; uniform vec4 uWave[8];
uniform float uAmplitude; out vec4 outColor;
void main() {
  vec2 pixel = vec2(gl_FragCoord.x, uViewport.y * uDpr - gl_FragCoord.y) / uDpr, displacement = vec2(0.0);
  for (int i = 0; i < 8; ++i) {
    if (i >= uCount) break;
    vec2 delta = pixel - uWave[i].xy; float radius = length(delta), age = uWave[i].z;
    float packet = (radius - age * ${cfg.speed.toFixed(1)}) / ${cfg.width.toFixed(1)};
    if (abs(packet) > 3.3 && abs(packet + ${cfg.recoveryDelay}) > 3.3) continue; // invisible Gaussian tails: avoid fullscreen trigonometry
    float primary = sin(6.28318530718 * packet) * exp(-2.0 * packet * packet);
    float trailing = packet + ${cfg.recoveryDelay};
    float recovery = ${cfg.recovery} * sin(6.28318530718 * trailing) * exp(-1.2 * trailing * trailing) * exp(-0.8 * age);
    float attack = smoothstep(0.0, ${cfg.attack}, age), ending = 1.0 - smoothstep(${cfg.endFade}, ${cfg.lifetime.toFixed(1)}, age);
    float envelope = exp(-${cfg.decay} * age - radius / ${cfg.distance.toFixed(1)}) * attack * ending;
    displacement += delta / max(radius, 1.0) * (primary + recovery) * envelope * uAmplitude;
  }
  displacement *= min(1.0, 24.0 / max(length(displacement), 0.0001));
  // Return continuously to the live DOM outside the travelling packet. Clamp to texel centres; never wrap at an edge.
  float alpha = smoothstep(0.03, 0.35, length(displacement));
  vec2 uv = clamp((pixel + displacement) / uViewport, 0.5 / (uViewport * uDpr), 1.0 - 0.5 / (uViewport * uDpr));
  outColor = vec4(texture(uSource, uv).rgb * alpha, alpha);
}`;
        const vertex = `#version 300 es
layout(location = 0) in vec2 position;
uniform vec2 uViewport;
void main() { gl_Position = vec4(position / uViewport * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0); }`;
        program = await linkedProgram(g, vertex, fragment, "ripple");
        if (dead) { g.deleteProgram(program); program = null; return false; }
        vao = g.createVertexArray(); g.bindVertexArray(vao); g.useProgram(program);
        meshBuffer = g.createBuffer(); meshBytes = 0; g.bindBuffer(g.ARRAY_BUFFER, meshBuffer); g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
        for (const n of ["uSource", "uViewport", "uDpr", "uCount", "uWave", "uAmplitude"]) uniforms[n] = g.getUniformLocation(program, n);
        texture = g.createTexture(); g.bindTexture(g.TEXTURE_2D, texture);
        textureW = textureH = 0;
        for (const p of [g.TEXTURE_MIN_FILTER, g.TEXTURE_MAG_FILTER]) g.texParameteri(g.TEXTURE_2D, p, g.LINEAR);
        for (const p of [g.TEXTURE_WRAP_S, g.TEXTURE_WRAP_T]) g.texParameteri(g.TEXTURE_2D, p, g.CLAMP_TO_EDGE);
        g.disable(g.BLEND); g.disable(g.DEPTH_TEST); g.clearColor(0, 0, 0, 0); return true;
      } catch (err) { if (g && g.isContextLost()) { clear("ripple context lost"); return false; } state.enabled = false; state.reason = String(err.message || err); clear("unavailable"); return false; }
    }
    async function mediaData(el, box, dpr) {
      if (el.tagName === "CANVAS") canvasStamps.set(el, canvasStamp(el));
      const key = el.tagName === "IMG" ? (el.currentSrc || el.src) + ':' + Math.round(box.width * dpr) + ':' + Math.round(box.height * dpr) : "";
      if (key && imageCache.has(key)) return imageCache.get(key);
      const c = document.createElement("canvas"), sourceW = el.naturalWidth || el.width, sourceH = el.naturalHeight || el.height;
      // A lazy thumbnail without intrinsic pixels was previously encoded as the empty canvas URL.
      // toBlob returns null for that zero-size canvas; retain the same transparent placeholder until its load event.
      if (!sourceW || !sourceH || (el.tagName === "IMG" && !el.naturalWidth)) return "data:,";
      // No decode() here: calling it on the page's <img> (or on any image of the same URL) changes how the browser
      // rasterizes the displayed image when it is downscaled (Render Lab at DPR1: 32,062 pixels, up to 13 levels), and
      // an interleaved A/B measured no main-thread benefit from it. The approved runtime drew the element directly.
      // Preserve the image's aspect ratio so object-fit/object-position still operate on the same intrinsic source.
      const k = Math.min(1, Math.max(box.width * dpr / sourceW, box.height * dpr / sourceH));
      c.width = Math.max(1, Math.round(sourceW * k)); c.height = Math.max(1, Math.round(sourceH * k)); c.getContext("2d").drawImage(el, 0, 0, c.width, c.height);
      // PNG encoding must not block input/scroll. The decoded pixels and source dimensions are unchanged.
      const blob = await new Promise(resolve => c.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("media encoding unavailable");
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
      if (key && data.length * 2 <= 16777216) { imageCache.set(key, data); while (imageCache.size > 8 || [...imageCache.values()].reduce((n, s) => n + s.length * 2, 0) > 16777216) imageCache.delete(imageCache.keys().next().value); }
      return data;
    }
    function uploadSource() {
      if (!plate || !g || g.isContextLost()) return;
      if (!composite || composite.width !== plate.width || composite.height !== plate.height) composite = new OffscreenCanvas(plate.width, plate.height);
      const x = composite.getContext("2d"), dpr = plate.width / innerWidth;
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.globalAlpha = 1; x.fillStyle = getComputedStyle(document.body).backgroundColor; x.fillRect(0, 0, innerWidth, innerHeight);
      const hero = document.getElementById("hero");
      if (hero && hero.closest('.section.active')) {
        const box = hero.getBoundingClientRect(); x.save(); x.beginPath(); x.rect(box.left, box.top, box.width, box.height); x.clip(); x.fillStyle = getComputedStyle(hero).backgroundColor; x.fillRect(box.left, box.top, box.width, box.height);
        // Montage images are drawn at their *current* object-fit box, opacity and parallax. They never enter the DOM
        // plate and never need PNG encoding. A new wave reads the live render once, not an old animated cached frame.
        for (const frame of hero.querySelectorAll('.hero-frame')) {
          const opacity = Number(getComputedStyle(frame).opacity), img = frame.querySelector('img');
          if (!opacity || !img || !img.complete || !img.naturalWidth) continue;
          const b = img.getBoundingClientRect(), k = Math.max(b.width / img.naturalWidth, b.height / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
          x.globalAlpha = opacity; x.drawImage(img, b.left + (b.width - w) / 2, b.top + (b.height - h) / 2, w, h);
        }
        x.restore();
      }
      const render = document.querySelector('.section.active #rl-img');
      if (render && render.complete && render.naturalWidth) {
        const b = render.getBoundingClientRect(), parent = render.closest('.frame').getBoundingClientRect(), cs = getComputedStyle(render);
        const k = cs.objectFit === 'contain' ? Math.min(b.width / render.naturalWidth, b.height / render.naturalHeight) : Math.max(b.width / render.naturalWidth, b.height / render.naturalHeight);
        const w = cs.objectFit === 'fill' ? b.width : render.naturalWidth * k, h = cs.objectFit === 'fill' ? b.height : render.naturalHeight * k;
        x.save(); x.beginPath(); x.rect(parent.left, parent.top, parent.width, parent.height); x.clip(); x.fillStyle = getComputedStyle(render.parentElement).backgroundColor; x.fillRect(parent.left, parent.top, parent.width, parent.height);
        x.drawImage(render, b.left + (b.width - w) / 2, b.top + (b.height - h) / 2, w, h); x.restore();
      }
      x.globalAlpha = 1; x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(plate, 0, 0);
      // Transfer the already-rasterized canvas frame instead of forcing a cross-context canvas readback on each upload.
      // Unlike rasterizing a foreignObject SVG through createImageBitmap, this transfers the exact existing 2D pixels.
      const frame = composite.transferToImageBitmap();
      g.bindTexture(g.TEXTURE_2D, texture); g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
      if (textureW === frame.width && textureH === frame.height) g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, g.RGBA, g.UNSIGNED_BYTE, frame);
      else g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, frame);
      textureW = frame.width; textureH = frame.height;
      if (sourceFrame) sourceFrame.close(); sourceFrame = frame; state.uploads++;
      changed();
    }
    function capture() {
      if (capturePromise) return capturePromise;
      capturePromise = captureSource().finally(() => { capturePromise = null; }); return capturePromise;
    }
    async function captureSource() {
      if (state.busy || !sourceUsable() || !(await init()) || !sourceUsable()) return false;
      state.busy = true; const generation = epoch, revision = sourceRevision, t0 = performance.now(), w = innerWidth, h = innerHeight, scroll = scrollY, hash = location.hash, dpr = backingScale();
      let slice = t0, mainMs = 0;
      const current = () => generation === epoch && revision === sourceRevision && sourceUsable() && !g.isContextLost() && w === innerWidth && h === innerHeight && scroll === scrollY && hash === location.hash;
      const yieldSource = async () => {
        mainMs += performance.now() - slice;
        await new Promise(resolve => setTimeout(resolve, 0));
        slice = performance.now(); if (!current()) throw new Error("stale viewport generation");
      };
      try {
        if (css.css === null) readPageCss(css);
        canvasStamps.clear();
        async function copy(el) {
          // Keep each preparation task below a frame budget; detached clone writes never touch live layout.
          if (performance.now() - slice > 4) await yieldSource();
          sourceScrolls.set(el, { x: el.scrollLeft, y: el.scrollTop });
          if (own(el) || el.matches('script, style, link, iframe, video, .hero-stage')) return null;
          const cs = getComputedStyle(el), box = el.getBoundingClientRect();
          if (cs.display === "none" || (cs.visibility === "hidden" && el.matches('.drawer'))) return null;
          let c = el.cloneNode(false);
          // The closed, fixed nav keeps its background/shadow, but its offscreen labels contribute no source pixels.
          if (el.matches('.navpanel') && box.right < 0) return c;
          // Offscreen index rows are independent flow boxes. Preserve their measured box without preparing hidden
          // text/thumb descendants; they cannot contribute pixels to this viewport source.
          if (el.matches('.toc > li') && (box.bottom < -32 || box.top > h + 32)) {
            c.style.cssText += `;box-sizing:border-box;width:${box.width}px;height:${box.height}px`; return c;
          }
          if (el.tagName === "CANVAS" || el.tagName === "IMG") {
            if (!(el.naturalWidth || el.width)) return null;
            if (el.tagName === "CANVAS") { c = document.createElement("img"); for (const a of el.attributes) c.setAttribute(a.name, a.value); c.style.width = cs.width; c.style.height = cs.height; }
            c.removeAttribute("srcset"); c.removeAttribute("loading");
            // Keep offscreen flow boxes: dropping preceding content would misalign a scrolled snapshot. Only encode
            // visible pixels; transparent stand-ins retain the intrinsic dimensions of offscreen images/charts.
            const visible = box.bottom > -32 && box.top < h + 32 && box.right > -32 && box.left < w + 32;
            const liveRender = el.id === "rl-img";
            let data = 'data:image/svg+xml,%3Csvg xmlns=%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width=%221%22 height=%221%22%2F%3E';
            if (visible && !liveRender) { mainMs += performance.now() - slice; data = await mediaData(el, box, dpr); slice = performance.now(); if (!current()) throw new Error("stale viewport generation"); }
            c.setAttribute("src", data);
            if (!visible || liveRender) { c.style.width = cs.width; c.style.height = cs.height; }
          }
          if (c.style) {
            for (const p of ["font-style", "font-weight", "font-stretch", "font-size", "line-height", "font-family", "font-variation-settings", "font-feature-settings", "font-variant-numeric", "background-color", "background-image", "background-position", "background-size", "background-repeat", "opacity", "transform", "transform-origin"]) c.style.setProperty(p, cs.getPropertyValue(p));
          }
          if (el.id === "hero") c.style.backgroundColor = "transparent";
          const render = el.querySelector && el.querySelector(':scope > #rl-img');
          if (render && render.complete && render.naturalWidth) c.style.backgroundColor = "transparent";
          const sx = el === document.body ? 0 : el.scrollLeft, sy = el === document.body ? 0 : el.scrollTop;
          for (const n of el.childNodes) {
            let ch = n.nodeType === 1 ? await copy(n) : n.nodeType === 3 ? n.cloneNode() : null;
            if (!ch) continue;
            // cloneNode omits internal scroll offsets. Shift children while preserving their flow and selectors;
            // fixed/sticky chrome already uses its actual viewport box.
            if (sx || sy) {
              if (n.nodeType === 3) { ch = document.createElement("span"); ch.textContent = n.textContent; ch.style.color = cs.color; }
              const ns = n.nodeType === 1 ? getComputedStyle(n) : null;
              if (!ns || !["fixed", "sticky"].includes(ns.position)) {
                ch.style.position = ns && ns.position === "absolute" ? "absolute" : "relative";
                ch.style.left = ((ns ? parseFloat(ns.left) || 0 : 0) - sx) + "px";
                ch.style.top = ((ns ? parseFloat(ns.top) || 0 : 0) - sy) + "px";
              }
            }
            c.appendChild(ch);
          }
          if (el instanceof HTMLInputElement) { c.setAttribute("value", el.value); if (el.checked) c.setAttribute("checked", ""); else c.removeAttribute("checked"); }
          if (el instanceof HTMLTextAreaElement) c.textContent = el.value;
          if (el instanceof HTMLSelectElement) [...c.options].forEach((o, i) => { if (el.options[i].selected) o.setAttribute("selected", ""); else o.removeAttribute("selected"); });
          // Sticky elements have already moved in the live viewport. Hold their actual box while retaining a flow spacer.
          if (cs.position === "sticky" && box.width > 0 && box.height > 0) {
            c.style.cssText += `;position:fixed!important;left:${box.left}px!important;top:${box.top}px!important;width:${box.width}px!important;height:${box.height}px!important;margin:0!important`;
            const wrap = document.createElement("div"); wrap.style.cssText = `width:${box.width}px;height:${box.height}px;margin:${cs.margin}`; wrap.appendChild(c); return wrap;
          }
          return c;
        }
        const body = await copy(document.body); if (!body) throw new Error("viewport unavailable");
        body.style.position = "relative"; body.style.top = -scroll + "px"; body.style.width = w + "px"; body.style.margin = "0"; body.style.backgroundColor = "transparent";
        const rootStyle = getComputedStyle(document.documentElement), html = document.createElement("html"); html.setAttribute("xmlns", "http://www.w3.org/1999/xhtml"); html.className = document.documentElement.className;
        html.style.cssText = `width:${w}px;height:${h}px;overflow:hidden;font-size:${rootStyle.fontSize};background:transparent`;
        const st = document.createElement("style"); st.textContent = css.css + '\n*{animation:none!important;transition:none!important;caret-color:transparent!important}'; html.append(st, body);
        const serialized = new XMLSerializer().serializeToString(html), img = new Image(), t1 = performance.now();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="${w}" height="${h}">${serialized}</foreignObject></svg>`);
        mainMs += performance.now() - slice;
        await img.decode();
        if (!current()) return false;
        const t2 = performance.now(), bitmap = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(Math.round(w * dpr), Math.round(h * dpr)) : document.createElement("canvas");
        bitmap.width = Math.round(w * dpr); bitmap.height = Math.round(h * dpr); bitmap.getContext("2d").drawImage(img, 0, 0, bitmap.width, bitmap.height);
        plate = bitmap; uploadSource();
        if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
        if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
        Object.assign(state, { ready: true, dirty: false, w, h, dpr, scroll, hash, captures: state.captures + 1, captureMs: performance.now() - t0, mainMs: mainMs + performance.now() - t2, memoryBytes: bitmap.width * bitmap.height * 16, lastCaptured: performance.now() });
        changed(); return true;
      } catch (err) { if (!current()) return false; state.ready = false; state.reason = String(err.message || err); clear("source unavailable"); return false; }
      finally { state.busy = false; if ((generation !== epoch || revision !== sourceRevision) && state.dirty) schedule(); }
    }
    function rippleMesh() {
      // Each tile is rejected only if the sum of conservative displacement bounds is below the shader's zero-alpha
      // threshold. Remaining pixels run the original eight-wave shader unchanged, including every Gaussian tail.
      const tile = 64, w = state.w, h = state.h, cols = Math.ceil(w / tile), rows = Math.ceil(h / tile), capacity = cols * rows * 12;
      if (mesh.length < capacity) mesh = new Float32Array(capacity);
      let n = 0;
      const quad = (left, top, right, bottom) => {
        mesh.set([left, top, left, bottom, right, top, right, top, left, bottom, right, bottom], n); n += 12;
      };
      for (let row = 0; row < rows; row++) {
        const top = row * tile, bottom = Math.min(h, top + tile); let run = -1;
        for (let col = 0; col <= cols; col++) {
          let possible = false;
          if (col < cols) {
            const left = col * tile, right = Math.min(w, left + tile); let bound = 0;
            for (let i = 0; i < waves.length; i++) {
              const x = packed[i * 4], y = packed[i * 4 + 1], age = packed[i * 4 + 2];
              // A CSS-pixel margin also covers fractional backing dimensions and Float32 shader rounding.
              const minR = Math.max(0, Math.hypot(Math.max(left - x, 0, x - right), Math.max(top - y, 0, y - bottom)) - 1);
              const maxR = Math.hypot(Math.max(Math.abs(left - x), Math.abs(right - x)), Math.max(Math.abs(top - y), Math.abs(bottom - y))) + 1;
              const a = (minR - age * cfg.speed) / cfg.width, b = (maxR - age * cfg.speed) / cfg.width;
              const primary = a > 0 ? a : b < 0 ? -b : 0, ta = a + cfg.recoveryDelay, tb = b + cfg.recoveryDelay, recovery = ta > 0 ? ta : tb < 0 ? -tb : 0;
              bound += cfg.amplitude * Math.exp(-cfg.decay * age - minR / cfg.distance) *
                (Math.exp(-2 * primary * primary) + cfg.recovery * Math.exp(-1.2 * recovery * recovery - 0.8 * age)) * 1.001;
              if (bound > 0.029) { possible = true; break; }
            }
          }
          if (possible && run < 0) run = col * tile;
          if (!possible && run >= 0) { quad(run, top, Math.min(w, col * tile), bottom); run = -1; }
        }
      }
      return n;
    }
    function draw(now) {
      frameId = 0; const start = performance.now();
      if (!usable() || !geometryFits() || !g || g.isContextLost()) { clear("source changed"); return; }
      for (let i = waves.length - 1; i >= 0; i--) if ((now - waves[i].t) / 1000 >= cfg.lifetime) waves.splice(i, 1);
      if (!waves.length) { clear(""); schedule(); return; }
      for (let i = 0; i < waves.length; i++) { const a = waves[i]; packed.set([a.x, a.y, Math.max(0, (now - a.t) / 1000), 1], i * 4); }
      const count = rippleMesh();
      g.viewport(0, 0, canvas.width, canvas.height); g.useProgram(program); g.bindVertexArray(vao); g.bindTexture(g.TEXTURE_2D, texture);
      g.uniform1i(uniforms.uSource, 0); g.uniform2f(uniforms.uViewport, state.w, state.h); g.uniform1f(uniforms.uDpr, state.dpr); g.uniform1i(uniforms.uCount, waves.length); g.uniform4fv(uniforms.uWave, packed); g.uniform1f(uniforms.uAmplitude, cfg.amplitude);
      g.bindBuffer(g.ARRAY_BUFFER, meshBuffer);
      if (meshBytes < mesh.byteLength) { meshBytes = mesh.byteLength; g.bufferData(g.ARRAY_BUFFER, meshBytes, g.DYNAMIC_DRAW); }
      if (count) g.bufferSubData(g.ARRAY_BUFFER, 0, mesh, 0, count);
      g.clear(g.COLOR_BUFFER_BIT); canvas.style.display = "block";
      if (count) g.drawArrays(g.TRIANGLES, 0, count / 2);
      state.active = true; state.draws++; state.frames++;
      for (const wave of waves) if (!wave.first) { wave.first = true; state.latencyMs = performance.now() - wave.click; }
      const elapsed = performance.now() - start; state.callbackMs = elapsed; state.maxCallbackMs = Math.max(state.maxCallbackMs, elapsed);
      if (!frozen) frameId = requestAnimationFrame(draw);
    }
    async function trigger(x, y, stamp = performance.now(), native = false) {
      if (!usable()) return false;
      // A small, one-shot fingerprint detects chart-only pixel changes without recapturing static canvases on every
      // click. UI mutations already invalidate the plate. There is no chart readback or capture in the ripple loop.
      try {
        if (!state.active) for (const c of document.querySelectorAll('canvas')) {
          const b = c.getBoundingClientRect();
          if (!own(c) && b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight && canvasStamps.get(c) !== canvasStamp(c)) { state.dirty = true; break; }
        }
      } catch { state.dirty = true; }
      const generation = epoch;
      // A cold snapshot must never run inside the native press handler. Let the real click finish before scheduling
      // source work. A navigation/layout mutation clears this pending request, just as it cancels an active wave.
      const canUse = fits() || (geometryFits() && waves.length > 0);
      if (native && !canUse) { pendingClick = { x, y, stamp, generation, hash: location.hash, scroll: scrollY }; return false; }
      if (!canUse && !(await capture())) return false;
      if (generation !== epoch || !usable()) return false;
      if (!waves.length) uploadSource();
      waves.push({ x, y, t: performance.now(), click: stamp }); if (waves.length > cfg.max) waves.shift();
      state.latencyMs = performance.now() - stamp;
      if (!frameId && !frozen) frameId = requestAnimationFrame(draw); return true;
    }
    listen(window, "pointerdown", e => { pendingClick = null; if (e.button === 0 && e.pointerType !== "touch") trigger(e.clientX, e.clientY, performance.now(), true); }, { capture: true, passive: true });
    listen(window, "pointermove", () => { lastMotion = performance.now(); }, { capture: true, passive: true });
    listen(window, "pointercancel", () => { pendingClick = null; }, { capture: true, passive: true });
    listen(window, "click", e => {
      const pending = pendingClick; pendingClick = null;
      if (!pending || !e.detail || pending.generation !== epoch || pending.hash !== location.hash || pending.scroll !== scrollY) return;
      setTimeout(() => { if (!dead && pending.generation === epoch && pending.hash === location.hash && pending.scroll === scrollY) trigger(pending.x, pending.y, pending.stamp); }, 0);
    }, { passive: true });
    listen(window, "scroll", e => {
      lastScroll = performance.now();
      const panel = e.target instanceof Element && e.target !== document.documentElement && e.target !== document.body;
      const previous = panel ? sourceScrolls.get(e.target) || { x: 0, y: 0 } : null;
      const delta = panel ? Math.hypot(e.target.scrollLeft - previous.x, e.target.scrollTop - previous.y) : Math.abs(scrollY - state.scroll);
      invalidate("SCROLL_GEOMETRY", delta > cfg.scrollThreshold);
    }, { capture: true, passive: true });
    for (const event of ["resize", "hashchange", "popstate"]) listen(window, event, () => invalidate(event === "resize" ? "RESIZE" : "NAVIGATION"), { capture: true, passive: true });
    listen(document, "visibilitychange", () => invalidate("visibility"), false);
    for (const event of ["input", "change"]) listen(document, event, () => invalidate("CONTROL_CHANGE", false), { capture: true, passive: true });
    listen(document, "load", e => { if (e.target.tagName === "IMG" && !own(e.target)) invalidate("media loaded"); }, { capture: true, passive: true });
    for (const event of ["animationend", "transitionend"]) listen(document, event, e => {
      // Only the end of a transition a DOM change started can leave the page different from its snapshot. One no DOM
      // change started is a hover or focus state (a sidebar row's shift, a card's wash): hovering through the sidebar
      // would otherwise restart the page snapshot on every row it crosses.
      if (performance.now() - mutatedAt > 1200) return;
      if (!own(e.target) && !e.target.closest('.hero-stage')) invalidate("MINOR_STYLE", false);
    }, { capture: true, passive: true });
    for (const query of ["(pointer: fine)", "(prefers-reduced-motion: reduce)", "(forced-colors: active)"]) listen(matchMedia(query), "change", () => invalidate("accessibility policy"), false);
    let mutatedAt = -Infinity, montageT = 0;
    const observer = new MutationObserver(list => {
      if (list.some(m => m.type === "childList" && m.target === document.body)) observeSourceRoots();
      let soft = false, hard = "", montage = false;
      for (const m of list) {
        const el = m.target.nodeType === 1 ? m.target : m.target.parentElement; if (own(el)) continue;
        if (m.type === "childList" && [...m.addedNodes, ...m.removedNodes].every(n => n.nodeType !== 1 || own(n))) continue;
        // The montage is never part of the plate: its frames are drawn live into the composite. A new frame is not a new
        // page; a running wave simply re-composites (now and once the crossfade has finished).
        if (el.matches('.hero-frame') && m.attributeName === 'class' && el.classList.contains('on') !== (m.oldValue || '').split(' ').includes('on')) { montage = true; continue; }
        if (el.closest('.hero-stage') || (el.id === 'hero' && m.attributeName === 'style')) continue;
        const section = el.closest('.section'); if (section && !section.classList.contains('active') && el !== section) continue;
        mutatedAt = performance.now();
        if ((el.matches('.section, #nav, .drawer, .overlay') && m.attributeName === 'class') || m.attributeName === 'hidden') hard = "MAJOR_LAYOUT";
        else if (m.attributeName === 'src') hard = "MEDIA_CHANGE";
        else if (m.type === 'childList' && [...m.addedNodes, ...m.removedNodes].some(n => n.nodeType === 1)) hard = "SOURCE_REPLACEMENT";
        else soft = true;
      }
      if (hard) invalidate(hard); else if (soft) invalidate("MINOR_STYLE", false);
      if (montage && state.active) { uploadSource(); clearTimeout(montageT); montageT = setTimeout(() => { if (state.active && geometryFits()) uploadSource(); }, 950); }
    });
    const sourceOptions = { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ["class", "style", "src", "hidden", "open", "value"] };
    // Effect canvases are direct body children. Observe source subtrees rather than feeding their per-frame transforms
    // into this observer. Body replacements and newly added source roots still invalidate the same source generation.
    function observeSourceRoots() {
      observer.disconnect(); observer.observe(document.body, { ...sourceOptions, subtree: false });
      for (const el of document.body.children) if (!own(el)) observer.observe(el, sourceOptions);
    }
    observeSourceRoots();
    const destroy = () => { dead = true; clear("destroyed"); clearTimeout(refresh); clearTimeout(montageT); if (idleId && typeof cancelIdleCallback === "function") cancelIdleCallback(idleId); observer.disconnect(); imageCache.clear(); canvasStamps.clear(); if (g && !g.isContextLost()) { g.deleteTexture(texture); g.deleteProgram(program); g.deleteVertexArray(vao); g.deleteBuffer(meshBuffer); } if (canvas) { canvas.width = canvas.height = 1; canvas.remove(); } if (sourceFrame) sourceFrame.close(); plate = composite = sourceFrame = null; mesh = new Float32Array(0); meshBytes = 0; state.memoryBytes = 0; state.ready = false; };
    disposers.push(destroy); schedule();
    return { status: () => ({ ...state, preset, config: cfg, count: waves.length, loop: !!frameId, origins: waves.map(w => [w.x, w.y]), cacheEntries: imageCache.size }),
      test: TEST ? { capture, trigger, cancel: invalidate, canvas: () => canvas, source: () => texture, gl: () => g,
        freeze(v = true) { frozen = v; if (frameId) cancelAnimationFrame(frameId); frameId = 0; },
        at(ms) { if (!waves.length) return; draw(waves[0].t + ms); },
        bench(n = 30) { if (!g || !waves.length) return NaN; g.finish(); const start = performance.now(), before = state.draws; for (let i = 0; i < n; i++) draw(waves[0].t + 80); g.finish(); state.benchDraws = state.draws - before; return (performance.now() - start) / n; },
        readSource() { if (!g || !state.ready) return null; const fb = g.createFramebuffer(); g.bindFramebuffer(g.FRAMEBUFFER, fb); g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, texture, 0); const px = new Uint8Array(textureW * textureH * 4); g.readPixels(0, 0, textureW, textureH, g.RGBA, g.UNSIGNED_BYTE, px); g.bindFramebuffer(g.FRAMEBUFFER, null); g.deleteFramebuffer(fb); return { w: textureW, h: textureH, px }; },
        readWave() { if (!g || !state.ready) return null; const px = new Uint8Array(canvas.width * canvas.height * 4); if (state.active) g.readPixels(0, 0, canvas.width, canvas.height, g.RGBA, g.UNSIGNED_BYTE, px); return { w: canvas.width, h: canvas.height, px }; },
        lose() { const ext = g && g.getExtension("WEBGL_lose_context"); if (ext) { this.ext = ext; ext.loseContext(); } return !!ext; }, restore() { if (this.ext) this.ext.restoreContext(); }
      } : null };
  }
})();
