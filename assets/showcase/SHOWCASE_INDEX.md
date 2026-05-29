# Showcase index

Every file under `assets/showcase/`, with its source evidence and how to read its values. Produced by `scripts/visual_showcase/` (presentation tooling only; `src/`, `include/`, `tests/` and all formal evidence are untouched). Validation results: `validation.json`.

Classification:
- **formal (visualised)**: drawn directly from Protocol V2 evidence on the frozen source.
- **diagnostic** / **historical**: from `results/diagnostic/` or the pre-fix formal runs, labelled on the image.
- **presentation**: renders made with the frozen binary for show; not benchmark evidence.
- **diagram**: illustrates code structure; contains no measurements.

Values column: *measured* = numbers read from evidence files at render time; *derived* = computed from measured records (for example tile start times from recorded compute seconds; see `scripts/visual_showcase/scheduler_data.py`); *real render* = pixels are Helios output.

| File | Type | Dimensions | Source evidence | Classification | Values | Recommended use |
|---|---|---|---|---|---|---|
| `hero/helios-hero.png` | PNG | 1920×1080 | gallery `reflective` render, 1024 SPP (lossless copy) | presentation | real render | report Figure 1, GitHub hero, video |
| `hero/helios-hero-wide.png` | PNG | 2400×1000 | separate 2400×1000 `reflective` render (real render, not a crop) | presentation | real render | GitHub banner, portfolio |
| `gallery/reflective-hero.png` | PNG | 1920×1080 | frozen binary, see gallery/README.md | presentation | real render | gallery, hero |
| `gallery/showcase-hero.png` | PNG | 1920×1080 | frozen binary, see gallery/README.md | presentation | real render | gallery |
| `gallery/bvh_stress-hero.png` | PNG | 1920×1080 | frozen binary, see gallery/README.md | presentation | real render | gallery |
| `gallery/uniform-hero.png` | PNG | 1920×1080 | frozen binary, see gallery/README.md | presentation | real render | gallery |
| `gallery/imbalanced-hero.png` | PNG | 1920×1080 | frozen binary, see gallery/README.md | presentation | real render | gallery; tile imagery in scheduler visuals |
| `gallery/scheduler_stress-hero.png` | PNG | 1920×1080 | frozen binary, see gallery/README.md | presentation | real render | gallery (the stress-test scene) |
| `gallery/reflective-wide.png` | PNG | 2400×1000 | frozen binary, see gallery/README.md | presentation | real render | source for the wide hero |
| `convergence/convergence-grid.png` | PNG | 1920×1080 | 9 renders, convergence/convergence.json | presentation | real renders; times informational | GitHub |
| `convergence/convergence-before-after.png` | PNG | 1920×1080 | 1 SPP and 256 SPP frames | presentation | real renders | report Figure 2 (cropped), video, GitHub |
| `convergence/convergence.mp4` | MP4 | 1920×1080, 6.9 s @ 30 fps | 9 renders, hard cuts only | presentation | real renders | video segment 2 (P2) |
| `convergence/convergence.gif` | GIF | 720×405, 69 frames | from convergence.mp4 | presentation | real renders | GitHub |
| `scheduler/scheduler-static.mp4` | MP4 | 1920×1080, 10.0 s @ 30 fps | formal 20260928T103934Z-edc10839, imbalanced-medium-mpi-static-r3-t1-co-b1 tiles.csv | formal (visualised) | derived from measured data | video B-roll |
| `scheduler/scheduler-fixed-dynamic.mp4` | MP4 | 1920×1080, 7.8 s @ 30 fps | formal …-mpi-dynamic-r3-t1-all-b0 trace.csv + tiles.csv | formal (visualised) | derived from measured data | video B-roll |
| `scheduler/scheduler-adaptive.mp4` | MP4 | 1920×1080, 7.8 s @ 30 fps | formal …-hybrid-adaptive-r3-t1-all-b5 trace.csv + tiles.csv | formal (visualised) | derived from measured data | video B-roll |
| `scheduler/scheduler-comparison.mp4` | MP4 | 1920×1080, 10.0 s @ 30 fps | the three runs above, aligned at t = 0 on one real-time axis | formal (visualised) | derived from measured data | video segment 12 (P7), GitHub, reel |
| `scheduler/scheduler-comparison-preview.gif` | GIF | 960×540, 100 frames | from scheduler-comparison.mp4 | formal (visualised) | derived from measured data | GitHub |
| `scheduler/scheduler-static-still.png` | PNG | 1920×1080 | static run at t = 2.000 s | formal (visualised) | derived from measured data | report, GitHub |
| `scheduler/scheduler-dynamic-still.png` | PNG | 1920×1080 | fixed dynamic run at t = 1.150 s | formal (visualised) | derived from measured data | report, GitHub |
| `scheduler/scheduler-adaptive-still.png` | PNG | 1920×1080 | adaptive run at t = 0.300 s (batches of 5 and 8 visible) | formal (visualised) | derived from measured data | report, GitHub |
| `scheduler/scheduler-comparison-still.png` | PNG | 1920×1080 | all three runs at t = 1.900 s | formal (visualised) | derived from measured data | GitHub (report Figure 14 uses the Observatory Scheduler Lab) |
| `scheduler/scheduler-trace-validation.json` | JSON | – | cross-checks of every displayed timeline against the recorded evidence | provenance | measured | audit |
| `scheduler/tile-cost-map.png` | PNG | 1920×1080 | formal 20260928T102644Z-100e1393 sequential tiles.csv, median of 7 runs | formal (visualised) | measured | GitHub (report Figure 4 uses the Observatory Workload Microscope) |
| `scheduler/tile-cost-static-partitions.png` | PNG | 1920×1080 | same tile costs; equal-count partitions | formal (visualised) | derived from measured data | GitHub, portfolio |
| `correctness/backend-correctness-wall.png` | PNG | 1920×1080 | 7 presentation renders, correctness/backend-correctness.json | presentation | real hashes | report Figure 5 (cropped), GitHub |
| `correctness/backend-correctness.json` | JSON | – | backend, command, hash, recomputed hash, informational runtime, output path | provenance | measured | audit |
| `correctness/thumbs/*.png (7)` | PNG | 800×450 each | the 7 backend outputs, 800×450 | presentation | real renders | wall inputs |
| `performance/optimisation-before-after.png` | PNG | 1920×1080 | diagnostic A/B 20260928T101701Z-0de80589 summary.json | diagnostic (visualised) | measured | GitHub (the report keeps the native chart, Figure 6) |
| `performance/performance-investigation-story-16x9.png` | PNG | 1920×1080 | historical 301480e3, diagnostic A/B, formal 100e1393; report Section 5 | historical + diagnostic + formal | measured | video P8, GitHub |
| `performance/performance-investigation-story.png` | PNG | 1500×2286 | same, tall report/portfolio layout | historical + diagnostic + formal | measured | portfolio, appendix |
| `performance/helios-performance-dashboard.png` | PNG | 1920×1080 | formal aggregates of the six frozen-source experiments | formal (visualised) | measured | video P11, GitHub |
| `evidence/stress-test-summary.png` | PNG | 1920×1080 | results/stress/20260928T111419Z-5832e956 manifest.json + environment.json + logs | formal evidence (visualised) | measured | video P10 |
| `architecture/architecture-report.png` | PNG | 1920×1080 | structure of src/core.cpp and src/main.cpp | diagram | illustrative (no values) | report Figure 3 (cropped), GitHub |
| `architecture/architecture-video.png` | PNG | 1920×1080 | same, video title | diagram | illustrative (no values) | video P4 |
| `architecture/parallelism-layers.png` | PNG | 1920×1080 | render_tile and run_mpi structure; background is a real render | diagram | illustrative; tile colours schematic | video, GitHub |
| `branding/helios-title-16x9.png` | PNG | 1920×1080 | hero render + wordmark | presentation | real render | video P1, reel |
| `branding/helios-github-header.png` | PNG | 1280×640 | wide hero render + wordmark | presentation | real render | GitHub header / social preview |
| `video/hero-slow-zoom.mp4` | MP4 | 1920×1080, 6.0 s @ 30 fps | hero render, 7% slow zoom | presentation | real render | video B-roll |
| `video/gallery-montage.mp4` | MP4 | 1920×1080, 12.1 s @ 30 fps | the 6 gallery renders, crossfades between different images | presentation | real renders | video P12 |
| `video/correctness-wall-reveal.mp4` | MP4 | 1920×1080, 6.6 s @ 30 fps | correctness wall, cards revealed in order | presentation | real hashes | video B-roll |
| `video/performance-story-reveal.mp4` | MP4 | 1920×1080, 10.2 s @ 30 fps | storyboard, cards revealed in order | historical + diagnostic + formal | measured | video B-roll |
| `video/optimisation-reveal.mp4` | MP4 | 1920×1080, 5.9 s @ 30 fps | before/after chart, builds revealed in order | diagnostic (visualised) | measured | video B-roll |
| `video/helios-showcase-reel.mp4` | MP4 | 1920×1080, 31.2 s @ 30 fps | silent reel assembled only from the assets above | mixed (labelled on screen) | as its sources | portfolio, GitHub link |
| `video-presenter.html` | HTML | – | local playback page for recording (no data) | tooling | – | recording the video |
| `validation.json` | JSON | – | scripts/visual_showcase/validate_showcase.py output | provenance | – | audit |

## Real terminal captures

Captured manually by the author on 2026-09-30 (PowerShell, repository at commit `333a9b7`, whose `src/`, `include/` and `tests/` are identical to the frozen source `e2c13e2`), following `docs/TERMINAL_EVIDENCE_CAPTURE_PLAN.md`. They are unedited screenshots of real commands; nothing was regenerated. Each shows `git log -1` with `333a9b7` at the top. They are not in the final report, which is frozen.

| File | Type | Dimensions | Captured | Commit visible | What it shows | Classification | Recommended use |
|---|---|---|---|---|---|---|---|
| `evidence/terminal-tests-validators.png` | PNG | 1436×528 | 2026-09-30 | `333a9b7` | `helios_tests.exe` ("All Helios core checks passed"), `validate_cli.py` (12 CLI error cases) and `validate_backends.py` (11 backend configurations, one hash per workload) | REAL TERMINAL CAPTURE | video (correctness segment), GitHub/portfolio, submission archive |
| `evidence/terminal-cli-backends.png` | PNG | 1428×322 | 2026-09-30 | `333a9b7` | `helios.exe --help`: the seven backends, scenes and scheduling options | REAL TERMINAL CAPTURE | video (architecture segment), GitHub/portfolio, submission archive |
| `evidence/terminal-stress-manifest.png` | PNG | 1430×628 | 2026-09-30 | `333a9b7` | the recorded stress manifest (`20260928T111419Z-5832e956`: 600.34 s elapsed, 600 s timeout, `timed_out` True, git `8362380`), its arguments and the run folder (no image file) | REAL TERMINAL CAPTURE | video (stress segment), GitHub/portfolio, submission archive |

Note: the stress capture prints the absolute local path recorded in the manifest's arguments; `terminal-cli-backends.png` shows the binary's own help text, which still calls it a "path tracer" (the frozen binary is not changed).
