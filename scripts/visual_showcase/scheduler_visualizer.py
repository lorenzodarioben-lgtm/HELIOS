"""Animated scheduler dashboard driven by REAL Helios scheduler evidence (presentation only).

  python scheduler_visualizer.py            # all videos, stills and the validation report
  python scheduler_visualizer.py --stills   # stills and validation only

Data: formal experiment 20260928T103934Z-edc10839, scene `imbalanced`, medium preset, the block whose
render time equals each policy's median. See scheduler_data.py for exactly what is recorded and what is
derived. No assignment, timing or worker is invented; runs are never shown as simultaneous.
"""
import argparse
import math

from PIL import Image

import scheduler_data as sd
import style as S
from common import SHOWCASE, WORK, ppm_to_image, rel, write_json
from video import encode, to_gif

OUT = SHOWCASE / "scheduler"
FPS = 30
SPEED = 0.5            # video plays at half real speed: 1 real second = 2 video seconds
T_AXIS = 3.5           # common real-time axis (s) so the three policies are comparable
INTRO, OUTRO = 1.0, 2.2
COLS, ROWS = 16, 9


def background(rt, w, h):
    """Tile imagery: the presentation gallery render of the same scene (same camera, 16:9), else the run's PPM."""
    g = SHOWCASE / "gallery" / f"{rt.scene}-hero.png"
    im = Image.open(g) if g.exists() else ppm_to_image(sd.RAW / f"{rt.run_id}.ppm")
    return im.convert("RGB").resize((w, h), Image.LANCZOS), rel(g) if g.exists() else f"{rt.run_id}.ppm"


class Scene:
    """Precomputed state of one run at any real time t."""

    def __init__(self, rt):
        self.rt = rt
        self.by_worker = {w: sorted((e for e in rt.tiles if e.worker == w), key=lambda e: e.start) for w in rt.workers}
        self.batch_of = {e.tile: (rt.batches[e.batch] if e.batch >= 0 else None) for e in rt.tiles}

    def tile_state(self, e, t):
        if t < e.assigned:
            return "unassigned", 0.0
        if t < e.start:
            return "queued", 0.0
        if t < e.end:
            return "rendering", (t - e.start) / max(e.end - e.start, 1e-9)
        return "done", 1.0

    def worker(self, w, t):
        evs = self.by_worker[w]
        done = [e for e in evs if e.end <= t]
        cur = next((e for e in evs if e.start <= t < e.end), None)
        assigned = [e for e in evs if e.assigned <= t]
        busy = sum(min(e.end, t) - e.start for e in evs if e.start < t)
        last_end = evs[-1].end
        if cur:
            status = "RENDERING"
        elif t >= last_end:
            status = "IDLE" if self.rt.mode == "static" and t < self.rt.end else "DONE"
        else:
            status = "WAITING"
        batch = self.batch_of[cur.tile] if cur else None
        return {"done": len(done), "assigned": len(assigned), "total": len(evs), "current": cur, "busy": busy,
                "status": status, "batch": batch, "idle_since": last_end if t >= last_end else None,
                "pixels": sum((e.x1 - e.x0) * (e.y1 - e.y0) for e in done)}

    def coordinator(self, t):
        sent = [b for b in self.rt.batches if b.dispatched <= t]
        return {"sent": len(sent), "total": len(self.rt.batches),
                "unassigned": sum(1 for e in self.rt.tiles if e.assigned > t)}

    def done_count(self, t):
        return sum(1 for e in self.rt.tiles if e.end <= t)


# ---------------------------------------------------------------------------------------------------------
def draw_grid(c, sc, t, x, y, tile, bg_tiles, show_ids=True, gap=None):
    gap = gap if gap is not None else max(2, tile * 0.045)
    for e in sc.rt.tiles:
        col, row = e.x0 // sc.rt.tile_px, e.y0 // sc.rt.tile_px
        x0, y0 = x + col * tile + gap / 2, y + row * tile + gap / 2
        x1, y1 = x0 + tile - gap, y0 + tile - gap
        wc = S.WORKER[e.worker]
        state, f = sc.tile_state(e, t)
        if state == "unassigned":
            c.rect(x0, y0, x1, y1, fill=(17, 25, 35), outline=(30, 42, 56), width=1)
            if show_ids:
                c.text(x0 + 5, y0 + 4, str(e.tile), max(9, tile * 0.16), "mono", (62, 76, 92))
        elif state == "queued":
            c.rect(x0, y0, x1, y1, fill=wc + (38,), outline=wc + (120,), width=1.2)
            if show_ids:
                c.text(x0 + 5, y0 + 4, str(e.tile), max(9, tile * 0.16), "mono", wc + (170,))
        else:
            im = bg_tiles[e.tile]
            if state == "rendering":
                h = max(1, int(round(im.size[1] * f)))
                c.rect(x0, y0, x1, y1, fill=wc + (60,))
                c.img.paste(im.crop((0, 0, im.size[0], h)), (c.s(x0), c.s(y0)))
                c.rect(x0, y0, x1, y1, outline=S.AMBER, width=max(2, tile * 0.04))
            else:
                c.img.paste(im, (c.s(x0), c.s(y0)))
                c.rect(x0, y0, x1, y1, fill=wc + (12,), outline=wc + (200,), width=max(1.3, tile * 0.022))
                c.d.polygon([c.s(x0), c.s(y0), c.s(x0 + tile * 0.16), c.s(y0), c.s(x0), c.s(y0 + tile * 0.16)], fill=wc)


def tile_images(rt, c, x, y, tile, gap=None):
    gap = gap if gap is not None else max(2, tile * 0.045)
    W, H = COLS * tile, ROWS * tile
    bg, src = background(rt, c.s(W), c.s(H))
    out = {}
    for e in rt.tiles:
        col, row = e.x0 // rt.tile_px, e.y0 // rt.tile_px
        x0, y0 = col * tile + gap / 2, row * tile + gap / 2
        out[e.tile] = bg.crop((c.s(x0), c.s(y0), c.s(x0 + tile - gap), c.s(y0 + tile - gap)))
    return out, src


def draw_gantt(c, sc, t, x, y, w, row_h=26, gap=12, t_axis=T_AXIS, labels=True, axis=True, label_w=118):
    bx = x + (label_w if labels else 0)
    bw = w - (label_w if labels else 0)
    X = lambda s: bx + bw * min(s, t_axis) / t_axis
    for i, wk in enumerate(sc.rt.workers):
        ry = y + i * (row_h + gap)
        wc = S.WORKER[wk]
        if labels:
            c.circle(x + 8, ry + row_h / 2, 5, fill=wc)
            c.text(x + 22, ry + row_h / 2, f"rank {wk}", 17, "semibold", S.TEXT_2, anchor="lm")
        c.rect(bx, ry, bx + bw, ry + row_h, fill=(16, 23, 32), outline=(30, 42, 56), width=1, radius=4)
        for e in sc.by_worker[wk]:
            if e.start >= t:
                break
            c.rect(X(e.start), ry + 2, X(min(e.end, t)), ry + row_h - 2, fill=wc + (225,))
        for b in sc.rt.batches:  # recorded dispatch instants (batch boundaries)
            if b.worker == wk and b.dispatched <= t and sc.rt.mode == "adaptive":
                c.line([(X(b.dispatched), ry - 3), (X(b.dispatched), ry + row_h + 3)], fill=S.TEXT + (150,), width=1)
        info = sc.worker(wk, t)
        if info["status"] == "IDLE":
            c.rect(X(info["idle_since"]), ry + 2, X(t), ry + row_h - 2, fill=S.AMBER + (40,), outline=S.AMBER + (160,), width=1)
    if axis:
        ay = y + len(sc.rt.workers) * (row_h + gap) + 2
        for k in range(int(t_axis * 2) + 1):
            s = k * 0.5
            c.line([(X(s), ay), (X(s), ay + 6)], fill=S.MUTED, width=1)
            c.text(X(s), ay + 9, f"{s:.1f} s", 14, "mono", S.MUTED, anchor="ma")
    c.line([(X(t), y - 8), (X(t), y + len(sc.rt.workers) * (row_h + gap) - gap + 8)], fill=S.TEXT, width=2)


def status_chip(c, x, y, status):
    colours = {"RENDERING": (S.AMBER, (40, 30, 10)), "WAITING": ((60, 74, 90), S.TEXT),
               "IDLE": ((120, 60, 50), (255, 225, 215)), "DONE": (S.ACCENT_DIM, S.TEXT)}
    fill, fg = colours[status]
    w = c.text_width(status, 14, "semibold") + 20
    c.rect(x - w, y, x, y + 26, fill=fill, radius=13)
    c.text(x - w / 2, y + 13, status, 14, "semibold", fg, anchor="mm")


def worker_card(c, sc, wk, t, x, y, w, h):
    wc = S.WORKER[wk]
    info = sc.worker(wk, t)
    c.panel(x, y, x + w, y + h)
    c.rect(x, y + 14, x + 5, y + h - 14, fill=wc, radius=2)
    c.text(x + 24, y + 20, f"RANK {wk}", 16, "semibold", wc, spacing=1.5)
    c.text(x + 24 + c.text_width(f"RANK {wk}", 16, "semibold") + 24, y + 20, "worker", 16, "regular", S.MUTED)
    status_chip(c, x + w - 20, y + 16, info["status"])
    c.text(x + 24, y + 54, f"{info['done']}", 46, "semibold", S.TEXT)
    c.text(x + 24 + c.text_width(f"{info['done']}", 46, "semibold") + 10, y + 78,
           f"tiles rendered   ·   {info['assigned']} assigned so far", 17, "regular", S.TEXT_2)
    lines = []
    b = info["batch"]
    if b is not None:
        rng = f"tile {b.first}" if b.count == 1 else f"tiles {b.first} to {b.first + b.count - 1}"
        lines.append(("Current assignment", f"{rng}  ({b.count})"))
    elif sc.rt.mode == "static":
        lines.append(("Static range", "tiles 0 to 71" if wk == 1 else "tiles 72 to 143"))
    else:
        lines.append(("Current assignment", "waiting for next batch" if info["status"] == "WAITING" else "none"))
    elapsed = max(t, 1e-9)
    lines.append(("Busy", f"{info['busy']:.2f} s  ({100 * min(info['busy'] / elapsed, 1):.0f}% of elapsed)"))
    if info["status"] == "IDLE":
        lines.append(("Idle", f"{t - info['idle_since']:.2f} s since its last tile"))
    elif sc.rt.mode == "adaptive" and b is not None and b.rate_estimate:
        lines.append(("Coordinator estimate", f"{b.rate_estimate / 1000:.1f} k px/s at dispatch"))
    else:
        rate = info["pixels"] / info["busy"] if info["busy"] > 0.02 else 0
        lines.append(("Measured rate", f"{rate / 1000:.1f} k px/s" if rate else "–"))
    yy = y + 124
    for k, v in lines:
        c.text(x + 24, yy, k, 16, "regular", S.MUTED)
        c.text(x + 196, yy, v, 16, "mono", S.AMBER if k == "Idle" else S.TEXT)
        yy += 27


def coordinator_card(c, sc, t, x, y, w, h):
    c.panel(x, y, x + w, y + h)
    c.rect(x, y + 14, x + 5, y + h - 14, fill=S.WORKER[0], radius=2)
    c.text(x + 24, y + 20, "RANK 0", 16, "semibold", S.WORKER[0], spacing=1.5)
    c.text(x + 24 + c.text_width("RANK 0", 16, "semibold") + 24, y + 20, "coordinator", 16, "regular", S.MUTED)
    if sc.rt.mode == "static":
        c.text(x + 24, y + 56, "Renders nothing. Each worker's range was", 17, "regular", S.TEXT_2)
        c.text(x + 24, y + 80, "fixed before rendering; results are gathered.", 17, "regular", S.TEXT_2)
    else:
        co = sc.coordinator(t)
        c.text(x + 24, y + 52, f"{co['sent']}", 34, "semibold", S.TEXT)
        c.text(x + 24 + c.text_width(f"{co['sent']}", 34, "semibold") + 10, y + 70,
               f"assignments sent  (of {co['total']} in this run)", 17, "regular", S.TEXT_2)
        c.text(x + 24, y + 100, "Tiles not yet assigned", 16, "regular", S.MUTED)
        c.text(x + 196, y + 100, f"{co['unassigned']}", 16, "mono", S.TEXT)


LAYOUT = dict(gx=72, gy=176, tile=70, rx=1236, rw=612)


def dashboard(sc, bg_tiles, t, src_image):
    rt = sc.rt
    c = S.Canvas()
    c.eyebrow(72, 44, "Recorded scheduler evidence   ·   formal experiment 20260928T103934Z-edc10839")
    c.text(72, 66, rt.label, 44, "semibold")
    c.text(72 + c.text_width(rt.label, 44, "semibold") + 20, 86, rt.description, 21, "regular", S.TEXT_2)
    c.text(72, 128, f"{rt.scene} scene  ·  {rt.width}×{rt.height} image  ·  144 tiles of 16×16  ·  {rt.spp} SPP  ·  "
                    f"rank 0 coordinates, ranks 1 and 2 render  ·  block {rt.block} (median-time run)", 17, "regular", S.MUTED)
    c.text(1848, 50, f"t = {min(t, rt.end):.3f} s", 38, "mono", S.TEXT, anchor="ra")
    c.text(1848, 100, f"real run time · shown at {SPEED:g}× speed", 15, "regular", S.MUTED, anchor="ra")
    L = LAYOUT
    draw_grid(c, sc, t, L["gx"], L["gy"], L["tile"], bg_tiles)
    coordinator_card(c, sc, t, L["rx"], L["gy"], L["rw"], 136)
    worker_card(c, sc, 1, t, L["rx"], L["gy"] + 152, L["rw"], 239)
    worker_card(c, sc, 2, t, L["rx"], L["gy"] + 407, L["rw"], 239)
    # bottom: gantt + progress
    draw_gantt(c, sc, t, 72, 862, 1776, row_h=26, gap=12)
    done = sc.done_count(t)
    c.text(1848, 846, f"{done} / 144 tiles rendered", 17, "semibold", S.TEXT, anchor="rs")
    c.text(72, 846, "Worker timeline (each block is one tile's recorded compute time)", 17, "semibold", S.TEXT_2, anchor="ls")
    if t >= rt.end:
        c.chip(1848 - 470, 846 - 24, f"COMPLETE at {rt.end:.2f} s", fill=S.ACCENT_DIM)
    src = (f"results/protocol-v2/20260928T103934Z-edc10839/raw/{rt.run_id}"
           + (".tiles.csv" if rt.mode == "static" else ".trace.csv + .tiles.csv"))
    note = ("Static has no trace: each worker's tiles run back to back in ID order from t = 0, timed by recorded per-tile compute seconds. "
            if rt.mode == "static" else
            "Dispatch times and assignments are recorded; tile order inside a batch uses recorded per-tile compute seconds. ")
    c.footer(src, note=note + f"Tile imagery: {src_image} (presentation render of the same scene).")
    return c.finish()


def frames_for(sc, bg_tiles, src_image):
    total = INTRO + rt_video_len(sc.rt) + OUTRO
    for k in range(int(round(total * FPS))):
        vt = k / FPS
        t = max(0.0, (vt - INTRO) * SPEED)
        yield dashboard(sc, bg_tiles, min(t, sc.rt.end + 1e-9) if vt > INTRO else 0.0, src_image)


def rt_video_len(rt):
    return rt.end / SPEED


# ---------------------------------------------------------------------------------------------------------
def comparison(scenes, bg_sets, t):  # noqa: C901
    c = S.Canvas()
    c.eyebrow(72, 44, "Recorded scheduler evidence   ·   formal experiment 20260928T103934Z-edc10839")
    c.text(72, 66, "Same image, same two workers, three scheduling policies", 44, "semibold")
    c.text(72, 128, "imbalanced scene · 144 tiles · 192 SPP · separate runs (median-time block of each policy) "
                    "aligned at their start on one real-time axis, not simultaneous", 17, "regular", S.MUTED)
    c.text(1848, 50, f"t = {t:.3f} s", 38, "mono", S.TEXT, anchor="ra")
    c.text(1848, 100, f"real run time · shown at {SPEED:g}× speed", 15, "regular", S.MUTED, anchor="ra")
    colw, gapw, tile = 568, 36, 35.5
    for i, sc in enumerate(scenes):
        rt = sc.rt
        x = 72 + i * (colw + gapw)
        y = 184
        c.panel(x - 12, y - 14, x + colw + 12, 770, radius=16)
        c.text(x + 6, y + 8, rt.label, 26, "semibold")
        c.text(x + 6, y + 44, rt.description, 16, "regular", S.TEXT_2)
        gy = y + 82
        draw_grid(c, sc, min(t, rt.end + 1e-9), x, gy, tile, bg_sets[i], show_ids=False, gap=1.6)
        by = gy + ROWS * tile + 30
        draw_gantt(c, sc, min(t, rt.end + 1e-9), x, by, colw, row_h=22, gap=10, labels=True, axis=True, label_w=86)
        sy = by + 94
        done = sc.done_count(t)
        busy = {w: sc.worker(w, min(t, rt.end))["busy"] for w in rt.workers}
        c.text(x + 6, sy, f"{done} / 144 tiles", 22, "semibold", S.TEXT)
        c.text(x + 6, sy + 34, "busy  " + "   ".join(f"rank {w} {busy[w]:.2f} s" for w in rt.workers), 16, "mono", S.TEXT_2)
        if rt.batches:
            c.text(x + 6 + 300, sy + 6, f"{sum(1 for b in rt.batches if b.dispatched <= t)} assignments", 16, "mono", S.TEXT_2)
        if t >= rt.end:
            c.chip(x + colw - 206, y + 6, f"COMPLETE at {rt.end:.2f} s", fill=S.ACCENT_DIM)
        elif rt.mode == "static" and sc.worker(1, t)["status"] == "IDLE":
            c.chip(x + colw - 150, y + 6, "rank 1 idle", fill=(120, 60, 50), color=(255, 225, 215))
    progress_chart(c, scenes, t, 72, 800, 1776, 180)
    c.footer("results/protocol-v2/20260928T103934Z-edc10839/raw/imbalanced-medium-{mpi-static-…-b1, mpi-dynamic-…-b0, hybrid-adaptive-…-b5}",
             note="Static timeline derived from recorded per-tile compute seconds (no trace exists for static); dynamic and adaptive "
                  "dispatch times from the recorded trace. Tile imagery: presentation render of the same scene.")
    return c.finish()


def progress_chart(c, scenes, t, x, y, w, h):
    """Tiles rendered over real time for each policy (derived from each tile's recorded end time)."""
    c.text(x, y + 2, "Tiles rendered over time", 18, "semibold", S.TEXT_2)
    px, pw, py, ph = x + 250, w - 250, y + 6, h - 40
    X = lambda s: px + pw * min(s, T_AXIS) / T_AXIS
    Y = lambda n: py + ph - ph * n / 144
    c.rect(px, py, px + pw, py + ph, fill=(14, 21, 30), outline=(30, 42, 56), width=1, radius=6)
    for n in (72, 144):
        c.line([(px, Y(n)), (px + pw, Y(n))], fill=(40, 54, 70), width=1)
        c.text(px - 10, Y(n), str(n), 14, "mono", S.MUTED, anchor="rm")
    for k in range(int(T_AXIS * 2) + 1):
        c.text(X(k * 0.5), py + ph + 8, f"{k * 0.5:.1f} s", 14, "mono", S.MUTED, anchor="ma")
    colours = {"static": S.CORAL, "dynamic": S.WORKER[1], "adaptive": S.AMBER}
    for i, sc in enumerate(scenes):
        ends = sorted(e.end for e in sc.rt.tiles)
        pts, n = [(X(0), Y(0))], 0
        for e in ends:
            if e > t:
                break
            n += 1
            pts.append((X(e), Y(n)))
        pts.append((X(min(t, sc.rt.end)), Y(n)))
        col = colours[sc.rt.mode]
        if len(pts) > 1:
            c.line(pts, fill=col, width=3)
        ly = y + 44 + i * 30
        c.line([(x, ly), (x + 26, ly)], fill=col, width=4)
        c.text(x + 36, ly, sc.rt.label, 16, "regular", S.TEXT, anchor="lm")
        if t >= sc.rt.end:
            c.circle(X(sc.rt.end), Y(144), 5, fill=col)
            c.text(x + 36 + c.text_width(sc.rt.label, 16) + 10, ly, f"done {sc.rt.end:.2f} s", 15, "mono", col, anchor="lm")
    c.line([(X(t), py - 4), (X(t), py + ph + 4)], fill=S.TEXT, width=1.5)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills", action="store_true")
    ap.add_argument("--comparison-only", action="store_true", help="stills plus only the comparison video")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    runs = {m: sd.load(m) for m in ("static", "dynamic", "adaptive")}
    validation = {m: {"run": rt.run_id, "block": rt.block,
                      "median_block_walls": {str(k): v for k, v in sd.median_block(sd.MODES[m][0], "imbalanced")[1].items()},
                      **sd.validate(rt)} for m, rt in runs.items()}
    scenes = {m: Scene(rt) for m, rt in runs.items()}
    L = LAYOUT
    probe = S.Canvas(texture=False)
    big = {m: tile_images(rt, probe, L["gx"], L["gy"], L["tile"]) for m, rt in runs.items()}
    small = {m: tile_images(rt, probe, 0, 0, 35.5, gap=1.6)[0] for m, rt in runs.items()}
    src_image = next(iter(big.values()))[1]
    stills = {"static": 2.0, "dynamic": 1.15, "adaptive": 0.30}
    for m, t in stills.items():
        dashboard(scenes[m], big[m][0], t, src_image).save(OUT / f"scheduler-{m if m != 'dynamic' else 'dynamic'}-still.png", optimize=True)
    comp_scenes = [scenes["static"], scenes["dynamic"], scenes["adaptive"]]
    comp_bg = [small["static"], small["dynamic"], small["adaptive"]]
    comparison(comp_scenes, comp_bg, 1.9).save(OUT / "scheduler-comparison-still.png", optimize=True)
    validation["_playback"] = {"speed": SPEED, "fps": FPS, "intro_s": INTRO, "outro_s": OUTRO, "time_axis_s": T_AXIS,
                               "stills_real_time_s": stills, "comparison_still_real_time_s": 1.9,
                               "tile_imagery": src_image}
    write_json(OUT / "scheduler-trace-validation.json", validation)
    if a.stills:
        return
    names = {"static": "scheduler-static.mp4", "dynamic": "scheduler-fixed-dynamic.mp4", "adaptive": "scheduler-adaptive.mp4"}
    for m, name in names.items():
        if a.comparison_only:
            break
        n = encode(frames_for(scenes[m], big[m][0], src_image), OUT / name, fps=FPS)
        print(name, n, "frames", flush=True)
    end = max(sc.rt.end for sc in comp_scenes)
    total = INTRO + end / SPEED + OUTRO

    def comp_frames():
        for k in range(int(round(total * FPS))):
            vt = k / FPS
            yield comparison(comp_scenes, comp_bg, min(max(0.0, (vt - INTRO) * SPEED), end))

    n = encode(comp_frames(), OUT / "scheduler-comparison.mp4", fps=FPS)
    print("scheduler-comparison.mp4", n, "frames")
    to_gif(OUT / "scheduler-comparison.mp4", OUT / "scheduler-comparison-preview.gif", fps=10, width=960)


if __name__ == "__main__":
    main()
