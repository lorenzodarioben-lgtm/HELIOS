# hybrid-v3 diagnostics (not formal evidence)

Interpretation: [`docs/HYBRID_TOPOLOGY_AUDIT.md`](../../../docs/HYBRID_TOPOLOGY_AUDIT.md). All runs use `imbalanced`, 256×144, 192 SPP, depth 8, seed 42, tile 16, and reference hash `da1762d641f51b4e`. PPM files are gitignored.

| Directory | Tool | What it is | Status |
|---|---|---|---|
| `counter-before.json` | `scripts/observe_cpu_counters.ps1` | One frequency/performance counter sample (no temperature) | observation |
| `affinity-probe-20260928T081705Z-17f1e4b3` | `scripts/probe_mpi_affinity.py` | PowerShell stand-in under mpiexec; process masks only (255 everywhere) | superseded; cannot see CPU Sets |
| `20260928T081730Z-e41d9f1c` | `scripts/diagnose_hybrid.py --repeats 3 --warmups 1 --timeout 45 --max-total-seconds 240` | 6 conditions × (1 warm-up + 3 measured) + reference = 25 records, 0 failures | complete |
| `affinity-probe-20260928T085800Z-4871af1a` | `scripts/probe_mpi_affinity.py` (with a thread-mask line since removed) | Process masks 255; thread masks empty because .NET `ProcessThread.ProcessorAffinity` is write-only (see stderr) | complete, observer defect recorded |
| `placement-observer-20260928T090653Z-8a62ec27` | `scripts/observe_rank_placement.py` (CPU Set *counts* version) | Positive control passed; 5 launch modes observed on live ranks | complete; timings perturbed |
| `placement-observer-20260928T090902Z-3f8c873d` | `scripts/observe_rank_placement.py --modes hybrid-static-2x2-physicalcore hybrid-static-2x2` | Same plus CPU Set IDs: `spr:p` gives each rank one physical core | complete; timings perturbed |
| `false-sharing-20260928T091041Z-da0c8798` | `scripts/diagnose_false_sharing.py` (earlier revision; `tool_sha256` in manifest) | original vs padded counters; OpenMP 4, hybrid 1×4, hybrid 2×2; 1 warm-up + 5 blocks | complete, 36/36 hashes |
| `false-sharing-20260928T091533Z-068e9dce` | `… --source-rev 8d92429f… --conditions hybrid-static-2x2 --variants original padded addrprobe` | Formal source rebuilt; per-tile `local.data() % 64` probe | complete, 18/18 hashes |
| `false-sharing-20260928T091902Z-2447b355` | `… --conditions mpi-static-4 hybrid-static-1x4 hybrid-static-2x2 --variants original padded padded-dynamic` | Adds MPI 4 control and a dynamic in-tile pixel schedule | complete, 54/54 hashes |

Observer runs sample live processes every 50 ms, so their render times are not benchmark measurements. The diagnostic builds live in the gitignored `build-diag-falseshare/`; the patch text is saved in each false-sharing directory. Background CPU load was notable during these sessions (35–50% busy on non-target CPUs in the observer's positive control).
