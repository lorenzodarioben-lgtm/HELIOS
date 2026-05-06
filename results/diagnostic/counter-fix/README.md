# counter-fix diagnostics (not formal evidence)

Tool: `scripts/diagnose_counter_fix.py`. Workload: `imbalanced`, 256×144, 192 SPP, depth 8, seed 42, tile 16. Each run has 1 warm-up plus 7 randomised measured blocks and a sequential reference. Every run must match the reference pixel hash `da1762d641f51b4e` and the aggregate rays, shadow rays, node visits, primitive tests and pixels. All three runs passed: 0 failures. "prefix" is source `6270d44`. "fixed" is the thread-local `render_tile` counters that were later committed. Builds are in the gitignored `build-diag-counterfix/`.

| Directory | Variants | Conditions | Note |
|---|---|---|---|
| `20260928T094523Z-e836a84f` | prefix, fixed | OpenMP 4, MPI 4, hybrid 1×4, hybrid 2×2 | Earlier tool revision (two variants only; `tool_sha256` in the manifest). Its summary uses top-level paired fields. |
| `20260928T095215Z-87849a17` | prefix, fixed, fixed-aligned, prefix-padded | OpenMP 4, hybrid 1×4, hybrid 2×2 | Tests whether the thread-local object's stack neighbours matter. `alignas(64)` made no material difference. |
| `20260928T100038Z-b0dae2ec` | prefix, fixed, prefix-padded, fixed-stackarray | OpenMP 4, hybrid 1×4, hybrid 2×2 | `fixed-stackarray` also replaces the per-query heap `std::vector` BVH stack with a bounded array. That array is safe only for trees of 127 nodes or fewer, so it is diagnostic only. |

| `20260928T101701Z-0de80589` | prefix, counter-only (`dca8628`), fixed (working tree = frozen `e2c13e2`: counters plus bounded BVH stack) | sequential, OpenMP 4, MPI 4, hybrid 1×4, hybrid 2×2 | Final clean A/B, 121 records. Counter-only leaves sequential, OpenMP 4 and MPI 4 unchanged, and cuts hybrid 1×4 by 8.5% and hybrid 2×2 by 14.0%. The full fix cuts 44.6–57.5% everywhere. |

Findings are interpreted in `docs/HYBRID_TOPOLOGY_AUDIT.md`.
