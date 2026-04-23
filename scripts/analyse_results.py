"""Derive protocol V2 summaries solely from preserved raw run records."""
import argparse
import csv
import json
import random
import statistics
from collections import defaultdict
from pathlib import Path


def percentile(sorted_values, q):
    position = (len(sorted_values) - 1) * q
    lower = int(position)
    upper = min(lower + 1, len(sorted_values) - 1)
    return sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * (position - lower)


def bootstrap_median_ci(values, seed=20260928, samples=4000):
    """Percentile bootstrap; descriptive interval for independent repeated runs."""
    if len(values) < 7:
        return None, None
    rng = random.Random(seed)
    medians = sorted(statistics.median(rng.choices(values, k=len(values))) for _ in range(samples))
    return percentile(medians, 0.025), percentile(medians, 0.975)


def worker_imbalance(stats, field="compute_seconds"):
    active = [w[field] for w in stats["workers"] if w["tiles"]]
    return max(active) / statistics.mean(active) - 1 if active and statistics.mean(active) > 0 else None


def summarize(directory):
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("protocol_version") != 2:
        raise ValueError("not a protocol V2 experiment")
    records = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((directory / "raw").glob("*.run.json"))]
    grouped = defaultdict(list)
    for row in records:
        if row.get("reference_only"):
            continue
        key = (row["scene"], row["preset"], row["backend"], row["ranks"], row["threads"],
               row["coordinator_only"], row["spp"])
        grouped[key].append(row)
    output = []
    for key, rows in sorted(grouped.items()):
        measured = [r for r in rows if not r["warmup"]]
        valid = [r for r in measured if r["return_code"] == 0 and "validation_error" not in r and r.get("stats")]
        times = [r["stats"]["render_wall_seconds"] for r in valid]
        scene, preset, backend, ranks, threads, coordinator_only, spp = key
        low, high = bootstrap_median_ci(times, seed=manifest["order_seed"])
        imbalances = [worker_imbalance(r["stats"]) for r in valid]
        imbalances = [v for v in imbalances if v is not None]
        effective_imbalances = [worker_imbalance(r["stats"], "assigned_work_seconds") for r in valid]
        effective_imbalances = [v for v in effective_imbalances if v is not None]
        waits = [r["stats"]["workers"][0]["result_wait_seconds"] / r["stats"]["render_wall_seconds"]
                 for r in valid if ranks > 1 and r["stats"]["render_wall_seconds"] > 0]
        sends = [max(w["mpi_send_seconds"] for w in r["stats"]["workers"]) /
                 r["stats"]["render_wall_seconds"] for r in valid if ranks > 1 and r["stats"]["render_wall_seconds"] > 0]
        rays = [r["stats"]["rays"] for r in valid]
        ray_rates = [r["stats"]["rays"] / r["stats"]["render_wall_seconds"] for r in valid
                     if r["stats"]["render_wall_seconds"] > 0]
        stalls = [sum(w["stall_seconds"] for w in r["stats"]["workers"]) for r in valid]
        assignments = [sum(w["assignments"] for w in r["stats"]["workers"]) for r in valid]
        scheduler_values = [r["stats"].get("scheduler", {}) for r in valid]
        def scheduler_median(field):
            values = [s[field] for s in scheduler_values if field in s]
            return statistics.median(values) if values else None
        worker_tiles = defaultdict(list)
        for r in valid:
            for w in r["stats"]["workers"]:
                worker_tiles[w["id"]].append(w["tiles"])
        output.append({"scene": scene, "preset": preset, "backend": backend, "ranks": ranks,
                       "threads": threads, "coordinator_only": coordinator_only, "spp": spp,
                       "compute_slots": valid[0]["compute_slots"] if valid else rows[0]["compute_slots"],
                       "n_measured": len(measured), "n_valid": len(valid), "n_failed": len(measured)-len(valid),
                       "median_seconds": statistics.median(times) if times else None,
                       "mean_seconds": statistics.mean(times) if times else None,
                       "stdev_seconds": statistics.stdev(times) if len(times) > 1 else None,
                       "min_seconds": min(times) if times else None, "max_seconds": max(times) if times else None,
                       "median_ci95_low_seconds": low, "median_ci95_high_seconds": high,
                       "median_compute_imbalance_fraction": statistics.median(imbalances) if imbalances else None,
                       "median_effective_work_imbalance_fraction": statistics.median(effective_imbalances) if effective_imbalances else None,
                       "median_coordinator_result_wait_fraction": statistics.median(waits) if waits else None,
                       "median_max_rank_blocking_send_fraction": statistics.median(sends) if sends else None,
                       "median_rays": statistics.median(rays) if rays else None,
                       "median_rays_per_second": statistics.median(ray_rates) if ray_rates else None,
                       "median_injected_stall_seconds_sum": statistics.median(stalls) if stalls else None,
                       "median_assignment_count": statistics.median(assignments) if assignments and backend.endswith(("dynamic", "adaptive")) else None,
                       "median_worker_request_count": statistics.median(sum(w.get("worker_requests", 0) for w in r["stats"]["workers"]) for r in valid) if valid and backend.endswith(("dynamic", "adaptive")) else None,
                       "median_worker_wait_seconds_sum": statistics.median(sum(w.get("assignment_wait_seconds", 0) for w in r["stats"]["workers"]) for r in valid) if valid and backend.endswith(("dynamic", "adaptive")) else None,
                       "median_tail90_seconds": scheduler_median("tail90_seconds") if backend.endswith(("dynamic", "adaptive")) else None,
                       "median_last_worker_spread_seconds": scheduler_median("last_worker_spread_seconds") if backend.endswith(("dynamic", "adaptive")) else None,
                       "median_coordinator_handling_seconds": scheduler_median("coordinator_handling_seconds") if backend.endswith(("dynamic", "adaptive")) else None,
                       "median_batch_size": scheduler_median("median_batch_size") if backend.endswith(("dynamic", "adaptive")) else None,
                       "scheduler_overhead_fraction": None,
                       "worker_tile_count_medians": {str(k): statistics.median(v) for k, v in worker_tiles.items()},
                       "speedup_vs_sequential": None, "parallel_efficiency": None,
                       "weak_efficiency_vs_one_slot": None,
                       "relative_improvement_vs_dynamic": None})
    baseline = {(r["scene"], r["preset"]): r["median_seconds"] for r in output
                if r["backend"] == "sequential" and r["median_seconds"] is not None}
    dynamic = {(r["scene"], r["preset"]): r["median_seconds"] for r in output
               if r["backend"] == "mpi-dynamic" and r["median_seconds"] is not None}
    for row in output:
        ref = baseline.get((row["scene"], row["preset"]))
        t = row["median_seconds"]
        if ref and t and manifest["experiment"] == "weak":
            row["weak_efficiency_vs_one_slot"] = ref / t
        elif ref and t:
            row["speedup_vs_sequential"] = ref / t
            row["parallel_efficiency"] = ref / t / row["compute_slots"]
        if row["backend"] in ("mpi-static", "mpi-dynamic", "hybrid-adaptive") and dynamic.get((row["scene"], row["preset"])) and t:
            row["relative_improvement_vs_dynamic"] = (dynamic[(row["scene"], row["preset"])] - t) / dynamic[(row["scene"], row["preset"])]
    paired = []
    if manifest["experiment"] in ("scheduler", "heterogeneity"):
        blocks = defaultdict(dict)
        for row in records:
            if row.get("reference_only") or row["warmup"] or row["return_code"] != 0 or "validation_error" in row or not row.get("stats"):
                continue
            blocks[(row["scene"], row["block"])][row["backend"]] = row["stats"]["render_wall_seconds"]
        for scene in sorted({r["scene"] for r in records}):
            for candidate, reference in (("mpi-dynamic", "mpi-static"),
                                         ("hybrid-adaptive", "mpi-static"),
                                         ("hybrid-adaptive", "mpi-dynamic")):
                changes = [v[candidate] / v[reference] - 1 for (s, _), v in blocks.items()
                           if s == scene and candidate in v and reference in v]
                absolute = [v[candidate] - v[reference] for (s, _), v in blocks.items()
                            if s == scene and candidate in v and reference in v]
                if changes:
                    low, high = bootstrap_median_ci(changes, seed=manifest["order_seed"])
                    absolute_low, absolute_high = bootstrap_median_ci(absolute, seed=manifest["order_seed"])
                    paired.append({"scene": scene, "candidate": candidate, "reference": reference,
                                   "n_blocks": len(changes), "median_relative_runtime_change": statistics.median(changes),
                                   "median_ci95_low": low, "median_ci95_high": high,
                                   "median_absolute_seconds": statistics.median(absolute),
                                   "median_absolute_ci95_low_seconds": absolute_low,
                                   "median_absolute_ci95_high_seconds": absolute_high})
    summary = {"experiment_id": manifest["experiment_id"], "protocol_version": 2,
               "status": manifest["status"], "raw_records": len(records), "conditions": output,
               "paired_scheduler_comparisons": paired,
               "definitions": {"ci": "95% percentile bootstrap interval for median, 4000 resamples; only n>=7",
                               "paired_change": "per-block candidate/reference render seconds - 1; positive means candidate slower",
                               "compute_imbalance": "max active worker compute seconds / mean active worker compute seconds - 1",
                               "effective_work_imbalance": "max active worker (compute + injected stall) seconds / mean - 1",
                               "compute_slots": "rendering ranks times threads; coordinator-only rank excluded",
                               "blocking_send": "max per-rank time inside blocking MPI_Send / render wall; not pure network time",
                               "assignment_count": "dynamic/adaptive batch dispatches only; static per-tile counters have different semantics",
                               "scheduler_overhead": "not isolated by current instrumentation; null",
                               "relative_improvement": "(dynamic median - condition median) / dynamic median"}}
    aggregate = directory / "aggregate"
    aggregate.mkdir(exist_ok=True)
    (aggregate / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    fields = [k for k in output[0] if k != "worker_tile_count_medians"] if output else []
    with (aggregate / "summary.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for row in output:
            writer.writerow({k: row[k] for k in fields})
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("experiment_directory", type=Path)
    args = parser.parse_args()
    summary = summarize(args.experiment_directory.resolve())
    print(f"Analysed {summary['raw_records']} raw records into {len(summary['conditions'])} conditions")


if __name__ == "__main__":
    main()
