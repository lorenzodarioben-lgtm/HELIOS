"""Helios protocol V2: bounded, block-randomised, immutable experiment directories."""
import argparse
import hashlib
import json
import os
import platform
import random
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# .git may be owned by another local account; trust this checkout per command, not globally.
GIT = ["git", "-c", f"safe.directory={ROOT.as_posix()}"]
PRESETS = {"small": (256, 144, 64), "medium": (256, 144, 192), "large": (256, 144, 512)}


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def command_output(command):
    try:
        return subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=10).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return None


def run_bounded(command, timeout):
    """On Windows, terminate the launched MPI process tree after a timeout."""
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0
    process = subprocess.Popen(command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, creationflags=flags)
    try:
        stdout, stderr = process.communicate(timeout=timeout)
        return process.returncode, stdout, stderr
    except subprocess.TimeoutExpired:
        if sys.platform == "win32":
            try:
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                               capture_output=True, text=True, timeout=10, check=False)
            except (OSError, subprocess.TimeoutExpired):
                pass
        if process.poll() is None:
            process.kill()
        try:
            stdout, stderr = process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            stdout, stderr = "", "child output unavailable after timeout"
        return 124, stdout, stderr + "\nTIMEOUT"


def hardware():
    result = {"os": platform.platform(), "logical_processors": os.cpu_count(), "cpu": platform.processor(),
              "physical_cores": "not directly measured"}
    if sys.platform == "win32":
        try:
            import ctypes
            import winreg
            class Memory(ctypes.Structure):
                _fields_ = [("length", ctypes.c_ulong), ("memory_load", ctypes.c_ulong),
                            ("total_physical", ctypes.c_ulonglong), ("available_physical", ctypes.c_ulonglong),
                            ("total_page", ctypes.c_ulonglong), ("available_page", ctypes.c_ulonglong),
                            ("total_virtual", ctypes.c_ulonglong), ("available_virtual", ctypes.c_ulonglong),
                            ("available_extended", ctypes.c_ulonglong)]
            memory = Memory()
            memory.length = ctypes.sizeof(Memory)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory)):
                result["physical_ram_bytes"] = memory.total_physical
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0") as key:
                result["cpu"] = winreg.QueryValueEx(key, "ProcessorNameString")[0].strip()
        except (OSError, AttributeError):
            pass
    return result


def conditions(experiment):
    if experiment in ("scheduler", "heterogeneity"):
        return [("sequential", 1, 1, False), ("mpi-static", 3, 1, True),
                ("mpi-dynamic", 3, 1, False), ("hybrid-adaptive", 3, 1, False)]
    if experiment == "strong":
        return [("sequential", 1, 1, False)] + [("openmp", 1, t, False) for t in (1, 2, 4, 8)] + [
            ("mpi-static", r, 1, False) for r in (1, 2, 4)] + [
            ("hybrid-static", r, t, False) for r, t in ((1, 4), (2, 2), (4, 1))]
    return [("sequential", 1, 1, False), ("openmp", 1, 2, False), ("openmp", 1, 4, False),
            ("mpi-static", 2, 1, False), ("mpi-static", 4, 1, False),
            ("hybrid-static", 2, 2, False)]


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--experiment", choices=("scheduler", "heterogeneity", "strong", "weak"), default="scheduler")
    p.add_argument("--scene", choices=("uniform", "imbalanced", "reflective", "scheduler_stress"),
                   action="append")
    p.add_argument("--preset", choices=tuple(PRESETS), default="small")
    p.add_argument("--repeats", type=int, default=7)
    p.add_argument("--pilot", action="store_true", help="allow fewer than seven measured blocks; label as pilot")
    p.add_argument("--warmups", type=int, default=1)
    p.add_argument("--order-seed", type=int, default=20260928)
    p.add_argument("--timeout", type=float, default=90)
    p.add_argument("--max-total-seconds", type=float, default=1200)
    p.add_argument("--slow-factor-milli", type=int, default=1000)
    p.add_argument("--trace-mode", choices=("normal", "diagnostic"), default="diagnostic",
                   help="normal omits timed in-memory assignment traces; diagnostic writes trace CSV")
    p.add_argument("--exe", type=Path, default=ROOT / "build-release/helios.exe")
    p.add_argument("--mpi-exe", type=Path, default=ROOT / "build-release/helios_mpi.exe")
    p.add_argument("--outdir", type=Path, help="default: results/protocol-v2 or results/pilot/protocol-v2 with --pilot")
    args = p.parse_args()
    if not 1 <= args.repeats <= 20 or not 0 <= args.warmups <= 3 or args.timeout <= 0 or args.max_total_seconds <= 0:
        p.error("invalid run bounds")
    if args.repeats < 7 and not args.pilot:
        p.error("protocol V2 primary comparisons require at least seven measured blocks; use --pilot for a method check")
    if args.experiment == "heterogeneity":
        if not 1000 <= args.slow_factor_milli <= 4000:
            p.error("slow-factor-milli must be 1000..4000")
    elif args.slow_factor_milli != 1000:
        p.error("slow-factor-milli is only valid for heterogeneity")
    if args.experiment == "weak" and args.preset == "large":
        p.error("large weak scaling exceeds the bounded laptop matrix")
    scenes = args.scene or (["scheduler_stress"] if args.experiment == "heterogeneity" else ["imbalanced"])
    exe, mpi_exe = args.exe.resolve(), args.mpi_exe.resolve()
    if not exe.is_file() or not mpi_exe.is_file():
        p.error("Release executables missing; run scripts/build.ps1 -Configuration release")
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    outroot = args.outdir.resolve() if args.outdir else ROOT / ("results/pilot/protocol-v2" if args.pilot else "results/protocol-v2")
    directory = outroot / run_id
    raw = directory / "raw"
    raw.mkdir(parents=True, exist_ok=False)
    git_sha = command_output(GIT + ["rev-parse", "HEAD"])
    git_status = command_output(GIT + ["status", "--porcelain"])
    if not git_sha and not args.pilot:
        p.error("could not read the Git SHA; a formal run needs source provenance")
    manifest = {"protocol_version": 2, "classification": "pilot" if args.pilot else "final-candidate",
                "experiment_id": run_id, "created_utc": datetime.now(timezone.utc).isoformat(),
                "status": "running", "experiment": args.experiment, "scenes": scenes, "preset": args.preset,
                "calibrated_presets": PRESETS, "repeats": args.repeats, "warmups": args.warmups,
                "order_seed": args.order_seed, "timeout_seconds": args.timeout,
                "max_total_seconds": args.max_total_seconds, "slow_factor_milli": args.slow_factor_milli,
                "build_type": "Release (scripts/build.ps1 -Configuration release)",
                "compiler": command_output(["g++", "--version"]).splitlines()[0],
                "git_sha": git_sha, "git_status_porcelain": git_status,
                "hardware": hardware(), "executable_sha256": digest(exe), "mpi_executable_sha256": digest(mpi_exe),
                "source_sha256": {str(path.relative_to(ROOT)): digest(path) for path in
                                  (ROOT / "src/main.cpp", ROOT / "src/core.cpp", ROOT / "include/helios/core.hpp")},
                "conditions": [{"backend": b, "ranks": r, "threads_per_rank": t,
                                "coordinator_only": c, "compute_slots": (r-1 if c or b.endswith(("dynamic", "adaptive")) else r)*t
                                if b.startswith(("mpi-", "hybrid-")) else t} for b, r, t, c in conditions(args.experiment)],
                "timing_boundary": "render_wall_seconds excludes setup and file output; includes tile processing and MPI scheduling/gather",
                "trace_policy": ("dynamic assignment trace and per-tile metrics on every run" if args.trace_mode == "diagnostic"
                                 else "normal mode: scalar scheduler telemetry and per-tile metrics; no assignment trace"),
                "trace_mode": args.trace_mode}
    write_json(directory / "manifest.json", manifest)
    records = []
    begun = time.monotonic()
    if args.experiment == "weak":
        # Reference-only sequential images validate changed-SPP conditions without
        # treating the additional work as a weak-scaling timing observation.
        for scene in scenes:
            width, height, base_spp = PRESETS[args.preset]
            for multiplier in (2, 4):
                spp = base_spp * multiplier
                label = f"{scene}-{args.preset}-reference-spp{spp}"
                image = raw / f"{label}.ppm"
                stats_path = raw / f"{label}.stats.json"
                command = [str(exe), "render", "--backend", "sequential", "--scene", scene,
                           "--width", str(width), "--height", str(height), "--spp", str(spp),
                           "--max-depth", "8", "--seed", "42", "--tile", "16",
                           "--output", str(image), "--stats-json", str(stats_path)]
                started = time.monotonic()
                try:
                    code, stdout, stderr = run_bounded(command, args.timeout)
                except OSError as exc:
                    code, stdout, stderr = 127, "", str(exc)
                row = {"experiment_id": run_id, "scene": scene, "preset": args.preset, "block": -999,
                       "position_in_block": -1, "warmup": True, "reference_only": True,
                       "backend": "sequential", "ranks": 1, "threads": 1, "compute_slots": 1,
                       "coordinator_only": False, "width": width, "height": height, "spp": spp,
                       "max_depth": 8, "seed": 42, "command": command, "return_code": code,
                       "process_wall_seconds": time.monotonic() - started, "stdout": stdout, "stderr": stderr,
                       "files": {"ppm": str(image.relative_to(directory)),
                                 "stats.json": str(stats_path.relative_to(directory))}}
                if code == 0 and stats_path.is_file():
                    try:
                        row["stats"] = json.loads(stats_path.read_text(encoding="utf-8"))
                    except ValueError as exc:
                        row["validation_error"] = f"invalid stats JSON: {exc}"
                else:
                    row["validation_error"] = "reference render failed or wrote no stats JSON"
                path = raw / f"{label}.run.json"
                records.append((row, path))
                write_json(path, row)
                print(label, "exit", code, "reference_only", flush=True)
    for scene in scenes:
        for block in range(-args.warmups, args.repeats):
            order = list(conditions(args.experiment))
            random.Random(args.order_seed + 1009 * (block + args.warmups) + 1000003 * scenes.index(scene)).shuffle(order)
            for position, (backend, ranks, threads, coordinator_only) in enumerate(order):
                if time.monotonic() - begun >= args.max_total_seconds:
                    manifest["status"] = "budget_exhausted"
                    break
                width, height, base_spp = PRESETS[args.preset]
                slots = (ranks - 1 if coordinator_only or backend.endswith(("dynamic", "adaptive")) else ranks) * threads if backend.startswith(("mpi-", "hybrid-")) else threads
                spp = base_spp * slots if args.experiment == "weak" else base_spp
                label = f"{scene}-{args.preset}-{backend}-r{ranks}-t{threads}-{'co' if coordinator_only else 'all'}-b{block}"
                paths = {kind: raw / f"{label}.{kind}" for kind in ("ppm", "stats.json", "tiles.csv", "trace.csv", "run.json")}
                command = (["mpiexec", "-n", str(ranks), str(mpi_exe)] if backend.startswith(("mpi-", "hybrid-")) else [str(exe)])
                command += ["render", "--backend", backend, "--scene", scene, "--width", str(width),
                            "--height", str(height), "--spp", str(spp), "--max-depth", "8", "--seed", "42",
                            "--tile", "16", "--threads", str(threads), "--output", str(paths["ppm"]),
                            "--stats-json", str(paths["stats.json"]), "--tile-stats-csv", str(paths["tiles.csv"])]
                if coordinator_only:
                    command.append("--coordinator-only")
                if backend.endswith(("dynamic", "adaptive")) and args.trace_mode == "diagnostic":
                    command += ["--trace-csv", str(paths["trace.csv"])]
                if args.experiment == "heterogeneity" and args.slow_factor_milli > 1000 and backend != "sequential":
                    command += ["--slow-rank", "1", "--slow-factor-milli", str(args.slow_factor_milli)]
                started = time.monotonic()
                try:
                    code, stdout, stderr = run_bounded(command, args.timeout)
                except OSError as exc:
                    code, stdout, stderr = 127, "", str(exc)
                row = {"experiment_id": run_id, "scene": scene, "preset": args.preset, "block": block,
                       "position_in_block": position, "warmup": block < 0, "backend": backend, "ranks": ranks,
                       "threads": threads, "compute_slots": slots, "coordinator_only": coordinator_only,
                       "width": width, "height": height, "spp": spp, "max_depth": 8, "seed": 42,
                       "command": command, "return_code": code, "process_wall_seconds": time.monotonic()-started,
                       "stdout": stdout, "stderr": stderr, "files": {k: str(v.relative_to(directory)) for k, v in paths.items()}}
                if code == 0 and paths["stats.json"].is_file():
                    try:
                        row["stats"] = json.loads(paths["stats.json"].read_text(encoding="utf-8"))
                        if row["stats"]["backend"] != backend or row["stats"]["spp"] != spp:
                            row["validation_error"] = "stats configuration mismatch"
                    except (ValueError, KeyError) as exc:
                        row["validation_error"] = f"invalid stats JSON: {exc}"
                elif code == 0:
                    row["validation_error"] = "missing stats JSON"
                records.append((row, paths["run.json"]))
                write_json(paths["run.json"], row)
                print(label, "exit", code, "render_s", row.get("stats", {}).get("render_wall_seconds"), flush=True)
            if manifest["status"] == "budget_exhausted":
                break
        if manifest["status"] == "budget_exhausted":
            break
    expected = {}
    for row, _ in records:
        if row["backend"] == "sequential" and row.get("stats"):
            expected[(row["scene"], row["spp"])] = row["stats"].get("image_hash_fnv1a64")
    for row, path in records:
        if row.get("stats") and expected.get((row["scene"], row["spp"])):
            if row["stats"].get("image_hash_fnv1a64") != expected[(row["scene"], row["spp"])]:
                row["validation_error"] = "image hash differs from sequential at identical scene/SPP"
        elif row.get("stats"):
            row["validation_error"] = "missing sequential image reference"
        write_json(path, row)
    manifest["records"] = len(records)
    manifest["failures"] = sum(row["return_code"] != 0 or "validation_error" in row for row, _ in records)
    manifest["hash_validation"] = "within scene and SPP; weak scaled SPP checked against excluded sequential reference renders"
    if manifest["status"] == "running":
        manifest["status"] = "complete" if not manifest["failures"] else "failed"
    write_json(directory / "manifest.json", manifest)
    print("Experiment:", directory)
    return 0 if manifest["status"] == "complete" else 1


if __name__ == "__main__":
    sys.exit(main())
