"""Render measured protocol V2 runtime and compute-imbalance comparisons as SVG."""
import argparse
import html
import json
from pathlib import Path

COLORS = {"sequential": "#8898aa", "mpi-static": "#e76f51", "mpi-dynamic": "#2a9d8f",
          "hybrid-adaptive": "#e9c46a", "openmp": "#457b9d", "hybrid-static": "#8d5a97"}


def text(x, y, value, size=12):
    return f'<text x="{x}" y="{y}" fill="#e6edf3" font-size="{size}" font-family="Arial">{html.escape(str(value))}</text>'


def render(rows, field, title, unit, output):
    rows = [r for r in rows if r.get(field) is not None]
    if not rows:
        return None
    maximum = max(max(r[field], r.get("median_ci95_high_seconds") or 0) if field == "median_seconds"
                  else r[field] for r in rows)
    maximum = max(maximum, 1e-9)
    height = 100 + 40 * len(rows)
    marks = ['<rect width="100%" height="100%" fill="#101822"/>', text(24, 35, title, 20)]
    for i, row in enumerate(rows):
        y = 65 + 40 * i
        label = f"{row['scene']} · {row['backend']} {row['ranks']}×{row['threads']}"
        marks.append(text(24, y + 17, label))
        marks.append(f'<rect x="360" y="{y}" width="{580 * row[field] / maximum:.2f}" height="22" '
                     f'fill="{COLORS.get(row["backend"], "#84a59d")}"/>')
        marks.append(text(950, y + 17, f"{row[field]:.3f} {unit}"))
        if field == "median_seconds" and row.get("median_ci95_low_seconds") is not None:
            lower = 360 + 580 * row["median_ci95_low_seconds"] / maximum
            upper = 360 + 580 * row["median_ci95_high_seconds"] / maximum
            marks.append(f'<line x1="{lower:.2f}" x2="{upper:.2f}" y1="{y+26}" y2="{y+26}" '
                         'stroke="#ffffff" stroke-width="2"/>')
    marks.append(text(24, height - 18, "Source: protocol V2 aggregate derived from raw run records; white line = bootstrap median CI"))
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 {height}" '
           f'role="img" aria-label="{html.escape(title)}">' + "".join(marks) + "</svg>\n")
    output.write_text(svg, encoding="utf-8")
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("experiment_directory", type=Path)
    args = parser.parse_args()
    directory = args.experiment_directory.resolve()
    summary = json.loads((directory / "aggregate/summary.json").read_text(encoding="utf-8"))
    output = directory / "plots"
    output.mkdir(exist_ok=True)
    for path in (render(summary["conditions"], "median_seconds", "Median render time", "s", output / "median-runtime.svg"),
                 render(summary["conditions"], "median_compute_imbalance_fraction", "Active-worker compute imbalance", "fraction", output / "compute-imbalance.svg"),
                 render(summary["conditions"], "median_effective_work_imbalance_fraction", "Effective-work imbalance (compute + injected delay)", "fraction", output / "effective-work-imbalance.svg")):
        if path:
            print(path)


if __name__ == "__main__":
    main()
