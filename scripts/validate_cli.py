"""Check that invalid render configurations fail before producing output."""
import argparse
import subprocess
import tempfile
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--exe", required=True)
    args = p.parse_args()
    cases = [
        (["--width", "0"], "invalid --width"),
        (["--seed", "-1"], "invalid seed"),
        (["--threads", "257", "--backend", "openmp"], "safety limit"),
        (["--scene", "unknown"], "unknown scene"),
        (["--backend", "unknown"], "unknown backend"),
        (["--trace-csv", str(Path("results") / "invalid-trace.csv")], "assignment trace requires"),
        (["--slow-us", "1000"], "slow-rank requires"),
        (["--slow-factor-milli", "5000"], "slow-factor-milli must be"),
        (["--coordinator-only"], "coordinator-only requires"),
        (["--fixed-batch", "33"], "fixed-batch exceeds"),
        (["--adaptive-initial-batch", "9"], "adaptive-initial-batch exceeds"),
        (["--adaptive-target-ms", "201"], "adaptive-target-ms exceeds"),
    ]
    with tempfile.TemporaryDirectory(prefix="helios-cli-") as temp:
        destination = Path(temp) / "should-not-exist.ppm"
        for flags, expected in cases:
            command = [args.exe, "render", "--output", str(destination), *flags]
            result = subprocess.run(command, capture_output=True, text=True, timeout=5)
            if result.returncode == 0 or expected not in result.stderr:
                raise RuntimeError(f"bad CLI response for {flags}: {result.returncode}, {result.stderr}")
            if destination.exists():
                raise RuntimeError(f"invalid CLI wrote output: {flags}")
    print(f"Validated {len(cases)} CLI error cases")


if __name__ == "__main__":
    main()
