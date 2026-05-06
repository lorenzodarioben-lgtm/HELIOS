"""Diagnostic A/B of the render_tile counter fix: pre-fix source versus fixed source.

"prefix" is exported from a committed revision (default 6270d44, the last commit with the shared
per-thread Counters vector); "fixed" is the working-tree src/. Both are built identically in the
gitignored build-diag-counterfix/ by diagnose_false_sharing.build. Conditions are those that exposed
the defect (hybrid 1x4, 2x2) and controls that never thread inside a tile (OpenMP 4, MPI 4).
Every run must reproduce the sequential reference's pixel hash and aggregate ray/BVH counters.
Results are diagnostic, not formal.
"""
import argparse
import json
import random
import statistics
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone

from analyse_results import bootstrap_median_ci
from benchmark_v2 import ROOT, digest, hardware, run_bounded, write_json
from diagnose_false_sharing import FLAGS, REPLACEMENTS, build

CONDITIONS = [("sequential", "sequential", 1, 1), ("openmp-4", "openmp", 1, 4), ("mpi-static-4", "mpi-static", 4, 1),
              ("hybrid-static-1x4", "hybrid-static", 1, 4), ("hybrid-static-2x2", "hybrid-static", 2, 2)]
# name -> (source: "prefix" rev or working tree, source patches)
ALIGN_STACK = [("    Counters stats;\n", "    alignas(64) Counters stats;\n")]
# Diagnostic only: replaces the per-query heap std::vector BVH stack. A DFS that pushes both children
# needs at most depth+1 slots; 64 covers any tree of <= 127 nodes (the imbalanced scene has 127).
STACK_ARRAY = [("  std::vector<int> stack{0};\n  while(!stack.empty()) {\n    const int id=stack.back();stack.pop_back();",
                "  int stack[64];int top=0;stack[top++]=0;\n  while(top>0) {\n    const int id=stack[--top];"),
               ("    } else { stack.push_back(node.right);stack.push_back(node.left); }",
                "    } else { stack[top++]=node.right;stack[top++]=node.left; }")]
VARIANT_SOURCES = {"prefix": ("prefix", []), "fixed": ("worktree", []),
                   "fixed-aligned": ("worktree", ALIGN_STACK), "prefix-padded": ("prefix", REPLACEMENTS),
                   "fixed-stackarray": ("worktree", STACK_ARRAY), "counter-only": ("counter", [])}
VARIANTS = tuple(VARIANT_SOURCES)
COUNTERS = ("rays", "shadow_rays", "node_visits", "primitive_tests", "pixels", "tiles")


def command(exe_dir, backend, ranks, threads, stem):
    exe = exe_dir / ("helios.exe" if backend in ("openmp", "sequential") else "helios_mpi.exe")
    prefix = [str(exe)] if backend in ("openmp", "sequential") else ["mpiexec", "-n", str(ranks), str(exe)]
    return prefix + ["render", "--backend", backend, "--scene", "imbalanced", "--width", "256", "--height", "144",
                     "--spp", "192", "--max-depth", "8", "--seed", "42", "--tile", "16", "--threads", str(threads),
                     "--output", f"{stem}.ppm", "--stats-json", f"{stem}.stats.json"]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--prefix-rev", default="6270d440b0da74d577933b2ff8a03acd2a22c78a")
    parser.add_argument("--counter-rev", default="dca8628fa070f2a3c11f7cc89af7e5bc4215b22c",
                        help="source for the counter-only variant (thread-private counters, heap BVH stack)")
    parser.add_argument("--repeats", type=int, default=7)
    parser.add_argument("--warmups", type=int, default=1)
    parser.add_argument("--timeout", type=float, default=45)
    parser.add_argument("--max-total-seconds", type=float, default=600)
    parser.add_argument("--order-seed", type=int, default=20260930)
    parser.add_argument("--conditions", nargs="*", choices=[c[0] for c in CONDITIONS])
    parser.add_argument("--variants", nargs="*", choices=VARIANTS, default=["prefix", "fixed"])
    args = parser.parse_args()
    if not 5 <= args.repeats <= 10 or not 0 <= args.warmups <= 2:
        parser.error("invalid repetitions")
    if "prefix" not in args.variants:
        parser.error("prefix is the paired reference and must be included")
    variants = [v for v in VARIANTS if v in args.variants]
    conditions = [c for c in CONDITIONS if not args.conditions or c[0] in args.conditions]
    ident = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    directory = ROOT / "results/diagnostic/counter-fix" / ident
    raw = directory / "raw"
    raw.mkdir(parents=True, exist_ok=False)
    root = ROOT / "build-diag-counterfix"
    revs = {"prefix": args.prefix_rev, "counter": args.counter_rev, "worktree": None}
    builds = {v: build("original", root / v, revs[VARIANT_SOURCES[v][0]],
                       VARIANT_SOURCES[v][1]) for v in variants}
    git = ["git", "-c", f"safe.directory={ROOT.as_posix()}", "-C", str(ROOT)]
    manifest = {"classification": "diagnostic-not-formal", "id": ident, "status": "running",
                "tool": "scripts/diagnose_counter_fix.py", "tool_sha256": digest(ROOT / "scripts/diagnose_counter_fix.py"),
                "scene": "imbalanced", "preset": "medium", "repeats": args.repeats, "warmups": args.warmups,
                "order_seed": args.order_seed, "prefix_rev": args.prefix_rev, "counter_rev": args.counter_rev,
                "fixed_source": "working tree src/ and include/",
                "git_sha": subprocess.run(git + ["rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip(),
                "git_status_porcelain": subprocess.run(git + ["status", "--porcelain"], capture_output=True, text=True).stdout,
                "builds": {v: {k: str(b[k]) if k == "dir" else b[k] for k in b} for v, b in builds.items()},
                "compile_flags": FLAGS, "hardware": hardware(), "created_utc": datetime.now(timezone.utc).isoformat()}
    write_json(directory / "manifest.json", manifest)

    def invoke(label, variant, backend, ranks, threads):
        stem = raw / label
        cmd = command(builds[variant]["dir"], backend, ranks, threads, stem)
        started = datetime.now(timezone.utc).isoformat()
        code, stdout, stderr = run_bounded(cmd, args.timeout)
        row = {"label": label, "variant": variant, "started_utc": started, "command": cmd, "return_code": code,
               "stdout": stdout, "stderr": stderr}
        stats_path = raw / f"{label}.stats.json"
        if code == 0 and stats_path.is_file():
            stats = json.loads(stats_path.read_text(encoding="utf-8"))
            row.update(render_wall_seconds=stats["render_wall_seconds"], image_hash=stats["image_hash_fnv1a64"],
                       counters={k: stats[k] for k in COUNTERS if k in stats},
                       worker_compute_seconds=[w["compute_seconds"] for w in stats["workers"]])
        else:
            row["validation_error"] = "render failed or stats missing"
        return row

    reference = invoke("sequential-reference", "prefix", "sequential", 1, 1)
    write_json(raw / "sequential-reference.run.json", reference)
    if reference.get("validation_error"):
        raise SystemExit("sequential reference failed")
    ref_hash, ref_counters = reference["image_hash"], {k: v for k, v in reference["counters"].items() if k != "tiles"}
    records, begun = [], time.monotonic()
    matrix = [(c, v) for c in conditions for v in variants]
    for block in range(-args.warmups, args.repeats):
        order = list(matrix)
        random.Random(args.order_seed + 7919 * (block + args.warmups)).shuffle(order)
        for position, ((name, backend, ranks, threads), variant) in enumerate(order):
            if time.monotonic() - begun >= args.max_total_seconds:
                manifest["status"] = "budget_exhausted"
                break
            row = invoke(f"{name}-{variant}-b{block}", variant, backend, ranks, threads)
            row.update(condition=name, block=block, position=position, warmup=block < 0)
            if not row.get("validation_error"):
                if row["image_hash"] != ref_hash:
                    row["validation_error"] = "pixel hash mismatch"
                elif {k: v for k, v in row["counters"].items() if k != "tiles"} != ref_counters:
                    row["validation_error"] = "aggregate counter mismatch"
            write_json(raw / f"{row['label']}.run.json", row)
            records.append(row)
            print(row["label"], "exit", row["return_code"], "render_s", row.get("render_wall_seconds"),
                  [round(x, 3) for x in row.get("worker_compute_seconds", [])], row.get("validation_error", ""), flush=True)
        if manifest["status"] != "running":
            break
    valid = [r for r in records if not r["warmup"] and not r.get("validation_error")]
    groups = {}
    for name, *_ in conditions:
        rows = {v: {r["block"]: r for r in valid if r["condition"] == name and r["variant"] == v} for v in variants}
        group = {}
        for v in variants:
            seconds = [rows[v][b]["render_wall_seconds"] for b in sorted(rows[v])]
            workers = [rows[v][b]["worker_compute_seconds"] for b in sorted(rows[v])]
            group[v] = {"n": len(seconds), "median_seconds": statistics.median(seconds) if seconds else None,
                        "seconds": seconds,
                        "median_worker_compute_seconds": [statistics.median(w[i] for w in workers)
                                                          for i in range(len(workers[0]))] if workers else None}
            if v == "prefix":
                continue
            blocks = sorted(set(rows["prefix"]) & set(rows[v]))
            relative = [rows[v][b]["render_wall_seconds"] / rows["prefix"][b]["render_wall_seconds"] - 1 for b in blocks]
            absolute = [rows[v][b]["render_wall_seconds"] - rows["prefix"][b]["render_wall_seconds"] for b in blocks]
            group[v].update(paired_blocks=len(blocks), blocks_faster_than_prefix=sum(x < 0 for x in relative),
                            median_relative_change=statistics.median(relative) if relative else None,
                            relative_ci95=list(bootstrap_median_ci(relative, seed=args.order_seed)),
                            relative_changes=relative,
                            median_absolute_seconds=statistics.median(absolute) if absolute else None,
                            absolute_ci95_seconds=list(bootstrap_median_ci(absolute, seed=args.order_seed)))
        groups[name] = group
    definitions = {"relative_change": "per-block variant/prefix render seconds - 1; negative means the variant is faster",
                   "ci95": "95% percentile bootstrap of the median paired change, 4000 resamples, n>=7 only",
                   "validation": "pixel hash and rays/shadow_rays/node_visits/primitive_tests/pixels equal the sequential reference"}
    write_json(directory / "summary.json", {"classification": "diagnostic-not-formal", "reference_hash": ref_hash,
                                            "reference_counters": ref_counters, "groups": groups,
                                            "definitions": definitions})
    manifest["records"] = len(records) + 1
    manifest["failures"] = sum(bool(r.get("validation_error")) for r in records)
    if manifest["status"] == "running":
        manifest["status"] = "complete" if not manifest["failures"] else "failed"
    write_json(directory / "manifest.json", manifest)
    print("Diagnostic:", directory, manifest["status"], flush=True)
    return 0 if manifest["status"] == "complete" else 1


if __name__ == "__main__":
    sys.exit(main())
