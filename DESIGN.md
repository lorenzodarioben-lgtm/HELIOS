---
name: Helios Observatory
description: Offline evidence explorer for Helios, an adaptive hybrid distributed rendering engine (C++20 ray tracing with MPI + OpenMP), laid out as a backlit light table.
colors:
  paper: "#f6f5f1"
  paper-2: "#eceef0"
  paper-3: "#e2e5e8"
  white: "#ffffff"
  ink: "#1b1e21"
  ink-2: "#4c565f"
  ink-3: "#646e77"
  ink-4: "#9aa2a9"
  numeral-pale: "#cdd2d6"
  rule: "rgba(27, 30, 33, 0.14)"
  rule-2: "rgba(27, 30, 33, 0.26)"
  teal: "#0f7479"
  steel: "#3d5f80"
  graphite: "#4a5158"
  stone: "#a08f78"
  stone-ink: "#6f6252"
  amber: "#c3821f"
  amber-ink: "#93600f"
  pass: "#1f7a55"
  fail: "#b24a36"
  worker-silver: "#8a939b"
  worker-teal: "#13847f"
  code-ground: "#16191c"
typography:
  wordmark:
    fontFamily: "Bahnschrift, 'Helios Backup', 'Segoe UI', sans-serif"
    fontSize: "clamp(5.5rem, 9.2vw, 11rem)"
    fontWeight: 300
    lineHeight: 0.8
    letterSpacing: "0.14em"
  display:
    fontFamily: "Bahnschrift, 'Helios Backup', 'Segoe UI', sans-serif"
    fontSize: "10.5rem"
    fontWeight: 300
    lineHeight: 0.74
    letterSpacing: "-0.03em"
  figure:
    fontFamily: "Bahnschrift, 'Helios Backup', 'Segoe UI', sans-serif"
    fontSize: "5.8rem"
    fontWeight: 300
    lineHeight: 0.86
    letterSpacing: "-0.015em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Bahnschrift, 'Helios Backup', 'Segoe UI', sans-serif"
    fontSize: "2.75rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.07em"
    fontVariation: "'wdth' 75"
  title:
    fontFamily: "Bahnschrift, 'Helios Backup', 'Segoe UI', sans-serif"
    fontSize: "1.6rem"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "0.005em"
    fontVariation: "'wdth' 92"
  statement:
    fontFamily: "'Segoe UI Variable Display', 'Segoe UI', 'Helios Backup', system-ui, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 400
    lineHeight: 1.28
    letterSpacing: "-0.005em"
  body:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', 'Helios Backup', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "tnum"
  subhead:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', 'Helios Backup', system-ui, sans-serif"
    fontSize: "0.74rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.1em"
  edge:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', 'Helios Backup', system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0.01em"
  label:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', 'Helios Backup', system-ui, sans-serif"
    fontSize: "0.64rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.1em"
  mono:
    fontFamily: "Consolas, 'Cascadia Mono', ui-monospace, monospace"
    fontSize: "0.78rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  none: "0px"
  hair: "2px"
  key: "3px"
  full: "50%"
spacing:
  xs: "10px"
  sm: "14px"
  md: "22px"
  lg: "28px"
  xl: "44px"
  2xl: "56px"
  3xl: "72px"
  page-x: "clamp(28px, 4.4vw, 88px)"
components:
  button-lead:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "13px 20px"
  button-lead-hover:
    backgroundColor: "#2c3237"
  button-action:
    textColor: "{colors.teal}"
    padding: "4px 0"
  button-text:
    textColor: "{colors.ink-2}"
    padding: "6px 0"
  button-text-pressed:
    textColor: "{colors.teal}"
  button-icon:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    size: "36px"
  button-icon-big:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    size: "52px"
  button-icon-big-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  mode-tab:
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
    padding: "20px 24px 18px"
  mode-tab-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  text-switch:
    textColor: "{colors.ink-3}"
    padding: "10px 0 12px"
  text-switch-selected:
    textColor: "{colors.ink}"
  evidence-label:
    textColor: "{colors.teal}"
    typography: "{typography.label}"
  select:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.hair}"
    padding: "7px 26px 7px 9px"
  inspector-panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "24px 26px 22px"
  code-block:
    backgroundColor: "{colors.code-ground}"
    textColor: "#e4e7ea"
    typography: "{typography.mono}"
    padding: "18px 20px"
---

# Design System: Helios Observatory

## Overview

**Creative North Star: "The Light Table"**

The evidence lies on a backlit opal light table. Renders sit on it as transparencies, worker runs as film strips, and IDs, hashes and paths as edge print along the margins. The ground is a warm pearl paper with a fine noise grain, and the ink is charcoal. Frames do not float above the table on drop shadows. They glow into it with a white backlight halo, and the only other marks on the table are hairline rules, corner registration marks and the occasional china-marker annotation.

Density is that of a working lab bench rather than a marketing page. Each of the ten sections opens with a large pale section numeral, a condensed uppercase title and a one-line statement, then gives the first screen to a single dominant instrument: the convergence wipe, the tile field, the film-strip replay. Colour is scarce and always carries meaning. Teal is interactive and FORMAL, steel is diagnostic, and a single amber marks "now". Rank comes from inversion: exactly one lead element per view prints dark on the pale table.

The system rejects the dark card-grid dashboard. It has no boxed cards, no glassmorphism and no gradient accents. It also uses no violet or terracotta, and it loads no remote or downloaded fonts. It is built to be presented, so it has a recording mode with larger type and hidden chrome, and a presentation mode with a thin amber progress line.

**Key Characteristics:**
- Opal paper ground with SVG-noise grain, charcoal ink, hairline rules.
- Frames backlit by a white halo, never lifted by drop shadows.
- Panels marked by corner crop marks, never enclosed in boxes.
- One dark lead element per view (rank by inversion).
- Amber reserved for the moving edge of "now".
- Every visual carries an underlined evidence class label.
- Bahnschrift display with its width axis; Segoe UI Variable for text; Consolas only for machine strings.

## Colors

The palette is a restrained opal-and-charcoal neutral ground. Three cool accents do the semantic work, and one warm amber is reserved for time.

### Primary
- **China-Marker Teal** (teal): the interactive colour. Used for links, active text buttons, the selected film frame, pipeline dots, focus rings, the caret, text selection tint, "done" states and the FORMAL evidence label. The selection loop drawn on the workload tile field uses it too.

### Secondary
- **Steel Blue** (steel): DIAGNOSTIC evidence labels, the adaptive policy, the stress run bar, and a worker colour.

### Tertiary
- **Now Amber** (amber, with amber-ink for its outline): marks the present moment only. It appears on the hero montage position tick, the scheduler replay playhead and scrubber thumb, the outline of tiles "rendering now", the convergence scale's current step and the presentation progress line.

### Neutral
- **Opal Paper** (paper): the table itself. The page ground, inspector panels, and the ink colour on dark lead elements.
- **Pale Film** (paper-2) and **Film Base** (paper-3): banded full-bleed sections, empty canvas grounds, meter and busy-bar tracks.
- **Backlight White** (white): frame and canvas grounds, selects, icon buttons.
- **Charcoal Ink** (ink): text, lead slabs, the selected scheduler mode, leader lines and the hand-drawn circle on the slowest tile.
- **Ink ramp** (ink-2, ink-3, ink-4): ink-2 is secondary copy, ink-3 is edge print, muted labels and crop marks, and ink-4 is de-emphasised figure parts such as "× limit" and index numbers.
- **Pale Numeral** (numeral-pale): the large section-opener numerals only.
- **Hairlines** (rule, rule-2): rule divides rows and lists; rule-2 marks the structural top and bottom edges of bands, tabs and consoles.
- **Stone and Stone Ink** (stone, stone-ink): the static policy, a worker colour, and the HISTORICAL label and partial states.
- **Pass / Fail** (pass, fail): check marks and verification results only.
- **Darkroom** (code-ground): code listings. The trace inspector overlay runs one step darker.

### Worker palette
Workers are drawn in china-marker colours, always paired with a text label: coordinator in **Silver** (worker-silver), then **Teal** (worker-teal), **Steel** (steel), **Graphite** (graphite) and **Stone** (stone). Policies map static to stone, dynamic to worker-teal and adaptive to steel. The workload cost ramp is a light "film density" scale, from clear film through petrol to near-black.

### Named Rules
**The Amber Is Now Rule.** Amber marks only the present moment: a playhead, a scrubber, "rendering now", the montage position, the current convergence step or presentation progress. It is never a worker, a category, a highlight or a decoration.

**The Evidence Colour Rule.** Teal means interactive or FORMAL, steel means diagnostic, stone-ink means historical. An accent that does not carry one of these meanings is not used.

**The No Violet Rule.** Violet and terracotta are not part of this palette. Warm tones come only from stone and the renders themselves.

## Typography

**Display Font:** Bahnschrift, a variable face used on its width axis (with the bundled Noto Sans "Helios Backup", then Segoe UI)
**Body Font:** Segoe UI Variable Text (large statements use Segoe UI Variable Display)
**Label/Mono Font:** Consolas (then Cascadia Mono)

**Character:** The display voice is an engineered DIN-like face. It prints light and huge for figures and numerals, and condensed and tracked for uppercase titles, so it reads like stencilled lab labelling. Segoe UI Variable carries the explanations quietly beside it. All faces are local: Windows-installed first, with Noto Sans bundled under OFL as the portable fallback. Numbers are tabular everywhere.

### Hierarchy
- **Wordmark** (300, clamp(5.5rem, 9.2vw, 11rem), 0.8, tracked 0.14em): HELIOS on the hero and closing screen only.
- **Display** (300, 10.5rem, 0.74): pale section numerals 00–09 in openers. They drop to 8.4rem in recording mode and 5rem on phones.
- **Figure** (300, 5.8rem; 3.6rem and 2.3rem steps): headline measurements such as 2.97× and 458/458. Stress and correctness leads scale this up to 7.4–9.6rem.
- **Headline** (400, 2.75rem, wdth 75, tracked 0.07em, uppercase): section titles in openers. Uppercase Bahnschrift at wdth 78–84 is also the voice of instrument labels, including mode tabs, pipeline stages, TOC entries, chain steps and outcome names.
- **Title** (400, 1.6rem, wdth 92, sentence case): block headings. Banded and chart headings run at 1.9rem.
- **Statement** (Segoe UI Variable Display, 400, 1.6rem, 1.28, max 38ch): the opener's one-line statement. The 1.1–1.3rem steps serve hero descriptions, pipeline text and short answers.
- **Body** (400, 1rem, 1.55): running copy, with ledes at 1.08rem and max 68ch.
- **Subhead** (700, 0.74rem, tracked 0.1em, uppercase, ink-2): small panel headings such as "Tiles in flight" and "Distribution of tile compute time".
- **Edge print** (500, 0.78rem): provenance lines, captions and the top edge line.
- **Label** (700, 0.64rem, tracked 0.1em, uppercase, underlined): evidence classification labels.
- **Mono** (Consolas, 500, 0.78rem): IDs, hashes, paths, commands, code and key caps.

### Named Rules
**The Mono Is Machine Rule.** Consolas sets only strings a machine produced or consumes: IDs, hashes, file paths, commands, code and key caps. Numbers, labels and prose never use it.

**The Two Heading Voices Rule.** Block headings use sentence-case Bahnschrift at wdth 92. Small panel headings use tracked uppercase in the text face. Uppercase condensed Bahnschrift is reserved for section titles and instrument labels.

**The Local Faces Rule.** No web fonts and no CDN. Every family resolves to an installed Windows face or the bundled Helios Backup.

## Layout

Sections are single full pages switched by route. Each starts with an **opener**, a two-column grid of the pale numeral beside the uppercase title and statement. The edge-print ID is locked to the top-right corner, and a hairline closes the opener before 44px of air. Page padding is fluid, and the left side gets an extra 10px to clear the rail.

Content sits in a few asymmetric grids. The main grid is a dominant instrument at about 2.35fr beside a 300px+ side column that holds the inspector, lanes or key figures. There are also a half grid and a narrow-list-plus-wide-detail side grid (Provenance, Technical Q&A). Gaps are 44px by default and 56–72px between major blocks. Bands break to full bleed on paper-2 between hairlines.

Rhythm is built from 22px (rule padding, row spacing) and 44px (grid gaps, opener margin), with 28px stacks and 72–88px section breaks. Rows in lists, tables and key/value pairs are separated by hairline top borders, never by zebra striping or boxes.

Responsive behaviour has two steps. At 1360px and below, the two-column stages collapse to one column, the evidence strip becomes three columns with the lead spanning two rows, and the modes become a 2×2 grid. At 900px and below, padding drops to 20px, the rail becomes a "Sections" button, openers stack with the edge ID inline, and the hero becomes a stacked image-over-copy layout. The primary target is a 1920×1080 recording; 1440×900 must remain comfortable.

**Recording mode** (html.recording) raises the root size to 17.6px, hides the rail, footnote meta and recording-only controls, and tightens openers. **Presentation mode** (body.presenting) fades out the edge line and rail, adds a bottom-right edge label, a 3px amber progress line and hover-revealed previous/next buttons.

## Elevation & Depth

Depth comes from light, not lift. Frames, canvases and thumbnails are backlit: a crisp white inner edge, a wide white halo bleeding into the paper and a faint ink hairline, as if lit from beneath the table. Everything else is flat on the table, separated by hairlines and tone (paper, paper-2, paper-3). Only things that physically slide over the table cast a soft ambient shadow: the navigation panel, the About drawer, the trace-inspector overlay and the index sheet rising over the sticky hero.

### Shadow Vocabulary
- **Backlight** (`box-shadow: 0 0 0 1px rgba(255,255,255,0.95), 0 0 34px 6px rgba(255,255,255,0.9), 0 0 0 1px rgba(27,30,33,0.1)`): every render frame, canvas, loupe and TOC thumbnail.
- **Film halo** (`box-shadow: 0 0 18px 2px rgba(255,255,255,0.9)` with a 1px ink outline at 0.1): film-strip thumbnails and logical-processor cells.
- **Sliding sheet** (`box-shadow: 24px 0 60px -34px rgba(27,30,33,0.34)` for the nav panel, mirrored at -30px/70px/-40px/0.45 for the drawer): overlays that slide in from an edge.
- **Overlay** (`box-shadow: 0 30px 80px -30px rgba(0,0,0,0.6)`): the dark trace inspector.

### Named Rules
**The Backlight Rule.** Evidence frames glow; they never cast drop shadows. If a render looks like it is floating above the page, it is wrong.

**The Sliding Sheet Rule.** A shadow is allowed only on a surface that moves over the table (a panel, drawer or overlay), and it falls away from the edge the surface came from.

## Shapes

The form language is square and ruled. Frames, panels, slabs, tabs and code blocks have square corners. Selects use a 2px radius and key caps 3px. Circles are reserved for things that are points: icon buttons, pipeline and timeline dots, the rail mark, processor threads and the wipe handle knob. Panels are defined by **crop marks**: 14px ink-3 corner registration ticks at all four corners on a paper ground. There is no enclosing border. Processes in the hardware diagram use open square brackets. Hairlines are 1px; structural edges step to rule-2 or 1.5–2px ink.

The workload tile field adds a hand-drawn layer. The slowest tile gets an ink circle drawn like a china-marker note. The selected tile gets a teal rounded loop that draws itself in over 300ms, and a leader line runs from the tile to the inspector. The convergence loupe uses the same leader line (1px ink path ending in a 3px dot).

## Components

### Buttons
Quiet by default, inverted only when a button is the one lead action.
- **Shape:** square (0px), or circular for icon buttons.
- **Lead:** ink slab with paper text (13px 20px padding). It lightens slightly on hover. Used only where the button is the view's lead, such as "Show evidence" in Technical Q&A.
- **Action link:** teal semibold text with a trailing arrow icon that slides 4px on hover. The ink variant is for secondary actions.
- **Text button:** ink-2 semibold small text with no box. A current-colour underline appears on hover, and it turns teal and underlined when pressed or expanded. Used on the top edge line (Guided Tour, About). Recording mode has no public control.
- **Icon button:** a 36px white circle with a rule-2 border that turns ink on hover. The 52px transport variant has an ink border and fills ink when pressed (play/pause).
- **Focus:** a 2px teal outline offset 3px everywhere.

### Text switches
- **Style:** a row of plain-text tabs over a hairline, with ink-3 unselected and ink selected. A 2px ink underline slides between tabs on the standard ease.
- **State:** it replaces segmented controls and chips everywhere. The small variant is used in side columns.

### Mode tabs (signature)
Four equal columns between rule-2 hairlines, split by rule verticals. Each holds an uppercase condensed name (wdth 78) over a provenance edge line. The selected mode inverts to an ink slab. Hover tints the column white at 0.6.

### Evidence classification labels
- **Style:** small tracked uppercase text-face labels underlined with a 1px current-colour rule. FORMAL is teal, DIAGNOSTIC steel, HISTORICAL stone-ink and PRESENTATION ink-2. RECONSTRUCTED is ink with a **dashed** underline, and ILLUSTRATIVE is ink-3 with a **dotted** underline. On a dark lead the FORMAL label lightens to a pale teal.
- **Placement:** inline after the heading or figure it qualifies, or at the start of the edge print beneath it.

### Cards / Containers
- **Corner Style:** square.
- **Background:** paper for inspector and evidence panels, white for frames.
- **Shadow Strategy:** frames use Backlight; panels have none (see Elevation & Depth).
- **Border:** none. Panels carry crop marks; lists and key/value pairs use hairline row tops.
- **Internal Padding:** 24–30px.

### Inputs / Fields
- **Select:** white, rule-2 1px border, 2px radius, medium 0.84rem text, drawn chevron.
- **Checkbox:** native, teal accent.
- **Scrubber:** a 2px track that fills ink up to the playhead, with an amber thumb ringed in white and amber-ink.
- **Paths:** mono edge print with a dotted underline. Clicking copies the path, and it flashes teal on copy.

### Navigation
- **Rail:** a 22px left edge with an ink dot mark and a vertical rule of section ticks. The current tick grows to full width in ink.
- **Panel:** on hover or focus, a 292px paper sheet slides out (280ms ease) listing sections as number, condensed display title and key cap between hairlines. Hovered titles shift 4px, and the current entry prints ink with a bold number and an ink key cap.
- **Top edge line:** fixed at top right. It shows frozen source, platform and verification status as edge print, followed by text buttons.
- **Mobile:** the rail collapses to a "Sections" text button that opens the same panel.
- **About drawer:** a 460px white sheet from the right, toggled by About (which stays above it). A light paper scrim (paper at 0.42) marks it active. A click on the scrim or anywhere outside, Esc, any route change and the Guided Tour all close it, and focus returns to the About button. The closed drawer takes no pointer input.
- **Guided Tour:** the public name of the 11-step presentation sequence (P or the Guided Tour button).

### Section opener (signature)
A pale Display numeral beside the uppercase condensed Headline, a Statement line underneath, and a mono edge-print ID locked top-right. A hairline closes it. On entry, the section's blocks rise 14px and fade in (460ms), staggered 70ms apart.

### Hero evidence strip (signature)
Four cells run along the foot of the full-bleed render montage over a rule-2 top edge, and each cell uses a different form. The lead cell is an ink slab carrying 2.97×. The next is a speedup ruler with ticks, then a tally of the six final experiments as segmented teal bars, then a steel bar ending at an ink limit line. Each cell ends in a label and edge print, and the frozen source appears as a small label. The montage holds each render for 4.6s and crossfades over 0.9s with a slow scale-and-drift that continues through the fade; a small uppercase scene name (for example BVH STRESS) sits above the 01 / 05 counter, and amber ticks mark the current frame.

### Convergence wipe (signature)
A before/after render split by a draggable white handle with a circular knob. A 2× pixel loupe canvas sits alongside, joined to its square target box by an ink leader line. A 9-step SPP scale below shows its current step as an amber tick.

### Film-strip replay (signature)
Recorded scheduler traces replay on the tile field. One amber playhead is driven by recorded trace time, tiles rendering now are outlined amber, and worker lanes list state, count and busy bar in the worker colours. A console underneath holds transport buttons, a large clock and the scrubber.

### Code and overlays
Code listings sit on the darkroom ground in 0.82rem mono with dim line numbers and a pale-teal highlight band. The trace inspector is a dark overlay inset from the page edges.

## Do's and Don'ts

### Do:
- **Do** mount every render, canvas and thumbnail as a backlit frame on white, using the Backlight shadow.
- **Do** mark panels with corner crop marks on paper and separate rows with 1px hairlines.
- **Do** give each view exactly one inverted ink lead, such as the hero figure, the selected mode or the lead action.
- **Do** attach an underlined evidence class label wherever a visual's provenance could be ambiguous. Use a dashed underline for RECONSTRUCTED and a dotted one for ILLUSTRATIVE.
- **Do** pair every worker colour with a text label.
- **Do** open every section with numeral, condensed uppercase title, one-line statement and top-right edge-print ID.
- **Do** animate on the shared ease (cubic-bezier(0.2, 0.7, 0.2, 1)) at 160 / 280 / 460ms, and zero all durations and delays under reduced motion.
- **Do** set tabular numerals for every figure.

### Don't:
- **Don't** use amber for anything except the moving edge of "now".
- **Don't** box content in bordered or shadowed cards; the light table has no cards.
- **Don't** put drop shadows on evidence frames.
- **Don't** introduce violet, terracotta or gradient accents.
- **Don't** load web fonts or CDN assets; faces are local only.
- **Don't** set prose, labels or figures in Consolas.
- **Don't** print more than one element per view as an ink lead slab (code listings on the darkroom ground are material, not rank).
