# Helios Observatory: visual redesign plan

Status: plan written before any UI change (2026-09-29), updated to the as-built values after the finish review (verdict SHIP). Where the review changed the design, this document states what was built; the authoritative design system is [`DESIGN.md`](../DESIGN.md) at the repository root. It covers the visual layer only: every value, trace, evidence class, route, hotkey and interaction of the current Observatory is kept. The C++ engine, `results/` and the final report are not touched.

The "before" state is captured in [`observatory-redesign/before/`](observatory-redesign/before/) (Overview, Workload Microscope, Scheduler compare, Performance case file at 1920×1080).

## 1. What is wrong with the current look

Measured against the before screenshots:

- **Card monoculture.** Almost every block is a rounded, bordered, dark rectangle: six identical metric cards under the hero, a nine-card "explore" grid, worker cards, stage cards, outcome cards, question cards. Nothing has more visual weight than anything else.
- **Dashboard idiom.** A near-black ground with cyan accents and small grey labels reads as a monitoring console or SaaS admin panel, not as a graphics project.
- **The hero is boxed.** The best asset (a real 1024-SPP render) sits inside a bordered frame at half the viewport, and a static video player competes with it.
- **Flat hierarchy and rhythm.** Every section follows heading → tab row → panels → panels, with equal gaps everywhere. The data visualisations are smaller than the chrome around them.
- **Typography is utilitarian.** One sans at a narrow size range, uppercase microcopy everywhere, no display scale.
- **Wide permanent sidebar.** 232 px of navigation is always visible, even in recordings.
- **Little motion.** Pages swap instantly; only the scheduler replay moves.

## 2. Direction: Light Table

Chosen through the Impeccable direction round (seed `5f4e3888`; the world was assigned by the roll and chosen by the user). The world is a photographer's backlit light table: contact sheets, transparencies, a loupe, china-marker loops, and the numbers printed along the edge of the film. It fits Helios literally. The renders are images, the convergence series is an exposure series, the correctness wall is seven prints of one frame, and a worker's run is a strip of frames in time order.

The grammar is used, not the costume. There are no sprocket holes and no fake film textures. What is kept:

| Device | Where it appears |
|---|---|
| **Edge print** | Small text-face captions along the edge of every image and chart: scene, resolution, SPP, seed, hash, experiment ID. Hashes, paths and IDs inside them are set in mono. |
| **Frames, not cards** | Images glow on the table with a white backlight; panels are marked by corner crop marks and hairlines, never enclosed in boxes. |
| **The loupe** | A 2× pixel loupe beside the render, tied by a leader line to the square region it enlarges. |
| **Marker loops** | The selected tile gets a teal loop; the slowest tile is circled by hand in ink. |

Disciplines donated by the challengers that lost the round (each is a rule, not a decoration):

1. **Rank by inversion** (depot blind). On each view at most one element prints dark on the light ground: the lead. As built: the 2.97× hero figure, the active execution mode in the Scheduler Lab and the "Show evidence" action in Technical Q&A. Other headline figures (Performance, "0 / 360,000 pixels differ", "DNF") are set open on the paper.
2. **One amber moving edge** (daylight section). Amber means *now* only: the scheduler playheads and scrubber, tiles rendering now, the current convergence stop, the hero montage position and the presentation progress line. The slowest tile, idle gaps and the 600 s limit are drawn in ink.
3. **Leader-line annotations** (dress-code callouts). Annotations are lines from the exact tile, pixel region or bar to its value, never floating labels.
4. **Locked edge identifier** (broadcast card). Each section carries the one ID it rests on (experiment, run or source) locked to its top-right corner.
5. **One scrubber drives every layer** (paper automata). The scheduler compare view shares a single timebase and playhead.

## 3. Colour system

The strategy is restrained: a light neutral ground, one technical accent, and amber reserved for "now". All text meets WCAG AA on its ground.

| Role | Token | Value | Use |
|---|---|---|---|
| Ground, opal white | `--paper` | `#F6F5F1` | Page background, like a lit table |
| Ground, soft cool grey | `--paper-2` | `#ECEEF0` | Quiet bands, code, inspectors |
| Pure white | `--white` | `#FFFFFF` | Frames that sit "on" the table |
| Ink, near-black | `--ink` | `#1B1E21` | Text, the inverted lead element |
| Ink, slate | `--ink-2` | `#4C565F` | Secondary text |
| Ink, muted | `--ink-3` | `#646E77` | Edge print, captions |
| Hairline | `--rule` | `rgba(27,30,33,.14)` | Frame edges, dividers |
| Technical accent, teal | `--teal` | `#0F7479` | Links, focus, the active technical state |
| Secondary, steel blue | `--steel` | `#3D5F80` | DIAGNOSTIC, hybrid series, a worker |
| Now, amber | `--amber` | `#C3821F` | Playheads and other "now" markers only |
| Fail, muted vermilion | `--fail` | `#B24A36` | FAIL and MISMATCH only |

Worker and china-marker colours are always paired with a text label:

| Worker | Colour |
|---|---|
| Coordinator | silver `#8A939B` |
| Worker 1 | teal `#13847F` |
| Worker 2 | steel `#3D5F80` |
| Worker 3 | graphite `#4A5158` |
| Worker 4 | stone `#A08F78` |

The planned indigo and terracotta workers were removed in the finish review; the palette has no violet or terracotta. Policy lines: static stone, dynamic teal, adaptive steel.

Tile cost uses a light "film density" ramp: clear `#EEF2F1` → sea glass → teal → deep petrol `#10252E`. Cheap tiles stay clear and expensive tiles print dense. The slowest tile is circled by hand in ink.

Evidence classes become small tracked uppercase labels in the text face, underlined 1 px in the class colour, no pill.

| Class | Colour |
|---|---|
| FORMAL | teal |
| DIAGNOSTIC | steel |
| HISTORICAL | stone-ink `#6F6252` |
| PRESENTATION | ink-2 |
| ILLUSTRATIVE | ink-3, dotted underline |

Dark ground is used in only two places: the trace inspector and code excerpts, where a dark "viewer" is a purposeful contrast.

## 4. Typography

Brand commitment: Windows faces first, with a bundled open-licence backup.

| Role | Primary (installed on Windows) | Bundled backup (OFL, in `assets/observatory/fonts/`) | Why |
|---|---|---|---|
| Display: wordmark, section numbers, big figures | **Bahnschrift** (variable DIN: weight 300–700, width to condensed) | Noto Sans | DIN is the letterform of engineering drawings and technical labelling; the condensed width serves edge print, the light weight gives large numerals an instrument quality |
| Text: body, labels, answers | **Segoe UI Variable Text** / Display (optical sizes) | Noto Sans | Highest on-screen legibility on the recording machine |
| Mono: hashes, IDs, paths, commands, code | **Consolas** | the system monospace | Machine strings only; never labels, prose or figures |

Scale (1920×1080, root 16 px, recording ×1.12):

| Level | Size and treatment |
|---|---|
| Wordmark | clamp(5.5rem, 9.2vw, 11rem), weight 300, letter-spacing 0.14em |
| Section number | 168 px (10.5rem), weight 300 |
| Section title | 44 px, condensed caps, 0.08em tracking |
| Statement | 26 px (1.6rem) |
| Large figure | 64–120 px |
| Body | 16–17 px, line-height 1.55 |
| Edge print | 12.5 px text face, sentence case; mono only for the IDs inside it |

## 5. Layout principles and card reduction

- **Open composition first.** Typography, figures and rules carry the page; containers are the exception.
- **Semantic containers only:** the selected-tile inspector, code excerpts, the trace inspector, the single stress evidence panel, and the experiment record. Everything else is open.
- **Varied rhythm.** Each section has one focal element at a scale clearly larger than the rest, asymmetric columns (roughly 8/4 or 7/5, never three equal columns by default), and more space above a heading than below.
- **Tabs become text switches** with a sliding underline, not pill rows. Execution modes in the Scheduler Lab are set as large words.
- **Faint technical texture.** A fine SVG-noise grain on the paper (the planned 48 px grid was replaced by the grain), crop marks at panel corners, and the locked edge identifier.

## 6. Navigation

- **At rest:** a 22 px rail at the far left, with a thin vertical line, a small Helios mark and one tick per section. The current tick is ink.
- **On pointer approach or keyboard focus:** a 292 px panel slides out to the right (transform, 280 ms ease-out). It shows the section number, title and shortcut key.
- **On leave:** it collapses after a 350 ms grace delay.
- **Accessibility:** `:focus-within` opens it, Tab reaches it, Esc closes it, and hotkeys 1–9, 0 are unchanged.
- **Recording mode:** the rail is invisible until the pointer touches the left edge.
- **Narrow screens:** below 900 px it becomes a "Sections" button that opens the same panel.

The old top status bar becomes one edge-print line at the top right: `Frozen e2c13e2 · i7-11370H 4C/8T · Formal evidence VERIFIED`. The Guided Tour and About controls sit beside it as small text buttons (the final public pass removed the Recording button; recording mode is `?mode=recording` only).

## 7. Overview and hero

- **Full viewport, no frame.** A montage of five real gallery renders (reflective, bvh_stress, uniform, showcase, imbalanced; 1920×1080, 1024 SPP) fills the screen:
  - each render holds for 4.6 s with a slow scale of 1.00 → 1.045 and a slight drift (planned as 8 s; shortened in the final public pass);
  - consecutive renders crossfade over 0.9 s, the outgoing render drifting on through the fade;
  - a small uppercase scene name (for example `BVH STRESS`) sits above the `02 / 05` counter;
  - there are no generated or interpolated frames;
  - a frame counter at the bottom right (`02 / 05 · BVH_STRESS`) can be clicked and pauses on hover;
  - under reduced motion the montage is static, with manual advance only;
  - the image shifts a few pixels with the pointer.
- **Text:**
  - a soft opal scrim rises from the floor of the render;
  - HELIOS is set lower-left at display scale in charcoal with wide tracking;
  - the subtitle and a two-line description sit beneath it;
  - the credit "Lorenzo Dario Ben · SIT315 Concurrent Programming" is small.
- **Evidence strip along the foot** (not six boxes; each figure in its own form):

  | Figure | Label | Treatment |
  |---|---|---|
  | 2.97× | OpenMP 8 | the only dark, inverted frame |
  | 2.45× · 1.95× | hybrid 1×4 · MPI 4 | a speedup ruler from 1× to 3× |
  | 458 / 458 | images verified | a tally of the six final experiments (88, 50, 128, 32, 128, 32) |
  | 600.34 s | controlled DNF | a bar ending at the 600 s limit line |
  | e2c13e2 | frozen source | a small label under the render caption, not a column |

  All values come from the data, as before.
- **Scroll:** the hero is sticky; the index rises over it on an opal sheet, the hero dims and scales back slightly, and the headline fades. There is no scroll-jacking.
- **Index:** an editorial table of contents. It has large numbers, titles and one line each, separated by rules. Hovering an entry reveals a real image crop on a leader line.
- **Closing screen** (`#overview?panel=close`, the last presentation item and the video's closing shot):
  - the wide render;
  - HELIOS;
  - "C++20 · MPI · OpenMP · BVH · Dynamic scheduling · Deterministic validation";
  - the frozen source;
  - the credit.

## 8. Section compositions

Every section opens the same way:

- a large pale section number;
- the title in condensed caps;
- one sentence of statement;
- the locked edge identifier at top right.

| Section | Personality | Composition |
|---|---|---|
| 01 Render Lab | image-led | Large selected render with edge print; a filmstrip of the six scenes; open metadata column. Convergence as a band: big frame, a strong nine-stop scale (1…256) with the amber current stop, a **1 ↔ 256 wipe** compare with a draggable divider, the loupe tied by a leader line to its region. The pipeline is a single ray line with nodes, labelled ILLUSTRATIVE. |
| 02 Workload Microscope | scientific | The tile field is the hero, on the density ramp. Metric and overlay switches are text. The selected tile gets a marker loop plus a **leader line to a floating inspector**. "33.7×" appears as a standalone typographic insight. The histogram is open, and partition caps are shown as bars under a rule. |
| 03 Scheduler Lab | execution | Modes are large words (Static · Fixed dynamic · Adaptive · Compare) with provenance under each, and the active mode prints dark. A large tile field develops as tiles complete, like prints in a tray. Worker lanes are slim status columns, not cards. Timelines are film strips with the **amber playhead**. One control surface holds play/pause, restart, event step, speed, the scrubber on a graticule, and a large time readout. Compare uses three large columns plus a progress chart. Motion: assignment pulse, completion develop, idle fade and adaptive batch loop, all keyed to recorded times. |
| 04 Hardware & Hybrid | structural | Four physical cores drawn as open brackets with two SMT slots each (0/1, 2/3, 4/5, 6/7). Configurations animate process and thread groupings, labelled ILLUSTRATIVE (placement not observed). Measured affinity is a separate DIAGNOSTIC · MEASURED view. The layers diagram is rebuilt as light typography. |
| 05 Performance Lab | analytical | A large open chart with floating headline typography beside it (e.g. "2.97× · OpenMP 8"). The bar detail is an open list. The case file is a vertical investigation line: observation → hypothesis → locating → placement → false sharing → discovery → fix → validation → freeze → formal rerun. |
| 06 Correctness | precise | One large backend image with a list of the seven backends and their hash checks; switching a backend swaps the image. The A · B · Difference row sits under the open lead "0 / 360,000 pixels differ". The validation stack is a ruled list. |
| 07 Stress & Limits | experiment record | Open numbers: 600.34 s beside a solid ink DNF, then 1280 × 720, 2048 SPP, depth 16 and 1.887 B samples set as one sentence. One graticule line with an ink 600 s limit. One crop-marked evidence panel holds invocation and manifest. Threats to validity are paired with how each is handled, following the final report, Section 11. |
| 08 Provenance | traceable | A claims index, then a vertical chain SOURCE → … → REPORT on one line with anchors; the selected stage expands inline. The experiment browser is a ruled register; the source inspector is a dark code viewer. |
| 09 Technical Q&A | documentary | Question index on the left; on the right, a large answer with SHORT ANSWER, EVIDENCE and LIMITATION in clear hierarchy, and "Show evidence →" as a deliberate link. |

## 9. Motion language

| Token | Value |
|---|---|
| `--ease` | `cubic-bezier(.2,.7,.2,1)` |
| `--dur-1` | 160 ms (hover, press) |
| `--dur-2` | 280 ms (tabs, nav) |
| `--dur-3` | 460 ms (section enter, reveals) |
| Hero crossfade | 0.9 s |
| Hero hold | 4.6 s |

- **Section enter:** number, title, statement and body rise 14 px and fade in, staggered 70 ms.
- **Scroll reveals** (Overview only): headings, index rows and big figures.
- **Big numbers:** revealed with a clip wipe, never counted up, so no false intermediate values appear.
- **Tabs:** the underline slides.
- **Tile selection:** the marker loop draws in.
- **Scheduler:** motion is drawn from recorded event times only.
- **Nav:** slide.
- **Presentation HUD:** fades.
- **Reduced motion:** durations and delays drop to near zero, transforms and the montage stop, and crossfades become instant cuts. Content is always visible without JavaScript timing.

## 10. Recording and presentation modes

**Recording** (`?mode=recording` or the button):

- no rail unless the pointer touches the left edge;
- the top line keeps the edge print and About; the Guided Tour button hides;
- root size ×1.12, and larger canvas labels;
- source-path footnotes hidden (evidence classes kept);
- visualisations widened to the full content width;
- controls reduced to what the video uses.

**Presentation** (P, ← → Space Esc):

- full-screen content;
- the top edge line and the rail hide (the edge line returns on hover or focus);
- a thin amber progress line at the very bottom and a small "05 / 11 · Scheduler" label that dims after about 2 s idle but stays legible;
- `?mode=present&item=N` opens the deck on item N;
- edge arrows that appear on hover;
- nothing overlaps content, because a bottom padding is reserved.

## 11. Verification

1. Build, validator (32 checks) and unit tests.
2. A route and console sweep plus the interaction tests.
3. The same tests in recording and presentation mode, and a `file://` test.
4. 1920×1080 captures of every section, Overview recording, Scheduler recording and presentation, reviewed at least twice with fixes between passes.
5. The Impeccable detector, then a fresh finish review.
6. DESIGN.md recorded from the built result.
