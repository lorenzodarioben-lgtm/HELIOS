# Portfolio showcase plan

How to present Helios in a portfolio or CV without overstating it. Every number below comes from the formal evidence (Protocol V2, frozen source `e2c13e2`, one 4-core / 8-thread laptop) and appears in the final report and the Observatory.

## Headline

**Helios: an adaptive hybrid distributed rendering engine (C++20, MPI + OpenMP) for studying parallel scheduling**

## One-sentence summary

Helios is a C++20 CPU ray-tracing engine for Monte Carlo light transport that renders a bit-identical image through seven execution backends (sequential, OpenMP, static and dynamic MPI, and three hybrid MPI + OpenMP modes including throughput-adaptive batching), built to measure how scheduling strategies cope with an irregular rendering workload.

## Resume bullets (pick 3 to 5)

- Built a C++20 distributed ray-tracing engine with a BVH and seven parallel backends (OpenMP, MPI static and dynamic, hybrid MPI + OpenMP with adaptive batching). All seven share one tile kernel and produce **byte-identical images**, verified by hash across 458/458 formal benchmark images.
- Implemented an MPI coordinator/worker scheduler with on-demand tile dispatch. It was **27.5 to 31.8% faster than static partitioning** on every natural-scene test, and it cut compute imbalance between workers from 45–59% to under 0.6%.
- Designed a benchmark protocol with warm-up runs, seven randomised blocks per condition, paired bootstrap confidence intervals and independent image-hash verification. I kept superseded results labelled rather than deleting them.
- Investigated a 43% hybrid slowdown with measurements instead of assumptions. This found false sharing on per-thread counters and a heap allocation on every BVH query (about 17 million per image). Fixing them made the sequential renderer **44.6% faster** in a randomised A/B, with pixels and counters unchanged.
- Built an offline evidence explorer (Python and vanilla JavaScript). It replays recorded MPI scheduling traces, traces every headline number back to its raw files and source commit, and validates itself against the evidence.

Keep the platform qualifier wherever a speedup appears: "2.97× over sequential with 8 OpenMP threads on a 4-core laptop".

## Technical stack

**Core (the engine):** C++20 · MPI (Microsoft MPI 10.1) · OpenMP · g++ 14 (MSYS2) · CMake build definition (provided; the measured builds used the PowerShell g++ build script).

**Supporting tooling:** Python (benchmark protocol, statistics, validators, evidence extraction) · HTML/CSS/vanilla JavaScript (the Observatory) · PowerShell (build, supervised stress run, one-click demo).

The engine is about 1,000 lines of C++ in `src/`, `include/` and `tests/`. The Python and web tooling support it and should never lead a description of the project.

## Key quantified outcomes (formal, frozen source)

| Outcome | Value | Evidence |
|---|---|---|
| Strong scaling, 8 OpenMP threads | 2.97× over sequential (3.933 s → 1.323 s); efficiency 0.37 per logical processor | `20260928T102644Z-100e1393` |
| Four-slot layouts | OpenMP 4: 1.93×, MPI 4: 1.95×, hybrid 1×4: 2.45× (above the 2.34× cap of an equal 4-way tile split) | same |
| Workload irregularity | 33.7× spread between the cheapest and most expensive of 144 tiles | same, tile CSVs |
| Dynamic vs static scheduling | 27.5% to 31.8% faster on all 9 natural-scene cases | scheduler experiments |
| Adaptive vs fixed dynamic | 28 to 100 assignments instead of 144; no consistent time difference (8 of 10 intervals include zero) | scheduler experiments |
| Optimisation (diagnostic A/B) | sequential −44.62%, hybrid 2×2 −53.36% with both fixes; identical pixels and counters | `20260928T101701Z-0de80589` |
| Correctness | 7 backends, one hash; 458/458 formal images verified; 11-configuration backend validator | validators, `verify_experiment.py` |
| Stress requirement | controlled DNF at 600.34 s (1.89 billion camera samples, single thread) | `20260928T111419Z-5832e956` |

Do not claim cluster scalability, GPU acceleration, real-time rendering or a production renderer. All MPI runs were on one host through shared memory.

## Best visual assets

| Use | Asset |
|---|---|
| Cover / social preview | `assets/showcase/branding/helios-github-header.png`, `assets/showcase/hero/helios-hero-wide.png` |
| Hero render | `assets/showcase/gallery/reflective-hero.png` (presentation render, 1024 SPP) |
| The scheduling story | `assets/observatory/screenshots/scheduler-compare.png`; `assets/showcase/scheduler/scheduler-comparison.mp4` |
| Workload irregularity | `assets/observatory/screenshots/workload-microscope.png` |
| Performance | `assets/showcase/performance/helios-performance-dashboard.png`; `assets/observatory/screenshots/performance-lab.png` |
| Engineering story | `assets/observatory/screenshots/performance-case.png`; `assets/showcase/performance/optimisation-before-after.png` |
| Correctness | `assets/observatory/screenshots/correctness.png` |
| Rigour and provenance | `assets/observatory/screenshots/provenance.png` |
| Motion | `assets/showcase/video/helios-showcase-reel.mp4`; the recorded video, once made |

## Suggested case-study structure

1. **Problem**: Monte Carlo ray tracing is embarrassingly parallel per pixel but irregular per tile; equal splits waste cores. (Workload Microscope screenshot)
2. **Design**: one deterministic tile kernel, seven backends that only decide who renders which tile and when; per-sample RNG makes the image independent of the schedule. (architecture diagram)
3. **Scheduling**: static vs coordinator/worker dynamic vs adaptive batching, with the recorded trace replay. (Scheduler Lab screenshot or clip)
4. **Measurement method**: Protocol V2, randomised blocks, paired bootstrap, hash verification, frozen source. (Provenance screenshot)
5. **Results**: strong and weak scaling, scheduler comparison, with the single-laptop caveat. (dashboard)
6. **The investigation**: the hybrid anomaly, false sharing, the per-query allocation, the A/B and what stayed unexplained. (case-file screenshot)
7. **Correctness and limits**: the one-hash wall, the DNF stress run, the validity constraints.
8. **What I would do next**: a real multi-node cluster, non-blocking MPI, a SAH BVH, tile-size studies.

Link the report PDF, the repository and the video. Keep the "presentation render" and "formal result" wording on captions.
