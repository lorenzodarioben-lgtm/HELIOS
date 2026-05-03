"""Observe applied CPU binding and utilisation of live helios_mpi ranks (Windows, diagnostic only).

Replaces the PowerShell thread readout in probe_affinity.ps1, which cannot work because
.NET ProcessThread.ProcessorAffinity is write-only. This observer reads the rank processes
themselves (after MPI_Init, unlike a PowerShell stand-in) through Win32:
  process mask   GetProcessAffinityMask        process CPU sets  GetProcessDefaultCpuSets
  thread mask    GetThreadGroupAffinity        thread CPU sets   GetThreadSelectedCpuSets
  ideal CPU      GetThreadIdealProcessorEx     thread CPU time   GetThreadTimes
  per-CPU busy   NtQuerySystemInformation(SystemProcessorPerformanceInformation)
A positive control pins a child process/thread to known masks first; if the observer cannot
read those back, no binding conclusion is drawn. Masks are *allowed* CPUs; Windows does not
expose which CPU a thread ran on, so per-CPU busy time is the only (indirect) placement signal.
Timings from observed runs are perturbed by sampling and are not benchmark evidence.
"""
import argparse
import ctypes
import json
import os
import subprocess
import sys
import time
import uuid
from ctypes import wintypes
from datetime import datetime, timezone

from benchmark_v2 import ROOT, digest, hardware, write_json

MODES = [
    ("hybrid-static-2x2", "hybrid-static", 2, 2, []),
    ("hybrid-static-2x2-noaffinity", "hybrid-static", 2, 2, ["-affinity_layout", "0"]),
    ("hybrid-static-2x2-physicalcore", "hybrid-static", 2, 2, ["-affinity_layout", "spr:p"]),
    ("mpi-static-4", "mpi-static", 4, 1, []),
    ("hybrid-dynamic-3x2", "hybrid-dynamic", 3, 2, []),
]
CONTROL_PROCESS_MASK, CONTROL_THREAD_MASK = 0x3C, 0x20

k32 = ctypes.WinDLL("kernel32", use_last_error=True)
ntdll = ctypes.WinDLL("ntdll")
HANDLE = ctypes.c_void_p


class ProcessEntry(ctypes.Structure):
    _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD), ("pid", wintypes.DWORD),
                ("heap", ctypes.c_size_t), ("module", wintypes.DWORD), ("threads", wintypes.DWORD),
                ("parent", wintypes.DWORD), ("priority", ctypes.c_long), ("flags", wintypes.DWORD),
                ("exe", ctypes.c_wchar * 260)]


class ThreadEntry(ctypes.Structure):
    _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD), ("tid", wintypes.DWORD),
                ("owner", wintypes.DWORD), ("base_priority", ctypes.c_long), ("delta_priority", ctypes.c_long),
                ("flags", wintypes.DWORD)]


class GroupAffinity(ctypes.Structure):
    _fields_ = [("mask", ctypes.c_size_t), ("group", wintypes.WORD), ("reserved", wintypes.WORD * 3)]


class ProcessorNumber(ctypes.Structure):
    _fields_ = [("group", wintypes.WORD), ("number", ctypes.c_ubyte), ("reserved", ctypes.c_ubyte)]


class CpuPerformance(ctypes.Structure):
    _fields_ = [("idle", ctypes.c_longlong), ("kernel", ctypes.c_longlong), ("user", ctypes.c_longlong),
                ("dpc", ctypes.c_longlong), ("interrupt", ctypes.c_longlong), ("interrupts", wintypes.ULONG)]


for name, args, res in [
        ("CreateToolhelp32Snapshot", [wintypes.DWORD, wintypes.DWORD], HANDLE),
        ("Process32FirstW", [HANDLE, ctypes.POINTER(ProcessEntry)], wintypes.BOOL),
        ("Process32NextW", [HANDLE, ctypes.POINTER(ProcessEntry)], wintypes.BOOL),
        ("Thread32First", [HANDLE, ctypes.POINTER(ThreadEntry)], wintypes.BOOL),
        ("Thread32Next", [HANDLE, ctypes.POINTER(ThreadEntry)], wintypes.BOOL),
        ("OpenProcess", [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD], HANDLE),
        ("OpenThread", [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD], HANDLE),
        ("CloseHandle", [HANDLE], wintypes.BOOL),
        ("GetProcessAffinityMask", [HANDLE, ctypes.POINTER(ctypes.c_size_t), ctypes.POINTER(ctypes.c_size_t)], wintypes.BOOL),
        ("GetProcessDefaultCpuSets", [HANDLE, ctypes.POINTER(wintypes.ULONG), wintypes.ULONG, ctypes.POINTER(wintypes.ULONG)], wintypes.BOOL),
        ("GetThreadGroupAffinity", [HANDLE, ctypes.POINTER(GroupAffinity)], wintypes.BOOL),
        ("GetThreadSelectedCpuSets", [HANDLE, ctypes.POINTER(wintypes.ULONG), wintypes.ULONG, ctypes.POINTER(wintypes.ULONG)], wintypes.BOOL),
        ("GetThreadIdealProcessorEx", [HANDLE, ctypes.POINTER(ProcessorNumber)], wintypes.BOOL),
        ("GetThreadTimes", [HANDLE] + [ctypes.POINTER(wintypes.FILETIME)] * 4, wintypes.BOOL),
        ("GetSystemCpuSetInformation", [ctypes.c_void_p, wintypes.ULONG, ctypes.POINTER(wintypes.ULONG), HANDLE, wintypes.ULONG], wintypes.BOOL)]:
    function = getattr(k32, name)
    function.argtypes, function.restype = args, res
ntdll.NtQuerySystemInformation.argtypes = [ctypes.c_ulong, ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong)]
ntdll.NtQuerySystemInformation.restype = ctypes.c_long
INVALID_HANDLE = ctypes.c_void_p(-1).value
PROCESS_QUERY, THREAD_QUERY = 0x0400 | 0x1000, 0x0040 | 0x0800


def cpu_times(count):
    table = (CpuPerformance * count)()
    if ntdll.NtQuerySystemInformation(8, table, ctypes.sizeof(table), None) != 0:
        return None
    return [(c.idle, c.kernel + c.user) for c in table]  # kernel time includes idle time


def cpu_set_ids(query, handle):
    required = wintypes.ULONG(0)
    query(handle, None, 0, ctypes.byref(required))  # fails with ERROR_INSUFFICIENT_BUFFER when sets exist
    if not required.value:
        return []
    ids = (wintypes.ULONG * required.value)()
    return list(ids) if query(handle, ids, required.value, ctypes.byref(required)) else []


def system_cpu_sets():
    """Map CPU Set id -> logical processor and core index (SYSTEM_CPU_SET_INFORMATION)."""
    required = wintypes.ULONG(0)
    k32.GetSystemCpuSetInformation(None, 0, ctypes.byref(required), None, 0)
    buffer = ctypes.create_string_buffer(required.value)
    if not k32.GetSystemCpuSetInformation(buffer, required.value, ctypes.byref(required), None, 0):
        return {}
    raw, offset, table = buffer.raw, 0, {}
    while offset + 20 <= required.value:
        size = int.from_bytes(raw[offset:offset + 4], "little")
        ident = int.from_bytes(raw[offset + 8:offset + 12], "little")
        table[ident] = {"logical_processor": raw[offset + 14], "core": raw[offset + 15]}
        offset += size or 32
    return table


def filetime(value):
    return ((value.dwHighDateTime << 32) | value.dwLowDateTime) / 1e7


def read_thread(tid):
    handle = k32.OpenThread(THREAD_QUERY, False, tid)
    if not handle:
        return {"tid": tid, "error": ctypes.get_last_error()}
    try:
        row = {"tid": tid}
        affinity = GroupAffinity()
        row["mask"] = affinity.mask if k32.GetThreadGroupAffinity(handle, ctypes.byref(affinity)) else None
        row["group"] = affinity.group
        row["cpu_sets"] = cpu_set_ids(k32.GetThreadSelectedCpuSets, handle)
        ideal = ProcessorNumber()
        row["ideal"] = ideal.number if k32.GetThreadIdealProcessorEx(handle, ctypes.byref(ideal)) else None
        times = [wintypes.FILETIME() for _ in range(4)]
        if k32.GetThreadTimes(handle, *[ctypes.byref(t) for t in times]):
            row["cpu_seconds"] = filetime(times[2]) + filetime(times[3])
        return row
    finally:
        k32.CloseHandle(handle)


def read_process(pid):
    handle = k32.OpenProcess(PROCESS_QUERY, False, pid)
    if not handle:
        return {"pid": pid, "error": ctypes.get_last_error()}
    try:
        mask, system = ctypes.c_size_t(), ctypes.c_size_t()
        ok = k32.GetProcessAffinityMask(handle, ctypes.byref(mask), ctypes.byref(system))
        return {"pid": pid, "mask": mask.value if ok else None, "system_mask": system.value if ok else None,
                "default_cpu_sets": cpu_set_ids(k32.GetProcessDefaultCpuSets, handle)}
    finally:
        k32.CloseHandle(handle)


def snapshot(names=None, pids=None):
    """Return {pid: {exe, parent, threads:[tid]}} for matching processes."""
    snap = k32.CreateToolhelp32Snapshot(0x2 | 0x4, 0)
    if snap in (None, INVALID_HANDLE):
        return {}
    found = {}
    try:
        entry = ProcessEntry()
        entry.dwSize = ctypes.sizeof(ProcessEntry)
        more = k32.Process32FirstW(snap, ctypes.byref(entry))
        while more:
            if (names and entry.exe.lower() in names) or (pids and entry.pid in pids):
                found[entry.pid] = {"exe": entry.exe, "parent": entry.parent, "threads": []}
            more = k32.Process32NextW(snap, ctypes.byref(entry))
        thread = ThreadEntry()
        thread.dwSize = ctypes.sizeof(ThreadEntry)
        more = k32.Thread32First(snap, ctypes.byref(thread))
        while more:
            if thread.owner in found:
                found[thread.owner]["threads"].append(thread.tid)
            more = k32.Thread32Next(snap, ctypes.byref(thread))
    finally:
        k32.CloseHandle(snap)
    return found


def sample(names=None, pids=None, exclude=()):
    rows = []
    for pid, info in snapshot(names, pids).items():
        if pid in exclude:
            continue
        row = read_process(pid)
        row.update(exe=info["exe"], parent=info["parent"], threads=[read_thread(t) for t in info["threads"]])
        rows.append(row)
    return rows


def observe(command, names, interval, timeout, logical, pids=None):
    before = set(snapshot(names)) if names else set()
    samples, start_cpu = [], cpu_times(logical)
    started = time.monotonic()
    process = subprocess.Popen(command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                               creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
    watch = pids(process) if pids else None
    timed_out = False
    while process.poll() is None:
        if time.monotonic() - started > timeout:
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, check=False)
            timed_out = True
            break
        samples.append({"t": time.monotonic() - started, "processes": sample(names, watch, before)})
        time.sleep(interval)
    stdout, stderr = process.communicate(timeout=30)
    end_cpu = cpu_times(logical)
    busy = None
    if start_cpu and end_cpu:
        busy = [round(1 - (e[0] - s[0]) / max(1, e[1] - s[1]), 4) for s, e in zip(start_cpu, end_cpu)]
    return {"command": command, "return_code": 124 if timed_out else process.returncode,
            "wall_seconds": time.monotonic() - started, "stdout": stdout, "stderr": stderr,
            "per_logical_cpu_busy_fraction": busy, "samples": samples}


def summarise(result, active_threshold=0.5):
    """Collapse samples into per-process masks, CPU time and concurrently active threads."""
    processes, last, active_counts = {}, {}, []
    previous_t = None
    for s in result["samples"]:
        active = 0
        for p in s["processes"]:
            entry = processes.setdefault(p["pid"], {"exe": p.get("exe"), "process_masks": set(), "thread_masks": set(),
                                                    "cpu_sets": set(), "thread_cpu_sets": set(), "ideal": set(),
                                                    "thread_cpu_seconds": {}})
            entry["process_masks"].add(p.get("mask"))
            entry["cpu_sets"].add(tuple(p.get("default_cpu_sets") or ()))
            for t in p["threads"]:
                entry["thread_masks"].add(t.get("mask"))
                entry["thread_cpu_sets"].add(tuple(t.get("cpu_sets") or ()))
                entry["ideal"].add(t.get("ideal"))
                if t.get("cpu_seconds") is None:
                    continue
                entry["thread_cpu_seconds"][t["tid"]] = t["cpu_seconds"]
                key = (p["pid"], t["tid"])
                if previous_t is not None and key in last and s["t"] > previous_t:
                    if (t["cpu_seconds"] - last[key]) / (s["t"] - previous_t) >= active_threshold:
                        active += 1
                last[key] = t["cpu_seconds"]
        if previous_t is not None:
            active_counts.append(active)
        previous_t = s["t"]
    out = {}
    for pid, e in processes.items():
        cpu = sorted(e["thread_cpu_seconds"].values(), reverse=True)
        out[str(pid)] = {"exe": e["exe"], "process_masks": sorted(m for m in e["process_masks"] if m is not None),
                         "thread_masks": sorted(m for m in e["thread_masks"] if m is not None),
                         "process_default_cpu_sets": sorted(list(c) for c in e["cpu_sets"]),
                         "thread_selected_cpu_sets": sorted(list(c) for c in e["thread_cpu_sets"]),
                         "ideal_processors": sorted(i for i in e["ideal"] if i is not None),
                         "threads_seen": len(cpu), "threads_over_0p1_cpu_s": sum(c > 0.1 for c in cpu),
                         "top_thread_cpu_seconds": [round(c, 3) for c in cpu[:4]],
                         "process_cpu_seconds": round(sum(cpu), 3)}
    counts = sorted(active_counts)
    return {"processes": out, "samples": len(result["samples"]),
            "active_threads_max": counts[-1] if counts else None,
            "active_threads_median": counts[len(counts) // 2] if counts else None,
            "per_logical_cpu_busy_fraction": result["per_logical_cpu_busy_fraction"]}


def control(interval, logical):
    """Positive control: a child pins its process and main thread; the observer must read both back."""
    code = ("import ctypes,time\nk=ctypes.WinDLL('kernel32')\n"
            "k.GetCurrentProcess.restype=k.GetCurrentThread.restype=ctypes.c_void_p\n"
            "k.SetProcessAffinityMask.argtypes=k.SetThreadAffinityMask.argtypes=[ctypes.c_void_p,ctypes.c_size_t]\n"
            f"assert k.SetProcessAffinityMask(k.GetCurrentProcess(),{CONTROL_PROCESS_MASK})\n"
            f"assert k.SetThreadAffinityMask(k.GetCurrentThread(),{CONTROL_THREAD_MASK})\n"
            "end=time.perf_counter()+2.0\nwhile time.perf_counter()<end: pass\n")
    result = observe([sys.executable, "-c", code], None, interval, 20, logical, pids=lambda p: {p.pid})
    summary = summarise(result)
    child = next(iter(summary["processes"].values()), {})
    busy = summary["per_logical_cpu_busy_fraction"] or []
    summary["passed"] = (result["return_code"] == 0 and child.get("process_masks") == [CONTROL_PROCESS_MASK]
                         and CONTROL_THREAD_MASK in child.get("thread_masks", [])
                         and bool(busy) and busy.index(max(busy)) == CONTROL_THREAD_MASK.bit_length() - 1)
    summary["expected"] = {"process_mask": CONTROL_PROCESS_MASK, "thread_mask": CONTROL_THREAD_MASK,
                           "busiest_logical_cpu": CONTROL_THREAD_MASK.bit_length() - 1}
    return result, summary


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--interval", type=float, default=0.05)
    parser.add_argument("--timeout", type=float, default=45)
    parser.add_argument("--modes", nargs="*", choices=[m[0] for m in MODES], help="subset of launch modes")
    parser.add_argument("--reference-hash", default="da1762d641f51b4e",
                        help="sequential imbalanced/medium hash from hybrid-v3 20260928T081730Z-e41d9f1c")
    args = parser.parse_args()
    if sys.platform != "win32":
        parser.error("Windows only")
    mpi_exe = ROOT / "build-release/helios_mpi.exe"
    if not mpi_exe.is_file():
        parser.error("Release helios_mpi.exe missing")
    logical = os.cpu_count()
    ident = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    directory = ROOT / "results/diagnostic/hybrid-v3" / f"placement-observer-{ident}"
    raw = directory / "raw"
    raw.mkdir(parents=True, exist_ok=False)
    git = ["git", "-c", f"safe.directory={ROOT.as_posix()}", "-C", str(ROOT)]
    manifest = {"classification": "diagnostic-not-formal", "id": ident, "tool": "scripts/observe_rank_placement.py",
                "tool_sha256": digest(ROOT / "scripts/observe_rank_placement.py"),
                "git_sha": subprocess.run(git + ["rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip(),
                "git_status_porcelain": subprocess.run(git + ["status", "--porcelain"], capture_output=True, text=True).stdout,
                "mpi_executable_sha256": digest(mpi_exe), "hardware": hardware(), "interval_seconds": args.interval,
                "created_utc": datetime.now(timezone.utc).isoformat(),
                "system_cpu_sets": {str(k): v for k, v in system_cpu_sets().items()},
                "caveat": "timings perturbed by sampling; masks are allowed CPUs, not observed run locations"}
    control_raw, control_summary = control(args.interval, logical)
    write_json(raw / "positive-control.json", control_raw)
    manifest["positive_control"] = control_summary
    print("positive control passed:", control_summary["passed"], flush=True)
    runs = {}
    for name, backend, ranks, threads, flags in [m for m in MODES if not args.modes or m[0] in args.modes]:
        stats = raw / f"{name}.stats.json"
        command = ["mpiexec"] + flags + ["-n", str(ranks), str(mpi_exe), "render", "--backend", backend,
                   "--scene", "imbalanced", "--width", "256", "--height", "144", "--spp", "192", "--max-depth", "8",
                   "--seed", "42", "--tile", "16", "--threads", str(threads),
                   "--output", str(raw / f"{name}.ppm"), "--stats-json", str(stats)]
        result = observe(command, {"helios_mpi.exe"}, args.interval, args.timeout, logical)
        write_json(raw / f"{name}.observation.json", result)
        summary = summarise(result)
        summary["return_code"] = result["return_code"]
        if stats.is_file():
            data = json.loads(stats.read_text(encoding="utf-8"))
            summary["render_wall_seconds_perturbed"] = data["render_wall_seconds"]
            summary["rank_compute_seconds"] = [round(w["compute_seconds"], 3) for w in data["workers"]]
            summary["hash_matches_reference"] = data["image_hash_fnv1a64"] == args.reference_hash
        runs[name] = summary
        print(name, "rc", result["return_code"], "masks",
              {pid: (p["process_masks"], p["thread_masks"]) for pid, p in summary["processes"].items()},
              "active max/median", summary["active_threads_max"], summary["active_threads_median"], flush=True)
    manifest["runs"] = runs
    manifest["status"] = "complete" if all(r["return_code"] == 0 and r.get("hash_matches_reference") for r in runs.values()) else "failed"
    write_json(directory / "manifest.json", manifest)
    print(directory, manifest["status"], flush=True)
    return 0 if manifest["status"] == "complete" and control_summary["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
