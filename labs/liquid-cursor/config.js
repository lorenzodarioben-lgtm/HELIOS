/* Liquid cursor lab: the single source of tunable values.
   Phase 2: the primary body (velocity deformation, membrane, hover, click). Phase 3: the droplets group (one transient
   droplet, Mode B and C only). Phase 4: the pool group. Phase 4.5: the goo group (rich goo, the default pool snapshot). The body group defaults below ARE the "Santioni refined" preset (the Phase 2 fidelity
   correction, approved by the user). The committed Phase 2 body is kept, value for value, as the "Phase 2 original" preset. Lab presets override the flat tunable names
   listed in liquid-cursor.js (PARAMS); they are a development aid, not a production feature.
   Classic script (no modules) so the lab and a future Observatory integration keep working from file://. */
"use strict";
window.LIQUID_CURSOR_CONFIG = Object.freeze({
  canvas: Object.freeze({
    // Bounded canvas that travels with the body. Padding around the rest body is cssSize / 2 - radius
    // (176 px at the defaults). Phase 4 decides bounded vs dynamic vs temporary full-viewport bounds.
    cssSize: 420,
    maxDpr: 3,             // backing store = cssSize * min(devicePixelRatio, maxDpr). Phase 1: 2; raised because an upscaled
                           // canvas (DPR above the cap) softens the membrane edge to ~3 device px depending on sub-pixel phase
    zIndex: 1000,          // lab only; the Observatory ladder tops out at 99
    edgeMargin: 6,         // CSS px kept clear inside the canvas; the body is clamped to fit
    beadCssSize: 64,       // Phase 3: the small bead canvas that takes over a free droplet drifting out of the body canvas
                           // (created only when droplets are first switched on; 64 x 64 CSS px at the same DPR cap)
  }),
  follow: Object.freeze({
    response: 60,          // lambda (1/s) for exponential position following, 1 - exp(-response * dt). Phase 1 value, user-approved
    velocitySmoothingMs: 24, // per-sample smoothing of the raw pointer velocity (Phase 1 value)
    velocityStaleMs: 30,   // with no pointer sample for this long, raw velocity decays towards zero... (Phase 1: 40)
    velocityDecay: 50,     // ...at this rate (1/s), frame-rate independent (Phase 1: 30). Shape recovery only; position is unaffected
    gapResetMs: 120,       // a sample arriving after a longer gap (window exit, touch, ignored drag) restarts velocity instead of spiking
    maxDt: 0.05,           // clamp frame delta (s) after stalls so nothing jumps
    maxSubstep: 1 / 240,   // springs integrate in equal substeps no longer than this (s): same motion at 60-165 Hz
  }),
  body: Object.freeze({
    radius: 34,            // CSS px at rest
    maxStretch: 1.42,      // hard ceiling of longitudinal stretch
    stretchSpeed: 1300,    // px/s of smoothed speed that gives 63% of the maximum deformation...
    stretchCurve: 1.6,     // ...through amount = 1 - exp(-(speed / stretchSpeed) ^ curve): flat when slow, saturating when fast
    compressionExponent: 0.75, // across-axis scale = stretch ^ -exponent. 1 = exact area (1 / stretch, Phase 2 original),
                           // 0.5 = 1 / sqrt(stretch). Below 1 the moving body is not area-preserving: area x stretch ^ (1 - exponent)
    velocitySmoothingMs: 28, // second smoothing stage (time constant) for the velocity that drives the shape, as a vector
    stretchResponse: 38,   // rad/s: spring stiffness while deformation grows
    recoveryResponse: 36,  // rad/s: spring stiffness while it relaxes back to a circle
    deformDamping: 0.6,    // damping ratio; below 1 gives a tiny (~1.5%) squash past round on a hard stop
    axisResponse: 28,      // 1/s: how fast the stretch axis turns towards the motion direction
    axisMinSpeed: 40,      // px/s below which the axis does not turn (direction is noise when slow)...
    axisFullSpeed: 300,    // ...and above which it turns at the full rate
  }),
  surface: Object.freeze({
    membrane: "field",     // "field": screen-space gradient noise (Santioni refined) | "harmonic": integer harmonics (Phase 2 original)
    baseNoise: 0.25,       // CSS px of peak perimeter displacement at rest (Phase 2 original: 0.7)
    maxNoise: 0.7,         // CSS px at full deformation, screen space (original: 2.2). 0.9 starts to dent the flanks, 1.2 is lumpy
    noiseCurve: 1.0,       // amplitude = base + (max - base) * deformation ^ curve (original: 1.5)
    noiseScale: 36,        // field: feature size in CSS px; the same all along the outline, stretched or not. 20 px reads jagged
    noiseFrequency: 4,     // harmonic: lowest angular harmonic (integer >= 2); f, f + 2 and 2f + 1 are summed
    noiseSpeed: 0.3,       // membrane evolution at rest: field cells/s, or rad/s of harmonic phase (original: 0.9)...
    noiseSpeedGain: 2.0,   // ...multiplied by (1 + gain * deformation) while moving (original: 2.5)
    idleFadeMs: 1400,      // after this long without motion or state change the membrane stills (no idle pulsing, no idle draws)
    stillNoise: 0,         // share of the resting membrane kept once it has stilled: 0 settles to a true circle (original: 1)
  }),
  interaction: Object.freeze({
    hoverScale: 1.27,      // radius multiplier over an interactive target
    hoverResponse: 32,     // rad/s
    hoverDamping: 0.7,     // damping ratio (a hint of overshoot, not a bounce)
    hoverNoiseMultiplier: 0.45, // membrane amplitude multiplier while hovering (calmer surface)
    hoverDeformMultiplier: 0.6, // velocity deformation multiplier while hovering (steadier lens)
    clickCompression: 0.1, // pointer-down radius reduction (0.1 = 10%)
    clickResponse: 48,     // rad/s
    releaseDamping: 0.45,  // damping ratio after release: one small elastic rebound
    presenceResponse: 22,  // 1/s: fade-in after the body reappears (entering the page, leaving an ignored region)
  }),
  render: Object.freeze({
    mask: "difference",    // "difference" (white mask, CSS mix-blend-mode: difference) | "plain" (lab-only diagnostic)
    plainColor: Object.freeze([0.85, 0.17, 0.55]), // plain diagnostic mask colour (RGB 0..1), deliberately off-palette
    plainAlpha: 0.55,
    aaWidth: 1.0,          // antialiasing ramp width in device pixels
    hoverRing: false,      // Phase 1 detection ring cut into the body on hover (kept for the Phase 1 disc preset)
    hoverRingInset: 7,     // CSS px
    hoverRingWidth: 1.5,   // CSS px
  }),
  accessibility: Object.freeze({
    finePointerOnly: true,         // require (pointer: fine)
    reducedMotionPolicy: "disable", // "disable" | "debug-static" (Debug mode only: body snaps to the pointer, no animation)
    disableInForcedColors: true,   // (forced-colors: active)
  }),
  selectors: Object.freeze({
    interactive: 'a[href], button:not(:disabled), summary, [data-cursor-interactive]',
    ignore: "[data-cursor-ignore]",
  }),
  debug: Object.freeze({
    fpsWindow: 60,         // frames in the moving-average FPS window
    panelRefreshMs: 200,   // the panel repaints text at this interval, never per frame
  }),
  lab: Object.freeze({
    defaultMode: "A",      // "A" baseline · "B" hybrid (droplets not implemented) · "C" debug
    defaultPreset: "santioniRefined",
    hideNativeCursor: true,
    // The three comparison presets, in order; the header switch and keys 1, 2 and 3 select them.
    compare: Object.freeze(["phase1Disc", "phase2Original", "santioniRefined"]),
    // Development-only presets: flat tunable names (see PARAMS in liquid-cursor.js) overriding the defaults above.
    presets: Object.freeze({
      phase1Disc: Object.freeze({ label: "Phase 1 disc", values: Object.freeze({ maxStretch: 1, baseNoise: 0, maxNoise: 0, hoverScale: 1, clickCompression: 0, hoverRing: true }) }),
      // Phase 2 as committed in 2fff2cc ("Santioni clean"): every tunable spelled out, so later default changes cannot drift it
      phase2Original: Object.freeze({ label: "Phase 2 original", values: Object.freeze({
        followResponse: 60, radius: 34, maxStretch: 1.42, stretchSpeed: 1300, stretchCurve: 1.6, compressionExponent: 1,
        velocitySmoothingMs: 28, stretchResponse: 38, recoveryResponse: 36, deformDamping: 0.6, axisResponse: 28, axisMinSpeed: 40, axisFullSpeed: 300,
        membrane: "harmonic", baseNoise: 0.7, maxNoise: 2.2, noiseCurve: 1.5, noiseScale: 36, noiseFrequency: 4, noiseSpeed: 0.9, noiseSpeedGain: 2.5,
        idleFadeMs: 1400, stillNoise: 1,
        hoverScale: 1.27, hoverResponse: 32, hoverDamping: 0.7, hoverNoiseMultiplier: 0.45, hoverDeformMultiplier: 0.6,
        clickCompression: 0.1, clickResponse: 48, releaseDamping: 0.45, presenceResponse: 22, hoverRing: false }) }),
      santioniRefined: Object.freeze({ label: "Santioni refined", values: Object.freeze({}) }),
      tooSoft: Object.freeze({ label: "Too soft (reference)", values: Object.freeze({ deformDamping: 0.22, stretchResponse: 14, recoveryResponse: 11, hoverDamping: 0.3, releaseDamping: 0.2, maxNoise: 4.5 }) }),
      tooViscous: Object.freeze({ label: "Too viscous (reference)", values: Object.freeze({ followResponse: 12, velocitySmoothingMs: 110, stretchResponse: 8, recoveryResponse: 6, deformDamping: 1, maxStretch: 1.6 }) }),
    }),
    presetAliases: Object.freeze({ santioniClean: "phase2Original" }), // Phase 2 URLs (?preset=santioniClean) keep working
    // Pool snapshots: pool, rich-goo and wake tunables only (the droplet unit stays the chosen droplet snapshot). The config
    // `pool`, `goo` and `wake` groups below are the default, "Connected goo · balanced" (the Phase 4.5 correction). The
    // historical snapshots spell out every value they depend on, so later default changes cannot drift them: "single" is
    // the approved Phase 3 droplet (bit-identical to d64ec76), "balanced" the Phase 4 default exactly as committed in
    // 0c75065, and "richBalanced" the first, droplet-centric Phase 4.5 attempt (the user: "same cursor, more droplets").
    defaultPoolPreset: "refBalanced",
    poolPresets: (() => {
      const P4 = { poolMax: 3, poolBurst: 2, poolSpacingMs: 260, poolSpacingGrowth: 0.6, poolStep: 0.12, poolFollowScale: 0.82, poolSatellite: 1, poolSatSwing: 1.7,
        poolSatCooldownMs: 1500, poolSatScale: 0.5, poolSatTime: 0.55, poolSatEnergy: 0.55, poolSatLife: 0.75, poolSatAngleDeg: 18, poolJoinPx: 8, gooOn: 0, wakeOn: 0, spineOn: 0 };
      const RB = { poolMax: 4, wakeOn: 0, spineOn: 0, gooOn: 1, gooBudget: 4, gooRefillMs: 320, gooSpacingMs: 150, gooStep: 0.05, gooCooldownMs: 320, gooMaxAttached: 3, gooFollowScale: 0.94,
        gooScale: 1.12, gooUnion: 1.15, gooSecSwing: 1.15, gooSecScale: 0.72, gooSecDelayMs: 50, gooSecNeckMs: 76, gooSecAngleDeg: 20, gooMicroSwing: 1.5, gooMicroScale: 0.5,
        gooMicroDelayMs: 95, gooMicroNeckMs: 40, gooMicroAngleDeg: 6, gooWake: 1.6, gooWakeMs: 260, gooWakeSwing: 0.8, gooWakeFree: 0, gooMomentum: 0.6, gooKick: 0.55, gooDrag: 1,
        gooDragSize: 0.35, gooEarlyDrag: 12, gooEarlyMs: 100, gooLife: 1.12, gooWakeLife: 1, gooMicroLife: 0.78, gooJoin: 1, gooCohesion: 1.1, gooTaper: 0.08 };
      // the rejected first connected goo (the wake: an event-driven tail bolted onto the ellipse), kept whole
      const CW = { ...RB, wakeOn: 1, spineOn: 0, wakeLenMin: 70, wakeLenMax: 120, wakeBulb: 11.5, wakeStrand: 6.5, wakeUnion: 1.9, wakeLag: 0.15, wakeCarry: 0.6, wakeKick: 40, wakeOmega: 22,
        wakeDamping: 0.6, wakeBulbMass: 3, wakeDrag: 2, wakeMaxRel: 3000, wakeRest: 0.85, wakeHoldMs: 110, wakeBrake: 0.6, wakeMinPullMs: 60, wakeMaxPullMs: 220, wakeNeckMs: 45,
        wakeThreadPx: 1.1, wakeRetractMs: 110, wakeCooldownMs: 140, wakeSplash: 1.3, wakeBulbLife: 0.55, wakeRelease: 0.15, wakeBound: 196, wakeManualThrow: 1.1, wakeFree: 0 };
      const snap = (label, values) => Object.freeze({ label, values: Object.freeze(values) });
      return Object.freeze({
        single: snap("Phase 3 approved · one droplet", { ...P4, poolMax: 1 }),
        sparse: snap("Phase 4 · sparse", { ...P4, poolSatellite: 0 }),
        balanced: snap("Phase 4 · current balanced", P4),
        rich: snap("Phase 4 · rich (capacity 4)", { ...P4, poolMax: 4, poolBurst: 3 }),
        busy: snap("Phase 4 · busy diagnostic", { ...P4, poolMax: 5, poolBurst: 5, poolSpacingMs: 120, poolSpacingGrowth: 0, poolStep: 0, poolFollowScale: 1, poolSatSwing: 1.15, poolSatCooldownMs: 0 }),
        // the first Phase 4.5 attempt (discrete pieces: primary, secondary, micro, wake micros), kept whole
        richSparse: snap("Rich goo droplets · sparse", { ...RB, gooBudget: 3, gooRefillMs: 380, gooSecSwing: 1.32, gooMicroSwing: 1.9, gooWake: 0.45, gooCohesion: 0.8, gooTaper: 0.05, gooLife: 1.05 }),
        richBalanced: snap("Rich goo droplets (previous attempt)", RB),
        richHeavy: snap("Rich goo droplets · heavy", { ...RB, poolMax: 5, gooBudget: 5, gooRefillMs: 200, gooSpacingMs: 110, gooCooldownMs: 240, gooSecSwing: 1.05, gooMicroSwing: 1.28, gooWake: 1.8,
          gooLife: 1.22, gooWakeLife: 1.12, gooCohesion: 1.35, gooTaper: 0.11, gooUnion: 1.25, gooSecScale: 0.8 }),
        aecyncBoundary: snap("Rich goo droplets · boundary", { ...RB, poolMax: 5, gooBudget: 8, gooRefillMs: 80, gooSpacingMs: 60, gooCooldownMs: 0, gooStep: 0, gooMaxAttached: 3,
          gooSecSwing: 0.9, gooMicroSwing: 0.9, gooWake: 4, gooWakeMs: 700, gooWakeFree: 1, gooWakeSwing: 0.2, gooLife: 1.5, gooWakeLife: 1.4, gooKick: 0.3, gooMomentum: 0.4, gooCohesion: 1.8, gooTaper: 0.14, gooUnion: 1.4 }),
        // the Phase 4.5 correction: a connected goo wake first, detached pieces second (config defaults = balanced)
        connectedSparse: snap("Connected goo (previous) · sparse", { ...CW, wakeLenMin: 50, wakeLenMax: 90, wakeBulb: 9.5, wakeStrand: 5.4, wakeSplash: 0.5, wakeMaxPullMs: 180 }),
        connectedBalanced: snap("Connected goo · previous (rejected)", CW),
        connectedHeavy: snap("Connected goo (previous) · heavy", { ...CW, poolMax: 5, gooBudget: 5, gooRefillMs: 220, wakeLenMin: 90, wakeLenMax: 140, wakeBulb: 13, wakeStrand: 7.4, wakeSplash: 2.2, wakeMaxPullMs: 260, wakeBulbLife: 0.75 }),
        connectedBoundary: snap("Connected goo (previous) · too much", { ...CW, poolMax: 5, gooBudget: 8, gooRefillMs: 80, gooLife: 1.5, wakeLenMin: 140, wakeLenMax: 150, wakeBulb: 15.5, wakeStrand: 8.6, wakeSplash: 4,
          wakeMinPullMs: 220, wakeMaxPullMs: 360, wakeCooldownMs: 0, wakeFree: 2200, wakeBulbLife: 1.3 }),
        // the Phase 4.5 reference goo: the curved metaball spine (config defaults = balanced)
        refSparse: snap("Reference goo · sparse", { spineLength: 62, spineBulb: 0.84, spineShedRate: 14, spineSplashMax: 5.5, spineVOn: 1900 }),
        refBalanced: snap("Reference goo · balanced (default)", {}),
        refHeavy: snap("Reference goo · heavy", { spineLength: 100, spineBulb: 0.95, spineNeck: 0.44, spineTerminal: 0.48, spineShedRate: 38, spineSplashMax: 7.5, spineVOn: 1300, spineHoldMs: 150 }),
        refBoundary: snap("Reference boundary · longer and denser", { spineLength: 130, spineBulb: 1.0, spineNeck: 0.45, spineTerminal: 0.5, spineShedRate: 60, spineShedMin: 0.25, spineSplashMax: 8.5,
          spineVOn: 1200, spineHoldMs: 200, gooBudget: 10, gooRefillMs: 70, spineSplashLife: 1.4 }),
      });
    })(),
    // Phase 3 droplet snapshots (Mode B and C). They set droplet tunables only; the body stays whatever preset is chosen
    // (the approved body is Santioni refined, the default). Balanced is the config default below (revised after the user's
    // "neck too fast"); the other three keep their 4f71aee behaviour exactly (neck model 1 is the first version).
    defaultDropletPreset: "balanced",
    dropletPresets: Object.freeze({
      balanced: Object.freeze({ label: "Single droplet · balanced", values: Object.freeze({}) }),
      balancedOriginal: Object.freeze({ label: "Balanced · first version (83 ms)", values: Object.freeze({ dropNeckModel: 1, dropNeckMs: 42 }) }),
      shortNeck: Object.freeze({ label: "Short neck (decisive)", values: Object.freeze({ dropNeckModel: 1, dropBudMs: 20, dropNeckMs: 26, dropDetachMs: 10, dropUnion: 1.25, dropPinchCurve: 2.8 }) }),
      longNeck: Object.freeze({ label: "Long neck (viscous diagnostic)", values: Object.freeze({ dropNeckModel: 1, dropBudMs: 40, dropNeckMs: 110, dropDetachMs: 30, dropUnion: 2.2, dropPinchCurve: 1.2, dropPinchStretch: 0.45 }) }),
    }),
  }),
  // ---- Phase 3: one transient droplet at a time (droplet.js). Mode B and Mode C only; Mode A never sheds one.
  droplets: Object.freeze({
    // trigger: a velocity swing that is also abrupt, at a meaningful speed; all four gates must be open together
    minSpeed: 900,         // px/s the pointer must still be moving at: stops, tremor and slow moves never fire
    impulse: 1500,         // px/s velocity swing against the lagged reference velocity, braking removed (a stop is not a flick)
    accel: 40000,          // px/s^2 recent acceleration peak (a coarse gate: a quick pointing move reaches about 52k, like a flick)
    jerk: 1.8e6,           // px/s^3 recent jerk peak: the swing must also start abruptly (the best separator: ordinary motion
                           // peaks at 1.5M, a violent flick from 2.05M at 60 Hz; the same decisions at 60-165 Hz, see README)
    turnGain: 1.3,         // direction-change sensitivity: a sideways swing counts this much more than a straight one, and past
                           // a 30° turn (fully at 90°) the acceleration and jerk gates are this much easier
    referenceMs: 90,       // lag of the reference velocity ("where the liquid's momentum was")
    accelMs: 12,           // smoothing of the acceleration estimate (derived only when a new velocity arrives)
    jerkMs: 12,            // smoothing of the jerk estimate
    peakHoldMs: 90,        // acceleration and jerk peaks are held flat this long, then released (the onset comes before the swing)
    debounceMs: 12,        // every gate open together for this long
    armMs: 180,            // clean motion history needed after a reset, re-entry, a click, a resize or a resumed tab
    gapJumpPx: 48,         // a sample after a tracking gap disarms the trigger only if the pointer moved this far unseen
                           // (a resting mouse's first sample is a few px away even on a violent 125 Hz flick)
    cooldownMs: 700,       // after a droplet has gone, before the next may start
    // bud, neck and pinch: the attached phase is budMs + neckMs + threadMs + detachMs = 124 ms, connected for the first
    // 110 (the first version, 4f71aee: 26 + 42 + 14 = 82 ms, connected for 68; the user found that neck too fast)
    radius: 6,             // CSS px bead radius for a threshold event...
    radiusSpread: 0.3,     // ...-30% to +30% with the event's strength: 4.2-7.8 px (always clamped to 3-10 px)
    budMs: 26,             // the bud grows out of the perimeter, smooth-unioned into the body
    neckMs: 60,            // the bud moves out and the union tightens: the bridge narrows to a thin neck (first version: 42)
    threadMs: 24,          // then the thin thread keeps thinning, ever faster, into the pinch (first version: no thread)
    threadGap: 0.485,      // ...to this surface gap x union radius (0.43 at the end of the narrowing; the bridge breaks at 0.5)
    neckModel: 2,          // 2: the revised neck (thin thread; gap measured from the drawn membrane; no re-bridge after the
                           // pinch). 1: the first version (4f71aee), kept for the comparison snapshots
    detachMs: 14,          // after release the union collapses: the bridge snaps and both fillets retract
    union: 1.5,            // smooth-union radius x bead radius (larger = broader, more viscous attachment)
    pinchCurve: 2,         // neck narrowing: the gap eases out towards the breaking point (2: width falls about linearly;
                           // higher: thin sooner and for longer). The union then collapses in detachMs: a decisive snap
    pinchStretch: 0.3,     // bead elongation along the neck at the pinch; it recoils to round after release
    // free flight and disappearance
    momentum: 0.12,        // share of the body's velocity at release the bead keeps (it is left behind)...
    carry: 0.5,            // ...plus this share of the pre-event momentum the body abandoned (turns, reversals; 0 for a flick)
    spreadDeg: 16,         // random (seeded, deterministic) jitter of the attachment direction
    snapKick: 150,         // px/s along the neck given to the bead as the neck snaps (the retracting remnant)
    minSeparation: 90,     // px/s: a released bead always leaves the body at least this fast (it never drifts back in)
    drag: 7,               // 1/s exponential drag (exact integration, frame-rate independent)
    lifeMs: 560,           // life after release for a 6 px bead, x sqrt(radius / 6): about 470-640 ms
    freeShare: 0.45,       // share of the life before fading starts
    shrinkCurve: 1.3,      // radius eases from 100% (after the first 20% of life) down to endScale
    fadeCurve: 1.6,        // opacity 1 - u^curve over the fading share
    endScale: 0.35,        // radius left when the opacity reaches zero (too small and faint to notice)
    recoil: 55,            // rad/s of the bead's shape recoil after the pinch (damping 0.35)
    absorbMs: 70,          // a free bead the body runs into coalesces: it shrinks and fades into the body this fast
  }),
  // ---- Phase 4: the droplet pool (droplet.js). Each slot runs the approved Phase 3 event above, unchanged; these values
  // only decide when another one may start. poolMax 1 is the approved Phase 3 single droplet, decision for decision.
  // Phase 4.5 changed only `max` (3 -> 4, the rich goo capacity); the rest are the Phase 4 values, which the rich scheduler
  // does not use (it has its own budget below). The Phase 4 default is kept whole as the "balanced" pool snapshot.
  pool: Object.freeze({
    max: 5,                // hard capacity: never more live droplets than this (3-5). A full pool suppresses, never recycles.
                           // Phase 4: 3 (3, 4 and 5 behaved identically with burst 2). Rich goo: 4 (measured: 3 capped extreme
                           // gestures at 3 pieces; 5 behaved like 4 under the 4-piece budget, adding only rare 5-live moments)
    burst: 2,              // natural events per burst (a primary and at most one follow-up; satellites are separate). A burst
                           // ends when the pool empties; then the Phase 3 cooldown
    spacingMs: 260,        // a follow-up needs this long since the last emission started...
    spacingGrowth: 0.6,    // ...x (1 + growth x (live beads - 1)): the busier the pool, the longer the wait
    step: 0.12,            // ...and a stronger swing: trigger signal >= 1 + step x live beads (the first event needs 1)
    followScale: 0.82,     // a follow-up is smaller: radius x followScale per live bead (never under 3 px)
    satellite: 1,          // 1: an extreme event may leave one residual satellite; 0: never
    satSwing: 1.7,         // ...when the event's peak velocity swing reaches this x the swing threshold (a violent flick,
                           // turn or reversal: 1.2-1.4; an extreme one: 1.95-2.1, at 60-165 Hz alike)
    satCooldownMs: 1500,   // ...and no satellite in the last 1.5 s
    satScale: 0.5,         // satellite radius x the event's bead radius (kept within 2.5-4.5 px)
    satTime: 0.55,         // its bud, neck and pinch run this much faster (a residual, not a second full event)
    satEnergy: 0.55,       // its share of the abandoned momentum (less energetic; it still gets the full snap kick)
    satLife: 0.75,         // its life x the usual (radius-scaled) life
    satAngleDeg: 18,       // it pinches off up to this far to one side of the parent's attachment (seeded side and amount)
    joinPx: 8,             // free beads closer than this (edge to edge) are drawn by one surface (never inverted twice)
  }),
  // ---- Phase 4.5: rich goo (droplet.js, the rich-fission scheduler). on 1 replaces the Phase 4 budget and satellite with a
  // hierarchy of pieces that break off one event: the PRIMARY (the approved Phase 3 unit: bud, neck, thin thread, pinch),
  // a SECONDARY (a smaller, shorter bud, neck and pinch beside it) and a MICRO (a brief pull and separation), staggered
  // with seeded jitter, plus WAKE micros the stretched rear surface sheds while the event is hot. Every piece is a real
  // fission of the surface: nothing is emitted per distance travelled, and nothing without a trigger event (except in
  // the boundary diagnostic, wakeFree). These defaults ARE "Rich goo · balanced"; on 0 is the Phase 4 pool exactly.
  goo: Object.freeze({
    on: 1,
    // scheduler: a token budget (pieces) that refills, a minimum spacing between primary events, a short recovery
    budget: 6,             // pieces per burst at most (every kind counts); the budget refills one piece per refillMs
    refillMs: 160,         // (rich goo droplets: 4 and 320, kept in their snapshot)
    spacingMs: 150,        // a further primary event while pieces live needs this long since the last one (x 0.55 for the
                           // strongest swings: 150 ms at the trigger level, 83 ms at twice the swing threshold)
    step: 0.05,            // ...and a trigger signal >= 1 + step x live pieces
    cooldownMs: 320,       // after the pool empties, before the next burst may start (Phase 3/4: 700)
    maxAttached: 3,        // necks at once (one primary-class neck plus its secondary and micro)
    followScale: 0.94,     // a later primary event in the same burst is a little smaller per live piece
    // the hierarchy (the primary is the approved unit; its radius x scale, its union x union: a thicker, cohesive neck)
    scale: 1.12,           // primary radius x this: 4.7-8.7 px (the Phase 3 4.2-7.8), clamped to 5-8.5
    union: 1.15,           // primary and secondary neck union radius x this (thicker, more cohesive bridge, same timing)
    secSwing: 1.15,        // a SECONDARY breaks off when the event's peak velocity swing reaches this x the swing threshold
                           // (measured: violent flick 1.20-1.27, turn 1.23-1.29, reversal 1.34-1.40, extreme 1.95-2.10)
    secScale: 0.72,        // ...radius x the primary's (3.5-6 px)
    secDelayMs: 50,        // ...starting 50 +- 20 ms after the primary (seeded), as soon as the swing qualifies
    secNeckMs: 76,         // ...its bud, neck and pinch take this long (the primary: 124 ms)
    secAngleDeg: 20,       // ...right beside the primary's attachment at the tail, 0.95-1.2 x this to a seeded side (a double
                           // drip; wider offsets read as legs around the body)
    microSwing: 1.5,       // a MICRO pulls off when the peak swing reaches this x the threshold
    microScale: 0.5,       // ...radius x the primary's (2.5-4 px)
    microDelayMs: 95,      // ...starting 95 +- 35 ms after the primary
    microNeckMs: 40,       // ...a brief metaball pull, then separation
    microAngleDeg: 6,      // ...from the primary's own spot (4.5-7° to the other side): it can only bud once the primary has
                           // pinched (two buds never crowd within 18°), like the satellite a breaking thread leaves
    // wake: while an event is hot (wakeMs after a primary started), a strongly stretched, fast-swinging body accumulates
    // tail stress; at a seeded threshold the rear surface sheds a wake micro (driven by stretch and swing, never distance)
    wake: 1.6,             // tail-stress gain (0: no wake pieces)
    wakeMs: 260,
    wakeSwing: 0.8,        // the swing (x threshold) past which a stretched body builds tail stress (the held acceleration peak also counts)
    wakeFree: 0,           // 1 (boundary diagnostic only): wake without a trigger event, i.e. a speed-driven trail
    // free flight: heavier pieces left behind, not fired away
    momentum: 0.6,         // x the Phase 3 momentum and carry (less inherited momentum)
    kick: 0.55,            // x the Phase 3 snap kick and minimum separation (gentler initial separation)
    drag: 1,               // x the Phase 3 drag...
    dragSize: 0.35,        // ...x (6 px / r0) ^ dragSize: larger pieces keep their momentum longer, smaller ones slow sooner
    earlyDrag: 12,         // 1/s of extra drag that fades over the first earlyMs of flight (cohesion: the piece is left behind)
    earlyMs: 100,
    life: 1.12,            // lifetime x this for every piece (primary 520-700 ms)...
    wakeLife: 1,           // ...and x this for the residual pieces (secondary 400-600 ms)...
    microLife: 0.78,       // ...and x this again for micros (260-400 ms)
    join: 1,               // coalescence: free pieces merge when their centres are closer than join x (r1 + r2) (Phase 4: 0.85)
    cohesion: 1.1,         // young free pieces close together are smooth-unioned (radius cohesion x the smaller r0), ramping
                           // in and out over their first 130 ms of flight: a brief metaball pull, never a lasting bridge
    taper: 0.08,           // the body's rear lengthens by up to this share while a primary is pulled out (0 at all other
                           // times: the approved body is untouched), then retracts with a small elastic recoil
  }),
  // ---- Phase 4.5 reference goo (droplet.js, the curved metaball spine): the user's reference image, a thick goo cursor
  // whose fast motion makes one asymmetric form (a heavy leading bulb, a narrow neck trailing along the recent path, a
  // fatter terminal lobe) with beads of many sizes left irregularly along that path. Motion-driven and continuous: zero at
  // rest and in slow or medium motion. These defaults ARE "Reference goo · balanced"; on 0 is the connected wake below.
  spine: Object.freeze({
    on: 1,
    vOn: 1500,             // px/s of the body's rendered speed where the goo starts to grow (ordinary pointing peaks below it)...
    vFull: 3200,           // ...and where it is full (smooth in between); slow and medium motion stays the approved body
    accel: 0.35,           // a strong acceleration adds this share (a flick reads goopier than a steady sweep)
    riseMs: 45,            // energy rises with this time constant...
    holdMs: 120,           // ...and decays with this one (the goo stays long enough to be seen, then catches up)
    retractMs: 90,         // the tail shortens with this time constant when the energy falls
    length: 70,            // CSS px of path from the root to the terminal lobe at full energy: the whole form is then at most
                           // about 2.5 x as long as it is wide (the reference: 3.0; the user wanted 70-85% of it)
    nodes: 4,              // tail points (2-4): root, neck, neck, terminal
    stiffness: 34,         // rad/s: the tail points' springs towards their places on the recent path...
    damping: 0.7,          // (a little overshoot: springy, without the points folding back as the tail retracts)
    lag: 0.45,             // ...deeper points this much softer (they lag: the rear keeps going the old way through a turn)
    bulb: 0.9,             // x body radius: the leading bulb node (a fuller, heavier front while the goo is out)
    bulbAhead: 0.2,        // x body radius ahead of the centre
    root: 0.85,            // x body radius: the rear of the teardrop (the bulb tapers into the neck through it)...
    rootBehind: 1.1,       // ...this far behind the centre, on the path
    neck: 0.42,            // x body radius: the neck at its thinnest, about 0.45 x the bulb's width like the reference (it
                           // thins a little as it stretches and wobbles a little, irregularly)
    taper: 0.55,           // the neck's first point is this share of the way from the neck radius back to the root's: the
                           // neck narrows gradually (a bottle, not a ball on a stick)
    irregular: 0.12,       // x body radius: the neck and terminal drift this far to seeded sides of the path (one flank
                           // bulges, the tip bends): an irregular silhouette
    terminal: 0.46,        // x body radius: the terminal lobe (fatter than the neck)
    union: 0.6,            // x body radius: the smooth union of the tail with the body (the teardrop's flanks)
    shedMin: 0.6,          // energy above which a drawn-out terminal accumulates stress (aggressive motion only: fast
                           // ordinary navigation may show a teardrop, never beads)...
    shedRate: 28,          // ...at this rate (per second at full energy); at a seeded threshold (0.6-1.4) it sheds a bead
    splashCount: 5,        // beads per burst at most, the braking pinch included (the reference family: 3-6 in strong motion)
    splashMin: 2.2,        // bead radius range (CSS px): the first of a burst near splashMax, then each about 0.74 x the last
    splashMax: 6.8,
    splashLife: 1.05,      // bead life x the goo life for its size
    splashMomentum: 0.15,  // a bead keeps this share of the terminal's velocity: left where the liquid was
  }),
  // ---- Phase 4.5 correction: the connected goo wake (droplet.js). The user: "same cursor, more droplets" was not goo. A
  // strong event now pulls the body's rear into a short connected tail (root, strand, bulb), drawn as one surface with the
  // body; the bulb may pinch off, a few splash beads spray from the snap, and the rest snaps back. Needs goo.on (budget,
  // free-piece flight and life come from the goo group). These defaults ARE "Connected goo · balanced"; on 0 is rich goo.
  wake: Object.freeze({
    on: 1,
    lenMin: 70,            // the tail's length limit, root to bulb centre (CSS px), at the trigger level...
    lenMax: 120,           // ...and at twice the swing threshold (the strongest motions); body diameter is 68 px
    bulb: 11.5,            // bulb radius (CSS px) at mid strength, x 0.85-1.15 with the swing
    strand: 6.5,           // strand radius (CSS px): a tube tapering from 1.9x where it leaves the body to 0.86x at the bulb;
                           // it thins a little as it stretches, never under 72% (no hairlines)
    union: 1.9,            // smooth-union radius with the body x strand: the thick root where the body flows into the tail
    lag: 0.15,             // share of the body's velocity the tail starts with (it is left behind and dragged out)...
    carry: 0.6,            // ...plus this share of the momentum the body abandoned (a turn or reversal swings it out)
    kick: 40,              // px/s outward at the start
    omega: 22,             // rad/s spring stiffness while pulling (ramps in over 120 ms; 2.2 x when snapping back)
    damping: 0.6,          // damping ratio of the strand springs (elastic, not jelly)
    bulbMass: 3,           // the bulb is heavier than a strand point: it lags most
    drag: 2,               // 1/s air drag on the tail points
    maxRel: 3000,          // px/s: no tail point moves faster than this relative to the root (it whips, it never jumps)
    rest: 0.85,            // spring rest length while pulling, x the segment limit: the tail is held out, not collapsed
    holdMs: 110,           // the tail is held out this long (x 1 + 0.4 x strength: 110-154 ms), then the neck forms...
    brake: 0.6,            // ...or earlier (after minPullMs) once the body is braking under this share of its peak speed in the
    minPullMs: 60,         // pull: the pull is ending, so the bulb pinches off at once (a neck 0.4 x neckMs)
    maxPullMs: 220,        // ...and at the latest after this long
    neckMs: 45,            // the neck thins to a thread...
    threadPx: 1.1,         // ...this wide, then the bulb pinches off
    retractMs: 110,        // the rest of the strand snaps back within this long
    cooldownMs: 140,       // before the next tail
    splash: 1.3,           // splash beads per pinch: about splash x (0.6 + 0.8 x strength)
    bulbLife: 0.55,        // the pinched bulb's life x the goo life for its size (short: a blob of goo, not a lasting marble)
    release: 0.15,         // at the pinch the bulb and splash keep this share of their velocity: left hanging where it broke
                           // off, as the approved droplet (0.12), not thrown on into a body that has just stopped
    bound: 196,            // no tail point further than this from the body centre (CSS px): it stays in the 420 px body canvas
    manualThrow: 1.1,      // manual lab tails: launch speed x this
    free: 0,               // > 0 (the boundary diagnostic only): also start a tail whenever the pointer is this fast (px/s),
                           // without a trigger event: the always-on speed trail this design must not be
  }),
});
