# Hybrid 2×2 topology investigation

Question: why was hybrid static 2 ranks × 2 threads much slower than OpenMP 4 or MPI static 4 on this single 4-core/8-thread laptop? Everything below, except the first and last sections, is **diagnostic**, not formal Protocol V2 evidence. Raw data are under `results/diagnostic/hybrid-v3/` and `results/diagnostic/counter-fix/`, each indexed in its `README.md`.

## Historical V2 evidence to explain

The medium `imbalanced` strong-scaling run `20260928T063038Z-301480e3` (source `8d92429`, seven measured blocks) reports medians of 6.279 s sequential, 3.208 s OpenMP 4, 3.092 s MPI static 4, **4.707 s** hybrid static 2×2 (95% median CI 4.645–4.718 s), 3.634 s hybrid 1×4, 3.062 s hybrid 4×1, and 2.116 s OpenMP 8. Hybrid 2×2 rank 0 had about 1.284 s of tile compute and rank 1 about 4.706 s; rank 1's blocking send occupancy was about 0.001 s, so MPI transfer is not the bottleneck.

## Work partition is not the main cause

Summing the sequential run's median per-tile costs (6.201 s in total) over each static partition gives the ideal critical path if threads were perfectly efficient. MPI 4×1's heaviest quarter is 2.546 s. Hybrid 2×2's heavy half is 4.941 s, so it would take **2.47 s** with two perfect threads, slightly *better* than 4×1. The earlier reading that the 2×2 partition "strongly implicates" the critical path was therefore incomplete: the partition explains why both static layouts leave two slots idle after about 1.2 s, but not the gap between them.

The formal tile records show where the time goes. Work inside a tile scaled poorly: two threads per tile reached 0.52 parallel efficiency (about 1.04× speedup), and four reached 0.43. Tile-level concurrency did much better: OpenMP 2 scored 0.96 and MPI 4 0.83. The predicted time is 4.941 s ÷ (2 × 0.522) ≈ 4.73 s against 4.71 s observed. The loss is inside `render_tile`, which runs an OpenMP `schedule(static)` region over each tile's pixels when `threads > 1`. That happens only on hybrid paths.

## Cause 1, verified: false sharing of per-thread counters

`render_tile` keeps one 48-byte `Counters` per thread in a contiguous `std::vector` and increments it for every ray, BVH node visit and primitive test (about 352 M node visits per image). Two adjacent 48-byte entries share a 64-byte cache line unless the vector starts at an address ≡ 16 (mod 64). `scripts/diagnose_false_sharing.py` builds the unchanged source and a copy with each thread's counters padded to one cache line. It never edits `src/`. Pixels and hashes are unchanged: all 108 runs matched the reference hash.

| Run | Condition | Original median | Padded median | Paired padded/original | Blocks faster |
|---|---|---:|---:|---:|---:|
| `false-sharing-20260928T091041Z-da0c8798` | hybrid 1×4 | 3.716 s | 3.048 s | 0.820 | 5/5 |
| same | hybrid 2×2 | 3.755 s | 3.686 s | 0.982 | 3/5 |
| same | OpenMP 4 (control) | 3.811 s | 3.716 s | 0.994 | 3/5 |
| `false-sharing-20260928T091902Z-2447b355` | hybrid 1×4 | 3.803 s | 2.941 s | 0.769 | 5/5 |
| same | hybrid 2×2 | 4.339 s | 3.755 s | 0.870 | 5/5 |
| same | MPI static 4 (control) | 3.672 s | 3.710 s | 1.018 | 2/5 |

An address probe (`false-sharing-20260928T091533Z-068e9dce`, formal source `8d92429`) printed `local.data() % 64` for every tile. Within a run each rank reused the same offset for all 72 tiles. In the same binary, rank 0 took **1.126 s** at offset 16 (no line shared) and **1.47–1.52 s** at offset 48 (shared). Padding gave 1.05–1.12 s. Whether the heavy 2×2 rank suffers therefore depends on incidental heap layout. That explains why padding helped the 2×2 wall time in one invocation (0.870, 5/5) but hardly in another (0.982), where only the light rank was affected.

A further variant that also switched the pixel split to `schedule(dynamic,16)` added little for 2×2 (3.726 s versus padded 3.755 s) and about 6% for 1×4 (2.760 s versus 2.941 s). Row-band imbalance inside tiles is therefore a minor factor.

### Correction after the committed fix (`dca8628`)

The committed fix gives each thread a private `Counters` and merges it once per tile. It removes the shared array entirely, but its gain is **much smaller than padding's**. In three counter-fix diagnostics (`results/diagnostic/counter-fix/`, seven paired blocks each, all hashes and counters matched), hybrid 1×4 changed by −5.64%, −7.36% and −7.00% (95% CIs from −9.6% to −3.3%; 7/7, 6/7 and 7/7 blocks faster). Padding the old vector changed it by −20.5% and −21.8% in the same sessions. Aligning the private object to 64 bytes did not close the gap (−8.24%). Hybrid 2×2 rank 0 improved consistently, 1.48 → 1.10–1.13 s in all three runs, as the address probe predicts. The 2×2 wall time did not change materially, since the heavy rank was not on a sharing offset in these sessions.

Counter false sharing is therefore **real but minor**. Most of the earlier 18–23% "padding" gain was an interaction with heap layout, not the removal of counter sharing. The earlier tables above stay as recorded, but they overstate the counter effect.

## Cause 3, dominant and now fixed (`e2c13e2`): heap-allocated BVH traversal stack

`Scene::hit` builds a new `std::vector<int> stack{0}` on **every** ray–BVH query, about 20 M per image, and grows it by push/pop through the heap. Every thread in every backend does this. `…/counter-fix/20260928T100038Z-b0dae2ec` replaced it with a bounded stack array in a **diagnostic build only**. That array is valid for trees of 127 nodes or fewer, not a general fix. Against the pre-fix source, OpenMP 4 went from 3.713 to 2.062 s (−44.3%), hybrid 1×4 from 3.736 to 1.608 s (−57.9%) and hybrid 2×2 from 3.791 to 2.078 s (−45.4%). Each was faster in 7/7 blocks, with pixels and counters identical. The OpenMP 4 control also moved ±2–5% between counter variants (−1.9%, +5.4%, +2.5%) and with padding (+1.4%), neither of which changes its per-tile semantics. That sensitivity is consistent with heap-layout effects from this allocator traffic.

The general fix, **`e2c13e2`**, traverses with a fixed `int stack[64]`. The count-median split keeps depth ≤ ⌈log₂ n⌉, and a traversal needs depth+1 slots; `build_bvh` checks that bound once. It was measured in `…/counter-fix/20260928T101701Z-0de80589` against the pre-fix source, with 7 paired blocks and pixels and counters identical:
- sequential −44.6%
- OpenMP 4 −45.9%
- MPI 4 −44.6%
- hybrid 1×4 −57.5%
- hybrid 2×2 −53.4%

**Correction:** because sequential gains as much as OpenMP 4 and MPI 4, the allocation was mainly a *serial* per-query cost, not mainly allocator contention, as the text above first suggested. The extra 8–13 points on the hybrid intra-tile paths are the only part that looks threaded. This fix changes every backend's absolute timings, so every earlier formal experiment is historical. Strong and weak scaling were rerun on `e2c13e2`; see the next section.

## Cause 2, verified for `spr:p`: SMT co-location under requested affinity

The first two probes (`affinity-probe-…081705Z-17f1e4b3`, `affinity-probe-…085800Z-4871af1a`) ran a PowerShell stand-in under `mpiexec`. It always read process mask 255. The later probe's thread readout returned nothing, because .NET `ProcessThread.ProcessorAffinity` is write-only. Neither probe could see the real binding.

`scripts/observe_rank_placement.py` reads the live `helios_mpi` ranks through Win32. It collects process and thread masks, process default and thread-selected CPU Sets, ideal processors, per-thread CPU time and per-logical-CPU busy time. Its positive control, a child pinned to process mask 60 and thread mask 32, is read back correctly (`placement-observer-20260928T090653Z-8a62ec27`, `…090902Z-3f8c873d`). The Windows CPU Set table shows four physical cores with SMT pairs (0,1), (2,3), (4,5), (6,7).

- Default and `-affinity_layout 0`: every mask is 255 and no CPU Sets are present, so the ranks are **unbound**.
- `-affinity_layout spr:p`: masks remain 255, but after start-up each rank receives a **process default CPU Set of one physical core**. The heavy rank got {256, 257} (logical 0/1, core 0) and the light rank got {260, 261} (logical 4/5, core 4). Logical CPUs 0 and 1 were 95–96% busy.

So requested MS-MPI affinity **is applied, via CPU Sets**, and an affinity mask cannot show it. With two OpenMP threads per rank, `spr:p` puts both of a rank's threads on SMT siblings of one core. That matches the consistent slowdown in the hybrid study (`20260928T081730Z-e41d9f1c`, three measured blocks): 5.158 s median against 3.852 s unbound, with per-block ratios 1.38, 1.31 and 1.34. `-affinity_layout 0` did not differ consistently from default (0.90–1.09), as expected for two unbound modes.

## Utilisation, oversubscription, MPI progress

In every observed mode at most **4** Helios threads were active at once (CPU ≥ 50% of a sampling interval), on 8 logical CPUs, so there was **no oversubscription**. The median was 2 for static layouts, because both static partitions leave the light workers idle after about 1.2 s, and 4 for dynamic 3×2. Finished ranks and the dynamic coordinator used almost no CPU (coordinator 0.016 CPU-s per render), so neither MPI blocking-receive spinning nor idle OpenMP spinning was measurable. Each rank had 5–6 threads, of which only the OpenMP workers consumed CPU. Actual per-thread run locations are not exposed by Windows; per-CPU busy time is the only placement signal. It is decisive under `spr:p`, but not for unbound runs.

## Dynamic 3×2 versus static 2×2

In the hybrid study, dynamic 3×2 had a median of 2.606 s against 3.852 s for static 2×2 (per-block ratios 0.66, 0.70 and 0.68). This is **not** a like-for-like hybrid comparison: dynamic uses three processes, a non-rendering coordinator and tile-level load balancing. Its gain matches the formal dynamic-versus-static scheduler result and does not show that hybrid composition itself helps.

## What is supported, what is not

- Supported: hybrid 2×2 was slower than OpenMP 4 and MPI 4 in every measured block of the formal run and of the hybrid study. It was also slower than same-session MPI 4 in 5/5 blocks of `…091902Z` (4.339 s versus 3.672 s). The main mechanism is within-tile threading inefficiency. Counter false sharing is a demonstrated but minor, alignment-dependent part of it. The per-query heap-allocated BVH stack was the dominant cost in every backend, mostly serial (Cause 3, fixed). Requested `spr:p` affinity makes 2-thread ranks slower by co-locating them on SMT siblings.
- Not reproduced: rebuilding the formal source `8d92429` today gave 3.72–4.02 s for hybrid 2×2, not 4.71 s. Unbound 2×2 runs ranged 3.5–5.6 s across sessions. Heap alignment (demonstrated) and OS thread placement (not observable) are consistent with that spread, but the size of the formal 4.707 s penalty is **not fully attributed**.
- Session caveat: during the positive control, non-target CPUs were 35–50% busy from background activity. Diagnostic timings from 2026-09-28 09:00 UTC onwards are not comparable in absolute terms with the formal runs.
- Both fixes are committed, and `e2c13e2` is the frozen performance source. The formal reruns are in the next section. The scheduler experiments are still to be rerun on it.

Windows `Get-Counter` exposed `% Processor Performance`, `% Processor Time` and `Actual Frequency`; these are relative performance and frequency observations, not temperature. No temperature sensor was read, and no slowdown here is attributed to thermal throttling.

## Outcome on the frozen source (`e2c13e2`, formal)

The formal strong-scaling rerun `20260928T102644Z-100e1393` used seven paired blocks. Hybrid 2×2 versus OpenMP 4 was −0.30% (95% CI −2.02 to +3.29%, faster in 4/7 blocks), and versus MPI 4 it was +1.84% (CI −0.19 to +4.02%, 2/7). Historically it was +43% and +51%, faster in 0/7 blocks. Hybrid 1×4 is now 20.7% faster than OpenMP 4 (7/7), because its per-tile split avoids static-partition imbalance. Hybrid 4×1 is 1.0% slower than MPI 4 (CI +0.54 to +1.96%). Within-tile efficiency with 2 threads rose from 0.52 to 0.74. The weak-scaling rerun `20260928T103116Z-c00a63fc` raised hybrid 2×2 weak efficiency from 0.33 to 0.48, level with OpenMP 4 and MPI 4. Full tables are in [benchmarks](BENCHMARKS.md).

In order, the investigation found:
1. Formal scaling showed poor hybrid 2×2 performance.
2. Tile-cost modelling ruled out the rank partition as the main cause.
3. CPU Set observation clarified how MS-MPI applies affinity.
4. An address probe and A/B builds found alignment-dependent counter false sharing. It was fixed, and later correctly measured as minor.
5. A controlled variant exposed the per-query heap BVH stack as the dominant cost, and it was fixed.
6. Both fixes were frozen as `e2c13e2`, and strong and weak scaling were rerun.
7. All earlier results are kept as historical evidence.
