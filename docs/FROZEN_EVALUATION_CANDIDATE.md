# Frozen scheduler evaluation candidate

Freeze decision: 2026-09-28 UTC, **before** fresh medium Protocol V2 measurements. The adaptive algorithm and its defaults were **not changed**. The diagnostic sweeps did not identify a stable, specific improvement that justified changing the policy. Instrumentation and bounded diagnostic-only controls were added.

Source/tools commit: `2c6c5222b5526c14ee42efd872709e8fbebfaffb` (branch `master`, clean at freeze). Source SHA-256: `src/main.cpp` `dc5dda0e074c231abe96f3223d472ce78fa009cbe9d0b8bfa2e92b0c4e0eb2cf`, `src/core.cpp` `0ec54b4f3d92591737290f38f54d1dca28e1b762b8b73bb6623c09a4b1d4cb72`, `include/helios/core.hpp` `efd6a4d0c08a4fc61ab38ea58d3c11a1b8551528c9a18ea8537f22c9681717a3`. Tested Release binary SHA-256: `helios.exe` `9c627b5931c45d9ce782768de4d0e962ac574b2a5ec95edd7b66978eb10fb42a`, `helios_mpi.exe` `30946ef41725b578cb949a570c9d9bbb7b004b54123a2854d1a1e9553d7cb4e0`. PE timestamps prevent whole-file rebuild equality; the files listed identify the exact evaluation binaries.

Frozen scheduler: fixed dynamic batch 1; adaptive initial batch 2, target 50 ms, cap 8, throughput EMA weight 0.5 for each new observation, remaining-work cap `max(1, floor(remaining/(2×workers)))`. The CLI diagnostic flags are left at defaults in formal runs. Static MPI uses coordinator-only mode so all policies have two rendering ranks out of three total ranks. Normal scene semantics, seed 42, tile 16, depth 8, BVH, 256×144 pixels, and one thread per rank are fixed. Assignment tracing is enabled for dynamic/adaptive in the formal run; the three-block normal/trace comparison did not establish a consistent measured trace penalty, and matched policy comparisons share the same trace setting. CSV output is outside the timed render. This remains a limitation, not proof that trace overhead is exactly zero.

Predeclared medium evaluation: `imbalanced`, `reflective`, `scheduler_stress`, `uniform`; 192 samples/pixel; one warm-up and seven measured randomized blocks per scene, order seed 20260928. The full matrix includes sequential reference, static coordinator-only, fixed dynamic, and frozen adaptive. Primary comparisons are fixed/static, adaptive/static, and adaptive/fixed, using per-block paired median relative runtime change and 95% percentile bootstrap intervals; also report absolute paired seconds and compute imbalance. Positive relative change means the candidate is slower. Every run, including failures, remains in the experiment directory. No scheduler tuning will use these data.

Reproduction command from the repository root:

```powershell
python scripts/benchmark_v2.py --experiment scheduler --scene imbalanced --scene reflective --scene scheduler_stress --scene uniform --preset medium --repeats 7 --warmups 1 --order-seed 20260928 --trace-mode diagnostic --timeout 60 --max-total-seconds 1200
```

If medium evaluation completes safely, the separate large holdout is `reflective` at 512 samples/pixel with the same comparison matrix, warm-up, and seven measured blocks. Its sampling parameters were not used in the diagnostic tuning study. It will receive a separate experiment ID.

The holdout subsequently ran as `20260928T080938Z-fe56f15c` with the same source and binary SHA-256 values recorded above. Exact command:

```powershell
python scripts/benchmark_v2.py --experiment scheduler --scene reflective --preset large --repeats 7 --warmups 1 --order-seed 20260928 --trace-mode diagnostic --timeout 90 --max-total-seconds 900
```

The result was analyzed and verified without changing scheduler code or parameters. See [benchmarks](BENCHMARKS.md) for the paired interpretation.
