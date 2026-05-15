param(
  [switch]$IUnderstandThisIsLong,
  [ValidateRange(1,86400)][int]$TimeoutSeconds = 600,
  [string]$OutputRoot = ''
)
$ErrorActionPreference = 'Stop'
if (-not $IUnderstandThisIsLong) {
  throw 'This is an intentionally long supervised run. Pass -IUnderstandThisIsLong to start it.'
}
$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root 'build-release/helios.exe'
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw "Missing Release executable: $exe" }
if (-not $OutputRoot) { $OutputRoot = Join-Path $root 'results/stress' }
$runId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$runDir = Join-Path $OutputRoot $runId
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
$stdout = Join-Path $runDir 'stdout.log'
$stderr = Join-Path $runDir 'stderr.log'
$ppm = Join-Path $runDir 'stress.ppm'
$stats = Join-Path $runDir 'stress.json'
$arguments = @('render','--backend','sequential','--scene','scheduler_stress',
  '--width','1280','--height','720','--spp','2048','--max-depth','16',
  '--tile','16','--seed','42','--output',$ppm,'--stats-json',$stats)
$launchArguments = @($arguments | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } })
$sha = (& git -c "safe.directory=$root" -C $root rev-parse HEAD 2>$null)
$cpu = $null
try { $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1 Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed } catch { }
$started = (Get-Date).ToUniversalTime()
$timer = [System.Diagnostics.Stopwatch]::StartNew()
$timedOut = $false
$exitCode = $null
$errorText = $null
$process = $null
try {
  $process = Start-Process -FilePath $exe -ArgumentList $launchArguments -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  try {
    Wait-Process -Id $process.Id -Timeout $TimeoutSeconds -ErrorAction Stop
  } catch {
    if (-not $process.HasExited) {
      $timedOut = $true
      & taskkill.exe /PID $process.Id /T /F | Out-Null
      $process.WaitForExit(10000) | Out-Null
    }
  }
  $process.Refresh()
  if ($process.HasExited) { $exitCode = $process.ExitCode }
} catch {
  $errorText = $_.Exception.Message
} finally {
  $timer.Stop()
  $ended = (Get-Date).ToUniversalTime()
  $manifest = [ordered]@{
    classification = 'supervised-stress-evidence'
    candidate = 'scheduler_stress 1280x720 2048 SPP depth 16 sequential'
    run_id = $runId
    started_utc = $started.ToString('o')
    ended_utc = $ended.ToString('o')
    elapsed_wall_seconds = $timer.Elapsed.TotalSeconds
    timeout_seconds = $TimeoutSeconds
    timed_out = $timedOut
    exit_code = $exitCode
    launch_error = $errorText
    executable = $exe
    executable_sha256 = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
    arguments = $arguments
    exact_command = '"' + $exe + '" ' + (($arguments | ForEach-Object { if ($_ -match '[\s"]') { '"' + ($_ -replace '"','\"') + '"' } else { $_ } }) -join ' ')
    git_sha = "$sha".Trim()
    machine = [ordered]@{ computer = $env:COMPUTERNAME; os = [System.Environment]::OSVersion.VersionString;
      logical_processors = [System.Environment]::ProcessorCount; cpu = $cpu }
    files = [ordered]@{ stdout = $stdout; stderr = $stderr; ppm = $ppm; stats_json = $stats }
    file_exists = [ordered]@{ stdout = (Test-Path -LiteralPath $stdout); stderr = (Test-Path -LiteralPath $stderr);
      ppm = (Test-Path -LiteralPath $ppm); stats_json = (Test-Path -LiteralPath $stats) }
  }
  $manifestPath = Join-Path $runDir 'manifest.json'
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
  Write-Host "Stress evidence: $manifestPath"
}
if ($errorText) { throw $errorText }
if ($timedOut) { Write-Host "Timed out after $TimeoutSeconds seconds; process tree terminated."; exit 124 }
exit $exitCode
