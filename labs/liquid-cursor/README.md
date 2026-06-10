# Liquid cursor lab

The development lab for the Helios Observatory cursor: a Santioni-style, velocity-responsive inversion lens that can later shed small, short-lived liquid droplets. The design intent lives in the project brief (`LIQUID_CURSOR_PROJECT_CONTEXT.md`, kept outside the repository). This folder holds the lab only.

> **Phase 4.5: the reference goo, in Mode B and Mode C.** The approved preset ships in the Observatory.
> Mode A is the approved primary body alone. Mode B adds the liquid.
> - Fast motion turns the body into one asymmetric liquid form, after the author's reference image: a heavy leading bulb, a neck narrowing back along the path it came by, a small terminal knob. Body and tail are one surface.
> - Aggressive motion leaves 3-6 beads of falling sizes along that path; when the pointer brakes the knob pinches off, and the tail catches up and merges.
> - Rest, slow motion, smooth medium sweeps and ordinary navigation stay the approved body (at most a short teardrop on the fastest pointing moves); no always-on trail.
> - History is kept whole: *Connected goo · previous (rejected)* (`?pool=connectedBalanced`), *Rich goo droplets (previous attempt)* (`?pool=richBalanced`), *Phase 4 · current balanced* (`?pool=balanced`, bit-identical to `0c75065`) and *Phase 3 approved · one droplet* (`?pool=single`, bit-identical to `d64ec76`).

| | |
|---|---|
| Branch | Developed on `lab/liquid-cursor` from `9b8d547`, then integrated into the Observatory and merged into `master`. |
| Phase | **4.5: reference goo** (a curved metaball spine), visually approved by the author on 2026-10-03 ("Reference goo · balanced looks good to me") as the final cursor behaviour of the lab. The Phase 4 pool (`0c75065`) was judged too conservative, the first Phase 4.5 attempt "the same cursor with more droplets", and the second (the connected goo wake) visually wrong (an oval, a lollipop). Earlier approved phases: Phase 1 (plumbing), Phase 2 (*Santioni refined*) and Phase 3 (the single droplet with the revised neck, `d64ec76`). |
| Production | Shipped in the Observatory as `assets/observatory/liquid-cursor.js` (see *Production integration*). The Observatory never loads anything from this folder. |
| Evidence | Development captures, logs and measurement files under `evidence/` are kept out of the published repository. Paths below that start with `evidence/` refer to that local archive; the tools listed under *Verification* regenerate them. |

## Launch

The lab uses plain HTML, CSS and classic scripts with inline GLSL. It has no npm, modules, fetch, CDN or web fonts. The one image is referenced in place: `../../assets/showcase/gallery/reflective-hero.png`.

- **file://**: open `labs/liquid-cursor/index.html` directly in Edge or Chrome.
- **localhost**: run `python scripts/observatory/serve.py --no-browser`, then open `http://127.0.0.1:8315/labs/liquid-cursor/`.
- **URL overrides**:
  - `?mode=A|B|C`, `?mask=difference|plain`, `?cursor=off`
  - `?preset=phase1Disc|phase2Original|santioniRefined|current|tooSoft|tooViscous`
  - `?preset=santioniClean` (the Phase 2 name) still opens the Phase 2 original
  - `?droplet=balanced|balancedOriginal|shortNeck|longNeck` picks the Phase 3 droplet snapshot (`balancedOriginal` is the first-version balanced neck, for comparison)
  - `?pool=refBalanced|refSparse|refHeavy|refBoundary` picks a reference goo snapshot (`refBalanced` is the default); `?pool=connectedBalanced` is the rejected connected goo (`connectedSparse|connectedHeavy|connectedBoundary` its variants); `?pool=richBalanced` is the droplet-centric first Phase 4.5 attempt (`richSparse|richHeavy|aecyncBoundary` its variants), `balanced` the Phase 4 default, `single` the approved Phase 3 droplet, and `sparse|rich|busy` the other Phase 4 snapshots. `?cap=3|4|5` overrides the capacity, and `?seed=N` sets the droplet random seed

## Comparing by feel

- **Compare** (header), or **keys 1, 2 and 3** from anywhere except a select or text field, so the other hand can keep moving the mouse:
  1. **Phase 1 disc**: the approved diagnostic baseline.
  2. **Phase 2 original**: the rejected body, kept value for value. `tools/verify-original.mjs` shows it is bit-identical to commit `2fff2cc`.
  3. **Santioni refined**: the corrected body and the new default.
- **All presets** (the select next to it) also offers Current tuning and two failure references: Too soft (jelly) and Too viscous (honey). The references are defined relative to the defaults, so they now start from the refined body.
- **Keys 4-9 and 0** (Mode B and C) switch the pool comparison the same way: 4 Phase 4 current balanced, 5 rich goo droplets, 6 connected goo (previous, rejected), 7 reference sparse, 8 **reference balanced (default)**, 9 reference heavy, 0 reference boundary. Phase 3 single and the other variants are under *History* in the pool menu.
- **Tuning** (bottom-left, collapsed) has 97 live controls (24 for the body, 17 for the droplet unit, 7 for the Phase 4 pool, 16 for rich goo, 12 for the connected goo, 21 for the reference goo):
  - main body: radius, follow response, max stretch, compression exponent, stretch speed and curve, velocity smoothing, stretch and recovery response, deform damping, axis response
  - surface: membrane model, noise at rest and moving, noise curve, field feature size, harmonic k, noise speed, noise kept when still
  - interaction: hover scale, hover noise and deform multipliers, click compression, release damping
  - droplet (Modes B and C): see *Phase 3* below
  - Moving any control switches to *Current tuning*, which is remembered per browser in `localStorage`. *Copy values* exports the full set.
- These are lab-only development aids, not production features.

## Modes

- **A · Baseline**: the primary body.
- **B · Hybrid**: the same body plus the liquid (the Phase 4.5 reference goo by default). It shows a banner and the droplet strip with these controls:
  - manual sheds (*Shed* / D, *Strong* flick, *Extreme* flick, *Goo burst* / G, *Heavy burst* / H) and *Clear*
  - launch direction and speed
  - the droplet snapshot, the pool snapshot and the capacity
- **C · Debug**: the same body plus overlays and a readout.
  - Shader overlays: canvas bounds, raw-pointer crosshair, raw velocity (dotted) and smoothed velocity (solid) at 0.1 s length, the dashed motion axis, the minor axis, and the noise-free ellipse outline.
  - The readout adds raw and smoothed velocity and speed, deformation and target, stretch and compression (with the area product), the compression and membrane models, axis angle, recovery state, hover scale and progress, click scale, radius, noise amplitude and membrane life, presence, preset, and the frame callback cost.
  - Phase 3 (top of the readout, with a trigger-signal sparkline): droplets on/off and snapshot, droplet state, cause and drawing canvas, trigger signal against its firing level of 1, velocity swing, acceleration peak, jerk peak and speed each against its threshold, direction change, arming time, cooldown left, attachment direction, neck state (connected, width, union radius, surface gap), bead position, velocity, radius, opacity (and r0), age and life left, the bead canvas position and backing size, a near-edge warning, event and blocked-frame counts, and the droplet step cost. The shader adds the bead centre, a dotted attachment ray, the dashed union radius and the bead velocity (x 0.1 s).
  - A **Droplets** switch in the droplet strip turns the droplet system on and off in Mode C only.

A lab-only **Mask** switch (Difference / Plain diagnostic) remains from Phase 1.

## Production integration (branch `feat/observatory-liquid-cursor`)

The approved *Reference goo · balanced* now runs in the real Helios Observatory as `assets/observatory/liquid-cursor.js`. It is one self-contained classic script, loaded after `app.js`. The lab stays the canonical visual reference, the tuning archive and the regression oracle, and is unchanged at runtime.

**What was transplanted.** The production file holds only the code paths the approved preset uses, with the lab's arithmetic verbatim:
- the primary body (`stepBody`);
- the motion history the goo reads (the acceleration estimate and the arming time of the lab's trigger);
- the spine (`stepSpine`, `shedSpine`, `pathAt`);
- the free-bead flight, life, coalescence and tail catch;
- the bead layout and bead tiles;
- the body shader, restricted to the field membrane, the tail chain and the free beads.

The lab's historical snapshots, the Phase 3/4 bud-and-neck unit, rich goo, the connected wake, the harmonic membrane, tuning, presets, debug drawing, comparison keys and manual controls are not shipped.

**How the values were transferred.** They were machine-dumped from `paramsFromConfig(CFG, poolPresets.refBalanced.values)`: 85 values plus the 6 `follow` timings, 91 in all. No visual parameter changed. `tools/verify-production.mjs` proves the equivalence:
- **Values:** all 91 compared and equal.
- **Dynamics:** the production core and the lab's own scripts, run side by side in Node, give bit-identical state on every frame (`===`) for body, motion history, spine, tail, beads and bead layout. That holds over **113 runs and 54,375 frames** at 60, 120, 144 and 165 Hz:
  - the five evidence gestures;
  - ordinary and fast navigation, sweeps and 12 seeded scribbles;
  - hover, press and hidden segments mid-gesture.

  Mutating one constant (0.7 → 0.71, or 24 → 24.001 ms) breaks it.
- **Pixels:** the lab page and the real Observatory (`?cursor=test`, with a neutral hit-test overlay), driven through identical frame-exact trajectories at DPR 1 and 2, gave identical engine states and **byte-identical** body-canvas masks and bead tiles.

**Integration behaviour** (production-only engine refinements that do not change what is drawn):
- **Native cursor:**
  - It stays until the liquid cursor runs and the pointer has moved, and returns at once whenever the cursor stops.
  - Ignored regions keep the page's own cursor, and an ignored element without one gets the native default. This uses a zero-specificity reset, because `cursor` inherits.
- **Interaction map (Observatory selectors in the script):**
  - **Hover growth:** links, buttons, disclosures, tabs, checkboxes, chart bars, clickable rows and the navigation rail.
  - **Native cursor, no goo:** the convergence view and its wipe handle, the Workload tile canvas, the Scheduler timeline and scrubber, selects, form fields, code blocks and copy paths.
- **Sanitised motion history:**
  - It is disarmed on press, release, cancel, resize, DPR change, a hidden tab, a stall and every route change (`hashchange`).
  - Scrolling re-hit-tests under the still pointer and never makes velocity, because positions are viewport coordinates.
- **The loop sleeps** once nothing can change (no motion, the membrane still, no goo, nothing drawn for 30 frames). It wakes on the next input, scroll, resize or route change, and polls `devicePixelRatio` when awake.
- **Off, with the native cursor kept:**
  - `?cursor=off` (the kill switch), or recording mode (`?mode=recording`, unless `&cursor=on`);
  - no fine pointer, reduced motion or forced colours;
  - no WebGL2, a shader failure, a lost context (it resumes on restoration), or any runtime error, which tears everything down.
- **z-index 100**, just above the Observatory's ladder (top: the skip link, 99). No keyboard handling at all.

**Tests:**
- `tools/check-observatory.mjs`: the **36** integration checks in the real Observatory over localhost and file://. They cover the kill switch, every mode, fallback and interaction listed above, navigation, the Guided Tour, scrolling, resize and DPR, a hidden tab, the goo itself, performance and the console. `--evidence` writes the QA captures.
- `tools/verify-production.mjs`: the equivalence above.
- `scripts/observatory/test_liquid_cursor.py`: the static contract (10 tests), run with the Observatory's own tests (now 35).
- `tools/measure-scroll.mjs` (opt-in, opens an off-screen headed Edge window): the scroll frame rate with and without the cursor.

**Measured in the real Observatory:**
- **Idle:** the loop sleeps, with 0 cursor frames and 0 draws, and the page keeps about 121 fps.
- **Pointer motion and strong flicks:** 121 fps with the cursor (121 fps without it), and a frame callback of 0.25-0.28 ms of CPU.
- **Fullest goo:** the forced draw with a tail and beads in tiles is 0.05 ms (a `gl.finish`-bounded wall clock, not a GPU timer).

**Known limitation: wheel scrolling.** Wheel-scrolling under the cursor costs compositor time, because blending a layer with `mix-blend-mode: difference` over content that moves is expensive in Chromium. It costs the same with a plain blended white `div`, so it belongs to the approved inversion, not to this code. Headed Edge on this machine (`tools/measure-scroll.mjs`, `evidence/integration/scroll-performance.json`) gave these medians:

| Page | Cursor off | Cursor on |
|---|---|---|
| Performance | 120 fps | 68 fps |
| Stress & Limits | 121 fps | 108 fps |
| Technical Q&A | 119 fps | 80 fps |

A still page holds about 122 fps either way. The behaviour is unchanged because the visual is approved. A possible mitigation, which needs the author's decision: hide the liquid while the page wheel-scrolls under a still pointer, showing the native cursor during the scroll.

**Evidence:** `evidence/integration/`, separate from the Observatory's official screenshots:
- `00-sections-goo.png` and the full frames `01`-`08`: the goo over each section;
- `09-surfaces-and-states.png`: dark, paper, render and chart surfaces, hover, a precision control and the Guided Tour;
- `10-temporal-strip.png` and `10-temporal.gif`;
- `11-guided-tour.png`;
- `check-results.json`, `production-equivalence.json` and `scroll-performance.json`.

## Phase 4.5: reference goo (the default)

**Why.** Three rounds of feedback on the live cursor:
1. Phase 4 (`0c75065`) was *too conservative*: "it's basically still one droplet".
2. The first Phase 4.5 attempt, *Rich goo droplets*, was "the same cursor, but with more droplets".
3. The second, the *connected goo wake* (a tail bolted onto the elliptical body on rare trigger events), was "visually wrong": an oval, a lollipop on a stick, too subtle.

The author then provided the reference image itself (a lime goo cursor on a dark dotted ground): a heavy rounded mass, a neck narrowing along a curved path, a small terminal knob, an irregular silhouette, and beads of many sizes along the old path. The form is about 3.0× as long as it is wide; the author asked for 70-85% of that length. **The redesign makes the goo a different shape of the same liquid, driven by motion, rather than an event added to an ellipse.**

**What was structurally wrong before.** The wake was event-driven (the Phase 3 trigger: abrupt swings only, a cooldown between tails), so most fast motion showed the plain ellipse. Its tail was a uniform thin strand with a ball at the end, hanging off the ellipse's rear, so it read as a lollipop or a skinny tadpole. And its points were thrown with momentum rather than laid along the path, so the tail never followed the curve the cursor had drawn.

**The spine.**
- **Motion energy** `E` (0-1) comes from the body's rendered speed: zero below 1500 px/s, full at 3200, plus up to 35% for a sharp acceleration. It rises with a 45 ms time constant and decays with 120 ms. Hovering, pressing and hidden states give no energy. A stop is noticed after 20 ms of slow motion; the tail then catches up within about 40 ms more (a reversal passes through slow too briefly to lose its whip).
- **Trajectory history:** a ring of the last 64 body positions (0.39 s at 165 Hz, 0.53 s at 120 Hz, 1.07 s at 60 Hz; only its last 0.1-0.2 s of path is ever used).
- **Five nodes**, drawn as the existing round-cone chain smooth-unioned into the body (`uWake[5]`, `uWakeK`; 0 = the approved body, pixel-identical):
  - 0, a **bulb** node 0.2 R ahead of the centre, radius 0.9 R (31 px): the heavy leading mass.
  - 1, the **root**, 1.1 R behind on the path, radius 0.85 R (29 px): the rear of the teardrop.
  - 2 and 3, the **neck**: 30% and 64% of the tail length further back. Its first point is 55% of the way from the neck radius back to the root's (20 px), its second 0.42 R × 0.88-1 (12-14 px, thinning a little as it stretches): the "====---__--" profile.
  - 4, the **terminal knob**, 0.46 R (16 px), at the full tail length. It loses material when it sheds and regrows in about 90 ms.
- **Placement:** nodes 1-4 are sprung (34 rad/s, damping 0.7, each deeper point up to 45% softer) towards places on the history at those path distances behind the body. The springs are damped against each target's own velocity along the path, so steady motion leaves no lag: the tail is as long as the path says. Through a turn the deeper points keep going the old way for a moment, and the tail bends and whips. No segment is flung past 1.4× its share of the path, and every point stays inside the body canvas.
- **Tail length** = `spine.length` (70 px) × E. It grows with a 30 ms time constant and retracts with 90 ms (36 ms once stopped).
- **Irregular silhouette:** the neck and the knob drift up to 0.12 R (×1.3 at the knob) to seeded, slowly varying sides of the path, and the neck radii wobble ±9% (two incommensurate sines). The result is one flank bulging and a bent tip, never periodic lobes.
- **Beads:**
  - A drawn-out knob (tail > 65% of its length) under aggressive motion (E > 0.6) accumulates stress at 28 per second × (E − 0.6) / 0.4 × (1 + 0.6 × acceleration). At a seeded threshold (0.5-1.2) it sheds a bead: the first about 6.6 px, then each about 0.74× the last, down to 2.2 px.
  - Each bead keeps 15% of the knob's velocity plus a 40-140 px/s sideways kick, so it is left where the liquid was.
  - On a hard brake (energy under 60% of a burst peak above 0.75), the knob pinches off as one larger blob (up to 7.5 px).
  - At most 5 beads per burst (4 from stress, the last one kept for the pinch), within the goo budget (6, refilling every 160 ms) and the capacity (5).
  - Beads grow in over 45 ms, fly with the rich-goo heavy flight and coalescence, live 1.05× the goo life for their size, and rejoin the body or the tail when they touch it.
- **Manual controls** (*Shed* D, *Strong*, *Extreme*, *Goo burst* G, *Heavy burst* H) throw a still body into goo along a straight path. A held energy of 0.6, 0.72 or 1.0 lasts 190 ms, then a stop. The bursts queue further throws.
- **Gating:** no energy while hovering a control, pressing, over an ignored region or hidden, nor for the trigger's 180 ms arming time after any of them. The body catching up after a drag or a re-entry is not a flick. The goo starts at energy 0.05 and ends below 0.02, with no flicker at the onset.

**What you see** (Reference goo · balanced; the lab's own scripts at 60, 120, 144 and 165 Hz; `tools/check-spine.mjs`):

| Motion | Form (length / width; the reference 3.0) | Tail along the path | Beads | Visible / gone after the stop |
|---|---|---|---|---|
| Rest, slow, smooth medium sweep (1400 px/s) | the approved body | — | — | — |
| Ordinary navigation (minimum-jerk moves of 150-750 px) | at most a short teardrop, on 3 of 14 moves | ≤ 31 px | none | — |
| Smooth fast sweep, 2600 px/s | a teardrop with a tail | 50 px | 1 | — |
| Repeated fast navigation (18 quick moves up to 4400 px/s in 9 s) | goo on 14-15 of the moves | 64 px | 24-25 in all | — |
| Straight flick, 3200 px/s | 2.16-2.43× (72-81%) | 64-65 px | 3-4: 6.6 / 4.8 / (3.3) / pinch 7.5 | 250-271 / 215-218 ms |
| Curved flick (an arch), 3200 px/s | 2.46-2.65× (82-88%) | 68 px | 4-5 along the curve | 300-327 / 215-218 ms |
| 90° turn, 2800 px/s | 2.34-2.54×, bent 72-77° | 55-56 px | 3 | 326-342 / 201-217 ms |
| Reversal, 2800 px/s | 2.14-2.23× | 49-51 px | 1-2 | 367-383 / 200-201 ms |
| Extreme whip, 4600 → 4200 px/s | 2.50-2.55× (83-85%) | 61-62 px | 4: 6.6 / pinch 7.5 / 3.6 / 2.4 | 358-367 / 217-233 ms |

Turns and reversals at 2000-2200 px/s give only a mild teardrop (energy 0.15-0.35). Relentless violent scribbling (24 seeded 4 s scribbles at 120 Hz): 4.2 beads per second; the time with 0 / 1 / 2 / 3 / 4 / 5 / 6 pieces of material (the tail counts once) is 20 / 28 / 12 / 8 / 9 / 14 / 9 %, never more than the capacity plus the tail.

**Presets** (keys 7, 8, 9 and 0):

| Snapshot | Tail length | Bulb | Neck | Beads | Onset |
|---|---|---|---|---|---|
| Reference goo · sparse | 62 px | 0.84 R | 0.42 R | splash rate 14, up to 5.5 px | 1900 px/s |
| **Reference goo · balanced (default)** | **70 px** | **0.9 R** | **0.42 R** | **rate 28, up to 6.8 px** | **1500 px/s** |
| Reference goo · heavy | 100 px | 0.95 R | 0.44 R | rate 38, up to 7.5 px | 1300 px/s |
| Reference boundary · longer and denser | 130 px | 1.0 R | 0.45 R | rate 60 from energy 0.25, up to 8.5 px, budget 10 | 1200 px/s |

**Lab controls.** *Tuning* has a *Reference goo* group:
- the tail: length, node count, stiffness, trajectory lag, onset speed
- the radii: root, bulb, neck, taper (gradual-abrupt), terminal knob, irregularity, smooth-union strength
- timing: hold, retract
- the beads: break threshold, splash rate, splash count, splash radius min / max, splash life, splash momentum

The coalescence strength is the *Coalescence distance* control in the *Rich goo* group (`gooJoin`). Mode C adds a *Reference goo* row: energy and its burst peak, the tail length against its limit, the five radii, beads shed, stress against its threshold, history samples and material.

**Evidence** (`evidence/phase4-reference/`, written by `tools/ref-goo-evidence.mjs --evidence --ref <image>`):
- `00-reference-vs-previous-vs-candidate.png`: A the reference, B the rejected connected goo, C the candidate, for each gesture at its fullest form and 83 ms later
- `01`-`05`: tail-following strips of the five gestures, plus slow and real-time GIFs of the straight flick, the arch and the whip
- `06`: rest, navigation and a medium sweep
- `07`: the four reference presets and the rejected goo at the same moments
- `08`: the fullest forms at DPR 2
- `ref-goo-evidence.json`

### The second Phase 4.5 attempt: the connected goo wake (kept as `?pool=connectedBalanced`)

Kept whole, every value spelled out (`wake` group; key 6), because the author judged it.
- A trigger swing (the Phase 3 trigger, never speed alone) pulled the rear into a 5-point tail of damped springs: the root on the body surface, a strand of 3 points, a heavy bulb.
- It went PULL → NECK → pinch (the bulb free, 0-3 splash beads) → snap back, or MERGE if the body caught it.
- Tail 70-120 px; strand 6.5 px tapering 1.9× → 0.86×; bulb 11.5 px.
- **Verdict (the author, with the reference image):** "visually wrong": the elongated ellipse stayed, with a thin uniform strand and a ball at its end (a lollipop, a skinny-stick tadpole), and too rarely. Hence the spine above.
- Its checks (`tools/check-wake.mjs`) still run, pinned to its snapshot.

### The first Phase 4.5 attempt: rich goo droplets (kept as `?pool=richBalanced`)

The first answer to "too conservative" kept the discrete droplet model and made it richer. It is kept whole, every value spelled out, because the author judged it and because its machinery (the free-piece flight, budget and cohesion) still serves the connected goo.
- **Hierarchy:** one trigger event breaks into a PRIMARY (the approved Phase 3 unit, a little larger, union × 1.15), a SECONDARY right beside it at the tail (a double drip; 30-70 ms later once the event's peak swing reaches 1.15 × the threshold; 3.5-6 px; a 76 ms neck), a MICRO from the primary's own spot once it has pinched (swing ≥ 1.5×; 2.5-4 px; a 40 ms pull) and tail-stress WAKE micros while a strongly stretched body keeps swinging. Several necks at once (at most 3), each bridging only to the body (`uDrop[3]`).
- **Budget:** 4 pieces per burst, refilling every 320 ms; capacity 4; a 320 ms recovery after the pool empties; a blocked swing is watched while it lasts.
- **Heavier flight:** 0.6 × the Phase 3 momentum and carry, 0.55 × the snap kick, early cohesion drag, size-dependent drag; young pieces close together are briefly smooth-unioned (`uBeadK`), pieces that meet coalesce, a free piece that touches an attached bud rejoins.
- **Rear taper:** the body's rear lengthens by up to 8% while a primary is pulled out (`uTaper`), then recoils; 0 at all other times.
- **Measured:** strong flick, turn and reversal 2 pieces, extreme flick 3, extreme whip 4, sweeps and navigation 0; relentless scribbling 24.5 / 15.3 / 33.4 / 18.3 / 8.6 % of the time with 0 / 1 / 2 / 3 / 4 pieces (Phase 4: 57 / 28 / 13.3 / 1.4 / 0). Bud placement was moved to the tail after its first captures showed three necks fanned around the body like legs (the lobed look rejected in Phase 2).
- **Verdict (the author):** "basically the same cursor but with more droplets"; not enough goo. Hence the connected wake above.

## Phase 4: controlled droplet pool

**Goal.** One cohesive liquid cursor that *sometimes* sheds a couple of tiny pieces of itself when it is really whipped around. It must never become a particle emitter, a trail, a spray or a follower chain. The approved body and the approved Phase 3 droplet are protected baselines.

**What changed from Phase 3.**

| | Phase 3 (approved, `d64ec76`) | Phase 4 default |
|---|---|---|
| Live droplets | 1 | up to 3 (capacity), usually 0 or 1 |
| A violent flick, turn or reversal | one droplet | the same one droplet, identical frame for frame |
| A further violent swing while a bead is alive | ignored until it has gone and 700 ms have passed | may shed a smaller follow-up (stronger swing needed, spaced, at most one per burst) |
| An extreme event (velocity swing ≥ 1.7× the threshold) | one droplet | that droplet, then one smaller residual satellite 73-83 ms later |
| Attached necks | 1 | 1 (never two) |
| Free-bead canvases | one 64 px WebGL2 canvas | five 64 px tiles shown as needed, one shared WebGL2 context |

**Architecture.**
- The body still knows nothing about droplets.
- `droplet.js` holds a fixed pool of 5 slots, allocated once and reset in place, with no per-event objects. `poolMax` (1-5) is the live capacity.
- Each slot runs the approved Phase 3 event unchanged: trigger direction, bud, neck, thread, pinch, release, flight, shrink, fade and body absorption. The pool only decides when another unit may start.
- **Capacity 1 is the approved Phase 3 droplet, decision for decision.** Its gating keeps the Phase 3 rule: the trigger runs only while no droplet is alive and the 700 ms cooldown is over.
- **Slot state:** the Phase 3 fields plus:
  - event id and kind (primary / follow / satellite / manual) and birth time
  - peak swing and frame stamps
  - time scale and energy (a satellite's faster lifecycle and smaller carry)
  - render surface and tile
  - absorption and merge state
- **Debug readout:** the focus slot `D.d` (the latest event) is what the Phase 3 readouts and checks read.
- **Reuse:** a slot is reused only once its droplet has completely faded, and never in the same frame. A full pool **suppresses** a new emission; it never recycles, overwrites or moves a live bead.

**Emission budget** (above the trigger; the trigger still decides "violent enough to shed"):
1. **One neck at a time.** No event starts while any slot is budding, necking or detaching.
2. **The first event of a burst** is the Phase 3 event. It needs an empty pool and the Phase 3 cooldown (700 ms after the pool last emptied).
3. **A follow-up** (another swing while beads are alive) needs all of these:
   - a stronger swing: trigger signal ≥ 1 + 0.12 × live beads
   - spacing since the last emission: ≥ 260 ms × (1 + 0.6 × (live − 1))
   - room in the burst: 2 natural events per burst
   - its bead is smaller: radius × 0.82 per live bead, never under 3 px
4. **A burst ends when the pool empties.** Then the Phase 3 cooldown runs before the next burst.
5. **Each swing is decided once.** A zigzag keeps the trigger signal above 1 across reversals, so a direction change of more than 60° counts as a new swing. A blocked swing is counted as suppressed (full, neck, cooldown, burst, spacing or strength) and never queued.
6. **Arming.** Unlike Phase 3, the trigger keeps its armed history while beads are alive. The sanitising (first sample, unseen jumps, re-entry, buttons, resize, DPR, visibility, stalls, ignored regions, hover, press, touch) is unchanged.

**Residual satellite** (same-gesture secondary, deliberately rare):
- **Eligible when** the event's peak velocity swing reaches 1.7× the swing threshold, satellites are on, none in the last 1.5 s, and a slot is free.
  - Violent gestures peak at 1.2-1.4; extreme ones at 1.95-2.1 at 60-165 Hz alike.
  - The min-of-gates signal was rejected for this: at 60 Hz a one-frame ramp under-reads acceleration (1.46 against 2.0).
- **When:** once the primary's bead is free, a smaller bud pinches off the same spot, 0.6-1 × 18° to one side (seeded side and amount). Its pinch comes 73-83 ms after the primary's.
- **Size and lifecycle:**
  - 0.5 × the primary's radius, within 2.5-4.5 px
  - the same unit at 0.55× the time
  - 0.75× the life
  - 0.55× the abandoned momentum
- **Full snap kick:** it still gets the full snap kick (its smaller neck retracts at least as fast). This keeps it from clinging to a body that has stopped.
- `?pool=sparse` turns satellites off for comparison.

**Variation (seeded, deterministic).** The same gesture, seed and frame rate give the same droplets. The seed varies only small things:
- direction jitter (Phase 3's ±16°)
- the satellite's side and angle
- the release side-kick

Sizes follow the gesture (strength) and the pool state (follow-ups smaller), not randomness.

**Coalescence.** Two free beads that overlap (centre distance < 0.85 × r1 + r2) merge deterministically:
- The smaller one (or, if equal, the younger) flows into the other within 70 ms: it shrinks, fades and closes on the other's centre.
- The survivor gains the area smoothly, at most +25% in radius, and the pair keeps the area-weighted momentum.
- No bouncing.
- The body catching a bead coalesces exactly as in Phase 3.

**Active-count policy** (measured over 40 seeded, relentless 4-second random violent scribbles at 120 Hz; ordinary browsing sheds nothing):

| Snapshot | Events/s | Time with 0 / 1 / 2 / 3 / 4+ live | Runs peaking at 2 / 3 / 4 / 5 |
|---|---|---|---|
| Phase 3 approved (single) | 0.74 | 68 / 32 / 0 / 0 / 0% | 0 / 0 / 0 / 0 |
| Pool · sparse (no satellites) | 1.21 | 57 / 33 / 9.7 / 0 / 0% | 39 / 0 / 0 / 0 |
| **Pool · balanced (default)** | **1.52** | **57 / 28 / 13.3 / 1.4 / 0%** | **18 / 22 / 0 / 0** |
| Pool · rich (capacity 4, 3 per burst) | 1.73 | 52 / 31 / 15.9 / 1.7 / 0% | 16 / 24 / 0 / 0 |
| Pool · busy diagnostic (capacity 5) | 3.98 | 41 / 13 / 18.7 / 19.7 / 7.5% | 0 / 1 / 21 / 18 |

- **Policy:** 0 live is normal; 1 is the approved event; 2 happens in exceptional gestures; 3 is uncommon (1.4% of the time even in this relentless test). The busy snapshot shows the failure boundary.
- **Capacity:** 3, 4 and 5 behaved **identically** with 2 events per burst, because the budget, not the capacity, binds. So the default is the most restrained, 3.
- **The hard cap is checked** at 3, 4 and 5 with busy gates and a 9-shed manual flood: never exceeded, nothing recycled.

**Default gestures** (the same at 60, 120, 144 and 165 Hz):

| Gesture | Default pool |
|---|---|
| Stationary, slow, smooth sweeps (2600 and 4000 px/s) | nothing |
| Violent flick, sharp turn, fast reversal | one primary (4.5-5.4 px), identical to Phase 3 |
| Extreme flick (0 → 5200 px/s in 16 ms), extreme turn (3600 px/s) | a primary (5.6-7.0 px), then one satellite (2.8-3.5 px) 73-83 ms later |
| Straight zigzag (reversals every 108 ms) | 3 events in 3 s, never two at once: the body sweeps back over its own beads and coalesces them |
| Back-and-forth scribble (170 ms legs, 3000 px/s) | 6 events in 3 s (2 primaries, 2 follow-ups, 2 satellites), peak 3 |

**Canvas strategy** (measured before choosing):

| Option | Creation (4 beads) | Script per frame (4 beads redrawn) | Contexts | Verdict |
|---|---|---|---|---|
| One WebGL2 canvas per bead | 31-42 ms | 0.28-0.46 ms | one per bead | creation hitch, many contexts |
| **One offscreen WebGL2 + `bitmaprenderer` tiles** | **12 ms** | **0.54-0.71 ms** | **1 (as in Phase 3)** | **chosen**: pixel-identical to direct WebGL (0 px differ at DPR 1-3) |
| CSS ellipses | ~1 ms | 0.14-0.23 ms | 0 | antialiasing differs from the shader (handover not exact) |
| One full-screen canvas | — | — | 1 | rejected: 7.9 MiB at DPR 1 and 71 MiB at DPR 3 (1920 × 1080) for a few 6 px beads |

- **What draws what:** the body canvas still draws the attached bud and neck and any free bead well inside it, now up to 5 free beads (a uniform array in the same shader). The idle body is pixel-identical to `5f6033d`.
- **Tiles:** a free bead that drifts out goes to a 64 × 64 CSS px tile placed around it. Each tile is a plain DOM canvas with a `bitmaprenderer` context, fed by one shared `OffscreenCanvas` WebGL2 context (a detached canvas and 2D copies where OffscreenCanvas WebGL2 is missing).
- **One surface per touching group:** beads closer than 8 px edge to edge always share one surface. So overlapping beads are one union and never invert twice. A two-bead group drawn by the body canvas or a tile gives identical pixels.
- **Tile lifecycle:** a tile keeps its group's tile across frames and gives its bitmap back when hidden.
- **Memory:**
  - **tiles:** 16 / 64 / 144 KiB per shown tile at DPR 1 / 2 / 3, plus the same once for the shared drawing buffer.
  - **default worst case** (3 beads in 3 tiles): 64 / 256 / 576 KiB; all 5 tiles: 96 / 384 / 864 KiB.
  - **Phase 3**, for comparison: 16 / 64 / 144 KiB plus its own WebGL2 context. Phase 4 has the same number of WebGL contexts (two: body and shared bead renderer).
  - **body canvas** (unchanged): 0.7 / 2.7 / 6.1 MiB.

**Lab controls** (Mode B and C; the manual controls drive the real lifecycle within the pool's limits, bypassing only the trigger and the cooldown):
- **Sheds:** *Shed one droplet* (key D), *Strong* (larger, faster) and *Extreme* (eligible for a satellite).
- **Clear** ends every droplet now.
- **Pool snapshot** and **Capacity** (snapshot / 3 / 4 / 5).
- **Mode C** adds *Natural emissions* on/off.
- **URL:** `?seed=N` sets the seed.

**Debug readout** (Mode C, refreshed on a timer, never per frame):
- **Pool:** snapshot, capacity, live (attached, free).
- **Burst budget**, the **follow-up gate** (the signal and spacing the next follow-up needs), and the **satellite gate**.
- **Suppressed**, by reason.
- **Active count:** peak, mean, merges and the seed.
- **One row per slot:** id, kind, state and state time, age and life, position, speed, radius, opacity, cause, surface and tile.
- **Bead tiles:** visible count, backing and renderer mode.
- The droplet step and **droplet draw** costs.
- **Shader marks:** the body shader marks each free bead's centre and velocity. Slot numbers are not drawn on screen (they are in the readout).

**Performance** (headless Edge 154, integrated GPU; `gl.finish`-bounded wall clock for draws, not GPU timer queries):

| Live beads | Frame CPU (integrate + draw) | Forced draw (body + tiles) | Tiles |
|---|---|---|---|
| 0 | 0.039 ms | 0.008 ms | 0 |
| 1 (near the body) | 0.038 ms | 0.009 ms | 0 |
| 2 | 0.047 ms | 0.047 ms | 1 |
| 3 | 0.027 ms | 0.017 ms | 2 |
| 5 (busy) | 0.111 ms | 0.308 ms | 4 |

- **In real time** (manual sheds every 170 ms keeping 2.5 beads alive on average), measured back to back with the same page idle:

  | | Frame rate | Worst frame | Frame callback | Droplet step | Droplet draw |
  |---|---|---|---|---|---|
  | Idle | 120.7 fps | 9.1 ms | — | — | — |
  | With beads | 120.5 fps | 9.0 ms | 0.44 ms | 0.14 ms | 0.03 ms |

  - The callback, step and draw figures are EMAs, which include `performance.now()` granularity.
  - The in-page microbenchmark gives the droplet step as about 1.7 µs per frame.
- **At rest after the pool empties:** 0 draws per second on the body canvas and on every tile. As in Phases 1-3, the requestAnimationFrame loop itself keeps running while the cursor is active.
- **On a heavily loaded machine** (other browsers busy), every mode dropped alike: Mode A with no droplets measured 69 fps with a 150 ms hitch. The pool showed no extra cost.

**Evidence** (`evidence/phase4/`; captured from the composited page, never mock-ups):

| File | Shows |
|---|---|
| `01-single-equivalence.png` | Phase 3 approved vs the default pool, the same flick, DPR 2: 0 differing pixels in all 108 frames |
| `02`-`05` | violent flick, extreme flick (with its satellite), sharp turn, reversal |
| `03b-extreme-flick-satellite-dpr2.png` | the satellite pinching off, frame by frame, DPR 2 |
| `06-compound-scribble.png`, `-slow.gif`, `-realtime.gif` | the W scribble (one primary, one smaller follow-up) |
| `06b-back-and-forth-scribble.png` | a back-and-forth scribble (the body sweeps over its own beads) |
| `07-pool-two-active.png`, `08-pool-three-active.png` | 2 live beads (natural, 890 px apart, DPR 2) and 3 live (manual, DPR 2) |
| `09-capacity-diagnostic-busy.png`, `09-busy-diagnostic-realtime.gif` | the busy failure boundary |
| `10-pool-full-suppression.png` | five sheds into capacity 3: extra sheds refused, nothing recycled |
| `11-body-catches-bead.png`, `12-bead-bead-coalescence.png` | body absorption; two beads merging |
| `13-window-edge.png` | beads at the window edge |
| `14-inversion-paper.png`, `15-inversion-dark.png` | inversion over paper text and the dark panel (DPR 2) |
| `16-mode-c-diagnostics.png` | the Mode C readout with 2 live beads |
| `17-smooth-sweep-no-droplet.png` | a smooth fast sweep: nothing |
| `18-hover-suppression.png` | the same violent jitter sheds 1 over the paper and 0 over the real button |
| `38-comparison-gestures.png` | Phase 3 approved · default with a strong flick · default with an extreme flick |
| `38-comparison-scribble.png` | the same W scribble through single, sparse, balanced, rich and busy |
| `pool-evidence.json`, `body-equivalence.json`, `check-results.json` | the measurements and the checker's record |

## Phase 3 revision: a visible neck ("neck too fast")

**Why.** The author tried the first Phase 3 version (`4f71aee`) by hand and found the neck too fast. That was the only requested change, so this revision touches the attached neck only: not the bud, the trigger, the bead's size, flight, life or fade, and not the approved body.

**Diagnosis: both the duration and the curve.**
- The attached phase was 26 + 42 + 14 = 82 ms, and the bridge was connected for only 68 of it (about 4 frames at 60 Hz).
- The narrowing curve stopped at a surface gap of 0.43 × the union radius, which is still about 4 px wide (round body). The snap then removed it, so a thin thread never really existed. Measured at rest (1 ms steps, DPR 3): under 6 px for 8 ms, never under 4 px.
- In a flick the neck was thinner, but only by luck. The approved body's membrane (up to 0.7 px at speed) slides under the bud as the body races along, as large as the thread's whole margin. The neck fell 6.7 → 4.0 → 2.3 px in two frames, then **re-widened to 3.3 px on the release frame**. The collapsing union bridged the bead again because the release frame carries the bead about 2 px towards the body.

**Timing** (revised balanced, now the default):

| | First version (`4f71aee`) | Revised balanced |
|---|---|---|
| BUDDING | 26 ms | 26 ms (unchanged) |
| NECKING: narrowing | 42 ms | 60 ms |
| NECKING: thin thread | none | 24 ms |
| DETACHING (union collapse after the pinch) | 14 ms | 14 ms (unchanged) |
| Attached (states, nominal) | 82 ms | 124 ms |
| Connected (bud start to pinch, nominal) | 68 ms | 110 ms |
| Measured, 120 Hz flick (frame-quantised) | 83 ms attached | 125 ms attached, 117 ms connected |

**Revised neck curve (neck model 2).**
1. **Narrowing** (60 ms): the same curve as before, only longer. The union radius tightens from 1.5 to 1.2 × r while the gap eases out (`pinchCurve` 2) to 0.43 × the union radius, so the width falls about linearly.
2. **Thin thread** (24 ms, new): the gap creeps on from 0.43 to `threadGap` 0.485 × the union radius (the bridge breaks at 0.5). Width goes about as the root of the remaining margin, so the thread thins ever faster into the pinch. The bead rides the body and is not pulled, so nothing stretches (no taffy).
3. **The gap is measured from the drawn membrane.** `droplet.js` carries an exact port of the shader's field noise (pcg3d hash, quintic gradient noise, soft limit, and the first-order ellipse factor). It matches the rendered outline to 0.04 px (0.77 px if the noise were ignored), so the thread is the same at rest and at 3200 px/s. It reads the body and never writes to it.
4. **Decisive pinch.** After release the collapsing union is held under 1.5 × the live surface gap, so the bead can never re-bridge: the release frame already shows two pieces.

`neckModel` 1 is the first version. The comparison snapshots use it and are **bit-identical to `4f71aee`** (48 pure-dynamics runs: flick, turn, reversal and manual, at 60/120/144/165 Hz). That includes their original release-frame re-widening.

**Measured thin-neck visibility** (rendered mask, narrowest connected cross-section, CSS px):

| | First version | Revised balanced |
|---|---|---|
| Flick, 120 Hz frames, DPR 2/3 | 10 → 9 → 6.7 → 4.0 → 2.3 → *3.3 (re-bridge)* → apart | 10.8 → 10 → 9.5 → 7.8 → 6.0 → 5.0 → 4.5 → 4.0 → 3.5 → 3.0 → apart |
| Flick: under 8 / 6 / 4 px | 33 / 25 / 17 ms | 50-58 / 42 / 17 ms (25 ms at DPR 1) |
| At rest, 1 ms steps, DPR 3: under 8 / 6 / 4 px | 14 / 8 / 0 ms | 42 / 31 / 8 ms |
| Thinnest connected neck | 4.0 px at rest; 2.3 px in the flick (by chance) | 2.7-3.0 px |
| Release frame | still bridged (and wider) | two pieces |
| Narrowing | monotonic until the re-bridge | monotonic, no widening (largest rise 0) |
| Position, radius, opacity at the pinch | continuous | continuous (checked frame by frame) |

**What did not change**, checked by simulation at 60/120/144/165 Hz (old vs revised balanced, same input):
- **Trigger:** the same firing frames, causes, bead radii (r0) and attachment directions. Smooth sweeps still shed nothing.
- **Bead:** the same life after release (500 ms at 120 Hz), the same shrink and fade.
- **Release and flight:** the same momentum, carry, snap kick and drag values.
- **Bead travel:** flick 30.3 → 31.4 px, sharp turn 91.6 → 91.0 px, reversal 42.9 → 42.0 px.
- **The bud:** still 26 ms.
- **Visible time:** grows only by the longer attachment, 575 → 617 ms.
- **One consequence of releasing later, not a tuning change:** in a flick that **stops dead** (117 ms), the release now comes after the body has mostly stopped. That bead inherits less forward velocity, so it hangs near where it pinched (about 30 px/s, 4 px of drift) instead of being flung back (about 220 px/s, 30 px).

**Cost** (headless Edge, in-page microbenchmark):
- the droplet step is about 1.1 µs per frame in the first version and about 1.7 µs revised (the membrane lookup is 0.46 µs)
- per whole event, about 85 → 140 µs
- forced draws, fps and the zero-draws-at-rest result are unchanged (see the checker's performance lines)

**Evidence** (`evidence/phase3/droplet/`, regenerated with the revised default):
- `neck-stages.png`: the eight stages of one natural flick, from body to detached bead
- `neck-compare.png`: the same flick, frame by frame, with short neck, first-version balanced, revised balanced and long neck
- `neck-balanced-slow.gif` (about 7× slower)
- the measured widths: `droplet-evidence.json` → `neck`
- the strips, GIFs and stills of the six scenarios

## Phase 3: single-droplet experiment

**Architecture.** Two cooperating systems, as the brief requires.

- **The primary body** (`liquid-cursor.js`, unchanged in behaviour) owns position, shape, deformation, surface, hover, click and inversion.
- **The droplet system** (`droplet.js`) owns the trigger, the lifecycle, the free bead's physics and its small canvas. Each frame it *reads* the body's rendered centre, radius, stretch, compression and axis, and the pointer velocity; it never writes to them. With droplets off (Mode A), no droplet code runs at all.
- Verified: `tools/verify-original.mjs` shows the Santioni refined body with the droplet idle is pixel-identical to `5f6033d` in five shader states, with identical dynamics except a < 0.02 px difference in the resting membrane's fade (the one change to the body this phase; see *Known issues*). The Phase 2 original is still bit-identical to `2fff2cc`.
- One event at a time: the lifecycle is a single state object (`D.d`). Phase 4 turns it into a small pool; the shader already takes the droplet as its own uniform block, and the bead layer is a self-contained object.

**State machine** (explicit, time-driven, deterministic: a seeded PRNG supplies the direction jitter). State changes carry the leftover time, so 60-165 Hz agree.

| State | What happens | Balanced timing |
|---|---|---|
| `IDLE` | The trigger runs; it fires only when armed, allowed and past the cooldown | cooldown 700 ms after a droplet |
| `BUDDING` | A bud grows out of the perimeter from 50% to 100% of its radius, smooth-unioned into the body | 26 ms |
| `NECKING` | The union radius tightens while the surface gap eases out towards just under the bridge-breaking gap: the bridge narrows steadily to a thin neck, and the bead elongates along it. Then the thin thread thins on into the pinch (revision) | 60 + 24 ms (first version: 42) |
| `DETACHING` | The bead is released; the union radius collapses from the release frame: the bridge snaps and both fillets retract | 14 ms |
| `FREE` | Screen-space flight with exponential drag; it starts to shrink | until 45% of its life |
| `FADING` | It keeps shrinking and fades out, then returns to `IDLE` | the rest of its life |

Measured (flick, 120 Hz), revised: bud 33 + neck 83 + detach 8 = **125 ms attached** (first version 83 ms), then **500 ms** of free life (unchanged), **617 ms** visible in all (575). Mask measurements show one connected piece while budding, then a neck narrowing 11 → 10 → 9 → 7 → 6 → 5 → 4 → 3 → 3 → 3 device px (DPR 1) while still connected, and two separate pieces from the release frame on.

**Trigger model.** A droplet needs abrupt motion; speed alone never fires one. Four gates must all be open at once, for a 12 ms debounce:

| Gate | Balanced value | Why |
|---|---|---|
| Speed | ≥ 900 px/s | stops, tremor and slow moves never fire |
| Velocity swing | ≥ 1500 px/s against a 90 ms lagged reference velocity, braking removed | a stop is not a flick; turns count 1.3× sideways |
| Acceleration peak | ≥ 40,000 px/s², held 90 ms | a coarse gate |
| Jerk peak | ≥ 1.8 M px/s³, held 90 ms | the real separator between flicks and ordinary quick movement |

Past a 30° direction change (full at 90°) the acceleration and jerk gates are 1.3× easier (`turnGain`, the direction-change sensitivity). Acceleration and jerk are derived only when a new velocity arrives (irregular sample intervals and frames without a sample never read as spikes) and smoothed over 12 ms.

Measured on scripted 120 Hz trajectories (signal ≥ 1 fires):

| Motion | Peak signal | Droplet |
|---|---|---|
| Stationary, slow (300 px/s), hand tremor (±2 px) | 0.00-0.09 | none |
| Smooth sweeps at 2600 and 4000 px/s, a sweep ending in a dead stop | 0.26-0.29 | none |
| Human pointing moves (minimum-jerk, 300-1200 px) | 0.34 | none |
| A very quick pointing move (400 px in 180 ms) | 0.80 | none |
| Gentle 90° curve, 1500 px/s orbit | 0.48 | none |
| Violent flick (0 → 3200 px/s in 25 ms) | 1.25 | one, "acceleration" |
| Sharp turn at 2200 px/s | 1.29 | one, "turn" |
| Fast reversal at 2000 px/s (instant, and within 80 ms) | 1.39 / 1.25 | one, "reversal" |

The same decisions hold at 60, 120, 144 and 165 Hz (pure dynamics simulation). Before settling on the jerk gate, a survey showed that the filtered acceleration of a violent flick (53k px/s²) is no higher than a quick pointing move (52k); only jerk separates them (1.21 vs 0.65 of an earlier 2.2 M threshold, which then proved too tight at 60 Hz).

**Sanitising and false positives.** The trigger's history is forgotten ("disarmed"), and must then stay clean for 180 ms before anything can fire, after any of these:

- the first pointer sample
- a sample after a tracking gap if the pointer moved more than 48 px unseen (a mouse that merely rested stays armed, so a flick from rest still counts)
- the body reappearing (page entry, leaving an ignored region, after touch or a captured drag)
- pointer down and up
- resize and DPR changes
- tab visibility changes
- a stalled frame (dt clamped)

Mode and preset switches and tuning changes end any droplet at once. Hovering a real interactive target, pressing, touch input, a hidden body and reduced-motion debug-static mode all block triggering.

**Policy for an existing droplet:**
- Hover or click: it simply completes (it is pointer-events: none and away from the control).
- The body hiding (ignored region, leaving the window, touch, cursor switched off): it ends at once, so nothing liquid lingers where the native cursor is back.
- A hidden tab: it pauses in place and resumes without a jump.

**Attachment geometry.** The bud sits on the body's noise-free ellipse, in the direction the bead will separate towards. That is the predicted bead velocity relative to the body at release: `(momentum − 1) × v + carry × abandoned`, where `abandoned` is the part of the lagged reference velocity the body gave up. This puts the bud on the trailing side for a flick (whose `abandoned` is zero), the outside of a sharp turn, and the old leading side for a reversal. It is jittered ±16° (seeded), so it is never the same angle twice.

**Neck and separation.** The bud is a second SDF source smooth-unioned into the body with a polynomial smooth minimum. That bridges two surfaces only while their gap is under half the union radius, with a smooth hourglass neck.

- The union radius starts at 1.5 × the bead radius and tightens to 1.2 ×.
- The gap eases out towards 0.43 × the union radius: `gap = gc − (gc0 − g0) × (1 − u)^2`. The neck therefore narrows about linearly.
- Revision (neck model 2): a thin-thread stage then takes the gap on to 0.485 × the union radius over 24 ms. The gap is measured from the drawn membrane, and the union cannot re-bridge after release (see *Phase 3 revision*).
- On release the union radius collapses over `detachMs`, so the bridge snaps on the release frame itself. Nothing thick is ever deleted, and position, size and opacity are continuous (checked frame by frame).
- A free bead uses a hard union (no bridge at any distance), so the body passing close by cannot re-attach it.
- If the body runs *into* a free bead (a flick and a dead stop, or doubling back), the bead coalesces: it shrinks and fades into the body within 70 ms instead of passing through.

**Free-bead physics.** At release the bead gets `0.12 × body velocity + 0.5 × abandoned momentum + 150 px/s along the neck` (the snapping neck), at least 90 px/s away from the body, plus a small seeded sideways variation. Then:
- exact exponential drag at 7/s (checked against e^(−7t) to 0.5%)
- a shape recoil spring (the bead's elongation from the neck, 0.3, relaxes at 55 rad/s, damping 0.35)
- its own screen position, independent of the pointer (checked: a still pointer and one moving away give the same trajectory)

A violent flick leaves a bead at about 200 px/s while the body races on at 3200 px/s, so it is left behind, as the brief sketches.

**Radius and opacity.**
- **Radius:** the bead is 6 px (CSS) for a threshold event, ±30% with the event's strength (4.2-7.8 px, always within 3-10). Over its life it holds full size for the first 20%, then eases to 35% of its radius (shrink curve 1.3).
- **Opacity:** it fades as `1 − u^1.6` over the last 55% of the life.
- **Life:** 560 ms for a 6 px bead, scaled by the square root of the radius (about 470-640 ms).
- At the end it is about 1.7 px in radius and under 1% opacity before it resets: too small and faint to notice.

**Canvas bounds.** A free bead stays in screen space while the body can travel hundreds of pixels away, beyond the 420 px body canvas. I chose the least invasive of the options the brief lists:

- The body canvas is unchanged.
- It draws the attached bud and neck, and a free bead while the bead is inside it.
- A second, small **bead canvas** (64 × 64 CSS px, created only when droplets are first switched on) takes over once the bead drifts within a margin of the body canvas edge, with a 16 px hysteresis.
- Both use the identical SDF and coverage code, so the handover is **pixel-identical**: 0 differing channel values at DPR 1, 2 and 3.
- Memory: 64² × 4 bytes = 16 KiB at DPR 1, 64 KiB at DPR 2, 144 KiB at DPR 3, plus one small WebGL2 context. It is resized only on DPR changes, never per frame.
- Rejected alternatives:
  - resizing or re-centring the body canvas: it cannot cover a bead 900 px away, and reallocating a WebGL canvas per frame is expensive
  - a full-screen canvas: the brief forbids it without a demonstrated need
  - rendering the free bead in its own canvas even next to the body: overlapping difference blends invert twice (a hole)
- A free bead drawn near the window edge maps exactly to its screen position (checked by pixel).

**Inversion.** The bud, neck and bead are the same white difference mask as the body: no new colour, outline, shadow or glow. It was verified by pixel over the paper panel, the dark panel and the render, with the bead canvas and the body canvas each drawing it.

**Lab controls.**
- **Droplet strip** (Modes B and C): *Shed one droplet* (or key **D** anywhere except in a field or select) runs the real lifecycle from the body now, with a launch direction (auto, or one of eight) and a launch speed (0-1200 px/s, default 420). It bypasses the trigger and the cooldown, never the one-at-a-time limit.
- **Snapshot** select and the **Droplets** switch (Mode C).
- **Tuning** gains a *Droplet* group with 17 controls: acceleration threshold, jerk threshold, velocity swing, turn sensitivity, minimum speed, cooldown, radius, bud, neck and thin-thread durations, neck / union strength, pinch decisiveness, momentum inheritance, drag, life, and the shrink and fade curves. Every value lives in `config.js` (`droplets`).

**Snapshots** (droplet tunables only; the body stays the approved Santioni refined body in all three):

| Snapshot | bud / neck / detach ms | union × r | pinch curve | pinch stretch | measured attached |
|---|---|---|---|---|---|
| Single droplet · balanced (default, revised) | 26 / 60 + 24 thread / 14 | 1.5 | 2.0 | 0.3 | 125 ms |
| Balanced · first version (`balancedOriginal`, neck model 1) | 26 / 42 / 14 | 1.5 | 2.0 | 0.3 | 83 ms |
| Short neck (decisive, neck model 1) | 20 / 26 / 10 | 1.25 | 2.8 | 0.3 | 58 ms |
| Long neck (viscous diagnostic, neck model 1) | 40 / 110 / 30 | 2.2 | 1.2 | 0.45 | 183 ms |

The three neck model 1 snapshots are bit-identical to `4f71aee`.

**All balanced droplet values** (`config.droplets`):

| Group | Values |
|---|---|
| Trigger gates | minSpeed 900 px/s · impulse (velocity swing) 1500 px/s · accel 40,000 px/s² · jerk 1.8 M px/s³ · turnGain 1.3 |
| Trigger filtering | referenceMs 90 · accelMs 12 · jerkMs 12 · peakHoldMs 90 · debounceMs 12 · armMs 180 · gapJumpPx 48 |
| Timing | cooldownMs 700 |
| Bud and neck | radius 6 · radiusSpread 0.3 · budMs 26 · neckMs 60 (was 42) · threadMs 24 (new) · threadGap 0.485 (new) · neckModel 2 (new) · detachMs 14 · union 1.5 · pinchCurve 2 · pinchStretch 0.3 |
| Release | momentum 0.12 · carry 0.5 · snapKick 150 px/s · spreadDeg 16 · minSeparation 90 px/s |
| Flight and fade | drag 7/s · lifeMs 560 · freeShare 0.45 · shrinkCurve 1.3 · fadeCurve 1.6 · endScale 0.35 · recoil 55 rad/s · absorbMs 70 |
| Canvas | beadCssSize 64 |

**Performance** (headless Edge, 120 Hz, integrated GPU):

| Case | Result |
|---|---|
| Frame rate | Mode A and Mode B both 120 fps, worst frame 8.8 / 8.7 ms |
| Frame callback (CPU, EMA) | 0.19 ms in Mode A, 0.20 ms in Mode B, of which the droplet step is 0.024 ms |
| Forced draw, no droplet | 0.007 ms |
| Forced draw, attached bud and neck | 0.011 ms |
| Forced draw, free bead in the body canvas | 0.005 ms |
| Forced draw, free bead in the bead canvas (both canvases) | 0.005 ms |
| Forced draw, fading | 0.003 ms |
| Repeated triggers under the cooldown (real-input zigzag) | 120 fps, 0.22 ms CPU, at most 1 body draw per frame |
| At rest once everything has gone | 0 draws/s on both canvases |

The forced-draw figures are `gl.finish`-bounded wall-clock averages over 300 forced draws, not GPU timer queries. There are no per-frame allocations, and no canvas resizes except on DPR changes. A hidden tab stops the loop.

## Phase 2 fidelity correction

**Diagnosis.** Measured on the real shader output (`tools/diagnose-silhouette.mjs`, `evidence/phase2-refine/diagnosis/`), the hexagonal impression came from the membrane, not from the deformation or the SDF.

1. **The periodic harmonics cause it.**
   - At rest the original outline carried fixed k = 4, 6 and 9 lobes of 0.28, 0.24 and 0.18 px (0.8%, 0.7% and 0.5% of the radius).
   - Human observers detect radial-frequency deformations of well under 1% of a circle's radius (Wilkinson, Wilson & Habak, 1998). These fixed low orders therefore read as a rounded square or hexagon: 8 to 9 curvature "corners" at up to 72% of the mean curvature.
   - Worse, the pattern never went away. Once the membrane stilled, the phase froze with the amplitude still at 0.7 px, so a resting cursor was a static lobed polygon.
   - Isolating each term with the lab's harmonic gains shows the k = 6 term alone reads as a hexagon, and the k = 9 term alone gives the sharpest corners.
2. **The phase animation reinforced it.**
   - Each harmonic's phase drifts at a fixed rate, so the lobes rotated around the body as a rigid pattern (about 0.2 rad/s at rest, up to 3.5 times that moving).
   - It read as a turning polygon, not an evolving surface.
3. **The deformation interaction made motion worse.**
   - The harmonics were evaluated at the *local-frame* angle and displaced in screen space after the stretch. Lobes therefore bunch at the tips and spread flat along the flanks: by stretch² ≈ 2 in theory, 1.8 measured for the isolated k = 9 term.
   - At 2.2 px (6.5% of the radius) this gave faceted, lumpy potatoes in motion: curvature ripple up to 4 times the mean curvature.
4. **Not the cause:**
   - **The SDF and antialiasing.** With the membrane off, the outline matches the ideal ellipse to 0.045 px, with a 1 device px edge on tips and flanks.
   - **Anisotropic deformation on its own.** With the membrane off, stretched shapes are clean ellipses.
   - **Velocity smoothing.** Real-input stretch jitter is at most 0.0042 per frame, with no axis jitter on steady sweeps.
   - The *exact* inverse compression did make the full-stretch body thin: aspect 1.96 with the minor axis at 71% of rest.

**Correction.** The refined body keeps the original's dynamics and changes only the silhouette.

- **Membrane (`surface.membrane = "field"`).**
  - A smooth 3D gradient noise field (x, y in screen space around the body centre, z is time; pcg3d lattice hash) replaces the harmonics.
  - It has no integer symmetry, keeps one feature size along the whole outline (stretched or not), and evolves in place instead of rotating.
  - It is soft-limited so the amplitude is a hard bound.
- **The resting membrane settles to a true circle.** `stillNoise` is 0, so once the membrane stills (about 2.9 s after a stop) the outline is within 0.043 px of a circle, the measurement floor.
- **Compression model** (`body.compressionExponent`): the across-axis scale is `stretch^−exponent`. The default is **0.75**. See *Compression model* below.

| Tunable | Phase 2 original | Santioni refined |
|---|---|---|
| Membrane model | 3 integer harmonics (k = 4, 6, 9), local-frame angle | screen-space gradient-noise field |
| Noise at rest | 0.7 px, kept forever | 0.25 px while alive, then 0 (`stillNoise` 1 → 0) |
| Noise at full stretch | 2.2 px | 0.7 px |
| Noise curve | 1.5 | 1.0 |
| Feature size | lowest harmonic k = 4 | 36 px (`noiseScale`) |
| Evolution | 0.9 rad/s of phase × (1 + 2.5 × deformation), rotating lobes | 0.3 cells/s × (1 + 2.0 × deformation), evolving in place |
| Across-axis scale | 1 / stretch (exponent 1) | stretch^−0.75 |
| Everything else | follow 60/s, max stretch 1.42, springs, axis, hover, click | unchanged |

**Membrane amplitude choice.** The brief suggested starting ranges of 0.2–0.4 px at rest, 0.5–0.9 px for ordinary motion and 1.0–1.4 px for aggressive motion. The field was tried at those ranges ("brief ranges" row of the diagnosis): it stays lumpy in motion, curvature ripple 1.28. At 0.9 px it starts to dent the near-flat flanks of the stretched lens. So the refined amplitudes are:

| State | Refined amplitude |
|---|---|
| Rest | 0.25 px |
| Ordinary motion (800 px/s) | 0.42 px |
| Full stretch | 0.68–0.70 px |

The liquid character comes from the deformation, not from wobble. Feature size: 20 px reads jagged, 48 px reads lopsided (bean-shaped), and 32–40 px reads as a cohesive lens.

**Compression model.** The three candidates, compared with the membrane off at the same full stretch (1.40):

| | Exponent 1 (1/s) | **Exponent 0.75** | Exponent 0.5 (1/√s) |
|---|---|---|---|
| Aspect | 1.96 | 1.80 | 1.66 |
| Minor axis | 71% of rest | 78% of rest | 85% of rest |
| Area | 1.00 × rest | 1.09 × rest | 1.18 × rest |
| Reads as | thin, pill-like, mechanically elliptical | a full lens | plump, visibly swells while moving |

Exponent 0.75 was chosen on the side-by-side captures, not assumed. **It is not area-preserving:** area grows by `stretch^0.25`, at most 9.2%, which is about 4.5% in apparent size. Exponent 1 remains one slider away, and the Phase 2 original preset uses it.

**Post-stop elongation (investigated, unchanged).**
- After a *short* flick (100 ms at 2500 px/s) the stretch keeps growing for about 50 ms after the stop: 1.26 → 1.39. Flicks of 200 ms or more show none, because the body is already saturated.
- The stop-recovery ablations in `diagnosis.json`:
  - The second velocity-smoothing stage is the main contributor. Without it the rise is +0.058 over 33 ms.
  - The 30 ms stale hold comes next. Without it, +0.098.
  - A critically damped spring barely helps (+0.126) and slows recovery to 225 ms.
- The dynamics are identical in both presets. Shortening them trades against shape jitter from uneven real mouse events, which headless tests cannot judge, so nothing was changed. The slider to try is *Velocity smoothing ms*.

## Body architecture

There is one body and one signed-distance field, and nothing follows behind it.

1. **Position.** Exponential following at the Phase 1 rate the author approved: `1 - exp(-60·dt)`. The cursor centre stays near the pointer, and the elasticity lives in the shape, not in positional lag.
2. **Velocity, in two stages.**
   - Raw: per-sample smoothing of coalesced pointer samples (24 ms). With no sample for 30 ms it decays at 50/s. A sample arriving after a gap longer than 120 ms (leaving the window, a touch, a captured drag) restarts velocity instead of producing a spike.
   - Shape velocity: the raw vector smoothed again (28 ms), as a vector, so its direction never wraps around ±π.
3. **Speed to deformation:** `amount = 1 − exp(−(speed / 1300)^1.6)`. This is about 0.01 at 100 px/s, 0.4 at 800 px/s and 0.63 at 1300 px/s, and saturates towards 1.
4. **Deformation spring.** A damped spring drives the body towards `amount`:
   - stiffness 38 rad/s while growing and 36 rad/s while relaxing, damping ratio 0.6
   - semi-implicit Euler in equal substeps of at most 1/240 s, so 60, 120, 144 and 165 Hz give the same motion
   - the damping gives a hard stop about a 1.6% squash past round before settling, not a bounce
5. **Axis.** The stretch axis is a line, not an arrow. It turns the short way towards the motion direction at 28/s, faded in between 40 and 300 px/s so slow jitter cannot rotate it.
6. **Hover and click.** Hover is a spring to 1.27× (32 rad/s, damping 0.7). Hover progress calms the deformation (×0.6) and the membrane (×0.45). Pointer-down eases to 0.9× (critically damped). Release rebounds once (damping 0.45, about 2% overshoot).
7. **Membrane** (refined: the field model).
   - Amplitude: `0.25 × alive + (0.7 − 0.25) × deformation` CSS px, calmed on hover. Here `alive` is the membrane life, which falls from 1 to 0 as the body stills.
   - The field evolves at 0.3 cells/s, faster with deformation. About 1.4 s after everything settles the membrane stills and fades out, so there is no idle pulsing and there are no idle redraws. Amplitudes below 1e-6 px snap to 0 so the spring's tail cannot keep a still body redrawing.
8. **Composition order** (documented in `liquid-cursor.js`):
   - `radius = body.radius × hover scale × click scale` (isotropic)
   - `stretch = 1 + (maxStretch − 1) × deformation × hover calming`, hard-capped at 1.42, floored at 0.92
   - `compression = stretch^−compressionExponent` (0.75; 1 would preserve area exactly)
   - local frame `(along / stretch, across / compression)`: the noise-free ellipse
   - the membrane subtracted from that ellipse distance in screen space, *after* the deformation, and only near the edge
   - a clamp that keeps the whole body inside the 420 px canvas at any tuning
9. **Reappearance.** When the body comes back (entering the page, leaving an ignored region, after a touch) it starts round and centred and fades in over about 45 ms.

All values live in `config.js`. The body group defaults *are* the Santioni refined preset; the `droplets` group holds the Phase 3 tunables.

## Canvas strategy

The body canvas is bounded and travels with the body: 420 × 420 CSS px, with the backing store at `min(devicePixelRatio, 3)`. At rest the body leaves 176 px of padding. At the tuning panel's extremes the body is clamped to fit. Phase 3 added a small bead canvas for a free droplet that has drifted out of it (see *Phase 3 · Canvas bounds*). Phase 4 replaced that with the bead tiles: up to five 64 px tiles fed by one shared WebGL2 context (see *Phase 4 · Canvas strategy*).

## Accessibility (unchanged from Phase 1)

The cursor is off, and the native cursor is kept, for:
- no fine pointer
- `prefers-reduced-motion: reduce` (animated cursor disabled)
- `forced-colors: active`
- no WebGL2

These react live to media changes. `[data-cursor-ignore]` regions keep their native cursors, and captured drags stay ignored. A touch suspends the body. All lab controls, including the compare switch, the preset select and the tuning controls, are keyboard operable with native focus rings.

## Verification

```
node labs/liquid-cursor/tools/check-lab.mjs                # temp output (the record is copied to evidence/phase4-reference/check-results.json)
node labs/liquid-cursor/tools/check-lab.mjs --evidence     # writes evidence/phase4-reference/ (results.json and body captures, which differ run to run: not committed)
node labs/liquid-cursor/tools/ref-goo-evidence.mjs --evidence --ref IMAGE   # Phase 4.5 reference goo: writes evidence/phase4-reference/ (--only name,name for some)
node labs/liquid-cursor/tools/verify-production.mjs [--evidence]  # the Observatory's production cursor vs Reference goo · balanced (state and pixels)
node labs/liquid-cursor/tools/check-observatory.mjs [--evidence]  # integration checks in the real Observatory; --evidence writes evidence/integration/
node labs/liquid-cursor/tools/goo-evidence.mjs --out DIR          # the rejected connected goo wake (its evidence is not committed)
node labs/liquid-cursor/tools/rich-evidence.mjs --out DIR         # the rich goo droplets (its evidence is not committed)
node labs/liquid-cursor/tools/pool-evidence.mjs --evidence        # Phase 4: writes evidence/phase4/ (--only name,name for some)
node labs/liquid-cursor/tools/droplet-evidence.mjs --evidence     # Phase 3 (capacity-1 snapshot): writes evidence/phase3/droplet/
node labs/liquid-cursor/tools/verify-original.mjs --evidence      # both bodies vs 2fff2cc and 5f6033d, Phase 3 vs d64ec76, Phase 4 vs 0c75065 (writes evidence/phase4-reference/)
node labs/liquid-cursor/tools/diagnose-silhouette.mjs --evidence  # the Phase 2 diagnosis (evidence/phase2-refine/diagnosis/)
```

`evidence/phase1/`, `evidence/phase2/`, `evidence/phase2-refine/` and `evidence/phase3/` are kept as history. `tools/pool-sim.mjs` runs the lab's own scripts in Node (no browser) at any frame rate. It drives the deterministic pool checks and the tuning measurements, and it also reads the pre-pool droplet of an older commit. GIF clips need Python with Pillow (they are skipped otherwise).

The tools need Node 22 or later and the local Edge install, and use the Observatory server for the http checks. `tools/cdp.mjs` holds the shared CDP and PNG helpers. `tools/silhouette.mjs` holds the page-side helpers:
- deterministic 120 Hz trajectories through the engine's lab-only `feed`, `resetBody`, `advance` and `setFrozen`
- mask measurement through `readMask`
- `benchDraw`, the forced-draw cost

The checker result is **346/346** on Edge 154 (`evidence/phase4-reference/check-results.json`): the 258 of Phase 4 plus 44 rich-goo checks (`tools/check-rich.mjs`), 25 connected-goo checks (`tools/check-wake.mjs`, pinned to its snapshot) and 19 reference-goo checks (`tools/check-spine.mjs`).

**Phase 4.5 changes to the existing checks:**
- `check-pool.mjs` opens the *Phase 4 · current balanced* snapshot (`?pool=balanced`); `check-lab.mjs` and `check-pool.mjs` expect the banner PHASE 4.5 — REFERENCE GOO.
- The default-page real-input safety check (in `check-rich.mjs`) counts goo bursts as well as pieces. It judges an ignored-region entry from inside the block; the ordinary approach may show a teardrop, never beads.

Phase 4's result was **258/258** (`evidence/phase4/check-results.json`): the 209 of Phase 3 plus 49 pool checks in `tools/check-pool.mjs`.

**Phase 4 changes to the existing checks:**
- `check-droplet.mjs` now opens the *Phase 3 approved* snapshot (`?pool=single`), so its 60 checks keep verifying the approved single droplet exactly. None was relaxed.
- One check in `check-lab.mjs` changed on purpose: the Mode B banner now reads PHASE 4.

**The 49 pool checks:**
- **pool (14):**
  - capacity 1 bit-identical to `d64ec76` (96 runs)
  - one event in the default pool identical to Phase 3
  - U/V/W capacity 3/4/5
  - budget and suppression
  - determinism
  - coalescence
  - the UI defaults and the capacity selector
  - the manual controls and Extreme
  - file://
  - console
- **pool dynamics (17), at 60/120/144/165 Hz:**
  - A-C: nothing
  - D/F/H: one primary each
  - E/G: one satellite each, plus the satellite's angle
  - I: zigzag and scribble
  - lifecycles complete
  - frame-rate consistency
  - no overwrite, no teleport, no pop, no NaN (164 runs)
  - the active-count policy, busy vs default, sizes
- **pool rendering (7):**
  - body canvas vs tiles, with exact inversion
  - overlap inverted once, in a tile and next to the body
  - window edges
  - a fading bead in a tile
  - a two-bead group handover is pixel-identical
  - one shared context
- **pool safety (8):**
  - hover and click
  - ignored region and captured drag
  - re-entry: real input (no burst) and frame-exact (nothing inside the arming window)
  - hidden tab with 2 beads
  - resize and DPR with 2 beads
  - console
  - reduced motion, touch and Mode A
- **pool performance (3):** 0-5 beads, real time vs idle, zero draws at rest.

**Load sensitivity.** On a heavily loaded machine (other browsers busy), 3-5 real-time or real-input checks failed in some runs. Some of those were Phase 1-3 checks on untouched behaviour; the untouched `d64ec76` baseline also failed 3 at this session's start. They passed on quiet reruns.

**Before Phase 4,** the checker result was **209/209**: the 206 of the first Phase 3 version plus 3 neck checks from the revision. The first version had 148 before Phase 3 (one adapted to the Phase 3 banner and made stricter), one regression check for the idle-draw race, and 57 droplet checks in `tools/check-droplet.mjs`.

The neck revision changed these checks on purpose:
- The attached-duration window is now 110-140 ms (was 50-120).
- The snapshot order is now short < first-version balanced (about 83 ms) < revised balanced < long.
- Three checks are new:
  - the bud is not slowed (26 ms)
  - the neck stays visible: under 6 px for at least 25 ms and under 4 px for at least a frame, and the thread is over within 34 ms
  - the pinch is decisive: thinnest on the last attached frame, with two pieces from the release frame on

No other check was weakened. On a loaded machine (Zoom and Chrome running), three real-time checks failed once on the untouched `4f71aee`: the sharp-turn axis rate, a real-input ignored-region case and the Mode A/B fps. They passed on an isolated rerun.


- **droplet (29):**
  - the brief's trajectories A-C (stationary, slow, smooth sweeps, a sweep that stops), human pointing moves, a very quick pointing move, a gentle curve and orbit, and hand tremor: no droplet
  - the sweep still gets full stretch
  - D-F: flick, sharp turn, two reversals: exactly one each, correctly classified
  - three below-the-gates cases
  - G: aggressive zigzag, never more than one, each waiting for the last to die plus the cooldown
  - H: stop after detachment
  - no second droplet while active
  - cooldown, the manual trigger, modes, preset switching mid-event, snapshots
  - the refined body values
  - 60/120/144/165 Hz decisions and timing
  - console
- **droplet lifecycle (15):**
  - the full state progression; attached and free durations; no positional jump
  - radius and opacity only decline; exact drag; left behind
  - measured on the mask: bud attached, neck narrowing then pinching, two pieces after
  - revision: the bud not slowed, thin-neck visibility, a decisive pinch
  - pointer independence; no NaN
- **droplet canvas (3):** pixel-identical handover at DPR 1 and 2; the bead visible and inverting while the body races 980 px away; the bead canvas created only when needed.
- **droplet safety (9):** a real-input positive control; hover and click; ignored regions and captured drags; window entry; tab suspension; resize and DPR change mid-flight; the window edge; touch; console.
- **droplet performance (4):** idle cost vs Mode A, every state's draw cost, repeated triggers, zero draws at rest.

Before Phase 3 the result was **148/148**:
- All 127 earlier checks are kept, apart from four:
  - Replaced: the two-way swap check became six preset checks: the three-way switch, keys 1/2/3, keys ignored in a select, the Phase 2 original holding all 32 2fff2cc tunables, the default preset, and the Phase 2 URL alias.
  - Updated to the new requirements:
    - compression now follows the selected exponent (exact area is checked separately on the original)
    - the membrane guide is now 0.2–0.4 px at rest and at most 1.4 px very fast
    - the Tab walk now requires the compare switch
- Added: 1 performance check (the GPU-inclusive draw cost), then 13 **silhouette** checks measured on the rendered mask at DPR 2:
  - rest outline within 0.3 px of a circle
  - no k ≥ 3 lobe above 0.5% of the radius, and curvature ripple of at most 0.4
  - a true circle once still
  - no pulsing or jitter at rest
  - no polygonal pattern in six motion states
  - outline within the membrane amplitude
  - diagonal orientation
  - no NaN
  - both compression models matched on aspect and area
  - crisp antialiasing
  - console
  - *metric sensitivity*: the same tests flag the Phase 2 original
- Added: 2 **compare** checks: the three-preset sheets at DPR 1 and 2, and console.

Measured results (headless Edge, 120 Hz; silhouette at DPR 2):

| Measure | Phase 2 original | Santioni refined |
|---|---|---|
| Rest outline | lobes k4/k6/k9 0.28/0.24/0.18 px, max 0.65 px, ripple 0.72 | max 0.29 px, largest k ≥ 3 0.10 px (0.3%), ripple 0.23 |
| Rest once still | frozen at 0.64 px | 0.043 px (true circle) |
| Fast move, 2600 px/s | stretch 1.40, aspect 2.00, max 1.86 px off the ellipse, ripple 4.1 | stretch 1.40, aspect 1.78, max 0.71 px, ripple 0.48 |
| Diagonal | lumpy, ripple 3.8 | orientation 45.6° (axis 45.0°), ripple 0.34 |
| Area at full stretch | exact (1.000) | 1.092 × rest (not area-preserving by choice) |
| Stop | within 2% of round after about 155 ms | same: 153 ms, 1.6% squash, one crossing of round |
| Hover / click | 1.27×, 95% in about 95 ms; 0.90× press, 1.019× rebound | same |
| Frame rate | same peak and recovery (150–167 ms) at 60, 120, 144 and 165 Hz | same |
| Cost | 0.2–0.4 ms CPU per frame (EMA), 120 fps, 0.004 ms per forced draw | 0.2 ms CPU, 120 fps, 0.009 ms per forced draw; 0 draws at rest once still |

Evidence in `evidence/phase2-refine/` (lab-only, default = Santioni refined):
- `compare-dpr1`, `compare-dpr2`: the three presets through identical trajectories. Columns: rest, 800 px/s, 2600 px/s horizontal, diagonal, sharp turn, and hover on the real button.
- `recovery-dpr1`, `recovery-dpr2`: the same stop, 0–250 ms, for each preset.
- `diagnosis/`: `diagnosis-dpr1`, `diagnosis-dpr2` (14 variants × 8 states, including each harmonic isolated and the membrane off), `strips-dpr2` (resting membrane over 3.6 s and a sustained orbit), and `diagnosis.json` (every measurement, the post-stop ablations and real-input jitter).
- `original-equivalence.json`: the Phase 2 original preset against 2fff2cc. Body dynamics over 6000 steps differ by exactly 0, and 7 shader states are pixel-identical.
- The default-body set: `rest`, `slow-move`, `fast-horizontal`, `fast-diagonal`, `stop-recovery`, `sharp-turn`, `sharp-turn-axis.svg`, `hover-button`, `click-state`, `paper`, `dark`, `image`, `phase1-original-refined`, `debug-mode`, `lab-1920x1080`, `results.json`.

## Known issues and observations

Phase 4.5 (reference goo, approved):

- **Fewer beads than the reference.** The reference shows about 15 beads, down to tiny specks; the balanced goo sheds 3-5 per strong gesture (capacity 5, at most 5 per burst). *Reference heavy* and *boundary* shed more.
- **A rounder front.** The leading bulb is the approved round body, so the front is wider than the reference's slender bottle.
- **Beads on a straight flick land roughly in a line** (they follow the path); on a curve they arc as in the reference.
- **Fast ordinary pointing** can show a short teardrop (at most about 31 px of tail, no beads) on its fastest moves. Rapid repeated fast navigation (moves up to 4400 px/s) sheds beads, 24-25 in 9 s.
- **Real-time checks under load** stay sensitive to machine load, as before.
- **Mode C toggles in Mode B.** The Mode C toggles show in Mode B: a pre-existing `label[hidden]` CSS issue, left alone to keep the layout.

Phase 4:

- **Visual approval pending.** These need a hand on a real mouse:
  - whether the default's follow-ups and satellites read as pieces of one liquid
  - whether 3 at once ever looks busy
  - whether *sparse* (no satellites) is preferable
- **Hand-tuned trigger.** Natural emission still depends on the Phase 3 trigger's hand-tuned sensitivity. Real-mouse reach for the extreme threshold (a 1.7× velocity swing) is unverified.
- **The satellite pinches at the body's trailing spot.** When the body has nearly stopped (an extreme flick that ends abruptly), it stays within about 15 px of the body while it fades. It is separate (hard union, never re-bridged) but close.
- **Extreme-turn travel varies.** It spans 96-132 px across 60-165 Hz. That spread comes from the approved Phase 3 unit itself (identical at capacity 1): an extreme turn's abandoned momentum is sampled on whichever frame the trigger fires. Decisions and timing do not vary.
- **Long bead chains can split surfaces.** A chain of three or more touching beads wider than a 64 px tile is split over separate tiles, and can then invert twice where they overlap. Coalescence merges touching beads within 70 ms, and no test produced such a chain.
- **Real-time checks under load.** The real-input and frame-rate checks (body and droplets alike) are sensitive to machine load. On a busy machine the same untouched code failed 3-5 of them; on a quiet one everything passed.
- **Slot numbers** are shown in the Mode C readout, not drawn next to the beads.

Phase 3:

- **Trigger sensitivity on a real mouse is unverified by hand.** Real CDP flicks at about 4,600 px/s land right at the firing level (signal 0.98, 1.04 and 1.91 on three attempts), so the checker's real-input control allows up to three attempts. With a physical mouse, droplets need a genuinely abrupt flick. If they feel too rare, *Jerk threshold* is the first slider to lower; too eager, raise it.
- **The neck is short in length.** The bead is small by design (4-8 px), and its surface stays only about 2-3 px from the body while connected. The revised neck reads as a pinching waist that thins to about 3 px for 2-3 frames, not as a drawn-out thread. A longer bridge would need the union or gap geometry changed, which this timing revision deliberately left alone. Near the break, antialiasing makes the last thread frame look soft grey rather than crisp.
- **The flick-and-stop bead hangs** where it pinched (about 30 px/s) instead of being flung back, because the later release finds the body already slowing (see *Phase 3 revision*).
- **The neck timing is not visually approved:** 124 ms against 82 ms has to be judged by hand (`?mode=B`, then compare *Single droplet · balanced* with *Balanced · first version*).
- **Free-bead drift varies a little with frame rate:** 29.5-31.9 px after a flick, 82-91 px after a sharp turn at 60-165 Hz. Release can only happen on a frame boundary; the decisions themselves are identical.
- **One change to the approved body:** the resting membrane now reaches zero on the same frame it stills, which fixes a rare one-late-draw race the Phase 2 idle check exposed intermittently. Its fade differs by under 0.02 px for a frame; nothing else changed (verified against `5f6033d`).
- **Not handled yet (Phase 4):** a droplet pool, spawning more than one bead per event, and droplets drawn beyond the 64 px bead canvas (not needed for one bead).

Earlier phases:

- **Mild asymmetry at full stretch.** The field can make one end of the stretched lens slightly fuller than the other, or a flank slightly flatter (up to 0.7 px). It is irregular and evolves, with no fixed pattern. *Noise moving px* makes it quick to judge.
- **Post-stop elongation.** See the fidelity-correction notes: about 50 ms of continued stretch after a short flick. Investigated and deliberately unchanged.
- **Mid-tone contrast.** Over mid-tones (the render, grey, amber) the difference lens changes hue but barely changes brightness. Still unsolved on purpose; judge it with the real body.
- **Changed Phase 1 values** (unchanged by this correction): raw velocity `velocityStaleMs` 40 → 30 and `velocityDecay` 30 → 50 (shape recovery only; position is unaffected), `canvas.maxDpr` 2 → 3, and an antialiasing ramp that stays about 1 device px when the canvas is upscaled.
- **Still unmeasured.** Real-display feel at 144/165 Hz needs hands-on checking; automation can only show frame-rate equivalence. Firefox and Safari are not tested. The forced-draw cost is a lab measurement on the integrated GPU, not a per-frame GPU timer.

## Status

The author approved *Reference goo · balanced* (Phase 4.5) as the final cursor behaviour of the lab on 2026-10-03. It ships in the Observatory (see *Production integration*) and is merged into `master`.
