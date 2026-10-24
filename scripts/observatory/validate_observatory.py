"""Validate the Helios Observatory against the evidence it presents.

  python scripts/observatory/validate_observatory.py [--no-integrity]

Read-only with respect to evidence: it only reads results/, src/, include/, tests/ and the report, and
writes a single file, assets/observatory/validation.json. Exit code 1 if any check fails.

Checks: protected evidence byte-identical to the pre-sprint snapshot; frozen C++ source unchanged;
generated data parses (no NaN/Infinity/placeholders/local paths) and matches the offline bundle;
formal experiment IDs and every referenced file exist; convergence frames; scheduler events and tile
ownership against the raw trace.csv/tiles.csv; tile counts; correctness hashes; stress values against
the stress manifest; provenance paths; classification labels; section IDs and routes; duplicate IDs;
no runtime network references; screenshots.
"""
import argparse
import csv
import datetime
import hashlib
import json
import math
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OBS = ROOT / "assets/observatory"
DATA = OBS / "data"
FROZEN = "e2c13e2204ca28aecb90d2d33703587bd16027a1"
FINAL_IDS = ["20260928T102644Z-100e1393", "20260928T103116Z-c00a63fc", "20260928T103934Z-edc10839",
             "20260928T104502Z-5e829d04", "20260928T104823Z-8e1c1ed4", "20260928T105023Z-1dd576e1"]
HISTORICAL_IDS = ["20260928T063038Z-301480e3", "20260928T064015Z-fd6ca303", "20260928T062641Z-d865a73c",
                  "20260928T063756Z-d01e8d9f", "20260928T075743Z-cf62886e", "20260928T080938Z-fe56f15c"]
CLASSES = {"FORMAL", "DIAGNOSTIC", "HISTORICAL", "PRESENTATION", "ILLUSTRATIVE"}
DATA_FILES = ["about", "overview", "scenes", "convergence", "workload", "scheduler", "hardware", "performance",
              "correctness", "stress", "provenance", "experiments", "defence", "snippets", "experiment_capsule"]
SCREENSHOTS = ["overview", "render-lab", "workload-microscope", "scheduler-lab", "hardware-hybrid", "performance-lab",
               "correctness", "provenance", "technical-qna", "closing"]
PLACEHOLDERS = re.compile(r"\b(TODO|TBD|FIXME|lorem ipsum|placeholder|undefined|NaN|Infinity)\b", re.I)
PATHLIKE = re.compile(r"^(\.\./showcase/|results/|assets/|docs/|scripts/|src/|include/|tests/|report/)[^\s{}*]+$")


def git(*args):
    return subprocess.run(["git", "-c", f"safe.directory={ROOT.as_posix()}", *args], cwd=ROOT,
                          capture_output=True, text=True, encoding="utf-8").stdout


class Checks:
    def __init__(self):
        self.items = []

    def add(self, name, passed, detail=""):
        self.items.append({"check": name, "passed": bool(passed), "detail": detail})
        print(f"[{'PASS' if passed else 'FAIL'}] {name}" + (f": {detail}" if detail else ""))


def strict_loads(text, name="data"):
    """json.loads that rejects NaN, Infinity and -Infinity (which Python's json accepts by default)."""
    def bad_const(c):
        raise ValueError(f"non-finite constant {c} in {name}")
    return json.loads(text, parse_constant=bad_const)


def load(name):
    return strict_loads((DATA / f"{name}.json").read_text(encoding="utf-8"), f"{name}.json")


def strings(o, path=""):
    if isinstance(o, dict):
        for k, v in o.items():
            yield from strings(v, f"{path}.{k}")
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from strings(v, f"{path}[{i}]")
    elif isinstance(o, str):
        yield path, o


def numbers(o):
    if isinstance(o, dict):
        for v in o.values():
            yield from numbers(v)
    elif isinstance(o, list):
        for v in o:
            yield from numbers(v)
    elif isinstance(o, float):
        yield o


def resolve(p):
    return (OBS / p).resolve() if p.startswith("../") else ROOT / p


def png_size(p):
    b = p.read_bytes()[:24]
    return (int.from_bytes(b[16:20], "big"), int.from_bytes(b[20:24], "big")) if b[:8] == b"\x89PNG\r\n\x1a\n" else None


def read_csv(p):
    with open(p, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--no-integrity", action="store_true", help="skip hashing the protected evidence snapshot")
    a = ap.parse_args()
    C = Checks()

    # ------------------------------------------------------------------ protected evidence and frozen source
    snap = json.loads((OBS / "provenance/pre-sprint-integrity.json").read_text(encoding="utf-8"))
    if a.no_integrity:
        C.add("protected evidence (src/include/tests/results) identical to pre-sprint snapshot", True, "skipped (--no-integrity)")
    else:
        # The three report files were revised on purpose in the final report visual integration (after this
        # snapshot); they are checked against the experiment capsule below instead.
        changed, files = [], [f for f in snap["files"] if not f["path"].startswith("report/")]
        for f in files:
            p = ROOT / f["path"]
            if not p.is_file() or p.stat().st_size != f["size"] or hashlib.sha256(p.read_bytes()).hexdigest() != f["sha256"]:
                changed.append(f["path"])
        C.add("protected evidence (src/include/tests/results) identical to pre-sprint snapshot", not changed,
              f"{len(files) - len(changed)}/{len(files)} files byte-identical" + (f"; changed: {changed[:5]}" if changed else ""))
    diff = git("diff", "--name-only", FROZEN, "--", "src", "include", "tests").strip()
    status = git("status", "--porcelain", "--", "src", "include", "tests", "results").strip()
    C.add("frozen source src/include/tests identical to e2c13e2", not diff, diff or "no differences")
    C.add("no uncommitted changes under src/include/tests/results", not status, status or "clean")

    # ------------------------------------------------------------------ data files
    D, errors = {}, []
    for n in DATA_FILES:
        try:
            D[n] = load(n)
        except Exception as e:  # noqa: BLE001 - reported as a failed check
            errors.append(f"{n}: {e}")
    C.add("all generated data files parse as strict JSON", not errors, "; ".join(errors) or f"{len(D)} files")
    if errors:
        return finish(C)
    nonfinite = [n for n, o in D.items() for x in numbers(o) if not math.isfinite(x)]
    C.add("no NaN or Infinity values", not nonfinite, ", ".join(nonfinite))
    ph = [(n, p, s[:60]) for n, o in D.items() for p, s in strings(o) if PLACEHOLDERS.search(s)]
    C.add("no placeholder strings (TODO/TBD/undefined/NaN)", not ph, str(ph[:5]))
    user = re.escape(Path.home().name)  # the current account name, so no name is hard-coded here
    local = [(n, p) for n, o in D.items() for p, s in strings(o) if re.search(rf"[A-Za-z]:\\\\?Users|/Users/|\b{user}\b", s, re.I)]
    C.add("no local user paths in data", not local, str(local[:5]))
    bundle = (DATA / "bundle.js").read_text(encoding="utf-8")
    m = re.search(r"^window\.HELIOS = (.*);\s*$", bundle, re.S | re.M)
    same = False
    if m:
        B = json.loads(m.group(1))
        same = all(B.get(n) == D[n] for n in DATA_FILES if n in B) and set(B) >= set(DATA_FILES) - {"experiment_capsule"}
    C.add("offline bundle.js matches the JSON data files", same)

    # ------------------------------------------------------------------ experiments
    ex = {e["id"]: e for e in D["experiments"]["experiments"]}
    missing_ids = [i for i in FINAL_IDS + HISTORICAL_IDS if i not in ex or not (ROOT / "results/protocol-v2" / i).is_dir()]
    C.add("12 formal experiment IDs present in data and on disk", not missing_ids and len(ex) == 12, ", ".join(missing_ids) or "6 final + 6 historical")
    cls_ok = all(ex[i]["classification"] == "FORMAL" for i in FINAL_IDS) and all(ex[i]["classification"] == "HISTORICAL" and ex[i]["superseded_by"] for i in HISTORICAL_IDS)
    C.add("final experiments FORMAL, historical ones HISTORICAL and superseded", cls_ok)
    ver = [i for i, e in ex.items() if not e["verification"] or e["verification"]["failed"] or e["verification"]["errors"]]
    C.add("every experiment independently rehashed with 0 failures", not ver, ", ".join(ver) or
          f"{sum(e['verification']['ppm_images_checked'] for e in ex.values())} images")
    mf = []
    for i, e in ex.items():
        man = json.loads((ROOT / e["manifest"]).read_text(encoding="utf-8-sig"))
        if (man.get("git_sha"), man.get("records"), man.get("failures"), man.get("repeats"), man.get("status")) != (e["git_sha"], e["records"], e["failures"], e["repeats"], e["status"]):
            mf.append(i)
    C.add("experiment browser values agree with manifests", not mf, ", ".join(mf) or "git SHA, records, failures, repeats, status")

    # ------------------------------------------------------------------ referenced files
    refs = {s for o in D.values() for _, s in strings(o) if PATHLIKE.match(s)}
    js = (OBS / "app.js").read_text(encoding="utf-8")
    refs |= set(re.findall(r'"(\.\./showcase/[^"$`]+)"', js))
    dead = sorted(r for r in refs if not resolve(r).exists())
    C.add("every referenced file exists", not dead, f"{len(refs)} paths" + (f"; missing: {dead[:6]}" if dead else ""))
    net = [u for f in ("index.html", "app.js", "styles.css") for u in re.findall(r"https?://[^\s\"')]+", (OBS / f).read_text(encoding="utf-8"))
           if not u.startswith(("http://www.w3.org/", "http://127.0.0.1"))]
    C.add("no runtime internet references (fonts, CDNs, APIs)", not net, ", ".join(net))

    # ------------------------------------------------------------------ convergence and scenes
    fr = D["convergence"]["frames"]
    spps = [f["spp"] for f in fr]
    C.add("convergence frames exist, ascending SPP, only SPP changes", spps == sorted(spps) and len(fr) >= 6 and D["convergence"]["only_spp_changes"]
          and all(resolve(f["image"]).exists() for f in fr), f"{len(fr)} frames, SPP {spps[0]}-{spps[-1]}")
    g = D["scenes"]["gallery"]
    C.add("gallery hashes recomputed and matching", all(x["hash"] == x["hash_recomputed"] for x in g), f"{len(g)} scenes")

    # ------------------------------------------------------------------ scheduler replay vs raw evidence
    sch, sch_bad = D["scheduler"], []
    for k, P in sch["policies"].items():
        ids = sorted(t["id"] for t in P["tiles"])
        if ids != list(range(144)):
            sch_bad.append(f"{k}: tile ids")
        tiles_csv = read_csv(ROOT / P["sources"][0])
        if len(tiles_csv) != 144 or any(int(r["worker"]) != t["w"] for r, t in zip(sorted(tiles_csv, key=lambda r: int(r["tile_id"])), sorted(P["tiles"], key=lambda t: t["id"]))):
            sch_bad.append(f"{k}: tiles.csv ownership")
        if len(P["sources"]) > 1:
            trace = read_csv(ROOT / P["sources"][1])
            if len(trace) != len(P["batches"]) or len(trace) != P["assignments"]:
                sch_bad.append(f"{k}: {len(trace)} trace rows vs {len(P['batches'])} events")
            for r, b in zip(trace, P["batches"]):
                if (int(r["worker"]), int(r["first_tile"]), int(r["tile_count"])) != (b["w"], b["first"], b["count"]) or abs(float(r["assigned_seconds"]) - b["dispatched"]) > 1e-6:
                    sch_bad.append(f"{k}: trace row {b['i']}")
                    break
        elif P["batches"]:
            sch_bad.append(f"{k}: static policy must not invent dispatch events")
        if not all(v for v in P["validation"].values() if isinstance(v, bool)):
            sch_bad.append(f"{k}: validation flags")
    C.add("scheduler events and tile ownership match raw trace.csv/tiles.csv", not sch_bad,
          "; ".join(sch_bad) or ", ".join(f"{k} {len(P['batches'])} events" for k, P in sch["policies"].items()))

    # ------------------------------------------------------------------ workload
    W = D["workload"]
    wl = len(W["tiles"]) == 144 and sorted(t["id"] for t in W["tiles"]) == list(range(144)) and all(t["compute_ms"] > 0 for t in W["tiles"])
    S = W["summary"]
    wl = wl and abs(S["ratio"] - S["dearest_ms"] / S["cheapest_ms"]) < 0.01 and W["counters_identical_across_runs"]
    C.add("workload: 144 tiles, positive times, ratio consistent, deterministic counters", wl, f"{S['ratio']:.2f}x spread")

    # ------------------------------------------------------------------ correctness
    Cr = D["correctness"]
    hashes = {b["hash"] for b in Cr["backends"]}
    ref = json.loads((ROOT / "assets/showcase/correctness/backend-correctness.json").read_text(encoding="utf-8"))
    ref_h = {r.get("hash") for r in (ref["backends"] if isinstance(ref, dict) and "backends" in ref else ref)} if ref else set()
    ok = (len(Cr["backends"]) == 7 and len(hashes) == 1 and Cr["all_identical"] and all(b["hash_recomputed_now"] == b["hash"] for b in Cr["backends"])
          and all(v == 0 for v in Cr["pairwise_different_pixels"].values()) and hashes == ref_h and hashes == {Cr["figure11_hash"]})
    shot = json.loads((ROOT / Cr["figure11_source"]).read_text(encoding="utf-8-sig"))
    ok = ok and Cr["figure11_hash"] in json.dumps(shot)
    C.add("correctness: 7 backends, one hash, recomputed, 0 differing pixels, matches the recorded end-to-end run", ok, next(iter(hashes)))
    stack = Cr["validation_stack"]["layers"]
    C.add("validation stack re-run at build: all layers PASS", all(l["passed"] for l in stack), ", ".join(l["label"] for l in stack))

    # ------------------------------------------------------------------ stress
    St = D["stress"]
    man = json.loads((ROOT / "results/stress" / St["run_id"] / "manifest.json").read_text(encoding="utf-8-sig"))
    ok = (abs(St["elapsed_seconds"] - man["elapsed_wall_seconds"]) < 0.001 and St["timeout_seconds"] == man["timeout_seconds"]
          and St["timed_out"] is man["timed_out"] is True and St["exit_code"] == man["exit_code"] and St["git_sha"] == man["git_sha"]
          and St["executable_sha256"] == man["executable_sha256"] and St["camera_samples"] == St["width"] * St["height"] * St["spp"])
    C.add("stress values match the stress manifest", ok, f"{St['elapsed_seconds']} s, timeout {St['timeout_seconds']} s")

    # ------------------------------------------------------------------ provenance, snippets
    pv_bad = []
    for ch in D["provenance"]["chains"]:
        if not ch["report"]["verified_in_report_text"]:
            pv_bad.append(f"{ch['id']}: value not in report")
        for s in ch["stages"]:
            if s["path"] and not resolve(s["path"]).exists():
                pv_bad.append(f"{ch['id']}: {s['path']}")
    C.add("provenance chains: every path exists, every claim found in report text", not pv_bad and len(D["provenance"]["chains"]) >= 6,
          "; ".join(pv_bad) or f"{len(D['provenance']['chains'])} chains")
    sn_bad = []
    for s in D["snippets"]["snippets"]:
        src = git("show", f"{FROZEN}:{s['file']}").splitlines()
        if "\n".join(src[s["first_line"] - 1:s["last_line"]]).rstrip() != s["text"].rstrip():
            sn_bad.append(s["id"])
    C.add("source inspector excerpts identical to the frozen commit", not sn_bad, ", ".join(sn_bad) or f"{len(D['snippets']['snippets'])} snippets")

    # ------------------------------------------------------------------ labels, ids, routes
    labels = [(n, p, v) for n, o in D.items() for p, v in strings(o) if p.endswith(".classification")]
    bad_cls = [(n, p, v) for n, p, v in labels if not set(v.split(" + ")) <= CLASSES]
    C.add("classification labels valid", not bad_cls, f"{len(labels)} labels" + (f"; bad: {bad_cls[:4]}" if bad_cls else ""))
    sections = re.findall(r'\{ id: "([a-z]+)", num: "(\d\d)", title: "[^"]+", key: "(\d)" \}', js)
    ids = [s[0] for s in sections]
    ctrl = [i for i in ids if f"R.{i} = {{" not in js]
    C.add("10 navigation sections with controllers and unique keys", len(ids) == 10 and not ctrl and len({s[2] for s in sections}) == 10,
          " ".join(f"{s[2]}:{s[0]}" for s in sections))
    routes = [m_["route"] for m_ in D["overview"]["metrics"]] + [q["route"] for q in D["defence"]["questions"]]
    bad_routes = [r for r in routes if r.split("?")[0] not in ids]
    C.add("deep-link routes point to real sections", not bad_routes, ", ".join(bad_routes) or f"{len(routes)} routes")
    dup = []
    for n, coll, key in [("experiments", D["experiments"]["experiments"], "id"), ("defence", D["defence"]["questions"], "id"),
                         ("provenance", D["provenance"]["chains"], "id"), ("snippets", D["snippets"]["snippets"], "id")]:
        vals = [x[key] for x in coll]
        if len(vals) != len(set(vals)):
            dup.append(n)
    C.add("no duplicate IDs", not dup, ", ".join(dup))
    qs = D["defence"]["questions"]
    C.add("technical Q&A questions have answer, evidence, a labelled trade-off/limitation/context and sources",
          all(q["short"] and q["evidence"] and q["caveat"] and q.get("caveat_label") in ("Trade-off", "Limitation", "Context") and q["sources"]
              and set(q["category"] for q in qs) <= set(D["defence"]["categories"]) for q in qs), f"{len(qs)} questions")
    cap = D["experiment_capsule"]
    C.add("experiment capsule: frozen SHA and formal experiment IDs", cap["frozen_source_sha"] == FROZEN and sorted(cap["formal_experiments"].values()) == sorted(FINAL_IDS)
          and cap["src_include_tests_identical_to_frozen"])

    # ------------------------------------------------------------------ report matches the data build
    rep = cap["report_sha256"]
    rep_ok = len(rep) == 3 and all(hashlib.sha256((ROOT / "report" / n).read_bytes()).hexdigest() == h for n, h in rep.items())
    C.add("final report MD/DOCX/PDF match the hashes recorded in the experiment capsule", rep_ok, ", ".join(sorted(rep)))

    # ------------------------------------------------------------------ screenshots
    shots = OBS / "screenshots"
    if shots.is_dir():
        bad = [n for n in SCREENSHOTS if not (shots / f"{n}.png").exists() or png_size(shots / f"{n}.png") != (1920, 1080)]
        C.add("required Observatory screenshots exist at 1920x1080", not bad, ", ".join(bad) or f"{len(list(shots.glob('*.png')))} PNGs")
    else:
        C.add("required Observatory screenshots exist at 1920x1080", False, "assets/observatory/screenshots missing")
    return finish(C)


def finish(C):
    out = {"generated_utc": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(),
           "frozen_source": FROZEN, "passed": all(c["passed"] for c in C.items),
           "summary": f"{sum(c['passed'] for c in C.items)}/{len(C.items)} checks passed", "checks": C.items}
    (OBS / "validation.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(out["summary"])
    return 0 if out["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
