"""Preserve local raw-record file write times as approximate run-end UTC timestamps.

Only valid if the .run.json files have not been rewritten since each run ended; the script
refuses to write when the mtimes are implausibly clustered. The two CSVs written on 2026-09-28
(cf62886e, fe56f15c) span under 0.05 s and carry no chronology; block/position order does.
"""
import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("experiment_directory", type=Path)
    args = parser.parse_args()
    directory = args.experiment_directory.resolve()
    rows = []
    for path in sorted((directory / "raw").glob("*.run.json")):
        record = json.loads(path.read_text(encoding="utf-8"))
        rows.append({"record": path.name, "scene": record["scene"], "block": record["block"],
                     "position_in_block": record["position_in_block"], "backend": record["backend"],
                     "observed_file_write_utc": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
                     "process_wall_seconds": record["process_wall_seconds"]})
    output = directory / "aggregate/observed_run_file_timestamps.csv"
    # Serial runs cannot all end within a fraction of their summed duration; if they appear to,
    # the files were rewritten afterwards (as happened for cf62886e and fe56f15c) and carry no chronology.
    stamps = sorted(r["observed_file_write_utc"] for r in rows)
    if len(rows) > 1:
        span = (datetime.fromisoformat(stamps[-1]) - datetime.fromisoformat(stamps[0])).total_seconds()
        if span < 0.5 * sum(r["process_wall_seconds"] for r in rows):
            print(f"refusing to write: file mtimes span {span:.3f} s for {len(rows)} serial runs; "
                  "they were rewritten after the runs and are not run-end times")
            return 1
    output.parent.mkdir(exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]) if rows else ["record"])
        writer.writeheader()
        writer.writerows(rows)
    print(output, f"{len(rows)} records")
    return 0


if __name__ == "__main__":
    sys.exit(main())
