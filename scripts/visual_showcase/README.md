# Visual showcase tooling (presentation only)

Generates everything under `assets/showcase/`. It never modifies `src/`, `include/`, `tests/`, `results/` or the report.

- Renders use the frozen Release binaries. `common.check_binaries()` refuses any other `helios.exe`.
- Scratch PPM/JSON go to `assets/showcase/_work/`, which is git-ignored.
- Measurements shown in graphics are read from saved evidence at run time (`evidence_data.py`, `scheduler_data.py`); no values are typed into the drawing code, except two quoted address-probe timings, labelled on the storyboard.
- `compare_strong_scaling.compare()` writes files into an experiment folder, so it is **not** called. `evidence_data.paired_in_memory()` repeats its computation without writing.

Requirements: the Python packages `pillow`, `numpy` and `imageio-ffmpeg` (the last bundles an ffmpeg binary), Windows fonts Segoe UI / Consolas / Bahnschrift, and the MS-MPI `mpiexec` for the correctness renders. Run from this folder:

```powershell
python render_presentation.py correctness   # 7 backends, same showcase config, hashes compared (~20 s)
python render_presentation.py gallery       # 6 scenes, 1920x1080, 1024 SPP (~25 min)
python render_presentation.py wide          # reflective 2400x1000, 1024 SPP (~4 min)
python render_presentation.py convergence   # reflective 1280x720, 1..256 SPP (~1 min)
python scheduler_visualizer.py              # scheduler videos + stills from recorded traces (~15 min)
python evidence_graphics.py all             # tile cost, correctness wall, optimisation, storyboard, dashboard, stress card
python diagrams.py                          # architecture and parallelism layers
python showcase_media.py all                # convergence grid/video/gif, hero, branding, B-roll, reel
python make_index.py                        # gallery/README.md and SHOWCASE_INDEX.md
python validate_showcase.py <pre-sprint sha256 list>   # writes assets/showcase/validation.json
```

| File | Role |
|---|---|
| `common.py` | paths, frozen-binary check, render runner, PPM reading, independent hash check |
| `style.py` | palette, fonts and a supersampled drawing canvas |
| `render_presentation.py` | presentation renders: gallery, wide hero, convergence, backend correctness |
| `scheduler_data.py` | loads recorded traces and tile CSVs; documents exactly what is recorded and what is derived |
| `scheduler_visualizer.py` | scheduler dashboards, comparison, stills and trace validation |
| `evidence_data.py` | read-only loaders for strong scaling, scheduler pairs, the A/B and stress evidence |
| `evidence_graphics.py` | evidence graphics |
| `diagrams.py` | code-structure diagrams |
| `showcase_media.py` | convergence media, hero, branding, B-roll, reel |
| `video.py` | H.264 encoding, GIF previews, decode-based probing |
| `make_index.py` | gallery README and showcase index |
| `validate_showcase.py` | end-to-end validation |
