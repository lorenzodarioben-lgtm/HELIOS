"""Write host/toolchain details to <dir>/environment.json (Windows; used beside stress evidence).

Supplements run manifests whose own CPU query (Get-CimInstance Win32_Processor) is denied on
this host: CPU name comes from the registry, RAM from GlobalMemoryStatusEx, and physical
cores from the Windows CPU Set table (distinct core indices). Read-only; runs nothing heavy.
"""
import argparse
import json
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from benchmark_v2 import GIT, ROOT, command_output, hardware
from observe_rank_placement import system_cpu_sets


def first_line(command):
    try:
        out = subprocess.run(command, capture_output=True, text=True, timeout=20)
        text = (out.stdout or out.stderr).strip().splitlines()
        return text[0] if text else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    if not args.directory.is_dir():
        parser.error("evidence directory does not exist")
    cpu_sets = system_cpu_sets()
    info = hardware()
    info.update(physical_cores=len({v["core"] for v in cpu_sets.values()}) or None,
                logical_processors_from_cpu_sets=len(cpu_sets) or None,
                smt_pairs=sorted(sorted(v["logical_processor"] for v in cpu_sets.values() if v["core"] == c)
                                 for c in {v["core"] for v in cpu_sets.values()}),
                python=platform.python_version(),
                compiler=first_line(["g++", "--version"]),
                mpi_compiler_wrapper=first_line(["mpicxx", "--version"]),
                mpiexec=first_line(["mpiexec", "-help"]),
                git_head=command_output(GIT + ["-C", str(ROOT), "rev-parse", "HEAD"]),
                captured_utc=datetime.now(timezone.utc).isoformat(),
                note="captured after the run; describes the same host and toolchain")
    out = args.directory / "environment.json"
    out.write_text(json.dumps(info, indent=2) + "\n", encoding="utf-8")
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
