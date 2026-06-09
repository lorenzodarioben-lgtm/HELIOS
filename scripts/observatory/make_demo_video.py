"""Make a short silent demo MP4 of the Observatory from REAL captured application states.

  python scripts/observatory/make_demo_video.py [--out assets/observatory/media/observatory-demo.mp4]

Every frame is a headless-Edge screenshot of the running Observatory (recording mode, 1920x1080) at
a deep link: the hero, the convergence viewer at each recorded SPP, the scheduler compare view at
successive replay times, the workload microscope, the case file, correctness, provenance and the closing frame. Frames
are held and joined with short cross-fades; nothing is drawn or animated that the page did not show.
Headless Edge cannot screenshot a scrolled page (it returns a blank image), so the convergence states,
which sit below the fold, are captured in a 1920x2400 window without scrolling and cropped to the
1920x1080 convergence band (its position measured in recording mode at 1920 px).
Captures go to a temporary directory; the only file written in the repository is the MP4.
Needs imageio-ffmpeg (as the showcase tooling does).
"""
import argparse
import json
import sys
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "visual_showcase"))
import capture_screenshots as cap  # noqa: E402
from video import encode  # noqa: E402

ROOT = cap.ROOT
FPS = 30
FADE = 8  # frames
CONV_CROP_TOP = 1224  # the convergence band spans y 1223-2304 in recording mode at 1920 px wide


def plan():
    conv = json.loads((ROOT / "assets/observatory/data/convergence.json").read_text(encoding="utf-8"))
    sched = json.loads((ROOT / "assets/observatory/data/scheduler.json").read_text(encoding="utf-8"))
    t_end = max(p["wall_seconds"] for p in sched["policies"].values())
    steps = [("overview", 3.0)]
    steps += [(f"render?spp={f['spp']}", 0.45) for f in conv["frames"]]
    steps[-1] = (steps[-1][0], 1.2)
    n = int(t_end / 0.1) + 1
    steps += [(f"scheduler?policy=compare&t={min(t_end, i * 0.1):.2f}", 0.2) for i in range(n)]
    steps[-1] = (steps[-1][0], 1.5)
    steps += [("workload?overlay=4&tile=74", 3.0), ("performance?view=case", 3.0), ("correctness", 3.0),
              ("provenance?panel=chains&chain=strong", 3.0), ("overview?panel=close", 3.0)]
    return steps


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(ROOT / "assets/observatory/media/observatory-demo.mp4"))
    ap.add_argument("--port", type=int, default=8317)
    a = ap.parse_args()
    steps = plan()
    srv = cap.serve(a.port)
    frames = []
    try:
        with tempfile.TemporaryDirectory(prefix="helios-observatory-video-") as tmp:
            shots = []
            for i, (route, _) in enumerate(steps):
                p = Path(tmp) / f"{i:03d}.png"
                tall = route.startswith("render?")
                # the hero montage changes render every 4.6 s: capture it at rest on the first render, not mid-crossfade
                budget = 3500 if route == "overview" else 6000
                cap.capture(f"http://127.0.0.1:{a.port}/assets/observatory/index.html?mode=recording#{route}", p, 1920, 2400 if tall else 1080, budget=budget)
                im = Image.open(p).convert("RGB")
                shots.append((im.crop((0, CONV_CROP_TOP, 1920, CONV_CROP_TOP + 1080)) if tall else im).copy())
                print(f"{i + 1}/{len(steps)} {route}")
            section = lambda r: r.split("?")[0]
            for i, ((route, hold), im) in enumerate(zip(steps, shots)):
                if i and section(steps[i - 1][0]) != section(route):
                    prev = shots[i - 1]
                    frames += [Image.blend(prev, im, (k + 1) / (FADE + 1)) for k in range(FADE)]
                frames += [im] * max(1, round(hold * FPS))
    finally:
        srv.shutdown()
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    encode(frames, out, fps=FPS, size=(1920, 1080), crf=24)
    print(f"{out.name}: {len(frames) / FPS:.1f} s, {len(steps)} captured states, {out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
