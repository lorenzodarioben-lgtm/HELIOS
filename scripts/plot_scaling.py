"""Create a small SVG speedup chart from measured aggregate.csv (stdlib only)."""
import argparse
import csv
import html
from pathlib import Path

SERIES = [
    ("openmp", 1, 4, "OpenMP 4", "#67d5cc"),
    ("mpi-static", 2, 1, "MPI static 2×1", "#f4bf75"),
    ("hybrid-static", 2, 2, "Hybrid static 2×2", "#df87aa"),
    ("hybrid-dynamic", 2, 2, "Hybrid dynamic 2×2", "#94a8ed"),
    ("hybrid-adaptive", 2, 2, "Hybrid adaptive 2×2", "#c9d78d"),
]
WORKLOADS = ["small", "medium", "large"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--run-id", default="unlabeled measured run")
    args = parser.parse_args()
    with args.input.open(newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file))
    values = {(r["workload"], r["backend"], int(r["ranks"]), int(r["threads"])):
              float(r["speedup_vs_sequential"]) for r in rows if r["speedup_vs_sequential"]}
    if not all((workload, backend, ranks, threads) in values for workload in WORKLOADS
               for backend, ranks, threads, _, _ in SERIES):
        raise ValueError("aggregate is missing required measured series")
    left, top, width, height = 80, 80, 560, 350
    max_value = max(values.values())
    ceiling = max(2.5, round(max_value + 0.5, 1))
    x_at = lambda i: left + i * width / (len(WORKLOADS) - 1)
    y_at = lambda value: top + height * (1 - value / ceiling)
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="910" height="560" viewBox="0 0 910 560">',
           '<rect width="100%" height="100%" fill="#111b2a"/>',
           '<text x="60" y="36" fill="#f3f6fb" font-family="sans-serif" font-size="21">Helios pilot speedup</text>',
           f'<text x="60" y="56" fill="#b6c4d6" font-family="sans-serif" font-size="12">'
           f'Median renderer time versus sequential · run {html.escape(args.run_id)}</text>']
    for tick in range(0, int(ceiling) + 1):
        y = y_at(tick)
        svg += [f'<line x1="{left}" x2="{left+width}" y1="{y:.1f}" y2="{y:.1f}" stroke="#40516a"/>',
                f'<text x="{left-18}" y="{y+4:.1f}" text-anchor="end" fill="#b6c4d6" '
                f'font-family="sans-serif" font-size="11">{tick}×</text>']
    for i, workload in enumerate(WORKLOADS):
        x = x_at(i)
        svg.append(f'<text x="{x:.1f}" y="{top+height+25}" text-anchor="middle" fill="#e7edf5" '
                   f'font-family="sans-serif" font-size="12">{workload}</text>')
    for index, (backend, ranks, threads, label, color) in enumerate(SERIES):
        points = [(x_at(i), y_at(values[(workload, backend, ranks, threads)]))
                  for i, workload in enumerate(WORKLOADS)]
        path = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
        svg.append(f'<polyline points="{path}" fill="none" stroke="{color}" stroke-width="3"/>')
        for x, y in points:
            svg.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="5" fill="{color}"/>')
        legend_y = 145 + index * 48
        svg += [f'<line x1="690" x2="720" y1="{legend_y}" y2="{legend_y}" stroke="{color}" stroke-width="3"/>',
                f'<text x="730" y="{legend_y+4}" fill="#e7edf5" font-family="sans-serif" '
                f'font-size="12">{html.escape(label)}</text>']
    svg += ['<text x="60" y="510" fill="#b6c4d6" font-family="sans-serif" font-size="11">'
            'Three repeats per condition; short laptop runs. This is pilot evidence, not a final scalability claim.</text>',
            '</svg>']
    args.output.write_text("\n".join(svg), encoding="utf-8")


if __name__ == "__main__":
    main()
