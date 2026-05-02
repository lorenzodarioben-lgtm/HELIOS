"""Record observed affinity masks for documented Microsoft MPI launch modes.

Process masks only, from a PowerShell stand-in rank that never calls MPI_Init; it cannot see the
CPU Set binding Microsoft MPI applies to real ranks. See scripts/observe_rank_placement.py.
"""
import json
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODES = [("default", []), ("no-affinity", ["-affinity_layout", "0"]),
         ("physical-core", ["-affinity_layout", "spr:p"])]


def main():
    ident = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    out = ROOT / "results/diagnostic/hybrid-v3" / f"affinity-probe-{ident}"
    out.mkdir(parents=True, exist_ok=False)
    runs = []
    for name, flags in MODES:
        command = ["mpiexec"] + flags + ["-n", "2", "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
                                        "-File", str(ROOT / "scripts/probe_affinity.ps1")]
        try:
            proc = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=20)
            row = {"mode": name, "command": command, "return_code": proc.returncode,
                   "stdout": proc.stdout, "stderr": proc.stderr, "ranks": []}
            for line in proc.stdout.splitlines():
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(item, dict) and "affinity_mask_decimal" in item:
                    row["ranks"].append(item)
        except (OSError, subprocess.TimeoutExpired) as exc:
            row = {"mode": name, "command": command, "error": str(exc), "ranks": []}
        runs.append(row)
        print(name, "masks", [r["affinity_mask_decimal"] for r in row["ranks"]], flush=True)
    result = {"classification": "diagnostic-not-formal", "id": ident,
              "created_utc": datetime.now(timezone.utc).isoformat(),
              "mpi_help_source": "mpiexec -help2 and -help3, Microsoft MPI 10.1.12498.52",
              "runs": runs}
    (out / "manifest.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(out)
    return 0 if all(r.get("return_code") == 0 and len(r["ranks"]) == 2 for r in runs) else 1


if __name__ == "__main__":
    sys.exit(main())
