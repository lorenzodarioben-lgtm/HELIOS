# Engineering defence notes

These notes explain design decisions and likely oral questions. The primary evidence is the preserved Protocol V2 run data. Older three-repeat runs are labeled pilots. Fresh frozen-candidate medium evaluation is described in [the freeze marker](FROZEN_EVALUATION_CANDIDATE.md); claims are updated only after its integrity checks.

## Design choices

| Problem | Chosen solution | Alternative and trade-off | Evidence to validate |
| --- | --- | --- | --- |
| Scheduling changes sample order | Seed each pixel/sample independently; accumulate samples in order | Global or per-thread RNG is simpler but changes images when work moves | Exact hashes across 11 backend configurations |
| Many geometric intersection tests | Median-split BVH with an explicit brute-force mode | Binned SAH may improve traversal but costs more build complexity | Nearest-hit test, image equality, node/primitive counters, timed `--no-bvh` comparison |
| Parallel output ownership | Fixed stable microtiles | Pixel-level messages create overhead; variable geometry complicates validation | Exact tile coverage and low-tile MPI tests |
| Irregular distributed work | Static baseline, one-tile dynamic queue, then throughput-based batching | Work stealing or predictive cost maps are more complex | Assignment traces, per-worker compute/tiles, repeated timing |
| Two memory levels | MPI ranks with OpenMP threads inside tile rendering | Processes alone duplicate thread coordination; threads alone do not study distributed scheduling | Hybrid validation and scaling matrix |
| Reproducible evidence | Raw per-run JSON and PPM, separate aggregate CSV | Manually reported stopwatch numbers are hard to audit | Run manifest, commands, hashes, measured values |

## Likely questions

**Why path tracing?** A primary ray may miss, hit a diffuse object, or continue through reflective/refractive bounces. BVH traversal and bounce counts vary across pixels, creating a concrete irregular workload with a checkable image output.

**Why MPI and OpenMP together?** MPI models distributed memory and rank-level communication; OpenMP uses threads inside each rank. The combination lets the study vary rank and thread allocation while keeping rendering logic constant. On one laptop, this is a topology and overhead experiment, not a claim of cluster scalability.

**Why do static partitions imbalance?** Equal tile counts need not mean equal ray work. A contiguous rank partition can land a dense or reflective region on one rank. Its wall time is gated by the slowest rank.

**Why tiles?** They give stable ownership and compact messages, allow boundary clipping, and provide a single work unit for all backends. The validator checks that each pixel is covered once.

**Why adaptive batching?** One-tile messages can cost more than the tile on easy scenes. The current heuristic uses observed pixels per second to target a short batch and shrinks batch size near the queue tail. It cannot predict unseen hard tiles.

**What overhead does dynamic scheduling introduce?** Rank 0 dispatches and receives every batch, messages carry headers and tile bytes, and workers can block. At two ranks, only one rank computes in dynamic mode. The pilot large fixed dynamic MPI time was near sequential despite a second process.

**Why might OpenMP dynamic be slower on easy scenes?** Its scheduling bookkeeping is paid per tile. Static assignment has little bookkeeping when tile costs are similar. Thread startup and small task sizes amplify the difference.

**Why does hyper-threading not double performance?** Logical threads share execution resources and memory bandwidth on a physical core. The host exposes eight logical processors. The identified CPU model is specified by Intel as four cores/eight threads, although actual local physical topology could not be queried under current permissions; the model specification should not be mistaken for a direct topology measurement.

**What is a BVH?** A hierarchy of axis-aligned bounds. A ray misses many bounding boxes and can skip their primitives. A bounding box test adds overhead, so benefits depend on scene complexity and ray distribution.

**Why can speedup stop scaling?** Serial setup, coordinator work, communication, memory contention, task granularity, and uneven work remain. In hybrid mode, threads inside small tiles can add overhead.

**What is communication overhead?** Time spent sending/receiving data and protocol coordination. Current assignment-to-completion trace includes compute and waiting too; it must not be presented as pure network time. Cleaner timing is future work.

**What is parallel efficiency?** Protocol V2 uses `speedup / rendering_slots`: OpenMP threads, static rendering ranks times threads, and dynamic worker ranks times threads, excluding coordinator-only rank 0. Historical pilot reports used `ranks × threads` and should not be confused with V2.

**How is correctness verified?** Unit intersection tests, BVH against brute force, exact tile coverage, repeated seeded rendering, and 8-bit image hash equality across backends. Exact equality applies to this build because each pixel uses fixed sample order and byte output assembly; compiler changes may need tolerance checks.

**Why deterministic RNG?** A shared RNG would give different sample streams when thread/rank scheduling changes. That would confound algorithmic correctness and performance comparisons with Monte Carlo noise.

**Why might nonblocking MPI fail to help?** If there is no independent computation to overlap, `MPI_Isend`/`MPI_Irecv` can add state and progress overhead without shortening the critical path. This project has not yet implemented or measured a nonblocking variant.

**What did the worker-stall experiment show?** A requested sleep on rank 1 made static partitions finish much later, while dynamic and adaptive modes shifted most tiles to rank 2 and kept worker assignment times closer. Fixed dynamic beat adaptive in the measured treatment. The requested 1.5 ms sleep actually ranged roughly 11–23 ms per tile in a sample on Windows, so that timing result cannot isolate a scheduler advantage. The measured stall is recorded separately from rendering compute.

**What are one-laptop limitations?** All MPI ranks share one memory system and physical machine. V2 adds warm-ups and seven randomized measured blocks, but affinity, temperature, and background load were not controlled in its historical datasets. A cluster could have different network latency, bandwidth, and NUMA behavior. No local thermal sensor measurement is claimed.

**Why can adaptive be slower than fixed dynamic when both have near-zero imbalance?** `max/mean − 1` only compares accumulated worker compute time; it misses late-batch synchronization, worker assignment wait, and how much work remains in flight. The medium fixed-batch diagnostic cut assignments from 144 to 18 at batch 8, but increased the last-worker completion spread from 0.013 to 0.461 s on `imbalanced`. Measured coordinator and MPI-call occupancy was milliseconds, too small to pay back that tail. Adaptive uses smaller batches on the medium tests and the fresh formal comparison must determine its practical net effect. The [audit](ADAPTIVE_POLICY_AUDIT.md) has the exact measurements.

**What does `max/mean − 1` compute imbalance measure?** For rendering ranks with at least one tile, take the largest sum of worker-reported tile compute seconds, divide by the mean of those sums, then subtract one. Zero means equal accumulated compute, not equal elapsed completion time or zero waiting. The synthetic experiment also reports an effective-work version using compute plus injected stall.

**Why might MPI 4 look slightly faster than OpenMP 4?** The historical `imbalanced` medium medians were 3.092 s and 3.208 s respectively, a 0.116 s difference. They use different runtime structures and static work placement; no paired backend interval or controlled affinity study establishes that MPI generally beats OpenMP. Interpret the measured medians as close on this host.

**Why was hybrid static 2×2 slow?** Its historical median was 4.707 s versus 3.092 s for MPI static 4 and 3.208 s for OpenMP 4. In the raw telemetry, the two hybrid ranks each owned 72 tiles, but rank 1 had about 4.706 s of tile compute while rank 0 had about 1.284 s. This points to a severe contiguous spatial partition for two ranks; tile-internal OpenMP costs and affinity remain additional possibilities to test separately. It would be incorrect to attribute the whole gap to MPI transfer: rank 1's median blocking send-call time was about 0.001 s. See the targeted hybrid diagnostic before making a stronger causal claim.

**Why did eight-thread OpenMP improve runtime while efficiency fell?** The strong-scaling medians were 3.208 s at four threads and 2.116 s at eight, so elapsed time improved. Speedup per rendering slot fell from 0.49 to 0.37 because the extra logical processors share physical resources and overhead also grows. Lower efficiency does not mean the extra threads were useless.

**Why was single-host weak scaling poor?** V2 increases SPP with rendering slots and keeps the same image/scene. Two-slot weak efficiency was about 0.60–0.61 for OpenMP/MPI and four-slot about 0.49–0.52; hybrid 2×2 was 0.33. Work per slot is only approximately constant, and all conditions contend on the same host. This does not predict distributed weak scaling.

**Why randomize condition order?** Serial runs can drift with frequency, background activity, or temperature. A fixed condition order would confound backend with position. Deterministic per-block shuffling spreads this bias and allows an exact command/order audit, although it cannot remove all drift.

**Why bootstrap intervals and paired differences?** Runtime distributions and medians need not be normal. V2 resamples observed measured runs 4,000 times for a descriptive median interval. Scheduler policy effects resample *matched block differences*, preserving the randomized-block comparison. Serial samples may still be correlated, so intervals are approximate.

**Why does a confidence interval containing zero not prove equivalence?** It says the experiment did not resolve a difference at that interval level. An equivalence claim would require a predeclared practical margin and an appropriately powered equivalence analysis. Report the observed effect and its interval without turning uncertainty into equality.

**Why keep diagnostic tuning separate from a holdout?** Selecting parameters because they look favorable on exploratory data and then citing those same data as confirmation biases the claimed effect. The adaptive defaults were frozen before the new medium V2 run. Its seven-block results are interpreted as evaluation, not used to retune the scheduler.

**Why did the historical large holdout show a lower adaptive median but a positive paired adaptive/fixed effect?** At 512 SPP on `reflective`, separate condition medians were 7.493 s adaptive and 7.681 s fixed. The predeclared statistic takes each randomized block's adaptive/fixed ratio and then its median: +0.69% (95% CI −3.26 to +3.52%), with a +0.065 s median absolute difference. Taking a ratio of two separate medians is not algebraically the same operation. Late slower blocks affected both modes; no run was removed. The paired result does not establish a difference. On the frozen renderer `e2c13e2` (`20260928T104502Z-5e829d04`), the paired adaptive/fixed change was +1.83% (95% CI +0.15 to +2.37%, +0.088 s). This is a small but resolvable fixed-dynamic advantage. Across all ten frozen-source scheduler comparisons, adaptive has no consistent direction.

**Why was hybrid 2×2 slower than OpenMP 4 and MPI 4, and is it still?** It was not mainly the rank partition: its ideal critical path (2.47 s) is no worse than MPI 4's (2.55 s). Threading inside each tile was inefficient, with two threads per tile giving about 1.04×. Two defects were found and fixed, preserving pixels and counters:
- Per-thread counters in `render_tile` false-shared cache lines, depending on heap alignment. Making them thread-private (`dca8628`) was a real but minor gain: hybrid 1×4 −8%, 2×2 −14% in one session, with the sequential, OpenMP 4 and MPI 4 controls unchanged.
- `Scene::hit` heap-allocated a BVH stack for every ray query. The bounded stack in `e2c13e2` made every backend about 45% faster, sequential included, so this was mostly a serial cost. The hybrid intra-tile paths gained 53–58%.

On the frozen `e2c13e2`, the formal rerun shows no resolvable difference between hybrid 2×2 and OpenMP 4 (−0.30%, CI −2.0 to +3.3%) or MPI 4 (+1.84%, CI −0.2 to +4.0%), and hybrid 1×4 is now the fastest 4-slot layout. The old formal result is kept as historical evidence.

An earlier padding experiment had overstated the counter effect. The exact historical 4.707 s was not reproduced by later rebuilds, so its full size was never attributed. Requested `spr:p` affinity is slower because MS-MPI binds each two-thread rank to one SMT core through CPU Sets. Details are in [the hybrid audit](HYBRID_TOPOLOGY_AUDIT.md).

**Why keep results that a later fix superseded?** They are the evidence that exposed the defects. Deleting them would hide how the conclusions changed. Each experiment directory records its source SHA, and `docs/BENCHMARKS.md` lists which ones each fix affects.

**What happened in the stress test?** A deliberately overlong sequential render was run once with the user supervising: `scheduler_stress`, 1280×720, 2048 samples/pixel, depth 16, about 1.89 billion camera samples. It was a DNF. The gated runner terminated it on purpose at its 600 s limit, after 600.34 s, because it had not finished. It did not crash, printed no error and ran nowhere near memory exhaustion. There is no partial image, because Helios writes output only when rendering completes. The runner recorded the exact command, UTC start and end times, Git SHA, binary hash, host details, logs and the process-tree termination in `results/stress/20260928T111419Z-5832e956/`. The completion time is unknown; an extrapolated estimate of roughly 18 minutes on the frozen renderer is not a measurement.

**What went beyond a basic course parallel pattern?** One shared deterministic renderer supports BVH acceleration, OpenMP scheduling variants, MPI static/dynamic protocols, hybrid execution, measured adaptive batching, traceable telemetry, exact cross-backend validation, and reproducible run capture. The final report still needs citations and an explicit comparison to actual unit material.
