"""Check a V2 directory against its manifest and independently hash local PPM pixels."""
import argparse
import json
import re
from collections import Counter
from pathlib import Path


def ppm_hash(path, width, height):
    data = path.read_bytes()
    header = re.match(rb"P6\n(\d+) (\d+)\n255\n", data)
    if not header or int(header[1]) != width or int(header[2]) != height:
        raise ValueError("invalid PPM header or dimensions")
    pixels = data[header.end():]
    if len(pixels) != width * height * 3:
        raise ValueError("incorrect PPM pixel byte count")
    digest = 14695981039346656037
    for byte in pixels:
        digest = ((digest ^ byte) * 1099511628211) & 0xFFFFFFFFFFFFFFFF
    return format(digest, "x")


def verify(directory):
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("protocol_version") != 2:
        raise ValueError("not a V2 experiment")
    paths = sorted((directory / "raw").glob("*.run.json"))
    errors = []
    if len(paths) != manifest.get("records"):
        errors.append(f"record count {len(paths)} differs from manifest {manifest.get('records')}")
    observed = Counter()
    failed = 0
    images_checked = 0
    for path in paths:
        row = json.loads(path.read_text(encoding="utf-8"))
        if row.get("experiment_id") != manifest["experiment_id"]:
            errors.append(f"{path.name}: experiment ID mismatch")
        reference_only = row.get("reference_only", False)
        if not reference_only:
            key = (row["scene"], row["block"], row["backend"], row["ranks"], row["threads"], row["coordinator_only"])
            observed[key] += 1
        if row["return_code"] != 0 or "validation_error" in row:
            failed += 1
            continue
        stats_path = directory / row["files"]["stats.json"]
        if not stats_path.is_file():
            errors.append(f"{path.name}: missing stats JSON")
            continue
        stats = json.loads(stats_path.read_text(encoding="utf-8"))
        if stats != row.get("stats"):
            errors.append(f"{path.name}: embedded and file stats differ")
        if stats["scene"] != row["scene"] or stats["spp"] != row["spp"]:
            errors.append(f"{path.name}: configuration differs")
        image_path = directory / row["files"]["ppm"]
        if image_path.is_file():
            try:
                if ppm_hash(image_path, row["width"], row["height"]) != stats["image_hash_fnv1a64"]:
                    errors.append(f"{path.name}: PPM pixel hash differs")
                images_checked += 1
            except ValueError as exc:
                errors.append(f"{path.name}: {exc}")
        if reference_only:
            continue
        tile_path = directory / row["files"]["tiles.csv"]
        if not tile_path.is_file():
            errors.append(f"{path.name}: missing tile CSV")
        if row["backend"].endswith(("dynamic", "adaptive")) and manifest.get("trace_mode", "diagnostic") == "diagnostic":
            trace_path = directory / row["files"]["trace.csv"]
            if not trace_path.is_file():
                errors.append(f"{path.name}: missing trace CSV")
    if manifest["status"] == "complete":
        expected = Counter((scene, block, c["backend"], c["ranks"], c["threads_per_rank"], c["coordinator_only"])
                           for scene in manifest["scenes"]
                           for block in range(-manifest["warmups"], manifest["repeats"])
                           for c in manifest["conditions"])
        if observed != expected:
            errors.append("condition/block matrix differs from manifest")
    if failed != manifest.get("failures", 0):
        errors.append(f"failure count {failed} differs from manifest {manifest.get('failures')}")
    return {"experiment_id": manifest["experiment_id"], "records": len(paths), "failed": failed,
            "ppm_images_checked": images_checked, "errors": errors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("experiment_directory", type=Path)
    args = parser.parse_args()
    report = verify(args.experiment_directory.resolve())
    print(json.dumps(report, indent=2))
    raise SystemExit(1 if report["errors"] else 0)


if __name__ == "__main__":
    main()
