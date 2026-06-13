/* Liquid cursor lab engine: the primary body (Phase 2, approved) and the rendering side of the Phase 3 droplet.
   One bounded, pointer-events:none WebGL2 canvas travels with a single signed-distance body that stretches along
   its motion, carries a faint membrane, grows over interactive targets and compresses on click.
   Phase 3 (Mode B and C): the independent droplet system in droplet.js reads the body each frame and never drives it;
   this shader draws its attached bud and neck as a second SDF source (smooth union) and a free bead while it is inside
   this canvas. Phase 4.5 adds up to three attached necks (rich goo) and the connected goo wake: a short tail drawn as one
   surface with the body (round cones smooth-unioned into it). Never an always-on trail or a follower chain (README.md).
   Classic script, inline GLSL, no fetch and no modules, so it runs from file:// as well as http://127.0.0.1.

   Size and shape composition (in this order):
     radius      = body.radius x hover scale (spring) x click scale (spring)     isotropic
     stretch     = 1 + (maxStretch - 1) x deformation x hover calming           along the smoothed motion axis
     compression = stretch ^ -compressionExponent                              across it (exponent 1: exact area, 1/stretch)
     local       = (along / stretch, across / compression)                     the noise-free ellipse
     boundary    = ellipse distance - membrane                                  displaced in screen space, after the deformation
   Membrane models (surface.membrane):
     "field"     screen-space 3D gradient noise sampled at the fragment position around the body centre: uniform
                 feature size along the whole outline, no rotational symmetry (Santioni refined)
     "harmonic"  three integer harmonics k, k + 2, 2k + 1 of the local-frame angle (Phase 2 original, kept for comparison) */
"use strict";
(function () {
  // A 4-vertex strip from gl_VertexID: one quad covering the cursor canvas, no vertex buffers.
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
uniform float uCompress;   // across-axis scale c = s^-exponent (1/s preserves area exactly)
uniform float uRadius;     // isotropic radius: base x hover x click
uniform float uNoiseAmp;   // peak membrane displacement
uniform float uModel;      // membrane model: 0 integer harmonics (Phase 2 original), 1 screen-space noise field
uniform float uNoiseK;     // harmonic model: lowest harmonic
uniform float uPhase;      // harmonic model: phase (radians)
uniform vec3 uHarm;        // harmonic model: per-harmonic gains, (1, 1, 1) except in lab diagnostics
uniform float uCell;       // field model: feature size (device px)
uniform float uNoiseT;     // field model: time coordinate, periodic over [0, 64)
uniform vec4 uDrop[3];     // the attached droplets (budding, necking or detaching), each smooth-unioned with the body:
                           // xy centre, z radius, w union radius (device px); z = 0: none. Phases 3-4: at most one (uDrop[0]);
                           // Phase 4.5 rich goo: up to three, each bridging to the body only, never to another neck
uniform vec3 uDropShape[3];// xy unit elongation axis, z elongation (0 = round)
uniform vec4 uDropDbg;     // debug only: zw velocity x 0.1 s (device px) of the first attached bead
uniform vec4 uBead[5];     // Phase 4: free beads drawn in this canvas (hard union, own opacity): xy centre, z radius
                           // (device px), w opacity; z = 0: unused. A body passing close by can never re-bridge them
uniform vec3 uBeadShape[5];
uniform vec2 uBeadVel[5];  // debug only: free bead velocity x 0.1 s (device px)
uniform float uBeadK[5];   // Phase 4.5: cohesion radius of a young rich-goo bead (device px); 0: hard union as in Phase 4
uniform vec2 uTaper;       // Phase 4.5: x rear lengthening while a primary is pulled out (0: the approved body exactly),
                           // y the side of the stretch axis it applies to (+1 / -1)
uniform vec4 uWake[5];     // Phase 4.5 correction: the connected goo tail, root to bulb: xy centre, z radius (device px)
uniform float uWakeK;      // its smooth-union radius with the body (device px); 0: no tail (the body is drawn as before)
uniform float uAlpha;      // presence fade
uniform float uAA;
uniform float uRing;       // Phase 1 detection ring (Phase 1 disc preset only)
uniform float uRingR;
uniform float uRingW;
uniform float uDebug;
uniform vec2 uRaw;         // raw pointer
uniform vec2 uVelRaw;      // raw velocity, device px/s
uniform vec2 uVelSmooth;   // smoothed velocity, device px/s
uniform float uPlain;
uniform float uPlainAlpha;
uniform vec3 uPlainColor;
out vec4 outColor;

float cover(float d) { return clamp(0.5 - d / uAA, 0.0, 1.0); } // signed distance -> pixel coverage

float segment(vec2 p, vec2 a, vec2 b, out float t) {
  vec2 pa = p - a, ba = b - a;
  t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * t);
}

// Phase 2 original: three integer harmonics of the local-frame angle, continuous across +-pi, never k = 1.
// Kept for comparison. Its fixed low orders (4, 6, 9) are what made the outline read as a rounded polygon.
float membrane(float a) {
  float k = max(2.0, floor(uNoiseK + 0.5));
  return uHarm.x * 0.40 * sin(k * a + uPhase)
       + uHarm.y * 0.35 * sin((k + 2.0) * a - 1.3 * uPhase + 1.7)
       + uHarm.z * 0.25 * sin((2.0 * k + 1.0) * a + 0.7 * uPhase + 4.1);
}

// Santioni refined: 3D gradient noise (x, y in screen space, z = time), periodic in z over 64 cells so time wraps
// seamlessly. Lattice hash: pcg3d (Jarzynski & Olano, "Hash Functions for GPU Rendering", JCGT 2020).
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
// p is the screen-space offset from the body centre, so features keep one size along the whole outline, stretched or
// not, and the pattern neither rotates with the axis nor repeats around the body. Soft-limited to [-1, 1] (C1 at the
// limit) so uNoiseAmp stays a hard bound on the displacement without flat-topped bumps.
float field(vec2 p) {
  vec2 q = mat2(0.8, 0.6, -0.6, 0.8) * p / uCell; // a fixed rotation keeps lattice axes off the screen axes
  float x = clamp(2.2 * gnoise(vec3(q, uNoiseT)), -1.0, 1.0);
  return x * (1.5 - 0.5 * x * x);
}

// Phase 3 bead: an ellipse elongated along an axis (area-neutral), first-order distance in screen px.
// Identical to the bead layer's function (droplet.js), so a bead drawn in either canvas gives the same pixels.
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
// Phase 4.5 correction: exact distance to a round cone (a capsule whose radius goes from ra at a to rb at b): one tail
// segment. Consecutive segments share their end circles, so the chain is one continuous tapering tube.
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
  // gradient length of lr with respect to p, to turn the local-frame value into a screen-space distance
  float gl = length(vec2(l.x / uStretch, l.y / uCompress)) / max(lr, 1e-4);
  if (uTaper.x != 0.0 && dot(p, uAxis) * uTaper.y > 0.0) { // the egg: that half's along-axis scale is (1 + taper) longer
    float st = uStretch * (1.0 + uTaper.x);
    l = vec2(dot(p, uAxis) / st, l.y); lr = length(l); gl = length(vec2(l.x / st, l.y / uCompress)) / max(lr, 1e-4);
  }
  gl = max(gl, 1e-4);
  float d0 = (lr - uRadius) / gl; // noise-free ellipse distance, screen px
  // the membrane is displaced in screen space; it only matters near the edge, so it is skipped elsewhere
  float n = 0.0;
  if (abs(d0) < uNoiseAmp + 2.0 * uAA + 1.0) n = uModel < 0.5 ? membrane(atan(l.y, l.x)) : field(p);
  float dist = d0 - uNoiseAmp * n;
  float body = cover(dist);
  // droplets: the attached one is one liquid surface with the body (smooth union); free beads are separate (hard union)
  float drop = 0.0, beadInk = 0.0;
  bool anyDrop = uDrop[0].z > 0.0;
  if (uDrop[0].z > 0.0) {
    float dBody = dist;
    dist = smin(dBody, beadDist(gl_FragCoord.xy - uDrop[0].xy, uDropShape[0], uDrop[0].z), uDrop[0].w);
    for (int i = 1; i < 3; i++) if (uDrop[i].z > 0.0) dist = min(dist, smin(dBody, beadDist(gl_FragCoord.xy - uDrop[i].xy, uDropShape[i], uDrop[i].z), uDrop[i].w));
    body = cover(dist);
  }
  if (uWakeK > 0.0) { // the connected tail: one surface with the body (thick root fillet), joints softened, a bulb at the end
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
    anyDrop = true; drop = max(drop, cover(db) * uBead[i].w); beadInk = max(beadInk, cover(abs(db) - 0.75) * uBead[i].w);
    if (uBeadK[i] > 0.0) { if (anyC) { dc = smin(dc, db, min(kc, uBeadK[i])); kc = max(kc, uBeadK[i]); } else { dc = db; kc = uBeadK[i]; anyC = true; } }
  }
  if (anyC) { drop = max(drop, cover(dc)); beadInk = max(beadInk, cover(abs(dc) - 0.75)); } // a brief metaball pull between young pieces
  if (uRing > 0.5) body *= 1.0 - cover(abs(lr - uRingR) - uRingW * 0.5);

  float marks = 0.0;
  if (uDebug > 0.5) {
    float t;
    vec2 e = min(gl_FragCoord.xy, uSize - gl_FragCoord.xy);
    marks = max(marks, cover(min(e.x, e.y) - 1.0));                                           // canvas bounds
    vec2 q = abs(gl_FragCoord.xy - uRaw);
    marks = max(marks, cover(min(max(q.x - 0.75, q.y - 8.0), max(q.y - 0.75, q.x - 8.0))));     // raw pointer
    marks = max(marks, cover(abs(d0) - 0.6));                                                  // noise-free ellipse
    float along = dot(p, uAxis);
    marks = max(marks, cover(abs(dot(p, perp)) - 0.5) * step(0.5, fract(along / 12.0)));       // motion axis (dashed)
    marks = max(marks, cover(segment(p, -perp * uRadius * uCompress, perp * uRadius * uCompress, t) - 0.6)); // minor axis
    marks = max(marks, cover(segment(p, vec2(0.0), uVelSmooth * 0.1, t) - 1.1));               // smoothed velocity x 0.1 s
    float dr = segment(p, vec2(0.0), uVelRaw * 0.1, t);
    marks = max(marks, cover(dr - 0.6) * step(0.5, fract(t * length(uVelRaw) * 0.1 / 5.0)));   // raw velocity (dotted)
    if (uDrop[0].z > 0.0) {
      vec2 q = gl_FragCoord.xy - uDrop[0].xy, bq = uDrop[0].xy - uCenter;
      marks = max(marks, cover(min(max(abs(q.x) - 0.6, abs(q.y) - 5.0), max(abs(q.y) - 0.6, abs(q.x) - 5.0)))); // bead centre
      float da = segment(p, vec2(0.0), bq, t);
      marks = max(marks, cover(da - 0.5) * step(0.5, fract(t * length(bq) / 6.0)));                       // attachment ray (dotted)
      if (uDrop[0].w > 0.5) marks = max(marks, cover(abs(length(q) - uDrop[0].w) - 0.5) * step(0.5, fract(atan(q.y, q.x) * 1.9))); // union radius
      marks = max(marks, cover(segment(gl_FragCoord.xy, uDrop[0].xy, uDrop[0].xy + uDropDbg.zw, t) - 0.9));  // bead velocity x 0.1 s
    }
    if (uWakeK > 0.0) for (int i = 0; i < 5; i++) if (uWake[i].z > 0.0) { // the tail points: a ring each (the bulb's is its radius)
      vec2 q = gl_FragCoord.xy - uWake[i].xy;
      marks = max(marks, cover(abs(length(q) - (i == 4 ? uWake[i].z : 2.5)) - 0.5));
    }
    for (int i = 1; i < 3; i++) if (uDrop[i].z > 0.0) { // further necks (rich goo): centre and dotted attachment ray
      vec2 q = gl_FragCoord.xy - uDrop[i].xy, bq = uDrop[i].xy - uCenter;
      marks = max(marks, cover(min(max(abs(q.x) - 0.6, abs(q.y) - 4.0), max(abs(q.y) - 0.6, abs(q.x) - 4.0))));
      float da = segment(p, vec2(0.0), bq, t);
      marks = max(marks, cover(da - 0.5) * step(0.5, fract(t * length(bq) / 6.0)));
    }
    for (int i = 0; i < 5; i++) if (uBead[i].z > 0.0) {
      vec2 q = gl_FragCoord.xy - uBead[i].xy;
      marks = max(marks, cover(min(max(abs(q.x) - 0.6, abs(q.y) - 5.0), max(abs(q.y) - 0.6, abs(q.x) - 5.0)))); // free bead centre
      marks = max(marks, cover(segment(gl_FragCoord.xy, uBead[i].xy, uBead[i].xy + uBeadVel[i], t) - 0.9));   // its velocity x 0.1 s
    }
  }

  if (uPlain > 0.5) {
    // lab-only diagnostic: translucent colour with an ink edge, normal compositing
    float a = max(body, drop) * uPlainAlpha;
    float ink = max(max(marks, cover(abs(dist) - 0.75)), beadInk);
    vec3 c = uPlainColor * a * (1.0 - ink) + vec3(0.08) * ink;
    float al = (a * (1.0 - ink) + ink) * uAlpha;
    outColor = vec4(c * uAlpha, al);
  } else {
    // white mask for mix-blend-mode: difference; debug marks XOR so they stay visible inside the body
    float m = anyDrop ? abs(max(body * uAlpha, drop) - marks * uAlpha) : abs(body - marks) * uAlpha;
    outColor = vec4(vec3(m), m); // premultiplied
  }
}`;

  const UNIFORMS = ["uSize", "uCenter", "uAxis", "uStretch", "uCompress", "uRadius", "uNoiseAmp", "uModel", "uNoiseK", "uPhase", "uHarm", "uCell", "uNoiseT",
    "uAlpha", "uAA", "uRing", "uRingR", "uRingW", "uDebug", "uRaw", "uVelRaw", "uVelSmooth", "uPlain", "uPlainAlpha", "uPlainColor",
    "uDrop", "uDropShape", "uDropDbg", "uBead", "uBeadShape", "uBeadVel", "uBeadK", "uTaper", "uWake", "uWakeK"];

  // Flat tunable names -> config [group, key]. Presets and the lab tuning panel use these names.
  const PARAMS = {
    followResponse: ["follow", "response"],
    radius: ["body", "radius"], maxStretch: ["body", "maxStretch"], stretchSpeed: ["body", "stretchSpeed"], stretchCurve: ["body", "stretchCurve"],
    compressionExponent: ["body", "compressionExponent"],
    velocitySmoothingMs: ["body", "velocitySmoothingMs"], stretchResponse: ["body", "stretchResponse"], recoveryResponse: ["body", "recoveryResponse"],
    deformDamping: ["body", "deformDamping"], axisResponse: ["body", "axisResponse"], axisMinSpeed: ["body", "axisMinSpeed"], axisFullSpeed: ["body", "axisFullSpeed"],
    membrane: ["surface", "membrane"], baseNoise: ["surface", "baseNoise"], maxNoise: ["surface", "maxNoise"], noiseCurve: ["surface", "noiseCurve"],
    noiseScale: ["surface", "noiseScale"], noiseFrequency: ["surface", "noiseFrequency"], noiseSpeed: ["surface", "noiseSpeed"], noiseSpeedGain: ["surface", "noiseSpeedGain"],
    idleFadeMs: ["surface", "idleFadeMs"], stillNoise: ["surface", "stillNoise"],
    hoverScale: ["interaction", "hoverScale"], hoverResponse: ["interaction", "hoverResponse"], hoverDamping: ["interaction", "hoverDamping"],
    hoverNoiseMultiplier: ["interaction", "hoverNoiseMultiplier"], hoverDeformMultiplier: ["interaction", "hoverDeformMultiplier"],
    clickCompression: ["interaction", "clickCompression"], clickResponse: ["interaction", "clickResponse"], releaseDamping: ["interaction", "releaseDamping"],
    presenceResponse: ["interaction", "presenceResponse"],
    hoverRing: ["render", "hoverRing"],
    // Phase 3 droplet (config.droplets); only Mode B and Mode C use them
    dropMinSpeed: ["droplets", "minSpeed"], dropImpulse: ["droplets", "impulse"], dropAccel: ["droplets", "accel"], dropJerk: ["droplets", "jerk"],
    dropTurnGain: ["droplets", "turnGain"], dropReferenceMs: ["droplets", "referenceMs"], dropAccelMs: ["droplets", "accelMs"], dropJerkMs: ["droplets", "jerkMs"],
    dropPeakHoldMs: ["droplets", "peakHoldMs"], dropDebounceMs: ["droplets", "debounceMs"], dropArmMs: ["droplets", "armMs"], dropCooldownMs: ["droplets", "cooldownMs"],
    dropRadius: ["droplets", "radius"], dropRadiusSpread: ["droplets", "radiusSpread"], dropBudMs: ["droplets", "budMs"], dropNeckMs: ["droplets", "neckMs"],
    dropThreadMs: ["droplets", "threadMs"], dropThreadGap: ["droplets", "threadGap"], dropNeckModel: ["droplets", "neckModel"],
    dropDetachMs: ["droplets", "detachMs"], dropUnion: ["droplets", "union"], dropPinchCurve: ["droplets", "pinchCurve"], dropPinchStretch: ["droplets", "pinchStretch"],
    dropMomentum: ["droplets", "momentum"], dropCarry: ["droplets", "carry"], dropSpreadDeg: ["droplets", "spreadDeg"], dropMinSeparation: ["droplets", "minSeparation"],
    dropDrag: ["droplets", "drag"], dropLifeMs: ["droplets", "lifeMs"], dropFreeShare: ["droplets", "freeShare"], dropShrinkCurve: ["droplets", "shrinkCurve"],
    dropFadeCurve: ["droplets", "fadeCurve"], dropEndScale: ["droplets", "endScale"], dropRecoil: ["droplets", "recoil"], dropAbsorbMs: ["droplets", "absorbMs"],
    dropSnapKick: ["droplets", "snapKick"], dropGapJumpPx: ["droplets", "gapJumpPx"],
    // Phase 4 pool (config.pool); poolMax 1 is the approved Phase 3 single droplet
    poolMax: ["pool", "max"], poolBurst: ["pool", "burst"], poolSpacingMs: ["pool", "spacingMs"], poolSpacingGrowth: ["pool", "spacingGrowth"],
    poolStep: ["pool", "step"], poolFollowScale: ["pool", "followScale"], poolSatellite: ["pool", "satellite"], poolSatSwing: ["pool", "satSwing"],
    poolSatCooldownMs: ["pool", "satCooldownMs"], poolSatScale: ["pool", "satScale"], poolSatTime: ["pool", "satTime"], poolSatEnergy: ["pool", "satEnergy"],
    poolSatLife: ["pool", "satLife"], poolSatAngleDeg: ["pool", "satAngleDeg"], poolJoinPx: ["pool", "joinPx"],
    // Phase 4.5 rich goo (config.goo); gooOn 0 is the Phase 4 pool
    gooOn: ["goo", "on"], gooBudget: ["goo", "budget"], gooRefillMs: ["goo", "refillMs"], gooSpacingMs: ["goo", "spacingMs"], gooStep: ["goo", "step"],
    gooCooldownMs: ["goo", "cooldownMs"], gooMaxAttached: ["goo", "maxAttached"], gooFollowScale: ["goo", "followScale"], gooScale: ["goo", "scale"], gooUnion: ["goo", "union"],
    gooSecSwing: ["goo", "secSwing"], gooSecScale: ["goo", "secScale"], gooSecDelayMs: ["goo", "secDelayMs"], gooSecNeckMs: ["goo", "secNeckMs"], gooSecAngleDeg: ["goo", "secAngleDeg"],
    gooMicroSwing: ["goo", "microSwing"], gooMicroScale: ["goo", "microScale"], gooMicroDelayMs: ["goo", "microDelayMs"], gooMicroNeckMs: ["goo", "microNeckMs"], gooMicroAngleDeg: ["goo", "microAngleDeg"],
    gooWake: ["goo", "wake"], gooWakeMs: ["goo", "wakeMs"], gooWakeSwing: ["goo", "wakeSwing"], gooWakeFree: ["goo", "wakeFree"], gooMomentum: ["goo", "momentum"], gooKick: ["goo", "kick"],
    gooDrag: ["goo", "drag"], gooDragSize: ["goo", "dragSize"], gooEarlyDrag: ["goo", "earlyDrag"], gooEarlyMs: ["goo", "earlyMs"], gooLife: ["goo", "life"],
    gooWakeLife: ["goo", "wakeLife"], gooMicroLife: ["goo", "microLife"], gooJoin: ["goo", "join"], gooCohesion: ["goo", "cohesion"], gooTaper: ["goo", "taper"],
    // Phase 4.5 correction: the connected goo wake (config.wake)
    wakeOn: ["wake", "on"], wakeLenMin: ["wake", "lenMin"], wakeLenMax: ["wake", "lenMax"], wakeBulb: ["wake", "bulb"], wakeStrand: ["wake", "strand"], wakeUnion: ["wake", "union"],
    wakeLag: ["wake", "lag"], wakeCarry: ["wake", "carry"], wakeKick: ["wake", "kick"], wakeOmega: ["wake", "omega"], wakeDamping: ["wake", "damping"], wakeBulbMass: ["wake", "bulbMass"],
    wakeDrag: ["wake", "drag"], wakeBrake: ["wake", "brake"], wakeMinPullMs: ["wake", "minPullMs"], wakeMaxPullMs: ["wake", "maxPullMs"], wakeNeckMs: ["wake", "neckMs"],
    wakeThreadPx: ["wake", "threadPx"], wakeRetractMs: ["wake", "retractMs"], wakeCooldownMs: ["wake", "cooldownMs"], wakeSplash: ["wake", "splash"], wakeBulbLife: ["wake", "bulbLife"],
    wakeBound: ["wake", "bound"], wakeManualThrow: ["wake", "manualThrow"], wakeFree: ["wake", "free"], wakeRest: ["wake", "rest"], wakeHoldMs: ["wake", "holdMs"],
    // Phase 4.5 reference goo: the curved metaball spine (config.spine)
    spineOn: ["spine", "on"], spineVOn: ["spine", "vOn"], spineVFull: ["spine", "vFull"], spineAccel: ["spine", "accel"], spineRiseMs: ["spine", "riseMs"], spineHoldMs: ["spine", "holdMs"],
    spineRetractMs: ["spine", "retractMs"], spineLength: ["spine", "length"], spineNodes: ["spine", "nodes"], spineStiffness: ["spine", "stiffness"], spineDamping: ["spine", "damping"],
    spineLag: ["spine", "lag"], spineBulb: ["spine", "bulb"], spineBulbAhead: ["spine", "bulbAhead"], spineRoot: ["spine", "root"], spineRootBehind: ["spine", "rootBehind"],
    spineNeck: ["spine", "neck"], spineTaper: ["spine", "taper"], spineIrregular: ["spine", "irregular"], spineTerminal: ["spine", "terminal"], spineUnion: ["spine", "union"], spineShedMin: ["spine", "shedMin"], spineShedRate: ["spine", "shedRate"], spineSplashCount: ["spine", "splashCount"],
    spineSplashMin: ["spine", "splashMin"], spineSplashMax: ["spine", "splashMax"], spineSplashLife: ["spine", "splashLife"], spineSplashMomentum: ["spine", "splashMomentum"],
    wakeRelease: ["wake", "release"], wakeMaxRel: ["wake", "maxRel"],
  };
  function paramsFromConfig(CFG, overrides) {
    const P = {};
    for (const k in PARAMS) P[k] = CFG[PARAMS[k][0]][PARAMS[k][1]];
    if (overrides) for (const k in overrides) if (k in PARAMS) P[k] = overrides[k];
    return P;
  }

  // ------------------------------------------------------------------ body dynamics (pure; also driven directly by the checks)
  const TWO_PI_10 = 20 * Math.PI; // harmonic phase wraps here: every harmonic phase factor (1, 1.3, 0.7) stays continuous
  const FIELD_PERIOD = 64;        // field time wraps here: the noise lattice is periodic over 64 cells in z
  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-6, b - a))); return t * t * (3 - 2 * t); };
  function createBodyState() {
    return {
      svx: 0, svy: 0, sspeed: 0, ax: 1, ay: 0, amount: 0,
      def: { x: 0, v: 0 }, hov: { x: 1, v: 0 }, clk: { x: 1, v: 0 },
      hoverProgress: 0, stretch: 1, compression: 1, radiusScale: 1, noiseAmp: 0, phase: 0, noiseT: 0, life: 1, idle: 0,
      hovering: false, pressed: false, state: "rest",
    };
  }
  // semi-implicit Euler spring on {x, v}; stable for w * h < 1, which the substep bound guarantees for the lab ranges
  function spring(o, target, w, z, h) { o.v += (w * w * (target - o.x) - 2 * z * w * o.v) * h; o.x += o.v * h; }
  function resetMotion(B) { B.svx = B.svy = B.sspeed = 0; B.amount = 0; B.def.x = B.def.v = 0; B.stretch = B.compression = 1; B.state = "rest"; }
  // inp: { vx, vy (raw velocity, CSS px/s), hover, pressed }; dt in seconds
  function stepBody(B, P, maxSubstep, inp, dt) {
    if (!(dt > 0)) return;
    // second velocity stage, smoothed as a vector so the direction never wraps around +-pi
    const kv = 1 - Math.exp(-dt * 1000 / Math.max(1, P.velocitySmoothingMs));
    B.svx += (inp.vx - B.svx) * kv; B.svy += (inp.vy - B.svy) * kv;
    B.sspeed = Math.hypot(B.svx, B.svy);
    // stretch axis: a line, not an arrow, so it always turns the short way; it holds still when direction is noise
    if (B.sspeed > P.axisMinSpeed) {
      let dx = B.svx / B.sspeed, dy = B.svy / B.sspeed;
      if (dx * B.ax + dy * B.ay < 0) { dx = -dx; dy = -dy; }
      const ka = 1 - Math.exp(-P.axisResponse * smoothstep(P.axisMinSpeed, P.axisFullSpeed, B.sspeed) * dt);
      const nx = B.ax + (dx - B.ax) * ka, ny = B.ay + (dy - B.ay) * ka, nl = Math.hypot(nx, ny);
      if (nl > 1e-6) { B.ax = nx / nl; B.ay = ny / nl; }
    }
    // saturating speed -> deformation amount (0..1): flat when slow, bounded when fast
    B.amount = 1 - Math.exp(-Math.pow(B.sspeed / Math.max(1, P.stretchSpeed), P.stretchCurve));
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
    B.stretch = Math.min(P.maxStretch, Math.max(0.92, 1 + (P.maxStretch - 1) * m)); // hard ceiling; tiny squash floor
    B.compression = Math.pow(B.stretch, -P.compressionExponent); // exponent 1: exactly 1 / stretch (area preserved)
    B.radiusScale = B.hov.x * B.clk.x;
    const mm = Math.min(1, Math.abs(m));
    // membrane life: alive while anything moves, then it stills (no idle pulsing, no idle redraws)
    const busy = changed || B.sspeed > 5 || Math.abs(B.def.x) > 0.004 || Math.abs(B.def.v) > 0.02 || Math.abs(B.hov.v) > 0.01 || Math.abs(B.clk.v) > 0.01;
    B.idle = busy ? 0 : B.idle + dt;
    B.life += ((B.idle * 1000 < P.idleFadeMs ? 1 : 0) - B.life) * (1 - Math.exp(-4 * dt));
    if (B.life < 0.002) B.life = 0;
    // the resting part of the membrane fades to stillNoise as the membrane stills (1 keeps it, 0 settles to a true circle);
    // it uses this frame's life, so the amplitude reaches 0 on the same frame life does (no one-frame-late last draw)
    const rest = P.baseNoise * (P.stillNoise + (1 - P.stillNoise) * B.life);
    B.noiseAmp = (rest + (P.maxNoise - P.baseNoise) * Math.pow(mm, P.noiseCurve)) * (1 + (P.hoverNoiseMultiplier - 1) * B.hoverProgress);
    if (B.noiseAmp < 1e-6) B.noiseAmp = 0; // the spring's vanishing tail must not keep a stilled body redrawing
    const evolve = dt * P.noiseSpeed * B.life * (1 + P.noiseSpeedGain * mm);
    B.phase += evolve;
    if (B.phase > TWO_PI_10) B.phase -= TWO_PI_10;
    B.noiseT += evolve;
    if (B.noiseT >= FIELD_PERIOD) B.noiseT -= FIELD_PERIOD;
    B.state = B.def.x < -0.004 ? "overshoot" : B.amount > B.def.x + 0.01 ? "stretching" : B.def.x > 0.01 ? "recovering" : "rest";
  }

  // ------------------------------------------------------------------ engine
  const LD = window.LiquidDroplet || null; // Phase 3 droplet system (droplet.js); the body works without it
  function create(CFG, opts = {}) {
    const C = CFG.canvas, F = CFG.follow, RND = CFG.render, AX = CFG.accessibility, SEL = CFG.selectors;
    const root = document.documentElement;
    const P = paramsFromConfig(CFG, opts.params);
    const B = createBodyState();

    // ------------------------------------------------------------------ state (allocated once, mutated in place)
    const S = {
      mode: opts.mode || CFG.lab.defaultMode, mask: RND.mask, userEnabled: true, hideNative: CFG.lab.hideNativeCursor,
      active: false, disabledReasons: "", suspended: "awaiting pointer", visible: false, frozen: false,
      webgl2: false, glRenderer: "", glError: "", contextLost: false,
      coalescedSupported: typeof PointerEvent !== "undefined" && "getCoalescedEvents" in PointerEvent.prototype,
      hasPointer: false, inside: true, pointerType: "", buttons: 0,
      rawX: 0, rawY: 0, renderX: 0, renderY: 0, vx: 0, vy: 0, speed: 0, sinceSample: 0, gapResets: 0,
      lastSampleT: 0, samples: 0, moveEvents: 0, lastCoalesced: 0,
      interactiveEl: null, ignoreEl: null, presence: 0,
      dtMs: 0, instFps: 0, avgFps: 0, frames: 0, draws: 0, clampedFrames: 0, loopRunning: false, workMs: 0,
      frameTimes: new Float32Array(Math.max(2, CFG.debug.fpsWindow)), ftIndex: 0, ftCount: 0, ftSum: 0,
      dpr: 1, effDpr: 1, cssSize: C.cssSize, backingW: 0, backingH: 0, vw: 0, vh: 0, radiusClamped: false,
      finePointer: false, reducedMotion: false, forcedColors: false, visibility: document.visibilityState,
      body: B, params: P, preset: "",
      // Phase 3: the independent droplet system (reads the body, never drives it) and its bead layer
      drop: LD ? LD.createDropletSystem() : null, dropletsDebug: true, bead: null, dropNearEdge: false, dropWorkMs: 0,
      dropNatural: true, // lab (Mode C): natural emissions on/off; the manual controls keep working
      dropDrawMs: 0,     // EMA of the droplet part of draw() (layout, uniforms, tiles), CPU
    };
    const inp = { vx: 0, vy: 0, hover: false, pressed: false };
    const dropBody = { x: 0, y: 0, R: 0, s: 1, c: 1, ax: 1, ay: 0, amp: 0, cell: 36, nt: 0 }, dropPtr = { vx: 0, vy: 0, allowed: false }; // reused every frame
    let vBaseX = 0, vBaseY = 0, vBaseT = 0, lastTarget = null, raf = 0, lastTs = 0, scrollCheck = false;
    let posX = NaN, posY = NaN; // last written canvas translation (CSS px)
    // draw-skip signature: 0-28 body, 29-39 the first attached droplet, 42 + 9 k the k-th free bead drawn here; Phase 4.5:
    // 87 + 8 j the (j + 1)-th further attached droplet, 103 + k the k-th bead's cohesion radius, 108-109 the taper; the
    // correction: 110 + 3 i the i-th tail point (x, y, r), 125 the tail's union radius
    const NU = 126, cur = new Float32Array(NU), prev = new Float32Array(NU).fill(NaN), wakeU = new Float32Array(20);
    const beadU = new Float32Array(20), beadShapeU = new Float32Array(15), beadVelU = new Float32Array(10), beadKU = new Float32Array(5); // reused uniform blocks
    const dropU = new Float32Array(12), dropShapeU = new Float32Array(9);
    const harm = [1, 1, 1]; // harmonic-model gains; only lab diagnostics change them (setDiagnostic)
    let beadLayerMode = "auto"; // lab diagnostic: "auto" | "body" | "bead" (which canvas draws a free bead)
    let sizeDirty = true;

    // ------------------------------------------------------------------ canvas
    const canvas = document.createElement("canvas");
    canvas.className = "lc-canvas";
    canvas.setAttribute("aria-hidden", "true");
    const cs = canvas.style;
    cs.position = "fixed"; cs.left = "0"; cs.top = "0"; cs.width = C.cssSize + "px"; cs.height = C.cssSize + "px";
    cs.pointerEvents = "none"; cs.zIndex = String(C.zIndex); cs.visibility = "hidden"; cs.willChange = "transform"; cs.contain = "strict";
    document.body.appendChild(canvas); // root-level sibling: never inside a clipping or stacking ancestor

    let gl = null, prog = null, vao = null;
    const U = {};
    function initGL() {
      S.glError = "";
      gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power" });
      if (!gl) { S.webgl2 = false; S.glError = "WebGL2 context unavailable"; return false; }
      const sh = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s) || "shader compile failed");
        return s;
      };
      try {
        prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(prog) || "program link failed");
      } catch (err) { S.webgl2 = false; S.glError = String(err.message || err); gl = null; return false; }
      vao = gl.createVertexArray();
      UNIFORMS.forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0);
      S.webgl2 = true; S.glRenderer = String(gl.getParameter(gl.RENDERER) || "");
      if (S.glRenderer === "WebKit WebGL") { // Chromium masks RENDERER; the unmasked name shows SwiftShader vs a real GPU
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        if (ext) S.glRenderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || S.glRenderer);
      }
      sizeDirty = true; prev.fill(NaN);
      return true;
    }
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); S.contextLost = true; S.webgl2 = false; evaluate(); });
    canvas.addEventListener("webglcontextrestored", () => { S.contextLost = false; initGL(); sizeBacking(); evaluate(); });

    // ------------------------------------------------------------------ media policy
    const mqFine = matchMedia("(pointer: fine)"), mqReduced = matchMedia("(prefers-reduced-motion: reduce)"), mqForced = matchMedia("(forced-colors: active)");
    [mqFine, mqReduced, mqForced].forEach((m) => m.addEventListener("change", evaluate));
    let mqDpr = null;
    function watchDpr() { // a zoom or monitor change alters devicePixelRatio; this fires even without a resize
      if (mqDpr) mqDpr.removeEventListener("change", onDprChange);
      mqDpr = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`); mqDpr.addEventListener("change", onDprChange);
    }
    function onDprChange() { sizeBacking(); watchDpr(); }

    function staticMode() { return S.reducedMotion && AX.reducedMotionPolicy === "debug-static" && S.mode === "C"; }
    // ---- Phase 3 droplet plumbing: Mode B always, Mode C when its Droplets switch is on, never in Mode A
    function dropsOn() { return !!S.drop && (S.mode === "B" || (S.mode === "C" && S.dropletsDebug)) && !staticMode(); }
    function dropReset(why) { if (S.drop) LD.reset(S.drop, P, why); if (S.bead) S.bead.hide(); S.dropNearEdge = false; }
    function dropDisarm() { if (S.drop) LD.disarm(S.drop); } // browser or instrumentation artifacts must never read as a flick
    function ensureBead() { // the bead tiles are only created once droplets are first switched on
      if (!S.bead && LD && dropsOn()) { S.bead = LD.createBeadTiles(C.beadCssSize, C.zIndex, RND); S.bead.size(Math.min(S.dpr, C.maxDpr)); }
    }
    function fillDropBody() {
      dropBody.x = S.renderX; dropBody.y = S.renderY; dropBody.R = P.radius * B.radiusScale;
      dropBody.s = B.stretch; dropBody.c = B.compression; dropBody.ax = B.ax; dropBody.ay = B.ay;
      // the drawn membrane (field model), so the revised neck measures its gap from the surface the shader draws
      dropBody.amp = P.membrane === "harmonic" ? 0 : B.noiseAmp; dropBody.cell = Math.max(1, P.noiseScale); dropBody.nt = B.noiseT;
    }
    function evaluate() {
      S.finePointer = mqFine.matches; S.reducedMotion = mqReduced.matches; S.forcedColors = mqForced.matches;
      const why = [];
      if (!S.webgl2) why.push(S.contextLost ? "WebGL context lost" : "WebGL2 unavailable");
      if (!S.userEnabled) why.push("switched off");
      if (AX.finePointerOnly && !S.finePointer) why.push("no fine pointer");
      if (AX.disableInForcedColors && S.forcedColors) why.push("forced colours");
      if (S.reducedMotion && !staticMode()) why.push("reduced motion");
      S.disabledReasons = why.join(", ");
      S.active = why.length === 0;
      root.classList.toggle("lc-active", S.active);
      root.classList.toggle("lc-hide-native", S.active && S.hideNative);
      if (S.active && document.visibilityState === "visible") start(); else stop();
      updateVisibility();
    }

    // ------------------------------------------------------------------ sizing
    function sizeBacking() {
      S.dpr = window.devicePixelRatio || 1; S.vw = window.innerWidth; S.vh = window.innerHeight;
      const d = Math.min(S.dpr, C.maxDpr), px = Math.max(1, Math.round(C.cssSize * d));
      if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
      S.backingW = canvas.width; S.backingH = canvas.height; S.effDpr = S.backingW / C.cssSize;
      posX = NaN; sizeDirty = true;
      if (S.bead) S.bead.size(d);
      dropDisarm();
    }

    // ------------------------------------------------------------------ input (observe only: passive, never preventDefault, never stop propagation)
    function sample(x, y, t) {
      if (!S.hasPointer) {
        S.hasPointer = true; S.rawX = S.renderX = vBaseX = x; S.rawY = S.renderY = vBaseY = y; vBaseT = S.lastSampleT = t; S.vx = S.vy = 0;
        dropDisarm(); return;
      }
      const gap = t - S.lastSampleT, jump = Math.hypot(x - S.rawX, y - S.rawY);
      S.rawX = x; S.rawY = y; S.lastSampleT = t; S.sinceSample = 0;
      if (gap > F.gapResetMs) { // no velocity across a tracking gap
        vBaseX = x; vBaseY = y; vBaseT = t; S.vx = S.vy = 0; S.gapResets++;
        if (jump > P.dropGapJumpPx) dropDisarm(); // the pointer moved unseen: not a flick. (A mouse that simply rested stays armed.)
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
      lastTarget = el;
      const ig = el && el.closest ? el.closest(SEL.ignore) : null;
      S.ignoreEl = ig;
      S.interactiveEl = !ig && el && el.closest ? el.closest(SEL.interactive) : null;
      updateVisibility();
    }
    function onMove(e) {
      S.pointerType = e.pointerType; S.buttons = e.buttons; S.moveEvents++;
      if (e.pointerType === "touch") { updateVisibility(); return; }
      S.inside = true;
      const list = S.coalescedSupported ? e.getCoalescedEvents() : null;
      if (list && list.length) { for (let i = 0; i < list.length; i++) sample(list[i].clientX, list[i].clientY, list[i].timeStamp); S.lastCoalesced = list.length; }
      else { sample(e.clientX, e.clientY, e.timeStamp); S.lastCoalesced = 1; }
      S.samples += S.lastCoalesced;
      // under pointer capture the target stays the capturing element, so a drag that began in an ignored region stays ignored
      if (e.target !== lastTarget) classify(e.target); else updateVisibility();
    }
    function onButtons(e) { S.pointerType = e.pointerType; S.buttons = e.buttons; dropDisarm(); if (e.target !== lastTarget) classify(e.target); else updateVisibility(); }
    function onOut(e) { if (!e.relatedTarget) { S.inside = false; updateVisibility(); } }
    function onScroll() { scrollCheck = true; } // content moved under a still pointer: re-hit-test once, next frame
    window.addEventListener("pointermove", onMove, { capture: true, passive: true });
    window.addEventListener("pointerdown", onButtons, { capture: true, passive: true });
    window.addEventListener("pointerup", onButtons, { capture: true, passive: true });
    window.addEventListener("pointerout", onOut, { capture: true, passive: true });
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", sizeBacking, { passive: true });
    document.addEventListener("visibilitychange", () => { S.visibility = document.visibilityState; dropDisarm(); evaluate(); });

    function updateVisibility() {
      const why = !S.hasPointer ? "awaiting pointer" : S.pointerType === "touch" ? "touch input" : !S.inside ? "pointer outside window" : S.ignoreEl ? "ignored target" : "";
      S.suspended = why;
      const show = S.active && !why;
      if (show === S.visible) return;
      S.visible = show;
      dropReset(show ? "body reappeared" : "body hidden");
      if (show) {
        // reappearing (page entry, leaving an ignored region, after touch): start round and centred, fade in,
        // and let velocity rebuild from fresh samples rather than from whatever happened while hidden
        resetMotion(B); S.renderX = S.rawX; S.renderY = S.rawY; S.presence = 0; prev.fill(NaN);
      }
      cs.visibility = show ? "visible" : "hidden";
    }

    // ------------------------------------------------------------------ frame loop
    function start() { if (!S.loopRunning) { S.loopRunning = true; lastTs = 0; raf = requestAnimationFrame(frame); } }
    function stop() { if (S.loopRunning) { S.loopRunning = false; cancelAnimationFrame(raf); lastTs = 0; } }
    function integrate(dt) {
      S.sinceSample += dt;
      if (S.sinceSample * 1000 > F.velocityStaleMs) { // a still mouse sends no events: raw velocity decays
        const k = Math.exp(-F.velocityDecay * dt); S.vx *= k; S.vy *= k;
        if (Math.abs(S.vx) < 0.5 && Math.abs(S.vy) < 0.5) { S.vx = 0; S.vy = 0; }
      }
      S.speed = Math.hypot(S.vx, S.vy);
      if (staticMode()) { S.renderX = S.rawX; S.renderY = S.rawY; resetMotion(B); S.presence = 1; return; }
      inp.vx = S.vx; inp.vy = S.vy; inp.hover = !!S.interactiveEl; inp.pressed = (S.buttons & 1) === 1 && S.pointerType !== "touch";
      stepBody(B, P, F.maxSubstep, inp, dt);
      const a = 1 - Math.exp(-P.followResponse * dt); // exponential following, frame-rate independent
      S.renderX += (S.rawX - S.renderX) * a; S.renderY += (S.rawY - S.renderY) * a;
      S.presence += (1 - S.presence) * (1 - Math.exp(-P.presenceResponse * dt));
      if (S.presence > 0.999) S.presence = 1;
      // Phase 3: the droplet system reads the body and the pointer after both have moved; it never writes back
      if (S.drop) {
        if (dropsOn()) {
          const t0 = performance.now();
          fillDropBody();
          dropPtr.vx = S.vx; dropPtr.vy = S.vy;
          dropPtr.allowed = S.visible && !inp.hover && B.hoverProgress < 0.02 && !inp.pressed && S.pointerType !== "touch" && S.dropNatural;
          LD.step(S.drop, P, dropBody, dropPtr, dt, F.maxSubstep);
          S.dropWorkMs += (performance.now() - t0 - S.dropWorkMs) * 0.05;
        } else if (LD.live(S.drop) > 0) dropReset("droplets off");
      }
    }
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      const w0 = performance.now();
      const rawDtMs = lastTs ? ts - lastTs : 0; // first frame after start or resume integrates nothing
      lastTs = ts;
      let dt = rawDtMs / 1000;
      if (dt > F.maxDt) { dt = F.maxDt; S.clampedFrames++; if (!S.frozen) dropDisarm(); } // a stall is not a flick (frozen lab stepping is exact)
      if (rawDtMs > 0) {
        S.dtMs = rawDtMs; S.instFps = 1000 / rawDtMs; S.frames++;
        const ft = S.frameTimes, n = ft.length;
        if (S.ftCount === n) S.ftSum -= ft[S.ftIndex]; else S.ftCount++;
        ft[S.ftIndex] = rawDtMs; S.ftSum += rawDtMs; S.ftIndex = (S.ftIndex + 1) % n;
        S.avgFps = 1000 * S.ftCount / S.ftSum;
      }
      if (scrollCheck && S.hasPointer) { scrollCheck = false; classify(document.elementFromPoint(S.rawX, S.rawY)); }
      if (!S.frozen && dt > 0) integrate(dt);
      if (S.visible) draw();
      S.workMs += (performance.now() - w0 - S.workMs) * 0.05; // EMA of this callback's own cost
    }

    function draw() {
      if (!gl || gl.isContextLost()) return;
      const half = C.cssSize / 2, dpr = S.dpr, e = S.effDpr;
      // snap the canvas to whole device pixels (no resampling blur); the sub-pixel remainder goes to the shader
      const tx = Math.round((S.renderX - half) * dpr) / dpr, ty = Math.round((S.renderY - half) * dpr) / dpr;
      if (tx !== posX || ty !== posY) { posX = tx; posY = ty; cs.transform = `translate3d(${tx}px, ${ty}px, 0)`; }
      // keep the whole body inside the bounded canvas whatever the tuning panel says
      let radius = P.radius * B.radiusScale;
      const span = Math.max(B.stretch, B.compression), limit = half - C.edgeMargin, extent = radius * span + B.noiseAmp;
      S.radiusClamped = extent > limit;
      if (S.radiusClamped) radius *= (limit - B.noiseAmp) / (radius * span);
      const debug = S.mode === "C" ? 1 : 0;
      cur[0] = (S.renderX - tx) * e; cur[1] = S.backingH - (S.renderY - ty) * e;
      cur[2] = B.ax; cur[3] = -B.ay; cur[4] = B.stretch; cur[5] = radius * e; cur[6] = B.noiseAmp * e; cur[7] = P.noiseFrequency;
      cur[8] = B.phase; cur[9] = S.presence; cur[10] = P.hoverRing && S.interactiveEl ? 1 : 0; cur[11] = debug;
      cur[12] = debug ? (S.rawX - tx) * e : 0; cur[13] = debug ? S.backingH - (S.rawY - ty) * e : 0;
      cur[14] = debug ? S.vx * e : 0; cur[15] = debug ? -S.vy * e : 0; cur[16] = debug ? B.svx * e : 0; cur[17] = debug ? -B.svy * e : 0;
      cur[18] = S.mask === "plain" ? 1 : 0; cur[19] = P.radius * e; cur[20] = S.backingW; cur[21] = e;
      cur[22] = B.compression; cur[23] = P.membrane === "harmonic" ? 0 : 1; cur[24] = Math.max(1, P.noiseScale) * e; cur[25] = B.noiseT;
      cur[26] = harm[0]; cur[27] = harm[1]; cur[28] = harm[2];
      // droplets (Phases 3 and 4): the attached one (at most one) is drawn here, smooth-unioned with the body; a free bead
      // is drawn here while it is well inside this canvas, else by a bead tile. Same SDF, so a handover is pixel-identical.
      for (let i = 29; i < NU; i++) cur[i] = 0;
      S.dropNearEdge = false;
      const Dr = S.drop, tiles = S.bead;
      let lay = null;
      if (Dr && LD.live(Dr) > 0) {
        const w0 = performance.now();
        lay = LD.layout(Dr, tx, ty, C.cssSize, C.edgeMargin, beadLayerMode, !!(tiles && tiles.ok), C.beadCssSize, P.poolJoinPx);
        if (lay.attached >= 0) {
          const d = Dr.slots[lay.att[0]]; nearEdge(d, tx, ty);
          cur[29] = (d.x - tx) * e; cur[30] = S.backingH - (d.y - ty) * e; cur[31] = Math.max(1e-3, d.r) * e; cur[32] = d.k * e;
          cur[33] = 1; cur[34] = d.ux; cur[35] = -d.uy; cur[36] = d.el; cur[38] = debug ? d.vx * 0.1 * e : 0; cur[39] = debug ? -d.vy * 0.1 * e : 0;
        }
        for (let j = 1; j < lay.nAtt; j++) { // rich goo: the secondary and micro necks
          const d = Dr.slots[lay.att[j]], o = 87 + 8 * (j - 1); nearEdge(d, tx, ty);
          cur[o] = (d.x - tx) * e; cur[o + 1] = S.backingH - (d.y - ty) * e; cur[o + 2] = Math.max(1e-3, d.r) * e; cur[o + 3] = d.k * e;
          cur[o + 4] = d.ux; cur[o + 5] = -d.uy; cur[o + 6] = d.el;
        }
        for (let k = 0; k < lay.nBody; k++) {
          const d = Dr.slots[lay.body[k]], o = 42 + 9 * k; nearEdge(d, tx, ty);
          cur[o] = (d.x - tx) * e; cur[o + 1] = S.backingH - (d.y - ty) * e; cur[o + 2] = Math.max(1e-3, d.r) * e; cur[o + 3] = d.alpha;
          cur[o + 4] = d.ux; cur[o + 5] = -d.uy; cur[o + 6] = d.el; cur[o + 7] = debug ? d.vx * 0.1 * e : 0; cur[o + 8] = debug ? -d.vy * 0.1 * e : 0;
          cur[103 + k] = d.kc * e;
        }
        if (tiles) {
          const aa = RND.aaWidth * Math.min(1, tiles.eff / dpr), plain = S.mask === "plain" ? 1 : 0, blend = S.mask === "plain" ? "normal" : "difference";
          for (let t = 0; t < LD.MAX; t++) if (lay.used[t]) tiles.drawTile(t, lay.cx[t], lay.cy[t], Dr.slots, lay, dpr, aa, plain, debug, blend);
        }
        S.dropDrawMs += (performance.now() - w0 - S.dropDrawMs) * 0.05;
      } else if (Dr) Dr.layer = "none";
      if (Dr && Dr.tp !== 0) { cur[108] = Dr.tp; cur[109] = Dr.tsg; } // the rich-goo taper (0 otherwise: the approved body)
      if (Dr && Dr.tailOut.on) { // the connected goo tail, wake or spine (always this canvas: it is one surface with the body)
        const W = Dr.tailOut;
        for (let i = 0; i < 5; i++) { cur[110 + 3 * i] = (W.x[i] - tx) * e; cur[111 + 3 * i] = S.backingH - (W.y[i] - ty) * e; cur[112 + 3 * i] = Math.max(0, W.r[i]) * e; }
        cur[125] = W.k * e;
      }
      if (tiles) tiles.endFrame(lay);
      let same = !sizeDirty;
      for (let i = 0; same && i < NU; i++) if (cur[i] !== prev[i]) same = false;
      if (same) return;
      prev.set(cur);

      gl.useProgram(prog); gl.bindVertexArray(vao);
      if (sizeDirty) {
        sizeDirty = false;
        gl.viewport(0, 0, S.backingW, S.backingH);
        gl.uniform2f(U.uSize, S.backingW, S.backingH);
        gl.uniform1f(U.uAA, RND.aaWidth * Math.min(1, e / dpr)); // above maxDpr the browser upscales: keep the ramp ~1 device px
        gl.uniform1f(U.uPlainAlpha, RND.plainAlpha); gl.uniform3f(U.uPlainColor, RND.plainColor[0], RND.plainColor[1], RND.plainColor[2]);
      }
      gl.uniform2f(U.uCenter, cur[0], cur[1]); gl.uniform2f(U.uAxis, cur[2], cur[3]); gl.uniform1f(U.uStretch, cur[4]); gl.uniform1f(U.uCompress, cur[22]);
      gl.uniform1f(U.uRadius, cur[5]); gl.uniform1f(U.uNoiseAmp, cur[6]); gl.uniform1f(U.uModel, cur[23]);
      gl.uniform1f(U.uNoiseK, cur[7]); gl.uniform1f(U.uPhase, cur[8]); gl.uniform3f(U.uHarm, cur[26], cur[27], cur[28]);
      gl.uniform1f(U.uCell, cur[24]); gl.uniform1f(U.uNoiseT, cur[25]);
      gl.uniform1f(U.uAlpha, cur[9]); gl.uniform1f(U.uRing, cur[10]); gl.uniform1f(U.uDebug, cur[11]);
      gl.uniform1f(U.uRingR, (P.radius - RND.hoverRingInset) * e); gl.uniform1f(U.uRingW, RND.hoverRingWidth * e);
      gl.uniform2f(U.uRaw, cur[12], cur[13]); gl.uniform2f(U.uVelRaw, cur[14], cur[15]); gl.uniform2f(U.uVelSmooth, cur[16], cur[17]);
      gl.uniform1f(U.uPlain, cur[18]);
      dropU[0] = cur[29]; dropU[1] = cur[30]; dropU[2] = cur[31]; dropU[3] = cur[32]; dropShapeU[0] = cur[34]; dropShapeU[1] = cur[35]; dropShapeU[2] = cur[36];
      for (let j = 1; j < 3; j++) { const o = 87 + 8 * (j - 1); for (let c = 0; c < 4; c++) dropU[4 * j + c] = cur[o + c]; for (let c = 0; c < 3; c++) dropShapeU[3 * j + c] = cur[o + 4 + c]; }
      gl.uniform4fv(U.uDrop, dropU); gl.uniform3fv(U.uDropShape, dropShapeU); gl.uniform4f(U.uDropDbg, 0, 0, cur[38], cur[39]);
      gl.uniform2f(U.uTaper, cur[108], cur[109]);
      for (let i = 0; i < 5; i++) { wakeU[4 * i] = cur[110 + 3 * i]; wakeU[4 * i + 1] = cur[111 + 3 * i]; wakeU[4 * i + 2] = cur[112 + 3 * i]; wakeU[4 * i + 3] = 0; }
      gl.uniform4fv(U.uWake, wakeU); gl.uniform1f(U.uWakeK, cur[125]);
      for (let k = 0; k < 5; k++) {
        const o = 42 + 9 * k;
        beadU[4 * k] = cur[o]; beadU[4 * k + 1] = cur[o + 1]; beadU[4 * k + 2] = cur[o + 2]; beadU[4 * k + 3] = cur[o + 3];
        beadShapeU[3 * k] = cur[o + 4]; beadShapeU[3 * k + 1] = cur[o + 5]; beadShapeU[3 * k + 2] = cur[o + 6]; beadVelU[2 * k] = cur[o + 7]; beadVelU[2 * k + 1] = cur[o + 8];
      }
      for (let k = 0; k < 5; k++) beadKU[k] = cur[103 + k];
      gl.uniform4fv(U.uBead, beadU); gl.uniform3fv(U.uBeadShape, beadShapeU); gl.uniform2fv(U.uBeadVel, beadVelU); gl.uniform1fv(U.uBeadK, beadKU);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      S.draws++;
    }

    function nearEdge(d, tx, ty) { // debug readout: a droplet drawn here comes within edgeMargin of this canvas's edge
      const lx = d.x - tx, ly = d.y - ty;
      if (Math.min(lx, ly, C.cssSize - lx, C.cssSize - ly) - d.r * (1 + Math.abs(d.el)) - d.k < C.edgeMargin) S.dropNearEdge = true;
    }
    function applyMask() { cs.mixBlendMode = S.mask === "plain" ? "normal" : "difference"; prev.fill(NaN); }

    // ------------------------------------------------------------------ boot
    initGL(); sizeBacking(); watchDpr(); applyMask(); evaluate(); ensureBead();

    return {
      state: S,
      canvas,
      params: P,
      setMode(m) { S.mode = m; ensureBead(); dropReset("mode switch"); evaluate(); prev.fill(NaN); },
      // Phase 3 lab controls: Mode C's Droplets switch, and one real droplet event on demand (lab-only)
      setDroplets(on) { S.dropletsDebug = !!on; ensureBead(); dropReset("droplets switched"); prev.fill(NaN); },
      dropletsOn() { return dropsOn(); },
      triggerDroplet(opts) { if (!dropsOn() || !S.visible) return false; fillDropBody(); const ok = LD.trigger(S.drop, P, dropBody, opts || {}); prev.fill(NaN); return ok; },
      // Phase 4 lab controls: clear every droplet now (no cooldown), natural emissions on/off, the droplet random seed
      clearDroplets() { dropReset("cleared"); if (S.drop) S.drop.cooldown = 0; prev.fill(NaN); },
      setNatural(on) { S.dropNatural = !!on; dropDisarm(); },
      setDropSeed(n) { if (!S.drop) return; const v = (+n >>> 0) || 0x2f6b1d3; S.drop.seed0 = v; S.drop.seed = v; },
      setMask(m) { S.mask = m === "plain" ? "plain" : "difference"; applyMask(); },
      setEnabled(on) { S.userEnabled = !!on; evaluate(); },
      setHideNative(on) { S.hideNative = !!on; evaluate(); },
      // live tuning: only known names; numbers must be finite, flags are booleans, the membrane model is a known name
      setParams(values) {
        for (const k in values) {
          if (!(k in PARAMS)) continue;
          const v = values[k];
          if (typeof P[k] === "boolean") P[k] = !!v;
          else if (k === "membrane") { if (v === "field" || v === "harmonic") P[k] = v; }
          else if (Number.isFinite(+v)) P[k] = +v;
        }
        B.idle = 0; prev.fill(NaN); dropReset("tuning changed");
      },
      resetParams(overrides) { this.setParams(paramsFromConfig(CFG, overrides)); },
      // lab instrumentation for deterministic captures: freeze integration, then step it by exact amounts
      setFrozen(on) { S.frozen = !!on; if (!on) lastTs = 0; }, // resuming integrates nothing for the first frame: no catch-up jump
      advance(ms, stepMs = 1000 / 120) { let left = ms; while (left > 1e-6) { const h = Math.min(stepMs, left); integrate(h / 1000); left -= h; } prev.fill(NaN); if (S.visible) draw(); },
      // one synthetic mouse sample at a chosen timestamp (ms), so scripted trajectories are identical for every preset
      feed(x, y, t) { S.pointerType = "mouse"; S.buttons = 0; S.inside = true; sample(x, y, t); S.samples++; classify(document.elementFromPoint(x, y)); },
      resetBody() { // round, still, membrane clock at zero; no droplet, no cooldown, the droplet random sequence restarted
        Object.assign(B, createBodyState()); dropReset("body reset");
        if (S.drop) { const D = S.drop; D.cooldown = 0; D.seed = D.seed0; D.body.px = NaN; D.lastEmit = D.satLast = -1e9; D.peakLive = D.liveSum = D.liveFrames = 0;
          D.lastPrimary = D.lastPiece = -1e9; D.peakSignal = 0; D.wakeTh = 1; D.liveHist.fill(0); } // Phase 4.5 rich goo bookkeeping
        prev.fill(NaN);
      },
      // lab diagnostics only: isolate harmonic-model terms, e.g. { harmonicGains: [0, 1, 0] } keeps only k + 2
      // ...and { beadLayer: "body" | "bead" } forces which canvas draws a free bead (to prove the handover is pixel-identical)
      setDiagnostic(d) {
        const g = d && d.harmonicGains; for (let i = 0; i < 3; i++) harm[i] = g && Number.isFinite(+g[i]) ? +g[i] : 1;
        beadLayerMode = d && (d.beadLayer === "body" || d.beadLayer === "bead") ? d.beadLayer : "auto";
        prev.fill(NaN); if (S.visible) draw();
      },
      readUniforms() { // debug only (allocates): the values currently bound in the program
        if (!gl || !prog) return null;
        const out = {};
        UNIFORMS.forEach((n) => { const v = gl.getUniform(prog, U[n]); out[n] = v && v.length !== undefined ? Array.from(v) : v; });
        for (const n of ["uDrop[1]", "uDrop[2]"]) { const l = gl.getUniformLocation(prog, n); out[n.replace(/\W/g, "")] = l ? Array.from(gl.getUniform(prog, l)) : null; } // further necks (rich goo)
        return out;
      },
      benchDraw(n = 200) { // debug only: GPU-inclusive cost of one frame's draws (ms), n forced draws then a finish
        if (!gl || gl.isContextLost()) return NaN;
        gl.finish(); if (S.bead) S.bead.finish(); const t0 = performance.now();
        for (let i = 0; i < n; i++) { prev.fill(NaN); if (S.bead) S.bead.invalidate(); draw(); } // both canvases when a bead is out
        gl.finish(); if (S.bead) S.bead.finish(); return (performance.now() - t0) / n;
      },
      readBeadMask() { return S.bead && S.bead.visible ? S.bead.readMask() : null; }, // debug only
      readMask() { // debug only (allocates): draw now and read the mask back, RGBA with the bottom row first
        if (!gl || gl.isContextLost()) return null;
        prev.fill(NaN); draw();
        const w = S.backingW, h = S.backingH, px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return { w, h, px };
      },
    };
  }

  window.LiquidCursor = { create, PARAMS, paramsFromConfig, createBodyState, stepBody };
})();
