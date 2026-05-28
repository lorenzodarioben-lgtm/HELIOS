"""Evidence-driven showcase graphics. Every number is read from saved Helios evidence at run time.

  python evidence_graphics.py [tilecost|correctness|optimisation|story|dashboard|stress|all]
"""
import json
import math
import sys
from pathlib import Path

from PIL import Image

import evidence_data as E
import style as S
from common import ROOT, SHOWCASE, WORK, read_ppm

OUT = SHOWCASE
GALLERY = SHOWCASE / "gallery"


def pct(v, digits=2):
    return f"{v * 100:+.{digits}f}%"


def cost_colour(v, lo, hi):
    """Log-scale sequential ramp: deep navy -> teal -> amber -> warm white."""
    stops = [(0.0, (16, 30, 46)), (0.35, (27, 92, 116)), (0.62, (52, 197, 208)), (0.85, (242, 184, 75)), (1.0, (255, 240, 205))]
    f = (math.log(v) - math.log(lo)) / (math.log(hi) - math.log(lo))
    f = min(max(f, 0), 1)
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if f <= b:
            return S.mix(ca, cb, (f - a) / (b - a))
    return stops[-1][1]


def luminance(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


# --------------------------------------------------------------------------------------------- tile cost
def cost_grid(c, costs, x, y, tile, lo, hi, labels=True, size=15):
    for i, v in enumerate(costs):
        col, row = i % 16, i // 16
        x0, y0 = x + col * tile + 1.5, y + row * tile + 1.5
        fill = cost_colour(v, lo, hi)
        c.rect(x0, y0, x0 + tile - 3, y0 + tile - 3, fill=fill)
        if labels:
            fg = (12, 18, 26) if luminance(fill) > 120 else S.TEXT
            c.text(x0 + (tile - 3) / 2, y0 + (tile - 3) / 2, f"{v * 1000:.1f}", size, "mono", fg, anchor="mm")


def colour_bar(c, x, y, w, lo, hi, title="measured tile compute time (ms, log scale)"):
    steps = 240
    for k in range(steps):
        v = math.exp(math.log(lo) + (math.log(hi) - math.log(lo)) * k / (steps - 1))
        c.rect(x + w * k / steps, y, x + w * (k + 1) / steps + 0.5, y + 16, fill=cost_colour(v, lo, hi))
    for ms in (2.5, 5, 10, 20, 40, 80):
        v = ms / 1000
        if lo <= v <= hi * 1.001:
            xx = x + w * (math.log(v) - math.log(lo)) / (math.log(hi) - math.log(lo))
            c.line([(xx, y + 16), (xx, y + 22)], fill=S.TEXT_2, width=1)
            c.text(xx, y + 26, f"{ms:g}", 14, "mono", S.TEXT_2, anchor="ma")
    c.text(x, y - 10, title, 15, "regular", S.TEXT_2, anchor="ls")


def tile_cost_map():
    costs = E.tile_costs()
    lo, hi = min(costs), max(costs)
    total = sum(costs)
    order = sorted(costs, reverse=True)
    top_share = sum(order[:36]) / total
    c = S.Canvas()
    c.header("Measured workload   ·   formal experiment " + E.STRONG,
             "Where the work is: the measured cost of every tile",
             "imbalanced scene · medium workload (256×144, 192 SPP, depth 8) · sequential renderer · "
             "median of the 7 measured runs · frozen source e2c13e2")
    tile = 66
    gx, gy = 72, 206
    cost_grid(c, costs, gx, gy, tile, lo, hi)
    colour_bar(c, gx, gy + 9 * tile + 54, 16 * tile, lo, hi)
    rx, rw = 1178, 670
    c.panel(rx, gy, rx + rw, gy + 9 * tile + 100)
    g = GALLERY / "imbalanced-hero.png"
    if g.exists():
        im = Image.open(g).convert("RGB")
        tw = rw - 48
        c.paste(im, rx + 24, gy + 24, w=tw, radius=8)
        th = tw * 9 / 16
        for k in range(1, 16):
            c.line([(rx + 24 + tw * k / 16, gy + 24), (rx + 24 + tw * k / 16, gy + 24 + th)], fill=(255, 255, 255, 60), width=1)
        for k in range(1, 9):
            c.line([(rx + 24, gy + 24 + th * k / 9), (rx + 24 + tw, gy + 24 + th * k / 9)], fill=(255, 255, 255, 60), width=1)
        c.text(rx + 24, gy + 24 + th + 12, "The same scene and camera with the 16×9 tile grid (presentation render). "
               "The dense sphere grid sits in one band.", 14, "regular", S.MUTED)
        yy = gy + 24 + th + 62
    else:
        yy = gy + 30
    facts = [(f"{hi / lo:.0f}×", f"spread: most expensive tile {hi * 1000:.1f} ms, cheapest {lo * 1000:.1f} ms"),
             (f"{top_share * 100:.0f}%", "of all work is in the most expensive quarter of the tiles"),
             (f"{total:.3f} s", "total sequential tile compute per image")]
    for big, small in facts:
        c.text(rx + 24, yy, big, 40, "semibold", S.AMBER if big.endswith("×") else S.TEXT)
        c.wrap(rx + 200, yy + 6, small, rw - 230, 18, "regular", S.TEXT_2)
        yy += 70
    c.footer(f"results/protocol-v2/{E.STRONG}/raw/imbalanced-medium-sequential-r1-t1-all-b{{0..6}}.tiles.csv (compute_seconds)",
             note="Values in each tile are milliseconds. Cost comes from geometry: rays that reach the dense sphere grid do far more BVH and intersection work.")
    c.save(OUT / "scheduler" / "tile-cost-map.png")
    return {"total_s": total, "min_ms": lo * 1000, "max_ms": hi * 1000, "spread": hi / lo, "top_quarter_share": top_share}


def tile_cost_partitions():
    costs = E.tile_costs()
    lo, hi = min(costs), max(costs)
    total = sum(costs)
    c = S.Canvas()
    c.header("Why static partitions cap the speedup   ·   formal experiment " + E.STRONG,
             "Equal tile counts, unequal work",
             "OpenMP static, static MPI and hybrid static all split the tile IDs into equal-count contiguous ranges. "
             "The busiest range sets the time.")
    tile = 38
    blocks = [(2, 72, 212), (4, 72, 212 + 9 * tile + 60)]
    part_cols = [S.WORKER[1], S.WORKER[2], S.WORKER[3], S.WORKER[4]]
    results = {}
    for parts, gx, gy in blocks:
        cost_grid(c, costs, gx, gy, tile, lo, hi, labels=False)
        segs = E.partitions(costs, parts)
        for r, (a, b, s) in enumerate(segs):
            col = part_cols[r]
            for i in range(a, b):
                cc, rr = i % 16, i // 16
                x0, y0 = gx + cc * tile, gy + rr * tile
                if i - 16 < a:     # top edge
                    c.line([(x0, y0), (x0 + tile, y0)], fill=col, width=3)
                if i + 16 >= b:    # bottom edge
                    c.line([(x0, y0 + tile), (x0 + tile, y0 + tile)], fill=col, width=3)
                if i == a or cc == 0:
                    c.line([(x0, y0), (x0, y0 + tile)], fill=col, width=3)
                if i == b - 1 or cc == 15:
                    c.line([(x0 + tile, y0), (x0 + tile, y0 + tile)], fill=col, width=3)
        # bar chart of range sums
        bx, bw = 72 + 16 * tile + 60, 1848 - (72 + 16 * tile + 60)
        c.text(bx, gy + 8, f"{parts} workers: work per range", 22, "semibold")
        worst = max(s for _, _, s in segs)
        for r, (a, b, s) in enumerate(segs):
            ry = gy + 50 + r * (40 if parts == 4 else 56)
            bh = 28 if parts == 4 else 38
            c.text(bx, ry + bh / 2, f"tiles {a} to {b - 1}", 16, "mono", S.TEXT_2, anchor="lm")
            x0 = bx + 190
            full = bw - 190 - 110
            c.rect(x0, ry, x0 + full * s / total, ry + bh, fill=part_cols[r] + (235,), radius=4)
            c.text(x0 + full * s / total + 10, ry + bh / 2, f"{s:.3f} s", 16, "mono",
                   S.AMBER if s == worst else S.TEXT, anchor="lm")
        cap = total / worst
        results[parts] = {"ranges": [(a, b - 1, s) for a, b, s in segs], "cap": cap}
        yy = gy + 50 + (parts * 40 if parts == 4 else 2 * 56) + 16
        c.text(bx, yy, f"Speedup cap = {total:.3f} s ÷ {worst:.3f} s = {cap:.2f}×", 22, "semibold", S.AMBER)
        c.text(bx, yy + 34, "even with perfectly efficient workers", 16, "regular", S.TEXT_2)
    c.footer(f"results/protocol-v2/{E.STRONG}/raw/imbalanced-medium-sequential-r1-t1-all-b{{0..6}}.tiles.csv  ·  report Section 7.2",
             note="Tile colour = measured cost (log scale, as in the tile-cost map). Outlines show which tiles each static worker owns.")
    c.save(OUT / "scheduler" / "tile-cost-static-partitions.png")
    return results


# --------------------------------------------------------------------------------------------- correctness
def correctness_wall(size=(1920, 1080), out=None, reveal=1.0):
    data = json.loads((SHOWCASE / "correctness" / "backend-correctness.json").read_text())
    rows = data["backends"]
    ppms = [ROOT / r["output_path"] for r in rows]
    identical = len({read_ppm(p)[2] for p in ppms}) == 1 if all(p.exists() for p in ppms) else None
    cfg = data["configuration"]
    c = S.Canvas(*size)
    c.header("Deterministic correctness   ·   presentation renders with the frozen binaries",
             "One image, seven execution backends",
             f"{cfg['scene']} scene · {cfg['width']}×{cfg['height']} · {cfg['spp']} SPP · depth {cfg['depth']} · seed {cfg['seed']} "
             "(the same configuration as the report's end-to-end run)")
    cw, ch = 402, 226
    positions = [(72 + i * (cw + 46), 206) for i in range(4)] + [(72 + (cw + 46) * 0.5 + i * (cw + 46), 560) for i in range(3)]
    hub = (960, 948)
    n_show = max(0, min(len(rows), int(round(reveal * len(rows) * 1.0001))))
    for k, (r, (x, y)) in enumerate(zip(rows, positions)):
        if k >= n_show:
            continue
        thumb = Image.open(ROOT / r["thumbnail"]).convert("RGB")
        c.panel(x - 10, y - 10, x + cw + 10, y + ch + 92, radius=14)
        c.paste(thumb, x, y, w=cw, h=ch, radius=8)
        c.text(x + 4, y + ch + 14, r["label"], 21, "semibold")
        th = f"{r['threads_per_rank']} thread" + ("s" if r["threads_per_rank"] > 1 else "")
        cfgs = f"{r['mpi_ranks']} ranks × {th}" if r["mpi_ranks"] > 1 else th
        c.text(x + cw - 4, y + ch + 17, cfgs, 15, "regular", S.TEXT_2, anchor="ra")
        c.rect(x + 4, y + ch + 48, x + cw - 4, y + ch + 76, fill=(12, 42, 46), radius=6)
        c.text(x + cw / 2, y + ch + 62, r["hash"], 18, "mono", S.ACCENT, anchor="mm")
        c.line([(x + cw / 2, y + ch + 82), hub], fill=S.ACCENT + (70,), width=1.5)
    if n_show == len(rows):
        hw = 900
        c.rect(hub[0] - hw / 2, hub[1] - 44, hub[0] + hw / 2, hub[1] + 44, fill=(10, 36, 40), outline=S.ACCENT, width=2, radius=14)
        c.text(hub[0], hub[1] - 16, "IDENTICAL DETERMINISTIC OUTPUT", 26, "semibold", S.TEXT, anchor="mm", spacing=2)
        detail = (f"7 of 7 backends · FNV-1a {rows[0]['hash']} · recomputed independently"
                  + (" · byte-identical pixels" if identical else ""))
        c.text(hub[0], hub[1] + 20, detail, 17, "mono", S.ACCENT, anchor="mm")
    c.footer("assets/showcase/correctness/backend-correctness.json  ·  scripts/visual_showcase/render_presentation.py correctness",
             note="Presentation renders, not benchmarks. The same equality is enforced on every formal run (458 of 458 images re-verified).")
    img = c.finish()
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        img.save(out, optimize=True)
    return img, identical


# --------------------------------------------------------------------------------------------- optimisation
AB_GROUPS = [("sequential", "Sequential"), ("openmp-4", "OpenMP 4"), ("mpi-static-4", "MPI static 4"),
             ("hybrid-static-1x4", "Hybrid 1×4"), ("hybrid-static-2x2", "Hybrid 2×2")]
AB_BUILDS = [("prefix", "pre-fix", S.BUILD["prefix"]), ("counter-only", "counter fix", S.BUILD["counter"]),
             ("fixed", "both fixes", S.BUILD["both"])]


def optimisation_before_after(size=(1920, 1080), out=None, reveal=1.0):
    g = E.ab()["groups"]
    c = S.Canvas(*size)
    c.header("Performance engineering   ·   diagnostic A/B 20260928T101701Z-0de80589",
             "Two fixes, two different signatures",
             "Same randomised session, 7 paired blocks per build, all 121 runs pixel- and counter-identical. "
             "Medium imbalanced workload. Bars are median render time.")
    x0, lw, bar_h, gy = 72, 230, 26, 214
    scale_max = max(g[k][b]["median_seconds"] for k, _ in AB_GROUPS for b, _, _ in AB_BUILDS)
    pw = 1080
    for i, (k, label) in enumerate(AB_GROUPS):
        y = gy + i * 146
        c.text(x0, y + 44, label, 24, "semibold", anchor="lm")
        for j, (b, blabel, col) in enumerate(AB_BUILDS):
            v = g[k][b]["median_seconds"]
            yy = y + j * (bar_h + 8)
            frac = min(1.0, reveal * 3 - j) if reveal < 1 else 1.0
            if frac <= 0:
                continue
            w = pw * v / scale_max * frac
            c.rect(x0 + lw, yy, x0 + lw + w, yy + bar_h, fill=col, radius=4)
            c.text(x0 + lw + w + 10, yy + bar_h / 2, f"{v:.3f} s", 16, "mono", S.TEXT_2, anchor="lm")
            if b != "prefix" and frac >= 1:
                ch = g[k][b]["median_relative_change"]
                lo_, hi_ = g[k][b]["relative_ci95"]
                resolved = not (lo_ <= 0 <= hi_)
                txt = f"{pct(ch, 1)}  ({g[k][b]['blocks_faster_than_prefix']}/7 faster)" if resolved else f"{pct(ch, 1)}  no change resolved"
                c.text(x0 + lw + pw + 130, yy + bar_h / 2, txt, 16, "mono",
                       (S.GOOD if ch < 0 else S.CORAL) if resolved else S.MUTED, anchor="lm")
        c.line([(x0, y + 124), (1848, y + 124)], fill=S.PANEL_EDGE, width=1)
    lx = x0 + lw + pw + 130
    c.text(lx, gy - 22, "paired change vs pre-fix (95% interval)", 15, "regular", S.MUTED)
    ky = 952
    for j, (b, blabel, col) in enumerate(AB_BUILDS):
        kx = x0 + j * 260
        c.rect(kx, ky, kx + 26, ky + 18, fill=col, radius=3)
        c.text(kx + 36, ky + 9, blabel, 18, "regular", S.TEXT, anchor="lm")
    c.text(900, ky - 6, "Counter fix: only the two hybrid rows move.", 18, "semibold", S.WORKER[2])
    c.text(900, ky + 20, "Traversal fix: every row, sequential included, drops by about 45% or more.", 18, "semibold", S.ACCENT)
    c.footer("results/diagnostic/counter-fix/20260928T101701Z-0de80589/summary.json  (diagnostic, not formal)",
             note="pre-fix = 6270d44 · counter fix = dca8628 (thread-private counters) · both fixes = e2c13e2 (fixed-size BVH traversal stack)")
    img = c.finish()
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        img.save(out, optimize=True)
    return img


# --------------------------------------------------------------------------------------------- storyboard
def story_steps():
    hist = E.strong_hist()
    hp = {(p["candidate"], p["reference"]): p for p in E.strong_paired(historical=True)}
    fp = {(p["candidate"], p["reference"]): p for p in E.strong_paired()}
    fs = E.strong()
    g = E.ab()["groups"]
    stats = E.seq_stats()
    h22 = hist[("hybrid-static", 2, 2)]["median_seconds"]
    ho4 = hist[("openmp", 1, 4)]["median_seconds"]
    p_hist = hp[("hybrid-static 2x2", "openmp 1x4")]
    p_fin = fp[("hybrid-static 2x2", "openmp 1x4")]
    return [
        ("HISTORICAL", "Initial hybrid anomaly",
         [f"Hybrid 2×2 {h22:.3f} s vs OpenMP 4 {ho4:.3f} s",
          f"paired {pct(p_hist['median_relative_change'])}, slower in {7 - p_hist['candidate_faster_blocks']}/7 blocks",
          f"pre-fix formal run {E.STRONG_HIST}"], None),
        ("DIAGNOSTIC", "Decomposition and affinity ruled out",
         ["Ideal 2×2 partition time no worse than 4×1", "MPI send time about 1 ms", "Ranks were unbound (CPU Sets observer)",
          "But 2 threads inside a tile ran barely faster than 1"], None),
        ("DIAGNOSTIC", "Counter false sharing found",
         ["48-byte per-thread counters shared 64-byte lines", "Address probe: light rank 1.126 s at offset 16,",
          "1.47 to 1.52 s at offset 48 (report Section 5.3)"],
         ("std::vector<Counters> local(threads);", "Counters stats;  // per thread\n#pragma omp critical  // merge once")),
        ("DIAGNOSTIC", "Counter fix is only part of it",
         [f"Sequential {pct(g['sequential']['counter-only']['median_relative_change'])} (no change resolved)",
          f"Hybrid 1×4 {pct(g['hybrid-static-1x4']['counter-only']['median_relative_change'])}, "
          f"2×2 {pct(g['hybrid-static-2x2']['counter-only']['median_relative_change'])}",
          "A padded variant had overstated the effect"], None),
        ("DIAGNOSTIC", "BVH traversal heap allocation",
         ["Scene::hit built a std::vector stack per query", f"{stats['rays'] / 1e6:.1f} M queries per image (medium workload)",
          "at least one heap allocation each"],
         ("std::vector<int> stack{0};  // heap", "int stack[max_traversal_stack];")),
        ("DIAGNOSTIC", "Fixed-size stack: broad speedup",
         [f"Sequential {pct(g['sequential']['fixed']['median_relative_change'])}, "
          f"OpenMP 4 {pct(g['openmp-4']['fixed']['median_relative_change'])}",
          f"MPI 4 {pct(g['mpi-static-4']['fixed']['median_relative_change'])}, "
          f"hybrid 2×2 {pct(g['hybrid-static-2x2']['fixed']['median_relative_change'])}",
          "a serial cost, not a parallel one"], None),
        ("FINAL", "Source frozen", ["e2c13e2: every formal result after this", "src/, include/, tests/ unchanged since",
                                    "pixels and counters identical before and after"], None),
        ("FINAL", "Formal experiments rerun",
         [f"Hybrid 2×2 {fs[('hybrid-static', 2, 2)]['median_seconds']:.3f} s, OpenMP 4 {fs[('openmp', 1, 4)]['median_seconds']:.3f} s",
          f"paired {pct(p_fin['median_relative_change'])} "
          f"(95% CI {pct(p_fin['relative_ci95'][0])} to {pct(p_fin['relative_ci95'][1])})",
          "no resolvable difference"], None),
    ]


TAG = {"HISTORICAL": ((70, 60, 48), S.AMBER), "DIAGNOSTIC": ((44, 38, 70), S.WORKER[2]), "FINAL": ((12, 52, 56), S.ACCENT)}
CAVEAT = ("Caveat: the historical 4.707 s was not reproduced when the pre-fix source was rebuilt later (3.72 to 4.02 s in "
          "diagnostic runs), so the full size of the historical penalty was never attributed to these fixes.")


def story_card(c, x, y, w, h, n, step, size=1.0):
    tag, title, lines, code = step
    bg, fg = TAG[tag]
    c.panel(x, y, x + w, y + h, radius=14)
    c.circle(x + 30 * size, y + 32 * size, 17 * size, fill=fg)
    c.text(x + 30 * size, y + 32 * size, str(n), 18 * size, "bold", S.BG, anchor="mm")
    tw = c.text_width(tag, 12 * size, "semibold") + 18 * size
    c.rect(x + 58 * size, y + 19 * size, x + 58 * size + tw, y + 45 * size, fill=bg, radius=12 * size)
    c.text(x + 58 * size + tw / 2, y + 32 * size, tag, 12 * size, "semibold", fg, anchor="mm")
    yy = c.wrap(x + 22 * size, y + 62 * size, title, w - 44 * size, 22 * size, "semibold", S.TEXT, line_h=1.2)
    yy += 8 * size
    for ln in lines:
        yy = c.wrap(x + 22 * size, yy, ln, w - 44 * size, 16.5 * size, "regular", S.TEXT_2, line_h=1.32)
    if code:
        before, after = code
        yy += 6 * size
        for label, text, col in (("before", before, S.CORAL), ("after", after, S.GOOD)):
            nlines = text.count("\n") + 1
            bh = (12 + 19 * nlines) * size
            c.rect(x + 22 * size, yy, x + w - 22 * size, yy + bh, fill=(11, 16, 23), outline=(40, 54, 70), width=1, radius=6)
            c.text(x + 32 * size, yy + 7 * size, label, 12 * size, "semibold", col)
            for k, ln in enumerate(text.split("\n")):
                c.text(x + 96 * size, yy + (6 + 19 * k) * size, ln, 14.5 * size, "mono", S.TEXT)
            yy += bh + 6 * size


def storyboard_16x9(reveal=8, size=(1920, 1080)):
    steps = story_steps()
    c = S.Canvas(*size)
    c.header("Performance investigation   ·   historical → diagnostic → final",
             "How a strange result became two real fixes")
    w, h, gx, gy1, gy2 = 408, 330, 72, 176, 540
    for i, step in enumerate(steps):
        if i >= reveal:
            break
        row, col = divmod(i, 4)
        x = gx + col * (w + 48)
        y = gy1 if row == 0 else gy2
        story_card(c, x, y, w, h, i + 1, step)
        if i < len(steps) - 1 and i + 1 < reveal:
            if col < 3:
                c.arrow(x + w + 8, y + h / 2, x + w + 40, y + h / 2, fill=S.ACCENT, width=3)
            else:
                c.line([(x + w / 2, y + h + 6), (x + w / 2, y + h + 18), (gx + w / 2, y + h + 18)], fill=S.ACCENT, width=3)
                c.arrow(gx + w / 2, y + h + 18, gx + w / 2, gy2 - 6, fill=S.ACCENT, width=3)
    if reveal >= len(steps):
        c.rect(72, 890, 1848, 978, fill=(40, 30, 16), outline=S.AMBER + (170,), width=1.2, radius=10)
        c.wrap(96, 904, CAVEAT, 1720, 18, "regular", (240, 220, 190))
    c.footer("report Sections 5 and 7 · results/protocol-v2/{20260928T063038Z-301480e3, " + E.STRONG + "} · "
             "results/diagnostic/counter-fix/20260928T101701Z-0de80589",
             note="Numbers are parsed from the listed evidence at render time, except the address-probe timings (quoted from report Section 5.3).")
    return c.finish()


def storyboard_report():
    steps = story_steps()
    W, card_h = 1500, 196
    H = 250 + len(steps) * (card_h + 36) + 180
    c = S.Canvas(W, H)
    c.eyebrow(64, 50, "Performance investigation   ·   historical → diagnostic → final")
    c.text(64, 74, "How a strange result became two real fixes", 44, "semibold")
    y = 170
    for i, step in enumerate(steps):
        tag, title, lines, code = step
        story_card(c, 64, y, W - 128 - (560 if code else 0), card_h, i + 1, (tag, title, lines, None))
        if code:
            cx, cw = W - 64 - 540, 540
            c.panel(cx, y, cx + cw, y + card_h, radius=14)
            yy = y + 22
            for label, text, col in (("before", code[0], S.CORAL), ("after", code[1], S.GOOD)):
                c.text(cx + 20, yy, label, 14, "semibold", col)
                for k, ln in enumerate(text.split("\n")):
                    c.text(cx + 20, yy + 24 + 22 * k, ln, 17, "mono", S.TEXT)
                yy += 24 + 22 * (text.count("\n") + 1) + 16
        if i < len(steps) - 1:
            c.arrow(64 + 40, y + card_h + 4, 64 + 40, y + card_h + 32, fill=S.ACCENT, width=3)
        y += card_h + 36
    c.rect(64, y, W - 64, y + 96, fill=(40, 30, 16), outline=S.AMBER + (170,), width=1.2, radius=10)
    c.wrap(88, y + 16, CAVEAT, W - 176, 19, "regular", (240, 220, 190))
    c.text(64, H - 44, "report Sections 5 and 7 · diagnostic A/B 20260928T101701Z-0de80589 · formal " + E.STRONG_HIST + " (historical), "
           + E.STRONG + " (final)", 14, "mono", S.MUTED)
    return c.finish()


# --------------------------------------------------------------------------------------------- dashboard
def ci_row(c, x, y, w, lo_v, hi_v, v, ci, col, label, sub=None, zero=True):
    X = lambda t: x + w * (t - lo_v) / (hi_v - lo_v)
    if zero:
        c.line([(X(0), y - 14), (X(0), y + 14)], fill=S.MUTED, width=1)
    c.line([(X(ci[0]), y), (X(ci[1]), y)], fill=col + (200,), width=3)
    c.circle(X(v), y, 6, fill=col)
    c.text(x - 16, y, label, 15, "regular", S.TEXT_2, anchor="rm")
    if sub:
        c.text(x + w + 12, y, sub, 14, "mono", S.TEXT_2, anchor="lm")


def dashboard():
    st = E.strong()
    fp = {(p["candidate"], p["reference"]): p for p in E.strong_paired()}
    hp = {(p["candidate"], p["reference"]): p for p in E.strong_paired(historical=True)}
    pairs = E.scheduler_pairs()
    c = S.Canvas()
    c.header("Final results on the frozen source e2c13e2   ·   formal Protocol V2 evidence",
             "Helios performance at a glance")
    P = [(72, 176, 936, 588), (984, 176, 1848, 588), (72, 612, 936, 1010), (984, 612, 1848, 1010)]
    for p in P:
        c.panel(*p)
    # A: strong scaling speedups
    x0, y0, x1, y1 = P[0]
    c.text(x0 + 24, y0 + 22, "Strong scaling  ·  speedup over sequential", 21, "semibold")
    c.text(x0 + 24, y0 + 52, f"medium imbalanced · 7 blocks · {E.STRONG}", 14, "mono", S.MUTED)
    rows = [("OpenMP 8 threads", ("openmp", 1, 8), S.WORKER[1]), ("Hybrid 1×4", ("hybrid-static", 1, 4), S.WORKER[2]),
            ("MPI static 4", ("mpi-static", 4, 1), S.WORKER[3]), ("OpenMP 4", ("openmp", 1, 4), S.WORKER[1]),
            ("Hybrid 4×1", ("hybrid-static", 4, 1), S.WORKER[2]), ("Hybrid 2×2", ("hybrid-static", 2, 2), S.WORKER[2]),
            ("OpenMP 2", ("openmp", 1, 2), S.WORKER[1]), ("MPI static 2", ("mpi-static", 2, 1), S.WORKER[3])]
    bx, bw = x0 + 210, (x1 - x0) - 300
    smax = 3.2
    X = lambda v: bx + bw * v / smax
    for i, (label, key, col) in enumerate(rows):
        yy = y0 + 96 + i * 37
        sp = st[key]["speedup_vs_sequential"]
        c.text(bx - 14, yy + 12, label, 16, "regular", S.TEXT_2, anchor="rm")
        c.rect(bx, yy, X(sp), yy + 24, fill=col + (230,), radius=4)
        c.text(X(sp) + 10, yy + 12, f"{sp:.2f}×", 17, "mono", S.TEXT, anchor="lm")
    cap = sum(E.tile_costs()) / max(s for _, _, s in E.partitions(E.tile_costs(), 4))
    c.line([(X(cap), y0 + 86), (X(cap), y0 + 96 + 8 * 37 - 8)], fill=S.AMBER, width=2)
    c.text(X(cap) + 6, y0 + 84, f"{cap:.2f}× cap for equal 4-way static splits", 13, "regular", S.AMBER, anchor="ls")
    # B: dynamic vs static
    x0, y0, x1, y1 = P[1]
    c.text(x0 + 24, y0 + 22, "Dynamic vs static scheduling  ·  paired change", 21, "semibold")
    ds = [p for p in pairs if p["candidate"] == "mpi-dynamic" and p["reference"] == "mpi-static"]
    nat = [p["median_relative_runtime_change"] for p in ds if p["experiment"] != "heterogeneity"]
    c.text(x0 + 24, y0 + 52, f"faster on all {len(nat)} natural-scene cases ({min(-v for v in nat) * 100:.1f}% to "
           f"{max(-v for v in nat) * 100:.1f}%); every interval excludes zero", 14, "mono", S.GOOD)
    lo_v, hi_v = -0.40, 0.05
    xx, ww = x0 + 250, (x1 - x0) - 300
    for i, p in enumerate(ds):
        yy = y0 + 92 + i * 28
        nat = p["experiment"] != "heterogeneity"
        ci_row(c, xx, yy, ww, lo_v, hi_v, p["median_relative_runtime_change"], (p["median_ci95_low"], p["median_ci95_high"]),
               S.GOOD if nat else S.AMBER, f"{p['experiment']} {p['scene']}")
        c.text(xx + ww + 8, yy, pct(p["median_relative_runtime_change"], 1), 13, "mono", S.TEXT_2, anchor="lm")
    for t in (-0.3, -0.2, -0.1, 0.0):
        c.text(xx + ww * (t - lo_v) / (hi_v - lo_v), y1 - 30, f"{t * 100:.0f}%", 13, "mono", S.MUTED, anchor="ma")
    # C: adaptive vs fixed
    x0, y0, x1, y1 = P[2]
    c.text(x0 + 24, y0 + 22, "Adaptive vs fixed dynamic  ·  paired change", 21, "semibold")
    ad = [p for p in pairs if p["candidate"] == "hybrid-adaptive" and p["reference"] == "mpi-dynamic"]
    inc = sum(1 for p in ad if p["median_ci95_low"] <= 0 <= p["median_ci95_high"])
    c.text(x0 + 24, y0 + 52, f"{inc} of {len(ad)} intervals include zero: no consistent wall-clock advantage", 14, "mono", S.MUTED)
    lo_v, hi_v = -0.08, 0.10
    xx, ww = x0 + 250, (x1 - x0) - 300
    for i, p in enumerate(ad):
        yy = y0 + 92 + i * 28
        excl = not (p["median_ci95_low"] <= 0 <= p["median_ci95_high"])
        ci_row(c, xx, yy, ww, lo_v, hi_v, p["median_relative_runtime_change"], (p["median_ci95_low"], p["median_ci95_high"]),
               S.AMBER if excl else S.TEXT_2, f"{p['experiment']} {p['scene']}")
    for t in (-0.05, 0.0, 0.05, 0.10):
        c.text(xx + ww * (t - lo_v) / (hi_v - lo_v), y1 - 30, f"{t * 100:+.0f}%", 13, "mono", S.MUTED, anchor="ma")
    # D: hybrid after fixes
    x0, y0, x1, y1 = P[3]
    c.text(x0 + 24, y0 + 22, "Hybrid 2×2 vs OpenMP 4  ·  before and after the fixes", 21, "semibold")
    c.text(x0 + 24, y0 + 52, "paired change within each experiment; the two experiments are separate sessions", 14, "mono", S.MUTED)
    lo_v, hi_v = -0.10, 0.60
    xx, ww = x0 + 250, (x1 - x0) - 330
    h_ = hp[("hybrid-static 2x2", "openmp 1x4")]
    f_ = fp[("hybrid-static 2x2", "openmp 1x4")]
    f14 = fp[("hybrid-static 1x4", "openmp 1x4")]
    for i, (lab, p, col) in enumerate([("historical, pre-fix", h_, S.AMBER), ("final, e2c13e2", f_, S.ACCENT)]):
        yy = y0 + 140 + i * 90
        ci_row(c, xx, yy, ww, lo_v, hi_v, p["median_relative_change"], p["relative_ci95"], col, lab)
        c.text(xx + ww + 12, yy, pct(p["median_relative_change"]), 16, "mono", col, anchor="lm")
    for t in (0.0, 0.2, 0.4, 0.6):
        c.text(xx + ww * (t - lo_v) / (hi_v - lo_v), y0 + 300, f"{t * 100:+.0f}%", 13, "mono", S.MUTED, anchor="ma")
    c.text(x0 + 24, y1 - 60, f"Final: no resolvable difference. Hybrid 1×4 is {-f14['median_relative_change'] * 100:.1f}% faster "
           f"than OpenMP 4 ({f14['candidate_faster_blocks']}/7 blocks).", 15, "regular", S.TEXT_2)
    c.footer(f"formal aggregates: {E.STRONG} (strong), {', '.join(v[:15] + '…' for v in E.SCHED.values())} (scheduler)",
             note=f"Dots are paired medians; lines are 95% percentile-bootstrap intervals. Heterogeneity = rank 1 slowed 2× (synthetic). "
                  f"Historical = pre-fix {E.STRONG_HIST}.")
    c.save(OUT / "performance" / "helios-performance-dashboard.png")


# --------------------------------------------------------------------------------------------- stress
def stress_card():
    m, env, logs = E.stress()
    args = m["arguments"]
    val = lambda k: args[args.index(k) + 1]
    w, h, spp = int(val("--width")), int(val("--height")), int(val("--spp"))
    c = S.Canvas()
    c.header("Required stress workload   ·   supervised run " + m["run_id"],
             "Stress test: did not finish (DNF)",
             "A deliberately overlong render run once under a gated script with a hard timeout. Recorded evidence only; not rerun.")
    # left: big numbers
    c.panel(72, 206, 900, 700)
    c.eyebrow(100, 236, "Elapsed wall time", fill=S.TEXT_2)
    c.text(100, 262, f"{m['elapsed_wall_seconds']:.2f} s", 88, "semibold", S.AMBER)
    c.text(100, 372, f"timeout {m['timeout_seconds']} s  ·  timed_out = {str(m['timed_out']).lower()}  ·  "
                     f"exit code {m['exit_code'] if m['exit_code'] is not None else 'null (killed)'}", 19, "mono", S.TEXT_2)
    # timeline bar
    bx, by, bw = 100, 440, 772
    c.rect(bx, by, bx + bw, by + 30, fill=(16, 23, 32), outline=(40, 54, 70), width=1, radius=6)
    c.rect(bx, by, bx + bw * min(1, m["elapsed_wall_seconds"] / 660), by + 30, fill=S.AMBER + (200,), radius=6)
    tx = bx + bw * m["timeout_seconds"] / 660
    c.line([(tx, by - 12), (tx, by + 42)], fill=S.CORAL, width=3)
    c.text(tx, by - 16, "600 s timeout: process tree terminated", 15, "semibold", S.CORAL, anchor="ms")
    c.text(bx, by + 44, "0 s", 14, "mono", S.MUTED)
    c.text(tx, by + 44, "600 s", 14, "mono", S.MUTED, anchor="ma")
    c.text(bx, by + 76, "Progress is unknown: Helios prints no progress and writes its image only on completion.", 16, "regular", S.TEXT_2)
    c.text(100, 572, f"{m['started_utc'][:19].replace('T', ' ')} to {m['ended_utc'][:19].replace('T', ' ')} UTC", 18, "mono", S.TEXT)
    c.text(100, 606, f"Git {m['git_sha'][:12]} (source identical to e2c13e2)  ·  helios.exe {m['executable_sha256'][:12]}", 16, "mono", S.TEXT_2)
    c.text(100, 636, f"host: {env['cpu'].split(' @')[0]}, {env['physical_cores']} cores / {env['logical_processors']} threads, "
                     f"{env['physical_ram_bytes'] / 2**30:.1f} GiB", 16, "mono", S.TEXT_2)
    # right: workload facts
    c.panel(936, 206, 1848, 700)
    c.eyebrow(964, 236, "Workload", fill=S.TEXT_2)
    facts = [("Scene", val("--scene")), ("Resolution", f"{w}×{h}"), ("Samples per pixel", f"{spp}"),
             ("Max depth", val("--max-depth")), ("Backend", val("--backend") + " (one thread)"),
             ("Camera samples", f"{w * h * spp:,}"), ("Seed / tile", f"{val('--seed')} / {val('--tile')}")]
    for i, (k, v) in enumerate(facts):
        yy = 280 + i * 54
        c.text(964, yy, k, 20, "regular", S.TEXT_2)
        c.text(1820, yy, v, 22, "mono", S.TEXT, anchor="ra")
        c.line([(964, yy + 38), (1820, yy + 38)], fill=S.PANEL_EDGE, width=1)
    # outcome strip
    outcomes = [("DNF", "terminated at the planned limit", S.AMBER),
                ("No crash", "ran until killed", S.GOOD),
                (f"stderr {logs['stderr']} bytes", "no error or out-of-memory message", S.GOOD),
                ("No output", "no PPM or stats JSON written", S.TEXT_2)]
    for i, (big, small, col) in enumerate(outcomes):
        x = 72 + i * 450
        c.panel(x, 732, x + 426, 870)
        c.text(x + 24, 758, big, 30, "semibold", col)
        c.text(x + 24, 808, small, 17, "regular", S.TEXT_2)
    c.text(72, 912, "Memory use was not recorded; the image buffer is about 2.8 MB. Report Section 8 and Table 13.", 17, "regular", S.MUTED)
    c.footer(f"results/stress/{m['run_id']}/manifest.json · environment.json · stdout.log · stderr.log")
    c.save(OUT / "evidence" / "stress-test-summary.png")


def main(what):
    info = {}
    if what in ("tilecost", "all"):
        info["tile_cost_map"] = tile_cost_map()
        info["tile_cost_partitions"] = tile_cost_partitions()
    if what in ("correctness", "all"):
        _, identical = correctness_wall(out=OUT / "correctness" / "backend-correctness-wall.png")
        info["correctness_byte_identical"] = identical
    if what in ("optimisation", "all"):
        optimisation_before_after(out=OUT / "performance" / "optimisation-before-after.png")
    if what in ("story", "all"):
        storyboard_16x9().save(OUT / "performance" / "performance-investigation-story-16x9.png", optimize=True)
        storyboard_report().save(OUT / "performance" / "performance-investigation-story.png", optimize=True)
    if what in ("dashboard", "all"):
        dashboard()
    if what in ("stress", "all"):
        stress_card()
    print(json.dumps(info, indent=1, default=str))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "all")
