# Medium scheduler comparison (seconds unless stated)

| scene | backend | n_valid | median_seconds | median_ci95_low_seconds | median_ci95_high_seconds | median_compute_imbalance_fraction | median_assignment_count | median_tail90_seconds | median_last_worker_spread_seconds | median_worker_wait_seconds_sum |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| imbalanced | mpi-static | 7 | 5.2113 | 5.0532 | 5.2466 | 0.5505 | — | — | — | — |
| imbalanced | mpi-dynamic | 7 | 3.2108 | 3.1945 | 3.3430 | 0.0044 | 144 | 0.4359 | 0.0286 | 0.0113 |
| imbalanced | hybrid-adaptive | 7 | 3.3031 | 3.2373 | 3.3314 | 0.0022 | 92 | 0.4383 | 0.0152 | 0.0077 |
| reflective | mpi-static | 7 | 4.0695 | 4.0289 | 4.2194 | 0.4723 | — | — | — | — |
| reflective | mpi-dynamic | 7 | 2.7247 | 2.7023 | 2.7813 | 0.0057 | 144 | 0.3411 | 0.0300 | 0.0115 |
| reflective | hybrid-adaptive | 7 | 2.7003 | 2.6698 | 2.8220 | 0.0067 | 89 | 0.3398 | 0.0360 | 0.0075 |
| scheduler_stress | mpi-static | 7 | 6.1837 | 6.1176 | 6.2919 | 0.5497 | — | — | — | — |
| scheduler_stress | mpi-dynamic | 7 | 3.7814 | 3.7001 | 3.9293 | 0.0018 | 144 | 0.5126 | 0.0141 | 0.0113 |
| scheduler_stress | hybrid-adaptive | 7 | 3.8293 | 3.7496 | 3.8896 | 0.0020 | 95 | 0.5283 | 0.0158 | 0.0080 |
| uniform | mpi-static | 7 | 2.6729 | 2.5916 | 2.7156 | 0.4212 | — | — | — | — |
| uniform | mpi-dynamic | 7 | 1.8001 | 1.7874 | 1.8357 | 0.0019 | 144 | 0.1979 | 0.0067 | 0.0100 |
| uniform | hybrid-adaptive | 7 | 1.8219 | 1.8080 | 1.8812 | 0.0006 | 81 | 0.1989 | 0.0020 | 0.0066 |
