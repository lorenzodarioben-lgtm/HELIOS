"""Compare brute-force and BVH image output for every built-in scene."""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path

SCENES = ["showcase", "uniform", "reflective", "imbalanced", "bvh_stress", "scheduler_stress"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exe", required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="helios-bvh-") as temp:
        directory = Path(temp)
        for scene in SCENES:
            fingerprints = []
            images = []
            for mode in ("bvh", "brute"):
                stats = directory / f"{scene}-{mode}.json"
                command = [args.exe, "render", "--scene", scene, "--width", "43", "--height", "27",
                           "--spp", "2", "--seed", "42", "--output", str(directory / f"{scene}-{mode}.ppm"),
                           "--stats-json", str(stats)]
                if mode == "brute":
                    command.append("--no-bvh")
                result = subprocess.run(command, capture_output=True, text=True, timeout=20)
                if result.returncode:
                    raise RuntimeError(f"{scene}/{mode}: {result.stderr}")
                fingerprints.append(json.loads(stats.read_text())["image_hash_fnv1a64"])
                images.append((directory / f"{scene}-{mode}.ppm").read_bytes())
            if fingerprints[0] != fingerprints[1] or images[0] != images[1]:
                raise RuntimeError(f"{scene}: BVH and brute-force output differ")
            print(scene, fingerprints[0])
    print("Validated BVH against brute force in all six scenes")


if __name__ == "__main__":
    main()
