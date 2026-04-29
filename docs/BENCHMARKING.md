# Helios benchmarking: audit and protocol V2

## Audit of the inherited pilot method

The original `scripts/benchmark.py` runs real Release executables serially with a subprocess timeout. `render_wall_seconds` begins after scene construction, BVH building, camera setup, and tile creation. It ends before PPM, JSON, tile CSV, and trace CSV output. MPI ranks cross a barrier immediately before the timer; MPI scheduling, result transfer, gathering, and coordinator waiting are within it. Separate `process_wall_seconds` includes MPI process startup, setup, rendering, and file output. Both values remain in raw records. No process or thread affinity is set.

The pilot runner can do warm-ups, but defaults to zero. It repeats each backend consecutively; `--shuffle-seed` shuffles non-sequential modes **once per workload**, leaving their order unchanged across repetitions. Its aggregate reports median, mean, range, sample standard deviation, and a Student-t interval around the **mean** for 5–20 runs. That interval is not an interval around the primary median. Pilot speedup divides sequential median by condition median; its `ranks × threads` efficiency denominator counts the coordinator even when dynamic MPI rank 0 renders no tiles. The current worker ratio is `max assigned work / mean active assigned work`, including injected stall; it is not a pure compute imbalance measure. MPI timing records time *inside blocking MPI calls*, including waiting for a peer. Pure network transfer and scheduler overhead are not isolated.

Each pilot invocation uses a unique directory under `results/raw`, writes command/stdout/stderr/exit code and renderer JSON per run, and preserves failed records. The aggregate omits failures; the manifest counts them and the command exits nonzero. Several pilot snapshots are versioned in `results/evidence`; all old evidence is retained. The inherited `scripts/analyse_results.py`, `scripts/plot_results.py`, and `docs/BENCHMARKING.md` did not exist. The old files and numbers are **protocol V1 pilots** and must not be pooled with V2.

The renderer has no mutex or shared RNG in its ray loop. Each pixel uses a deterministic seed derived from its coordinates and global seed. Tile counters are thread local in the hybrid path. OpenMP uses a single parallel region over tiles for its local backend; hybrid rendering uses a parallel region within each assigned tile. There is no nested OpenMP path. Trace records are accumulated in memory during the timed MPI schedule; CSV writing occurs afterward. Image I/O is outside the timer. Static MPI rank 0 renders and then gathers, while dynamic rank 0 coordinates without rendering; naive same-rank-count scheduler comparisons therefore have different rendering capacity. V2 adds an explicit static coordinator-only mode for controlled scheduler comparisons.

## Calibrated presets

`scripts/calibrate_benchmarks.py` ran bounded sequential probes on the Release binary on 2026-09-28. Source calibration ID: `20260928T061836Z-d9ba2353`, under `results/calibration/`. These are sizing observations, **not** formal performance samples. All use scene `imbalanced`, 256×144 pixels, depth 8, tile 16, seed 42, BVH enabled.

| Preset | Samples/pixel | Observed render time |
| --- | ---: | ---: |
| small | 64 | 2.3070 s |
| medium | 192 | 6.1462 s |
| large | 512 | 16.6450 s |

The presets hold image memory constant and increase sampling work. Other scenes can have different times. A fourth very-large preset is deferred until bounded calibration supports it.

## Benchmark protocol V2

1. Build with `scripts/build.ps1 -Configuration release`. The manifest records executable SHA-256, Git SHA, dirty Git status, source hashes, compiler version, operating system, CPU model, logical processor count, and physical RAM. Physical core count is documented separately in `docs/ENVIRONMENT.md` from the CPU model specification; it was not directly queried. A later rebuild from the same source yielded different PE executable hashes, so the manifest identifies the exact tested binaries but byte-identical rebuilding is not established.
2. Fix scene, resolution, samples/pixel, depth 8, seed 42, tile 16, BVH, and image semantics within each strong-scaling or scheduler comparison. The runner compares final image hashes against sequential at the same scene/SPP. Weak scaling changes SPP by design; the runner renders separate same-SPP sequential references at 2× and 4× work and excludes them from weak timing statistics.
3. Run one warm-up per condition and seven measured blocks by default. Fewer measured blocks require `--pilot`; these receive a pilot classification and default to `results/pilot/protocol-v2/`, physically separate from final-candidate runs. Runs execute one at a time, with a per-process timeout and experiment wall budget. On Windows a timeout requests termination of the launched MPI process tree; the nonzero run remains in raw evidence.
4. For every warm-up and measured block, shuffle all conditions using the recorded order seed plus deterministic block and scene offsets. This reduces fixed position bias. Reproducing the order does not reproduce OS scheduling, thermals, or clocks.
5. Record each exact command, stdout, stderr, exit code, process wall time, stats JSON, tile CSV, trace CSV where available, and PPM in a unique `results/protocol-v2/<experiment-id>/raw/` directory. Never merge protocols or overwrite historical run directories. The manifest records completion/failure. Failures remain in raw JSON and in analysis counts, and are excluded from timing statistics.
6. Report median renderer wall time as the primary statistic, with mean, sample standard deviation, min, and max. `scripts/analyse_results.py` derives a 95% percentile bootstrap interval for the **median** with 4,000 deterministic resamples when at least seven valid measured runs exist. This is an approximate descriptive interval; serial runs on one laptop may be correlated by temperature and background activity. A pilot or incomplete run receives no CI.
7. Strong speedup is `sequential median / condition median`. Efficiency divides by **rendering slots**: OpenMP threads; static MPI rendering ranks × threads; dynamic MPI worker ranks × threads, excluding coordinator rank 0. The static scheduler ablation uses `--coordinator-only` so all three policies have three total ranks, two rendering ranks, and one thread/rank. It still measures differing coordinator implementations, which is part of the policy cost.
8. Weak scaling raises SPP in proportion to rendering slots while holding scene and image constant. Its metric is `one-slot baseline median / scaled-condition median`, called single-host weak efficiency. It is not cluster weak scalability or strong speedup. SMT runs at eight logical threads should be labeled separately from four physical-core targeted runs.
9. Compute imbalance is `max active worker compute seconds / mean active worker compute seconds - 1`, so zero is mathematically balanced. Effective-work imbalance uses `compute + injected stall` in the same formula. The synthetic delay is also recorded separately as `stall_seconds`. Coordinator result-wait and maximum blocking-send fractions are descriptive MPI-call occupancy, **not** pure network or scheduler-overhead fractions. The new `scheduler` JSON object records assignment batch statistics, worker assignment-receive iterations and wait, coordinator handling, batch-boundary 90%-completion tail, and per-worker final completion times. The `worker_requests` field names receive-loop iterations, including termination; workers send no explicit request packet. Coordinator handling includes blocking receipt of payloads and is not CPU-only overhead. The 90% tail can collapse to nearly zero when one coarse batch crosses the threshold and must be interpreted with last-worker spread. Pure scheduling overhead remains unisolated.
10. A formal result is a **final candidate**, not an automatic scientific conclusion. Interpret it only after checking all failures, hashes, repetitions, order, warm-ups, trace overhead, and run-to-run variation. No claim of adaptive superiority is assumed.

## Experiment groups and resource accounting

- `scheduler`: sequential plus static coordinator-only, fixed one-tile dynamic, and throughput-based adaptive; all MPI conditions use three ranks and two rendering slots. Run separately on `uniform`, `imbalanced`, `reflective`, and `scheduler_stress` when practical.
- `heterogeneity`: the same matrix on `scheduler_stress`; rank 1 can be slowed by `--slow-factor-milli` (1000 is control; 1500, 2000, 3000 are candidate treatments). This is a **SYNTHETIC HETEROGENEOUS-WORKER EXPERIMENT**, not a natural-scene result. The delay actively spins after each tile until it approximately equals `(factor - 1) × measured tile render duration`. Its actual duration is recorded as `stall_seconds`. It consumes CPU on the same host and may perturb other ranks, so measured factor and wall effects must be checked. The old `--slow-us` sleep remains available solely for historical pilots.
- `strong`: sequential; OpenMP 1/2/4/8 threads; static MPI 1/2/4 ranks; hybrid static 1×4, 2×2, 4×1. OpenMP 8 is an SMT/logical-processor experiment. One MPI rank includes rank 0 rendering. The 4-slot configurations can be compared directly, subject to backend overhead.
- `weak`: sequential one slot; OpenMP 2/4, MPI 2/4, and hybrid 2×2, with SPP proportional to slots. On this host only. Separate, excluded sequential image references validate each scaled SPP.

Adaptive defaults are fixed in `src/main.cpp`: throughput estimate is an exponential update with equal weight on the new observed rate, target assignment duration 50 ms, initial batch two tiles, maximum batch eight, and a remaining-work fairness cap. This setting predates V2 and remains the frozen setting across V2 scenes. Fixed dynamic uses one tile per assignment. No scene-specific tuning is applied.

The 2026-09-28 medium diagnostic work is in `results/diagnostic/adaptive-v3/`, physically separate from final V2 evidence. It measured fixed batches 1/2/4/8/16/32 and a small adaptive target/initial-size sensitivity. The default adaptive algorithm was retained; see [policy audit](ADAPTIVE_POLICY_AUDIT.md) and [frozen candidate](FROZEN_EVALUATION_CANDIDATE.md). `benchmark_v2.py --trace-mode diagnostic` saves per-assignment traces; `--trace-mode normal` keeps low-cost scalar telemetry without in-memory assignment records. The controlled three-block trace study did not establish a consistent overhead direction, so the frozen formal run uses diagnostic trace mode for full preservation and reports that choice in its manifest. Both modes write tile CSV and PPM after timed rendering.

For block-randomized scheduler experiments, the current analysis computes three per-block pairs: fixed/static, adaptive/static, and adaptive/fixed. It reports median `candidate/reference − 1`, 4,000-resample paired percentile bootstrap 95% intervals (at least seven valid blocks), and median absolute candidate-minus-reference seconds with intervals. A confidence interval containing zero means no clear difference was established; it is not an equivalence test. These comparisons use matched blocks, not overlapping separate-condition intervals.

## Build and result integrity

`CMakeLists.txt` references the current `src/core.cpp`, `src/main.cpp`, and `tests/tests.cpp`, discovers OpenMP and MPI optionally, and registers the existing Python validation scripts and benchmark-analysis test with CTest. This is a static consistency audit, not a successful CMake build. `scripts/check_environment.ps1` reports GCC, MPI tools, Python, and CMake/CTest availability. On this host the PowerShell Release build and direct tests are verified; CMake/CTest remain locally unverified because their executables are unavailable.

`scripts/verify_experiment.py` checks the manifest's condition/block matrix, raw record count, file presence, embedded JSON against saved JSON, and each available local PPM's pixel bytes against the renderer's FNV-1a hash. PPMs are preserved locally and ignored by Git to avoid committing every image; JSON, traces, tile CSVs, aggregates, and plots can be versioned. Re-cloning the repository without local PPMs yields zero image-byte checks, but the per-run renderer hashes and cross-backend validation results remain recorded. The verifier reports how many PPMs it actually checked.

## Reproduction

```powershell
./scripts/build.ps1 -Configuration release
python scripts/calibrate_benchmarks.py --scene imbalanced --timeout 40 --max-total-seconds 75
python scripts/benchmark_v2.py --experiment scheduler --scene imbalanced --preset small --repeats 7 --warmups 1 --order-seed 20260928 --timeout 45 --max-total-seconds 300
python scripts/analyse_results.py results/protocol-v2/<experiment-id>
python scripts/verify_experiment.py results/protocol-v2/<experiment-id>
python scripts/plot_aggregate.py results/protocol-v2/<experiment-id>
python scripts/plot_results.py results/protocol-v2/<experiment-id>/raw/<specific-dynamic-run>.run.json
```

Frozen medium evaluation `20260928T075743Z-cf62886e` used:

```powershell
python scripts/benchmark_v2.py --experiment scheduler --scene imbalanced --scene reflective --scene scheduler_stress --scene uniform --preset medium --repeats 7 --warmups 1 --order-seed 20260928 --trace-mode diagnostic --timeout 60 --max-total-seconds 1200
python scripts/analyse_results.py results/protocol-v2/20260928T075743Z-cf62886e
python scripts/verify_experiment.py results/protocol-v2/20260928T075743Z-cf62886e
python scripts/make_report_assets.py --scheduler-dir results/protocol-v2/20260928T075743Z-cf62886e --trace-run results/diagnostic/adaptive-v3/20260928T073928Z-ca32eece/raw/imbalanced-adaptive-50-b0.run.json
```

The verifier checked all 128 local PPM pixel byte streams with zero errors. The report asset script generated twelve parsed SVGs plus raw-derived Markdown/CSV tables; its trace plots are labeled diagnostic.

The separate large reflective holdout used the same frozen binaries and parameters and completed 32/32 records with 32 independently matched PPM hashes:

```powershell
python scripts/benchmark_v2.py --experiment scheduler --scene reflective --preset large --repeats 7 --warmups 1 --order-seed 20260928 --trace-mode diagnostic --timeout 90 --max-total-seconds 900
python scripts/analyse_results.py results/protocol-v2/20260928T080938Z-fe56f15c
python scripts/verify_experiment.py results/protocol-v2/20260928T080938Z-fe56f15c
```

The V2 runner records deterministic block position and process-wall duration but did not write a UTC start timestamp into each run JSON. `scripts/capture_run_timestamps.py` was meant to preserve the local `.run.json` modification times as approximate run-end timestamps. The two files it wrote, `aggregate/observed_run_file_timestamps.csv` for `20260928T075743Z-cf62886e` and `20260928T080938Z-fe56f15c`, are **not valid chronology**: all 128 (respectively 32) mtimes fall within 0.048 s (0.017 s), although the runs took many minutes. The raw records were evidently rewritten together after the runs. They are kept unchanged but must not be used for drift analysis, and the script now refuses to write such a file. The only ordering evidence for these experiments is the recorded block and position order. No cooldown was added, and no temperature was measured. Block-randomized order and block-paired statistics are the drift controls, and late-block slowdowns are described as possible temporal or system drift, not thermal throttling.

The frozen performance source is `e2c13e2`. Strong and weak scaling were rerun on it with the historical parameters:

```powershell
python scripts/benchmark_v2.py --experiment strong --scene imbalanced --preset medium --repeats 7 --warmups 1 --order-seed 20260929 --timeout 60 --max-total-seconds 600
python scripts/benchmark_v2.py --experiment weak --scene imbalanced --preset small --repeats 7 --warmups 1 --order-seed 20261001 --timeout 45 --max-total-seconds 450
```

Each was followed by `analyse_results.py`, `verify_experiment.py`, `plot_aggregate.py`, and, for strong, `compare_strong_scaling.py --historical results/protocol-v2/20260928T063038Z-301480e3`.

Since `9524144`, the runner reads Git through a per-command `safe.directory`, because this checkout's `.git` belongs to another local account. A formal (non-pilot) run refuses to start if it cannot record the SHA. For strong-scaling experiments, `python scripts/compare_strong_scaling.py results/protocol-v2/<id> [--historical results/protocol-v2/<old id>]` adds block-paired condition comparisons with bootstrap intervals to that experiment's `aggregate/`. A historical experiment is listed only as unpaired medians.

The experiment ID is printed by the runner. Normal output is written under `results/protocol-v2`; calibration output is separate. The V1 pilot runner remains available for historical reproduction but is not the V2 data source.
