"""Tests for the Helios Observatory tooling and generated data (read-only; nothing is rebuilt or rerun).

  python -m unittest discover -s scripts/observatory -p "test_*.py" -v
"""
import csv
import json
import re
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import validate_observatory as V  # noqa: E402

ROOT = V.ROOT
DATA = V.DATA


def data(name):
    return V.load(name)


class StrictJson(unittest.TestCase):
    def test_rejects_non_finite(self):
        for bad in ('{"x": NaN}', '{"x": Infinity}', '{"x": -Infinity}'):
            with self.assertRaises(ValueError):
                V.strict_loads(bad)

    def test_accepts_finite(self):
        self.assertEqual(V.strict_loads('{"x": 1.5, "y": [0, -2]}'), {"x": 1.5, "y": [0, -2]})

    def test_every_data_file_is_strict_json(self):
        for n in V.DATA_FILES:
            with self.subTest(n):
                self.assertIsInstance(data(n), dict)


class Helpers(unittest.TestCase):
    def test_png_size_reads_ihdr(self):
        def chunk(t, b):
            return len(b).to_bytes(4, "big") + t + b + zlib.crc32(t + b).to_bytes(4, "big")
        png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", (1920).to_bytes(4, "big") + (1080).to_bytes(4, "big") + bytes([8, 2, 0, 0, 0]))
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x.png"
            p.write_bytes(png + chunk(b"IEND", b""))
            self.assertEqual(V.png_size(p), (1920, 1080))
            p.write_bytes(b"not a png at all, just text......")
            self.assertIsNone(V.png_size(p))

    def test_pathlike_pattern(self):
        self.assertTrue(V.PATHLIKE.match("results/protocol-v2/x/manifest.json"))
        self.assertTrue(V.PATHLIKE.match("../showcase/gallery/reflective-hero.png"))
        self.assertFalse(V.PATHLIKE.match("results/protocol-v2/x/raw/run-b{0..6}.tiles.csv"))
        self.assertFalse(V.PATHLIKE.match("report Section 7.2"))

    def test_strings_walks_nested_values(self):
        got = dict(V.strings({"a": ["x", {"b": "y"}], "c": 3}))
        self.assertEqual(got, {".a[0]": "x", ".a[1].b": "y"})

    def test_placeholder_pattern(self):
        for s in ("TODO later", "value is undefined", "NaN ms"):
            self.assertTrue(V.PLACEHOLDERS.search(s), s)
        self.assertFalse(V.PLACEHOLDERS.search("Tiles not yet assigned"))


class GeneratedData(unittest.TestCase):
    def test_required_fields(self):
        required = {
            "about": ["frozen_source", "presentation_head", "build_utc", "protocol", "environment"],
            "overview": ["title", "metrics", "hero", "strong_experiment"],
            "workload": ["tiles", "summary", "partitions", "ownership"],
            "scheduler": ["experiment", "policies", "adaptive_code"],
            "correctness": ["backends", "all_identical", "pairwise_different_pixels", "validation_stack"],
            "stress": ["run_id", "elapsed_seconds", "timeout_seconds", "timed_out", "command", "renderer_arguments"],
            "provenance": ["chains"],
            "defence": ["questions", "categories"],
            "experiment_capsule": ["frozen_source_sha", "formal_experiments", "binaries"],
        }
        for n, keys in required.items():
            d = data(n)
            for k in keys:
                with self.subTest(file=n, key=k):
                    self.assertIn(k, d)

    def test_tile_counts(self):
        self.assertEqual(len(data("workload")["tiles"]), 144)
        for k, p in data("scheduler")["policies"].items():
            with self.subTest(k):
                self.assertEqual(sorted(t["id"] for t in p["tiles"]), list(range(144)))

    def test_scheduler_events_come_from_recorded_traces(self):
        pol = data("scheduler")["policies"]
        self.assertEqual(pol["static"]["batches"], [], "static has no trace: no dispatch events may be invented")
        self.assertIn("RECONSTRUCTED", pol["static"]["provenance"])
        for k in ("dynamic", "adaptive"):
            p = pol[k]
            with open(ROOT / p["sources"][1], newline="", encoding="utf-8") as f:
                rows = list(csv.DictReader(f))
            with self.subTest(k):
                self.assertEqual(len(rows), len(p["batches"]))
                self.assertEqual([(int(r["worker"]), int(r["first_tile"]), int(r["tile_count"])) for r in rows],
                                 [(b["w"], b["first"], b["count"]) for b in p["batches"]])
                self.assertEqual(sum(b["count"] for b in p["batches"]), 144)

    def test_correctness_hashes(self):
        c = data("correctness")
        self.assertEqual(len(c["backends"]), 7)
        self.assertEqual({b["hash"] for b in c["backends"]}, {c["figure11_hash"]})
        self.assertTrue(all(b["hash_recomputed_now"] == b["hash"] for b in c["backends"]))
        self.assertTrue(all(v == 0 for v in c["pairwise_different_pixels"].values()))

    def test_stress_matches_manifest(self):
        s = data("stress")
        m = json.loads((ROOT / "results/stress" / s["run_id"] / "manifest.json").read_text(encoding="utf-8-sig"))
        self.assertAlmostEqual(s["elapsed_seconds"], m["elapsed_wall_seconds"], places=3)
        self.assertEqual((s["timeout_seconds"], s["timed_out"], s["exit_code"]), (m["timeout_seconds"], m["timed_out"], m["exit_code"]))
        self.assertNotIn("Users", s["renderer_arguments"])

    def test_provenance_paths_exist(self):
        for ch in data("provenance")["chains"]:
            for st in ch["stages"]:
                if st["path"]:
                    with self.subTest(chain=ch["id"], path=st["path"]):
                        self.assertTrue(V.resolve(st["path"]).exists())

    def test_classification_labels(self):
        for n in V.DATA_FILES:
            for p, v in V.strings(data(n)):
                if p.endswith(".classification"):
                    with self.subTest(file=n, path=p):
                        self.assertLessEqual(set(v.split(" + ")), V.CLASSES)

    def test_no_missing_assets(self):
        refs = {s for n in V.DATA_FILES for _, s in V.strings(data(n)) if V.PATHLIKE.match(s)}
        missing = sorted(r for r in refs if not V.resolve(r).exists())
        self.assertEqual(missing, [])

    def test_no_duplicate_ids(self):
        for n, coll in [("experiments", data("experiments")["experiments"]), ("defence", data("defence")["questions"]),
                        ("provenance", data("provenance")["chains"]), ("snippets", data("snippets")["snippets"])]:
            ids = [x["id"] for x in coll]
            with self.subTest(n):
                self.assertEqual(len(ids), len(set(ids)))

    def test_no_non_finite_numbers(self):
        for n in V.DATA_FILES:
            with self.subTest(n):
                self.assertTrue(all(abs(x) < float("inf") and x == x for x in V.numbers(data(n))))


class Application(unittest.TestCase):
    js = (V.OBS / "app.js").read_text(encoding="utf-8")

    def test_section_ids_and_keys(self):
        sec = re.findall(r'\{ id: "([a-z]+)", num: "(\d\d)", title: "[^"]+", key: "(\d)" \}', self.js)
        self.assertEqual([s[0] for s in sec], ["overview", "render", "workload", "scheduler", "hardware", "performance",
                                               "correctness", "stress", "provenance", "defence"])
        self.assertEqual([s[2] for s in sec], list("1234567890"))
        for s in sec:
            self.assertIn(f"R.{s[0]} = {{", self.js)

    def test_offline_only(self):
        for f in ("index.html", "app.js", "styles.css"):
            text = (V.OBS / f).read_text(encoding="utf-8")
            urls = [u for u in re.findall(r"https?://[^\s\"')]+", text) if not u.startswith("http://www.w3.org/")]
            with self.subTest(f):
                self.assertEqual(urls, [])
                self.assertNotRegex(text, r"@import|fonts\.googleapis|cdn\.|fetch\(")

    def test_bundle_is_loaded_before_app(self):
        html = (V.OBS / "index.html").read_text(encoding="utf-8")
        self.assertLess(html.index("data/bundle.js"), html.index("app.js"))


class PublicExperience(unittest.TestCase):
    """The public wording, chrome and About drawer contract of the final public pass."""
    html = (V.OBS / "index.html").read_text(encoding="utf-8")
    js = (V.OBS / "app.js").read_text(encoding="utf-8")
    css = (V.OBS / "styles.css").read_text(encoding="utf-8")

    def test_identity(self):
        self.assertEqual(data("overview")["subtitle"], "Adaptive Hybrid Distributed Rendering Engine")
        self.assertIn("ray-tracing", data("overview")["description"])
        self.assertIn("Monte Carlo light transport", data("overview")["description"])
        for text in (self.html, json.dumps(data("overview")), json.dumps(data("experiment_capsule"))):
            self.assertNotIn("Path Tracing Engine", text)
            self.assertNotRegex(text, r"(?i)path tracer")

    def test_public_names(self):
        self.assertIn('title: "Technical Q&A"', self.js)
        for gone in ("Defence Mode", "marker might ask", "Task requirements", "D.tasksheet"):
            self.assertNotIn(gone, self.js)
        self.assertIn(">Guided Tour<", self.html)
        self.assertNotIn("btn-record", self.html)       # recording mode stays, as ?mode=recording only
        self.assertIn('get("mode") === "recording"', self.js)
        self.assertFalse((DATA / "tasksheet.json").exists())

    def test_about_drawer_contract(self):
        self.assertIn('id="about-scrim"', self.html)
        self.assertIn('aria-controls="about"', self.html)
        for call in ("closeAbout(false);\n    presenting", "const changed = current !== id;\n    closeAbout(false);"):
            self.assertIn(call, self.js)
        self.assertIn(".drawer:not(.open) { pointer-events: none; }", self.css)

    def test_hero_timing(self):
        self.assertIn("}, 4600);", self.js)
        self.assertIn("transition: opacity 0.9s ease", self.css)

    def test_technical_qna_shape(self):
        qa = data("defence")
        self.assertEqual(qa["categories"], ["Architecture", "Parallelism", "Scheduling", "Performance", "Correctness", "Methodology", "Limitations"])
        for q in qa["questions"]:
            with self.subTest(q=q["id"]):
                self.assertIn(q["caveat_label"], ("Trade-off", "Limitation", "Context"))
                self.assertIn(q["category"], qa["categories"])
                self.assertNotRegex(q["question"] + q["short"], r"(?i)marker|defen[cs]e|interview")


if __name__ == "__main__":
    unittest.main()
