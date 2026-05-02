"""Rebuild twice and compare PE headers and section bytes without altering source."""
import hashlib
import json
import shutil
import struct
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def inspect_pe(path):
    data = path.read_bytes()
    if data[:2] != b"MZ":
        raise ValueError(f"not a PE file: {path}")
    pe = struct.unpack_from("<I", data, 0x3C)[0]
    if data[pe:pe+4] != b"PE\0\0":
        raise ValueError(f"invalid PE signature: {path}")
    count = struct.unpack_from("<H", data, pe+6)[0]
    stamp = struct.unpack_from("<I", data, pe+8)[0]
    optional_size = struct.unpack_from("<H", data, pe+20)[0]
    sections = {}
    offset = pe+24+optional_size
    for i in range(count):
        base = offset+i*40
        name = data[base:base+8].split(b"\0", 1)[0].decode("ascii", errors="replace")
        size = struct.unpack_from("<I", data, base+16)[0]
        pointer = struct.unpack_from("<I", data, base+20)[0]
        sections[name] = {"raw_size": size, "sha256": sha(data[pointer:pointer+size])}
    return {"bytes": len(data), "sha256": sha(data), "pe_timestamp": stamp, "sections": sections}


def main():
    ident = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    out = ROOT / "results/diagnostic/build-v3" / ident
    out.mkdir(parents=True, exist_ok=False)
    source = {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in
              (ROOT / "src/main.cpp", ROOT / "src/core.cpp", ROOT / "include/helios/core.hpp")}
    builds = []
    for number in (1, 2):
        started_utc = datetime.now(timezone.utc).isoformat()
        proc = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ROOT / "scripts/build.ps1"),
                               "-Configuration", "release"], cwd=ROOT, capture_output=True, text=True, timeout=120)
        record = {"build": number, "return_code": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr,
                  "started_utc": started_utc, "ended_utc": datetime.now(timezone.utc).isoformat(), "files": {}}
        if proc.returncode:
            builds.append(record)
            break
        for name in ("helios.exe", "helios_mpi.exe"):
            path = ROOT / "build-release" / name
            saved = out / f"build{number}-{name}"
            shutil.copy2(path, saved)
            record["files"][name] = inspect_pe(saved)
        builds.append(record)
    comparison = {}
    if len(builds) == 2 and all(b["return_code"] == 0 for b in builds):
        for name in ("helios.exe", "helios_mpi.exe"):
            first = builds[0]["files"][name]
            second = builds[1]["files"][name]
            comparison[name] = {"whole_file_equal": first["sha256"] == second["sha256"],
                                "pe_timestamp_equal": first["pe_timestamp"] == second["pe_timestamp"],
                                "section_equality": {section: first["sections"].get(section) == second["sections"].get(section)
                                                     for section in sorted(set(first["sections"]) | set(second["sections"]))}}
    result = {"classification": "diagnostic-not-formal", "id": ident, "source_sha256": source,
              "git_sha": subprocess.run(["git", "-c", f"safe.directory={ROOT.as_posix()}", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip(),
              "builds": builds, "comparison": comparison}
    (out / "manifest.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(out)
    print(json.dumps(comparison, indent=2))
    return 0 if len(builds) == 2 and all(b["return_code"] == 0 for b in builds) else 1


if __name__ == "__main__":
    sys.exit(main())
