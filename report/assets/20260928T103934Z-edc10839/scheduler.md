# Medium scheduler comparison (seconds unless stated)

| scene | backend | n_valid | median_seconds | median_ci95_low_seconds | median_ci95_high_seconds | median_compute_imbalance_fraction | median_assignment_count | median_tail90_seconds | median_last_worker_spread_seconds | median_worker_wait_seconds_sum |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| imbalanced | mpi-static | 7 | 3.3773 | 3.2583 | 3.5543 | 0.5894 | — | — | — | — |
| imbalanced | mpi-dynamic | 7 | 2.3009 | 2.2584 | 2.3335 | 0.0058 | 144 | 0.2926 | 0.0265 | 0.0101 |
| imbalanced | hybrid-adaptive | 7 | 2.2848 | 2.2505 | 2.3060 | 0.0051 | 73 | 0.2967 | 0.0236 | 0.0062 |
| reflective | mpi-static | 7 | 2.4917 | 2.4498 | 2.5387 | 0.4779 | — | — | — | — |
| reflective | mpi-dynamic | 7 | 1.7950 | 1.7845 | 1.8226 | 0.0049 | 144 | 0.2180 | 0.0171 | 0.0099 |
| reflective | hybrid-adaptive | 7 | 1.7991 | 1.7721 | 1.8115 | 0.0041 | 69 | 0.2162 | 0.0144 | 0.0056 |
| scheduler_stress | mpi-static | 7 | 3.6740 | 3.6502 | 3.7057 | 0.5587 | — | — | — | — |
| scheduler_stress | mpi-dynamic | 7 | 2.5713 | 2.5396 | 2.5833 | 0.0010 | 144 | 0.3340 | 0.0071 | 0.0104 |
| scheduler_stress | hybrid-adaptive | 7 | 2.5245 | 2.4989 | 2.6058 | 0.0012 | 79 | 0.3291 | 0.0068 | 0.0067 |
| uniform | mpi-static | 7 | 1.3908 | 1.3529 | 1.4100 | 0.4457 | — | — | — | — |
| uniform | mpi-dynamic | 7 | 1.0051 | 0.9906 | 1.0424 | 0.0038 | 144 | 0.1038 | 0.0080 | 0.0091 |
| uniform | hybrid-adaptive | 7 | 0.9894 | 0.9704 | 0.9983 | 0.0017 | 36 | 0.0888 | 0.0044 | 0.0028 |
