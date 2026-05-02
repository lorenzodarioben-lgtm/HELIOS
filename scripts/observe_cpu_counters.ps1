param([string]$OutputPath = '')
$ErrorActionPreference = 'Stop'
$paths = @(
  '\Processor Information(_Total)\Actual Frequency',
  '\Processor Information(_Total)\% Processor Performance',
  '\Processor(_Total)\% Processor Time'
)
$sample = Get-Counter -Counter $paths -SampleInterval 1 -MaxSamples 1
$record = [ordered]@{
  classification = 'observational-counter-sample-not-thermal-telemetry'
  timestamp_utc = (Get-Date).ToUniversalTime().ToString('o')
  counters = @($sample.CounterSamples | ForEach-Object {
    [ordered]@{ path = $_.Path; cooked_value = $_.CookedValue; status = $_.Status }
  })
}
$json = $record | ConvertTo-Json -Depth 5
if ($OutputPath) {
  $parent = Split-Path -Parent $OutputPath
  if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  $json | Set-Content -LiteralPath $OutputPath -Encoding UTF8
  Write-Host $OutputPath
} else {
  Write-Output $json
}
