"""Exploratory A/B test: does per-thread Counters false sharing in render_tile slow hybrid ranks?

render_tile keeps one 48-byte Counters per OpenMP thread in a contiguous vector and increments
it for every ray, BVH node and primitive test, so adjacent threads can write the same 64-byte
cache line. Only hybrid backends call render_tile with threads > 1. This script builds the
unmodified source and a copy whose per-thread counters are padded to one cache line each
(pixels are unaffected), then times both on the medium imbalanced scene in randomised blocks.
"padded-dynamic" additionally replaces the per-tile schedule(static) pixel split with
schedule(dynamic,16) (one tile row per chunk) to test within-tile row-band imbalance.
The optional "addrprobe" variant is unpadded but prints local.data() % 64 for every tile to
stderr, to check which ranks' counters straddle a cache line; it may itself perturb heap layout.
--source-rev rebuilds a committed revision (e.g. the formal strong-scaling source 8d92429).
The patch is a diagnostic probe only; it is never applied to src/. Results are not formal.
"""
import argparse
import io
import json
import random
import shutil
import statistics
import subprocess
import sys
import tarfile
import time
import uuid
from datetime import datetime, timezone

from benchmark_v2 import ROOT, digest, hardware, run_bounded, write_json

REPLACEMENTS = [("  std::vector<Counters> local(static_cast<std::size_t>(std::max(1,threads)));",
                 "  struct alignas(64) PaddedCounters { Counters c; };\n"
                 "  std::vector<PaddedCounters> local(static_cast<std::size_t>(std::max(1,threads)));"),
                ("Counters& stats=local[static_cast<std::size_t>(tid)];",
                 "Counters& stats=local[static_cast<std::size_t>(tid)].c;"),
                ("for(const Counters& c:local) out.counters+=c;",
                 "for(const PaddedCounters& c:local) out.counters+=c.c;")]
ADDRESS_PROBE = [("for(const Counters& c:local) out.counters+=c;",
                  "for(const Counters& c:local) out.counters+=c;\n"
                  "  std::fprintf(stderr,\"HELIOS_LOCAL_MOD64 %d %u\\n\",tile.id,"
                  "static_cast<unsigned>(reinterpret_cast<std::uintptr_t>(local.data())%64u));")]
DYNAMIC_PIXELS = [("#pragma omp parallel for schedule(static) num_threads(threads) if(threads>1)",
                   "#pragma omp parallel for schedule(dynamic,16) num_threads(threads) if(threads>1)")]
PROBE_HEADERS ="#include <cstdint>\n#include <cstdio>\n"
CONDITIONS = [("openmp-4", "openmp", 1, 4), ("mpi-static-4", "mpi-static", 4, 1),
              ("hybrid-static-1x4", "hybrid-static", 1, 4),
              ("hybrid-static-2x2", "hybrid-static", 2, 2)]
VARIANTS = ("original", "padded", "addrprobe", "padded-dynamic")
FLAGS = ["-std=c++20", "-Wall", "-Wextra", "-Wpedantic", "-Wconversion", "-fopenmp", "-DHELIOS_OPENMP=1",
         "-O2", "-DNDEBUG"]


def export_source(source, rev):
    if rev is None:
        for part in ("src", "include"):
            shutil.copytree(ROOT / part, source / part)
        return
    archive = subprocess.run(["git", "-c", f"safe.directory={ROOT.as_posix()}", "-C", str(ROOT), "archive",
                              "--format=tar", rev, "src", "include"], capture_output=True, check=True).stdout
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(source)


def build(variant, build_root, rev, patches=None):
    source = build_root / f"src-{variant}"
    if source.exists():
        shutil.rmtree(source)
    export_source(source, rev)
    core = source / "src/core.cpp"
    text = core.read_text(encoding="utf-8")
    if patches is None:
        patches = {"padded": REPLACEMENTS, "addrprobe": ADDRESS_PROBE,
                   "padded-dynamic": REPLACEMENTS + DYNAMIC_PIXELS}.get(variant, [])
    for old, new in patches:
        if text.count(old) != 1:
            raise SystemExit(f"patch anchor not found exactly once: {old!r}")
        text = text.replace(old, new)
    if variant == "addrprobe":
        text = PROBE_HEADERS + text
    core.write_text(text, encoding="utf-8")
    out = build_root / variant
    out.mkdir(parents=True, exist_ok=True)
    flags = FLAGS + ["-I", str(source / "include")]
    sources = [str(core), str(source / "src/main.cpp")]
    for compiler, extra, exe in (("g++", [], "helios.exe"), ("mpicxx", ["-DHELIOS_MPI=1"], "helios_mpi.exe")):
        subprocess.run([compiler] + flags + extra + sources + ["-o", str(out / exe)], check=True)
    return {"core_cpp_sha256": digest(core), "main_cpp_sha256": digest(source / "src/main.cpp"),
            "helios_sha256": digest(out / "helios.exe"), "helios_mpi_sha256": digest(out / "helios_mpi.exe"),
            "dir": out}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--warmups", type=int, default=1)
    parser.add_argument("--timeout", type=float, default=45)
    parser.add_argument("--max-total-seconds", type=float, default=420)
    parser.add_argument("--source-rev", help="build this git revision instead of the working-tree src/")
    parser.add_argument("--conditions", nargs="*", choices=[c[0] for c in CONDITIONS])
    parser.add_argument("--variants", nargs="*", choices=VARIANTS, default=["original", "padded"])
    parser.add_argument("--reference-hash", default="da1762d641f51b4e",
                        help="sequential imbalanced/medium hash from hybrid-v3 20260928T081730Z-e41d9f1c")
    args = parser.parse_args()
    if not 2 <= args.repeats <= 10 or not 0 <= args.warmups <= 2:
        parser.error("invalid repetitions")
    variants = [v for v in VARIANTS if v in args.variants]
    conditions = [c for c in CONDITIONS if not args.conditions or c[0] in args.conditions]
    ident = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    directory = ROOT / "results/diagnostic/hybrid-v3" / f"false-sharing-{ident}"
    raw = directory / "raw"
    raw.mkdir(parents=True, exist_ok=False)
    build_root = ROOT / "build-diag-falseshare" / (args.source_rev or "worktree")
    builds = {v: build(v, build_root, args.source_rev) for v in variants}
    git = ["git", "-c", f"safe.directory={ROOT.as_posix()}", "-C", str(ROOT)]
    patch = "\n".join(f"- {old}\n+ {new}" for old, new in REPLACEMENTS + ADDRESS_PROBE + DYNAMIC_PIXELS)
    (directory / "variants.patch.txt").write_text(patch + "\n", encoding="utf-8")
    manifest = {"classification": "diagnostic-not-formal", "id": ident, "status": "running",
                "tool": "scripts/diagnose_false_sharing.py", "tool_sha256": digest(ROOT / "scripts/diagnose_false_sharing.py"),
                "scene": "imbalanced", "preset": "medium", "repeats": args.repeats, "warmups": args.warmups,
                "conditions": [f"{c[0]}-{v}" for c in conditions for v in variants],
                "source_rev": args.source_rev or "working tree src/ and include/",
                "git_sha": subprocess.run(git + ["rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip(),
                "src_matches_head": subprocess.run(git + ["diff", "--quiet", "HEAD", "--", "src", "include"]).returncode == 0,
                "builds": {v: {k: str(b[k]) if k == "dir" else b[k] for k in b} for v, b in builds.items()},
                "compile_flags": FLAGS, "hardware": hardware(), "created_utc": datetime.now(timezone.utc).isoformat()}
    write_json(directory / "manifest.json", manifest)
    records, begun = [], time.monotonic()
    matrix = [(c, v) for c in conditions for v in variants]
    for block in range(-args.warmups, args.repeats):
        order = list(matrix)
        random.Random(20260929 + 7919 * (block + args.warmups)).shuffle(order)
        for position, ((name, backend, ranks, threads), variant) in enumerate(order):
            if time.monotonic() - begun >= args.max_total_seconds:
                manifest["status"] = "budget_exhausted"
                break
            label = f"{name}-{variant}-b{block}"
            stats = raw / f"{label}.stats.json"
            exe = builds[variant]["dir"] / ("helios.exe" if backend == "openmp" else "helios_mpi.exe")
            cmd = ([str(exe)] if backend == "openmp" else ["mpiexec", "-n", str(ranks), str(exe)]) + [
                "render", "--backend", backend, "--scene", "imbalanced", "--width", "256", "--height", "144",
                "--spp", "192", "--max-depth", "8", "--seed", "42", "--tile", "16", "--threads", str(threads),
                "--output", str(raw / f"{label}.ppm"), "--stats-json", str(stats)]
            started = datetime.now(timezone.utc).isoformat()
            code, stdout, stderr = run_bounded(cmd, args.timeout)
            row = {"condition": name, "variant": variant, "block": block, "position": position, "warmup": block < 0,
                   "started_utc": started, "command": cmd, "return_code": code, "stdout": stdout, "stderr": stderr}
            if code == 0 and stats.is_file():
                data = json.loads(stats.read_text(encoding="utf-8"))
                row["render_wall_seconds"] = data["render_wall_seconds"]
                row["worker_compute_seconds"] = [w["compute_seconds"] for w in data["workers"]]
                probe = [line.split() for line in stderr.splitlines() if line.startswith("HELIOS_LOCAL_MOD64")]
                if probe:
                    # Static ranks own contiguous tile ranges, so tile id identifies the owning rank.
                    row["local_mod64_by_tile"] = {int(p[1]): int(p[2]) for p in probe}
                if data["image_hash_fnv1a64"] != args.reference_hash:
                    row["validation_error"] = "pixel hash mismatch"
            else:
                row["validation_error"] = "render failed or stats missing"
            write_json(raw / f"{label}.run.json", row)
            records.append(row)
            print(label, "exit", code, "render_s", row.get("render_wall_seconds"),
                  [round(x, 3) for x in row.get("worker_compute_seconds", [])], row.get("validation_error", ""), flush=True)
        if manifest["status"] != "running":
            break
    valid = [r for r in records if not r["warmup"] and not r.get("validation_error")]
    groups = {}
    for name, *_ in conditions:
        by_variant = {v: {r["block"]: r for r in valid if r["condition"] == name and r["variant"] == v} for v in variants}
        group = {v: {"n": len(rows), "median_seconds": statistics.median(r["render_wall_seconds"] for r in rows.values())
                     if rows else None, "seconds": [rows[b]["render_wall_seconds"] for b in sorted(rows)],
                     "median_worker_compute_seconds": [statistics.median(r["worker_compute_seconds"][i] for r in rows.values())
                                                       for i in range(len(next(iter(rows.values()))["worker_compute_seconds"]))]
                     if rows else None}
                 for v, rows in by_variant.items()}
        paired = sorted(set(by_variant.get("original", {})) & set(by_variant.get("padded", {})))
        ratios = [by_variant["padded"][b]["render_wall_seconds"] / by_variant["original"][b]["render_wall_seconds"]
                  for b in paired]
        group.update(paired_blocks=len(paired), padded_over_original_ratios=ratios,
                     median_padded_over_original=statistics.median(ratios) if ratios else None,
                     blocks_padded_faster=sum(x < 1 for x in ratios))
        groups[name] = group
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
