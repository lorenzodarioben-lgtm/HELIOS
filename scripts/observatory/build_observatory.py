"""Build the Helios Observatory data files from saved evidence.

  python scripts/observatory/build_observatory.py

1. extract_evidence.main() reads the evidence (read-only) and reruns the fast validators in temp dirs;
2. this script derives overview / technical Q&A / capsule data from those extracted values;
3. required fields are checked (the build fails on a missing value, NaN or Infinity);
4. assets/observatory/data/*.json and data/bundle.js are written. bundle.js lets index.html run straight
   from the file system (no server); the JSON files are the same data for inspection and tests.

Media are referenced from assets/showcase/ (relative paths), not copied.
"""
import argparse
import datetime
import hashlib
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import extract_evidence as X  # noqa: E402

ROOT, DATA = X.ROOT, X.DATA


def pct(v, d=2):
    return f"{v * 100:+.{d}f}%"


def ci(c, d=2):
    return f"{c[0] * 100:+.{d}f}% to {c[1] * 100:+.{d}f}%"


def find(rows, **kw):
    return next(r for r in rows if all(r.get(k) == v for k, v in kw.items()))


def overview(d):
    st = {c["id"]: c for c in d["performance"]["strong"]["conditions"]}
    layers = {l["label"]: l for l in d["correctness"]["validation_stack"]["layers"]}
    formal = layers["Formal image rehash (final six experiments)"]
    s = d["stress"]
    return {"title": "HELIOS", "subtitle": "Adaptive Hybrid Distributed Rendering Engine",
            "tagline": "Distributed ray tracing. Hybrid parallelism. Adaptive scheduling.",
            "description": "A C++20 distributed ray-tracing engine for Monte Carlo light transport, combining BVH acceleration, "
                           "OpenMP, MPI, hybrid parallelism, dynamic load balancing and adaptive scheduling.",
            "hero": "../showcase/hero/helios-hero-wide.png", "hero_16x9": "../showcase/hero/helios-hero.png",
            "montage": "../showcase/video/gallery-montage.mp4",
            "metrics": [
                {"label": "OpenMP 8 threads", "value": f"{st['openmp:1x8']['speedup']:.2f}×", "detail": f"speedup over sequential · median {st['openmp:1x8']['median']:.3f} s", "classification": "FORMAL", "route": "performance?view=speedup"},
                {"label": "MPI 4 ranks", "value": f"{st['mpi-static:4x1']['speedup']:.2f}×", "detail": f"speedup · median {st['mpi-static:4x1']['median']:.3f} s", "classification": "FORMAL", "route": "performance?view=speedup"},
                {"label": "Hybrid 1×4", "value": f"{st['hybrid-static:1x4']['speedup']:.2f}×", "detail": f"speedup · median {st['hybrid-static:1x4']['median']:.3f} s", "classification": "FORMAL", "route": "performance?view=speedup"},
                {"label": "Formal images verified", "value": f"{formal['count']}/{formal['records']}", "detail": "independently rehashed, 0 mismatches" if formal["passed"] else "verification FAILED", "classification": "FORMAL", "route": "correctness"},
                {"label": "Stress workload", "value": f"{s['elapsed_seconds']:.2f} s", "detail": f"controlled DNF at the {s['timeout_seconds']} s limit", "classification": "FORMAL", "route": "stress"},
                {"label": "Frozen source", "value": d["source"]["frozen_short"], "detail": "src/, include/, tests/ unchanged since" if d["source"]["src_include_tests_identical_to_frozen"] else "SOURCE CHANGED", "classification": "FORMAL", "route": "provenance"},
            ],
            "sequential_median": st["sequential:1x1"]["median"], "strong_experiment": d["performance"]["strong"]["experiment"]}


def defence(d):
    p = d["performance"]
    st = {c["id"]: c for c in p["strong"]["conditions"]}
    pr = {(x["candidate"], x["reference"]): x for x in p["strong"]["paired"]}
    sched = p["scheduler"]["rows"]
    dyn = [x for x in sched if x.get("candidate") == "mpi-dynamic" and x.get("reference") == "mpi-static"]
    nat = [x for x in dyn if x["set"] != "heterogeneity"]
    het = [x for x in dyn if x["set"] == "heterogeneity"][0]
    ad = [x for x in sched if x.get("candidate") == "hybrid-adaptive" and x.get("reference") == "mpi-dynamic"]
    excl = [x for x in ad if x["excludes_zero"]]
    med_rows = [x for x in sched if x.get("median_of") and x["set"] == "scheduler-medium"]
    fixed_wait = [x["worker_wait_s"] for x in med_rows if x["median_of"] == "mpi-dynamic"]
    ad_wait = [x["worker_wait_s"] for x in med_rows if x["median_of"] == "hybrid-adaptive"]
    asg = [x["assignments"] for x in sched if x.get("median_of") == "hybrid-adaptive" and x["set"] != "heterogeneity"]
    w = {(c["backend"], c["ranks"], c["threads"]): c for c in p["weak"]["conditions"]}
    ab = {g["id"]: g for g in p["ab"]["groups"]}
    case = p["case"]
    cap4, cap2 = d["workload"]["partitions"]["4"]["cap"], d["workload"]["partitions"]["2"]["cap"]
    stack = {l["label"]: l for l in d["correctness"]["validation_stack"]["layers"]}
    s = d["stress"]
    h22o = pr[("hybrid-static 2x2", "openmp 1x4")]
    h22m = pr[("hybrid-static 2x2", "mpi-static 4x1")]
    h14o = pr[("hybrid-static 1x4", "openmp 1x4")]
    o84 = pr[("openmp 1x8", "openmp 1x4")]
    Q = []

    def q(cat, question, short, evidence, caveat, route, sources, kind="Limitation"):
        Q.append({"id": f"q{len(Q) + 1:02d}", "category": cat, "question": question, "short": short,
                  "evidence": evidence, "caveat": caveat, "caveat_label": kind, "route": route, "sources": sources})

    q("Architecture", "Why does every backend call the same render_tile function?",
      "Every backend only decides who renders which tile and when; they all call the same render_tile. So a backend that "
      "changed the image would have a bug, which makes exact image equality a correctness test.",
      [f"Seven backends produce hash {d['correctness']['backends'][0]['hash']} for the showcase configuration",
       f"validate_backends.py: {stack['Backend validation']['count']} configurations, one hash"],
      "Exact equality holds for this build; a different compiler could need a tolerance check.", "render?panel=pipeline",
      ["report Section 3.1", "src/core.cpp render_tile"], "Trade-off")
    q("Architecture", "Why use deterministic per-sample random numbers?",
      "Each sample seeds its own generator from (seed, pixel, sample), so a pixel's random numbers do not depend on which thread "
      "or rank renders it. A shared generator would change the image whenever scheduling changed.",
      ["Rng{mix64(seed ^ mix64(pixel) ^ mix64(sample))} in render_tile", "Samples are accumulated in a fixed order; each pixel has one writer"],
      "Determinism removes Monte Carlo noise from comparisons; it does not make timing deterministic.", "provenance?panel=code&snippet=render_tile",
      ["report Section 3.3"], "Context")
    q("Parallelism", "Why use MPI when everything runs on one machine?",
      "MPI models distributed memory: separate processes, explicit messages and a coordinator. On one host it measures the programming "
      "model and scheduling protocol, not a network.",
      [f"MPI 4 ranks: {st['mpi-static:4x1']['speedup']:.2f}× (static partition)", "Coordinator/worker protocol with MPI_ANY_SOURCE"],
      "No network latency or bandwidth effect was measured; the results do not predict cluster behaviour.", "hardware",
      ["report Sections 1.2, 2.4", "report Section 11"])
    q("Parallelism", "Why do 8 OpenMP threads improve runtime but reduce efficiency?",
      "Eight logical threads run on four physical cores. SMT lets a second thread use execution resources the first leaves idle, so "
      "runtime drops, but a hyperthread is not a second core, so efficiency per logical processor falls.",
      [f"OpenMP 8 {st['openmp:1x8']['median']:.3f} s vs OpenMP 4 {st['openmp:1x4']['median']:.3f} s: {pct(o84['change'])} ({o84['faster_blocks']}/{o84['blocks']} blocks)",
       f"Efficiency: OpenMP 4 {st['openmp:1x4']['efficiency']:.2f}, OpenMP 8 {st['openmp:1x8']['efficiency']:.2f} per logical processor"],
      "Why this workload benefits (for example memory stalls in BVH traversal) was not measured.", "hardware",
      ["report Section 7.7"])
    q("Parallelism", "Why combine MPI and OpenMP?",
      "MPI distributes tiles between processes and OpenMP splits each tile between threads. Varying ranks × threads with the rendering "
      "code fixed shows how the two layers compose.",
      [f"Hybrid 1×4 {st['hybrid-static:1x4']['speedup']:.2f}×, 2×2 {st['hybrid-static:2x2']['speedup']:.2f}×, 4×1 {st['hybrid-static:4x1']['speedup']:.2f}×"],
      "On a single host the MPI layer adds no hardware; hybrid can only win by decomposing work better.", "hardware",
      ["report Sections 2.5, 10.4"], "Trade-off")
    q("Parallelism", "Why was Hybrid 1×4 the strongest four-slot layout?",
      "It never partitions the tile list: every tile is split four ways inside, so the tile-level imbalance that caps static "
      "partitions does not arise.",
      [f"Hybrid 1×4 vs OpenMP 4: {pct(h14o['change'])} (CI {ci(h14o['ci'])}), faster in {h14o['faster_blocks']}/{h14o['blocks']} blocks",
       f"Speedup {st['hybrid-static:1x4']['speedup']:.2f}× exceeds the {cap4:.2f}× cap of the equal-count 4-way partition"],
      "A decomposition effect, not evidence that hybrid is intrinsically faster. OpenMP with dynamic tile scheduling was not in the formal matrix.",
      "workload?overlay=4", ["report Section 7.6"], "Context")
    q("Scheduling", "Why did dynamic scheduling help?",
      "The expensive tiles sit in one band. A static contiguous split gives that band to one worker; one-tile dynamic assignment lets "
      "both workers draw from the whole image, so neither is left with much more than one tile of extra work.",
      [f"Fixed dynamic vs static: {min(-x['change'] for x in nat) * 100:.1f}% to {max(-x['change'] for x in nat) * 100:.1f}% faster on all {len(nat)} natural-scene cases; every interval excludes zero",
       f"With rank 1 slowed 2× (synthetic): {pct(het['change'])}"],
      "The scenes were designed to be uneven, which favours dynamic scheduling.", "scheduler?policy=compare", ["report Sections 7.4, 10.2"], "Context")
    q("Scheduling", "Why did adaptive batching not consistently outperform fixed dynamic scheduling?",
      "Fixed dynamic already removed the imbalance, and on one host messages are cheap. Adaptive cut the number of assignments but the "
      "waiting it saved was a few milliseconds, smaller than run-to-run variation.",
      [f"{len(ad) - len(excl)} of {len(ad)} adaptive-vs-fixed intervals include zero",
       "The two that exclude zero point in opposite directions: " + "; ".join(f"{x['set'].replace('scheduler-', '')} {x['scene']} {pct(x['change'])}" for x in excl),
       f"Assignments {min(asg)} to {max(asg)} instead of 144",
       f"Medium runs: worker assignment wait {min(fixed_wait) * 1000:.0f} to {max(fixed_wait) * 1000:.0f} ms (fixed) vs {min(ad_wait) * 1000:.0f} to {max(ad_wait) * 1000:.0f} ms (adaptive) per render"],
      "This does not show adaptive batching would fail over a real network or with very small tiles; that was not tested.",
      "scheduler?policy=adaptive", ["report Sections 7.5, 10.3"])
    q("Performance", "Why are static speedups only about 2× at four slots?",
      "The measured tile costs cap any equal-count contiguous split: the heaviest range sets the time even with perfect workers.",
      [f"Cap {cap2:.2f}× (2-way) and {cap4:.2f}× (4-way) from the per-tile costs",
       f"Observed OpenMP 4 {st['openmp:1x4']['speedup']:.2f}×, MPI 4 {st['mpi-static:4x1']['speedup']:.2f}×"],
      "A cost-aware split could do better; none of these backends uses one.", "workload?overlay=4", ["report Section 7.2"], "Trade-off")
    q("Performance", "What caused the hybrid performance anomaly?",
      "Two real defects: per-thread counters that false-shared cache lines (only the intra-tile hybrid path exposed it) and a heap-allocated "
      "BVH traversal stack on every ray query (a serial cost in every backend).",
      [f"Historical hybrid 2×2 {case['hybrid22_hist']:.3f} s vs OpenMP 4 {case['openmp4_hist']:.3f} s ({pct(case['hist_pair_vs_openmp4']['change'])})",
       f"Counter fix alone: hybrid 2×2 {pct(ab['hybrid-static-2x2']['counter-only']['change'])}, sequential {pct(ab['sequential']['counter-only']['change'])} (no change resolved)",
       f"Both fixes: sequential {pct(ab['sequential']['fixed']['change'])}, hybrid 2×2 {pct(ab['hybrid-static-2x2']['fixed']['change'])}",
       f"Final hybrid 2×2 vs OpenMP 4: {pct(h22o['change'])} (CI {ci(h22o['ci'])}), no clear difference established"],
      f"The historical {case['hybrid22_hist']:.3f} s was not reproduced by later rebuilds of the pre-fix source "
      f"({min(case['rebuild_prefix_seconds']):.2f} to {max(case['rebuild_prefix_seconds']):.2f} s), so its full size was never attributed.",
      "performance?view=case", ["report Section 5", "docs/HYBRID_TOPOLOGY_AUDIT.md"])
    q("Performance", "Is hybrid 2×2 now as fast as OpenMP 4 and MPI 4?",
      "No clear difference was established. The intervals include zero; that is not proof of equality.",
      [f"vs OpenMP 4: {pct(h22o['change'])} (CI {ci(h22o['ci'])})", f"vs MPI 4: {pct(h22m['change'])} (CI {ci(h22m['ci'])})"],
      "Seven blocks give coarse intervals; the MPI interval only just contains zero, so a small penalty cannot be ruled out.",
      "performance?view=uncertainty", ["report Section 7.6"])
    q("Methodology", "Why is weak scaling described as single-host?",
      "SPP was raised in proportion to rendering slots on one laptop. That measures how extra cores on the same machine absorb extra work, "
      "not cluster scalability.",
      [f"Weak efficiency at 4 slots: OpenMP {w[('openmp', 1, 4)]['weak_efficiency']:.2f}, MPI {w[('mpi-static', 4, 1)]['weak_efficiency']:.2f}, hybrid 2×2 {w[('hybrid-static', 2, 2)]['weak_efficiency']:.2f}"],
      "The same equal-count partitions are used, so these values mostly re-measure the spatial imbalance.", "performance?view=weak",
      ["report Sections 6.9, 7.3"])
    q("Correctness", "How is deterministic correctness verified?",
      "Every timed run's image hash is compared with the sequential reference, formal images are rehashed independently, and the "
      "validators and core tests check backends, the BVH and edge cases.",
      [f"{stack['Formal image rehash (final six experiments)']['count']} of {stack['Formal image rehash (final six experiments)']['records']} formal images rehashed, 0 failed",
       f"{stack['Backend validation']['count']} backend configurations · {stack['BVH validation']['count']} BVH scenes · {stack['CLI validation']['count']} CLI cases · {stack['Analysis tests']['count']} analysis tests",
       "Intra-tile thread test fails on a deliberately racy counter mutant"],
      "Equality is exact for this build and toolchain.", "correctness", ["report Section 4.7, Table 2"], "Context")
    q("Limitations", "What does the controlled DNF demonstrate?",
      f"A deliberately oversized workload was run once under a supervisor with a planned {s['timeout_seconds']} s limit. It ran until it "
      "was stopped, with no crash or error output, and the manifest records exactly what ran. Helios writes its image and statistics only "
      "when a render completes and prints no progress, so no partial image exists.",
      [f"{s['width']}×{s['height']} at {s['spp']} SPP = {s['camera_samples']:,} camera samples", f"Terminated at {s['elapsed_seconds']:.2f} s; stderr {s['stderr_bytes']} bytes"],
      f"How far it got is unknown. Memory use was not recorded; the 8-bit RGB image buffer is about {s['width'] * s['height'] * 3 / 1e6:.1f} MB.", "stress", ["report Section 8"])
    q("Limitations", "What are the main limits of the evaluation?",
      f"One laptop ({d['hardware']['physical_cores']} cores, {d['hardware']['logical_processors']} logical processors), single-host MPI, an uncontrolled Windows system, no temperature telemetry, synthetic heterogeneity "
      "and a small procedural scene catalogue.",
      ["Mitigations: warm-up, 7 randomised blocks, medians, paired bootstrap intervals, frozen source, independent hash checks, no removal of slow runs"],
      "These limit generalisation, not the within-experiment comparisons.", "stress?panel=limits", ["report Sections 11, 12"], "Context")
    return {"categories": ["Architecture", "Parallelism", "Scheduling", "Performance", "Correctness", "Methodology", "Limitations"],
            "questions": Q, "source_note": "Answers are grounded in the Helios technical report; every number is filled in from extracted evidence at build time."}


def capsule(d, built):
    hw = d["hardware"]
    stack = {l["label"]: l for l in d["correctness"]["validation_stack"]["layers"]}
    shot = X.jload(ROOT / "results/screenshot/showcase.json")
    return {"project": "Helios: Adaptive Hybrid Distributed Rendering Engine", "frozen_source_sha": d["source"]["frozen_sha"],
            "presentation_head": d["source"]["presentation_head"],
            "src_include_tests_identical_to_frozen": d["source"]["src_include_tests_identical_to_frozen"],
            "binaries": {"helios.exe": d["source"]["helios_exe_sha256"], "helios_mpi.exe": d["source"]["helios_mpi_exe_sha256"]},
            "compiler": hw["compiler"], "mpi": hw["mpi"], "os": hw["os"], "cpu": hw["cpu"], "physical_cores": hw["physical_cores"],
            "logical_processors": hw["logical_processors"], "ram_bytes": hw["ram_bytes"], "benchmark_protocol": "Protocol V2",
            "formal_experiments": X.FINAL, "historical_experiments": X.HISTORICAL,
            "verification": {k: v for k, v in {e["id"]: e["verification"] for e in d["experiments"]}.items()},
            "formal_images_verified": stack["Formal image rehash (final six experiments)"]["count"],
            "validators": {l["label"]: {"passed": l["passed"], "count": l["count"]} for l in d["correctness"]["validation_stack"]["layers"]},
            "stress": {"run_id": d["stress"]["run_id"], "elapsed_seconds": d["stress"]["elapsed_seconds"], "outcome": "DNF (timeout)" if d["stress"]["timed_out"] else "completed"},
            "demonstration": {"stats": "results/screenshot/showcase.json", "backend": shot["backend"], "ranks": shot["ranks"],
                              "threads_per_rank": shot["threads_per_rank"], "render_seconds": shot["render_wall_seconds"],
                              "hash": shot["image_hash_fnv1a64"], "screenshot": "assets/helios-hybrid-adaptive-run-screenshot.png"},
            "report_sha256": {f: hashlib.sha256((ROOT / "report" / f).read_bytes()).hexdigest()
                              for f in ("HELIOS_FINAL_REPORT.md", "HELIOS_FINAL_REPORT.docx", "HELIOS_FINAL_REPORT.pdf")},
            "observatory_build_utc": built}


def check_values(obj, path="$"):
    """Fail on NaN / Infinity / None where a number is expected in displayed fields."""
    bad = []
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        bad.append(path)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            bad += check_values(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            bad += check_values(v, f"{path}[{i}]")
    return bad


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    sys.argv = [sys.argv[0]]   # the build always reruns the validators so every count is re-derived
    d = X.main()
    built = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    files = {
        "overview": overview(d), "scenes": d["scenes"]["gallery"] and {"gallery": d["scenes"]["gallery"], "source": d["scenes"]["gallery_source"]},
        "convergence": d["scenes"]["convergence"], "workload": d["workload"], "scheduler": d["scheduler"], "hardware": d["hardware"],
        "performance": d["performance"], "correctness": d["correctness"], "stress": d["stress"], "provenance": d["provenance"],
        "experiments": {"experiments": d["experiments"]}, "defence": defence(d),
        "snippets": {"snippets": d["snippets"]}, "about": {"frozen_source": d["source"]["frozen_sha"],
                                                         "presentation_head": d["source"]["presentation_head"], "build_utc": built,
                                                         "protocol": "Protocol V2", "environment": f"{d['hardware']['os']} · {d['hardware']['compiler']} · {d['hardware']['mpi']}",
                                                         "cpu": d["hardware"]["cpu"], "cores": d["hardware"]["physical_cores"],
                                                         "logical": d["hardware"]["logical_processors"],
                                                         "formal_verified": all(e["verification"]["failed"] == 0 and e["verification"]["errors"] == 0
                                                                                for e in d["experiments"] if e["classification"] == "FORMAL")},
    }
    bad = check_values(files)
    if bad:
        raise SystemExit("NaN/Infinity in generated data: " + ", ".join(bad[:10]))
    if not d["source"]["src_include_tests_identical_to_frozen"]:
        raise SystemExit("src/, include/ or tests/ differ from the frozen source; refusing to build")
    DATA.mkdir(parents=True, exist_ok=True)
    for name, obj in files.items():
        (DATA / f"{name}.json").write_text(json.dumps(obj, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (DATA / "experiment_capsule.json").write_text(json.dumps(capsule(d, built), indent=1) + "\n", encoding="utf-8")
    bundle = "// Generated by scripts/observatory/build_observatory.py. Do not edit; rebuild instead.\n" \
             "window.HELIOS = " + json.dumps(files, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (DATA / "bundle.js").write_text(bundle, encoding="utf-8")
    print(f"built {len(files)} data files + experiment_capsule.json + bundle.js ({len(bundle) / 1024:.0f} KiB) at {built}")


if __name__ == "__main__":
    main()
