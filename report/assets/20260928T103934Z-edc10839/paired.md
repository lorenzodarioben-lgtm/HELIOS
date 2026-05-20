# Paired scheduler effects; positive means candidate slower

| scene | candidate | reference | n_blocks | median_relative_runtime_change | median_ci95_low | median_ci95_high | median_absolute_seconds | median_absolute_ci95_low_seconds | median_absolute_ci95_high_seconds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| imbalanced | mpi-dynamic | mpi-static | 7 | -0.3184 | -0.3527 | -0.2923 | -1.0371 | -1.2535 | -0.9640 |
| imbalanced | hybrid-adaptive | mpi-static | 7 | -0.3218 | -0.3396 | -0.3093 | -1.0904 | -1.1751 | -1.0077 |
| imbalanced | hybrid-adaptive | mpi-dynamic | 7 | -0.0064 | -0.0259 | 0.0384 | -0.0145 | -0.0600 | 0.0853 |
| reflective | mpi-dynamic | mpi-static | 7 | -0.2752 | -0.2971 | -0.2609 | -0.6904 | -0.7541 | -0.6328 |
| reflective | hybrid-adaptive | mpi-static | 7 | -0.2780 | -0.3008 | -0.2605 | -0.6927 | -0.7636 | -0.6383 |
| reflective | hybrid-adaptive | mpi-dynamic | 7 | 0.0018 | -0.0393 | 0.0067 | 0.0032 | -0.0715 | 0.0121 |
| scheduler_stress | mpi-dynamic | mpi-static | 7 | -0.3042 | -0.3133 | -0.2948 | -1.1106 | -1.1566 | -1.0782 |
| scheduler_stress | hybrid-adaptive | mpi-static | 7 | -0.3168 | -0.3257 | -0.2956 | -1.1586 | -1.2070 | -1.0792 |
| scheduler_stress | hybrid-adaptive | mpi-dynamic | 7 | -0.0068 | -0.0282 | 0.0124 | -0.0172 | -0.0725 | 0.0314 |
| uniform | mpi-dynamic | mpi-static | 7 | -0.2776 | -0.2957 | -0.2522 | -0.3806 | -0.4152 | -0.3389 |
| uniform | hybrid-adaptive | mpi-static | 7 | -0.2886 | -0.2986 | -0.2668 | -0.4014 | -0.4211 | -0.3735 |
| uniform | hybrid-adaptive | mpi-dynamic | 7 | -0.0273 | -0.0422 | -0.0160 | -0.0277 | -0.0440 | -0.0161 |
