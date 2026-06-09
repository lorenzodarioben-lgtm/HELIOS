"""Capture REAL screenshots of the running Observatory with headless Microsoft Edge (Windows).

  python scripts/observatory/capture_screenshots.py [--out DIR] [--size 1920x1080] [--scale 1] [--only name ...] [--query mode=recording]

Starts the read-only local server, loads each deep link in headless Edge and saves a PNG. These are
screenshots of the actual application with its generated evidence data, not mock-ups.
"""
import argparse
import functools
import http.server
import subprocess
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EDGE = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
SHOTS = [
    ("overview", "overview"),
    ("render-lab", "render?spp=4"),
    ("workload-microscope", "workload?overlay=4&tile=74"),
    ("scheduler-lab", "scheduler?policy=adaptive&t=0.9"),
    ("scheduler-compare", "scheduler?policy=compare&t=1.9"),
    ("hardware-hybrid", "hardware?config=affinity"),
    ("performance-lab", "performance?view=speedup"),
    ("performance-case", "performance?view=case"),
    ("correctness", "correctness"),
    ("stress", "stress"),
    ("provenance", "provenance?panel=chains&chain=strong"),
    ("technical-qna", "defence?q=q08"),
    ("closing", "overview?panel=close"),
]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve(port):
    handler = functools.partial(Quiet, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def capture(url, out, w, h, budget=6000, attempts=3, scale=1.0):
    """Headless Edge occasionally hangs on exit; retry with a fresh process instead of waiting forever.
    A throw-away profile keeps it independent of a normal Edge window: with the default profile, a
    launch while Edge is open is handed to that browser and no screenshot is written."""
    out = Path(out).resolve()  # Edge's launcher resolves a relative --screenshot path against another directory
    out.unlink(missing_ok=True)
    for attempt in range(1, attempts + 1):
        with tempfile.TemporaryDirectory(prefix="helios-edge-") as profile:
            try:
                subprocess.run([str(EDGE), "--headless=new", "--disable-gpu", "--hide-scrollbars", "--mute-audio", "--no-first-run",
                                f"--user-data-dir={profile}", f"--force-device-scale-factor={scale}",
                                f"--window-size={w},{h}", f"--virtual-time-budget={budget}", f"--screenshot={out}", url],
                               check=True, capture_output=True, timeout=60)
            except subprocess.TimeoutExpired:
                if attempt == attempts:
                    raise
                print(f"  headless Edge timed out on {out.name}; retrying ({attempt + 1}/{attempts})")
                continue
        if out.is_file():
            return
        if attempt == attempts:
            raise RuntimeError(f"headless Edge wrote no screenshot for {url}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default=str(ROOT / "assets/observatory/screenshots"))
    ap.add_argument("--size", default="1920x1080")
    ap.add_argument("--scale", type=float, default=1.0, help="device pixel ratio, e.g. 2 for print-quality crops")
    ap.add_argument("--port", type=int, default=8316)
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--query", default="", help="extra query string, e.g. mode=recording")
    a = ap.parse_args()
    w, h = map(int, a.size.split("x"))
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    srv = serve(a.port)
    try:
        for name, route in SHOTS:
            if a.only and name not in a.only:
                continue
            url = f"http://127.0.0.1:{a.port}/assets/observatory/index.html" + (f"?{a.query}" if a.query else "") + f"#{route}"
            target = out / f"{name}.png"
            capture(url, target, w, h, scale=a.scale)
            print(target.name)
    finally:
        srv.shutdown()


if __name__ == "__main__":
    main()
