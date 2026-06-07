"""Serve the Helios Observatory locally (read-only, offline) and open it in the default browser.

  python scripts/observatory/serve.py [--port 8315] [--no-browser] [--recording] [--route correctness]

Serves the repository root on 127.0.0.1 only, so the Observatory can reference showcase media and
evidence files by relative path. GET/HEAD only: nothing can be written through the server. Serving
over http also lets the Correctness page compute pixel differences live in the browser.
"""
import argparse
import functools
import http.server
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mp4": "video/mp4",
                      ".json": "application/json", ".svg": "image/svg+xml"}

    def log_message(self, fmt, *args):  # keep the console quiet
        pass


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--port", type=int, default=8315)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--recording", action="store_true", help="open in recording mode")
    ap.add_argument("--route", default="", help="section deep link to open, e.g. scheduler?policy=compare")
    a = ap.parse_args()
    handler = functools.partial(Handler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", a.port), handler)
    url = f"http://127.0.0.1:{a.port}/assets/observatory/index.html" + ("?mode=recording" if a.recording else "") + (f"#{a.route}" if a.route else "")
    print(f"Helios Observatory: {url}\n(serving the repository read-only on 127.0.0.1; Ctrl+C to stop)")
    if not a.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
