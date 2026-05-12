# Block-paired strong-scaling comparisons: 20260928T102644Z-100e1393

| Candidate | Reference | Blocks | Candidate faster | Median change | 95% CI | Median absolute (s) | 95% CI (s) |
|---|---|---:|---:|---:|---|---:|---|
| hybrid-static 2x2 | openmp 1x4 | 7 | 4 | -0.30% | -2.02% to +3.29% | -0.006 | -0.044 to +0.065 |
| hybrid-static 2x2 | mpi-static 4x1 | 7 | 2 | +1.84% | -0.19% to +4.02% | +0.037 | -0.004 to +0.079 |
| hybrid-static 1x4 | openmp 1x4 | 7 | 7 | -20.66% | -25.95% to -18.80% | -0.415 | -0.562 to -0.374 |
| hybrid-static 4x1 | mpi-static 4x1 | 7 | 0 | +1.01% | +0.54% to +1.96% | +0.022 | +0.011 to +0.039 |
| openmp 1x4 | mpi-static 4x1 | 7 | 2 | +0.34% | -1.40% to +8.15% | +0.007 | -0.028 to +0.163 |
| openmp 1x8 | openmp 1x4 | 7 | 7 | -34.69% | -39.92% to -32.31% | -0.699 | -0.864 to -0.659 |
| hybrid-static 1x4 | hybrid-static 2x2 | 7 | 7 | -22.47% | -24.42% to -18.67% | -0.462 | -0.518 to -0.386 |

Historical `20260928T063038Z-301480e3` versus this run (separate sessions, **not paired**):

| Condition | Historical median (95% CI) | New median (95% CI) |
|---|---|---|
| hybrid-static 1x4 | 3.634 s (3.538–3.693) | 1.603 s (1.583–1.676) |
| hybrid-static 2x2 | 4.707 s (4.645–4.718) | 2.057 s (2.048–2.121) |
| hybrid-static 4x1 | 3.062 s (3.051–3.178) | 2.035 s (2.029–2.085) |
| mpi-static 1x1 | 6.129 s (6.085–6.345) | 3.910 s (3.905–3.937) |
| mpi-static 2x1 | 5.090 s (4.989–5.229) | 3.304 s (3.287–3.318) |
| mpi-static 4x1 | 3.092 s (2.980–3.117) | 2.020 s (2.001–2.074) |
| openmp 1x1 | 6.153 s (6.142–6.228) | 3.923 s (3.888–4.093) |
| openmp 1x2 | 5.170 s (5.107–5.373) | 3.304 s (3.292–3.341) |
| openmp 1x4 | 3.208 s (3.156–3.366) | 2.041 s (2.008–2.164) |
| openmp 1x8 | 2.116 s (2.089–2.365) | 1.323 s (1.300–1.381) |
| sequential 1x1 | 6.279 s (6.198–6.387) | 3.933 s (3.886–4.106) |
