"""Architecture and parallelism-layer diagrams of the ACTUAL Helios implementation (presentation only).

Every box maps to real code: make_scene / build_bvh / Camera / make_tiles / render_tile / trace / Scene::hit
in src/core.cpp, and run_local / run_mpi / batch_size in src/main.cpp. No invented components.
"""
from PIL import Image

import style as S
from common import SHOWCASE

OUT = SHOWCASE / "architecture"


def box(c, x, y, w, h, title, sub=None, code=None, accent=S.ACCENT, fill=S.PANEL, title_size=21):
    c.rect(x, y, x + w, y + h, fill=fill, outline=accent + (170,), width=1.5, radius=12)
    c.rect(x, y + 12, x + 4, y + h - 12, fill=accent, radius=2)
    ty = y + (18 if (sub or code) else h / 2 - title_size * 0.62)
    c.text(x + 20, ty, title, title_size, "semibold", S.TEXT)
    yy = ty + title_size * 1.35
    if sub:
        c.text(x + 20, yy, sub, 15, "regular", S.TEXT_2)
        yy += 22
    if code:
        c.text(x + 20, yy, code, 14, "mono", accent)


def architecture(video=False):
    c = S.Canvas()
    title = "One rendering kernel, seven ways to schedule it" if video else "Helios architecture"
    c.header("Architecture   ·   frozen source e2c13e2", title,
             None if video else "Every backend calls the same render_tile; backends differ only in who renders which tile, and when.")
    # --- left: the rendering pipeline (src/core.cpp) ---
    lx, lw = 72, 700
    c.eyebrow(lx, 196, "Shared rendering pipeline   ·   src/core.cpp", fill=S.TEXT_2)
    steps = [
        ("Scene + BVH + camera", "built-in procedural scene, median-split BVH", "make_scene · build_bvh · Camera"),
        ("Stable 16×16 tiles", "row-major tile IDs: the unit of work for every backend", "make_tiles"),
        ("Deterministic sampling", "one RNG per (seed, pixel, sample): order-independent", "Rng{mix64(seed^mix64(pixel)^mix64(sample))}"),
        ("Path tracing", "camera ray, bounces, next-event shadow rays", "trace"),
        ("BVH traversal", "skip every box the ray misses; fixed 64-slot stack", "Scene::hit"),
    ]
    y, bh, gap = 228, 90, 12
    for i, (t, s, code) in enumerate(steps):
        box(c, lx, y, lw, bh, t, s, code)
        if i < len(steps) - 1:
            c.arrow(lx + 60, y + bh + 2, lx + 60, y + bh + gap - 2, fill=S.MUTED, width=2, head=9)
        y += bh + gap
    # kernel bar
    ky = y + 6
    c.rect(lx, ky, lx + lw, ky + 110, fill=(12, 44, 48), outline=S.ACCENT, width=2.5, radius=14)
    c.text(lx + 24, ky + 20, "render_tile(scene, camera, config, tile, threads)", 22, "monobold", S.ACCENT)
    c.text(lx + 24, ky + 56, "the only sampling code · returns 8-bit RGB tile bytes + counters", 16, "regular", S.TEXT)
    c.text(lx + 24, ky + 80, "threads > 1: #pragma omp parallel / omp for over the tile's pixels", 15, "mono", S.TEXT_2)
    kx_out, ky_mid = lx + lw, ky + 55
    # --- right: execution backends (src/main.cpp) ---
    rx, rw = 900, 948
    c.eyebrow(rx, 196, "Execution backends   ·   src/main.cpp", fill=S.TEXT_2)
    groups = [
        ("run_local", [("Sequential", "all tiles in order, 1 thread", S.WORKER[0]),
                       ("OpenMP", "#pragma omp parallel for over tiles (schedule static by default)", S.WORKER[1])]),
        ("run_mpi   static branch", [("MPI static", "rank r renders tiles [n·r/R, n·(r+1)/R), sends bytes to rank 0", S.WORKER[3]),
                                     ("Hybrid static", "same ranges; OpenMP threads inside each tile", S.WORKER[2])]),
        ("run_mpi   coordinator / worker", [("MPI dynamic", "rank 0 coordinates; 1 tile per assignment", S.WORKER[3]),
                                            ("Hybrid dynamic", "same protocol; threads inside each tile", S.WORKER[2]),
                                            ("Hybrid adaptive", "batch size from measured throughput (batch_size)", S.WORKER[2])]),
    ]
    y = 228
    anchors = []
    for gname, items in groups:
        gh = 44 + len(items) * 56
        c.rect(rx, y, rx + rw, y + gh, fill=(14, 21, 30), outline=S.PANEL_EDGE, width=1, radius=12)
        c.text(rx + 20, y + 14, gname, 15, "mono", S.MUTED)
        for k, (name, desc, col) in enumerate(items):
            iy = y + 40 + k * 56
            c.rect(rx + 16, iy, rx + rw - 16, iy + 48, fill=S.PANEL, outline=col + (150,), width=1.2, radius=9)
            c.circle(rx + 38, iy + 24, 7, fill=col)
            c.text(rx + 56, iy + 24, name, 19, "semibold", S.TEXT, anchor="lm")
            c.text(rx + 262, iy + 24, desc, 15, "regular", S.TEXT_2, anchor="lm")
        anchors.append((rx, y + gh / 2))
        y += gh + 14
    for ax, ay in anchors:
        mx = (kx_out + ax) / 2
        c.line([(kx_out, ky_mid), (mx, ky_mid), (mx, ay)], fill=S.ACCENT + (150,), width=2)
        c.arrow(mx, ay, ax - 4, ay, fill=S.ACCENT, width=2, head=9)
    # coordinator protocol strip
    py = y + 4
    c.rect(rx, py, rx + rw, py + 118, fill=(14, 21, 30), outline=S.PANEL_EDGE, width=1, radius=12)
    c.text(rx + 20, py + 14, "coordinator / worker protocol (dynamic and adaptive)", 15, "mono", S.MUTED)
    nodes = [("rank 0", "coordinator", S.WORKER[0]), ("rank 1", "worker", S.WORKER[1]), ("rank 2", "worker", S.WORKER[2])]
    nx = [rx + 70, rx + 520, rx + 800]
    for (n, role, col), x in zip(nodes, nx):
        c.circle(x, py + 74, 24, fill=col + (60,), outline=col, width=2)
        c.text(x, py + 70, n, 14, "semibold", S.TEXT, anchor="mm")
        c.text(x, py + 104, role, 13, "regular", S.TEXT_2, anchor="mm")
    c.arrow(nx[0] + 30, py + 62, nx[1] - 30, py + 62, fill=S.AMBER, width=2, head=9)
    c.text((nx[0] + nx[1]) / 2, py + 48, "MPI_Send {first tile, count}", 14, "mono", S.AMBER, anchor="mm")
    c.arrow(nx[1] - 30, py + 86, nx[0] + 30, py + 86, fill=S.GOOD, width=2, head=9)
    c.text((nx[0] + nx[1]) / 2, py + 102, "tile bytes → MPI_Recv(MPI_ANY_SOURCE)", 14, "mono", S.GOOD, anchor="mm")
    c.line([(nx[1] + 30, py + 74), (nx[2] - 30, py + 74)], fill=S.MUTED, width=1)
    c.text((nx[1] + nx[2]) / 2, py + 60, "…", 18, "regular", S.MUTED, anchor="mm")
    # output
    oy = max(ky + 110, py + 118) + 16
    assert oy + 50 < 1012, oy
    c.rect(72, oy, 1848, oy + 50, fill=(14, 21, 30), outline=S.PANEL_EDGE, width=1, radius=12)
    c.text(96, oy + 25, "Image assembly → binary PPM + JSON telemetry (render time, counters, per-worker compute, scheduler trace)",
           18, "regular", S.TEXT, anchor="lm")
    c.text(1824, oy + 25, "same FNV-1a hash on every backend", 17, "mono", S.ACCENT, anchor="rm")
    c.footer("src/core.cpp (make_scene, build_bvh, Camera, make_tiles, render_tile, trace, Scene::hit) · "
             "src/main.cpp (run_local, run_mpi, batch_size)")
    c.save(OUT / ("architecture-video.png" if video else "architecture-report.png"))


def parallelism_layers():
    c = S.Canvas()
    c.header("Parallelism layers   ·   hybrid MPI + OpenMP", "How Helios splits one image across processes and threads",
             "Example: hybrid 1 coordinator + 2 worker ranks × 2 OpenMP threads (the configuration of the report's end-to-end run)")
    layers = [
        ("IMAGE", "800×450 pixels, one deterministic result", None),
        ("TILES", "16×16 microtiles with stable row-major IDs · unit of scheduling and of MPI messages", S.WORKER[0]),
        ("MPI RANKS", "separate processes, no shared memory · rank 0 coordinates, ranks 1..R render", S.WORKER[3]),
        ("OPENMP THREADS", "inside one rank: threads split one tile's pixels (omp for schedule(static))", S.WORKER[2]),
        ("PIXELS × SAMPLES", "each sample seeded from (seed, pixel, sample) · accumulated in order", S.WORKER[1]),
        ("RAYS", "camera ray, bounces, shadow rays · BVH traversal per ray", S.AMBER),
    ]
    x0, w, y, h, gap = 72, 1000, 206, 108, 18
    for i, (name, desc, col) in enumerate(layers):
        inset = i * 26
        yy = y + i * (h + gap)
        colr = col or S.TEXT
        c.rect(x0 + inset, yy, x0 + w - inset, yy + h, fill=S.PANEL, outline=colr + (170,), width=1.5, radius=12)
        c.text(x0 + inset + 24, yy + 22, name, 22, "semibold", colr, spacing=1.5)
        c.wrap(x0 + inset + 24, yy + 58, desc, w - 2 * inset - 48, 16, "regular", S.TEXT_2)
        if i < len(layers) - 1:
            c.arrow(x0 + w / 2, yy + h + 1, x0 + w / 2, yy + h + gap - 1, fill=S.MUTED, width=2, head=8)
    # right: concrete picture using the real showcase render
    rx, ry, rw = 1140, 206, 708
    g = SHOWCASE / "gallery" / "showcase-hero.png"
    im = Image.open(g).convert("RGB") if g.exists() else None
    th = rw * 9 / 16
    if im:
        c.paste(im, rx, ry, w=rw, radius=10)
    tile = rw / 16
    owners = {}
    for tid in range(144):
        owners[tid] = 1 if (tid // 3) % 2 == 0 else 2  # schematic ownership pattern (not a trace)
    for tid in range(144):
        col, row = tid % 16, tid // 16
        wc = S.WORKER[owners[tid]]
        c.rect(rx + col * tile, ry + row * tile * 9 / 9 * (th / (9 * tile)), rx + (col + 1) * tile,
               ry + (row + 1) * tile * (th / (9 * tile)), outline=wc + (120,), width=1)
    c.text(rx, ry + th + 14, "Tile grid over a real Helios render (showcase). Colours illustrate", 15, "regular", S.MUTED)
    c.text(rx, ry + th + 36, "two ranks owning tiles; real assignments are in the scheduler visuals.", 15, "regular", S.MUTED)
    # zoom into one tile -> two threads
    zx, zy, zs = rx + 60, ry + th + 90, 240
    c.rect(zx, zy, zx + zs, zy + zs, fill=S.PANEL, outline=S.WORKER[1], width=2, radius=6)
    for r in range(8):
        col = S.WORKER[2] if r < 4 else S.AMBER
        c.rect(zx + 8, zy + 8 + r * (zs - 16) / 8, zx + zs - 8, zy + 8 + (r + 1) * (zs - 16) / 8 - 3, fill=col + (70,))
    c.text(zx + zs + 24, zy + 30, "one 16×16 tile on rank 1", 17, "semibold", S.WORKER[1])
    c.text(zx + zs + 24, zy + 60, "thread 0: first 128 pixels", 16, "mono", S.WORKER[2])
    c.text(zx + zs + 24, zy + 86, "thread 1: last 128 pixels", 16, "mono", S.AMBER)
    c.text(zx + zs + 24, zy + 122, "static split of the pixel loop", 15, "regular", S.TEXT_2)
    c.text(zx + zs + 24, zy + 144, "(src/core.cpp, render_tile)", 15, "mono", S.MUTED)
    c.footer("src/core.cpp render_tile · src/main.cpp run_mpi · schematic, not measured data")
    c.save(OUT / "parallelism-layers.png")


if __name__ == "__main__":
    architecture(False)
    architecture(True)
    parallelism_layers()
