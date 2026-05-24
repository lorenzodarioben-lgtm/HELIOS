"""Shared helpers for the presentation-only visual showcase.

Nothing here touches src/, include/, tests/ or formal evidence. Renders use the frozen
Release binaries in build-release/ and write only under assets/showcase/ (images) and
assets/showcase/_work/ (scratch PPM/JSON, git-ignored).
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHOWCASE = ROOT / "assets" / "showcase"
WORK = SHOWCASE / "_work"
HELIOS = ROOT / "build-release" / "helios.exe"
HELIOS_MPI = ROOT / "build-release" / "helios_mpi.exe"
FROZEN_SOURCE = "e2c13e2204ca28aecb90d2d33703587bd16027a1"
FROZEN_BINARIES = {"helios.exe": "956685fbc2b7b314d67f59332a37f46d7376218f01b394e5434e61b835203ef3",
                   "helios_mpi.exe": "0313fe16a502"}  # prefix recorded in the report
PRESENTATION_NOTE = "Presentation render, not formal benchmark evidence."

sys.path.insert(0, str(ROOT / "scripts"))
from verify_experiment import ppm_hash  # noqa: E402  (independent FNV-1a over pixel bytes)

RENDER_LINE = re.compile(r"Rendered (\d+)x(\d+) scene=(\S+) backend=(\S+) ranks=(\d+) threads=(\d+) "
                         r"time=([\d.]+) s hash=([0-9a-f]{16})")


def sha256(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def git_head() -> str:
    return subprocess.run(["git", "-c", f"safe.directory={ROOT.as_posix()}", "rev-parse", "HEAD"],
                          cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


def check_binaries():
    """Refuse to run anything but the frozen Release build."""
    got = sha256(HELIOS)
    if got != FROZEN_BINARIES["helios.exe"]:
        raise SystemExit(f"helios.exe is not the frozen build ({got[:12]})")
    if not sha256(HELIOS_MPI).startswith(FROZEN_BINARIES["helios_mpi.exe"]):
        raise SystemExit("helios_mpi.exe is not the frozen build")


def run_render(args, mpi_ranks=None):
    """Run one render with the frozen binary. Returns the parsed completion line and the exact command."""
    exe = HELIOS_MPI if mpi_ranks else HELIOS
    prefix = ["mpiexec", "-n", str(mpi_ranks)] if mpi_ranks else []
    run_cmd = prefix + [str(exe), "render"] + args                        # absolute path for Windows
    cmd = prefix + ["./" + exe.relative_to(ROOT).as_posix(), "render"] + args  # recorded, repo-relative
    proc = subprocess.run(run_cmd, cwd=ROOT, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"render failed: {' '.join(cmd)}\n{proc.stderr}")
    m = RENDER_LINE.search(proc.stdout)
    if not m:
        raise RuntimeError("no completion line: " + proc.stdout)
    w, h, scene, backend, ranks, threads, seconds, digest = m.groups()
    return {"width": int(w), "height": int(h), "scene": scene, "backend": backend, "ranks": int(ranks),
            "threads": int(threads), "render_seconds": float(seconds), "hash_fnv1a64": digest,
            "command": " ".join(c.replace("\\", "/") for c in cmd), "stdout": proc.stdout.strip()}


def read_ppm(path: Path):
    """Return (width, height, raw RGB bytes) of a Helios P6 PPM."""
    data = Path(path).read_bytes()
    magic, dims, maxval, pixels = data.split(b"\n", 3)
    if magic != b"P6" or maxval != b"255":
        raise ValueError("expected Helios P6 PPM")
    width, height = map(int, dims.split())
    return width, height, pixels


def ppm_to_image(path: Path):
    from PIL import Image
    w, h, pixels = read_ppm(path)
    return Image.frombytes("RGB", (w, h), pixels)


def verify_hash(ppm: Path, expected: str) -> str:
    w, h, _ = read_ppm(ppm)
    got = ppm_hash(Path(ppm), w, h)
    if int(got, 16) != int(expected, 16):
        raise RuntimeError(f"hash mismatch for {ppm}: renderer {expected}, recomputed {got}")
    return format(int(got, 16), "016x")


def write_json(path: Path, obj):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")


def rel(path: Path) -> str:
    return Path(path).resolve().relative_to(ROOT).as_posix()
