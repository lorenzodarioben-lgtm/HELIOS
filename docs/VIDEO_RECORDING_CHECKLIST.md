# Video recording checklist

Use with [VIDEO_PLAN.md](VIDEO_PLAN.md) and [VIDEO_SCRIPT.md](VIDEO_SCRIPT.md). Nothing here changes the report or the evidence. The main window is the Helios Observatory ([assets/observatory/README.md](../assets/observatory/README.md)).

## Do not

- [ ] Do not rerun formal benchmarks (`scripts/benchmark_v2.py`).
- [ ] Do not rerun the stress test (`scripts/run_supervised_stress.ps1`). It is shown from `results/stress/20260928T111419Z-5832e956/` through the Observatory only.
- [ ] Do not rebuild the Observatory data (`build_observatory.py`) on the day; use the committed build that passed validation.
- [ ] Do not write anything into `results/`. The live demo writes only to `%TEMP%\helios-demo`.
- [ ] Do not edit or save any file open in VS Code during recording.

## One day before

- [ ] Run `python scripts/observatory/validate_observatory.py` and confirm `validation.json` reports every check passed.
- [ ] Read the script aloud once with a timer. Each segment should land within ±10 s of its slot, and the total should be about 12:15 to 13:00.
- [ ] Rehearse segment 5 (Scheduler Lab tabs and the **T** trace inspector), segment 7 (terminal) and segment 9 (case file with the *Code ↔* jump and Alt+← back) twice.
- [ ] Check the recorder: 1920×1080, 30 fps, microphone input, system audio off. OBS or the Windows Snipping Tool screen recording both work.

## Immediately before recording (in this order)

1. [ ] **Open PowerShell (Windows Terminal) and run the demo once off camera.** This warms up MPI and confirms the source, binaries, tests, validator and hashes:
   ```powershell
   # PowerShell, at the repository root
   powershell -ExecutionPolicy Bypass -File scripts/helios_demo.ps1 -NoOpen
   ```
   Expect `[1/7]` to `[7/7]`, `pixel bytes identical: YES`, `matches the recorded showcase hash 57881d257daf2474: YES` and the green RESULT line. If anything fails, **stop**: the wrong binary or source is in use.
2. [ ] Run `Clear-Host`. Set the terminal font to 18 to 20 pt and widen the window so a render line wraps at most once.
3. [ ] **Start the Observatory** in a second PowerShell window (leave it running; it serves 127.0.0.1 only and is read-only):
   ```powershell
   python scripts/observatory/serve.py --recording
   ```
   In the browser window that opens (the default browser; Edge and Chrome both work), press F11 for full screen.
   - Check the edge line at the top right: `Frozen e2c13e2 · i7-11370H 4C/8T · Formal evidence VERIFIED`.
   - Press **P** and step through O1 to O11 once with →: hero, convergence, parallelism layers, workload microscope, scheduler replay, strong scaling, case file, correctness, stress, provenance, closing frame. The label at the bottom right shows `n / 11` and the section name; a thin amber line along the bottom edge shows progress.
   - On O8, click **Compare** once: the line must read `Different pixels: 0 of 360,000, computed in the browser`. (If it says "counted by the build", the page was opened from a file instead of the server; reopen it through `serve.py`.)
   - Press ← until O1, or Esc then **P** again, so presentation starts on O1.
4. [ ] VS Code:
   - open the repository with tabs `src/core.cpp` and `src/main.cpp`;
   - set the editor font to 18 to 20 px (Ctrl+=), turn the minimap off, turn word wrap on (Alt+Z) and hide the sidebar (Ctrl+B);
   - check that Ctrl+G jumps work (`core.cpp` 340, 241; `main.cpp` 127, 212, 273, 190, 173).
5. [ ] Close or hide everything else. Turn on Do Not Disturb (Focus), mute notifications and close chat/email. Plug in the laptop charger.
6. [ ] Put the script on a second screen or on paper, not in a recorded window.
7. [ ] Start with the Observatory on O1 in front. Take a breath, then **press Record**.

## During recording (switch points)

| Time | Window | First action |
|---|---|---|
| 0:00 | Observatory O1 | Hero and edge line |
| 0:40 | O2 | → ; convergence plays; click the image; scroll to the pipeline, click *BVH traversal* |
| 1:30 | O3 | → ; layers; tabs *OpenMP 4*, *MPI 4×1*, *Hybrid 2×2* |
| 2:30 | O4 | → ; hover tile 74, then tile 0; scroll to the partition cap |
| 3:30 | O5 | → ; compare replay; tabs *Static*, *Fixed dynamic*, *Adaptive* (open the explanation); **T**, then Esc |
| **5:00** | **VS Code** | `core.cpp` 340, 241; `main.cpp` 127, 212, 273, 190, 173 |
| **6:00** | **Terminal** | **Run the demo (about 6:00)**, point at steps 1 to 7, then `Invoke-Item` the PNG |
| 7:15 | Observatory, → for O6 | Speedup bars; click *OpenMP 8*; *Scheduler* tab |
| 8:20 | O7 | → ; case file; Historical/Final; *Code ↔*, Alt+←; *Optimisation A/B* |
| 9:45 | O8 | → ; hashes; **Compare**; validation stack |
| 10:30 | O9 | → ; 600.34 s; commands; outcomes; scroll to validity constraints |
| 11:20 | O10 | → ; click the chain stages; *Experiment browser* |
| 12:00 | O11 | → ; closing frame; stop recording at about 12:40 |

If the browser lands on the wrong page, press the section number key (1 Overview … 0 Technical Q&A) or → / ← in the Guided Tour; every page is also a deep link (see the plan's item table).

### Manual fallback (if the demo script fails on camera)

Say what happened, then run the underlying commands one at a time:

```powershell
$v = Join-Path $env:TEMP 'helios-demo'; New-Item -ItemType Directory -Force $v | Out-Null
$repo = (Get-Location).Path -replace '\\', '/'
git -c safe.directory=$repo diff --stat e2c13e2 HEAD -- src include tests
mpiexec -n 3 ./build-release/helios_mpi.exe render --backend hybrid-adaptive --scene showcase --width 800 --height 450 --spp 64 --max-depth 8 --seed 42 --threads 2 --output "$v/hybrid-adaptive.ppm" --stats-json "$v/hybrid-adaptive.json"
./build-release/helios.exe render --backend sequential --scene showcase --width 800 --height 450 --spp 64 --max-depth 8 --seed 42 --output "$v/sequential.ppm" --stats-json "$v/sequential.json"
./build-release/helios_tests.exe
python scripts/validate_backends.py --exe ./build-release/helios.exe --mpi-exe ./build-release/helios_mpi.exe --mpiexec mpiexec --openmp
```

If the live run cannot be completed at all, show Provenance → claim *End-to-end hybrid-adaptive run* and the report's Figure 13, stated honestly as the recorded run from 2026-09-28.

## After recording

- [ ] Watch it once end to end. Check that the terminal text and Observatory labels are readable at 1080p, the audio is clear, and the length is at least 10:00.
- [ ] Check that no personal notifications or unrelated windows appear.
- [ ] Stop the Observatory server (Ctrl+C in its window). Temp outputs in `%TEMP%\helios-demo` can be deleted; they are not evidence.
- [ ] Confirm the repository is unchanged: from the repository root, `git -c safe.directory=$((Get-Location).Path -replace '\\','/') status --short` should show only the untracked `HANDOFF.md`.
- [ ] Record the video's file name, length and date in `HANDOFF.md` and in `docs/TASKSHEET_TRACEABILITY.md` (video row).
