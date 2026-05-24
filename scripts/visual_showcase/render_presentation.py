"""Presentation renders with the frozen Helios binaries (NOT formal benchmark evidence).

  python render_presentation.py gallery      # 1920x1080, 1024 SPP, one image per built-in scene
  python render_presentation.py convergence  # one scene, only SPP changes: 1..256
  python render_presentation.py correctness  # same showcase config on every backend, hashes compared

Every run records its exact command, the renderer's hash, an independently recomputed hash,
the render time (informational only), the binary SHA-256 and the Git HEAD.
"""
import argparse
import datetime

from common import (HELIOS, HELIOS_MPI, PRESENTATION_NOTE, SHOWCASE, WORK, check_binaries, git_head,
                    ppm_to_image, rel, run_render, sha256, verify_hash, write_json)

GALLERY_SCENES = ["reflective", "showcase", "bvh_stress", "uniform", "imbalanced", "scheduler_stress"]
GALLERY = dict(width=1920, height=1080, spp=1024, depth=8, seed=42)
CONVERGENCE = dict(scene="reflective", width=1280, height=720, depth=8, seed=42,
                   spp=[1, 2, 4, 8, 16, 32, 64, 128, 256])
# The validated end-to-end run (report Figure 13) / live-demo configuration.
CORRECTNESS = dict(scene="showcase", width=800, height=450, spp=64, depth=8, seed=42)
BACKENDS = [  # (label, backend, mpi ranks, threads)
    ("Sequential", "sequential", None, 1),
    ("OpenMP", "openmp", None, 4),
    ("MPI static", "mpi-static", 4, 1),
    ("MPI dynamic", "mpi-dynamic", 3, 1),
    ("Hybrid static", "hybrid-static", 2, 2),
    ("Hybrid dynamic", "hybrid-dynamic", 3, 2),
    ("Hybrid adaptive", "hybrid-adaptive", 3, 2),
]


def provenance():
    return {"note": PRESENTATION_NOTE, "git_head": git_head(),
            "helios_exe_sha256": sha256(HELIOS), "helios_mpi_exe_sha256": sha256(HELIOS_MPI),
            "generated_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")}


def base_args(scene, width, height, spp, depth, seed, ppm, stats):
    return ["--scene", scene, "--width", str(width), "--height", str(height), "--spp", str(spp),
            "--max-depth", str(depth), "--seed", str(seed), "--output", rel(ppm), "--stats-json", rel(stats)]


def gallery(only=None):
    out_dir, work = SHOWCASE / "gallery", WORK / "gallery"
    work.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / "gallery.json"
    records = {}
    if manifest_path.exists():
        import json
        records = {r["scene"]: r for r in json.loads(manifest_path.read_text())["renders"]}
    for scene in GALLERY_SCENES:
        if only and scene not in only:
            continue
        ppm, stats = work / f"{scene}.ppm", work / f"{scene}.json"
        args = ["--backend", "openmp", "--threads", "8", "--omp-schedule", "dynamic"] + base_args(
            scene, GALLERY["width"], GALLERY["height"], GALLERY["spp"], GALLERY["depth"], GALLERY["seed"], ppm, stats)
        r = run_render(args)
        r["hash_recomputed"] = verify_hash(ppm, r["hash_fnv1a64"])
        png = out_dir / f"{scene}-hero.png"
        png.parent.mkdir(parents=True, exist_ok=True)
        ppm_to_image(ppm).save(png, optimize=True)
        r.update(spp=GALLERY["spp"], max_depth=GALLERY["depth"], seed=GALLERY["seed"], png=rel(png))
        r.pop("stdout")
        records[scene] = r
        print(f"{scene}: {r['render_seconds']:.1f} s hash {r['hash_fnv1a64']}", flush=True)
        write_json(manifest_path, {**provenance(), "renders": [records[s] for s in GALLERY_SCENES if s in records]})


def wide():
    """A genuine wide (12:5) render of the hero scene for banners: a real render, not a crop."""
    work, out = WORK / "gallery", SHOWCASE / "gallery"
    work.mkdir(parents=True, exist_ok=True)
    ppm, stats = work / "reflective-wide.ppm", work / "reflective-wide.json"
    w, h = 2400, 1000
    args = ["--backend", "openmp", "--threads", "8", "--omp-schedule", "dynamic"] + base_args(
        "reflective", w, h, GALLERY["spp"], GALLERY["depth"], GALLERY["seed"], ppm, stats)
    r = run_render(args)
    r["hash_recomputed"] = verify_hash(ppm, r["hash_fnv1a64"])
    png = out / "reflective-wide.png"
    ppm_to_image(ppm).save(png, optimize=True)
    r.update(spp=GALLERY["spp"], max_depth=GALLERY["depth"], seed=GALLERY["seed"], png=rel(png))
    r.pop("stdout")
    write_json(out / "reflective-wide.json", {**provenance(), "render": r})
    print(f"reflective wide: {r['render_seconds']:.1f} s hash {r['hash_fnv1a64']}")


def convergence():
    c = CONVERGENCE
    out_dir, work = SHOWCASE / "convergence", WORK / "convergence"
    work.mkdir(parents=True, exist_ok=True)
    frames = []
    for spp in c["spp"]:
        ppm, stats = work / f"{c['scene']}-{spp:04d}spp.ppm", work / f"{c['scene']}-{spp:04d}spp.json"
        args = ["--backend", "openmp", "--threads", "8", "--omp-schedule", "dynamic"] + base_args(
            c["scene"], c["width"], c["height"], spp, c["depth"], c["seed"], ppm, stats)
        r = run_render(args)
        r["hash_recomputed"] = verify_hash(ppm, r["hash_fnv1a64"])
        png = out_dir / "frames" / f"{c['scene']}-{spp:04d}spp.png"
        png.parent.mkdir(parents=True, exist_ok=True)
        ppm_to_image(ppm).save(png, optimize=True)
        r.update(spp=spp, max_depth=c["depth"], seed=c["seed"], png=rel(png))
        r.pop("stdout")
        frames.append(r)
        print(f"{spp:4d} spp: {r['render_seconds']:.2f} s hash {r['hash_fnv1a64']}", flush=True)
    write_json(out_dir / "convergence.json", {**provenance(), "constant": {k: v for k, v in c.items() if k != "spp"},
                                               "frames": frames})


def correctness():
    c = CORRECTNESS
    out_dir, work = SHOWCASE / "correctness", WORK / "correctness"
    work.mkdir(parents=True, exist_ok=True)
    rows = []
    for label, backend, ranks, threads in BACKENDS:
        ppm, stats = work / f"{backend}.ppm", work / f"{backend}.json"
        args = ["--backend", backend, "--threads", str(threads)] + base_args(
            c["scene"], c["width"], c["height"], c["spp"], c["depth"], c["seed"], ppm, stats)
        r = run_render(args, mpi_ranks=ranks)
        r["hash_recomputed"] = verify_hash(ppm, r["hash_fnv1a64"])
        thumb = out_dir / "thumbs" / f"{backend}.png"
        thumb.parent.mkdir(parents=True, exist_ok=True)
        ppm_to_image(ppm).save(thumb, optimize=True)
        rows.append({"label": label, "backend": backend, "mpi_ranks": ranks or 1, "threads_per_rank": threads,
                     "command": r["command"], "hash": r["hash_fnv1a64"], "hash_recomputed": r["hash_recomputed"],
                     "runtime_seconds_informational": r["render_seconds"], "output_path": rel(ppm),
                     "thumbnail": rel(thumb)})
        print(f"{label:16} {r['hash_fnv1a64']}  {r['render_seconds']:.2f} s", flush=True)
    hashes = {r["hash"] for r in rows}
    write_json(out_dir / "backend-correctness.json", {
        **provenance(), "configuration": c, "all_hashes_identical": len(hashes) == 1,
        "runtime_note": "Runtimes are single informational runs, not benchmarks.", "backends": rows})
    if len(hashes) != 1:
        raise SystemExit("BACKEND HASHES DIFFER: " + str(hashes))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("what", choices=["gallery", "wide", "convergence", "correctness"])
    p.add_argument("--only", nargs="*")
    a = p.parse_args()
    check_binaries()
    {"gallery": lambda: gallery(a.only), "wide": wide, "convergence": convergence, "correctness": correctness}[a.what]()
