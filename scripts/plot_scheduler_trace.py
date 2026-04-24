"""Render a measured MPI assignment trace as an SVG timeline."""
import argparse
import csv
import html
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--run-id", default="measured run")
    args = parser.parse_args()
    with args.input.open(newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file))
    if not rows:
        raise ValueError("assignment trace is empty")
    workers = sorted({int(row["worker"]) for row in rows})
    maximum = max(float(row["completed_seconds"]) for row in rows)
    width, height = 1000, 150 + 80 * len(workers)
    chart_x, chart_w = 120, 820
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
           f'viewBox="0 0 {width} {height}">',
           '<rect width="100%" height="100%" fill="#111b2a"/>',
           '<text x="30" y="36" fill="#f3f6fb" font-family="sans-serif" font-size="20">'
           'Helios MPI assignment timeline</text>',
           f'<text x="30" y="57" fill="#b6c4d6" font-family="sans-serif" font-size="12">'
           f'{html.escape(args.run_id)} · bars show assignment-to-completion time</text>']
    for tick in range(5):
        x = chart_x + chart_w * tick / 4
        svg += [f'<line x1="{x:.1f}" y1="80" x2="{x:.1f}" y2="{height-58}" '
                'stroke="#40516a" stroke-width="1"/>',
                f'<text x="{x:.1f}" y="{height-35}" text-anchor="middle" fill="#b6c4d6" '
                f'font-family="sans-serif" font-size="11">{maximum*tick/4:.3f} s</text>']
    palette = ["#67d5cc", "#f4bf75", "#df87aa", "#94a8ed"]
    for index, worker in enumerate(workers):
        y = 95 + index * 80
        color = palette[index % len(palette)]
        svg.append(f'<text x="25" y="{y+21}" fill="#f3f6fb" font-family="sans-serif" '
                   f'font-size="13">rank {worker}</text>')
        for row in rows:
            if int(row["worker"]) != worker:
                continue
            start = float(row["assigned_seconds"])
            end = float(row["completed_seconds"])
            x = chart_x + chart_w * start / maximum
            w = max(1.5, chart_w * (end - start) / maximum)
            count = int(row["tile_count"])
            tooltip = (f'Rank {worker}: tiles {row["first_tile"]}–'
                       f'{int(row["first_tile"])+count-1}; {count} tiles; '
                       f'render {float(row.get("worker_render_seconds", 0)):.4f} s; '
                       f'stall {float(row.get("worker_stall_seconds", 0)):.4f} s')
            svg.append(f'<rect x="{x:.1f}" y="{y}" width="{w:.1f}" height="34" '
                       f'fill="{color}" stroke="#111b2a" stroke-width="1"><title>'
                       f'{html.escape(tooltip)}</title></rect>')
            if w > 18:
                svg.append(f'<text x="{x+w/2:.1f}" y="{y+22}" text-anchor="middle" '
                           f'fill="#111b2a" font-family="sans-serif" font-size="10">{count}</text>')
    svg += [f'<text x="30" y="{height-10}" fill="#b6c4d6" font-family="sans-serif" font-size="11">'
            'Labels are tile counts; hover for measured render and stall durations.</text>', '</svg>']
    args.output.write_text("\n".join(svg), encoding="utf-8")


if __name__ == "__main__":
    main()
