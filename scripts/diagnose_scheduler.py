"""Bounded exploratory scheduler sweeps; never label these as formal evidence."""
import argparse
import json
import random
import statistics
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from benchmark_v2 import GIT, ROOT, command_output, digest, hardware, run_bounded, write_json


def conditions(group):
    if group == "core":
        return [("static", "mpi-static", [], False),
                ("fixed-1", "mpi-dynamic", [], True),
                ("adaptive-50", "hybrid-adaptive", [], True)]
    if group == "fixed":
        return [(f"fixed-{n}", "mpi-dynamic", ["--fixed-batch", str(n)], True)
                for n in (1, 2, 4, 8, 16, 32)]
    if group == "adaptive":
        return [(f"adaptive-{target}", "hybrid-adaptive", ["--adaptive-target-ms", str(target)], True)
                for target in (25, 50, 100)] + [
                ("adaptive-initial-1", "hybrid-adaptive", ["--adaptive-initial-batch", "1"], True),
                ("adaptive-initial-4", "hybrid-adaptive", ["--adaptive-initial-batch", "4"], True)]
    if group == "trace":
        return [(f"{backend}-{mode}", backend, [], mode == "trace")
                for backend in ("mpi-dynamic", "hybrid-adaptive") for mode in ("normal", "trace")]
    raise ValueError(group)


def summarize_records(records, scenes, modes):
    groups = {}
    for scene in scenes:
        for name, *_ in modes:
            rows = [r for r in records if r["scene"] == scene and r["condition"] == f"{scene}-{name}-b{r['block']}"
                    and not r["warmup"] and not r.get("validation_error")]
            if not rows:
                continue
            def median(path):
                values = []
                for row in rows:
                    item = row["stats"]
                    for key in path:
                        item = item[key]
                    values.append(item)
                return statistics.median(values)
            groups[f"{scene}/{name}"] = {"n": len(rows), "median_seconds": median(["render_wall_seconds"]),
                "median_assignments": median(["scheduler", "assignments_dispatched"]),
                "median_tail90_seconds": median(["scheduler", "tail90_seconds"]),
                "median_last_worker_spread_seconds": median(["scheduler", "last_worker_spread_seconds"]),
                "median_worker_wait_seconds": statistics.median(sum(w["assignment_wait_seconds"] for w in r["stats"]["workers"]) for r in rows),
                "median_mpi_call_seconds": statistics.median(sum(w["mpi_send_seconds"] + w["mpi_receive_seconds"] for w in r["stats"]["workers"]) for r in rows),
                "median_coordinator_handling_seconds": median(["scheduler", "coordinator_handling_seconds"]),
                "median_batch_size": median(["scheduler", "median_batch_size"])}
    return {"classification": "diagnostic-not-formal", "groups": groups}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--group", choices=("core", "fixed", "adaptive", "trace"))
    parser.add_argument("--scene", action="append", choices=("imbalanced", "reflective", "scheduler_stress", "uniform"))
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--warmups", type=int, default=1)
    parser.add_argument("--timeout", type=float, default=45)
    parser.add_argument("--max-total-seconds", type=float, default=600)
    parser.add_argument("--order-seed", type=int, default=20260928)
    parser.add_argument("--outdir", type=Path, default=ROOT / "results/diagnostic/adaptive-v3")
    parser.add_argument("--summarize-only", type=Path, help="rederive a diagnostic summary from its saved raw records")
    args = parser.parse_args()
    if args.summarize_only:
        directory = args.summarize_only.resolve()
        saved = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        records = [json.loads(p.read_text(encoding="utf-8")) for p in (directory / "raw").glob("*.run.json")]
        write_json(directory / "summary.json", summarize_records(records, saved["scenes"], conditions(saved["group"])))
        print("Summarized:", directory)
        return 0
    if not args.group:
        parser.error("--group is required for a new diagnostic run")
    if not 2 <= args.repeats <= 10 or not 0 <= args.warmups <= 2 or args.timeout <= 0 or args.max_total_seconds <= 0:
        parser.error("invalid bounds")
    scenes = args.scene or ["imbalanced", "scheduler_stress"]
    exe = ROOT / "build-release/helios.exe"
    mpi_exe = ROOT / "build-release/helios_mpi.exe"
    if not exe.is_file() or not mpi_exe.is_file():
        parser.error("Release binaries missing")
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    directory = args.outdir.resolve() / run_id
    raw = directory / "raw"
    raw.mkdir(parents=True, exist_ok=False)
    modes = conditions(args.group)
    manifest = {"classification": "diagnostic-not-formal", "id": run_id, "status": "running",
                "group": args.group, "scenes": scenes, "repeats": args.repeats, "warmups": args.warmups,
                "order_seed": args.order_seed, "timeout_seconds": args.timeout,
                "max_total_seconds": args.max_total_seconds, "created_utc": datetime.now(timezone.utc).isoformat(),
                "git_sha": command_output(GIT + ["rev-parse", "HEAD"]),
                "git_status_porcelain": command_output(GIT + ["status", "--porcelain"]),
                "source_sha256": {str(p.relative_to(ROOT)): digest(p) for p in
                                  (ROOT / "src/main.cpp", ROOT / "src/core.cpp", ROOT / "include/helios/core.hpp")},
                "executable_sha256": digest(exe), "mpi_executable_sha256": digest(mpi_exe),
                "hardware": hardware(), "conditions": [m[0] for m in modes],
                "render": {"width": 256, "height": 144, "spp": 192, "max_depth": 8, "seed": 42, "tile": 16}}
    write_json(directory / "manifest.json", manifest)
    started = time.monotonic()
    records = []
    expected = {}

    def run(scene, label, block, position, backend, extra, trace, warmup):
        paths = {kind: raw / f"{label}.{kind}" for kind in ("ppm", "stats.json", "trace.csv", "tiles.csv", "run.json")}
        command = (["mpiexec", "-n", "3", str(mpi_exe)] if backend != "sequential" else [str(exe)])
        command += ["render", "--backend", backend, "--scene", scene, "--width", "256", "--height", "144",
                    "--spp", "192", "--max-depth", "8", "--seed", "42", "--tile", "16",
                    "--output", str(paths["ppm"]), "--stats-json", str(paths["stats.json"]),
                    "--tile-stats-csv", str(paths["tiles.csv"])] + extra
        if backend == "mpi-static":
            command.append("--coordinator-only")
        if trace:
            command += ["--trace-csv", str(paths["trace.csv"])]
        stamp = datetime.now(timezone.utc).isoformat()
        begin = time.monotonic()
        try:
            code, stdout, stderr = run_bounded(command, args.timeout)
        except OSError as exc:
            code, stdout, stderr = 127, "", str(exc)
        row = {"id": run_id, "scene": scene, "condition": label, "block": block,
               "position": position, "warmup": warmup, "backend": backend, "trace_mode": trace,
               "started_utc": stamp, "command": command, "return_code": code,
               "process_wall_seconds": time.monotonic() - begin, "stdout": stdout, "stderr": stderr,
               "files": {k: str(v.relative_to(directory)) for k, v in paths.items()}}
        if code == 0 and paths["stats.json"].is_file():
            try:
                row["stats"] = json.loads(paths["stats.json"].read_text(encoding="utf-8"))
                if row["stats"]["backend"] != backend:
                    row["validation_error"] = "backend mismatch"
                elif scene in expected and row["stats"]["image_hash_fnv1a64"] != expected[scene]:
                    row["validation_error"] = "pixel hash mismatch"
            except (ValueError, KeyError) as exc:
                row["validation_error"] = str(exc)
        else:
            row["validation_error"] = "render failed or stats missing"
        write_json(paths["run.json"], row)
        records.append(row)
        print(scene, label, block, "exit", code, "render_s", row.get("stats", {}).get("render_wall_seconds"), flush=True)
        return row

    for scene in scenes:
        reference = run(scene, f"{scene}-reference", -999, -1, "sequential", [], False, True)
        if reference.get("stats"):
            expected[scene] = reference["stats"]["image_hash_fnv1a64"]
        for block in range(-args.warmups, args.repeats):
            order = list(modes)
            random.Random(args.order_seed + 1009 * (block + args.warmups) + 1000003 * scenes.index(scene)).shuffle(order)
            for position, (name, backend, extra, trace) in enumerate(order):
                if time.monotonic() - started >= args.max_total_seconds:
                    manifest["status"] = "budget_exhausted"
                    break
                run(scene, f"{scene}-{name}-b{block}", block, position, backend, extra, trace, block < 0)
            if manifest["status"] != "running":
                break
        if manifest["status"] != "running":
            break
    write_json(directory / "summary.json", summarize_records(records, scenes, modes))
    manifest["records"] = len(records)
    manifest["failures"] = sum(bool(r.get("validation_error")) for r in records)
    if manifest["status"] == "running":
        manifest["status"] = "complete" if not manifest["failures"] else "failed"
    write_json(directory / "manifest.json", manifest)
    print("Diagnostic:", directory, "status:", manifest["status"], flush=True)
    return 0 if manifest["status"] == "complete" else 1


if __name__ == "__main__":
    sys.exit(main())
