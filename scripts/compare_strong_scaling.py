"""Block-paired comparisons inside one protocol V2 strong-scaling experiment.

Every strong-scaling block renders every condition once in randomised order, so per-block ratios
between two conditions control block drift the same way the scheduler analysis does. An optional
--historical experiment is reported only as separate medians with their own intervals: runs from
different sessions are not paired. Writes aggregate/strong_paired.json and .md in the target
experiment only.
"""
import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path

from analyse_results import bootstrap_median_ci

PAIRS = [(("hybrid-static", 2, 2), ("openmp", 1, 4)), (("hybrid-static", 2, 2), ("mpi-static", 4, 1)),
         (("hybrid-static", 1, 4), ("openmp", 1, 4)), (("hybrid-static", 4, 1), ("mpi-static", 4, 1)),
         (("openmp", 1, 4), ("mpi-static", 4, 1)), (("openmp", 1, 8), ("openmp", 1, 4)),
         (("hybrid-static", 1, 4), ("hybrid-static", 2, 2))]


def label(key):
    backend, ranks, threads = key
    return f"{backend} {ranks}x{threads}"


def blocks_of(directory):
    blocks = defaultdict(dict)
    for path in sorted((directory / "raw").glob("*.run.json")):
        row = json.loads(path.read_text(encoding="utf-8"))
        if row.get("reference_only") or row["warmup"] or row["return_code"] != 0 or "validation_error" in row:
            continue
        stats = json.loads((directory / row["files"]["stats.json"]).read_text(encoding="utf-8"))
        blocks[row["block"]][(row["backend"], row["ranks"], row["threads"])] = stats["render_wall_seconds"]
    return blocks


def compare(directory, historical=None):
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("experiment") != "strong":
        raise SystemExit("not a strong-scaling experiment")
    seed = manifest["order_seed"]
    blocks = blocks_of(directory)
    paired = []
    for candidate, reference in PAIRS:
        rows = [b for b in blocks.values() if candidate in b and reference in b]
        relative = [b[candidate] / b[reference] - 1 for b in rows]
        absolute = [b[candidate] - b[reference] for b in rows]
        if not rows:
            continue
        paired.append({"candidate": label(candidate), "reference": label(reference), "n_blocks": len(rows),
                       "candidate_faster_blocks": sum(x < 0 for x in relative),
                       "median_relative_change": statistics.median(relative),
                       "relative_ci95": list(bootstrap_median_ci(relative, seed=seed)),
                       "median_absolute_seconds": statistics.median(absolute),
                       "absolute_ci95_seconds": list(bootstrap_median_ci(absolute, seed=seed))})
    result = {"experiment_id": manifest["experiment_id"], "git_sha": manifest["git_sha"], "paired": paired,
              "definitions": {"relative_change": "per-block candidate/reference render seconds - 1; negative = candidate faster",
                              "ci95": "95% percentile bootstrap of the median paired change, 4000 resamples, n>=7 only"}}
    if historical:
        old = json.loads((historical / "aggregate/summary.json").read_text(encoding="utf-8"))
        new = json.loads((directory / "aggregate/summary.json").read_text(encoding="utf-8"))
        index = {(c["backend"], c["ranks"], c["threads"]): c for c in old["conditions"]}
        result["historical_experiment_id"] = old["experiment_id"]
        result["historical_unpaired"] = [
            {"condition": label((c["backend"], c["ranks"], c["threads"])),
             "historical_median_seconds": index[(c["backend"], c["ranks"], c["threads"])]["median_seconds"],
             "historical_ci95": [index[(c["backend"], c["ranks"], c["threads"])]["median_ci95_low_seconds"],
                                 index[(c["backend"], c["ranks"], c["threads"])]["median_ci95_high_seconds"]],
             "new_median_seconds": c["median_seconds"],
             "new_ci95": [c["median_ci95_low_seconds"], c["median_ci95_high_seconds"]]}
            for c in new["conditions"] if (c["backend"], c["ranks"], c["threads"]) in index]
    aggregate = directory / "aggregate"
    aggregate.mkdir(exist_ok=True)
    (aggregate / "strong_paired.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    lines = [f"# Block-paired strong-scaling comparisons: {manifest['experiment_id']}", "",
             "| Candidate | Reference | Blocks | Candidate faster | Median change | 95% CI | Median absolute (s) | 95% CI (s) |",
             "|---|---|---:|---:|---:|---|---:|---|"]
    for p in paired:
        rel, ab = p["relative_ci95"], p["absolute_ci95_seconds"]
        rel_text = f"{rel[0]*100:+.2f}% to {rel[1]*100:+.2f}%" if rel[0] is not None else "n<7"
        ab_text = f"{ab[0]:+.3f} to {ab[1]:+.3f}" if ab[0] is not None else "n<7"
        lines.append(f"| {p['candidate']} | {p['reference']} | {p['n_blocks']} | {p['candidate_faster_blocks']} | "
                     f"{p['median_relative_change']*100:+.2f}% | {rel_text} | {p['median_absolute_seconds']:+.3f} | {ab_text} |")
    if historical:
        lines += ["", f"Historical `{result['historical_experiment_id']}` versus this run (separate sessions, **not paired**):", "",
                  "| Condition | Historical median (95% CI) | New median (95% CI) |", "|---|---|---|"]
        for h in result["historical_unpaired"]:
            lines.append(f"| {h['condition']} | {h['historical_median_seconds']:.3f} s ({h['historical_ci95'][0]:.3f}–{h['historical_ci95'][1]:.3f}) | "
                         f"{h['new_median_seconds']:.3f} s ({h['new_ci95'][0]:.3f}–{h['new_ci95'][1]:.3f}) |")
    (aggregate / "strong_paired.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("experiment_directory", type=Path)
    parser.add_argument("--historical", type=Path, help="earlier strong experiment, reported unpaired")
    args = parser.parse_args()
    result = compare(args.experiment_directory.resolve(), args.historical.resolve() if args.historical else None)
    print(f"{len(result['paired'])} paired comparisons written for {result['experiment_id']}")


if __name__ == "__main__":
    main()
