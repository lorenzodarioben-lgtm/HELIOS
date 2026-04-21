param([ValidateSet('release','debug')][string]$Configuration='release')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$out=Join-Path $root "build-$Configuration"
New-Item -ItemType Directory -Force $out | Out-Null
$flags=@('-std=c++20','-Wall','-Wextra','-Wpedantic','-Wconversion','-fopenmp','-DHELIOS_OPENMP=1','-I',"$root/include")
if($Configuration -eq 'release') { $flags+=@('-O2','-DNDEBUG') } else { $flags+=@('-O0','-g') }
& g++ @flags "$root/src/core.cpp" "$root/src/main.cpp" '-o' "$out/helios.exe"
if($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& g++ @flags "$root/src/core.cpp" "$root/tests/tests.cpp" '-o' "$out/helios_tests.exe"
if($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if(Get-Command mpicxx -ErrorAction SilentlyContinue) {
  & mpicxx @flags '-DHELIOS_MPI=1' "$root/src/core.cpp" "$root/src/main.cpp" '-o' "$out/helios_mpi.exe"
  if($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Write-Host "Built Helios in $out"
