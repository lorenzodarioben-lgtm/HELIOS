# One-click, read-only Helios demonstration.
#
#   powershell -ExecutionPolicy Bypass -File scripts/helios_demo.ps1 [-NoOpen] [-Port 8315]
#
# 1. verifies that src/, include/ and tests/ are identical to the frozen source e2c13e2
# 2. verifies that the release binaries exist (and reports whether they match the formal-evidence binary)
# 3. runs the core tests and the bounded backend validator (validator renders only to its own temp dir)
# 4. renders the showcase scene with hybrid-adaptive (3 ranks x 2 threads) and sequential, same settings
# 5. recomputes both image hashes independently, checks the pixels are identical, converts to PNG
# 6. opens the Helios Observatory on the Correctness page (local server, 127.0.0.1 only)
#
# Every output goes to $env:TEMP\helios-demo. It never runs benchmarks or the stress test, never
# rebuilds anything, and never writes to results/. It stops at the first failure.
param([switch]$NoOpen, [int]$Port = 8315)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$frozen = 'e2c13e2204ca28aecb90d2d33703587bd16027a1'
$showcaseHash = '57881d257daf2474'
$demo = Join-Path $env:TEMP 'helios-demo'
$step = 0

function Step([string]$title) {
  $script:step++
  Write-Host ''
  Write-Host ("[{0}/7] {1}" -f $script:step, $title) -ForegroundColor Cyan
}
function Fail([string]$message) {
  Write-Host "FAILED: $message" -ForegroundColor Red
  exit 1
}
function Check-Exit([string]$what) {
  if ($LASTEXITCODE -ne 0) { Fail "$what (exit code $LASTEXITCODE)" }
}
function Invoke-Captured([scriptblock]$block) {
  # Windows PowerShell 5.1 turns redirected native stderr into terminating errors under 'Stop'.
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { return (& $block 2>&1 | ForEach-Object { "$_" }) -join "`n" } finally { $ErrorActionPreference = $old }
}
function Find-Tool([string]$name, [string[]]$fallbacks) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($f in $fallbacks) { if (Test-Path $f) { return $f } }
  Fail "$name not found"
}

Write-Host 'HELIOS DEMO  (read-only: outputs go to %TEMP%\helios-demo)' -ForegroundColor White
Set-Location $root
$git = Find-Tool 'git' @()
$python = Find-Tool 'python' @()
$mpiexec = Find-Tool 'mpiexec' @('C:\Program Files\Microsoft MPI\Bin\mpiexec.exe')

Step 'Frozen source check'
$diff = & $git -c "safe.directory=$($root -replace '\\','/')" diff --name-only $frozen -- src include tests
Check-Exit 'git diff'
$dirty = & $git -c "safe.directory=$($root -replace '\\','/')" status --porcelain -- src include tests
Check-Exit 'git status'
if ($diff -or $dirty) { Fail "src/include/tests differ from the frozen source $frozen" }
Write-Host "  src/, include/, tests/ identical to $($frozen.Substring(0,7))"

Step 'Release binaries'
$exe = Join-Path $root 'build-release\helios.exe'
$mpiExe = Join-Path $root 'build-release\helios_mpi.exe'
$testsExe = Join-Path $root 'build-release\helios_tests.exe'
foreach ($b in @($exe, $mpiExe, $testsExe)) {
  if (-not (Test-Path $b)) { Fail "missing $b (build with scripts/build.ps1; this demo does not build)" }
}
$manifest = Get-Content (Join-Path $root 'results\protocol-v2\20260928T102644Z-100e1393\manifest.json') -Raw | ConvertFrom-Json
$sha = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLower()
if ($sha -eq $manifest.executable_sha256) {
  Write-Host "  helios.exe SHA-256 $($sha.Substring(0,16))... = binary used for the formal experiments"
} else {
  Write-Host "  helios.exe SHA-256 $($sha.Substring(0,16))... differs from the formal-evidence binary ($($manifest.executable_sha256.Substring(0,16))...)" -ForegroundColor Yellow
}
if (Test-Path $demo) { Remove-Item -Recurse -Force (Join-Path $demo '*') }
New-Item -ItemType Directory -Force $demo | Out-Null
Write-Host "  demo output directory: $demo"

Step 'Core tests'
$out = Invoke-Captured { & $testsExe }
Check-Exit 'core tests'
if ($out -notmatch 'All Helios core checks passed') { Fail 'core tests did not report success' }
($out.Trim() -split "`n") | ForEach-Object { Write-Host "  $_" }

Step 'Backend validator (11 configurations, temp directory only)'
$env:PYTHONDONTWRITEBYTECODE = '1'
$out = Invoke-Captured { & $python scripts/validate_backends.py --exe $exe --mpi-exe $mpiExe --mpiexec $mpiexec --openmp }
Check-Exit 'backend validator'
($out.Trim() -split "`n") | ForEach-Object { Write-Host "  $_" }

$common = @('--scene', 'showcase', '--width', '800', '--height', '450', '--spp', '64', '--max-depth', '8', '--seed', '42')
Step 'Render: hybrid-adaptive, 3 MPI ranks x 2 OpenMP threads (rank 0 coordinates)'
& $mpiexec -n 3 $mpiExe render --backend hybrid-adaptive --threads 2 @common --output "$demo\hybrid-adaptive.ppm" --stats-json "$demo\hybrid-adaptive.json"
Check-Exit 'hybrid-adaptive render'

Step 'Render: sequential, same scene, resolution, SPP, depth and seed'
& $exe render --backend sequential --threads 1 @common --output "$demo\sequential.ppm" --stats-json "$demo\sequential.json"
Check-Exit 'sequential render'

Step 'Independent hash check and PNG conversion'
& $python scripts/observatory/demo_check.py $demo --expect $showcaseHash
Check-Exit 'image comparison'
Write-Host '  RESULT: different execution backends, identical deterministic output' -ForegroundColor Green

if (-not $NoOpen) {
  Write-Host ''
  Write-Host "Opening the Helios Observatory (http://127.0.0.1:$Port, Ctrl+C in its window to stop)..."
  Start-Process -FilePath $python -ArgumentList @('scripts/observatory/serve.py', '--port', "$Port", '--route', 'correctness') -WorkingDirectory $root
}
exit 0
