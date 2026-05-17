# Single-host weak scaling

| backend | ranks | threads | compute_slots | n_valid | median_seconds | median_ci95_low_seconds | median_ci95_high_seconds | weak_efficiency_vs_one_slot |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hybrid-static | 2 | 2 | 4 | 7 | 6.2237 | 6.1703 | 6.2619 | 0.3320 |
| mpi-static | 2 | 1 | 2 | 7 | 3.3734 | 3.3536 | 3.4445 | 0.6125 |
| mpi-static | 4 | 1 | 4 | 7 | 4.0024 | 3.9539 | 4.1600 | 0.5162 |
| openmp | 1 | 2 | 2 | 7 | 3.4154 | 3.4115 | 3.5073 | 0.6050 |
| openmp | 1 | 4 | 4 | 7 | 4.1811 | 4.1279 | 4.2391 | 0.4942 |
| sequential | 1 | 1 | 1 | 7 | 2.0662 | 2.0359 | 2.1283 | 1.0000 |
