# Observatory report integration plan

Status: **applied** in the final report visual integration (2026-09-29), combined with [REPORT_VISUAL_UPGRADE_PLAN.md](REPORT_VISUAL_UPGRADE_PLAN.md). The Workload Microscope replaced the old Figure 2 and is now **Figure 4**; the Scheduler Lab compare view replaced the old Figure 10 and is now **Figure 14** (moved to Section 10.2, *Why dynamic scheduling helped*, which it illustrates). The optional Provenance screenshot was not added: Appendix C already gives the chain as text. The figures are produced by `scripts/report_build/make_visual_figures.py` (recording mode, device pixel ratio 2, 1600×1040 and 1320×900 viewports), not with the capture settings below; the compare view draws its timeline labels larger in recording mode so they stay legible in print. Final numbering: [report/FIGURE_INDEX.md](../report/FIGURE_INDEX.md). The text below is the original plan.

## Recommendation

Use **two** Observatory screenshots, each **replacing** an existing figure in place. Figure numbers, cross-references and the page count (33) stay the same, and the report does not grow. A third screenshot is optional and belongs in an appendix only if a page is free.

| # | Observatory view | Replaces | Why it is better | Section |
|---|---|---|---|---|
| 1 | **Workload Microscope**, compute time with the 4-way static partition | **Figure 2** (per-tile cost heatmap from an early pilot run on the *pre-fix* renderer, `assets/imbalanced-tile-heatmap.svg`) | Figure 2 is historical data, shown "only for the spatial pattern". The Observatory view shows the **final formal** tile costs (median of 7 runs, `20260928T102644Z-100e1393`) with each tile's value and the four static ranges. That directly supports the 2.34× partition cap argued in Section 7.2. | 3.2 (scene and geometry representation) |
| 2 | **Scheduler Lab**, *Compare policies* at t = 1.9 s | **Figure 10** (assignment timeline of one adaptive run, block 0) | Figure 10 shows only adaptive. The Observatory view shows static, fixed dynamic and adaptive side by side from the same formal experiment (`20260928T103934Z-edc10839`, median-time block of each policy): rank 1 idle under static, both workers busy under dynamic, batch sizes under adaptive. It makes Figures 8 and 9 visible in one image. | 7.5 (adaptive vs fixed dynamic) |
| 3 (optional) | **Provenance**, evidence chain for "OpenMP 8 reaches 2.97×" | nothing (new appendix figure) | Shows the chain source → binary → experiment → raw → verification → aggregate → plot → report. Useful for the reproducibility appendix, but the same information is already in text form, so it is the first thing to drop. | Appendix (evidence) |

Do **not** add more. The Render Lab, Correctness wall and Performance Lab repeat figures and tables that are already in the report (Figures 1, 4 to 9 and 11; Tables 9 and 12).

## Captions (draft)

Captions must state the classification, just as the Observatory does.

1. *Figure 2. Measured compute time of each of the 144 tiles of the `imbalanced` scene at 256×144, 192 SPP (median of seven sequential runs, formal strong-scaling experiment `20260928T102644Z-100e1393`, logarithmic colour scale; labels in ms). Outlines show the equal-count 4-way static partition; range 3 alone holds 1.67 s of the 3.89 s total, which caps any equal 4-way split at 2.34×. Screenshot of the Helios Observatory Workload Microscope, which reads the tile CSVs directly.*
2. *Figure 10. Static, fixed dynamic and adaptive scheduling of the medium `imbalanced` workload (two rendering ranks, rank 0 coordinating) replayed from formal experiment `20260928T103934Z-edc10839` at t = 1.9 s. Each panel is the median-time run of its policy, shown on a common time axis; the runs are separate executions. Dynamic and adaptive are replayed from the recorded dispatch trace. Screenshot of the Helios Observatory Scheduler Lab.*
3. *(optional) Figure 12. Evidence chain for the OpenMP 8 speedup of 2.97×, from the frozen source to Table 9. Screenshot of the Helios Observatory Provenance view.*

The text that currently introduces Figure 2 ("an early pilot run on the pre-fix renderer … only for the spatial pattern") must change to match. The paragraph citing Figure 10 must say it now shows three policies, not one adaptive run.

## How to produce print-quality images

Full 1920-pixel-wide screenshots scaled to the 16 cm text width make the interface text about 3 pt, which is too small. Capture in **recording mode** (17 px base text) at **1440×900 with a device pixel ratio of 2**, then crop to the panel:

```bash
python scripts/observatory/capture_screenshots.py --out report/assets/observatory --size 1440x900 --scale 2 --query mode=recording --only workload-microscope scheduler-compare provenance
```

This gives 2880×1800 PNGs. Suggested crops, in pixels of those images, checked on test captures on 2026-09-29:

| Image | Crop (left, top, right, bottom) | Contents |
|---|---|---|
| `workload-microscope.png` | (98, 461, 1987, 1771) | tile grid with values, range labels and the colour legend |
| `scheduler-compare.png` | (98, 785, 2784, 1598) | the three policy panels with their timelines and counters |
| `provenance.png` | the chain panel only | claim title, report check and the eight stages |

At 16 cm wide, the crop of the tile grid renders its 13 px labels at about 2 mm. Check this in the PDF before accepting it; if they are too small, crop tighter (the grid alone) or drop the histogram side panel.

Other considerations:
- The Observatory is dark-themed and the report's own figures are light. Two dark tool screenshots are acceptable as "screenshots of the tool". Put each on its own, full text width, and don't place one next to a light SVG.
- Keep the source images next to the report assets (`report/assets/observatory/`), and record the capture command and date in the figure-provenance appendix, as for Figure 11.
- Regenerate the DOCX and PDF with the existing report build (`scripts/report_build/`), then repeat the content-integrity and visual QA steps used for the final report.
