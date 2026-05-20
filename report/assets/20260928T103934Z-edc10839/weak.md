# Single-host weak scaling

| backend | ranks | threads | compute_slots | n_valid | median_seconds | median_ci95_low_seconds | median_ci95_high_seconds | weak_efficiency_vs_one_slot |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hybrid-static | 2 | 2 | 4 | 7 | 2.7780 | 2.7446 | 2.8069 | 0.4844 |
| mpi-static | 2 | 1 | 2 | 7 | 2.1992 | 2.1857 | 2.2328 | 0.6119 |
| mpi-static | 4 | 1 | 4 | 7 | 2.7251 | 2.6393 | 2.7837 | 0.4938 |
| openmp | 1 | 2 | 2 | 7 | 2.2235 | 2.2211 | 2.2677 | 0.6052 |
| openmp | 1 | 4 | 4 | 7 | 2.7396 | 2.6881 | 2.7779 | 0.4912 |
| sequential | 1 | 1 | 1 | 7 | 1.3457 | 1.3069 | 1.3788 | 1.0000 |
