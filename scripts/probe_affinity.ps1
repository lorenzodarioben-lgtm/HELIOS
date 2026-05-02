# Launched by mpiexec to inspect its applied Windows process affinity without rendering.
# Limited: this stand-in never calls MPI_Init, and Microsoft MPI applies -affinity_layout as
# process default CPU Sets during MPI_Init, which ProcessorAffinity does not show. Thread masks
# cannot be read here (.NET ProcessThread.ProcessorAffinity is write-only). Use
# scripts/observe_rank_placement.py to observe real helios_mpi ranks.
$process = Get-Process -Id $PID
[ordered]@{
  pmi_rank = $env:PMI_RANK
  process_id = $PID
  affinity_mask_decimal = [int64]$process.ProcessorAffinity
  logical_processors_visible = [System.Environment]::ProcessorCount
} | ConvertTo-Json -Compress
