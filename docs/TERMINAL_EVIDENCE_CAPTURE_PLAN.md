# Terminal evidence capture plan

Real terminal screenshots only. **No generated or mocked terminal images.** Each capture below must be taken manually by the user from a real PowerShell window. Outputs go to `%TEMP%\helios-evidence`, never into `results/`.

## Audit: what exists and what is worth adding

| Candidate | Status | Decision |
|---|---|---|
| A. Successful `hybrid-adaptive` render | **Exists**: `assets/helios-hybrid-adaptive-run-screenshot.png` (report Figure 13) | Reuse; do not recapture |
| B. Core tests pass | Not captured | **Capture** (with C, one image) |
| C. 11-backend validator pass | Not captured | **Capture**: strongest correctness proof |
| D. Same hash across backends | Shown by C (identical hash column), and by the presentation wall `assets/showcase/correctness/backend-correctness-wall.png` | Covered by C and the wall |
| E. CLI backend options | Not captured | **Capture**: shows all seven backends in the real binary |
| F. Stress manifest / controlled timeout | Evidence exists as files; `assets/showcase/evidence/stress-test-summary.png` visualises it | **Capture**: shows the raw evidence file, not a rerun |

That gives **three new captures** (B+C, E, F) plus the existing A.

## Common setup

- Windows Terminal, PowerShell, **Cascadia Mono or Consolas 16 to 18 pt**, dark default theme.
- Window about **1600×900** (or maximise on a 1080p screen). No other windows visible, and no personal paths other than the repository path.
- Start every capture with:
  ```powershell
  cd C:\Users\lorenzodario\Documents\PersonalProjects\Helios
  Clear-Host
  git -c safe.directory=C:/Users/lorenzodario/Documents/PersonalProjects/Helios log -1 --format="%h %s"
  ```
  The first line then proves which commit the capture came from.
- Capture with Win+Shift+S (window mode) and save as PNG at native resolution. Do not crop away the prompt or the typed commands.

## Capture 1: tests and backend validator (B + C)

**File:** `assets/showcase/evidence/terminal-tests-validators.png`
**Use:** report appendix (Table 2 evidence), video segment 10 (backup for the live run), GitHub "Correctness" section.

```powershell
./build-release/helios_tests.exe
python scripts/validate_cli.py --exe ./build-release/helios.exe
python scripts/validate_backends.py --exe ./build-release/helios.exe --mpi-exe ./build-release/helios_mpi.exe --mpiexec mpiexec --openmp
```

Must be visible:
- `All Helios core checks passed`;
- `Validated 12 CLI error cases`;
- all 11 configuration lines with the **same hash** `62e03422975cb8a6` (sequential, openmp ×3, mpi-static ×2, mpi-dynamic ×2, hybrid-static, hybrid-dynamic, hybrid-adaptive);
- the 5 `tiny-*` lines with `d7bfe87ec0142fbb`;
- `Validated 11 backend configurations`.

The whole run takes about 2 s and writes only to a temporary directory.

## Capture 2: CLI and backend options (E)

**File:** `assets/showcase/evidence/terminal-cli-backends.png`
**Use:** video segment 3 (architecture) and the GitHub "Execution backends" section.

```powershell
./build-release/helios.exe --help
```

Must be visible: `Helios 0.1.0 - adaptive hybrid distributed path tracer`, the `--backend` line listing all seven backends, the `--scene` line listing all six scenes, and the scheduler options line (`--fixed-batch`, `--adaptive-initial-batch`, `--adaptive-target-ms`).

## Capture 3: stress-test evidence file (F)

**File:** `assets/showcase/evidence/terminal-stress-manifest.png`
**Use:** video segment 14, report appendix next to Table 13.

This **does not rerun** the stress test; it only prints the recorded manifest.

```powershell
$m = Get-Content results/stress/20260928T111419Z-5832e956/manifest.json -Raw | ConvertFrom-Json
$m | Select-Object run_id, started_utc, ended_utc, elapsed_wall_seconds, timeout_seconds, timed_out, exit_code, git_sha | Format-List
$m.arguments -join ' '
Get-ChildItem results/stress/20260928T111419Z-5832e956 | Select-Object Name, Length
```

Must be visible:
- `elapsed_wall_seconds : 600.3406776`;
- `timeout_seconds : 600`;
- `timed_out : True`;
- an empty `exit_code`;
- the argument line (`--scene scheduler_stress --width 1280 --height 720 --spp 2048 --max-depth 16`);
- the directory listing with `stdout.log` and `stderr.log` at `0` bytes.

## After capturing

1. Check that each PNG is sharp at 100% zoom and that no unrelated window or notification is visible.
2. Add each file to `assets/showcase/SHOWCASE_INDEX.md` (classification: *real terminal capture*), with its date and the commit printed in the first line.
3. Commit locally; do not push.
