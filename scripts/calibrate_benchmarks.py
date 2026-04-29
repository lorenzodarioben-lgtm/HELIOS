"""Bounded sequential probes; calibration data is never formal benchmark evidence."""
import argparse
import json
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRESETS = [("small", 64), ("medium", 192), ("large", 512)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exe", type=Path, default=ROOT / "build-release/helios.exe")
    parser.add_argument("--scene", default="imbalanced")
    parser.add_argument("--width", type=int, default=256)
    parser.add_argument("--height", type=int, default=144)
    parser.add_argument("--depth", type=int, default=8)
    parser.add_argument("--timeout", type=float, default=45)
    parser.add_argument("--max-total-seconds", type=float, default=90)
    parser.add_argument("--outdir", type=Path, default=ROOT / "results/calibration")
    args = parser.parse_args()
    if args.width < 1 or args.height < 1 or args.width * args.height > 2_000_000:
        parser.error("calibration image must contain 1..2,000,000 pixels")
    if not 1 <= args.depth <= 32 or args.timeout <= 0 or args.max_total_seconds <= 0:
        parser.error("invalid depth or time bound")
    exe = args.exe.resolve()
    if not exe.is_file():
        parser.error(f"missing executable: {exe}")
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    directory = args.outdir.resolve() / run_id
    directory.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    rows = []
    for name, spp in PRESETS:
        if time.monotonic() - started >= args.max_total_seconds:
            break
        label = f"{args.scene}-{name}"
        command = [str(exe), "render", "--backend", "sequential", "--scene", args.scene,
                   "--width", str(args.width), "--height", str(args.height), "--spp", str(spp),
                   "--max-depth", str(args.depth), "--tile", "16", "--seed", "42",
                   "--output", str(directory / f"{label}.ppm"),
                   "--stats-json", str(directory / f"{label}.stats.json")]
        elapsed = time.monotonic()
        try:
            result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True,
                                    timeout=min(args.timeout, max(0.1, args.max_total_seconds - (elapsed - started))))
            row = {"preset": name, "scene": args.scene, "width": args.width, "height": args.height,
                   "spp": spp, "max_depth": args.depth, "command": command,
                   "return_code": result.returncode, "stdout": result.stdout, "stderr": result.stderr}
        except subprocess.TimeoutExpired as exc:
            row = {"preset": name, "scene": args.scene, "width": args.width, "height": args.height,
                   "spp": spp, "max_depth": args.depth, "command": command,
                   "return_code": 124, "stdout": (exc.stdout or b"").decode(errors="replace") if isinstance(exc.stdout, bytes) else exc.stdout,
                   "stderr": "TIMEOUT"}
        row["process_wall_seconds"] = time.monotonic() - elapsed
        stats = directory / f"{label}.stats.json"
        if stats.is_file():
            row["stats"] = json.loads(stats.read_text(encoding="utf-8"))
        rows.append(row)
        (directory / f"{label}.run.json").write_text(json.dumps(row, indent=2), encoding="utf-8")
        print(name, "spp", spp, "render_s", row.get("stats", {}).get("render_wall_seconds"),
              "exit", row["return_code"], flush=True)
        if row["return_code"] or "stats" not in row:
            break
    manifest = {"kind": "calibration-only", "run_id": run_id, "created_utc": datetime.now(timezone.utc).isoformat(),
                "timeout_seconds": args.timeout, "max_total_seconds": args.max_total_seconds,
                "presets": [{"name": row["preset"], "scene": row["scene"], "width": row["width"],
                             "height": row["height"], "spp": row["spp"], "max_depth": row["max_depth"],
                             "observed_render_seconds": row.get("stats", {}).get("render_wall_seconds"),
                             "return_code": row["return_code"]} for row in rows]}
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("Calibration:", directory)
    return 1 if len(rows) != len(PRESETS) or any(row["return_code"] for row in rows) else 0


if __name__ == "__main__":
    sys.exit(main())
