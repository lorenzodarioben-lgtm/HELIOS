# Verified development environment

Observed on 2026-09-28, Australia/Sydney local date (benchmark IDs use UTC).

| Item | Observation | Method |
| --- | --- | --- |
| OS | Windows NT 10.0.26200, release 25H2; registry `ProductName` says “Windows 10 Home Single Language” | .NET OS description and Windows version registry; the registry product string appears legacy for this build |
| CPU | 11th Gen Intel Core i7-11370H @ 3.30 GHz | Node `os.cpus()[0].model` and processor registry |
| Logical processors | 8 | Node `os.cpus().length`, .NET processor count |
| Physical cores | 4, with 2 SMT logical processors each: logical pairs (0,1), (2,3), (4,5), (6,7). This matches [Intel's specification](https://www.intel.com/content/www/us/en/products/sku/196655/intel-core-i711370h-processor-12m-cache-up-to-4-80-ghz-with-ipu/specifications.html) | `Get-CimInstance Win32_Processor` returned access denied. The Windows CPU Set table (`GetSystemCpuSetInformation`, recorded in `results/diagnostic/hybrid-v3/placement-observer-20260928T090902Z-3f8c873d/manifest.json`) gives each logical processor's core index |
| Installed physical memory | 16,843,112,448 bytes (15.69 GiB) | Node `os.totalmem()` |
| C++ compiler | MSYS2 GCC 14.1.0; Clang 18.1.8 also present | `g++ --version`, `clang++ --version` |
| OpenMP | GCC `-fopenmp` build and 1/2/4-thread validation passed | `scripts/build.ps1`, `validate_backends.py` |
| MPI | Microsoft MPI `mpiexec` 10.1.12498.52; MSYS2 `mpicxx` wraps Microsoft MPI import library | `mpiexec -help`, `mpicxx -show`, 1/2/4-rank validation |
| Python | 3.11.9 | `python --version` |
| Git | 2.51.0.windows.1 | `git --version` |
| CMake/CTest | Not found on `PATH` or common local install paths | `cmake --version`, path checks |
| Optional plotting libraries | Pillow and matplotlib not installed | Python module checks |

The direct PowerShell build was used because CMake/CTest is unavailable. The CMake configuration exists and remains unverified until CMake is installed in a user-controlled location or otherwise made available. No system-wide dependency was installed during this session.
