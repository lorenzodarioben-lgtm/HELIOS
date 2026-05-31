# GitHub visual story (plan only)

The README has **not** been rewritten. This is the recommended order and asset list for a future README. It uses files under `assets/showcase/` (provenance in [`assets/showcase/SHOWCASE_INDEX.md`](../assets/showcase/SHOWCASE_INDEX.md)) and the Helios Observatory under `assets/observatory/` (see [`assets/observatory/README.md`](../assets/observatory/README.md)). GitHub renders PNG and GIF inline; an MP4 must be linked, or uploaded through the web editor as a user-attachment video.

| # | README block | Asset(s) | Notes |
|---|---|---|---|
| 1 | **Hero** | `assets/showcase/branding/helios-github-header.png` (1280×640, also usable as the repository social preview); fallback `assets/showcase/hero/helios-hero-wide.png` | Real render of the `reflective` scene with a title treatment |
| 2 | **One-sentence summary** | text | "Helios is a deterministic C++20 distributed rendering engine (CPU ray tracing for Monte Carlo light transport) that renders the same bit-identical image through seven execution backends (sequential, OpenMP, MPI static and dynamic, and three hybrid MPI + OpenMP modes including throughput-adaptive batching), built to measure how scheduling strategies handle an irregular workload." |
| 3 | **Showcase reel** | `assets/showcase/video/helios-showcase-reel.mp4` (linked or uploaded) | The short motion overview; one line of caption |
| 4 | **Helios Observatory** | `assets/observatory/screenshots/overview.png` (inline), linking to `assets/observatory/media/observatory-demo.mp4` (32.9 s, silent, real captured states) | Caption: "An offline evidence explorer built from the saved experiment files: `python scripts/observatory/serve.py`." Add one sentence saying it never reruns or edits measurements |
| 5 | **Motion: the scheduler** | `assets/showcase/scheduler/scheduler-comparison-preview.gif` (inline) linking to `scheduler-comparison.mp4`, or `assets/observatory/screenshots/scheduler-compare.png` | Caption: "Recorded scheduler evidence from formal experiment 20260928T103934Z-edc10839, not a simulation; the static timeline is reconstructed from recorded tile times." Use only one of the two, to keep a single animation above the fold |
| 6 | **Architecture** | `assets/showcase/architecture/architecture-report.png`, then `parallelism-layers.png` | One shared `render_tile`; backends differ only in who renders which tile |
| 7 | **Performance dashboard** | `assets/showcase/performance/helios-performance-dashboard.png`; optionally `assets/observatory/screenshots/performance-lab.png` | Frozen-source headline results; link to the report for the tables |
| 8 | **Correctness** | `assets/observatory/screenshots/correctness.png` or `assets/showcase/correctness/backend-correctness-wall.png` (+ `terminal-tests-validators.png` once captured) | "Every backend produces hash 57881d257daf2474" |
| 9 | **Render gallery** | `assets/showcase/gallery/*-hero.png` as a 2×3 grid of thumbnails; `assets/showcase/convergence/convergence.gif` | Label them "presentation renders" |
| 10 | **Performance engineering story** | `assets/observatory/screenshots/performance-case.png` or `assets/showcase/performance/performance-investigation-story-16x9.png`, and `optimisation-before-after.png` | Keep the caveat about the historical 4.707 s |
| 11 | **Reproduction** | code blocks: build (`scripts/build.ps1`), the one-click check `scripts/helios_demo.ps1`, the Observatory (`scripts/observatory/serve.py`), and the report's Appendix A and B | The demo writes only to `%TEMP%\helios-demo` |
| 12 | **Evidence and methodology** | links to `report/HELIOS_FINAL_REPORT.pdf`, `docs/BENCHMARKS.md`, `results/protocol-v2/`, `assets/observatory/data/experiment_capsule.json` | State Protocol V2 briefly: warm-up, 7 randomised blocks, paired bootstrap, hash verification |

Guidance:
- Put at most one animated GIF above the fold (item 5). The convergence GIF goes lower, in the gallery.
- Keep captions factual. "Recorded", "reconstructed", "presentation render" and "formal result" mean different things; use them as the Observatory and the showcase index do.
- Do not quote a speedup without its baseline and workload ("2.97× over sequential, medium imbalanced workload, 4-core laptop").
- Present the Observatory as supporting tooling. The first technical line of the README should describe the C++20 / MPI / OpenMP engine.
