# Visual asset audit

Inventory of every visual source in the repository before the visual-showcase sprint (2026-09-29, HEAD `b823a26`, frozen source `e2c13e2`). The newly produced showcase assets are indexed separately in [`assets/showcase/SHOWCASE_INDEX.md`](../assets/showcase/SHOWCASE_INDEX.md). Figure numbers below refer to the report before the final visual integration; the current numbering is in [`report/FIGURE_INDEX.md`](../report/FIGURE_INDEX.md) (the old Figure 11 screenshot is now Figure 13).

Classification:
- **formal**: Protocol V2 evidence on the frozen source (`results/protocol-v2/`, final six IDs).
- **historical**: formal V2 runs on the pre-fix renderer, kept unchanged.
- **diagnostic**: exploratory runs under `results/diagnostic/`.
- **pilot**: Protocol V1 or earlier (`results/raw/`, `results/evidence/`, `results/pilot/`, top-level `results/*.json`).
- **presentation**: images made to show the renderer, not measurements.

Worth columns: **K** means keep as source material; **R**, **V** and **G** mean suitable for the report, the video and GitHub/portfolio respectively.

## 1. Built-in scenes (actual source, `make_scene` in `src/core.cpp`)

All scenes share a large ground sphere and a fixed per-scene camera. The CLI has no camera override, so a scene's framing is fixed; only resolution, SPP, depth and seed vary. Previews at 480×270 and 32 SPP were rendered to `assets/showcase/_work/preview/` (scratch, not committed) to judge them.

| Scene | Content | Camera | Visual character | Gallery value |
|---|---|---|---|---|
| `showcase` | Diffuse, glass and metal sphere; small triangle light | default | Clean three-material still life; glass caustic | Good; the current report Figure 1 |
| `reflective` | As showcase plus a ring of 12 metal and glass spheres; large triangle light | default | Most striking: nested refractions and reflections | **Best hero candidate** |
| `imbalanced` | As reflective plus a 14×14 grid of small spheres in the far left | raised, looking left | Shows *why* the workload is uneven (dense grid in one band) | Good; the benchmark scene |
| `scheduler_stress` | As reflective plus a denser 26×26 grid of smaller spheres | same as imbalanced | Nearly identical framing to `imbalanced` | Keep only as "the stress-test scene" |
| `uniform` | 45 diffuse spheres in an even 9×5 grid | raised, frontal | Calm, orderly; even workload | Good contrast image |
| `bvh_stress` | Three large spheres plus a 30×30 grid of small spheres | default | Dense geometry behind glass and metal | Good; shows the BVH workload |

## 2. Committed images in `assets/`

| Asset | Source | Class | Resolution | Scene / config | Demonstrates | K | R | V | G |
|---|---|---|---|---|---|---|---|---|---|
| `helios-showcase.png` (+ `.ppm`) | `results/hero.json` | presentation (pre-fix render; the fixes change no pixels) | 800×450 | showcase, 128 SPP, OpenMP | A real Helios render | ✔ | in use (Fig 1) | ✔ | modest |
| `helios-hybrid-adaptive-run-screenshot.png` | captured manually by the user, 2026-09-28 | formal evidence (screenshot) | 2866×748 | hybrid-adaptive 3×2, showcase 800×450, 64 SPP | End-to-end run, hash `57881d257daf2474` | ✔ | in use (Fig 11) | ✔ | ✔ |
| `reflective-preview.png` (+ `.ppm`) | early preview | pilot/presentation | 400×225 | reflective, low SPP | The reflective ring | superseded by the gallery | – | – | – |
| `imbalanced-tile-heatmap.svg` | V1 pilot tile CSV | pilot (pre-fix) | 552×388 | imbalanced 256×144 | Spatial cost pattern | ✔ | in use (Fig 2) | ✔ | – |
| `scheduler-stress-tile-heatmap.svg` | V1 pilot tile CSV | pilot | 552×388 | scheduler_stress | Spatial cost pattern | – | – | – | – |
| `showcase-tile-heatmap.svg` | V1 pilot tile CSV | pilot | 940×606 | showcase | Near-uniform cost | – | – | – | – |
| `pilot-speedup.svg` | V1 pilot | pilot, superseded | 910×560 | – | Old speedup | – | – | – | – |
| `worker-stall-schedule.svg` | V1 sleep-stall experiment | pilot, superseded | 1000×310 | – | Legacy stall schedule | – | – | – | – |
| `*.ppm` smoke outputs (`sequential`, `openmp`, `mpi-*`, `hybrid-*`, `trace-smoke`, `smoke`, `mpi-smoke`, `mpi-timing-smoke`) | smoke tests | pilot | 71×43 / 48×32 / 160×90 | tiny validation renders | Nothing visually | – | – | – | – |

## 3. Report figure assets (`report/assets/`)

| Set | Files | Class | Resolution | Demonstrates | Status |
|---|---|---|---|---|---|
| `20260928T103934Z-edc10839/` | `speedup`, `efficiency`, `weak-scaling`, `scheduler-runtime`, `scheduler-imbalance`, `assignment-timeline` (in the report as Figs 5 to 10); also `batch-progression`, `scheduler-assignments`, `scheduler-paired`, `hybrid-comparison`, `openmp-strong`, `mpi-strong` plus CSV/MD tables | formal (derived) | SVG 1000 to 1100 wide | Final scaling and scheduler results | ✔ K R; dark charts with ~5 pt labels in print, so for video/GitHub a restyled version is better |
| `20260928T075743Z-cf62886e/` | the same set | historical | same | Pre-fix scheduler results | K only (historical) |
| `optimisation-ab/optimisation-ab.svg` | A/B chart | diagnostic | 1100×760 | Counter fix vs traversal fix | ✔ K R (Fig 3) V G after restyle |

## 4. Formal and historical experiment evidence (`results/protocol-v2/`)

Each run has `run.json`, `stats.json` (telemetry, worker and scheduler counters) and `tiles.csv` (per-tile worker, compute seconds, rays, node visits), plus a PPM (256×144, git-ignored). Dynamic and adaptive runs also have `trace.csv` (per assignment: worker, first tile, tile count, dispatch time, receipt time, render seconds, tiles remaining, throughput estimate at dispatch).

| ID | Design | Class | Traces | Tile CSVs | PPMs | Plots | Visual value |
|---|---|---|---:|---:|---:|---|---|
| `20260928T102644Z-100e1393` | strong scaling, medium imbalanced | **formal** | 0 | 88 | 88 | median-runtime, compute-imbalance, effective-work-imbalance | Tile-cost map (sequential tile CSVs); strong-scaling dashboard |
| `20260928T103116Z-c00a63fc` | weak scaling | **formal** | 0 | 48 | 50 | 3 | Dashboard |
| `20260928T103934Z-edc10839` | scheduler, medium, 4 scenes | **formal** | 64 | 128 | 128 | 3 | **Scheduler animation source** (static tile CSVs, dynamic and adaptive traces) |
| `20260928T104502Z-5e829d04` | large reflective holdout | **formal** | 16 | 32 | 32 | 3 | Dashboard |
| `20260928T104823Z-8e1c1ed4` | scheduler, small, 4 scenes | **formal** | 64 | 128 | 128 | 3 | Alternative traces |
| `20260928T105023Z-1dd576e1` | heterogeneity 2× | **formal** | 16 | 32 | 32 | 3 | Possible slow-worker animation |
| `20260928T063038Z-301480e3` | strong, pre-fix | historical | 0 | 88 | 88 | 3 | Historical anomaly values (4.707 s) |
| `20260928T064015Z-fd6ca303`, `…062641Z-d865a73c`, `…063756Z-d01e8d9f`, `…075743Z-cf62886e`, `…080938Z-fe56f15c` | weak / scheduler / heterogeneity / large, pre-fix | historical | 0 to 64 | yes | yes | 3 each plus per-run trace plots (`assignment-timeline`, `batch-size-over-time`, `tile-ownership`, `worker-tile-count`) | Historical only |

Counts across all of `results/`:
- 320 formal/historical V2 trace CSVs, 912 tile CSVs and 916 PPMs;
- 120 diagnostic traces, 135 diagnostic tile CSVs and 655 diagnostic PPMs;
- 171 + 207 pilot traces in `evidence/` and `raw/`.

## 5. Diagnostic evidence (`results/diagnostic/`)

| Directory | Content | Visual value |
|---|---|---|
| `counter-fix/20260928T101701Z-0de80589` | final 3-build A/B (`summary.json`: medians, per-block seconds, paired changes and intervals) | **Before/after optimisation and storyboard source** |
| `counter-fix/…094523Z`, `…095215Z`, `…100038Z` | earlier A/Bs | Storyboard context |
| `hybrid-v3/` | affinity study, placement observer, false-sharing address probes (`false-sharing-*`) | Storyboard facts (offset 16 vs 48 timings) |
| `adaptive-v3/` (4 studies, pre-fix, 3 blocks) | fixed-batch and adaptive-target sweeps with traces | Not used for final claims |
| `build-v3/` | build reproducibility | – |

## 6. Other evidence

| Asset | Class | Resolution | Visual value |
|---|---|---|---|
| `results/screenshot/showcase.json` (+ local PPM, 800×450) | formal evidence | 800×450 | Correctness wall reference hash `57881d257daf2474` |
| `results/stress/20260928T111419Z-5832e956/manifest.json`, `environment.json`, empty logs | formal evidence | – | **Stress-test card** |
| `results/calibration/20260928T061836Z-d9ba2353` and `…064407Z-eef5a771` | calibration (pre-fix) | 256×144 PPMs at 64/192/512 SPP | Only existing multi-SPP set; too small for a convergence visual |
| `results/hero.json`, `results/hero-tiles.csv` | presentation | – | Metadata for Figure 1 |
| `results/*.json`, `results/raw/`, `results/evidence/`, `results/pilot/` | pilot (V1) | 256×144 or smaller | Superseded; not used |

## 7. Diagrams and terminal evidence

| Asset | Status |
|---|---|
| Architecture | Only a text data-flow block (`docs/ARCHITECTURE.md`, report Section 3.1). **No graphical architecture diagram exists.** |
| Parallelism layers | None. |
| Terminal screenshots | One real capture (Figure 11). Tests, the validator and the CLI help have never been captured. See [`TERMINAL_EVIDENCE_CAPTURE_PLAN.md`](TERMINAL_EVIDENCE_CAPTURE_PLAN.md). |
| Validation output suitable for visuals | `validate_backends.py` (11 configurations, one hash), `helios_tests.exe`, and `verify_experiment.py` (458/458 images). All are reproducible live in seconds. |

## 8. Gaps this sprint fills

1. Only one real scene render (800×450) exists: a 1080p gallery of all six scenes is missing.
2. No convergence imagery (the calibration PPMs are 256×144 and pre-fix).
3. Scheduler behaviour is shown only as a static bar timeline: the traces support a real tile-by-tile animation.
4. Correctness is shown only as a hash list: a visual wall with thumbnails and hashes is missing.
5. The performance investigation is told only in text and tables: a storyboard is missing.
6. No architecture or parallelism-layer diagram exists.
7. The stress evidence is shown only in a table.
