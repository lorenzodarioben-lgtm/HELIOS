$ErrorActionPreference = 'Continue'
foreach ($name in @('g++', 'mpicxx', 'mpiexec', 'python', 'cmake', 'ctest')) {
  $command = Get-Command $name -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    Write-Output "$name : unavailable"
  } else {
    Write-Output "$name : $($command.Source)"
    if ($name -eq 'g++' -or $name -eq 'python' -or $name -eq 'cmake') {
      & $name --version | Select-Object -First 1
    }
  }
}
