"""Compare the two demo renders and convert them to PNG (used by scripts/helios_demo.ps1).

  python scripts/observatory/demo_check.py <demo-dir> [--expect HASH]

Reads <demo-dir>/{sequential,hybrid-adaptive}.{ppm,json}. For each image it recomputes the FNV-1a
hash of the pixel bytes independently (scripts/verify_experiment.py) and checks it against the hash
the renderer wrote to its stats JSON; then it checks that both images are byte-identical. PNGs are
written next to the PPMs. Writes nothing outside <demo-dir>. Exit code 1 on any mismatch.
"""
import argparse
import json
import re
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verify_experiment import ppm_hash  # noqa: E402


def read_ppm(path):
    data = path.read_bytes()
    m = re.match(rb"P6\n(\d+) (\d+)\n255\n", data)
    if not m:
        raise SystemExit(f"{path.name}: not a binary PPM")
    return int(m[1]), int(m[2]), data[m.end():]


def write_png(path, w, h, rgb):
    """Minimal lossless RGB PNG writer (no third-party packages)."""
    rows = b"".join(b"\x00" + rgb[y * w * 3:(y + 1) * w * 3] for y in range(h))

    def chunk(tag, body):
        return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("demo_dir")
    ap.add_argument("--expect", help="hash recorded for this configuration elsewhere (informational)")
    a = ap.parse_args()
    d = Path(a.demo_dir)
    ok, hashes, pixels = True, {}, {}
    for name in ("sequential", "hybrid-adaptive"):
        stats = json.loads((d / f"{name}.json").read_text(encoding="utf-8"))
        w, h, px = read_ppm(d / f"{name}.ppm")
        recomputed = ppm_hash(d / f"{name}.ppm", w, h)
        reported = stats["image_hash_fnv1a64"]
        same = recomputed == reported
        ok &= same
        hashes[name], pixels[name] = recomputed, px
        print(f"  {name:<16} renderer hash {reported}  recomputed {recomputed}  {'OK' if same else 'MISMATCH'}"
              f"  ({stats['render_wall_seconds']:.3f} s render, {stats.get('ranks', 1)} rank(s) x {stats.get('threads_per_rank', stats.get('threads', 1))} thread(s))")
        write_png(d / f"{name}.png", w, h, px)
    identical = pixels["sequential"] == pixels["hybrid-adaptive"]
    ok &= identical
    print(f"  pixel bytes identical: {'YES' if identical else 'NO'} ({len(pixels['sequential']) // 3:,} pixels)")
    if a.expect:
        print(f"  matches the recorded showcase hash {a.expect}: {'YES' if hashes['sequential'] == a.expect else 'NO'}")
    print(f"  PNGs: {d / 'sequential.png'}  {d / 'hybrid-adaptive.png'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
