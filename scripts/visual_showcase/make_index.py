"""Write assets/showcase/gallery/README.md and assets/showcase/SHOWCASE_INDEX.md from the produced files.

Dimensions and durations are read from the files themselves; provenance comes from the JSON sidecars.
"""
import json

from PIL import Image

from common import ROOT, SHOWCASE, rel
from video import probe

M, D, P = "measured", "derived from measured data", "presentation"


def dims(p):
    if p.suffix == ".mp4":
        n, w, h, fps = probe(p)
        return f"{w}×{h}, {n / fps:.1f} s @ {fps:g} fps"
    if p.suffix == ".gif":
        with Image.open(p) as im:
            return f"{im.size[0]}×{im.size[1]}, {getattr(im, 'n_frames', 1)} frames"
    with Image.open(p) as im:
        return f"{im.size[0]}×{im.size[1]}"


def gallery_readme():
    g = json.loads((SHOWCASE / "gallery" / "gallery.json").read_text())
    wide = SHOWCASE / "gallery" / "reflective-wide.json"
    rows = g["renders"] + ([json.loads(wide.read_text())["render"]] if wide.exists() else [])
    lines = ["# Helios render gallery", "",
             "**Presentation renders, not formal benchmark evidence.** Every image is the unmodified output of the frozen Helios "
             "Release binary (source `e2c13e2`, `helios.exe` SHA-256 `" + g["helios_exe_sha256"][:16] + "…`), losslessly converted "
             "from PPM to PNG. Render times are single informational runs on the development laptop, not benchmarks; several renders ran while other showcase work was encoding, so the times are not comparable with each other.", "",
             f"Generated {g['generated_utc']} at Git HEAD `{g['git_head'][:7]}` by `scripts/visual_showcase/render_presentation.py`. "
             "Hashes are the renderer's FNV-1a pixel hash, recomputed independently from each PPM.", "",
             "| Image | Scene | Resolution | SPP | Max depth | Seed | Backend | Render time | Hash |",
             "|---|---|---|---:|---:|---:|---|---:|---|"]
    for r in rows:
        png = rel(ROOT / r["png"]).split("/")[-1]
        lines.append(f"| `{png}` | `{r['scene']}` | {r['width']}×{r['height']} | {r['spp']} | {r['max_depth']} | {r['seed']} | "
                     f"{r['backend']}, {r['threads']} threads, dynamic OpenMP schedule | {r['render_seconds']:.1f} s | `{r['hash_fnv1a64']}` |")
    lines += ["", "Exact commands (run from the repository root):", "", "```powershell"]
    lines += [r["command"] for r in rows]
    lines += ["```", "", "The PPM files are written to `assets/showcase/_work/` and are not committed (see `assets/showcase/.gitignore`). "
              "Rerunning a command reproduces the same hash with the same binary.", ""]
    (SHOWCASE / "gallery" / "README.md").write_text("\n".join(lines), encoding="utf-8")


ENTRIES = [
    # (path, type, source evidence, classification, values, recommended use)
    ("hero/helios-hero.png", "PNG", "gallery `reflective` render, 1024 SPP (lossless copy)", P, "real render", "report Figure 1, GitHub hero, video"),
    ("hero/helios-hero-wide.png", "PNG", "separate 2400×1000 `reflective` render (real render, not a crop)", P, "real render", "GitHub banner, portfolio"),
    ("gallery/reflective-hero.png", "PNG", "frozen binary, see gallery/README.md", P, "real render", "gallery, hero"),
    ("gallery/showcase-hero.png", "PNG", "frozen binary, see gallery/README.md", P, "real render", "gallery"),
    ("gallery/bvh_stress-hero.png", "PNG", "frozen binary, see gallery/README.md", P, "real render", "gallery"),
    ("gallery/uniform-hero.png", "PNG", "frozen binary, see gallery/README.md", P, "real render", "gallery"),
    ("gallery/imbalanced-hero.png", "PNG", "frozen binary, see gallery/README.md", P, "real render", "gallery; tile imagery in scheduler visuals"),
    ("gallery/scheduler_stress-hero.png", "PNG", "frozen binary, see gallery/README.md", P, "real render", "gallery (the stress-test scene)"),
    ("gallery/reflective-wide.png", "PNG", "frozen binary, see gallery/README.md", P, "real render", "source for the wide hero"),
    ("convergence/convergence-grid.png", "PNG", "9 renders, convergence/convergence.json", P, "real renders; times informational", "GitHub"),
    ("convergence/convergence-before-after.png", "PNG", "1 SPP and 256 SPP frames", P, "real renders", "report Figure 2 (cropped), video, GitHub"),
    ("convergence/convergence.mp4", "MP4", "9 renders, hard cuts only", P, "real renders", "video segment 2 (P2)"),
    ("convergence/convergence.gif", "GIF", "from convergence.mp4", P, "real renders", "GitHub"),
    ("scheduler/scheduler-static.mp4", "MP4", "formal 20260928T103934Z-edc10839, imbalanced-medium-mpi-static-r3-t1-co-b1 tiles.csv", "formal (visualised)", D, "video B-roll"),
    ("scheduler/scheduler-fixed-dynamic.mp4", "MP4", "formal …-mpi-dynamic-r3-t1-all-b0 trace.csv + tiles.csv", "formal (visualised)", D, "video B-roll"),
    ("scheduler/scheduler-adaptive.mp4", "MP4", "formal …-hybrid-adaptive-r3-t1-all-b5 trace.csv + tiles.csv", "formal (visualised)", D, "video B-roll"),
    ("scheduler/scheduler-comparison.mp4", "MP4", "the three runs above, aligned at t = 0 on one real-time axis", "formal (visualised)", D, "video segment 12 (P7), GitHub, reel"),
    ("scheduler/scheduler-comparison-preview.gif", "GIF", "from scheduler-comparison.mp4", "formal (visualised)", D, "GitHub"),
    ("scheduler/scheduler-static-still.png", "PNG", "static run at t = 2.000 s", "formal (visualised)", D, "report, GitHub"),
    ("scheduler/scheduler-dynamic-still.png", "PNG", "fixed dynamic run at t = 1.150 s", "formal (visualised)", D, "report, GitHub"),
    ("scheduler/scheduler-adaptive-still.png", "PNG", "adaptive run at t = 0.300 s (batches of 5 and 8 visible)", "formal (visualised)", D, "report, GitHub"),
    ("scheduler/scheduler-comparison-still.png", "PNG", "all three runs at t = 1.900 s", "formal (visualised)", D, "GitHub (report Figure 14 uses the Observatory Scheduler Lab)"),
    ("scheduler/scheduler-trace-validation.json", "JSON", "cross-checks of every displayed timeline against the recorded evidence", "provenance", M, "audit"),
    ("scheduler/tile-cost-map.png", "PNG", "formal 20260928T102644Z-100e1393 sequential tiles.csv, median of 7 runs", "formal (visualised)", M, "GitHub (report Figure 4 uses the Observatory Workload Microscope)"),
    ("scheduler/tile-cost-static-partitions.png", "PNG", "same tile costs; equal-count partitions", "formal (visualised)", D, "GitHub, portfolio"),
    ("correctness/backend-correctness-wall.png", "PNG", "7 presentation renders, correctness/backend-correctness.json", P, "real hashes", "report Figure 5 (cropped), GitHub"),
    ("correctness/backend-correctness.json", "JSON", "backend, command, hash, recomputed hash, informational runtime, output path", "provenance", M, "audit"),
    ("correctness/thumbs/*.png (7)", "PNG", "the 7 backend outputs, 800×450", P, "real renders", "wall inputs"),
    ("performance/optimisation-before-after.png", "PNG", "diagnostic A/B 20260928T101701Z-0de80589 summary.json", "diagnostic (visualised)", M, "GitHub (the report keeps the native chart, Figure 6)"),
    ("performance/performance-investigation-story-16x9.png", "PNG", "historical 301480e3, diagnostic A/B, formal 100e1393; report Section 5", "historical + diagnostic + formal", M, "video P8, GitHub"),
    ("performance/performance-investigation-story.png", "PNG", "same, tall report/portfolio layout", "historical + diagnostic + formal", M, "portfolio, appendix"),
    ("performance/helios-performance-dashboard.png", "PNG", "formal aggregates of the six frozen-source experiments", "formal (visualised)", M, "video P11, GitHub"),
    ("evidence/stress-test-summary.png", "PNG", "results/stress/20260928T111419Z-5832e956 manifest.json + environment.json + logs", "formal evidence (visualised)", M, "video P10"),
    ("architecture/architecture-report.png", "PNG", "structure of src/core.cpp and src/main.cpp", "diagram", "illustrative (no values)", "report Figure 3 (cropped), GitHub"),
    ("architecture/architecture-video.png", "PNG", "same, video title", "diagram", "illustrative (no values)", "video P4"),
    ("architecture/parallelism-layers.png", "PNG", "render_tile and run_mpi structure; background is a real render", "diagram", "illustrative; tile colours schematic", "video, GitHub"),
    ("branding/helios-title-16x9.png", "PNG", "hero render + wordmark", P, "real render", "video P1, reel"),
    ("branding/helios-github-header.png", "PNG", "wide hero render + wordmark", P, "real render", "GitHub header / social preview"),
    ("video/hero-slow-zoom.mp4", "MP4", "hero render, 7% slow zoom", P, "real render", "video B-roll"),
    ("video/gallery-montage.mp4", "MP4", "the 6 gallery renders, crossfades between different images", P, "real renders", "video P12"),
    ("video/correctness-wall-reveal.mp4", "MP4", "correctness wall, cards revealed in order", P, "real hashes", "video B-roll"),
    ("video/performance-story-reveal.mp4", "MP4", "storyboard, cards revealed in order", "historical + diagnostic + formal", M, "video B-roll"),
    ("video/optimisation-reveal.mp4", "MP4", "before/after chart, builds revealed in order", "diagnostic (visualised)", M, "video B-roll"),
    ("video/helios-showcase-reel.mp4", "MP4", "silent reel assembled only from the assets above", "mixed (labelled on screen)", "as its sources", "portfolio, GitHub link"),
    ("video-presenter.html", "HTML", "local playback page for recording (no data)", "tooling", "–", "recording the video"),
    ("validation.json", "JSON", "scripts/visual_showcase/validate_showcase.py output", "provenance", "–", "audit"),
]


def index():
    lines = ["# Showcase index", "",
             "Every file under `assets/showcase/`, with its source evidence and how to read its values. Produced by "
             "`scripts/visual_showcase/` (presentation tooling only; `src/`, `include/`, `tests/` and all formal evidence are untouched). "
             "Validation results: `validation.json`.", "",
             "Classification:",
             "- **formal (visualised)**: drawn directly from Protocol V2 evidence on the frozen source.",
             "- **diagnostic** / **historical**: from `results/diagnostic/` or the pre-fix formal runs, labelled on the image.",
             "- **presentation**: renders made with the frozen binary for show; not benchmark evidence.",
             "- **diagram**: illustrates code structure; contains no measurements.", "",
             "Values column: *measured* = numbers read from evidence files at render time; *derived* = computed from measured records "
             "(for example tile start times from recorded compute seconds; see `scripts/visual_showcase/scheduler_data.py`); "
             "*real render* = pixels are Helios output.", "",
             "| File | Type | Dimensions | Source evidence | Classification | Values | Recommended use |",
             "|---|---|---|---|---|---|---|"]
    for path, typ, src, cls, vals, use in ENTRIES:
        p = SHOWCASE / path
        if "*" in path:
            d = "800×450 each"
        elif p.exists():
            d = dims(p) if typ in ("PNG", "MP4", "GIF") else "–"
        else:
            d = "**missing**"
        lines.append(f"| `{path}` | {typ} | {d} | {src} | {cls} | {vals} | {use} |")
    lines += ["", "Real terminal screenshots still to be captured manually are listed in `docs/TERMINAL_EVIDENCE_CAPTURE_PLAN.md`; "
              "add them here once captured.", ""]
    (SHOWCASE / "SHOWCASE_INDEX.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    gallery_readme()
    index()
    print("ok")
