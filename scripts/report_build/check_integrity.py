"""Mechanically compare the formatted report (DOCX, and optionally PDF) with the Markdown source.

Usage: python check_integrity.py <report.md> <report.docx> [<report.pdf>]
Checks heading, table, figure and reference counts, every experiment ID, commit SHA and key
benchmark value, and an order-preserving word diff of the whole text. Exit code 1 on failure.
"""
import difflib
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
M = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
KEY_VALUES = ["3.933 s", "2.041 s", "1.323 s", "2.020 s", "1.603 s", "2.057 s", "2.035 s", "600.34 s",
              "1.6153 s", "57881d257daf2474", "e2c13e2204ca28aecb90d2d33703587bd16027a1"]
EQUATION_LINES = re.compile(r"^(S_p = T_1 / T_p .*|E_p = S_p / p .*|E_weak\(p\) = .*)$", re.M)


def docx_paragraphs(path):
    """(style id, text, contains an equation) for every paragraph in body order, tables included."""
    root = ET.fromstring(zipfile.ZipFile(path).read("word/document.xml"))
    out = []
    for p in root.iter(W + "p"):
        style = p.find(f"{W}pPr/{W}pStyle")
        parts = []
        for el in p.iter():
            if el.tag in (W + "t", M + "t"):
                parts.append(el.text or "")
            elif el.tag == W + "noBreakHyphen":
                parts.append("-")
            elif el.tag == W + "tab" and el.get(W + "val") is None:   # a run tab, not a tab-stop definition
                parts.append(" ")
        has_math = any(True for _ in p.iter(M + "oMath"))
        out.append((style.get(W + "val") if style is not None else "", "".join(parts).replace("\t", " "), has_math))
    return out, root


def norm_words(s):
    s = s.replace(" ", " ").replace("‑", "-").replace("`", "").replace("*", "")
    s = re.sub(r"\b([A-Z])_([a-z0-9]+)\b", r"\1\2", s)   # Markdown S_p is S + subscript p in Word
    return re.findall(r"[^\s|]+", s)


def main():
    md_path, docx_path = sys.argv[1], sys.argv[2]
    pdf_path = sys.argv[3] if len(sys.argv) > 3 else None
    md = open(md_path, encoding="utf-8").read().replace("\r\n", "\n")
    paras, root = docx_paragraphs(docx_path)
    docx_text = "\n".join(t for _, t, _ in paras)
    failures = []

    def check(name, ok, detail=""):
        print(f"{'PASS' if ok else 'FAIL'}  {name}{('  ' + detail) if detail else ''}")
        if not ok:
            failures.append(name)

    # Structure
    md_h2 = re.findall(r"^## (.+)$", md, re.M)
    md_h3 = re.findall(r"^### (.+)$", md, re.M)
    dx_h1 = [t for s, t, _ in paras if s == "Heading1"]
    dx_h2 = [t for s, t, _ in paras if s == "Heading2"]
    check("level-1 headings identical and in order", md_h2 == dx_h1, f"{len(md_h2)} vs {len(dx_h1)}")
    check("level-2 headings identical and in order", md_h3 == dx_h2, f"{len(md_h3)} vs {len(dx_h2)}")
    md_tables = re.findall(r"^\*\*Table (\d+)\.", md, re.M)
    dx_tables = re.findall(r"^Table (\d+)\. ", docx_text, re.M)
    check("table captions 1..14 in order", md_tables == dx_tables == [str(i) for i in range(1, 15)], str(len(dx_tables)))
    md_pipe_tables = len(re.findall(r"^\|.*\n\|[-:| ]+\|$", md, re.M))
    data_tables = [t for t in root.iter(W + "tbl") if not any(True for _ in t.iter(M + "oMath"))]
    check(f"all {md_pipe_tables} Markdown tables are Word tables (14 captioned, 2 uncaptioned)",
          len(data_tables) == md_pipe_tables, str(len(data_tables)))
    md_figs = re.findall(r"^!\[Figure (\d+)\.", md, re.M)
    dx_figs = re.findall(r"^Figure (\d+)\. ", docx_text, re.M)
    n_figs = len(md_figs)
    blips = len(list(root.iter(A + "blip")))
    check(f"figure captions 1..{n_figs} in order, none skipped or repeated",
          md_figs == dx_figs == [str(i) for i in range(1, n_figs + 1)], str(len(dx_figs)))
    md_caps = re.findall(r"^\*Figure (\d+)\.", md, re.M)
    check("every figure has a caption with its own number", md_caps == md_figs, str(md_caps))
    check(f"{n_figs} embedded images", blips == n_figs, str(blips))
    md_refs = re.findall(r"^\[(\d+)\] ", md, re.M)
    dx_refs = re.findall(r"^\[(\d+)\] ", docx_text, re.M)
    check("references [1]..[17] in order", md_refs == dx_refs == [str(i) for i in range(1, 18)], str(len(dx_refs)))
    eqs = sum(1 for _ in root.iter(M + "oMath"))
    check("3 equations rendered as Word equations", eqs == 3, str(eqs))

    # Every "Figure N" / "Table N" mention points at an existing caption
    mentions_f = {int(n) for n in re.findall(r"Figures? (\d+)", docx_text)}
    mentions_t = {int(n) for n in re.findall(r"Tables? (\d+)", docx_text)}
    check("all figure mentions resolve", mentions_f <= set(range(1, n_figs + 1)), str(sorted(mentions_f)))
    body_only = re.sub(r"^\*Figure \d+\..*$", "", re.sub(r"^!\[Figure.*$", "", md, flags=re.M), flags=re.M)
    cited = {int(n) for n in re.findall(r"Figures? (\d+)", body_only)}
    for m in re.finditer(r"Figures? (\d+(?:, \d+)*)(?:,? (?:and|to) (\d+))?", body_only):
        nums = [int(x) for x in m.group(1).split(", ")] + ([int(m.group(2))] if m.group(2) else [])
        cited |= set(range(nums[0], nums[-1] + 1)) if " to " in m.group(0) else set(nums)
    check("every figure is cited in the text outside its own caption", cited >= set(range(1, n_figs + 1)),
          str(sorted(set(range(1, n_figs + 1)) - cited)))
    check("all table mentions resolve", mentions_t <= set(range(1, 15)), str(sorted(mentions_t)))

    # Identifiers and key values
    ids = sorted(set(re.findall(r"2026\d{4}T\d{6}Z-[0-9a-f]{8}", md)))
    missing = [i for i in ids if i not in docx_text]
    check(f"all {len(ids)} experiment IDs present", not missing, ", ".join(missing))
    shas = sorted(set(re.findall(r"`([0-9a-f]{7,40})`", md)))
    missing = [s for s in shas if s not in docx_text]
    check(f"all {len(shas)} SHAs/hashes present", not missing, ", ".join(missing))
    missing = [v for v in KEY_VALUES if v not in docx_text]
    check("key benchmark values present", not missing, ", ".join(missing))
    check("no em or en dashes", not re.search("[–—]", docx_text))
    check("no literal Markdown markers", not re.search(r"\*\*|`|^#{1,3} |!\[", docx_text, re.M))

    # Order-preserving word diff of the body. The H1 and unit line are the title block;
    # fence markers, table separator rows and Markdown list/heading markers are syntax.
    md_body = md.split("\n", 4)[4]
    md_body = re.sub(r"^!\[[^\]]*\]\([^)]*\)$", "", md_body, flags=re.M)
    md_body = re.sub(r"^\|[-:| ]+\|$", "", md_body, flags=re.M)
    md_body = re.sub(r"^---$", "", md_body, flags=re.M)
    md_body = re.sub(r"^```\w*$", "", md_body, flags=re.M)
    md_body = EQUATION_LINES.sub("", md_body)
    md_body = re.sub(r"^\d+\. (?=[A-Z])", "", md_body, flags=re.M)   # numbered list items (Word numbering)
    md_body = re.sub(r"^#{2,3} ", "", md_body, flags=re.M)
    md_body = re.sub(r"^- ", "", md_body, flags=re.M)
    a = norm_words(md_body)
    body = "\n".join(t for s, t, m in paras if not m and not s.upper().startswith("TOC"))
    body = body[body.index("Final performance source"):].replace("\nContents\n", "\n", 1)
    b = norm_words(body)
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    diffs = [(op, " ".join(a[i1:i2]), " ".join(b[j1:j2])) for op, i1, i2, j1, j2 in sm.get_opcodes() if op != "equal"]
    print(f"INFO  word diff: {len(a)} markdown words, {len(b)} docx words, {len(diffs)} differing spans")
    for op, x, y in diffs:
        print(f"      {op}: md[{x[:120]}] docx[{y[:120]}]")

    if pdf_path:
        import pymupdf
        doc = pymupdf.open(pdf_path)
        pdf_text = "\n".join(p.get_text() for p in doc)
        flat = re.sub(r"\s+", " ", pdf_text)
        missing = [v for v in KEY_VALUES + ids if v not in flat]
        check(f"PDF: key values and all IDs extractable ({doc.page_count} pages)", not missing, ", ".join(missing[:5]))
        fonts = sorted({f[3].split("+")[-1] for p in doc for f in p.get_fonts()})
        allowed = {"ArialMT", "Arial-BoldMT", "Arial-ItalicMT", "Arial-BoldItalicMT", "Consolas", "Consolas-Bold", "CambriaMath"}
        check("PDF fonts: Arial, Consolas, Cambria Math (equations only)", set(fonts) <= allowed, str(fonts))
        check("PDF: no em or en dashes", not re.search("[–—]", pdf_text))
        check("PDF: no U+2011 in text layer", "‑" not in pdf_text)

    print("RESULT", ("FAIL " + ", ".join(failures)) if failures else "PASS")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
