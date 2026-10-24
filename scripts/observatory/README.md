# Observatory tooling

Python tooling behind the [Helios Observatory](../../assets/observatory/README.md). Standard library only, except that `extract_evidence.py` reuses the showcase helpers in `scripts/visual_showcase/` and `scripts/verify_experiment.py`, and the build runs the existing validators. Every script is read-only with respect to `src/`, `include/`, `tests/`, `results/` and `report/`.

| Script | Reads | Writes | Purpose |
|---|---|---|---|
| `extract_evidence.py` | `results/protocol-v2`, `results/diagnostic`, `results/stress`, `results/screenshot`, `assets/showcase`, the report, `git show e2c13e2:…` | nothing (returns data) | Parse every displayed value from saved evidence; re-run the validators in temporary directories; rehash formal images |
| `build_observatory.py` | the extracted data | `assets/observatory/data/*.json`, `data/experiment_capsule.json`, `data/bundle.js` | Normalise into one JSON file per page, compose the overview and the Technical Q&A answers from extracted values, refuse to build if the frozen source changed or any value is NaN or Infinity |
| `validate_observatory.py` | the data, the evidence, the snapshot | `assets/observatory/validation.json` | The checks listed below; exit code 1 on any failure |
| `test_observatory.py` | the data and application files | nothing | 20 unit tests for the tooling and the generated data |
| `serve.py` | the repository | nothing | Read-only local server on 127.0.0.1 (GET/HEAD); options `--port`, `--no-browser`, `--recording`, `--route` |
| `capture_screenshots.py` | the running page | `assets/observatory/screenshots/*.png` (or `--out DIR`) | Real 1920×1080 screenshots with headless Microsoft Edge |
| `make_demo_video.py` | the running page | `assets/observatory/media/observatory-demo.mp4` | 32.9 s silent demo from 49 real captured states (hero, convergence, scheduler replay, workload, case file, correctness, provenance, closing frame); needs `imageio-ffmpeg` |
| `demo_check.py` | `%TEMP%\helios-demo` | PNGs in the same directory | Used by `scripts/helios_demo.ps1`: recompute both render hashes, check the pixel bytes are identical, write PNGs |

## Commands

```bash
python scripts/observatory/build_observatory.py            # about 15 s, includes validators and 916 image rehashes
python scripts/observatory/validate_observatory.py          # a few seconds; --no-integrity skips hashing the 11,214 protected files
python -m unittest discover -s scripts/observatory -p "test_*.py" -v
python scripts/observatory/serve.py                         # http://127.0.0.1:8315/assets/observatory/index.html
python scripts/observatory/capture_screenshots.py           # 13 captures; --only name ..., --query mode=recording, --out DIR
python scripts/observatory/make_demo_video.py               # about 2 minutes of captures; writes only the MP4
powershell -ExecutionPolicy Bypass -File scripts/helios_demo.ps1 [-NoOpen]
```

## What the validator checks

1. Every file under `src/`, `include/`, `tests/` and `results/` in `assets/observatory/provenance/pre-sprint-integrity.json` (11,211 files) is byte-identical to the snapshot. The three report files in the snapshot were revised on purpose in the final report visual integration; check 13 compares them with the experiment capsule instead.
2. `src/`, `include/` and `tests/` are identical to `e2c13e2`, and nothing under them or `results/` is modified or untracked.
3. Every data file is strict JSON (no NaN or Infinity), contains no placeholder strings and no local user paths, and `bundle.js` holds exactly the same data.
4. The 12 formal experiment IDs exist on disk with the right classification (final = FORMAL, historical = HISTORICAL and superseded). Each was rehashed with 0 failures, and the browser's values match each manifest.
5. Every file path referenced by the data or the application exists, and the application references no internet URL.
6. The convergence frames exist in ascending SPP order, and the gallery hashes were recomputed.
7. For the scheduler, every tile ID from 0 to 143 appears once. Ownership matches `tiles.csv`. The dynamic and adaptive events match `trace.csv` row by row (worker, first tile, count, dispatch time). Static has no dispatch events.
8. The workload has 144 tiles with positive times, a consistent spread ratio and deterministic counters.
9. For correctness, there are 7 backends with one hash, recomputed, 0 differing pixels, matching the recorded end-to-end run (report Figure 13). Every layer of the validation stack passed.
10. The stress values match the stress manifest.
11. Every provenance path exists, and every claimed value was found in the report text. The source-inspector excerpts are identical to `git show e2c13e2:<file>`.
12. Classification labels are valid. There are 10 sections with controllers and unique keys, deep-link routes point to real sections, IDs are not duplicated, and each Technical Q&A answer has evidence, a labelled trade-off, limitation or context note and sources.
13. The experiment capsule is consistent, the final report MD, DOCX and PDF match the hashes recorded in the capsule, and the 9 required screenshots exist at 1920×1080.
