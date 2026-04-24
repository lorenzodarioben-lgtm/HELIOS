"""Render a dependency-free SVG heatmap from measured Helios tile CSV."""
import argparse
import csv
import html
import math
from pathlib import Path


def color(fraction):
    fraction = max(0.0, min(1.0, fraction))
    cold = (27, 54, 91)
    hot = (250, 145, 76)
    return "#{:02x}{:02x}{:02x}".format(*(round(a + (b - a) * fraction)
                                          for a, b in zip(cold, hot)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--metric", choices=["compute_seconds", "rays", "node_visits", "primitive_tests"],
                        default="compute_seconds")
    args = parser.parse_args()
    with args.input.open(newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file))
    if not rows:
        raise ValueError("empty tile CSV")
    width = max(int(row["x1"]) for row in rows)
    height = max(int(row["y1"]) for row in rows)
    values = [float(row[args.metric]) for row in rows]
    maximum = max(values)
    scale = min(2.0, 900 / width)
    plot_w, plot_h = round(width * scale), round(height * scale)
    document = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {plot_w+40} {plot_h+100}" '
                f'width="{plot_w+40}" height="{plot_h+100}">',
                '<rect width="100%" height="100%" fill="#111b2a"/>',
                f'<text x="20" y="26" fill="#f0f4fa" font-family="sans-serif" font-size="16">'
                f'Helios measured tile {html.escape(args.metric)}</text>',
                f'<text x="20" y="48" fill="#b9c8dc" font-family="sans-serif" font-size="11">'
                f'{width}×{height} · {len(rows)} tiles · max {maximum:.6g}</text>']
    for row, value in zip(rows, values):
        fraction = math.log1p(value) / math.log1p(maximum) if maximum > 0 else 0
        x = 20 + int(int(row["x0"]) * scale)
        y = 60 + int(int(row["y0"]) * scale)
        x2 = 20 + int(int(row["x1"]) * scale)
        y2 = 60 + int(int(row["y1"]) * scale)
        document.append(f'<rect x="{x}" y="{y}" width="{x2-x}" height="{y2-y}" '
                        f'fill="{color(fraction)}" stroke="#111b2a" stroke-width="0.4">'
                        f'<title>tile {row["tile_id"]}, worker {row["worker"]}: {value:.6g}</title></rect>')
    document.append(f'<text x="20" y="{plot_h+82}" fill="#b9c8dc" font-family="sans-serif" font-size="11">'
                    'Blue = lower, orange = higher; logarithmic colour scale</text></svg>')
    args.output.write_text("\n".join(document), encoding="utf-8")


if __name__ == "__main__":
    main()
