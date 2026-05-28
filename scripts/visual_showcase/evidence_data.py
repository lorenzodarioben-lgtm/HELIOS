"""Read-only loaders that pull every displayed measurement from saved Helios evidence (no typed values)."""
import csv
import json
import statistics
import sys
from pathlib import Path

from common import ROOT

sys.path.insert(0, str(ROOT / "scripts"))
import compare_strong_scaling as css  # noqa: E402  (only its pure helpers; its compare() writes files)

PV2 = ROOT / "results" / "protocol-v2"
STRONG = "20260928T102644Z-100e1393"
STRONG_HIST = "20260928T063038Z-301480e3"
SCHED = {"medium": "20260928T103934Z-edc10839", "large": "20260928T104502Z-5e829d04",
         "small": "20260928T104823Z-8e1c1ed4", "heterogeneity": "20260928T105023Z-1dd576e1"}
AB = ROOT / "results" / "diagnostic" / "counter-fix" / "20260928T101701Z-0de80589" / "summary.json"
STRESS = ROOT / "results" / "stress" / "20260928T111419Z-5832e956"


def _json(p):
    return json.loads(Path(p).read_text(encoding="utf-8-sig"))


def tile_costs(experiment=STRONG, scene="imbalanced", preset="medium"):
    """Per-tile median compute seconds over the 7 measured sequential runs."""
    runs = []
    for b in range(7):
        with open(PV2 / experiment / "raw" / f"{scene}-{preset}-sequential-r1-t1-all-b{b}.tiles.csv", newline="") as f:
            runs.append({int(r["tile_id"]): float(r["compute_seconds"]) for r in csv.DictReader(f)})
    n = len(runs[0])
    return [statistics.median(r[i] for r in runs) for i in range(n)]


def partitions(costs, parts):
    n = len(costs)
    return [(n * r // parts, n * (r + 1) // parts, sum(costs[n * r // parts:n * (r + 1) // parts])) for r in range(parts)]


def strong():
    conds = _json(PV2 / STRONG / "aggregate" / "summary.json")["conditions"]
    return {(c["backend"], c["ranks"], c["threads"]): c for c in conds}


def paired_in_memory(directory):
    """Same computation as compare_strong_scaling.compare(), without writing anything to the evidence folder."""
    manifest = _json(directory / "manifest.json")
    blocks = css.blocks_of(directory)
    out = []
    for candidate, reference in css.PAIRS:
        rows = [b for b in blocks.values() if candidate in b and reference in b]
        if not rows:
            continue
        rel = [b[candidate] / b[reference] - 1 for b in rows]
        out.append({"candidate": css.label(candidate), "reference": css.label(reference), "n_blocks": len(rows),
                    "candidate_faster_blocks": sum(x < 0 for x in rel), "median_relative_change": statistics.median(rel),
                    "relative_ci95": list(css.bootstrap_median_ci(rel, seed=manifest["order_seed"]))})
    return out


def strong_paired(historical=False):
    if historical:
        return paired_in_memory(PV2 / STRONG_HIST)
    return _json(PV2 / STRONG / "aggregate" / "strong_paired.json")["paired"]


def strong_hist():
    conds = _json(PV2 / STRONG_HIST / "aggregate" / "summary.json")["conditions"]
    return {(c["backend"], c["ranks"], c["threads"]): c for c in conds}


def scheduler_pairs():
    out = []
    for name, exp in SCHED.items():
        for p in _json(PV2 / exp / "aggregate" / "summary.json")["paired_scheduler_comparisons"]:
            out.append({"experiment": name, "id": exp, **p})
    return out


def ab():
    return _json(AB)


def stress():
    m = _json(STRESS / "manifest.json")
    env = _json(STRESS / "environment.json")
    logs = {k: (STRESS / f"{k}.log").stat().st_size for k in ("stdout", "stderr")}
    return m, env, logs


def seq_stats():
    return _json(PV2 / STRONG / "raw" / "imbalanced-medium-sequential-r1-t1-all-b0.stats.json")
