# Helios Observatory: architecture

The Observatory ([assets/observatory/](../assets/observatory/README.md)) is a presentation layer. It has four stages, and data flows in one direction:

```
saved evidence (read-only)                 build time (Python)                         view time (browser, offline)
────────────────────────────               ─────────────────────────────────           ─────────────────────────────
results/protocol-v2/…       ─┐
results/diagnostic/…         │   extract_evidence.py      build_observatory.py         index.html + app.js + styles.css
results/stress/…             ├─► parse, verify, re-run ─► normalise, compose,     ─►  data/bundle.js (window.HELIOS)
results/screenshot/…         │   validators (temp dirs)   check, write data/*.json     ten section controllers
assets/showcase/…            │                                                         canvas + SVG components
git show e2c13e2:src/…      ─┘                            validate_observatory.py ─► validation.json
report/HELIOS_FINAL_REPORT.md (lookup only)
```

**The Observatory does not modify Helios measurements.** It never runs a benchmark, never rewrites an evidence file, and never writes under `src/`, `include/`, `tests/`, `results/` or `report/`. The build refuses to run if the C++ source differs from the frozen commit `e2c13e2`. The validator compares 11,214 protected files with a SHA-256 snapshot taken before the Observatory existed (`assets/observatory/provenance/pre-sprint-integrity.json`).

## 1. Evidence extraction (`scripts/observatory/extract_evidence.py`)

Every displayed measurement is parsed here. Nothing is typed in by hand; the few constants are experiment IDs and directory names.

| Output key | Exact inputs | What is derived |
|---|---|---|
| `source` | `git diff e2c13e2 -- src include tests`, `git rev-parse HEAD`, SHA-256 of `build-release/helios.exe` and `helios_mpi.exe` | frozen-source check, binary hashes |
| `scenes` | `assets/showcase/gallery/gallery.json`, `assets/showcase/convergence/convergence.json`, the PNG and PPM files they list | per-render settings, runtimes (PRESENTATION), hashes recomputed from the PPMs |
| `workload` | `results/protocol-v2/20260928T102644Z-100e1393/raw/imbalanced-medium-sequential-r1-t1-all-b{0..6}.tiles.csv`; the median-time block's `tiles.csv` of `mpi-static-r2-t1`, `mpi-static-r4-t1` and `openmp-r1-t4` (worker column) | median compute time per tile over 7 runs; ray, BVH-visit and primitive-test counters (checked identical across runs); tile ownership; 2-way and 4-way static range sums and the resulting caps |
| `scheduler` | `results/protocol-v2/20260928T103934Z-edc10839/raw/imbalanced-medium-{mpi-static-r3-t1-co-b1, mpi-dynamic-r3-t1-all-b0, hybrid-adaptive-r3-t1-all-b5}.{tiles.csv, trace.csv, stats.json}`; `src/main.cpp` (batch-size excerpt) | per-tile start and end (dispatch time + cumulative recorded compute); batches; idle gaps of 1 ms or more; per-worker busy time; validation flags |
| `hardware` | `results/stress/20260928T111419Z-5832e956/environment.json` (CPU, cores, logical processors, CPU Set table, compiler, MPI); `results/diagnostic/hybrid-v3/placement-observer-20260928T090902Z-3f8c873d/manifest.json`; `results/diagnostic/hybrid-v3/20260928T081730Z-e41d9f1c/summary.json` | SMT sibling pairs; measured per-logical-processor busy fractions and process default CPU Sets; affinity-study medians |
| `performance` | `aggregate/summary.json` and `aggregate/strong_paired.json` of the final six experiments; historical `20260928T063038Z-301480e3` and `20260928T064015Z-fd6ca303` summaries and raw `tiles.csv`/`stats.json`; `results/diagnostic/counter-fix/20260928T101701Z-0de80589/summary.json`; `results/diagnostic/hybrid-v3/false-sharing-20260928T091533Z-068e9dce/{summary.json, raw/*.run.json}` | medians, bootstrap intervals, speedups, efficiencies, paired changes, scheduler comparisons, the case-file values (per-tile efficiency, partition ideal, send times, address-probe timings, rebuild times, rays per image) |
| `validators` | `build-release/helios_tests.exe`, `scripts/validate_cli.py`, `scripts/validate_bvh.py`, `scripts/validate_backends.py`, the analysis unit tests, `scripts/verify_experiment.py` on all 12 formal experiments | pass/fail, counts and the evidence line of each layer; 916 image rehashes |
| `correctness` | `assets/showcase/correctness/backend-correctness.json` and the 7 PPMs; `results/screenshot/showcase.json` | hashes recomputed, pairwise differing-pixel counts from the raw bytes, match with the recorded end-to-end run (report Figure 13) |
| `stress` | `results/stress/20260928T111419Z-5832e956/{manifest.json, environment.json, stdout.log, stderr.log}`; the Invocation row of `docs/STRESS_TEST_PLAN.md` | elapsed time, timeout, exit, timestamps, arguments (local paths reduced to repository-relative), camera samples = width × height × SPP |
| `experiments` | `manifest.json`, `aggregate/summary.json`, `plots/*.svg` of the 12 formal experiments | the experiment browser |
| `provenance` | all of the above, plus `report/HELIOS_FINAL_REPORT.md` (text search) | six evidence chains; each claimed value is checked to appear in the report |
| `snippets` | `src/core.cpp`, `src/main.cpp` located by regex, compared with `git show e2c13e2:<file>` | seven read-only excerpts with line numbers |

Validators and hash checks write only to temporary directories. Local absolute paths are reduced to repository-relative ones before anything is stored.

## 2. Normalised JSON (`scripts/observatory/build_observatory.py`)

The build turns the extraction into one JSON file per page under `assets/observatory/data/`: `about`, `overview`, `scenes`, `convergence`, `workload`, `scheduler`, `hardware`, `performance`, `correctness`, `stress`, `provenance`, `experiments`, `defence` (the Technical Q&A) and `snippets`. The task-sheet traceability table stays an internal document (`docs/TASKSHEET_TRACEABILITY.md`) and is not part of the public page. It also writes `experiment_capsule.json`, a machine-readable summary of the source, binaries, environment, experiments, verification counts, stress result, demonstration run, report hashes and build time. Finally it writes `bundle.js`, which is the same data as a single `window.HELIOS = {…}` assignment so the page works from `file://` without `fetch`.

- **Composition, not invention.** The overview cards and the 15 Technical Q&A answers are sentences whose numbers are filled in from the extracted values at build time. Changing an evidence file changes the text; no number is written into a template by hand.
- **Guards.** The build stops if `src/`, `include/` or `tests/` differ from `e2c13e2` or if any value is NaN or Infinity.
- **Classification.** Data blocks carry FORMAL, DIAGNOSTIC, HISTORICAL, PRESENTATION or ILLUSTRATIVE labels where appropriate.

## 3. Static web interface (`assets/observatory/`)

- `index.html` holds the edge line (frozen source, platform, formal-evidence status from `about.json`), the navigation rail (a slim left rail that slides out on hover or focus), the About drawer, the trace overlay and the presentation HUD. It loads `data/bundle.js` and then `app.js`. It references no external resource; the favicon is a data URI.
- `app.js` is a single IIFE in vanilla JavaScript with no dependencies. It contains a hash router (`#section?key=value`, so every state is a deep link), one controller per section (`render`, `update`, optional `toggle` for Space and `leave` to stop animations), keyboard handling (1–9, 0, P, T, Space, ← →, Esc), presentation mode (11 curated routes in the order of the video) and recording mode (`?mode=recording`).
- `styles.css` defines the light colour and motion tokens, the six classification label styles, layouts for 1920×1080 with fallbacks at 1360 px and for phones (900 px or less), and recording and presentation modes. The visual system is described in [OBSERVATORY_VISUAL_REDESIGN.md](OBSERVATORY_VISUAL_REDESIGN.md) and `DESIGN.md`.

## 4. Visual components

| Component | Technique | Data |
|---|---|---|
| Tile grids (Workload Microscope, Scheduler Lab) | `<canvas>` 1280×720, 80 px per tile, optional render underlay | `workload.tiles`, `scheduler.policies.*.tiles` |
| Scheduler timelines and the progress chart | `<canvas>` bars per worker; SVG line chart | recorded dispatch and tile timing data |
| Worker lanes | HTML, recomputed per frame from the current time | batches, busy time, recorded rate estimate at dispatch |
| Trace inspector | HTML overlay of raw event JSON | `scheduler.policies.*.batches` / `tiles` |
| Bar and forest charts | inline SVG built by `hbars()` and `forest()` | medians, intervals, paired changes |
| Convergence viewer and loupe | `<img>` plus a 2× nearest-neighbour canvas zoom | `convergence.frames` |
| Pixel difference | canvas `getImageData` on the two PNGs, with a precomputed count as fallback for `file://` | `correctness.backends`, `pairwise_different_pixels` |
| Core map | HTML grid of physical cores and logical processors | `hardware.cores`, `hardware.placement` |
| Evidence chains | HTML stage list with file-existence and report-text checks | `provenance.chains` |
| Source inspector | escaped `<pre>` with line numbers | `snippets` (identical to `e2c13e2`) |

## 5. Validation

`scripts/observatory/validate_observatory.py` writes `assets/observatory/validation.json` (32 checks, listed in [scripts/observatory/README.md](../scripts/observatory/README.md)), and `scripts/observatory/test_observatory.py` holds 20 unit tests. Together they check the protected evidence snapshot, the frozen source, strict JSON, dead references, scheduler events against the raw traces, correctness hashes, stress values against the manifest, provenance paths, classification labels, section IDs, duplicate IDs and screenshot sizes.
