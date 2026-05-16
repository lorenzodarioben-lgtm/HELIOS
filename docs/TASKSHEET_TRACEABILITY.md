# SIT315 task-sheet traceability

Statuses describe evidence in this repository as of 2026-09-29 (updated for the final report, visual showcase and Observatory). The frozen performance source is `e2c13e2`. `DONE` means an actual artifact or observed run exists; it does not mean the whole assessment is ready. Formal evidence is Protocol V2 under `results/protocol-v2/`, and diagnostics sit under `results/diagnostic/`. The [benchmark document](BENCHMARKS.md) lists which formal results each renderer fix affects.

| Requirement | Status | Evidence / remaining action |
| --- | --- | --- |
| End-to-end working code | DONE | Release build via `scripts/build.ps1`. Core tests, 12 CLI error cases, BVH-versus-brute-force checks on 6 scenes, and 11 cross-backend configurations with identical image hashes all pass. `assets/helios-showcase.png` comes from a real render. |
| Exact compile/run commands | DONE | `README.md`, `scripts/build.ps1`, and exact experiment commands in `docs/BENCHMARKING.md`. The CMake route exists but is unverified, because CMake is not installed. |
| Screenshot/visual evidence of running program | **DONE** | [`assets/helios-hybrid-adaptive-run-screenshot.png`](../assets/helios-hybrid-adaptive-run-screenshot.png) was captured manually by the user on 2026-09-28 with the command below, unchanged. It shows HEAD `37da0c5`, a successful `hybrid-adaptive` run with 3 ranks × 2 threads, the completion line (`time=1.6153 s hash=57881d257daf2474`) and the output files. `results/screenshot/showcase.json` records the same run, and the PPM independently rehashes to the same value. `assets/helios-showcase.png` is a separate rendered image. |
| Three increasing workloads | DONE | Calibrated V2 presets at 256×144 (small 64, medium 192, large 512 SPP) were used by formal runs: small scheduler, weak and heterogeneity; medium scheduler and strong scaling; large reflective holdout. V1 pilots are historical. |
| Explain speedup and why | DONE | Formal strong (`20260928T102644Z-100e1393`) and weak (`20260928T103116Z-c00a63fc`) scaling on `e2c13e2` give speedup, efficiency and imbalance, with block-paired bootstrap comparisons between layouts. The performance investigation (`docs/HYBRID_TOPOLOGY_AUDIT.md`) explains the old hybrid penalty: the partition was ruled out; counter false sharing was found and fixed; the heap BVH stack was found and fixed. It also explains the remaining limit, static-partition imbalance. The scheduler evaluations were rerun on `e2c13e2` (see `docs/BENCHMARKS.md`). |
| Hardware: CPU, cores/threads, RAM, OS | DONE | `docs/ENVIRONMENT.md` covers the i7-11370H, 4 physical cores and 8 logical processors (SMT pairs measured from the Windows CPU Set table), RAM, OS and compiler. No temperature telemetry exists. |
| Stress workload that fails/does not finish/is manually terminated | **DONE** | Official supervised run `results/stress/20260928T111419Z-5832e956/`: `scheduler_stress`, 1280×720, 2048 SPP, depth 16, sequential. Run with `./scripts/run_supervised_stress.ps1 -IUnderstandThisIsLong -TimeoutSeconds 600`. It was a **DNF, intentionally terminated after 600.34 s** because the workload had not completed. It did not crash and there was no out-of-memory condition; the process tree was killed and no output was produced. Host: i7-11370H, 4 cores / 8 threads, 16 GB, Windows 10.0.26200. See `docs/STRESS_TEST_PLAN.md`. |
| Beyond unit material and research required | DONE | Implemented: hybrid MPI+OpenMP, BVH, coordinator/worker and adaptive batching, deterministic cross-backend validation, CPU Set affinity observation, and false-sharing and allocator diagnosis. The final report (`report/HELIOS_FINAL_REPORT.pdf`) states which techniques go beyond the basic unit content (evidence map row "Work beyond the basic unit content") and cites 17 verified IEEE references. |
| Scope/design/implementation/evaluation document | DONE | Final report `report/HELIOS_FINAL_REPORT.md` / `.docx` / `.pdf` (33 pages, content final, commit `24189c7`), with an assessment-evidence map after the abstract. Supporting: architecture, scheduler, benchmark, audit and defence documents. |
| High-quality video ≥10 minutes | PLANNED, NOT RECORDED | `docs/VIDEO_PLAN.md`, `docs/VIDEO_SCRIPT.md` (about 12:40) and `docs/VIDEO_RECORDING_CHECKLIST.md`. The main visual interface is the Helios Observatory (`assets/observatory/`), with a live check through `scripts/helios_demo.ps1`. Recording remains. |
| Hybrid parallelism, balancing, stronger tests | DONE as implementation; PARTIAL as evaluation | Seven backends. On `e2c13e2`, dynamic beats static by about 27–32% on natural scenes and 12% under 2× heterogeneity. Adaptive versus fixed dynamic has no consistent direction. Frozen-source hybrid scaling is done: 2×2 is at parity with OpenMP 4 and MPI 4, and 1×4 is fastest. Core tests cover intra-tile multi-thread pixel and counter equivalence, the fixed BVH stack bound and deep-tree BVH correctness. |

The project has a real implementation, formal evaluation, a documented performance investigation and a content-final report. Still to do: the real terminal captures in `docs/TERMINAL_EVIDENCE_CAPTURE_PLAN.md` and the video recording.

## Running-program screenshot (captured)

Capture a normal, successful end-to-end run, not the stress timeout. Use a visible terminal at the repository root, with the frozen build (`build-release/`, source `e2c13e2`):

```powershell
git -c safe.directory=C:/Users/lorenzodario/Documents/PersonalProjects/Helios rev-parse --short HEAD
New-Item -ItemType Directory -Force results/screenshot | Out-Null
mpiexec -n 3 ./build-release/helios_mpi.exe render --backend hybrid-adaptive --scene showcase --width 800 --height 450 --spp 64 --max-depth 8 --seed 42 --threads 2 --output results/screenshot/showcase.ppm --stats-json results/screenshot/showcase.json
Get-Item results/screenshot/showcase.ppm, results/screenshot/showcase.json | Select-Object Name, Length, LastWriteTime
```

The screenshot should show, in one frame:
- the typed command, including backend `hybrid-adaptive`, 3 ranks and 2 threads per rank;
- the completion line `Rendered 800x450 scene=showcase backend=hybrid-adaptive ranks=3 threads=2 time=… s hash=… output=…`;
- the output files' sizes and timestamps;
- enough surrounding terminal context, such as the prompt, the path and the Git SHA line, to show the program really ran.

The optional side-by-side image was not included.

**Captured:** `assets/helios-hybrid-adaptive-run-screenshot.png` (2866×748 PNG), taken manually by the user with the command above, unchanged. The run completed at 9:54:05 PM local time on 2026-09-28. It shows `Rendered 800x450 scene=showcase backend=hybrid-adaptive ranks=3 threads=2 time=1.6153 s hash=57881d257daf2474`, and `showcase.ppm` at 1,080,015 bytes and `showcase.json` at 2,401 bytes. The stats file is committed as `results/screenshot/showcase.json`; the PPM is kept locally but gitignored, like other result images.
