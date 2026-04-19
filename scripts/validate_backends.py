"""Bounded exact-image comparison across execution modes."""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--exe", required=True)
    p.add_argument("--mpi-exe")
    p.add_argument("--mpiexec", default="mpiexec")
    p.add_argument("--openmp", action="store_true")
    args = p.parse_args()
    modes = [("sequential", 1, 1)]
    if args.openmp:
        modes += [("openmp", 1, 1), ("openmp", 1, 2), ("openmp", 1, 4)]
    if args.mpi_exe:
        modes += [("mpi-static", 1, 1), ("mpi-static", 2, 1),
                  ("mpi-dynamic", 2, 1), ("mpi-dynamic", 4, 1)]
        if args.openmp:
            modes += [("hybrid-static", 2, 2), ("hybrid-dynamic", 2, 2),
                      ("hybrid-adaptive", 2, 2)]
    with tempfile.TemporaryDirectory(prefix="helios-validation-") as temp:
        directory = Path(temp)
        reference = None
        reference_bytes = None
        for backend, ranks, threads in modes:
            name = f"{backend}-r{ranks}-t{threads}"
            command = ([args.mpiexec, "-n", str(ranks), args.mpi_exe]
                       if backend.startswith(("mpi-", "hybrid-")) else [args.exe])
            command += ["render", "--backend", backend, "--scene", "imbalanced",
                        "--width", "71", "--height", "43", "--spp", "3",
                        "--tile", "11", "--seed", "42", "--threads", str(threads),
                        "--output", str(directory / f"{name}.ppm"),
                        "--stats-json", str(directory / f"{name}.json")]
            result = subprocess.run(command, capture_output=True, text=True, timeout=20)
            if result.returncode:
                raise RuntimeError(f"{name} failed: {result.stderr}")
            stats = json.loads((directory / f"{name}.json").read_text())
            fingerprint = stats["image_hash_fnv1a64"]
            image_bytes = (directory / f"{name}.ppm").read_bytes()
            if reference is None:
                reference = fingerprint
                reference_bytes = image_bytes
            elif fingerprint != reference or image_bytes != reference_bytes:
                raise RuntimeError(f"{name} image differs from sequential")
            if stats["tiles"] != 28 or stats["pixels"] != 71 * 43:
                raise RuntimeError(f"{name} incomplete work coverage")
            print(name, fingerprint)
        if args.mpi_exe:
            # One tile with more ranks than work items exercises immediate stop messages.
            tiny_reference = None
            tiny_reference_bytes = None
            for backend, ranks, threads in [("sequential", 1, 1), ("mpi-static", 4, 1),
                                            ("mpi-dynamic", 4, 1)] + (
                                                [("hybrid-adaptive", 4, 2)] if args.openmp else []):
                name = f"tiny-{backend}"
                command = ([args.mpiexec, "-n", str(ranks), args.mpi_exe]
                           if backend != "sequential" else [args.exe])
                command += ["render", "--backend", backend, "--width", "8", "--height", "8",
                            "--tile", "8", "--spp", "2", "--threads", str(threads),
                            "--output", str(directory / f"{name}.ppm"),
                            "--stats-json", str(directory / f"{name}.json")]
                result = subprocess.run(command, capture_output=True, text=True, timeout=20)
                if result.returncode:
                    raise RuntimeError(f"{name} failed: {result.stderr}")
                stats = json.loads((directory / f"{name}.json").read_text())
                if stats["tiles"] != 1 or stats["pixels"] != 64:
                    raise RuntimeError(f"{name} incomplete work coverage")
                fingerprint = stats["image_hash_fnv1a64"]
                image_bytes = (directory / f"{name}.ppm").read_bytes()
                if tiny_reference is None:
                    tiny_reference = fingerprint
                    tiny_reference_bytes = image_bytes
                elif fingerprint != tiny_reference or image_bytes != tiny_reference_bytes:
                    raise RuntimeError(f"{name} image differs from sequential")
                print(name, fingerprint)
            if args.openmp:
                name = "tiny-hybrid-adaptive-stalled"
                command = [args.mpiexec, "-n", "3", args.mpi_exe, "render", "--backend", "hybrid-adaptive",
                           "--threads", "2", "--width", "8", "--height", "8", "--tile", "8",
                           "--spp", "2", "--slow-rank", "1", "--slow-us", "1",
                           "--output", str(directory / f"{name}.ppm"),
                           "--stats-json", str(directory / f"{name}.json")]
                result = subprocess.run(command, capture_output=True, text=True, timeout=20)
                if result.returncode:
                    raise RuntimeError(f"{name} failed: {result.stderr}")
                stats = json.loads((directory / f"{name}.json").read_text())
                if (directory / f"{name}.ppm").read_bytes() != tiny_reference_bytes:
                    raise RuntimeError(f"{name} image differs from sequential")
                if stats["slow_us_per_tile"] != 1 or stats["workers"][1]["stall_seconds"] <= 0:
                    raise RuntimeError(f"{name} stall telemetry missing")
                print(name, stats["image_hash_fnv1a64"])
    print(f"Validated {len(modes)} backend configurations")


if __name__ == "__main__":
    main()
