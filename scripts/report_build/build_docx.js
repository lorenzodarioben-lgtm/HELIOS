// Build report/HELIOS_FINAL_REPORT.docx from the content-final Markdown.
// Usage: node build_docx.js <report.md> <png-dir> <out.docx>
// <png-dir> holds PNG rasters of the SVG figures (see rasterise_figures.py); PNG figures are embedded as they are.
// The Markdown is the single source of content; this script only applies layout.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, ImageRun, Header, Footer, PageNumber, TableOfContents,
  LevelFormat, Math: OMath, MathRun, MathFraction, MathSubScript, TabStopType, PageBreak,
  VerticalAlign, PageOrientation, NoBreakHyphen,
} = require("docx");

const [mdPath, pngDir, outPath] = process.argv.slice(2);
const mdDir = path.dirname(path.resolve(mdPath));
const lines = fs.readFileSync(mdPath, "utf8").replace(/\r\n/g, "\n").split("\n");

// ---- design tokens -------------------------------------------------------
const TEAL = "0E6B70", TEAL_LIGHT = "E3F0F0", INK = "1F1F1F", GREY = "5A5A5A", RULE = "9FC7C9";
const CODE_BG = "F2F2F2";
const BODY = 21, SMALL = 18, TABLE = 17, CODE = 17;       // half-points
const CONTENT_DXA = 11906 - 2 * 1134;                       // A4 width minus 2.0 cm margins
const CONTENT_PX = Math.round(CONTENT_DXA / 1440 * 96);     // docx-js image units are 96-dpi px
const ARIAL = { ascii: "Arial", hAnsi: "Arial", cs: "Arial", eastAsia: "Arial" };
const MONO = { ascii: "Consolas", hAnsi: "Consolas", cs: "Consolas", eastAsia: "Consolas" };

// ---- inline markdown -----------------------------------------------------
const MATH_TOKEN = /^(S_p|E_p|E_8|T_1|T_1\(W\)|T_p|S_8 \/ 4|p|W|p = \d+|E_p = 1)$/;

function mathRuns(text, base) {
  // Italic Arial with true subscripts: X_y -> X + subscript y.
  const out = [];
  const re = /([A-Za-z])_([A-Za-z0-9]+)/g;
  let last = 0, m;
  const plain = (s) => {
    for (const part of s.split(/([A-Za-z]+)/)) {
      if (!part) continue;
      out.push(new TextRun({ ...base, text: part, italics: /^[A-Za-z]+$/.test(part) }));
    }
  };
  while ((m = re.exec(text))) {
    plain(text.slice(last, m.index));
    out.push(new TextRun({ ...base, text: m[1], italics: true }));
    out.push(new TextRun({ ...base, text: m[2], italics: true, subScript: true }));
    last = re.lastIndex;
  }
  plain(text.slice(last));
  return out;
}

// Monospace text with non-breaking hyphens, so commands, paths and experiment IDs only wrap
// at spaces. Word exports these as ordinary U+002D hyphens in the PDF text layer.
function mono(text) {
  const kids = [];
  text.split("-").forEach((part, k) => { if (k) kids.push(new NoBreakHyphen()); if (part) kids.push(part); });
  return kids;
}

function inline(text, base = {}) {
  const runs = [];
  let bold = false, ital = false, buf = "";
  const flush = () => {
    if (buf) runs.push(new TextRun({ ...base, text: buf, bold: bold || base.bold, italics: ital || base.italics }));
    buf = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "`") {
      const j = text.indexOf("`", i + 1);
      flush();
      const code = text.slice(i + 1, j);
      const b = { ...base, bold: bold || base.bold };
      if (MATH_TOKEN.test(code)) runs.push(...mathRuns(code, b));
      else runs.push(new TextRun({ ...b, children: mono(code), font: MONO, size: (base.size || BODY) - 2, italics: false, color: "2A2A2A" }));
      i = j;
    } else if (c === "*" && text[i + 1] === "*") { flush(); bold = !bold; i++; }
    else if (c === "*") { flush(); ital = !ital; }
    else buf += c;
  }
  flush();
  return runs;
}

const plainText = (s) => s.replace(/`([^`]*)`/g, "$1").replace(/\*\*?/g, "");

// ---- block builders ------------------------------------------------------
const sectionsSpec = [{ landscape: false, children: [] }];
let children = sectionsSpec[0].children;
function newSection(landscape) { const s = { landscape, children: [] }; sectionsSpec.push(s); children = s.children; }
const para = (text, opts = {}) => new Paragraph({ children: inline(text, opts.run || {}), ...opts.p });

function codeBlock(codeLines) {
  codeLines.forEach((l, k) => children.push(new Paragraph({
    children: [new TextRun({ children: l.length ? mono(l) : [" "], font: MONO, size: CODE, color: "202020" })],
    shading: { type: ShadingType.CLEAR, color: "auto", fill: CODE_BG },
    spacing: { before: k === 0 ? 60 : 0, after: k === codeLines.length - 1 ? 160 : 0, line: 240 },
    indent: { left: 397, hanging: 284, right: 113 },   // wrapped continuation lines are indented
    keepNext: k < codeLines.length - 1, keepLines: true,
    border: k === 0 ? { top: { style: BorderStyle.SINGLE, size: 2, color: "D0D0D0", space: 3 } } : undefined,
  })));
}

function sub(sym, s) { return new MathSubScript({ children: [new MathRun(sym)], subScript: [new MathRun(s)] }); }
function equation(mathChildren, label) {
  // Borderless three-column row: equation centred on the text block, label flush right.
  const side = 2400, mid = CONTENT_DXA - 2 * side;
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const borders = { top: none, bottom: none, left: none, right: none };
  const c = (w, kids, align) => new TableCell({ width: { size: w, type: WidthType.DXA }, borders,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: kids, alignment: align, spacing: { before: 60, after: 60 }, keepNext: true })] });
  children.push(new Table({
    width: { size: CONTENT_DXA, type: WidthType.DXA }, columnWidths: [side, mid, side],
    borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: [new TableRow({ cantSplit: true, children: [
      c(side, [], AlignmentType.LEFT),
      c(mid, [new OMath({ children: mathChildren })], AlignmentType.CENTER),
      c(side, label ? [new TextRun({ text: label, color: GREY, size: SMALL })] : [], AlignmentType.RIGHT)] })],
  }));
}
function equationBlock(codeLines) {
  const joined = codeLines.join("\n");
  if (joined.includes("S_p = T_1 / T_p")) {
    equation([sub("S", "p"), new MathRun("="), new MathFraction({ numerator: [sub("T", "1")], denominator: [sub("T", "p")] })], "(speedup)");
    equation([sub("E", "p"), new MathRun("="), new MathFraction({ numerator: [sub("S", "p")], denominator: [new MathRun("p")] })], "(parallel efficiency)");
    return true;
  }
  if (joined.includes("E_weak(p) = T_1(W) / T_p(p·W)")) {
    equation([sub("E", "weak"), new MathRun("(p)="), new MathFraction({
      numerator: [sub("T", "1"), new MathRun("(W)")], denominator: [sub("T", "p"), new MathRun("(p·W)")] })]);
    return true;
  }
  return false;
}

// Figures: markdown path -> raster used in the DOCX.
const SVG_TO_PNG = {
  "assets/optimisation-ab/optimisation-ab.svg": "optimisation-ab.png",
  "../results/protocol-v2/20260928T102644Z-100e1393/plots/median-runtime.svg": "median-runtime.png",
  "assets/20260928T103934Z-edc10839/speedup.svg": "speedup.png",
  "assets/20260928T103934Z-edc10839/efficiency.svg": "efficiency.png",
  "assets/20260928T103934Z-edc10839/weak-scaling.svg": "weak-scaling.png",
  "assets/20260928T103934Z-edc10839/scheduler-runtime.svg": "scheduler-runtime.png",
  "assets/20260928T103934Z-edc10839/scheduler-imbalance.svg": "scheduler-imbalance.png",
};
// Display width as a fraction of the text width (small native figures are not blown up).
const FIG_WIDTH = { 1: 0.85 };
// The terminal screenshot (2866x748 px) gets a landscape page so its text stays legible in print.
const LANDSCAPE_FIGS = new Set([13]);
const LANDSCAPE_SECTION_HEADING = "## 9. End-to-End Demonstration Evidence";
const LANDSCAPE_CONTENT_PX = Math.round((16838 - 2 * 1134) / 1440 * 96);

function pngSize(buf) { return [buf.readUInt32BE(16), buf.readUInt32BE(20)]; }
function figure(num, mdRef, captionLine) {
  const file = SVG_TO_PNG[mdRef] ? path.join(pngDir, SVG_TO_PNG[mdRef]) : path.resolve(mdDir, mdRef);
  if (!fs.existsSync(file)) throw new Error("missing figure " + file);
  const data = fs.readFileSync(file);
  const [w, h] = pngSize(data);
  const width = Math.round((LANDSCAPE_FIGS.has(num) ? LANDSCAPE_CONTENT_PX : CONTENT_PX) * (FIG_WIDTH[num] || 1));
  children.push(new Paragraph({
    children: [new ImageRun({ type: "png", data, transformation: { width, height: Math.round(width * h / w) },
      altText: { title: `Figure ${num}`, description: plainText(captionLine), name: `Figure ${num}` } })],
    alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 },
  }));
  const cap = captionLine.replace(/^\*/, "").replace(/\*$/, "");
  const m = cap.match(/^(Figure \d+\.)\s*(.*)$/);
  children.push(new Paragraph({
    children: [new TextRun({ text: m[1] + " ", bold: true, color: TEAL, size: SMALL }), ...inline(m[2], { size: SMALL, color: "333333" })],
    spacing: { before: 0, after: 200 }, keepLines: true,
  }));
}

function tableCaption(line) {
  const m = line.match(/^\*\*(Table \d+\.)\s*(.*)\*\*$/);
  children.push(new Paragraph({
    children: [new TextRun({ text: m[1] + " ", bold: true, color: TEAL, size: SMALL + 1 }), ...inline(m[2], { bold: true, size: SMALL + 1, color: INK })],
    keepNext: true, keepLines: true, spacing: { before: 200, after: 80 },
  }));
}

function splitRow(l) { return l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()); }
function table(rows) {
  const header = splitRow(rows[0]);
  const aligns = splitRow(rows[1]).map((s) => (s.endsWith(":") ? AlignmentType.RIGHT : AlignmentType.LEFT));
  const body = rows.slice(2).map(splitRow);
  const n = header.length;
  body.forEach((r) => { if (r.length !== n) throw new Error("ragged table row: " + r.join("|")); });
  // column weights from content length (average and capped maximum)
  const lens = [...Array(n).keys()].map((c) => {
    const all = [header[c], ...body.map((r) => r[c])].map((s) => plainText(s).length);
    const avg = all.reduce((a, b) => a + b, 0) / all.length;
    return Math.max(5, 0.55 * avg + 0.45 * Math.min(Math.max(...all), 48));
  });
  // Minimum width per column: its longest unbreakable unit. Code only wraps at spaces
  // (non-breaking hyphens) and a "value (interval)" cell is kept on one line where possible.
  const unitDxa = (cellText) => {
    const segs = cellText.split("`");
    const plain = plainText(cellText);
    if (/^[+-]?\d[\d.,]*\s*[%s×]?\s*\(/.test(plain) && plain.length <= 34) return plain.length * 92;
    let best = 0;
    segs.forEach((seg, k) => {
      const isCode = k % 2 === 1, per = isCode ? 84 : 92;
      for (const w of seg.replace(/\*/g, "").split(/\s+/)) best = Math.max(best, w.length * per);
    });
    return best;
  };
  let mins = [...Array(n).keys()].map((c) => Math.max(600, ...[header[c], ...body.map((r) => r[c])].map(unitDxa)) + 230);
  const minSum = mins.reduce((a, b) => a + b, 0);
  if (minSum > CONTENT_DXA) mins = mins.map((m) => Math.floor(m * CONTENT_DXA / minSum));
  const spare = CONTENT_DXA - mins.reduce((a, b) => a + b, 0);
  const total = lens.reduce((a, b) => a + b, 0);
  let widths = mins.map((m, c) => m + Math.floor(spare * lens[c] / total));
  widths[n - 1] += CONTENT_DXA - widths.reduce((a, b) => a + b, 0);
  const keepTogether = body.length <= 16;
  const border = { style: BorderStyle.SINGLE, size: 4, color: "BFD6D7" };
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const cell = (text, c, isHead, last) => new TableCell({
    width: { size: widths[c], type: WidthType.DXA },
    shading: isHead ? { type: ShadingType.CLEAR, color: "auto", fill: TEAL_LIGHT } : undefined,
    margins: { top: 45, bottom: 45, left: 85, right: 85 },
    verticalAlign: VerticalAlign.TOP,
    borders: { top: isHead ? { style: BorderStyle.SINGLE, size: 8, color: TEAL } : none,
      bottom: isHead ? { style: BorderStyle.SINGLE, size: 6, color: TEAL } : (last ? { style: BorderStyle.SINGLE, size: 8, color: TEAL } : border),
      left: none, right: none },
    children: [new Paragraph({
      children: inline(text, { size: TABLE, bold: isHead, color: isHead ? "10393B" : INK }),
      alignment: isHead ? aligns[c] : aligns[c], spacing: { before: 0, after: 0, line: 240 },
      keepNext: keepTogether && !last, keepLines: true,
    })],
  });
  children.push(new Table({
    width: { size: CONTENT_DXA, type: WidthType.DXA }, columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: header.map((h, c) => cell(h, c, true, false)) }),
      ...body.map((r, i) => new TableRow({ cantSplit: true, children: r.map((t, c) => cell(t, c, false, i === body.length - 1)) })),
    ],
  }));
  children.push(new Paragraph({ children: [], spacing: { before: 0, after: 120 } }));
}

// ---- title block ---------------------------------------------------------
function titleBlock(metaLine) {
  const t = (text, size, opts = {}) => new Paragraph({ children: [new TextRun({ text, size, ...opts.run })], spacing: { before: 0, after: opts.after ?? 40 }, ...opts.p });
  children.push(t("Helios", 48, { run: { bold: true, color: TEAL }, after: 0 }));
  children.push(t("Adaptive Hybrid Distributed Path Tracing Engine", 30, { run: { color: INK }, after: 160 }));
  children.push(t("SIT315 Concurrent Programming", 22, { run: { bold: true, color: INK }, after: 20 }));
  children.push(t("Task M4.T1D: final project report", 22, { run: { color: INK }, after: 20 }));
  children.push(t("Lorenzo Dario Ben", 22, { run: { color: INK }, after: 160 }));
  children.push(new Paragraph({ children: inline(metaLine, { size: SMALL, color: GREY }),
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: TEAL, space: 6 } }, spacing: { before: 0, after: 240 } }));
  children.push(new Paragraph({ children: [new TextRun({ text: "Contents", bold: true, size: 26, color: TEAL })], spacing: { before: 120, after: 80 } }));
  children.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }));
  children.push(new Paragraph({ children: [new PageBreak()] }));
}

// ---- main parse ----------------------------------------------------------
let i = 0, listKind = null;
const figuresSeen = [], tablesSeen = [];
while (i < lines.length) {
  const l = lines[i];
  if (i === 0 && l.startsWith("# ")) {                    // title + unit line + metadata line
    const meta = lines.slice(1).find((x, k) => k > 1 && x.trim()); // first paragraph after the bold unit line
    titleBlock(meta); i = lines.indexOf(meta) + 1; continue;
  }
  if (!l.trim() || /^---\s*$/.test(l)) { i++; continue; }
  if (l.startsWith("```")) {
    const block = []; i++;
    while (!lines[i].startsWith("```")) block.push(lines[i++]);
    i++;
    if (!equationBlock(block)) codeBlock(block);
    continue;
  }
  if (l.startsWith("## ") && sectionsSpec[sectionsSpec.length - 1].landscape) newSection(false);
  if (l.startsWith(LANDSCAPE_SECTION_HEADING)) newSection(true);
  if (l.startsWith("## ")) {
    children.push(new Paragraph({ text: l.slice(3), heading: HeadingLevel.HEADING_1 })); i++; continue;
  }
  if (l.startsWith("### ")) {
    children.push(new Paragraph({ text: l.slice(4), heading: HeadingLevel.HEADING_2 })); i++; continue;
  }
  let m;
  if ((m = l.match(/^!\[(Figure (\d+)\.[^\]]*)\]\(([^)]+)\)$/))) {
    let j = i + 1; while (!lines[j].trim()) j++;
    figure(+m[2], m[3], lines[j]); figuresSeen.push(+m[2]); i = j + 1; continue;
  }
  if (/^\*\*Table \d+\./.test(l)) {
    tablesSeen.push(+l.match(/Table (\d+)/)[1]); tableCaption(l); i++; continue;
  }
  if (l.startsWith("|")) {
    const rows = []; while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
    table(rows); continue;
  }
  if ((m = l.match(/^- (.*)$/))) {
    children.push(new Paragraph({ children: inline(m[1]), numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 } }));
    i++; continue;
  }
  if ((m = l.match(/^(\d+)\. (.*)$/))) {
    children.push(new Paragraph({ children: inline(m[2]), numbering: { reference: "contrib", level: 0 }, spacing: { after: 60 } }));
    i++; continue;
  }
  if ((m = l.match(/^\[(\d+)\] (.*)$/))) {
    children.push(new Paragraph({ children: [new TextRun({ text: `[${m[1]}]\t`, size: 19 }), ...inline(m[2], { size: 19 })],
      indent: { left: 567, hanging: 567 }, tabStops: [{ type: TabStopType.LEFT, position: 567 }], spacing: { after: 100 }, keepLines: true }));
    i++; continue;
  }
  if (/^\*[^*].*\*$/.test(l) && !/^\*Figure/.test(l)) { children.push(para(l)); i++; continue; }
  // A lead-in paragraph ("...weak efficiency is", "This runs, on this host:") stays with the block it introduces.
  let k = i + 1; while (k < lines.length && !lines[k].trim()) k++;
  const leadsIn = k < lines.length && /^(```|\|)/.test(lines[k]) && /(:|,| is)$/.test(l.trim());
  children.push(para(l, { p: { keepNext: leadsIn } })); i++;
}

// ---- document ------------------------------------------------------------
const doc = new Document({
  creator: "Lorenzo Dario Ben", title: "Helios: Adaptive Hybrid Distributed Path Tracing Engine",
  description: "SIT315 Task M4.T1D final project report",
  features: { updateFields: true },
  styles: {
    default: {
      document: { run: { font: ARIAL, size: BODY, color: INK }, paragraph: { spacing: { after: 120, line: 264 } } },
      heading1: { run: { font: ARIAL, size: 30, bold: true, color: TEAL },
        paragraph: { spacing: { before: 360, after: 120 }, keepNext: true, keepLines: true,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 3 } } } },
      heading2: { run: { font: ARIAL, size: 24, bold: true, color: "1C4F53" },
        paragraph: { spacing: { before: 240, after: 80 }, keepNext: true, keepLines: true } },
    },
    paragraphStyles: [
      { id: "TOC1", name: "toc 1", basedOn: "Normal", next: "Normal", run: { font: ARIAL, bold: true, size: 20 },
        paragraph: { spacing: { before: 80, after: 0 }, tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_DXA, leader: "dot" }] } },
      { id: "TOC2", name: "toc 2", basedOn: "Normal", next: "Normal", run: { font: ARIAL, size: 18 },
        paragraph: { spacing: { before: 0, after: 0 }, indent: { left: 340 }, tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_DXA, leader: "dot" }] } },
    ],
  },
  numbering: { config: [
    { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 454, hanging: 284 } }, run: { color: TEAL } } }] },
    { reference: "contrib", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 454, hanging: 340 } } } }] },
  ] },
  sections: sectionsSpec.map((s, k) => ({
    properties: {
      titlePage: k === 0,
      page: { size: { width: 11906, height: 16838, orientation: s.landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
        margin: { top: 1247, bottom: 1134, left: 1134, right: 1134, header: 567, footer: 510 } },
    },
    headers: {
      first: new Header({ children: [new Paragraph({ children: [] })] }),
      default: new Header({ children: [new Paragraph({
        children: [new TextRun({ text: "Helios", bold: true, color: TEAL, size: 16 }), new TextRun({ text: "  |  SIT315 M4.T1D", color: GREY, size: 16 })],
        alignment: AlignmentType.RIGHT, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 2 } }, spacing: { after: 0 } })] }),
    },
    footers: {
      first: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 17, color: GREY })] })] }),
      default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 17, color: GREY })] })] }),
    },
    children: s.children,
  })),
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log(JSON.stringify({ out: outPath, figures: figuresSeen, tables: tablesSeen }));
});
