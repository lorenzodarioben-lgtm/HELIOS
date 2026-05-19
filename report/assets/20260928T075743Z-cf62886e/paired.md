# Paired scheduler effects; positive means candidate slower

| scene | candidate | reference | n_blocks | median_relative_runtime_change | median_ci95_low | median_ci95_high | median_absolute_seconds | median_absolute_ci95_low_seconds | median_absolute_ci95_high_seconds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| imbalanced | mpi-dynamic | mpi-static | 7 | -0.3684 | -0.3874 | -0.3585 | -1.8729 | -2.0201 | -1.8062 |
| imbalanced | hybrid-adaptive | mpi-static | 7 | -0.3503 | -0.3788 | -0.3391 | -1.7916 | -1.9740 | -1.7580 |
| imbalanced | hybrid-adaptive | mpi-dynamic | 7 | 0.0287 | -0.0316 | 0.0499 | 0.0922 | -0.1057 | 0.1583 |
| reflective | mpi-dynamic | mpi-static | 7 | -0.3311 | -0.3538 | -0.3091 | -1.3378 | -1.4928 | -1.2176 |
| reflective | hybrid-adaptive | mpi-static | 7 | -0.3312 | -0.3392 | -0.3244 | -1.3691 | -1.3974 | -1.2777 |
| reflective | hybrid-adaptive | mpi-dynamic | 7 | -0.0120 | -0.0261 | 0.0350 | -0.0325 | -0.0725 | 0.0954 |
| scheduler_stress | mpi-dynamic | mpi-static | 7 | -0.3885 | -0.4133 | -0.3613 | -2.4023 | -2.6064 | -2.2227 |
| scheduler_stress | hybrid-adaptive | mpi-static | 7 | -0.3910 | -0.3931 | -0.3642 | -2.4235 | -2.4603 | -2.2280 |
| scheduler_stress | hybrid-adaptive | mpi-dynamic | 7 | 0.0105 | -0.0440 | 0.0349 | 0.0396 | -0.1793 | 0.1292 |
| uniform | mpi-dynamic | mpi-static | 7 | -0.3272 | -0.3361 | -0.2917 | -0.8746 | -0.9126 | -0.7560 |
| uniform | hybrid-adaptive | mpi-static | 7 | -0.2891 | -0.3269 | -0.2741 | -0.7526 | -0.8782 | -0.7104 |
| uniform | hybrid-adaptive | mpi-dynamic | 7 | 0.0166 | 0.0043 | 0.0248 | 0.0296 | 0.0078 | 0.0456 |
