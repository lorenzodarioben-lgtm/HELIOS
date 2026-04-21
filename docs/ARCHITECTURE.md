# Architecture and correctness

## Data flow

```text
CLI configuration
  → deterministic built-in Scene + median-split BVH + Camera
  → stable row-major microtiles
  → shared render_tile(scene, camera, config, tile)
  → disjoint 8-bit RGB tile payloads
  → image assembly → P6 PPM + JSON telemetry
```

`render_tile` is the only sampling implementation. Execution backends decide who calls it and when. A sample PRNG starts from a mix of global seed, pixel index, and sample index. The PRNG evolves within the sample across camera jitter and bounces. Pixels accumulate samples in a fixed order, and workers write separate pixels. MPI sends encoded tile bytes, removing floating-point reduction order from image assembly. This is why current same-build backend hashes agree.

The scene owns material and primitive arrays. BVH nodes store bounds and either a leaf range in a reordered primitive-index array or two child IDs. A median split on the widest centroid axis gives a simple, deterministic baseline. The brute-force path tests the same primitive array. Diffuse bounces sample one emissive triangle by area and cast a visibility ray; direct-light estimates are combined with sky and bounce contributions. Secondary diffuse hits on the sampled light are excluded to avoid double counting, while primary and specular hits still see emission. Counters are local to a tile render and combined after work completes; no shared atomic ray counter is used.

## Backends

| Mode | Work distribution | Rank 0 |
| --- | --- | --- |
| `sequential` | Tile IDs in order | Only process |
| `openmp` | OpenMP `static`, `dynamic`, or `guided` over tiles | Only process |
| `mpi-static` | Contiguous tile ID partition across all ranks | Renders its partition, then gathers |
| `mpi-dynamic` | One tile per coordinator assignment | Coordinates and assembles |
| `hybrid-static` | Contiguous rank partition; threads render pixels inside each tile | Renders and gathers |
| `hybrid-dynamic` | One tile per coordinator assignment; threads inside tile | Coordinates and assembles |
| `hybrid-adaptive` | Variable batch of fixed microtiles, based on measured worker throughput and queue size | Coordinates and assembles |

Dynamic protocol tags separate assignment, batch count, tile header, and tile bytes. The header carries a stable tile ID and local counters. Rank 0 validates the ID, allocates the expected payload size, and places bytes at the tile's image position. Workers exit on a zero-count assignment. When there are fewer tiles than workers, idle workers receive this stop message immediately. MPI errors call `MPI_Abort` rather than leaving peers waiting on a failed rank.

## Telemetry boundaries

The render clock starts after scene construction, BVH build, camera, and tile list setup. For MPI, a barrier aligns process start and rank 0 reports elapsed time after assembly and a final timing gather. PPM and JSON writes occur after that clock stops. Per-worker compute time is the sum of tile render durations, so it can exceed wall time when parallel workers overlap. In dynamic modes, `assignments` counts batches; in static/local modes it counts tiles. Rank 0 has zero render work in dynamic mode. Assignment trace timestamps are measured at the coordinator and include both communication and worker time between assignment and completion; `worker_compute_seconds` is the sum of worker-side tile calls.

Per-rank JSON now reports time inside blocking MPI sends, tile payload receives, worker assignment receives, and coordinator result-notification receives. The worker assignment and coordinator result fields measure blocked waiting as well as message delivery. A dynamic coordinator can have a `result_wait_seconds / render_wall_seconds` ratio near one simply because it performs no rendering; that fraction is **not** network overhead. Send-call durations likewise include receiver backpressure and are not pure wire time. These boundaries are explicit so future nonblocking experiments can compare like with like.

For a controlled heterogeneity experiment, `--slow-rank N --slow-us U` requests a sleep after each tile on one nonzero MPI worker. The measured sleep is included in the duration used by adaptive throughput estimation and recorded separately as `stall_seconds`; `compute_seconds` excludes that sleep. This is an opt-in experimental condition, not a hidden slowdown. Windows timer granularity can make the actual sleep much longer than the requested microseconds, so analysis must use measured stall time.

## Validation

Unit tests cover geometry, AABBs with parallel axes, boundary tiles, coverage exactly once, BVH nearest hits against brute force, repeated seeded renders, and OpenMP equality. The integration validator renders an irregular scene across 11 backend/rank/thread combinations and checks exact image hashes plus expected pixel/tile counts. It also tests one tile with four MPI ranks. A second validator compares BVH and brute-force output in all six scenes. CTest wires these checks when CMake and Python are available. The direct build runs them explicitly on the current host.

## Known trade-offs

The coordinator does no rendering in dynamic modes, so at two ranks only one rank computes. Blocking tile messages are simple and robust, but their round trips can dominate easy scenes. Static contiguous partitions have almost no scheduling traffic, but may leave some ranks idle when spatial work is uneven. Hybrid tile rendering uses OpenMP inside each tile, which pays thread-team overhead for small tiles. More detailed idle/communication instrumentation and nonblocking MPI are future experiments.
