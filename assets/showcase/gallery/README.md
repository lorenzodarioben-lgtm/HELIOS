# Helios render gallery

**Presentation renders, not formal benchmark evidence.** Every image is the unmodified output of the frozen Helios Release binary (source `e2c13e2`, `helios.exe` SHA-256 `956685fbc2b7b314…`), losslessly converted from PPM to PNG. Render times are single informational runs on the development laptop, not benchmarks; several renders ran while other showcase work was encoding, so the times are not comparable with each other.

Generated 2026-09-28T19:09:17+00:00 at Git HEAD `b823a26` by `scripts/visual_showcase/render_presentation.py`. Hashes are the renderer's FNV-1a pixel hash, recomputed independently from each PPM.

| Image | Scene | Resolution | SPP | Max depth | Seed | Backend | Render time | Hash |
|---|---|---|---:|---:|---:|---|---:|---|
| `reflective-hero.png` | `reflective` | 1920×1080 | 1024 | 8 | 42 | openmp, 8 threads, dynamic OpenMP schedule | 251.3 s | `270a7d2390617dca` |
| `showcase-hero.png` | `showcase` | 1920×1080 | 1024 | 8 | 42 | openmp, 8 threads, dynamic OpenMP schedule | 121.8 s | `80618dc55f6d4a55` |
| `bvh_stress-hero.png` | `bvh_stress` | 1920×1080 | 1024 | 8 | 42 | openmp, 8 threads, dynamic OpenMP schedule | 478.1 s | `6f65dcba76303f7c` |
| `uniform-hero.png` | `uniform` | 1920×1080 | 1024 | 8 | 42 | openmp, 8 threads, dynamic OpenMP schedule | 139.0 s | `c25064a44395781f` |
| `imbalanced-hero.png` | `imbalanced` | 1920×1080 | 1024 | 8 | 42 | openmp, 8 threads, dynamic OpenMP schedule | 301.9 s | `d7579a41ebf56be1` |
| `scheduler_stress-hero.png` | `scheduler_stress` | 1920×1080 | 1024 | 8 | 42 | openmp, 8 threads, dynamic OpenMP schedule | 345.9 s | `5f7ff54682233658` |
| `reflective-wide.png` | `reflective` | 2400×1000 | 1024 | 8 | 42 | openmp, 8 threads, dynamic OpenMP schedule | 238.9 s | `a4c94d5f68f2236e` |

Exact commands (run from the repository root):

```powershell
./build-release/helios.exe render --backend openmp --threads 8 --omp-schedule dynamic --scene reflective --width 1920 --height 1080 --spp 1024 --max-depth 8 --seed 42 --output assets/showcase/_work/gallery/reflective.ppm --stats-json assets/showcase/_work/gallery/reflective.json
./build-release/helios.exe render --backend openmp --threads 8 --omp-schedule dynamic --scene showcase --width 1920 --height 1080 --spp 1024 --max-depth 8 --seed 42 --output assets/showcase/_work/gallery/showcase.ppm --stats-json assets/showcase/_work/gallery/showcase.json
./build-release/helios.exe render --backend openmp --threads 8 --omp-schedule dynamic --scene bvh_stress --width 1920 --height 1080 --spp 1024 --max-depth 8 --seed 42 --output assets/showcase/_work/gallery/bvh_stress.ppm --stats-json assets/showcase/_work/gallery/bvh_stress.json
./build-release/helios.exe render --backend openmp --threads 8 --omp-schedule dynamic --scene uniform --width 1920 --height 1080 --spp 1024 --max-depth 8 --seed 42 --output assets/showcase/_work/gallery/uniform.ppm --stats-json assets/showcase/_work/gallery/uniform.json
./build-release/helios.exe render --backend openmp --threads 8 --omp-schedule dynamic --scene imbalanced --width 1920 --height 1080 --spp 1024 --max-depth 8 --seed 42 --output assets/showcase/_work/gallery/imbalanced.ppm --stats-json assets/showcase/_work/gallery/imbalanced.json
./build-release/helios.exe render --backend openmp --threads 8 --omp-schedule dynamic --scene scheduler_stress --width 1920 --height 1080 --spp 1024 --max-depth 8 --seed 42 --output assets/showcase/_work/gallery/scheduler_stress.ppm --stats-json assets/showcase/_work/gallery/scheduler_stress.json
./build-release/helios.exe render --backend openmp --threads 8 --omp-schedule dynamic --scene reflective --width 2400 --height 1000 --spp 1024 --max-depth 8 --seed 42 --output assets/showcase/_work/gallery/reflective-wide.ppm --stats-json assets/showcase/_work/gallery/reflective-wide.json
```

The PPM files are written to `assets/showcase/_work/` and are not committed (see `assets/showcase/.gitignore`). Rerunning a command reproduces the same hash with the same binary.
