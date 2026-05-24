# Demonstration video plan (SIT315 M4.T1D)

Status: **planned, not recorded.** The spoken script is in [VIDEO_SCRIPT.md](VIDEO_SCRIPT.md), and the before, during and after checks are in [VIDEO_RECORDING_CHECKLIST.md](VIDEO_RECORDING_CHECKLIST.md).

Target length: **about 12:40** (13 segments). That clears the 10-minute minimum with margin and stays under 13 minutes. Narration is about 1,550 words at a relaxed pace, plus the time spent on the live demo.

**The primary visual interface is the Helios Observatory** (`assets/observatory/`, see [assets/observatory/README.md](../assets/observatory/README.md)). The shape of the video is:

> Observatory → short source-code proof (VS Code) → live terminal demo → Observatory → conclusion

and no longer PDF → VS Code → chart → terminal → PDF. The report PDF is not shown on screen; every table value the video quotes is also on an Observatory page, which reads it from the same evidence files.

Ground rules:
- The report, DOCX and PDF are final. The video does not change them.
- No formal benchmark is rerun and the 600-second stress test is **not** rerun. Every result comes from recorded evidence through the Observatory, which only reads saved files.
- The live part runs `scripts/helios_demo.ps1`: frozen-source check, core tests, the 11-configuration backend validator, a `hybrid-adaptive` render and a sequential render with the same settings, an independent hash comparison and a PNG. Outputs go to `%TEMP%\helios-demo`; committed evidence is never written.
- Live timings are one-off runs, not benchmarks, and are introduced as such.
- The Observatory runs in **recording mode** (larger text; the navigation rail stays hidden until the pointer reaches the left edge) and the **Guided Tour** (presentation mode: ← → step through the 11 items below; a thin progress line and the label at the bottom right, such as `01 / 11 · Hero`, show the position). "O3" means tour item 3.

## Guided Tour items (Observatory, recording mode + Guided Tour)

| Item | Route (deep link) | Page |
|---|---|---|
| O1 | `#overview` | Hero montage of real renders and the FORMAL evidence strip (2.97× leads) |
| O2 | `#render?autoplay=1` | Render Lab: convergence 1 to 256 SPP (autoplays) |
| O3 | `#hardware?config=layers` | Hardware & Hybrid: parallelism layers (image → tiles → ranks → threads → samples → rays) |
| O4 | `#workload?overlay=4` | Workload Microscope: measured tile costs with the 4-way static partition |
| O5 | `#scheduler?policy=compare&t=0&play=1` | Scheduler Lab: static, dynamic and adaptive replayed side by side (plays) |
| O6 | `#performance?view=speedup` | Performance Lab: strong-scaling speedup |
| O7 | `#performance?view=case` | Performance Lab: hybrid anomaly case file |
| O8 | `#correctness` | Correctness wall, live pixel difference, validation stack |
| O9 | `#stress` | Stress & Limits |
| O10 | `#provenance?panel=chains&chain=strong` | Provenance: evidence chain for the 2.97× claim |
| O11 | `#overview?panel=close` | Closing frame: HELIOS on the reflective render, the technology line and frozen source `e2c13e2` |

Segments 6 and 7 (code and terminal) happen between O5 and O6: Alt+Tab away from the browser and back, then press → to continue.

## Segment breakdown

| # | Time | Topic (task items) | Window | What is shown |
|---|---|---|---|---|
| 1 | 0:00 to 0:40 | Introduction and problem (1) | Observatory O1 | Hero montage, the edge line at the top right (frozen e2c13e2, i7-11370H 4C/8T, formal evidence VERIFIED), evidence strip |
| 2 | 0:40 to 1:30 | Why Monte Carlo ray tracing is expensive (2) | O2 | Convergence autoplay (9 real renders, only SPP changes); click the image to move the 2× loupe; scroll to the ILLUSTRATIVE pipeline, click *BVH traversal* |
| 3 | 1:30 to 2:30 | Architecture and hybrid layers (3) | O3 | Parallelism layers; then tabs *OpenMP 4*, *MPI 4×1*, *Hybrid 2×2* (processes and threads on 4 cores / 8 logical processors) |
| 4 | 2:30 to 3:30 | Irregular workload and the static cap (2, 12) | O4 | Tile 74 = 80.4 ms vs tile 0 = 2.4 ms (33.7×); the four static ranges; histogram; *Why static partitions cap the speedup* (1.23× and 2.34×) |
| 5 | 3:30 to 5:00 | Static, dynamic and adaptive scheduling (7, 8, 10, 13, 14) | O5 | Compare replay; then *Static partition* (RECONSTRUCTED label), *Fixed dynamic* worker lanes, *Adaptive batching* (batch sizes, "How adaptive batching decides"); press **T** for the raw trace rows |
| 6 | 5:00 to 6:00 | Source-code proof (4 to 10) | VS Code | `core.cpp` 340, 241, 248; `main.cpp` 127, 212 to 213, 273, 190, 173 to 175 |
| 7 | 6:00 to 7:15 | **Live end-to-end demo and correctness (11, 19)** | Terminal | `scripts/helios_demo.ps1 -NoOpen`, then open the PNG |
| 8 | 7:15 to 8:20 | Strong scaling and scheduler results (12, 13, 14) | O6 | Speedup bars and the 2.34× cap line; click *OpenMP 8* (CI, efficiency 0.37); *Scheduler* tab (dynamic vs static, adaptive vs fixed) |
| 9 | 8:20 to 9:45 | Hybrid anomaly, false sharing, BVH allocation, effect of fixes (15 to 18) | O7 | Case file steps with classifications; HISTORICAL/FINAL toggle; *Code ↔* on the FIX step (frozen `Scene::hit` excerpt); *Optimisation A/B* tab |
| 10 | 9:45 to 10:30 | Correctness (19) | O8 | Seven backends, one hash; *Compare* Sequential vs Hybrid adaptive: 0 differing pixels; validation stack |
| 11 | 10:30 to 11:20 | Stress test DNF and limitations (20, 21) | O9 | 600.34 s figure and DNF, recorded commands, the four outcomes, validity constraints and mitigations |
| 12 | 11:20 to 12:00 | Provenance (supports 12 and 19) | O10 | Evidence chain source → binary → experiment → raw → verify → aggregate → plot → report; *Experiment browser* |
| 13 | 12:00 to 12:40 | Conclusion (22) | O11 | Closing frame; stop recording |

**The live demo starts at about 6:00**, the first command in segment 7.

## Window switching

| From | To | When |
|---|---|---|
| Observatory O1 to O5 | VS Code | At 5:00 (segment 6). |
| VS Code | Terminal | At 6:00 (segment 7). An image viewer opens briefly at about 7:00. |
| Terminal | Observatory, press → for O6 | At 7:15 (segment 8). Stay in the Observatory to the end. |

Only two switches away from the Observatory, and both return to it.

## Live commands (copy-paste, PowerShell, repository root)

Off camera, before recording (see the checklist): run the demo once so MPI is warm and the binaries are confirmed, then clear the window.

```powershell
# PowerShell, at the repository root
powershell -ExecutionPolicy Bypass -File scripts/helios_demo.ps1 -NoOpen
Clear-Host
```

On camera, segment 7:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/helios_demo.ps1 -NoOpen
```
```powershell
Invoke-Item "$env:TEMP\helios-demo\hybrid-adaptive.png"
```

Expected output, from dry runs on 2026-09-29 with the frozen binaries (`helios.exe` `956685fb…`, `helios_mpi.exe` `0313fe16a502…`), about 9 s in total:

| Step | Expected | Point at |
|---|---|---|
| [1/7] Frozen source check | `src/, include/, tests/ identical to e2c13e2` | no source change since the frozen commit |
| [2/7] Release binaries | `helios.exe SHA-256 956685fbc2b7b314... = binary used for the formal experiments` | same binary as the formal evidence |
| [3/7] Core tests | `All Helios core checks passed` | the pass line |
| [4/7] Backend validator | 11 lines with hash `62e03422975cb8a6`, 5 `tiny-*` lines with `d7bfe87ec0142fbb`, then `Validated 11 backend configurations` | one hash for every backend |
| [5/7] hybrid-adaptive render | `Rendered 800x450 scene=showcase backend=hybrid-adaptive ranks=3 threads=2 time=≈1.5 s hash=57881d257daf2474 …` | `ranks=3 threads=2`, `hash=` |
| [6/7] sequential render | `… backend=sequential ranks=1 threads=1 time=≈4.6 s hash=57881d257daf2474 …` | same hash, longer time |
| [7/7] independent check | both `renderer hash … recomputed … OK`, `pixel bytes identical: YES (360,000 pixels)`, `matches the recorded showcase hash 57881d257daf2474: YES`, then the green RESULT line | the recomputed hashes and YES |
| PNG | the 800×450 showcase render (diffuse, glass and metal spheres) | three materials and the area light |

The hash `57881d257daf2474` is also the one in the report's Figure 13 screenshot (2026-09-28) and Figure 5 and on the Observatory Correctness page.

Fallback if the script fails on camera: say so, then run the individual commands in [VIDEO_RECORDING_CHECKLIST.md](VIDEO_RECORDING_CHECKLIST.md) (section *Manual fallback*), or show the recorded run (Provenance → claim *End-to-end hybrid-adaptive run*), stated honestly as the recorded run from 2026-09-28.

## Code sections (segment 6 only)

| File | Lines | Point at | Why |
|---|---|---|---|
| `src/core.cpp` `render_tile` | 320 to 358 | **340** `Rng rng{mix64(seed^mix64(pixel)^mix64(sample))}` | Determinism: the image does not depend on who renders a pixel |
| `src/core.cpp` `Scene::hit` | 229 to 259 | **241** `int stack[max_traversal_stack]`, 248 box test skips the subtree | BVH traversal and the allocation fix |
| `src/main.cpp` `run_local` | 127 | `#pragma omp parallel for schedule(runtime)` | OpenMP across tiles |
| `src/main.cpp` `run_mpi` static | 212 to 213 | `begin`, `end` = tiles × r / R | Contiguous static partition |
| `src/main.cpp` coordinator | **273** | `MPI_Recv(... MPI_ANY_SOURCE ...)` | Whoever finishes gets the next batch |
| `src/main.cpp` `render_assigned` | 190 | `is_hybrid(o.backend)?o.cfg.threads:1` | Hybrid = same protocol, threads inside a tile |
| `src/main.cpp` `batch_size` | 169 to 175 | 173 target 50 ms, clamp 1 to 8; 174 fairness | The adaptive policy |

The same excerpts are in the Observatory Source Inspector (Provenance → Source inspector), checked there against commit `e2c13e2`.

## Observatory evidence behind each segment

| Segment | Observatory data | Evidence |
|---|---|---|
| 1, 13 | `overview.json` | formal strong scaling `20260928T102644Z-100e1393`, validation stack, stress manifest |
| 2 | `convergence.json`, `scenes.json` | 9 presentation renders (PRESENTATION), hashes recomputed |
| 3 | `hardware.json` | Windows CPU Set table from the stress environment record; configurations are ILLUSTRATIVE mappings |
| 4 | `workload.json` | tile CSVs of the 7 sequential runs in `20260928T102644Z-100e1393` (FORMAL) |
| 5 | `scheduler.json` | median-time runs of `20260928T103934Z-edc10839`: dynamic and adaptive from `trace.csv` + `tiles.csv` (FORMAL); static RECONSTRUCTED from recorded tile times |
| 8 | `performance.json` | strong, weak and scheduler aggregates of the final six experiments |
| 9 | `performance.json` (`case`, `ab`) | historical `20260928T063038Z-301480e3`, diagnostic A/B `20260928T101701Z-0de80589`, false-sharing probe and placement runs (DIAGNOSTIC) |
| 10 | `correctness.json` | 7 presentation renders, one hash, recomputed; validators re-run at build |
| 11 | `stress.json` | `results/stress/20260928T111419Z-5832e956/` |
| 12 | `provenance.json`, `experiments.json` | six evidence chains, 12 formal experiments |

## Windows to have open before recording

1. **Observatory** (Edge, full screen with F11): `python scripts/observatory/serve.py --recording` opens `http://127.0.0.1:8315/assets/observatory/index.html?mode=recording`. Press **P** (or click **Guided Tour**) to start the tour on O1.
2. **VS Code**, repository folder, tabs `src/core.cpp` and `src/main.cpp`. Editor font 18 to 20 px, minimap off, word wrap on, sidebar hidden.
3. **PowerShell** (Windows Terminal) at the repository root, font 18 to 20 pt, the off-camera demo already run and the window cleared.
4. Nothing else visible: close chat and email, turn on Focus/Do Not Disturb.

The previous presenter page (`assets/showcase/video-presenter.html`) and the PDF are no longer needed on screen. The presenter stays available as a backup for the two videos it plays (convergence, scheduler comparison) if the browser misbehaves.
