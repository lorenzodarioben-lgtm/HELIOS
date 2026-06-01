"""Extract Helios evidence into compact JSON for the Observatory (read-only on all evidence).

Every measured value shown by the Observatory comes from here, parsed from saved evidence:
results/protocol-v2 (formal and historical), results/diagnostic, results/stress, results/screenshot,
assets/showcase (presentation renders) and the frozen source. Nothing under src/, include/, tests/,
results/ or report/ is written. Validators are run in temporary directories only.

Usage: python extract_evidence.py [--skip-validators]
"""
import argparse
import csv
import datetime
import hashlib
import json
import math
import re
import statistics
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "visual_showcase"))
sys.path.insert(0, str(ROOT / "scripts"))
import evidence_data as E  # noqa: E402
import scheduler_data as SD  # noqa: E402
from verify_experiment import ppm_hash, verify  # noqa: E402

OBS = ROOT / "assets" / "observatory"
DATA = OBS / "data"
SHOW = ROOT / "assets" / "showcase"
PV2 = ROOT / "results" / "protocol-v2"
FROZEN = "e2c13e2204ca28aecb90d2d33703587bd16027a1"
GIT = ["git", "-c", f"safe.directory={ROOT.as_posix()}"]
FINAL = {"strong": "20260928T102644Z-100e1393", "weak": "20260928T103116Z-c00a63fc",
         "scheduler-medium": "20260928T103934Z-edc10839", "scheduler-large": "20260928T104502Z-5e829d04",
         "scheduler-small": "20260928T104823Z-8e1c1ed4", "heterogeneity": "20260928T105023Z-1dd576e1"}
HISTORICAL = {"strong": "20260928T063038Z-301480e3", "weak": "20260928T064015Z-fd6ca303",
              "scheduler-small": "20260928T062641Z-d865a73c", "heterogeneity": "20260928T063756Z-d01e8d9f",
              "scheduler-medium": "20260928T075743Z-cf62886e", "scheduler-large": "20260928T080938Z-fe56f15c"}
AB_DIR = ROOT / "results/diagnostic/counter-fix/20260928T101701Z-0de80589"
PROBE_DIR = ROOT / "results/diagnostic/hybrid-v3/false-sharing-20260928T091533Z-068e9dce"
PLACEMENT_DIR = ROOT / "results/diagnostic/hybrid-v3/placement-observer-20260928T090902Z-3f8c873d"
AFFINITY_DIR = ROOT / "results/diagnostic/hybrid-v3/20260928T081730Z-e41d9f1c"
STRESS_DIR = ROOT / "results/stress/20260928T111419Z-5832e956"


def rel(p):
    return Path(p).resolve().relative_to(ROOT).as_posix()


def jload(p):
    return json.loads(Path(p).read_text(encoding="utf-8-sig"))


def git(*args):
    return subprocess.run(GIT + list(args), cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


def sha256(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def r(v, n=4):
    return None if v is None else round(float(v), n)


# ----------------------------------------------------------------------------------------------- source
def source_state():
    frozen_diff = git("diff", "--stat", FROZEN, "HEAD", "--", "src", "include", "tests")
    working_diff = git("status", "--porcelain", "--", "src", "include", "tests")
    return {"frozen_sha": FROZEN, "frozen_short": FROZEN[:7], "presentation_head": git("rev-parse", "HEAD"),
            "presentation_head_short": git("rev-parse", "--short", "HEAD"),
            "src_include_tests_identical_to_frozen": frozen_diff == "" and working_diff == "",
            "helios_exe_sha256": sha256(ROOT / "build-release/helios.exe"),
            "helios_mpi_exe_sha256": sha256(ROOT / "build-release/helios_mpi.exe")}


# ----------------------------------------------------------------------------------------------- scenes
SCENE_TEXT = {
    "showcase": ("Three large spheres (diffuse, glass, metal) under a small triangle light.",
                 "Clean three-material still life; the scene of the recorded end-to-end run and the correctness wall."),
    "reflective": ("As showcase plus a ring of 12 metal and glass spheres and a larger light.",
                   "Nested refraction and reflection; the large-preset scheduler holdout scene."),
    "imbalanced": ("As reflective plus a 14×14 grid of small spheres in one band of the frame.",
                   "The strong-scaling workload: cost is concentrated where the small spheres are."),
    "scheduler_stress": ("As reflective plus a denser 26×26 grid of smaller spheres.",
                         "The densest scene; used by the scheduler experiments and the stress test."),
    "uniform": ("45 diffuse spheres in an even 9×5 grid.", "An evenly spread workload for contrast."),
    "bvh_stress": ("Three large spheres plus a 30×30 grid of small spheres.", "Many primitives; exercises the BVH."),
}


def scenes():
    g = jload(SHOW / "gallery/gallery.json")
    out = []
    for s in g["renders"]:
        comp, purpose = SCENE_TEXT[s["scene"]]
        out.append({"scene": s["scene"], "image": "../showcase/gallery/" + Path(s["png"]).name, "width": s["width"],
                    "height": s["height"], "spp": s["spp"], "max_depth": s["max_depth"], "seed": s["seed"],
                    "backend": f"{s['backend']} ({s['threads']} threads, dynamic OpenMP schedule)",
                    "hash": s["hash_fnv1a64"], "hash_recomputed": s["hash_recomputed"],
                    "runtime_seconds": s["render_seconds"], "command": s["command"], "composition": comp,
                    "purpose": purpose, "classification": "PRESENTATION"})
    conv = jload(SHOW / "convergence/convergence.json")
    frames = [{"spp": f["spp"], "image": "../showcase/convergence/frames/" + Path(f["png"]).name,
               "hash": f["hash_fnv1a64"], "runtime_seconds": f["render_seconds"]} for f in conv["frames"]]
    k = conv["constant"]
    keys = [(f["scene"], f["width"], f["height"], f["max_depth"], f["seed"], f["backend"]) for f in conv["frames"]]
    return {"gallery": out, "gallery_source": "assets/showcase/gallery/gallery.json",
            "convergence": {"scene": k["scene"], "width": k["width"], "height": k["height"], "max_depth": k["depth"],
                            "seed": k["seed"], "backend": conv["frames"][0]["backend"], "frames": frames,
                            "only_spp_changes": len(set(keys)) == 1,
                            "source": "assets/showcase/convergence/convergence.json", "classification": "PRESENTATION"}}


# ----------------------------------------------------------------------------------------------- workload
def tiles_csv(p):
    with open(p, newline="") as f:
        return {int(row["tile_id"]): row for row in csv.DictReader(f)}


def median_block(exp, stem):
    walls = {b: jload(PV2 / exp / "raw" / f"imbalanced-medium-{stem}-b{b}.stats.json")["render_wall_seconds"] for b in range(7)}
    med = statistics.median(walls.values())
    return min(walls, key=lambda b: (abs(walls[b] - med), b))


def workload():
    exp = FINAL["strong"]
    raw = PV2 / exp / "raw"
    seq = [tiles_csv(raw / f"imbalanced-medium-sequential-r1-t1-all-b{b}.tiles.csv") for b in range(7)]
    n = len(seq[0])
    counters_identical = all(all((s[i]["rays"], s[i]["node_visits"], s[i]["primitive_tests"]) ==
                                 (seq[0][i]["rays"], seq[0][i]["node_visits"], seq[0][i]["primitive_tests"]) for s in seq)
                             for i in range(n))
    own = {}
    for key, stem, label in [("static2", "mpi-static-r2-t1-all", "MPI static, 2 ranks"),
                             ("static4", "mpi-static-r4-t1-all", "MPI static, 4 ranks"),
                             ("openmp4", "openmp-r1-t4-all", "OpenMP 4 threads, schedule(static)")]:
        b = median_block(exp, stem)
        t = tiles_csv(raw / f"imbalanced-medium-{stem}-b{b}.tiles.csv")
        own[key] = {"label": label, "run": f"imbalanced-medium-{stem}-b{b}", "worker": [int(t[i]["worker"]) for i in range(n)],
                    "source": rel(raw / f"imbalanced-medium-{stem}-b{b}.tiles.csv")}
    tiles = []
    for i in range(n):
        row = seq[0][i]
        tiles.append({"id": i, "x0": int(row["x0"]), "y0": int(row["y0"]), "x1": int(row["x1"]), "y1": int(row["y1"]),
                      "compute_ms": r(statistics.median(float(s[i]["compute_seconds"]) for s in seq) * 1000, 4),
                      "rays": int(row["rays"]), "node_visits": int(row["node_visits"]),
                      "primitive_tests": int(row["primitive_tests"])})
    comp = [t["compute_ms"] for t in tiles]
    total = sum(comp)
    parts = {}
    for p in (2, 4):
        segs = [(n * k // p, n * (k + 1) // p) for k in range(p)]
        sums = [sum(comp[a:b]) for a, b in segs]
        parts[str(p)] = {"ranges": [[a, b - 1] for a, b in segs], "sum_ms": [r(s, 3) for s in sums],
                         "cap": r(total / max(sums), 4)}
    cheapest = min(range(n), key=lambda i: comp[i])
    dearest = max(range(n), key=lambda i: comp[i])
    return {"experiment": exp, "scene": "imbalanced", "preset": "medium", "width": 256, "height": 144, "tile": 16, "spp": 192,
            "classification": "FORMAL", "tiles": tiles,
            "metric_note": "compute_ms = median of the 7 measured sequential runs; rays / node visits / primitive tests are "
                           "deterministic counters (identical in all 7 runs: %s)" % counters_identical,
            "counters_identical_across_runs": counters_identical, "ownership": own,
            "summary": {"total_ms": r(total, 3), "cheapest_tile": cheapest, "cheapest_ms": comp[cheapest],
                        "dearest_tile": dearest, "dearest_ms": comp[dearest], "ratio": r(comp[dearest] / comp[cheapest], 2),
                        "median_ms": r(statistics.median(comp), 3)},
            "partitions": parts,
            "sources": [rel(raw / f"imbalanced-medium-sequential-r1-t1-all-b{b}.tiles.csv") for b in range(7)],
            "tile_image": "../showcase/gallery/imbalanced-hero.png"}


# ----------------------------------------------------------------------------------------------- scheduler
def scheduler():
    val = jload(SHOW / "scheduler/scheduler-trace-validation.json")
    out = {"experiment": FINAL["scheduler-medium"], "scene": "imbalanced", "preset": "medium", "policies": {},
           "tile_image": "../showcase/gallery/imbalanced-hero.png",
           "alignment": "Each run starts at t = 0 on one real-time axis. The runs are separate executions (median-time block "
                        "of each policy), not simultaneous."}
    labels = {"static": "Static partition", "dynamic": "Fixed dynamic", "adaptive": "Adaptive batching"}
    for mode in ("static", "dynamic", "adaptive"):
        rt = SD.load(mode, block=val[mode]["block"])
        checks = SD.validate(rt)
        tiles = [{"id": e.tile, "w": e.worker, "a": r(e.assigned, 6), "s": r(e.start, 6), "e": r(e.end, 6), "b": e.batch,
                  "x0": e.x0, "y0": e.y0} for e in rt.tiles]
        batches = [{"i": b.index, "w": b.worker, "first": b.first, "count": b.count, "dispatched": r(b.dispatched, 6),
                    "received": r(b.received, 6), "render_s": r(b.render_seconds, 6), "remaining": b.remaining_on_completion,
                    "rate_estimate": r(b.rate_estimate, 1)} for b in rt.batches]
        # derived idle periods: gaps of >= 1 ms in a worker's derived busy timeline, plus the tail until the run ends
        idle = []
        for w in rt.workers:
            ev = sorted((e for e in rt.tiles if e.worker == w), key=lambda e: e.start)
            prev = 0.0
            for e in ev:
                if e.start - prev >= 0.001:
                    idle.append({"w": w, "from": r(prev, 6), "to": r(e.start, 6)})
                prev = e.end
            if rt.end - prev >= 0.001:
                idle.append({"w": w, "from": r(prev, 6), "to": r(rt.end, 6)})
        stats = jload(SD.RAW / f"{rt.run_id}.stats.json")
        out["policies"][mode] = {
            "label": labels[mode], "description": rt.description, "run_id": rt.run_id, "block": rt.block,
            "wall_seconds": r(rt.wall, 6), "derived_end_seconds": r(rt.end, 6), "workers": rt.workers,
            "classification": "RECONSTRUCTED" if mode == "static" else "FORMAL",
            "provenance": ("STATIC TIMELINE RECONSTRUCTED FROM RECORDED TILE TIMES" if mode == "static"
                           else "RECORDED DISPATCH TRACE + TILE TELEMETRY"),
            "sources": [rel(SD.RAW / f"{rt.run_id}.tiles.csv")] + ([] if mode == "static" else [rel(SD.RAW / f"{rt.run_id}.trace.csv")]),
            "tiles": tiles, "batches": batches, "idle": idle,
            "busy_seconds": {str(w): r(sum(e.compute for e in rt.tiles if e.worker == w), 4) for w in rt.workers},
            "tiles_per_worker": {str(w): sum(1 for e in rt.tiles if e.worker == w) for w in rt.workers},
            "assignments": len(batches) if batches else None,
            "median_block_walls": val[mode]["median_block_walls"], "validation": checks,
            "recorded_fields": ["worker", "first_tile", "tile_count", "assigned_seconds", "completed_seconds",
                                "worker_render_seconds", "remaining_on_completion", "estimated_pixels_per_second_at_dispatch"]
            if batches else ["tile_id", "worker", "compute_seconds"],
            "stats_workers": [{"id": w["id"], "tiles": w["tiles"], "compute_seconds": r(w["compute_seconds"], 4)}
                              for w in stats["workers"]]}
    code = (ROOT / "src/main.cpp").read_text(encoding="utf-8").split("\n")
    lo = next(i for i, l in enumerate(code) if l.startswith("int batch_size("))
    out["adaptive_code"] = {"file": "src/main.cpp", "first_line": lo + 1, "last_line": lo + 7, "commit": FROZEN[:7],
                            "text": "\n".join(code[lo:lo + 7])}
    out["adaptive_update"] = next({"line": i + 1, "text": l.strip()} for i, l in enumerate(code) if "0.5*estimate+0.5*rate" in l)
    return out


# ----------------------------------------------------------------------------------------------- hardware
def hardware():
    env = jload(STRESS_DIR / "environment.json")
    pm = jload(PLACEMENT_DIR / "manifest.json")
    cpu_sets = {int(k): v for k, v in pm["system_cpu_sets"].items()}
    lp_of = {k: v["logical_processor"] for k, v in cpu_sets.items()}
    cores = {}
    for k, v in sorted(cpu_sets.items()):
        cores.setdefault(v["core"], []).append(v["logical_processor"])
    runs = {}
    for mode, run in pm["runs"].items():
        procs = []
        for pid, p in run["processes"].items():
            sets = [sorted(lp_of[c] for c in s) for s in p["process_default_cpu_sets"]]
            procs.append({"process_cpu_seconds": p["process_cpu_seconds"], "process_masks": p["process_masks"],
                          "process_default_cpu_sets_logical": sets, "threads_over_0p1_cpu_s": p["threads_over_0p1_cpu_s"]})
        runs[mode] = {"per_logical_cpu_busy_fraction": [r(x, 3) for x in run["per_logical_cpu_busy_fraction"]],
                      "active_threads_max": run["active_threads_max"], "rank_compute_seconds": run["rank_compute_seconds"],
                      "render_wall_seconds_perturbed": run["render_wall_seconds_perturbed"],
                      "hash_matches_reference": run["hash_matches_reference"], "processes": procs}
    aff = jload(AFFINITY_DIR / "summary.json")["groups"]
    configs = [
        {"id": "openmp4", "label": "OpenMP 4", "ranks": 1, "threads": 4, "coordinator": False},
        {"id": "openmp8", "label": "OpenMP 8", "ranks": 1, "threads": 8, "coordinator": False},
        {"id": "mpi4", "label": "MPI 4×1", "ranks": 4, "threads": 1, "coordinator": False},
        {"id": "hybrid22", "label": "Hybrid 2×2", "ranks": 2, "threads": 2, "coordinator": False},
        {"id": "hybrid14", "label": "Hybrid 1×4", "ranks": 1, "threads": 4, "coordinator": False},
    ]
    return {"cpu": env["cpu"], "physical_cores": env["physical_cores"], "logical_processors": env["logical_processors"],
            "smt_pairs": env["smt_pairs"], "ram_bytes": env["physical_ram_bytes"], "os": env["os"], "compiler": env["compiler"],
            "mpi": env["mpiexec"], "env_source": rel(STRESS_DIR / "environment.json"),
            "cpu_set_table": [{"cpu_set_id": k, "logical_processor": v["logical_processor"], "core_index": v["core"]}
                              for k, v in sorted(cpu_sets.items())],
            "cores": [{"core_index": c, "logical": lps} for c, lps in sorted(cores.items())],
            "placement": {"experiment": pm["id"], "classification": "DIAGNOSTIC", "source": rel(PLACEMENT_DIR / "manifest.json"),
                          "caveat": pm["caveat"], "git_sha": pm["git_sha"], "runs": runs,
                          "mode_labels": {"hybrid-static-2x2": "default launch (unbound)",
                                          "hybrid-static-2x2-physicalcore": "-affinity_layout spr:p"}},
            "affinity_study": {"experiment": AFFINITY_DIR.name, "classification": "DIAGNOSTIC", "source_state": "pre-fix source",
                               "source": rel(AFFINITY_DIR / "summary.json"),
                               "medians": {k: r(v["median_seconds"], 4) for k, v in aff.items()},
                               "n": {k: v["n"] for k, v in aff.items()}},
            "configurations": configs,
            "configuration_note": "Conceptual execution structure only. Formal runs were unbound: Windows chose the CPUs and "
                                  "the placement of unbound threads was not observed."}


# ----------------------------------------------------------------------------------------------- performance
def cond_key(c):
    return f"{c['backend']}:{c['ranks']}x{c['threads']}"


def performance(verifications):
    st = jload(PV2 / FINAL["strong"] / "aggregate/summary.json")["conditions"]
    order = [("sequential", 1, 1, "Sequential"), ("openmp", 1, 1, "OpenMP 1"), ("openmp", 1, 2, "OpenMP 2"),
             ("openmp", 1, 4, "OpenMP 4"), ("openmp", 1, 8, "OpenMP 8"), ("mpi-static", 1, 1, "MPI 1"),
             ("mpi-static", 2, 1, "MPI 2"), ("mpi-static", 4, 1, "MPI 4"), ("hybrid-static", 1, 4, "Hybrid 1×4"),
             ("hybrid-static", 2, 2, "Hybrid 2×2"), ("hybrid-static", 4, 1, "Hybrid 4×1")]
    idx = {(c["backend"], c["ranks"], c["threads"]): c for c in st}
    strong = []
    for b, rk, th, label in order:
        c = idx[(b, rk, th)]
        strong.append({"id": cond_key(c), "label": label, "backend": b, "ranks": rk, "threads": th, "slots": c["compute_slots"],
                       "median": r(c["median_seconds"]), "ci": [r(c["median_ci95_low_seconds"]), r(c["median_ci95_high_seconds"])],
                       "n_valid": c["n_valid"], "n_measured": c["n_measured"], "speedup": r(c["speedup_vs_sequential"], 3),
                       "efficiency": r(c["parallel_efficiency"], 3), "imbalance": r(c["median_compute_imbalance_fraction"], 3)})
    paired = [{"candidate": p["candidate"], "reference": p["reference"], "change": r(p["median_relative_change"], 8),
               "ci": [r(v, 8) for v in p["relative_ci95"]], "faster_blocks": p["candidate_faster_blocks"], "blocks": p["n_blocks"],
               "abs_s": r(p["median_absolute_seconds"], 4)} for p in E.strong_paired()]
    weak = []
    for c in jload(PV2 / FINAL["weak"] / "aggregate/summary.json")["conditions"]:
        weak.append({"backend": c["backend"], "ranks": c["ranks"], "threads": c["threads"], "spp": c["spp"], "slots": c["compute_slots"],
                     "median": r(c["median_seconds"]), "weak_efficiency": r(c["weak_efficiency_vs_one_slot"], 3)})
    hw = {(c["backend"], c["ranks"], c["threads"]): c for c in jload(PV2 / HISTORICAL["weak"] / "aggregate/summary.json")["conditions"]}
    for w in weak:
        h = hw.get((w["backend"], w["ranks"], w["threads"]))
        w["historical_weak_efficiency"] = r(h["weak_efficiency_vs_one_slot"], 3) if h else None
    sched = []
    for name in ("scheduler-medium", "scheduler-large", "scheduler-small", "heterogeneity"):
        s = jload(PV2 / FINAL[name] / "aggregate/summary.json")
        meds = {(c["scene"], c["backend"]): c for c in s["conditions"]}
        for p in s["paired_scheduler_comparisons"]:
            sched.append({"experiment": FINAL[name], "set": name, "scene": p["scene"], "candidate": p["candidate"],
                          "reference": p["reference"], "change": r(p["median_relative_runtime_change"], 8),
                          "ci": [r(p["median_ci95_low"], 8), r(p["median_ci95_high"], 8)], "abs_s": r(p["median_absolute_seconds"], 4),
                          "excludes_zero": not (p["median_ci95_low"] <= 0 <= p["median_ci95_high"])})
        for (scene, backend), c in meds.items():
            sched.append({"experiment": FINAL[name], "set": name, "scene": scene, "median_of": backend,
                          "median": r(c["median_seconds"]), "assignments": c["median_assignment_count"],
                          "imbalance": r(c["median_compute_imbalance_fraction"], 4),
                          "worker_wait_s": r(c["median_worker_wait_seconds_sum"], 8)})
    ab = jload(AB_DIR / "summary.json")
    abg = []
    for key, label in [("sequential", "Sequential"), ("openmp-4", "OpenMP 4"), ("mpi-static-4", "MPI static 4"),
                       ("hybrid-static-1x4", "Hybrid 1×4"), ("hybrid-static-2x2", "Hybrid 2×2")]:
        g = ab["groups"][key]
        row = {"id": key, "label": label, "prefix_median": r(g["prefix"]["median_seconds"])}
        for b in ("counter-only", "fixed"):
            row[b] = {"median": r(g[b]["median_seconds"]), "change": r(g[b]["median_relative_change"], 8),
                      "ci": [r(v, 8) for v in g[b]["relative_ci95"]], "faster_blocks": g[b]["blocks_faster_than_prefix"]}
        abg.append(row)
    # historical case file, extracted
    hs = {(c["backend"], c["ranks"], c["threads"]): c for c in jload(PV2 / HISTORICAL["strong"] / "aggregate/summary.json")["conditions"]}
    hp = {(p["candidate"], p["reference"]): p for p in E.strong_paired(historical=True)}
    hraw = PV2 / HISTORICAL["strong"] / "raw"

    def sum_tiles(stem, per_tile=True):
        runs = [tiles_csv(hraw / f"imbalanced-medium-{stem}-all-b{b}.tiles.csv") for b in range(7)]
        return [statistics.median(float(rr[i]["compute_seconds"]) for rr in runs) for i in range(144)]
    hseq = sum_tiles("sequential-r1-t1")
    half = max(sum(hseq[:72]), sum(hseq[72:]))
    quarter = max(sum(hseq[36 * k:36 * (k + 1)]) for k in range(4))
    eff = {}
    for stem, th in [("mpi-static-r4-t1", 1), ("hybrid-static-r2-t2", 2), ("hybrid-static-r1-t4", 4)]:
        eff[stem] = r(sum(hseq) / (sum(sum_tiles(stem)) * th), 3)
    send = []
    for b in range(7):
        w = jload(hraw / f"imbalanced-medium-hybrid-static-r2-t2-all-b{b}.stats.json")["workers"]
        send.append(max(x["mpi_send_seconds"] for x in w))
    probe = []
    for f in sorted(PROBE_DIR.glob("raw/hybrid-static-2x2-*.run.json")):
        rr = jload(f)
        if not rr.get("local_mod64_by_tile"):
            continue
        offs = rr["local_mod64_by_tile"]
        probe.append({"block": rr["block"], "warmup": rr["warmup"],
                      "rank0_offset": sorted({v for k, v in offs.items() if int(k) < 72}),
                      "rank0_compute_s": r(rr["worker_compute_seconds"][0], 4)})
    fs = jload(PROBE_DIR / "summary.json")["groups"]["hybrid-static-2x2"]
    rebuild = fs["original"]["seconds"]
    case = {
        "historical_strong": HISTORICAL["strong"], "historical_source": "8d92429",
        "hybrid22_hist": r(hs[("hybrid-static", 2, 2)]["median_seconds"]), "openmp4_hist": r(hs[("openmp", 1, 4)]["median_seconds"]),
        "mpi4_hist": r(hs[("mpi-static", 4, 1)]["median_seconds"]),
        "hist_pair_vs_openmp4": {"change": r(hp[("hybrid-static 2x2", "openmp 1x4")]["median_relative_change"], 8),
                                 "ci": [r(v, 8) for v in hp[("hybrid-static 2x2", "openmp 1x4")]["relative_ci95"]],
                                 "faster_blocks": hp[("hybrid-static 2x2", "openmp 1x4")]["candidate_faster_blocks"]},
        "partition": {"total_s": r(sum(hseq), 3), "heaviest_half_s": r(half, 3), "ideal_2x2_s": r(half / 2, 3),
                      "heaviest_quarter_s": r(quarter, 3)},
        "per_tile_efficiency": eff, "max_rank_send_s_median": r(statistics.median(send), 4),
        "address_probe": probe, "address_probe_source": rel(PROBE_DIR),
        "rebuild_prefix_seconds": [r(x, 3) for x in rebuild], "rebuild_source": rel(PROBE_DIR / "summary.json"),
        "rays_per_image": jload(PV2 / FINAL["strong"] / "raw/imbalanced-medium-sequential-r1-t1-all-b0.stats.json")["rays"],
        "final_pair_vs_openmp4": next(p for p in paired if p["candidate"] == "hybrid-static 2x2" and p["reference"] == "openmp 1x4"),
        "final_hybrid22": next(s["median"] for s in strong if s["id"] == "hybrid-static:2x2"),
        "final_openmp4": next(s["median"] for s in strong if s["id"] == "openmp:1x4"),
    }
    hist_strong = [{"id": f"{b}:{rk}x{th}", "label": label, "median": r(hs[(b, rk, th)]["median_seconds"]),
                    "speedup": r(hs[(b, rk, th)]["speedup_vs_sequential"], 3)} for b, rk, th, label in order]
    return {"strong": {"experiment": FINAL["strong"], "classification": "FORMAL", "conditions": strong, "paired": paired,
                       "source": rel(PV2 / FINAL["strong"] / "aggregate/summary.json"),
                       "paired_source": rel(PV2 / FINAL["strong"] / "aggregate/strong_paired.json"),
                       "verification": verifications.get(FINAL["strong"])},
            "weak": {"experiment": FINAL["weak"], "classification": "FORMAL", "conditions": weak,
                     "historical_experiment": HISTORICAL["weak"], "source": rel(PV2 / FINAL["weak"] / "aggregate/summary.json")},
            "scheduler": {"classification": "FORMAL", "rows": sched, "experiments": {k: v for k, v in FINAL.items() if k.startswith(("scheduler", "hetero"))}},
            "ab": {"experiment": AB_DIR.name, "classification": "DIAGNOSTIC", "groups": abg, "source": rel(AB_DIR / "summary.json"),
                   "builds": {"prefix": "6270d44", "counter-only": "dca8628", "fixed": "e2c13e2"}},
            "historical_strong": {"experiment": HISTORICAL["strong"], "classification": "HISTORICAL", "conditions": hist_strong},
            "case": case}


# ----------------------------------------------------------------------------------------------- verification
def run(cmd, timeout=600):
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=timeout)
    return p.returncode, (p.stdout + p.stderr).strip()


def validators(skip):
    exe, mpi = str(ROOT / "build-release/helios.exe"), str(ROOT / "build-release/helios_mpi.exe")
    out = {"ran_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "skipped": skip, "layers": []}
    ver = {}
    for kind, ids in (("final", FINAL), ("historical", HISTORICAL)):
        for name, exp in ids.items():
            res = verify(PV2 / exp)
            ver[exp] = {"records": res["records"], "failed": res["failed"], "ppm_images_checked": res["ppm_images_checked"],
                        "errors": len(res["errors"]), "set": kind}
    if not skip:
        steps = [("Core tests", "tests/tests.cpp", [str(ROOT / "build-release/helios_tests.exe")], r"All Helios core checks passed", None),
                 ("CLI validation", "scripts/validate_cli.py", [sys.executable, "scripts/validate_cli.py", "--exe", exe], r"Validated (\d+) CLI error cases", "cases"),
                 ("BVH validation", "scripts/validate_bvh.py", [sys.executable, "scripts/validate_bvh.py", "--exe", exe], r"Validated BVH against brute force in all (\w+) scenes", "scenes"),
                 ("Backend validation", "scripts/validate_backends.py", [sys.executable, "scripts/validate_backends.py", "--exe", exe, "--mpi-exe", mpi,
                                                                         "--mpiexec", "mpiexec", "--openmp"], r"Validated (\d+) backend configurations", "configurations"),
                 ("Analysis tests", "tests/test_benchmark_analysis.py", [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_benchmark_analysis.py"], r"Ran (\d+) tests", "tests")]
        for label, src, cmd, pattern, unit in steps:
            code, text = run(cmd)
            m = re.search(pattern, text)
            count = m.group(1) if m and m.groups() else None
            if count == "six":
                count = "6"
            ok = code == 0 and m is not None and ("OK" in text if label == "Analysis tests" else True)
            extra = {}
            if label == "Backend validation":
                hashes = re.findall(r"^(\S+) ([0-9a-f]{16})$", text, re.M)
                extra = {"main_hash_lines": sum(1 for n, _ in hashes if not n.startswith("tiny")),
                         "distinct_main_hashes": sorted({h for n, h in hashes if not n.startswith("tiny")})}
            out["layers"].append({"label": label, "source": src, "passed": ok, "count": int(count) if count and count.isdigit() else None,
                                  "unit": unit, "evidence_line": m.group(0) if m else None, **extra})
    fin = [v for v in ver.values() if v["set"] == "final"]
    out["layers"].append({"label": "Formal image rehash (final six experiments)", "source": "scripts/verify_experiment.py",
                          "passed": all(v["failed"] == 0 and v["errors"] == 0 for v in fin),
                          "count": sum(v["ppm_images_checked"] for v in fin), "unit": "images",
                          "records": sum(v["records"] for v in fin)})
    return out, ver


# ----------------------------------------------------------------------------------------------- correctness
def correctness(stack):
    d = jload(SHOW / "correctness/backend-correctness.json")
    rows, pixels = [], {}
    for b in d["backends"]:
        ppm = ROOT / b["output_path"]
        present = ppm.exists()
        rec = None
        if present:
            data = ppm.read_bytes()
            hdr = re.match(rb"P6\n(\d+) (\d+)\n255\n", data)
            pixels[b["backend"]] = data[hdr.end():]
            rec = format(int(ppm_hash(ppm, int(hdr[1]), int(hdr[2])), 16), "016x")
        rows.append({"label": b["label"], "backend": b["backend"], "ranks": b["mpi_ranks"], "threads": b["threads_per_rank"],
                     "hash": b["hash"], "hash_recomputed_now": rec, "image": "../showcase/correctness/thumbs/" + Path(b["thumbnail"]).name,
                     "command": b["command"], "runtime_seconds_informational": b["runtime_seconds_informational"]})
    diff = {}
    names = [r_["backend"] for r_ in rows]
    for i, a in enumerate(names):
        for b_ in names[i + 1:]:
            if a in pixels and b_ in pixels:
                pa, pb = pixels[a], pixels[b_]
                diff[f"{a}|{b_}"] = sum(1 for k in range(0, len(pa), 3) if pa[k:k + 3] != pb[k:k + 3])
    ref = jload(ROOT / "results/screenshot/showcase.json")["image_hash_fnv1a64"]
    return {"configuration": d["configuration"], "classification": "PRESENTATION", "backends": rows,
            "all_identical": len({r_["hash"] for r_ in rows}) == 1 and all(r_["hash_recomputed_now"] in (None, r_["hash"]) for r_ in rows),
            "pairwise_different_pixels": diff, "pixels_per_image": d["configuration"]["width"] * d["configuration"]["height"],
            "figure11_hash": ref, "figure11_source": "results/screenshot/showcase.json",
            "source": "assets/showcase/correctness/backend-correctness.json", "validation_stack": stack}


# ----------------------------------------------------------------------------------------------- stress
def stress():
    m, env, logs = E.stress()
    args = m["arguments"]
    val = lambda k: args[args.index(k) + 1]
    w, h, spp = int(val("--width")), int(val("--height")), int(val("--spp"))
    return {"run_id": m["run_id"], "classification": "FORMAL", "scene": val("--scene"), "backend": val("--backend"),
            "width": w, "height": h, "spp": spp, "max_depth": int(val("--max-depth")), "seed": int(val("--seed")), "tile": int(val("--tile")),
            "pixels": w * h, "camera_samples": w * h * spp, "timeout_seconds": m["timeout_seconds"],
            "elapsed_seconds": r(m["elapsed_wall_seconds"], 3), "timed_out": m["timed_out"], "exit_code": m["exit_code"],
            "started_utc": m["started_utc"], "ended_utc": m["ended_utc"], "git_sha": m["git_sha"],
            "executable_sha256": m["executable_sha256"], "stdout_bytes": logs["stdout"], "stderr_bytes": logs["stderr"],
            "output_files_exist": m.get("file_exists", {}), "host": {"cpu": env["cpu"], "cores": env["physical_cores"],
                                                                     "logical": env["logical_processors"], "ram_bytes": env["physical_ram_bytes"]},
            "sources": [rel(STRESS_DIR / "manifest.json"), rel(STRESS_DIR / "environment.json"),
                        rel(STRESS_DIR / "stdout.log"), rel(STRESS_DIR / "stderr.log")],
            "command": stress_invocation(), "command_source": "docs/STRESS_TEST_PLAN.md (Invocation row)",
            "renderer_arguments": " ".join(a_ if not re.match(r"^[A-Za-z]:\\", a_) else "results/stress/" + m["run_id"] + "/" + a_.replace("\\", "/").rsplit("/", 1)[1]
                                           for a_ in args)}


def stress_invocation():
    """The supervised-runner invocation as documented in the stress plan (the manifest records only the renderer command)."""
    text = (ROOT / "docs/STRESS_TEST_PLAN.md").read_text(encoding="utf-8")
    m = re.search(r"^\| Invocation \| `([^`]+)` \|", text, re.M)
    if not m:
        raise SystemExit("stress invocation row not found in docs/STRESS_TEST_PLAN.md")
    return m.group(1)


# ----------------------------------------------------------------------------------------------- experiments & provenance
def experiments(ver):
    out = []
    for kind, ids in (("FORMAL", FINAL), ("HISTORICAL", HISTORICAL)):
        for name, exp in ids.items():
            m = jload(PV2 / exp / "manifest.json")
            plots = sorted(p.relative_to(ROOT).as_posix() for p in (PV2 / exp / "plots").rglob("*.svg"))
            out.append({"id": exp, "name": name, "classification": kind, "experiment": m.get("experiment"),
                        "git_sha": m.get("git_sha"), "created_utc": m.get("created_utc"), "scenes": m.get("scenes"),
                        "preset": m.get("preset"), "conditions": len(m.get("conditions", [])), "records": m.get("records"),
                        "failures": m.get("failures"), "repeats": m.get("repeats"), "warmups": m.get("warmups"),
                        "order_seed": m.get("order_seed"), "status": m.get("status"),
                        "executable_sha256": m.get("executable_sha256"), "mpi_executable_sha256": m.get("mpi_executable_sha256"),
                        "verification": ver.get(exp), "plots": plots, "manifest": rel(PV2 / exp / "manifest.json"),
                        "aggregate": rel(PV2 / exp / "aggregate/summary.json"), "raw_dir": rel(PV2 / exp / "raw"),
                        "superseded_by": FINAL[name] if kind == "HISTORICAL" else None})
    return out


def stage(label, kind, detail, path=None):
    exists = None if path is None else (ROOT / path).exists()
    return {"label": label, "kind": kind, "detail": detail, "path": path if path else None,
            "exists": exists, "status": "not recorded" if (path is None and detail is None) else ("ok" if exists in (None, True) else "missing")}


def report_has(text):
    return text in (ROOT / "report/HELIOS_FINAL_REPORT.md").read_text(encoding="utf-8")


def provenance(perf, ver, corr, st):
    sm = jload(PV2 / FINAL["strong"] / "manifest.json")
    sched_m = jload(PV2 / FINAL["scheduler-medium"] / "manifest.json")
    o8 = next(c for c in perf["strong"]["conditions"] if c["id"] == "openmp:1x8")
    chains = []

    def chain(cid, claim, cls, stages, report_ref, report_check):
        chains.append({"id": cid, "claim": claim, "classification": cls, "stages": stages,
                       "report": {"reference": report_ref, "verified_in_report_text": report_has(report_check)}})

    common_src = [stage("C++ source", "source", f"frozen {FROZEN[:7]}; src/include/tests identical at every later commit", "src/core.cpp")]
    chain("strong", f"OpenMP 8 reaches {o8['speedup']:.2f}× over sequential (final strong scaling)", "FORMAL", common_src + [
        stage("Release binary", "binary", f"helios.exe SHA-256 {sm['executable_sha256'][:16]}…; helios_mpi.exe {sm['mpi_executable_sha256'][:16]}…", None),
        stage("Formal experiment", "experiment", f"{FINAL['strong']} · manifest git {sm['git_sha'][:7]} · {sm['records']} records, {sm['failures']} failures",
              rel(PV2 / FINAL['strong'] / "manifest.json")),
        stage("Raw runs", "raw", "per-run stats.json, tiles.csv, run.json", rel(PV2 / FINAL['strong'] / "raw")),
        stage("Independent hash verification", "verify", f"{ver[FINAL['strong']]['ppm_images_checked']} PPMs rehashed, {ver[FINAL['strong']]['failed']} failed", "scripts/verify_experiment.py"),
        stage("Aggregate", "aggregate", f"median {o8['median']:.3f} s, speedup {o8['speedup']:.3f}", rel(PV2 / FINAL['strong'] / "aggregate/summary.json")),
        stage("Plot", "plot", "speedup chart (report Figure 8)", "report/assets/20260928T103934Z-edc10839/speedup.svg"),
        stage("Report", "report", "Table 9, Section 7.2", "report/HELIOS_FINAL_REPORT.md")],
        "Table 9 (Section 7.2)", f"{o8['median']:.3f} s")
    dyn = [x for x in perf["scheduler"]["rows"] if x.get("candidate") == "mpi-dynamic" and x.get("reference") == "mpi-static" and x["set"] != "heterogeneity"]
    chain("scheduler", f"Fixed dynamic beats static on all {len(dyn)} natural-scene cases ({min(-x['change'] for x in dyn) * 100:.1f}% to {max(-x['change'] for x in dyn) * 100:.1f}%)",
          "FORMAL", common_src + [
              stage("Release binary", "binary", f"helios_mpi.exe SHA-256 {sched_m['mpi_executable_sha256'][:16]}…", None),
              stage("Formal experiments", "experiment", ", ".join(v for k, v in FINAL.items() if k.startswith("scheduler")), rel(PV2 / FINAL['scheduler-medium'] / "manifest.json")),
              stage("Raw runs + traces", "raw", "trace.csv for every dynamic/adaptive run", rel(PV2 / FINAL['scheduler-medium'] / "raw")),
              stage("Independent hash verification", "verify", " + ".join(f"{ver[v]['ppm_images_checked']}" for k, v in FINAL.items() if k.startswith("scheduler")) + " PPMs, 0 failed", "scripts/verify_experiment.py"),
              stage("Aggregate", "aggregate", "paired_scheduler_comparisons", rel(PV2 / FINAL['scheduler-medium'] / "aggregate/summary.json")),
              stage("Plot", "plot", "report Figure 11 (scheduler runtime)", "report/assets/20260928T103934Z-edc10839/scheduler-runtime.svg"),
              stage("Report", "report", "Table 12, Section 7.4", "report/HELIOS_FINAL_REPORT.md")],
          "Table 12 (Section 7.4)", "-31.84%")
    seqab = next(g for g in perf["ab"]["groups"] if g["id"] == "sequential")
    chain("ab", f"Both fixes make sequential {seqab['fixed']['change'] * 100:+.2f}% (counter fix alone {seqab['counter-only']['change'] * 100:+.2f}%)", "DIAGNOSTIC", [
        stage("Builds", "source", "pre-fix 6270d44 · counter fix dca8628 · both fixes e2c13e2", None),
        stage("Diagnostic A/B", "experiment", f"{AB_DIR.name}: 7 paired blocks per build", rel(AB_DIR / "summary.json")),
        stage("Raw runs", "raw", "per-run records; pixel hash and counters checked", rel(AB_DIR / "raw")),
        stage("Aggregate", "aggregate", "groups.*.median_relative_change and relative_ci95", rel(AB_DIR / "summary.json")),
        stage("Plot", "plot", "report Figure 6", "report/assets/optimisation-ab/optimisation-ab.svg"),
        stage("Report", "report", "Table 5, Section 5.5", "report/HELIOS_FINAL_REPORT.md")],
        "Table 5 (Section 5.5)", "-44.62%")
    chain("stress", f"Stress workload DNF: terminated at {st['elapsed_seconds']:.2f} s (timeout {st['timeout_seconds']} s)", "FORMAL", [
        stage("Source", "source", f"git {st['git_sha'][:7]} (source identical to {FROZEN[:7]})", None),
        stage("Release binary", "binary", f"helios.exe SHA-256 {st['executable_sha256'][:16]}…", None),
        stage("Supervised run", "experiment", st["command"], "scripts/run_supervised_stress.ps1"),
        stage("Manifest", "raw", "timed_out, elapsed, exit code, arguments", rel(STRESS_DIR / "manifest.json")),
        stage("Logs", "raw", f"stdout {st['stdout_bytes']} bytes, stderr {st['stderr_bytes']} bytes", rel(STRESS_DIR / "stderr.log")),
        stage("Output image", "output", "none written (the renderer writes only on completion)", None),
        stage("Report", "report", "Table 13, Section 8", "report/HELIOS_FINAL_REPORT.md")],
        "Table 13 (Section 8.3)", "600.34 s")
    shot = jload(ROOT / "results/screenshot/showcase.json")
    chain("screenshot", f"End-to-end hybrid-adaptive run, hash {shot['image_hash_fnv1a64']}", "FORMAL", [
        stage("Source", "source", "HEAD 37da0c5 shown in the screenshot (source identical to e2c13e2)", None),
        stage("Command", "experiment", "mpiexec -n 3 … --backend hybrid-adaptive --threads 2 (report Appendix A)", "report/HELIOS_FINAL_REPORT.md"),
        stage("Statistics", "raw", f"render {shot['render_wall_seconds']:.4f} s, rays {shot['rays']:,}", "results/screenshot/showcase.json"),
        stage("Screenshot", "output", "captured manually by the user", "assets/helios-hybrid-adaptive-run-screenshot.png"),
        stage("Report", "report", "Figure 13, Section 9", "report/HELIOS_FINAL_REPORT.md")],
        "Figure 13 (Section 9)", shot["image_hash_fnv1a64"])
    stack = corr["validation_stack"]["layers"]
    bv = next((l for l in stack if l["label"] == "Backend validation"), None)
    chain("correctness", f"Seven backends produce one image (hash {corr['backends'][0]['hash']})", "PRESENTATION + FORMAL", [
        stage("Frozen binaries", "binary", "build-release/helios.exe and helios_mpi.exe (checked against frozen SHA-256)", None),
        stage("Presentation renders", "experiment", "render_presentation.py correctness (7 backends, same config)", "assets/showcase/correctness/backend-correctness.json"),
        stage("Hash recomputation", "verify", "FNV-1a recomputed from each PPM; pairwise pixel differences counted", "scripts/verify_experiment.py"),
        stage("Validator", "verify", (f"{bv['count']} backend configurations, one hash" if bv and bv["count"] else "not run in this build"), "scripts/validate_backends.py"),
        stage("Formal runs", "verify", f"{next(l for l in stack if l['label'].startswith('Formal image'))['count']} formal images rehashed", "scripts/verify_experiment.py"),
        stage("Report", "report", "Table 2, Sections 4.7 and 6.7", "report/HELIOS_FINAL_REPORT.md")],
        "Table 2 (Section 4.7)", "458 of 458")
    return {"chains": chains}


# ----------------------------------------------------------------------------------------------- snippets
SNIPPETS = [
    ("render_tile", "src/core.cpp", r"^TileResult render_tile\(", 39, "Shared rendering kernel: thread-private counters, deterministic per-sample RNG (the line with Rng rng{…})."),
    ("scene_hit", "src/core.cpp", r"^bool Scene::hit\(", 31, "BVH traversal with the fixed-size stack (the heap-allocation fix)."),
    ("openmp_loop", "src/main.cpp", r"#pragma omp parallel for schedule\(runtime\)", 9, "OpenMP backend: one parallel loop over tiles."),
    ("mpi_static", "src/main.cpp", r"if\(is_static\(o\.backend\)\|\|ranks==1\) \{", 8, "Static MPI: contiguous equal-count tile range per rank."),
    ("coordinator", "src/main.cpp", r"\} else if\(rank==0\) \{", 61, "Dynamic coordinator: dispatch, MPI_Recv(MPI_ANY_SOURCE), throughput update, next dispatch."),
    ("worker_loop", "src/main.cpp", r"^    while\(true\) \{", 16, "Worker loop: receive assignment, render, send tiles back, stop on count 0."),
    ("batch_size", "src/main.cpp", r"^int batch_size\(", 7, "Adaptive batch size: target ~50 ms from measured throughput, clamp 1..8, fairness taper."),
]


def snippets():
    out = []
    for sid, f, pattern, length, note in SNIPPETS:
        lines = (ROOT / f).read_text(encoding="utf-8").split("\n")
        start = next(i for i, l in enumerate(lines) if re.search(pattern, l))
        frozen_text = git("show", f"{FROZEN}:{f}")
        out.append({"id": sid, "file": f, "first_line": start + 1, "last_line": start + length, "commit": FROZEN[:7],
                    "matches_frozen_commit": frozen_text.replace("\r\n", "\n").rstrip() == "\n".join(lines).replace("\r\n", "\n").rstrip(),
                    "note": note, "text": "\n".join(lines[start:start + length])})
    return out


# ----------------------------------------------------------------------------------------------- task sheet
def tasksheet():
    text = (ROOT / "docs/TASKSHEET_TRACEABILITY.md").read_text(encoding="utf-8")
    rows = []
    for line in text.split("\n"):
        if line.startswith("| ") and not line.startswith("| Requirement") and not line.startswith("| ---"):
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) >= 3:
                rows.append({"requirement": cells[0], "status": cells[1].replace("**", ""), "evidence": cells[2]})
    return {"source": "docs/TASKSHEET_TRACEABILITY.md", "rows": rows}


# ----------------------------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--skip-validators", action="store_true")
    a = ap.parse_args()
    DATA.mkdir(parents=True, exist_ok=True)
    src = source_state()
    stack, ver = validators(a.skip_validators)
    perf = performance(ver)
    corr = correctness(stack)
    st = stress()
    data = {"source": src, "scenes": scenes(), "workload": workload(), "scheduler": scheduler(), "hardware": hardware(),
            "performance": perf, "correctness": corr, "stress": st, "experiments": experiments(ver),
            "provenance": provenance(perf, ver, corr, st), "snippets": snippets(), "tasksheet": tasksheet()}
    return data


if __name__ == "__main__":
    print(json.dumps({k: (len(v) if isinstance(v, (list, dict)) else v) for k, v in main().items()}, indent=1))
