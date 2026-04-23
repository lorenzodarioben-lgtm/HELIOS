"""Create dependency-free SVGs from one protocol V2 run's measured CSV/JSON."""
import argparse
import csv
import html
import json
from collections import Counter
from pathlib import Path

PALETTE = ["#8492a6", "#e76f51", "#2a9d8f", "#457b9d", "#e9c46a", "#8d5a97", "#74a35c"]


def svg(width, height, content, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
            f'role="img" aria-label="{html.escape(title)}">'
            '<rect width="100%" height="100%" fill="#101822"/>'
            f'<text x="24" y="35" fill="#f5f7fa" font-size="20" font-family="Arial">{html.escape(title)}</text>'
            + "".join(content) + "</svg>\n")


def label(x, y, value, size=12):
    return f'<text x="{x}" y="{y}" fill="#dce4ed" font-size="{size}" font-family="Arial">{html.escape(str(value))}</text>'


def read_csv(path):
    if not path.is_file():
        return []
    with path.open(newline="", encoding="utf-8") as stream:
        return list(csv.DictReader(stream))


def render_run(run_path, outdir):
    row = json.loads(run_path.read_text(encoding="utf-8"))
    if row.get("return_code") != 0 or "validation_error" in row:
        raise ValueError("cannot plot a failed or invalid run")
    root = run_path.parents[1]
    tiles = read_csv(root / row["files"]["tiles.csv"])
    trace = read_csv(root / row["files"]["trace.csv"])
    if not tiles:
        raise ValueError("tile metrics missing")
    outdir.mkdir(parents=True, exist_ok=True)
    title_prefix = f"{row['scene']} {row['backend']} block {row['block']}"
    colors = lambda worker: PALETTE[int(worker) % len(PALETTE)]
    # Spatial ownership: every rectangle is read from the measured tile CSV.
    scale = min(900 / row["width"], 470 / row["height"])
    content = []
    for tile in tiles:
        x, y = 24 + int(tile["x0"]) * scale, 62 + int(tile["y0"]) * scale
        width = (int(tile["x1"]) - int(tile["x0"])) * scale
        height = (int(tile["y1"]) - int(tile["y0"])) * scale
        content.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{width:.2f}" height="{height:.2f}" '
                       f'fill="{colors(tile["worker"])}" stroke="#101822" stroke-width="0.4"/>')
    content.append(label(24, 83 + row["height"] * scale, "Colour = rank / OpenMP worker; tile coordinates and ownership from raw CSV"))
    (outdir / "tile-ownership.svg").write_text(svg(950, int(115 + row["height"] * scale), content,
                                                  title_prefix + " — tile ownership"), encoding="utf-8")
    # Per-worker tile counts, including the coordinator's zero count when present.
    counts = Counter(int(tile["worker"]) for tile in tiles)
    count_content = []
    max_count = max(counts.values())
    for worker in range(max(row["ranks"], row["threads"])):
        y = 65 + worker * 48
        count = counts[worker]
        count_content.append(label(25, y + 20, f"worker {worker}"))
        count_content.append(f'<rect x="125" y="{y}" width="{620 * count/max_count:.2f}" height="27" fill="{colors(worker)}"/>')
        count_content.append(label(760, y + 20, count))
    height = 110 + 48 * max(row["ranks"], row["threads"])
    (outdir / "worker-tile-count.svg").write_text(svg(850, height, count_content,
                                                       title_prefix + " — tile count by worker"), encoding="utf-8")
    if trace:
        max_time = max(float(t["completed_seconds"]) for t in trace)
        max_time = max(max_time, 1e-9)
        timeline = []
        for worker in sorted({int(t["worker"]) for t in trace}):
            timeline.append(label(15, 83 + worker * 45, f"rank {worker}"))
        for task in trace:
            worker = int(task["worker"])
            x = 110 + float(task["assigned_seconds"]) / max_time * 730
            end = 110 + float(task["completed_seconds"]) / max_time * 730
            y = 65 + worker * 45
            timeline.append(f'<rect x="{x:.2f}" y="{y}" width="{max(1, end-x):.2f}" height="26" '
                            f'fill="{colors(worker)}" opacity="0.8"/>')
        timeline.append(label(110, 95 + max(row["ranks"], row["threads"]) * 45,
                              f"0 s                                    completion {max_time:.3f} s"))
        (outdir / "assignment-timeline.svg").write_text(svg(890, 130 + 45 * row["ranks"], timeline,
                                                            title_prefix + " — assignment timeline"), encoding="utf-8")
        max_batch = max(int(t["tile_count"]) for t in trace)
        batch = [label(25, 60, f"Batch size (tiles), maximum {max_batch}")]
        for task in trace:
            x = 65 + float(task["assigned_seconds"]) / max_time * 760
            y = 420 - int(task["tile_count"]) / max_batch * 320
            batch.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="3.3" fill="{colors(task["worker"])}"/>')
        batch.append(label(65, 445, f"assignment time 0 to {max_time:.3f} s; colour = worker"))
        (outdir / "batch-size-over-time.svg").write_text(svg(880, 470, batch,
                                                             title_prefix + " — batch size over time"), encoding="utf-8")
    return outdir


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_record", type=Path, help="path to a *.run.json in a V2 raw directory")
    parser.add_argument("--outdir", type=Path)
    args = parser.parse_args()
    run_path = args.run_record.resolve()
    outdir = args.outdir.resolve() if args.outdir else run_path.parents[1] / "plots" / run_path.stem.removesuffix(".run")
    print(render_run(run_path, outdir))


if __name__ == "__main__":
    main()
