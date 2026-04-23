import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from analyse_results import bootstrap_median_ci, summarize, worker_imbalance


class AnalysisTests(unittest.TestCase):
    def test_bootstrap_identical_observations(self):
        self.assertEqual(bootstrap_median_ci([2.5] * 7), (2.5, 2.5))
        self.assertEqual(bootstrap_median_ci([2.5] * 6), (None, None))

    def test_idle_coordinator_is_excluded_from_imbalance(self):
        stats = {"workers": [{"tiles": 0, "compute_seconds": 0},
                             {"tiles": 2, "compute_seconds": 2},
                             {"tiles": 2, "compute_seconds": 4}]}
        self.assertAlmostEqual(worker_imbalance(stats), 1 / 3)
        stats["workers"][1]["assigned_work_seconds"] = 4
        stats["workers"][2]["assigned_work_seconds"] = 4
        self.assertEqual(worker_imbalance(stats, "assigned_work_seconds"), 0)

    def test_failed_run_is_counted_not_aggregated(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            (directory / "raw").mkdir()
            (directory / "manifest.json").write_text(json.dumps({"protocol_version": 2,
                "experiment_id": "test", "experiment": "scheduler", "status": "failed", "order_seed": 1}))
            row = {"scene": "uniform", "preset": "small", "backend": "sequential", "ranks": 1,
                   "threads": 1, "coordinator_only": False, "spp": 64, "warmup": False,
                   "compute_slots": 1, "return_code": 124}
            (directory / "raw/failure.run.json").write_text(json.dumps(row))
            summary = summarize(directory)
            self.assertEqual(summary["conditions"][0]["n_failed"], 1)
            self.assertIsNone(summary["conditions"][0]["median_seconds"])

    def test_paired_scheduler_comparisons_use_matching_blocks_and_absolute_effects(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            (directory / "raw").mkdir()
            (directory / "manifest.json").write_text(json.dumps({"protocol_version": 2,
                "experiment_id": "paired", "experiment": "scheduler", "status": "complete", "order_seed": 1}))
            for block in range(7):
                for backend, seconds in (("mpi-static", 4.0 + block),
                                         ("mpi-dynamic", 2.0 + block),
                                         ("hybrid-adaptive", 3.0 + block)):
                    row = {"scene": "uniform", "preset": "medium", "backend": backend, "ranks": 3,
                           "threads": 1, "coordinator_only": backend == "mpi-static", "spp": 192,
                           "warmup": False, "compute_slots": 2, "return_code": 0, "block": block,
                           "stats": {"render_wall_seconds": seconds, "rays": 1,
                                     "workers": [{"id": 0, "tiles": 0, "assignments": 0,
                                                  "compute_seconds": 0, "assigned_work_seconds": 0,
                                                  "stall_seconds": 0,
                                                  "result_wait_seconds": 0, "mpi_send_seconds": 0},
                                                 {"id": 1, "tiles": 1, "assignments": 1,
                                                  "compute_seconds": 1, "assigned_work_seconds": 1,
                                                  "stall_seconds": 0,
                                                  "result_wait_seconds": 0, "mpi_send_seconds": 0}]}}
                    (directory / "raw" / f"{backend}-{block}.run.json").write_text(json.dumps(row))
            paired = summarize(directory)["paired_scheduler_comparisons"]
            self.assertEqual(len(paired), 3)
            by_pair = {(p["candidate"], p["reference"]): p for p in paired}
            self.assertEqual(by_pair[("mpi-dynamic", "mpi-static")]["median_absolute_seconds"], -2.0)
            self.assertEqual(by_pair[("hybrid-adaptive", "mpi-dynamic")]["median_absolute_seconds"], 1.0)
            self.assertEqual(by_pair[("hybrid-adaptive", "mpi-static")]["median_absolute_seconds"], -1.0)


if __name__ == "__main__":
    unittest.main()
