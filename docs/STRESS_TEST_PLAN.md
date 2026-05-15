# Supervised stress test

**Status: DONE. An official supervised run was performed once, on 2026-09-28, with the user present. Outcome: DNF / intentionally terminated after 10 minutes because the configured stress workload had not completed.** Evidence: [`results/stress/20260928T111419Z-5832e956/`](../results/stress/20260928T111419Z-5832e956/manifest.json).

## Official result

| Item | Recorded value |
|---|---|
| Run ID | `20260928T111419Z-5832e956` |
| Invocation | `./scripts/run_supervised_stress.ps1 -IUnderstandThisIsLong -TimeoutSeconds 600` |
| Exact child command | `"…\build-release\helios.exe" render --backend sequential --scene scheduler_stress --width 1280 --height 720 --spp 2048 --max-depth 16 --tile 16 --seed 42 --output …\results\stress\20260928T111419Z-5832e956\stress.ppm --stats-json …\stress.json` (full paths in the manifest) |
| Workload | `scheduler_stress`, 1280×720 = 921,600 pixels, 2048 samples/pixel, depth 16, tile 16, seed 42, BVH, **sequential** (one thread) |
| Start (UTC) | 2026-09-28T11:14:21.0885Z |
| End (UTC) | 2026-09-28T11:24:21.4335Z |
| Elapsed wall time | **600.34 s** (Stopwatch), consistent with the timestamps (600.345 s) |
| Timeout | 600 s |
| Termination | `timed_out: true`. The process tree was terminated with `taskkill /T /F`, and afterwards no `helios.exe` process remained. `exit_code` is null because the process was killed, not because it exited. |
| stdout / stderr | both empty (0 bytes); no error was printed |
| Partial output | none. Helios writes the PPM and stats JSON only after rendering completes, and prints no progress while rendering, so `stress.ppm` and `stress.json` do not exist. |
| Source | Git HEAD `836238077ba5`, frozen performance source `e2c13e2` (`src/` and `include/` identical). Only the untracked `HANDOFF.md` was outside Git. |
| Executable SHA-256 | `956685fbc2b7…3ef3`, identical to the binary used for the frozen-source formal experiments |
| Host | 11th Gen Intel Core i7-11370H @ 3.30 GHz; 4 physical cores and 8 logical processors (SMT pairs 0–1, 2–3, 4–5, 6–7); 16,843,112,448 bytes RAM; Windows 10.0.26200 |
| Toolchain | g++ 14.1.0 (MSYS2 Rev3), Release `-O2`; Microsoft MPI 10.1.12498.52 is installed but was not used by this sequential run |

`manifest.json` was written by the runner. `environment.json` was captured immediately afterwards by `python scripts/capture_environment.py results/stress/20260928T111419Z-5832e956`; the runner's own manifest has no RAM or compiler fields.

## Interpretation

The run **did not finish** within the 10-minute waiting period and was **intentionally terminated** by the supervised timeout. It did **not crash**: there was no error output and no abnormal exit before the timeout. **No out-of-memory condition was observed**, since the image buffer is about 2.8 MB. The workload's computational demand exceeded the practical waiting period on this host. About 1.9 billion camera samples are traced, each up to 16 bounces, on one thread. How far the render got is unknown, because the renderer reports no intermediate progress.

The original ~33-minute estimate below was extrapolated from pre-fix calibration probes. The frozen renderer `e2c13e2` is about 45% faster on sequential work (diagnostic `results/diagnostic/counter-fix/20260928T101701Z-0de80589`). A rough rescaling therefore suggests about 18 minutes. That is an **estimate, not a measurement**: the full workload has never been run to completion.

## Original plan (kept as written before the run)

Calibration ID `20260928T064407Z-eef5a771` under `results/calibration/` contains bounded sequential Release runs of `scheduler_stress` at 256×144, depth 16, tile 16, seed 42, BVH enabled, on the pre-fix renderer. Render-wall times were 2.5220 s at 64 SPP, 7.2086 s at 192 SPP, and 19.8798 s at 512 SPP. They are sizing probes, not formal benchmark samples.

The candidate is `scheduler_stress`, 1280×720, 2048 SPP, depth 16, sequential. This keeps the image to 921,600 pixels (2,764,800 RGB bytes before the file header) and increases CPU sampling work. Pixel count is 25× the probe's; SPP is 4× its 512-SPP point. A simple linear extrapolation gave `19.8798 × 25 × 4 ≈ 1,988 s`, about 33 minutes. That was an estimate, not a measured runtime. The command was expected to remain unfinished after a ten-minute supervised demonstration without relying on RAM exhaustion.

The gated runner `scripts/run_supervised_stress.ps1` refuses to start without `-IUnderstandThisIsLong`. It records the exact command, Git SHA, executable SHA-256, machine details, UTC start and end timestamps, elapsed wall time, and the timeout or exit result. It saves separate stdout and stderr files under a unique `results/stress/<run-id>/`. At timeout it terminates the child process tree and still writes the manifest. No benchmark runner invokes it. It must not be run unattended.
