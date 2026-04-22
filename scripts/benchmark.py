"""Bounded, reproducible Helios runs. Raw evidence is never overwritten."""
import argparse
import csv
import hashlib
import json
import math
import random
import statistics
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def decoded(value):
    return value.decode(errors="replace") if isinstance(value, bytes) else (value or "")


# Two-sided 95% Student-t critical values, degrees of freedom 4..19.
T_95 = [2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201,
        2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093]


def sha256_file(path):
    if not path.exists():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def matrix(suite):
    workloads = [
        ("small", 96, 54, 4),
        ("medium", 160, 90, 8),
        ("large", 256, 144, 12),
    ]
    if suite == "smoke":
        modes = [("sequential", 1, 1), ("openmp", 1, 2)]
    elif suite == "weak":
        workloads = [("per-worker-1", 96, 54, 4),
                     ("per-worker-2", 96, 54, 8),
                     ("per-worker-4", 96, 54, 16)]
        modes = [("sequential", 1, 1), ("openmp", 1, 2), ("openmp", 1, 4),
                 ("mpi-static", 2, 1), ("hybrid-static", 2, 2)]
    elif suite == "stall":
        workloads = [("stall-medium", 160, 90, 8), ("stall-large", 256, 144, 12)]
        modes = [("sequential", 1, 1), ("mpi-static", 3, 1), ("mpi-dynamic", 3, 1),
                 ("hybrid-static", 3, 2), ("hybrid-dynamic", 3, 2),
                 ("hybrid-adaptive", 3, 2)]
    elif suite == "standard":
        modes = [("sequential", 1, 1), ("openmp", 1, 2), ("openmp", 1, 4)]
    elif suite == "scaling":
        modes = [("sequential", 1, 1), ("openmp", 1, 2), ("openmp", 1, 4),
                 ("mpi-static", 2, 1), ("mpi-dynamic", 2, 1),
                 ("hybrid-static", 2, 2), ("hybrid-dynamic", 2, 2),
                 ("hybrid-adaptive", 2, 2)]
    else:
        workloads += [("very-large", 512, 288, 24)]
        modes = [("sequential", 1, 1), ("openmp", 1, 2), ("openmp", 1, 4),
                 ("openmp", 1, 8), ("mpi-static", 2, 1), ("mpi-dynamic", 2, 1),
                 ("hybrid-static", 2, 2), ("hybrid-dynamic", 2, 2),
                 ("hybrid-adaptive", 2, 2)]
    return workloads, modes


def aggregate(records, destination):
    groups = {}
    for row in records:
        if row.get("warmup") or row["return_code"] != 0 or "validation_error" in row or not row.get("stats"):
            continue
        key = (row["workload"], row["backend"], row["ranks"], row["threads"])
        groups.setdefault(key, []).append(row["stats"])
    baselines = {workload: statistics.median([r["render_wall_seconds"] for r in values])
                 for (workload, backend, ranks, threads), values in groups.items()
                 if backend == "sequential" and ranks == threads == 1}
    fields = ["workload", "backend", "ranks", "threads", "count", "mean_seconds",
              "median_seconds", "min_seconds", "max_seconds", "stdev_seconds",
              "ci95_half_width_seconds",
              "speedup_vs_sequential", "parallel_efficiency", "max_worker_compute_over_mean",
              "coordinator_result_wait_fraction", "max_rank_send_seconds"]
    with destination.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        for key, values in groups.items():
            times = [r["render_wall_seconds"] for r in values]
            workload, backend, ranks, threads = key
            median = statistics.median(times)
            ci95 = (T_95[len(times)-5] * statistics.stdev(times) / math.sqrt(len(times))
                    if 5 <= len(times) <= 20 else "")
            baseline = baselines.get(workload)
            speedup = baseline / median if baseline and median > 0 else None
            worker_ratios = []
            coordinator_wait_fractions = []
            max_rank_send = []
            for result in values:
                active = [w.get("assigned_work_seconds", w["compute_seconds"]) for w in result["workers"] if w["tiles"]]
                if active and statistics.mean(active) > 0:
                    worker_ratios.append(max(active) / statistics.mean(active))
                if result["ranks"] > 1 and result["render_wall_seconds"] > 0:
                    coordinator_wait_fractions.append(
                        result["workers"][0].get("result_wait_seconds", 0) / result["render_wall_seconds"])
                    max_rank_send.append(max(w.get("mpi_send_seconds", 0) for w in result["workers"]))
            writer.writerow(dict(zip(fields, [workload, backend, ranks, threads, len(times),
                statistics.mean(times), median, min(times), max(times),
                statistics.stdev(times) if len(times) > 1 else "", ci95,
                speedup if speedup is not None else "",
                speedup / (ranks * threads) if speedup is not None else "",
                statistics.mean(worker_ratios) if worker_ratios else "",
                statistics.median(coordinator_wait_fractions) if coordinator_wait_fractions else "",
                statistics.median(max_rank_send) if max_rank_send else ""])))


def weak_summary(records, destination):
    grouped = {}
    for row in records:
        if not row.get("warmup") and row["return_code"] == 0 and "validation_error" not in row and row.get("stats"):
            key = (row["workload"], row["backend"], row["ranks"], row["threads"])
            grouped.setdefault(key, []).append(row["stats"]["render_wall_seconds"])
    baseline = statistics.median(grouped[("per-worker-1", "sequential", 1, 1)])
    diagonal = [("per-worker-1", "sequential", 1, 1),
                ("per-worker-2", "openmp", 1, 2),
                ("per-worker-4", "openmp", 1, 4),
                ("per-worker-2", "mpi-static", 2, 1),
                ("per-worker-4", "hybrid-static", 2, 2)]
    with destination.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["workload", "backend", "ranks", "threads", "logical_workers",
                         "spp", "median_seconds", "weak_efficiency_vs_1_worker"])
        for workload, backend, ranks, threads in diagonal:
            median = statistics.median(grouped[(workload, backend, ranks, threads)])
            spp = {"per-worker-1": 4, "per-worker-2": 8, "per-worker-4": 16}[workload]
            writer.writerow([workload, backend, ranks, threads, ranks * threads,
                             spp, median, baseline / median])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", choices=["smoke", "standard", "scaling", "weak", "stall", "full"], default="smoke")
    parser.add_argument("--exe", type=Path, default=ROOT / "build-release" / "helios.exe")
    parser.add_argument("--mpi-exe", type=Path, default=ROOT / "build-release" / "helios_mpi.exe")
    parser.add_argument("--repeats", type=int, default=1)
    parser.add_argument("--warmups", type=int, default=0)
    parser.add_argument("--shuffle-seed", type=int)
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--scene", default="imbalanced")
    parser.add_argument("--slow-rank", type=int, default=1)
    parser.add_argument("--slow-us", type=int, default=1000)
    parser.add_argument("--outdir", type=Path, default=ROOT / "results" / "raw")
    args = parser.parse_args()
    args.exe = args.exe if args.exe.is_absolute() else ROOT / args.exe
    args.mpi_exe = args.mpi_exe if args.mpi_exe.is_absolute() else ROOT / args.mpi_exe
    args.outdir = args.outdir if args.outdir.is_absolute() else ROOT / args.outdir
    if args.repeats < 1 or args.repeats > 20 or args.warmups < 0 or args.warmups > 3 or args.timeout <= 0:
        parser.error("repeats must be 1..20, warmups 0..3, and timeout positive")
    if args.suite == "stall" and (args.slow_rank < 1 or args.slow_rank > 2 or args.slow_us < 0 or args.slow_us > 5000):
        parser.error("stall suite requires slow-rank 1 or 2 and slow-us 0..5000")
    workloads, modes = matrix(args.suite)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    directory = args.outdir / run_id
    directory.mkdir(parents=True, exist_ok=False)
    records = []
    expected_hash = {}
    for workload_index, (workload, width, height, spp) in enumerate(workloads):
        mode_order = list(modes)
        if args.shuffle_seed is not None:
            tail = mode_order[1:]
            random.Random(args.shuffle_seed + workload_index).shuffle(tail)
            mode_order = mode_order[:1] + tail
        for backend, ranks, threads in mode_order:
            for repetition in range(-args.warmups, args.repeats):
                warmup = repetition < 0
                suffix = f"warmup{-repetition-1}" if warmup else str(repetition)
                label = f"{workload}-{backend}-r{ranks}-t{threads}-{suffix}"
                image = directory / f"{label}.ppm"
                stats_path = directory / f"{label}.stats.json"
                command = (["mpiexec", "-n", str(ranks), str(args.mpi_exe)] if backend.startswith(("mpi-", "hybrid-"))
                           else [str(args.exe)])
                command += ["render", "--backend", backend, "--scene", args.scene,
                            "--width", str(width), "--height", str(height), "--spp", str(spp),
                            "--max-depth", "8", "--tile", "16", "--seed", "42",
                            "--threads", str(threads), "--output", str(image),
                            "--stats-json", str(stats_path),
                            "--tile-stats-csv", str(directory / f"{label}.tiles.csv")]
                if backend.endswith(("dynamic", "adaptive")):
                    command += ["--trace-csv", str(directory / f"{label}.trace.csv")]
                if args.suite == "stall" and args.slow_us > 0 and backend.startswith(("mpi-", "hybrid-")):
                    command += ["--slow-rank", str(args.slow_rank), "--slow-us", str(args.slow_us)]
                start = time.monotonic()
                try:
                    process = subprocess.run(command, capture_output=True, text=True,
                                             timeout=args.timeout, cwd=ROOT)
                    code, stdout, stderr = process.returncode, process.stdout, process.stderr
                except subprocess.TimeoutExpired as exc:
                    code, stdout, stderr = 124, decoded(exc.stdout), decoded(exc.stderr) + "\nTIMEOUT"
                except OSError as exc:
                    code, stdout, stderr = 127, "", str(exc)
                record = dict(run_id=run_id, workload=workload, backend=backend,
                              ranks=ranks, threads=threads, repetition=repetition, warmup=warmup,
                              command=command,
                              process_wall_seconds=time.monotonic() - start,
                              return_code=code, stdout=stdout, stderr=stderr)
                if code == 0:
                    if not stats_path.exists():
                        record["validation_error"] = "successful process wrote no stats JSON"
                    else:
                        try:
                            record["stats"] = json.loads(stats_path.read_text(encoding="utf-8"))
                            fingerprint = record["stats"]["image_hash_fnv1a64"]
                            if backend == "sequential" and not warmup:
                                expected_hash[workload] = fingerprint
                            elif backend != "sequential" and expected_hash.get(workload) != fingerprint:
                                record["validation_error"] = "image hash differs from sequential"
                        except (OSError, ValueError, KeyError) as exc:
                            record["validation_error"] = f"invalid stats JSON: {exc}"
                records.append(record)
                (directory / f"{label}.run.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
                print(label, "exit", code, "render_s", record.get("stats", {}).get("render_wall_seconds", "n/a"),
                      record.get("validation_error", ""), flush=True)
    aggregate(records, directory / "aggregate.csv")
    if args.suite == "weak" and all(r["return_code"] == 0 and "validation_error" not in r for r in records):
        weak_summary(records, directory / "weak_summary.csv")
    manifest = dict(run_id=run_id, suite=args.suite, scene=args.scene, repeats=args.repeats,
                    warmups=args.warmups, shuffle_seed=args.shuffle_seed,
                    timeout_seconds=args.timeout, records=len(records),
                    measured_records=sum(not r["warmup"] for r in records),
                    warmup_records=sum(r["warmup"] for r in records), failures=sum(
                        r["return_code"] != 0 or "validation_error" in r for r in records))
    manifest["executable_sha256"] = sha256_file(args.exe)
    manifest["mpi_executable_sha256"] = sha256_file(args.mpi_exe)
    if args.suite == "stall":
        manifest["slow_rank"] = args.slow_rank
        manifest["slow_us_per_tile"] = args.slow_us
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("Results:", directory)
    return 1 if manifest["failures"] else 0


if __name__ == "__main__":
    sys.exit(main())
