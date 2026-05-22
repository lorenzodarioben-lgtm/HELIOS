"""Prepare the report's visual figures (crops of real assets; nothing is redrawn).

  python scripts/report_build/make_visual_figures.py

Writes report/assets/visual/:
  convergence.png           crop of assets/showcase/convergence/convergence-before-after.png (title and footer removed)
  architecture.png          crop of assets/showcase/architecture/architecture-report.png (title and footer removed)
  backend-correctness.png   crop of assets/showcase/correctness/backend-correctness-wall.png (title and footer removed)
  workload-microscope.png   real headless-Edge screenshot of the Observatory Workload Microscope, cropped to its panels
  scheduler-compare.png     real headless-Edge screenshot of the Observatory Scheduler Lab compare view, cropped
Figure 1 (the hero render) is used directly from assets/showcase/hero/helios-hero.png and is not copied.

Observatory captures use recording mode (larger text) at a device pixel ratio of 2, with viewport sizes
chosen so the text stays legible at the report's 17 cm text width. Crop boxes are in CSS pixels,
measured on the page at the same viewport. Run it from PowerShell on Windows (headless Edge).
"""
import sys
from pathlib import Path

from PIL import Image, ImageStat

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "observatory"))
import capture_screenshots as cap  # noqa: E402

OUT = ROOT / "report" / "assets" / "visual"
SCALE = 2
PORT = 8318
# name: (source image, crop box in source pixels)
SHOWCASE_CROPS = {
    "convergence.png": ("assets/showcase/convergence/convergence-before-after.png", (60, 202, 1860, 1014)),
    "architecture.png": ("assets/showcase/architecture/architecture-report.png", (56, 190, 1864, 996)),
    "backend-correctness.png": ("assets/showcase/correctness/backend-correctness-wall.png", (54, 188, 1838, 1000)),
}
# name: (deep link, viewport CSS px, crop box in CSS px)
OBSERVATORY_CROPS = {
    "workload-microscope.png": ("workload?overlay=4", (1600, 1040), (40, 222, 1545, 1019)),
    "scheduler-compare.png": ("scheduler?policy=compare&t=1.9", (1320, 900), (40, 410, 1265, 801)),  # panels only; the notice is in the caption
}


def check(im, name):
    spread = sum(ImageStat.Stat(im.convert("L")).stddev)
    if spread < 10:
        raise SystemExit(f"{name}: image looks blank (stddev {spread:.1f})")
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (src, box) in SHOWCASE_CROPS.items():
        im = check(Image.open(ROOT / src).convert("RGB").crop(box), name)
        im.save(OUT / name, optimize=True)
        print(f"{name}: {im.size[0]}x{im.size[1]} from {src} {box}")
    srv = cap.serve(PORT)
    try:
        for name, (route, (w, h), box) in OBSERVATORY_CROPS.items():
            raw = OUT / f"_{name}"
            cap.capture(f"http://127.0.0.1:{PORT}/assets/observatory/index.html?mode=recording#{route}", raw, w, h, scale=SCALE)
            full = Image.open(raw).convert("RGB")
            raw.unlink()
            if full.size != (w * SCALE, h * SCALE):
                raise SystemExit(f"{name}: unexpected capture size {full.size}")
            im = check(full.crop(tuple(v * SCALE for v in box)), name)
            im.save(OUT / name, optimize=True)
            print(f"{name}: {im.size[0]}x{im.size[1]} from #{route} at {w}x{h} CSS px x{SCALE}, crop {box}")
    finally:
        srv.shutdown()


if __name__ == "__main__":
    main()
