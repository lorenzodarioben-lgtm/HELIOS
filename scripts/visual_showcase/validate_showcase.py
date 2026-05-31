"""Validate every showcase asset against its source evidence. Writes assets/showcase/validation.json.

Checks: render hashes recomputed from PPMs, convergence invariants, backend pixel equality, scheduler
trace consistency, video decode/resolution/frame counts/blank frames, and that formal evidence,
the report and src/include/tests are byte-identical to the pre-sprint snapshot.
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

import evidence_data as E
import scheduler_data as sd
from common import ROOT, SHOWCASE, read_ppm, verify_hash
from video import probe

RESULTS = {}
FAIL = []


def check(name, ok, detail=None):
    RESULTS[name] = {"ok": bool(ok), **({"detail": detail} if detail is not None else {})}
    print(("PASS " if ok else "FAIL ") + name + (f"  {detail}" if detail is not None else ""))
    if not ok:
        FAIL.append(name)


def png_size(p):
    with Image.open(p) as im:
        return im.size


def gallery():
    g = json.loads((SHOWCASE / "gallery" / "gallery.json").read_text())
    for r in g["renders"]:
        png = ROOT / r["png"]
        size_ok = png_size(png) == (r["width"], r["height"]) == (1920, 1080)
        ppm = ROOT / "assets/showcase/_work/gallery" / f"{r['scene']}.ppm"
        pix_ok = None
        if ppm.exists():
            verify_hash(ppm, r["hash_fnv1a64"])
            w, h, px = read_ppm(ppm)
            pix_ok = np.array_equal(np.asarray(Image.open(png).convert("RGB")), np.frombuffer(px, np.uint8).reshape(h, w, 3))
        check(f"gallery/{r['scene']}", size_ok and r["hash_recomputed"] == r["hash_fnv1a64"] and pix_ok is not False,
              {"hash": r["hash_fnv1a64"], "png_equals_ppm": pix_ok, "spp": r["spp"]})
    return g


def convergence():
    m = json.loads((SHOWCASE / "convergence" / "convergence.json").read_text())
    fr = m["frames"]
    same = all((f["scene"], f["width"], f["height"], f["max_depth"], f["seed"], f["backend"]) ==
               (fr[0]["scene"], fr[0]["width"], fr[0]["height"], fr[0]["max_depth"], fr[0]["seed"], fr[0]["backend"]) for f in fr)
    spps = [f["spp"] for f in fr]
    distinct = len({f["hash_fnv1a64"] for f in fr}) == len(fr)
    args_only_spp = all(f["command"].replace(f"--spp {f['spp']} ", "").replace(f"{f['spp']:04d}spp", "N")
                        == fr[0]["command"].replace(f"--spp {fr[0]['spp']} ", "").replace(f"{fr[0]['spp']:04d}spp", "N") for f in fr)
    sizes = all(png_size(ROOT / f["png"]) == (f["width"], f["height"]) for f in fr)
    check("convergence/invariants", same and args_only_spp and sizes and distinct and all(f["hash_recomputed"] == f["hash_fnv1a64"] for f in fr),
          {"spp": spps, "commands_differ_only_in_spp": args_only_spp, "all_hashes_distinct": distinct})


def correctness():
    d = json.loads((SHOWCASE / "correctness" / "backend-correctness.json").read_text())
    pixels = []
    for r in d["backends"]:
        p = ROOT / r["output_path"]
        verify_hash(p, r["hash"])
        pixels.append(read_ppm(p)[2])
    identical = len(set(pixels)) == 1
    ref = json.loads((ROOT / "results/screenshot/showcase.json").read_text())["image_hash_fnv1a64"]
    check("correctness/all-backends-byte-identical", identical and d["all_hashes_identical"],
          {"backends": len(pixels), "hash": d["backends"][0]["hash"], "matches_figure11_evidence_hash": d["backends"][0]["hash"] == ref})


def scheduler():
    v = json.loads((SHOWCASE / "scheduler" / "scheduler-trace-validation.json").read_text())
    for mode in ("static", "dynamic", "adaptive"):
        rt = sd.load(mode, block=v[mode]["block"])
        again = sd.validate(rt)
        check(f"scheduler/{mode}-trace", again["every_tile_exactly_once"] and rt.run_id == v[mode]["run"],
              {"run": rt.run_id, "derived_end_s": again["derived_end_seconds"], "recorded_wall_s": again["recorded_wall_seconds"],
               **({"batches": again["batches"], "batch_sizes": again["batch_sizes"],
                   "max_receipt_slack_ms": again["max_receipt_slack_ms"]} if rt.batches else {})})


def videos():
    for mp4 in sorted(SHOWCASE.rglob("*.mp4")):
        n, w, h, fps = probe(mp4)
        # blank-frame check on a sample of decoded frames
        import imageio_ffmpeg
        r = imageio_ffmpeg.read_frames(str(mp4))
        next(r)
        stds = []
        for k, buf in enumerate(r):
            if k % 15 == 0:
                stds.append(float(np.frombuffer(buf, np.uint8).std()))
        check(f"video/{mp4.relative_to(SHOWCASE).as_posix()}", (w, h) == (1920, 1080) and n > 0 and min(stds) > 8,
              {"frames": n, "size": f"{w}x{h}", "fps": fps, "seconds": round(n / fps, 2), "min_sampled_frame_std": round(min(stds), 1)})


def pngs():
    small = []
    for p in sorted(SHOWCASE.rglob("*.png")):
        if "_work" in p.parts:
            continue
        w, h = png_size(p)
        if w < 1200 and "thumbs" not in p.parts and "frames" not in p.parts:
            small.append(f"{p.name} {w}x{h}")
    check("png/no-accidental-low-resolution", not small, small or None)


def values():
    """Headline values shown in graphics, re-read from evidence and compared with the report's stated values."""
    st = E.strong()
    ab = E.ab()["groups"]
    got = {"openmp8_speedup": round(st[("openmp", 1, 8)]["speedup_vs_sequential"], 2),
           "mpi4_speedup": round(st[("mpi-static", 4, 1)]["speedup_vs_sequential"], 2),
           "hybrid1x4_speedup": round(st[("hybrid-static", 1, 4)]["speedup_vs_sequential"], 2),
           "seq_both_fixes_pct": round(ab["sequential"]["fixed"]["median_relative_change"] * 100, 2),
           "cap4": round(sum(E.tile_costs()) / max(s for *_, s in E.partitions(E.tile_costs(), 4)), 2),
           "stress_elapsed": round(E.stress()[0]["elapsed_wall_seconds"], 2)}
    report = (ROOT / "report/HELIOS_FINAL_REPORT.md").read_text(encoding="utf-8")
    expect = {"openmp8_speedup": "2.97×", "mpi4_speedup": "1.95×", "hybrid1x4_speedup": "2.45×",
              "seq_both_fixes_pct": "-44.62%", "cap4": "2.34×", "stress_elapsed": "600.34 s"}
    fmt = {"seq_both_fixes_pct": lambda v: f"{v:.2f}%", "stress_elapsed": lambda v: f"{v:.2f} s"}
    ok = all((fmt.get(k, lambda v: f"{v:.2f}×")(v)) == expect[k] and expect[k] in report for k, v in got.items())
    check("values/match-report", ok, got)


def frozen(snapshot):
    before = {}
    for line in Path(snapshot).read_text().splitlines():
        h, p = line.split(None, 1)
        before[p.lstrip("*").replace("C:/Users/lorenzodario/Documents/PersonalProjects/Helios/", "")] = h
    changed, missing = [], []
    for p, h in before.items():
        if p.startswith("assets/showcase/"):
            continue
        f = ROOT / p
        if p.startswith("assets/") and not p.startswith(("assets/helios-", "assets/imbalanced", "assets/reflective")):
            pass
        if not f.exists():
            missing.append(p)
        elif hashlib.sha256(f.read_bytes()).hexdigest() != h:
            changed.append(p)
    check("frozen/results+src+include+tests+report+assets unchanged", not changed and not missing,
          {"files": len(before), "changed": changed[:10], "missing": missing[:10]})


if __name__ == "__main__":
    gallery()
    convergence()
    correctness()
    scheduler()
    pngs()
    videos()
    values()
    if len(sys.argv) > 1:
        frozen(sys.argv[1])
    (SHOWCASE / "validation.json").write_text(json.dumps({"failures": FAIL, "checks": RESULTS}, indent=1) + "\n")
    print("RESULT", "FAIL " + ", ".join(FAIL) if FAIL else "PASS")
    sys.exit(1 if FAIL else 0)
