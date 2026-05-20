# Table index: `HELIOS_FINAL_REPORT.md`

Every numeric value was copied from the listed source and cross-checked against the raw aggregate on 2026-09-28. Paths are relative to the repository root.

| Table | Title | Source data | Experiment ID | Notes |
|---|---|---|---|---|
| 1 | Execution backends | `src/main.cpp`, `docs/ARCHITECTURE.md` | none (source code) | Structural description |
| 2 | Correctness and validation layers | `tests/tests.cpp`, `scripts/validate_*.py`, `tests/test_benchmark_analysis.py`, `scripts/verify_experiment.py` | Frozen-source verification recorded in `HANDOFF.md` and `docs/TASKSHEET_TRACEABILITY.md` | Counts: 12 CLI cases, 6 BVH scenes, 11 backend configurations, 4 analysis tests, 458 formal images |
| 3 | Historical four-slot results | `results/protocol-v2/20260928T063038Z-301480e3/aggregate/summary.csv`; paired values from `scripts/compare_strong_scaling.py` applied to that run's raw records | `20260928T063038Z-301480e3` | **Historical, pre-fix**; this is the anomaly that started the investigation |
| 4 | Hypotheses tested | `docs/HYBRID_TOPOLOGY_AUDIT.md`, `results/diagnostic/hybrid-v3/`, `results/diagnostic/counter-fix/` | Diagnostic IDs listed in Table 14 | Diagnostic, not formal |
| 5 | Optimisation A/B results | `results/diagnostic/counter-fix/20260928T101701Z-0de80589/summary.json` | `20260928T101701Z-0de80589` | Diagnostic, 121 records, all hashes and counters matched; plotted as Figure 6 |
| 6 | Measured environment | `docs/ENVIRONMENT.md`; `results/stress/20260928T111419Z-5832e956/manifest.json` and `environment.json`; cache row from `GetLogicalProcessorInformation`, queried 2026-09-28 | none | Physical cores from the CPU Set table and `Win32_Processor`; 64-byte cache lines at L1 to L3 |
| 7 | Workload presets | `scripts/benchmark_v2.py` (`PRESETS`); `docs/BENCHMARKING.md` | none | Camera samples = width × height × SPP |
| 8 | Built-in scenes | `src/core.cpp` (`make_scene`) | none (source code) | |
| 9 | Final strong scaling | `results/protocol-v2/20260928T102644Z-100e1393/aggregate/summary.csv` | `20260928T102644Z-100e1393` | **Final**; medians, intervals, `S_p`, `E_p` and imbalance rechecked against `summary.json` in the audit |
| 10 | Final paired strong comparisons | `results/protocol-v2/20260928T102644Z-100e1393/aggregate/strong_paired.md` and `.json` | `20260928T102644Z-100e1393` | **Final** |
| 11 | Final weak scaling | `results/protocol-v2/20260928T103116Z-c00a63fc/aggregate/summary.csv`; historical column from `20260928T064015Z-fd6ca303` | `20260928T103116Z-c00a63fc` | **Final**; historical column is labelled |
| 12 | Final scheduler results | `aggregate/summary.json` (`paired_scheduler_comparisons`, `median_assignment_count`) of each experiment | `20260928T103934Z-edc10839`, `20260928T104502Z-5e829d04`, `20260928T104823Z-8e1c1ed4`, `20260928T105023Z-1dd576e1` | **Final**; all 30 paired values rechecked in the audit |
| 13 | Stress-test evidence | `results/stress/20260928T111419Z-5832e956/manifest.json`, `stdout.log`, `stderr.log`, `environment.json` | `20260928T111419Z-5832e956` | **Final**; the manifest is unedited runner output |
| 14 | Evidence map | Experiment directories under `results/` | All | Final, diagnostic and historical rows are marked; includes the correctness-validation row (458/458 images re-verified on 2026-09-28) |

Derived values quoted in the prose, not in tables:
- **Static partition caps (1.23×, 2.34×) and per-tile efficiencies (0.74, 0.80, 0.52, 0.43):** computed from the sequential and parallel `*.tiles.csv` files of `20260928T102644Z-100e1393` and `20260928T063038Z-301480e3`.
- **Two-slot scheduler speedups (1.69× to 1.79× dynamic, 1.15× to 1.26× static, medium):** ratios of medians in `20260928T103934Z-edc10839/aggregate/summary.json`.
- **Per-tile cost spread (34×):** sequential tile CSVs of `20260928T102644Z-100e1393`.
- **Time outside `render_tile` (under 0.01% of sequential render time):** `render_wall_seconds` minus the summed `compute_seconds` of each sequential run's tile CSV in `20260928T102644Z-100e1393`.
- **Per-tile efficiency method:** sum over tiles of the per-tile median sequential time, divided by the same sum for the parallel condition times its threads per tile. Final: MPI 4 0.80, hybrid 2×2 0.74, hybrid 1×4 0.61. Historical: MPI 4 0.83, hybrid 2×2 0.52, hybrid 1×4 0.43.
- **Historical versus final speedups in Section 7.1 (OpenMP 4 1.96× to 1.93×, hybrid 1×4 1.73× to 2.45×, hybrid 2×2 1.33× to 1.91×):** medians of `20260928T063038Z-301480e3` and `20260928T102644Z-100e1393`. These are separate sessions and not paired.
- **Static two-slot scheduler efficiencies (0.58 to 0.63) and dynamic (0.85 to 0.90):** `parallel_efficiency` in `20260928T103934Z-edc10839/aggregate/summary.json`.
- **Adaptive versus fixed block directions (medium uniform 6/7 adaptive faster, large holdout 1/7):** per-block `render_wall_seconds` in the raw stats files of `20260928T103934Z-edc10839` and `20260928T104502Z-5e829d04`.
- **Run-to-run standard deviations of the medium dynamic conditions (0.02 to 0.09 s):** `stdev_seconds` in `20260928T103934Z-edc10839/aggregate/summary.json`.
- **Fixed-batch diagnostic (144 to 18 assignments, spread 0.013 to 0.461 s, 3.177 to 3.501 s):** `results/diagnostic/adaptive-v3/20260928T074207Z-555c6e66`, pre-fix source `a4d8df8`, three measured blocks, as summarised in `docs/ADAPTIVE_POLICY_AUDIT.md`.

Table count: 14.
