# Report build

Produces `report/HELIOS_FINAL_REPORT.docx` and `report/HELIOS_FINAL_REPORT.pdf` from the content-final Markdown. It only applies layout: every word, number and ID comes from `report/HELIOS_FINAL_REPORT.md`.

Requirements: Windows with Microsoft Word 16, Microsoft Edge, Node.js 22 and Python 3 with Pillow and `pymupdf` (the latter for the check).

Run from the repository root (PowerShell or Git Bash):

```bash
(cd scripts/report_build && npm install)
python scripts/report_build/make_visual_figures.py
python scripts/report_build/rasterise_figures.py report/rendered/figures
node scripts/report_build/build_docx.js report/HELIOS_FINAL_REPORT.md report/rendered/figures report/rendered/draft.docx
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/report_build/finalise_word.ps1 -InDocx report/rendered/draft.docx -OutDocx report/HELIOS_FINAL_REPORT.docx -OutPdf report/HELIOS_FINAL_REPORT.pdf
python scripts/report_build/check_integrity.py report/HELIOS_FINAL_REPORT.md report/HELIOS_FINAL_REPORT.docx report/HELIOS_FINAL_REPORT.pdf
```

- `make_visual_figures.py` writes `report/assets/visual/`: crops of the showcase convergence, architecture and correctness PNGs (Figures 2, 3 and 5; title and footer removed) and headless-Edge screenshots of the Helios Observatory (Figure 4, Workload Microscope; Figure 14, Scheduler Lab) in recording mode at a device pixel ratio of 2. It uses the committed Observatory data.
- `rasterise_figures.py` draws each of the seven SVG figures unchanged at 3× its viewBox size with headless Edge (a throw-away Edge profile). The seven PNG figures are embedded as they are.
- `build_docx.js` applies the layout: A4, Arial with Consolas for code, teal accents, a TOC over heading levels 1 and 2, Word equations for `S_p`, `E_p` and `E_weak`, and a landscape page for Section 9's terminal screenshot (Figure 13). Code and IDs use non-breaking hyphens so they wrap only at spaces; Word exports these as ordinary hyphens in the PDF text.
- `finalise_word.ps1` updates the TOC in Word, keeps TOC entries in Arial, saves the DOCX and exports the PDF from that same document.
- `check_integrity.py` compares headings, captions, tables, figures, references, IDs, SHAs, key values and an order-preserving word diff against the Markdown.

`report/rendered/` is scratch output and is not committed.
