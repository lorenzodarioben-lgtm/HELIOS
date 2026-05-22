"""Rasterise the report's SVG figures to 3x PNG with headless Microsoft Edge, for embedding in the DOCX.

  python scripts/report_build/rasterise_figures.py <out-dir>

Each SVG is drawn unchanged at its viewBox size on a white page and captured at a device pixel ratio
of 3; nothing is redrawn or cropped. A throw-away Edge profile keeps the capture independent of any
open Edge window. (Replaces rasterise_figures.sh, whose Edge launch fails from some msys shells.)
"""
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EDGE = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
# (svg path, output name, viewBox width, viewBox height)
FIGURES = [
    ("report/assets/optimisation-ab/optimisation-ab.svg", "optimisation-ab", 1100, 760),
    ("results/protocol-v2/20260928T102644Z-100e1393/plots/median-runtime.svg", "median-runtime", 1100, 540),
    ("report/assets/20260928T103934Z-edc10839/speedup.svg", "speedup", 1100, 424),
    ("report/assets/20260928T103934Z-edc10839/efficiency.svg", "efficiency", 1100, 424),
    ("report/assets/20260928T103934Z-edc10839/weak-scaling.svg", "weak-scaling", 1100, 382),
    ("report/assets/20260928T103934Z-edc10839/scheduler-runtime.svg", "scheduler-runtime", 1100, 634),
    ("report/assets/20260928T103934Z-edc10839/scheduler-imbalance.svg", "scheduler-imbalance", 1100, 634),
]


def render(src, out_png, w, h, workdir):
    html = workdir / (out_png.stem + ".html")
    html.write_text('<!doctype html><html><head><style>html,body{margin:0;padding:0;background:#fff}img{display:block}</style></head>'
                    f'<body><img src="{(ROOT / src).as_uri()}" width="{w}" height="{h}"></body></html>', encoding="utf-8")
    out_png.unlink(missing_ok=True)
    subprocess.run([str(EDGE), "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                    f"--user-data-dir={workdir / 'profile'}", "--force-device-scale-factor=3",
                    f"--window-size={w},{h}", f"--screenshot={out_png}", html.as_uri()],
                   check=True, capture_output=True, timeout=90)
    if not out_png.is_file():
        raise SystemExit(f"headless Edge wrote no PNG for {src}")


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "report/rendered/figures").resolve()
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="helios-raster-", ignore_cleanup_errors=True) as tmp:
        for src, name, w, h in FIGURES:
            render(src, out / f"{name}.png", w, h, Path(tmp))
            print(f"{name}.png  {src}")


if __name__ == "__main__":
    main()
