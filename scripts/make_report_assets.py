"""Generate report tables and zero-baseline SVG figures from saved V2 summaries."""
import argparse
import csv
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COLORS = {"sequential": "#68788b", "mpi-static": "#d36d58", "mpi-dynamic": "#288e83",
          "hybrid-adaptive": "#d9a94c", "openmp": "#507fb0", "hybrid-static": "#8d71b5"}


def label(row):
    backend = row["backend"].replace("mpi-", "MPI ").replace("hybrid-", "hybrid ")
    return f"{row['scene']} · {backend} {row['ranks']}×{row['threads']}"


def chart(rows, title, filename, suffix="", signed=False):
    """Horizontal bars with a real zero baseline and explicit scales."""
    if not rows:
        return
    endpoints = [v for r in rows for v in ((r[1],) + tuple(r[4] if len(r) > 4 and r[4][0] is not None else ())) ]
    left, right = (min(0, min(endpoints)), max(0, max(endpoints))) if signed else (0, max(endpoints))
    if right <= left:
        right = left + 1
    span = right - left
    width, height, plot_x, plot_w = 1100, 130 + 42 * len(rows), 420, 580
    xval = lambda v: plot_x + (v - left) / span * plot_w
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{html.escape(title)}">',
           '<rect width="100%" height="100%" fill="#111b28"/>',
           f'<text x="24" y="35" fill="#f5f7fa" font-family="Arial" font-size="21">{html.escape(title)}</text>']
    for tick in range(5):
        value = left + span * tick / 4
        x = xval(value)
        out.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="60" y2="{height-35}" stroke="#334457" stroke-width="1"/>')
        out.append(f'<text x="{x:.1f}" y="{height-14}" fill="#b9c8d8" text-anchor="middle" font-family="Arial" font-size="11">{value:.2f}</text>')
    for i, item in enumerate(rows):
        name, value, color, note = item[:4]
        ci = item[4] if len(item) > 4 else None
        y = 69 + i * 42
        start, end = xval(0), xval(value)
        out.append(f'<text x="24" y="{y+18}" fill="#dce7ef" font-family="Arial" font-size="12">{html.escape(name)}</text>')
        out.append(f'<rect x="{min(start,end):.1f}" y="{y}" width="{max(2,abs(end-start)):.1f}" height="25" fill="{color}"/>')
        if ci and ci[0] is not None:
            low, high = xval(ci[0]), xval(ci[1])
            out.append(f'<line x1="{low:.1f}" x2="{high:.1f}" y1="{y+29}" y2="{y+29}" stroke="#f5f7fa" stroke-width="2"/>')
        out.append(f'<text x="1010" y="{y+18}" fill="#dce7ef" font-family="Arial" font-size="12">{value:.3f}{html.escape(suffix)}{html.escape(note)}</text>')
    out.append('</svg>\n')
    filename.write_text("".join(out), encoding="utf-8")


def table(rows, fields, path, title):
    with path.with_suffix(".csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    lines = [f"# {title}", "", "| " + " | ".join(fields) + " |",
             "| " + " | ".join("---" for _ in fields) + " |"]
    for row in rows:
        values = [row.get(f) for f in fields]
        lines.append("| " + " | ".join(f"{v:.4f}" if isinstance(v, float) else str(v) if v is not None else "—" for v in values) + " |")
    lines.append("")
    path.with_suffix(".md").write_text("\n".join(lines), encoding="utf-8")


def trace_figures(run_path, out):
    row = json.loads(run_path.read_text(encoding="utf-8"))
    trace_path = run_path.parents[1] / row["files"]["trace.csv"]
    with trace_path.open(newline="", encoding="utf-8") as stream:
        trace = list(csv.DictReader(stream))
    if not trace:
        raise ValueError("empty diagnostic assignment trace")
    latest = max(float(r["completed_seconds"]) for r in trace)
    workers = sorted({int(r["worker"]) for r in trace})
    common = ['<rect width="100%" height="100%" fill="#111b28"/>']
    timeline = common + ['<text x="24" y="35" fill="#f5f7fa" font-family="Arial" font-size="20">Diagnostic assignment timeline</text>']
    batches = common + ['<text x="24" y="35" fill="#f5f7fa" font-family="Arial" font-size="20">Adaptive batch size over render progression</text>']
    for worker in workers:
        y = 80 + 80 * workers.index(worker)
        timeline.append(f'<text x="24" y="{y+20}" fill="#dce7ef" font-family="Arial" font-size="13">rank {worker}</text>')
    for task in trace:
        worker = int(task["worker"])
        count = int(task["tile_count"])
        start = float(task["assigned_seconds"])
        end = float(task["completed_seconds"])
        x = 125 + 830 * start / latest
        w = max(2, 830 * (end-start) / latest)
        y = 80 + 80 * workers.index(worker)
        color = "#65c7b8" if worker == workers[0] else "#e5a85f"
        timeline.append(f'<rect x="{x:.1f}" y="{y}" width="{w:.1f}" height="30" fill="{color}"><title>{count} microtiles, {start:.3f}–{end:.3f} s</title></rect>')
        bx = 125 + 830 * start / latest
        by = 350 - count * 30
        batches.append(f'<circle cx="{bx:.1f}" cy="{by:.1f}" r="4" fill="{color}"><title>rank {worker}, {count} microtiles, {start:.3f} s</title></circle>')
    timeline.append(f'<text x="125" y="{120+80*len(workers)}" fill="#b9c8d8" font-family="Arial" font-size="12">0 to {latest:.3f} s; width = dispatch-to-receipt duration</text>')
    batches.append(f'<text x="125" y="390" fill="#b9c8d8" font-family="Arial" font-size="12">0 to {latest:.3f} s; vertical scale 1–8 microtiles</text>')
    for name, content, height in (("assignment-timeline.svg", timeline, 150+80*len(workers)),
                                  ("batch-progression.svg", batches, 420)):
        (out / name).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 {height}">' + "".join(content) + "</svg>\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scheduler-dir", type=Path, required=True)
    parser.add_argument("--strong-dir", type=Path, default=ROOT / "results/protocol-v2/20260928T063038Z-301480e3")
    parser.add_argument("--weak-dir", type=Path, default=ROOT / "results/protocol-v2/20260928T064015Z-fd6ca303")
    parser.add_argument("--trace-run", type=Path, help="saved diagnostic run JSON with assignment trace")
    parser.add_argument("--outdir", type=Path)
    args = parser.parse_args()
    scheduler = json.loads((args.scheduler_dir / "aggregate/summary.json").read_text(encoding="utf-8"))
    strong = json.loads((args.strong_dir / "aggregate/summary.json").read_text(encoding="utf-8"))
    weak = json.loads((args.weak_dir / "aggregate/summary.json").read_text(encoding="utf-8"))
    out = args.outdir or ROOT / "report/assets" / scheduler["experiment_id"]
    out.mkdir(parents=True, exist_ok=True)
    sched = [r for r in scheduler["conditions"] if r["backend"] in ("mpi-static", "mpi-dynamic", "hybrid-adaptive")]
    order = {"mpi-static": 0, "mpi-dynamic": 1, "hybrid-adaptive": 2}
    sched.sort(key=lambda r: (r["scene"], order[r["backend"]]))
    table(sched, ["scene", "backend", "n_valid", "median_seconds", "median_ci95_low_seconds",
                  "median_ci95_high_seconds", "median_compute_imbalance_fraction", "median_assignment_count",
                  "median_tail90_seconds", "median_last_worker_spread_seconds", "median_worker_wait_seconds_sum"],
          out / "scheduler", "Medium scheduler comparison (seconds unless stated)")
    paired = scheduler["paired_scheduler_comparisons"]
    table(paired, ["scene", "candidate", "reference", "n_blocks", "median_relative_runtime_change",
                   "median_ci95_low", "median_ci95_high", "median_absolute_seconds",
                   "median_absolute_ci95_low_seconds", "median_absolute_ci95_high_seconds"],
          out / "paired", "Paired scheduler effects; positive means candidate slower")
    table(strong["conditions"], ["backend", "ranks", "threads", "compute_slots", "n_valid", "median_seconds",
                  "median_ci95_low_seconds", "median_ci95_high_seconds", "speedup_vs_sequential", "parallel_efficiency"],
          out / "strong", "Medium strong scaling")
    table(weak["conditions"], ["backend", "ranks", "threads", "compute_slots", "n_valid", "median_seconds",
                  "median_ci95_low_seconds", "median_ci95_high_seconds", "weak_efficiency_vs_one_slot"],
          out / "weak", "Single-host weak scaling")
    chart([(label(r), r["median_seconds"], COLORS[r["backend"]], "",
            (r["median_ci95_low_seconds"], r["median_ci95_high_seconds"])) for r in sched],
          "Medium scheduler runtime (median, zero baseline)", out / "scheduler-runtime.svg", " s")
    chart([(f"{r['scene']} · {r['candidate']} / {r['reference']}", 100*r["median_relative_runtime_change"],
            COLORS[r["candidate"]], "", (100*r["median_ci95_low"], 100*r["median_ci95_high"])) for r in paired],
          "Paired median runtime change; positive = slower", out / "scheduler-paired.svg", "%", True)
    chart([(label(r), r["median_compute_imbalance_fraction"], COLORS[r["backend"]], "") for r in sched],
          "Active-worker compute imbalance", out / "scheduler-imbalance.svg")
    chart([(label(r), r["median_assignment_count"], COLORS[r["backend"]], "") for r in sched
           if r["median_assignment_count"] is not None],
          "Median dynamic assignments", out / "scheduler-assignments.svg")
    strong_rows = strong["conditions"]
    for backend, name in (("openmp", "openmp-strong"), ("mpi-static", "mpi-strong")):
        subset = [r for r in strong_rows if r["backend"] == backend]
        subset.sort(key=lambda r: r["compute_slots"])
        chart([(f"{r['compute_slots']} rendering slots", r["median_seconds"], COLORS[backend], "") for r in subset],
              f"{backend} strong scaling runtime", out / f"{name}.svg", " s")
    scale = [r for r in strong_rows if r["backend"] in ("openmp", "mpi-static")]
    chart([(label(r), r["speedup_vs_sequential"], COLORS[r["backend"]], "") for r in scale
           if r["speedup_vs_sequential"] is not None], "Strong speedup", out / "speedup.svg", "×")
    chart([(label(r), 100*r["parallel_efficiency"], COLORS[r["backend"]], "") for r in scale
           if r["parallel_efficiency"] is not None], "Strong parallel efficiency", out / "efficiency.svg", "%")
    chart([(label(r), r["weak_efficiency_vs_one_slot"], COLORS[r["backend"]], "") for r in weak["conditions"]
           if r["weak_efficiency_vs_one_slot"] is not None],
          "Single-host weak efficiency", out / "weak-scaling.svg")
    hybrid = [r for r in strong_rows if r["compute_slots"] == 4 and r["backend"] in ("openmp", "mpi-static", "hybrid-static")]
    chart([(label(r), r["median_seconds"], COLORS[r["backend"]], "") for r in hybrid],
          "Four-slot composition comparison", out / "hybrid-comparison.svg", " s")
    if args.trace_run:
        trace_figures(args.trace_run.resolve(), out)
    (out / "README.md").write_text(
        f"# Report assets\n\nScheduler source: `{args.scheduler_dir}` ({scheduler['experiment_id']}). "
        f"Strong source: `{args.strong_dir}`. Weak source: `{args.weak_dir}`. "
        "Tables and charts are derived from saved raw-derived V2 aggregates. "
        f"The optional assignment timeline and batch-progression plots use `{args.trace_run}` and are exploratory diagnostic traces, not formal samples. "
        "Runtime bars start at zero. Bootstrap intervals and exact definitions are in the Markdown tables and V2 protocol.\n",
        encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()
