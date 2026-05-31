# Report visual upgrade plan (recommendation only)

**Status: superseded and applied in part** in the final report visual integration (2026-09-29), together with [OBSERVATORY_REPORT_INTEGRATION.md](OBSERVATORY_REPORT_INTEGRATION.md). Applied: the hero render (Figure 1), the convergence figure (Figure 2, the before/after image rather than the grid), the architecture diagram (Figure 3) and the correctness wall (Figure 5, in Section 4.7 rather than on the landscape page). Not applied: the optimisation and partition replacements (the native Figure 6 chart and Figure 7 runtime plot were kept as formal evidence); the tile-cost map and the comparison still were replaced by Observatory screenshots (Figures 4 and 14). Final numbering: [report/FIGURE_INDEX.md](../report/FIGURE_INDEX.md). The text below is the original recommendation.

The final report (`report/HELIOS_FINAL_REPORT.md`, `.docx`, `.pdf`) has **not** been changed. Applying any of this changes the content of a CONTENT FINAL document, so it needs the user's explicit go-ahead. It would then require a rebuild with `scripts/report_build/`, the integrity check and a new visual QA pass.

Goal: higher evidence density, not more figures. Recommended outcome: **11 → 13 figures**, about **+1 page** (33 → about 34), with two weak figures replaced.

## Review of the current 11 figures

| Fig | Current content | Verdict | Reason |
|---|---|---|---|
| 1 | Showcase render, 800×450, 128 SPP (pre-fix render) | **REPLACE** with `assets/showcase/hero/helios-hero.png` (reflective, 1920×1080, 1024 SPP, frozen binary) | Stronger image: glass, metal, diffuse, caustic, nested refraction. Same space. Caption must say "presentation render". |
| 2 | Tile-cost heatmap from a V1 **pilot** (pre-fix) run | **REPLACE** with `assets/showcase/scheduler/tile-cost-map.png` | New map uses the **final formal** strong-scaling tiles (`20260928T102644Z-100e1393`, median of 7 runs), shows per-tile milliseconds, and removes a historical figure from the main text. Same space. |
| 3 | Optimisation A/B (diagnostic) | **REPLACE** with `assets/showcase/performance/optimisation-before-after.png` | Same data (read from `summary.json`) plus the paired change and blocks-faster per bar; larger labels readable in print. Same space. |
| 4 | Final strong-scaling median runtimes | **REPLACE** with `assets/showcase/scheduler/tile-cost-static-partitions.png` | Fig 4 duplicates Table 9. The partition figure *explains* the 1.23× and 2.34× caps argued in Section 7.2, which currently have no visual. Same space. |
| 5 | Speedup (MPI static and OpenMP only) | KEEP | Formal generated chart; hybrid values are in Table 9 |
| 6 | Efficiency per rendering slot | KEEP | Formal generated chart |
| 7 | Weak efficiency | KEEP | Formal |
| 8 | Scheduler runtime by scene | KEEP | Formal |
| 9 | Scheduler compute imbalance | KEEP | Formal, quantifies imbalance across all four scenes |
| 10 | One adaptive assignment timeline | **REPLACE** with `assets/showcase/scheduler/scheduler-comparison-still.png` | Same run family (`20260928T103934Z-edc10839`), but shows static, fixed dynamic and adaptive side by side with the rank-1 idle tail. Same space (full width). |
| 11 | Terminal screenshot (landscape page) | KEEP; **MOVE** the correctness wall onto the same page | The landscape page has a blank lower half, so no length increase |

## Proposed additions

| New figure | Section | Why | Replaces | Length |
|---|---|---|---|---|
| `assets/showcase/convergence/convergence-grid.png` | 2.1 Monte Carlo path tracing | Makes "noise falls as SPP rises; cost rises with SPP" visible and justifies SPP as the workload knob | nothing | about +1/3 page |
| `assets/showcase/architecture/architecture-report.png` | 3.1 Rendering pipeline | One image of the real structure: shared `render_tile`, both source files, the seven backends and the coordinator protocol. Can replace the text pipeline block. | the text code block | about +1/2 page, net about +1/3 |
| `assets/showcase/correctness/backend-correctness-wall.png` | 9 End-to-End Demonstration | Shows deterministic equality at a glance next to the real screenshot | nothing | 0 (fills the landscape page) |

## Not recommended for the main report

| Asset | Reason |
|---|---|
| `performance-investigation-story*.png` | Section 5 and Table 4 already tell this in full; better in the video and on GitHub |
| `helios-performance-dashboard.png` | Summarises Tables 9 to 12; duplicates them in print |
| `stress-test-summary.png` | Table 13 covers it; use in the video |
| Scheduler animation stills other than the comparison | Redundant |
| Terminal captures (tests/validators, CLI, stress manifest) | Appendix A only, if at all; Figure 11 remains the one terminal image in the main text |
| Render gallery | Not evidence; GitHub and video only |

## If applied

- Figure numbering changes: the new order would be 1 hero, 2 convergence, 3 architecture, 4 tile-cost map, 5 optimisation, 6 partitions, 7 speedup, 8 efficiency, 9 weak, 10 scheduler runtime, 11 imbalance, 12 comparison still, 13 screenshot plus correctness wall. Every "Figure N" in the text, `FIGURE_INDEX.md` and `docs/VIDEO_PLAN.md` page references must be updated.
- Captions for presentation renders must say "presentation render, not benchmark evidence".
- The dark showcase graphics use 1920×1080 at print width. Their smallest labels (about 14 px) print at about 6 pt, which is better than the current SVG charts (about 5 pt).
