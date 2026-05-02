"""Exploratory 4-slot hybrid composition and documented Microsoft MPI affinity tests."""
import argparse
import json
import os
import random
import statistics
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from benchmark_v2 import GIT, ROOT, command_output, digest, hardware, run_bounded, write_json

CONDITIONS = [
    ("openmp-4", "openmp", 1, 4, []),
    ("mpi-static-4", "mpi-static", 4, 1, []),
    ("hybrid-static-2x2", "hybrid-static", 2, 2, []),
    ("hybrid-dynamic-3x2", "hybrid-dynamic", 3, 2, []),
    ("hybrid-static-2x2-noaffinity", "hybrid-static", 2, 2, ["-affinity_layout", "0"]),
    ("hybrid-static-2x2-physicalcore", "hybrid-static", 2, 2, ["-affinity_layout", "spr:p"]),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--warmups", type=int, default=1)
    parser.add_argument("--timeout", type=float, default=45)
    parser.add_argument("--max-total-seconds", type=float, default=240)
    args = parser.parse_args()
    if not 2 <= args.repeats <= 10 or not 0 <= args.warmups <= 2:
        parser.error("invalid repetitions")
    exe = ROOT / "build-release/helios.exe"
    mpi_exe = ROOT / "build-release/helios_mpi.exe"
    if not exe.is_file() or not mpi_exe.is_file():
        parser.error("Release executables missing")
    ident = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    directory = ROOT / "results/diagnostic/hybrid-v3" / ident
    raw = directory / "raw"
    raw.mkdir(parents=True, exist_ok=False)
    manifest = {"classification": "diagnostic-not-formal", "id": ident, "status": "running",
                "scene": "imbalanced", "preset": "medium", "repeats": args.repeats,
                "warmups": args.warmups, "conditions": [c[0] for c in CONDITIONS],
                "affinity_help": "Microsoft MPI 10.1.12498.52 mpiexec -help2: -affinity_layout 0 disables affinity; spr:p spreads ranks to distinct physical cores",
                "git_sha": command_output(GIT + ["rev-parse", "HEAD"]),
                "source_sha256": digest(ROOT / "src/main.cpp"), "executable_sha256": digest(exe),
                "mpi_executable_sha256": digest(mpi_exe), "hardware": hardware(),
                "openmp_environment": {key: os.environ.get(key) for key in
                                        ("OMP_NUM_THREADS", "OMP_PROC_BIND", "OMP_PLACES", "OMP_DYNAMIC", "GOMP_CPU_AFFINITY")},
                "created_utc": datetime.now(timezone.utc).isoformat()}
    write_json(directory / "manifest.json", manifest)
    records = []
    begun = time.monotonic()
    reference_hash = None

    def invoke(name, backend, ranks, threads, mpi_flags, block, position):
        label = f"{name}-b{block}"
        files = {kind: raw / f"{label}.{kind}" for kind in ("ppm", "stats.json", "run.json")}
        cmd = (["mpiexec"] + mpi_flags + ["-n", str(ranks), str(mpi_exe)] if ranks > 1
               else [str(exe)])
        cmd += ["render", "--backend", backend, "--scene", "imbalanced", "--width", "256",
                "--height", "144", "--spp", "192", "--max-depth", "8", "--seed", "42",
                "--tile", "16", "--threads", str(threads), "--output", str(files["ppm"]),
                "--stats-json", str(files["stats.json"])]
        started = datetime.now(timezone.utc).isoformat()
        start = time.monotonic()
        try:
            code, stdout, stderr = run_bounded(cmd, args.timeout)
        except OSError as exc:
            code, stdout, stderr = 127, "", str(exc)
        row = {"condition": name, "block": block, "position": position, "warmup": block < 0,
               "started_utc": started, "command": cmd, "return_code": code,
               "process_wall_seconds": time.monotonic() - start, "stdout": stdout, "stderr": stderr,
               "files": {k: str(v.relative_to(directory)) for k, v in files.items()}}
        if code == 0 and files["stats.json"].is_file():
            row["stats"] = json.loads(files["stats.json"].read_text(encoding="utf-8"))
            if reference_hash and row["stats"]["image_hash_fnv1a64"] != reference_hash:
                row["validation_error"] = "pixel hash mismatch"
        else:
            row["validation_error"] = "render failed or stats missing"
        write_json(files["run.json"], row)
        records.append(row)
        print(name, block, "exit", code, "render_s", row.get("stats", {}).get("render_wall_seconds"), flush=True)
        return row

    ref = invoke("sequential-reference", "sequential", 1, 1, [], -999, -1)
    if ref.get("stats"):
        reference_hash = ref["stats"]["image_hash_fnv1a64"]
    for block in range(-args.warmups, args.repeats):
        order = list(CONDITIONS)
        random.Random(20260928 + 1009 * (block + args.warmups)).shuffle(order)
        for position, condition in enumerate(order):
            if time.monotonic() - begun >= args.max_total_seconds:
                manifest["status"] = "budget_exhausted"
                break
            invoke(*condition, block, position)
        if manifest["status"] != "running":
            break
    groups = {}
    for name, *_ in CONDITIONS:
        rows = [r for r in records if r["condition"] == name and not r["warmup"] and not r.get("validation_error")]
        if rows:
            groups[name] = {"n": len(rows), "median_seconds": statistics.median(r["stats"]["render_wall_seconds"] for r in rows),
                            "median_rank_compute_seconds": [statistics.median(r["stats"]["workers"][i]["compute_seconds"] for r in rows)
                                                            for i in range(len(rows[0]["stats"]["workers"]))],
                            "median_rank_send_seconds": [statistics.median(r["stats"]["workers"][i]["mpi_send_seconds"] for r in rows)
                                                         for i in range(len(rows[0]["stats"]["workers"]))]}
    write_json(directory / "summary.json", {"classification": "diagnostic-not-formal", "groups": groups})
    manifest["records"] = len(records)
    manifest["failures"] = sum(bool(r.get("validation_error")) for r in records)
    if manifest["status"] == "running":
        manifest["status"] = "complete" if not manifest["failures"] else "failed"
    write_json(directory / "manifest.json", manifest)
    print("Diagnostic:", directory, manifest["status"], flush=True)
    return 0 if manifest["status"] == "complete" else 1


if __name__ == "__main__":
    sys.exit(main())
