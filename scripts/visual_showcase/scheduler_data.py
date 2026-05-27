"""Load real Helios scheduler evidence into per-tile timelines (presentation tooling, read-only).

Source: formal scheduler experiment 20260928T103934Z-edc10839 (medium, frozen source e2c13e2).

What is RECORDED and what is DERIVED:
- Dynamic / adaptive runs have a trace.csv: for each assignment the coordinator recorded the worker,
  first tile, tile count, dispatch time, receipt time and render seconds. Those are shown as recorded.
- Every run has tiles.csv: per tile, the worker that rendered it and its measured compute seconds.
- Inside a batch a worker renders its tiles one after another in tile-ID order (src/main.cpp worker loop,
  lines 318-319), so each tile's start/end is DERIVED as: batch dispatch time + cumulative recorded compute
  seconds of the earlier tiles in that batch.
- Static coordinator-only runs have no trace (no assignments are sent). Each worker renders its contiguous
  range in ID order from t = 0 (after the start barrier), so its timeline is DERIVED from cumulative recorded
  compute seconds. Message and gather time are therefore not shown for static.
"""
import csv
import json
import statistics
from dataclasses import dataclass, field
from pathlib import Path

from common import ROOT

EXPERIMENT = "20260928T103934Z-edc10839"
RAW = ROOT / "results" / "protocol-v2" / EXPERIMENT / "raw"
MODES = {
    "static": ("mpi-static-r3-t1-co", "Static partition", "equal contiguous tile ranges, fixed before rendering"),
    "dynamic": ("mpi-dynamic-r3-t1-all", "Fixed dynamic", "one tile per assignment, handed out on demand"),
    "adaptive": ("hybrid-adaptive-r3-t1-all", "Adaptive batching", "batch size from measured worker throughput"),
}


@dataclass
class TileEvent:
    tile: int
    worker: int
    x0: int
    y0: int
    x1: int
    y1: int
    assigned: float
    start: float
    end: float
    batch: int
    compute: float


@dataclass
class Batch:
    index: int
    worker: int
    first: int
    count: int
    dispatched: float
    received: float | None
    render_seconds: float
    remaining_on_completion: int | None
    rate_estimate: float | None


@dataclass
class RunTimeline:
    mode: str
    label: str
    description: str
    scene: str
    block: int
    run_id: str
    wall: float
    tiles: list = field(default_factory=list)
    batches: list = field(default_factory=list)
    workers: list = field(default_factory=list)
    width: int = 256
    height: int = 144
    tile_px: int = 16
    spp: int = 192

    @property
    def end(self):
        return max(t.end for t in self.tiles)


def median_block(stem, scene):
    walls = {b: json.loads((RAW / f"{scene}-medium-{stem}-b{b}.stats.json").read_text())["render_wall_seconds"]
             for b in range(7)}
    med = statistics.median(walls.values())
    block = min(walls, key=lambda b: (abs(walls[b] - med), b))
    return block, walls


def load(mode, scene="imbalanced", block=None):
    stem, label, description = MODES[mode]
    if block is None:
        block, _ = median_block(stem, scene)
    run_id = f"{scene}-medium-{stem}-b{block}"
    stats = json.loads((RAW / f"{run_id}.stats.json").read_text())
    with open(RAW / f"{run_id}.tiles.csv", newline="") as f:
        rows = {int(r["tile_id"]): r for r in csv.DictReader(f)}
    rt = RunTimeline(mode, label, description, scene, block, run_id, stats["render_wall_seconds"],
                     width=stats["width"], height=stats["height"], tile_px=stats["tile"], spp=stats["spp"])
    rt.workers = sorted({int(r["worker"]) for r in rows.values()})

    def event(tid, assigned, start, batch):
        r = rows[tid]
        c = float(r["compute_seconds"])
        return TileEvent(tid, int(r["worker"]), int(r["x0"]), int(r["y0"]), int(r["x1"]), int(r["y1"]),
                         assigned, start, start + c, batch, c)

    if mode == "static":
        for w in rt.workers:
            t = 0.0
            for tid in sorted(k for k, r in rows.items() if int(r["worker"]) == w):
                ev = event(tid, 0.0, t, -1)
                rt.tiles.append(ev)
                t = ev.end
    else:
        with open(RAW / f"{run_id}.trace.csv", newline="") as f:
            trace = list(csv.DictReader(f))
        for i, r in enumerate(trace):
            b = Batch(i, int(r["worker"]), int(r["first_tile"]), int(r["tile_count"]), float(r["assigned_seconds"]),
                      float(r["completed_seconds"]), float(r["worker_render_seconds"]),
                      int(r["remaining_on_completion"]), float(r["estimated_pixels_per_second_at_dispatch"]))
            rt.batches.append(b)
            t = b.dispatched
            for tid in range(b.first, b.first + b.count):
                ev = event(tid, b.dispatched, t, i)
                rt.tiles.append(ev)
                t = ev.end
    rt.tiles.sort(key=lambda e: e.tile)
    return rt


def validate(rt: RunTimeline):
    """Cross-check the derived timeline against the recorded evidence. Raises on any inconsistency."""
    checks = {}
    n = (rt.width // rt.tile_px) * (rt.height // rt.tile_px)
    ids = [t.tile for t in rt.tiles]
    checks["every_tile_exactly_once"] = sorted(ids) == list(range(n))
    if rt.batches:
        covered = sorted(tid for b in rt.batches for tid in range(b.first, b.first + b.count))
        checks["trace_covers_every_tile_once"] = covered == list(range(n))
        by_tile = {t.tile: t for t in rt.tiles}
        checks["trace_worker_matches_tiles_csv"] = all(
            by_tile[tid].worker == b.worker for b in rt.batches for tid in range(b.first, b.first + b.count))
        # Derived render end of each batch must not be later than the coordinator's recorded receipt.
        slack = []
        for b in rt.batches:
            last = by_tile[b.first + b.count - 1].end
            slack.append(b.received - last)
        checks["derived_batch_end_before_receipt"] = min(slack) > -1e-4
        checks["min_receipt_slack_ms"] = round(min(slack) * 1000, 3)
        checks["max_receipt_slack_ms"] = round(max(slack) * 1000, 3)
        checks["sum_tile_compute_equals_trace_render"] = max(
            abs(sum(by_tile[tid].compute for tid in range(b.first, b.first + b.count)) - b.render_seconds)
            for b in rt.batches) < 1e-3
        checks["batches"] = len(rt.batches)
        checks["batch_sizes"] = sorted({b.count for b in rt.batches})
    checks["derived_end_not_after_wall"] = rt.end <= rt.wall + 1e-6
    checks["derived_end_seconds"] = round(rt.end, 4)
    checks["recorded_wall_seconds"] = round(rt.wall, 4)
    bad = [k for k, v in checks.items() if v is False]
    if bad:
        raise SystemExit(f"{rt.run_id}: validation failed: {bad}")
    return checks
