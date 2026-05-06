"""Plot the diagnostic optimisation A/B (pre-fix, counter fix only, both fixes) as a zero-baseline SVG."""
import argparse
import json
from pathlib import Path

from analyse_results import bootstrap_median_ci
from make_report_assets import ROOT, chart

GROUPS = [("sequential", "Sequential"), ("openmp-4", "OpenMP 4"), ("mpi-static-4", "MPI static 4"),
          ("hybrid-static-1x4", "Hybrid 1×4"), ("hybrid-static-2x2", "Hybrid 2×2")]
BUILDS = [("prefix", "pre-fix 6270d44", "#68788b"), ("counter-only", "counter fix dca8628", "#507fb0"),
          ("fixed", "both fixes e2c13e2", "#288e83")]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("experiment", nargs="?",
                        default=ROOT / "results/diagnostic/counter-fix/20260928T101701Z-0de80589")
    parser.add_argument("--out", default=ROOT / "report/assets/optimisation-ab/optimisation-ab.svg")
    args = parser.parse_args()
    summary = json.loads((Path(args.experiment) / "summary.json").read_text(encoding="utf-8"))
    rows = []
    for key, name in GROUPS:
        for build, build_name, color in BUILDS:
            group = summary["groups"][key][build]
            ci = bootstrap_median_ci(group["seconds"])
            rows.append((f"{name} · {build_name}", group["median_seconds"], color, " s", ci))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    chart(rows, "Diagnostic A/B 20260928T101701Z-0de80589: median render time, medium imbalanced (7 blocks)", out)
    print(out)


if __name__ == "__main__":
    main()
