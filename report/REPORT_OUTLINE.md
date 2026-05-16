# Helios report outline

This is a structure for the final assessed document, not a completed report. Protocol V2 strong/weak evidence, the frozen four-scene medium scheduler evaluation, and the separate seven-block large reflective holdout now exist. The targeted hybrid diagnostic is kept separate. Sections marked **DATA NEEDED** still require work before submission.

1. Abstract — write after experiments and conclusions (**DATA NEEDED**).
2. Introduction, problem motivation, scope, and research questions.
3. Background — Monte Carlo path tracing, BVH, OpenMP, MPI, scheduling; cite primary technical sources and distinguish course coverage.
4. System architecture — shared rendering core, deterministic sample streams, scene representation, tiles, output assembly.
5. Path tracing and BVH — equations, material behavior, median split, traversal and validation.
6. Execution backends — sequential, OpenMP, static MPI, dynamic coordinator/worker, hybrid.
7. Adaptive scheduler — exact throughput/EMA rule, 50 ms target, initial batch and fairness cap; explain why reducing assignments need not reduce wall time. Use [the policy audit](../docs/ADAPTIVE_POLICY_AUDIT.md), state that the default algorithm was retained, and distinguish diagnostic tuning data from the [frozen V2 candidate](../docs/FROZEN_EVALUATION_CANDIDATE.md).
8. Instrumentation and correctness — timer boundary; normal scalar metrics versus detailed trace mode; batch-boundary 90% tail and last-worker spread; image hashes, PPM-byte verifier, tests. Explicitly note that blocking-call occupancy is not pure network overhead and `worker_requests` counts receives rather than packets.
9. Experimental methodology — [Protocol V2](../docs/BENCHMARKING.md): hardware/OS/compiler, Release build and exact tested binary hash, calibrated small/medium/large SPP, one warm-up and seven randomized measured blocks, fixed seed, timeouts, no exclusion of losing runs, independent pixel-byte verification, paired bootstrap effects. Include limits of single-host frequency and temperature observation. Separate the older small V2 data, medium diagnostics, frozen medium evaluation, and any large holdout.
10. Results — scheduler runtime by scene; three paired comparisons with relative and absolute effects plus 95% intervals; compute imbalance, assignment counts, worker wait, completion spread, trace examples; prior strong/weak scaling and hybrid comparison; [generated tables and SVGs](assets/). Explain practical effect size and avoid treating CI overlap or CI crossing zero as a proof of equality. Pure network/scheduler overhead remains **DATA NEEDED** if a quantitative decomposition is claimed.
11. Stress test — official supervised run `results/stress/20260928T111419Z-5832e956` ([details](../docs/STRESS_TEST_PLAN.md)). Workload: `scheduler_stress`, 1280×720, 2048 SPP, depth 16, sequential. It was a DNF, intentionally terminated by the 600 s timeout after 600.34 s. There was no crash, no out-of-memory condition and no partial output, because the renderer writes only on completion. Explain the computational demand (about 1.89 billion camera samples, up to 16 bounces each, on one thread). State that the completion-time estimate is unmeasured.
12. Discussion — major benefit from dynamic redistribution; adaptive batching's measured assignment reduction and uncertain runtime advantage; late-batch effects. Include the performance-engineering story from [the hybrid audit](../docs/HYBRID_TOPOLOGY_AUDIT.md):
    - poor formal hybrid 2×2 result;
    - partition ruled out by tile costs;
    - CPU Set affinity observation;
    - counter false sharing found, then corrected as minor and fixed (`dca8628`);
    - heap BVH stack found to dominate, mostly as a serial cost, and fixed;
    - frozen `e2c13e2` strong and weak reruns (`20260928T102644Z-100e1393`, `20260928T103116Z-c00a63fc`), and scheduler reruns (`20260928T103934Z-edc10839`, `20260928T104502Z-5e829d04`, `20260928T104823Z-8e1c1ed4`, `20260928T105023Z-1dd576e1`), with old results retained. Report assets: `report/assets/20260928T103934Z-edc10839/`.

    The nonblocking trade-off remains unmeasured.
13. Threats to validity — one laptop, coordinator asymmetry, no cluster network, workload selection, timing noise, oversubscription.
14. Limitations, future work, and conclusion (**DATA NEEDED for evidence-based conclusion**).
15. Reproduction appendix — exact build/test/run commands, source revision, dataset/run IDs, environment and raw result schema. Include the running-program screenshot `assets/helios-hybrid-adaptive-run-screenshot.png` (successful `hybrid-adaptive` 3×2 showcase render) with its exact command from `docs/TASKSHEET_TRACEABILITY.md`.

The old three-repeat protocol V1 pilots remain historical. Protocol V2 data and limitations are in [benchmarks](../docs/BENCHMARKS.md). The final university report still needs primary literature/course citations, the supervised stress outcome, integrated argument, and submission formatting.
