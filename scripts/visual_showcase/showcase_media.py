"""Convergence, hero, branding and video B-roll from REAL Helios renders (presentation only).

  python showcase_media.py convergence | hero | branding | broll | reel | all

Pixels shown are the renderer's own output. Allowed operations: lossless conversion, Lanczos resizing,
cropping, and overlaid labels. No denoising, relighting or generated content. Convergence stages are
separated by hard cuts, so no blended (non-rendered) intermediate image is ever shown.
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFilter

import style as S
from common import SHOWCASE
from video import encode, probe, to_gif

CONV = SHOWCASE / "convergence"
VID = SHOWCASE / "video"
FPS = 30


def conv_frames():
    meta = json.loads((CONV / "convergence.json").read_text())
    return meta, [(f["spp"], Image.open(SHOWCASE.parents[1] / f["png"]).convert("RGB"), f) for f in meta["frames"]]


def label_chip(c, x, y, text, size=22, fill=(8, 12, 18, 200), fg=S.TEXT):
    w = c.text_width(text, size, "monobold") + 26
    c.rect(x, y, x + w, y + size + 18, fill=fill, radius=8)
    c.text(x + 13, y + 9, text, size, "monobold", fg)
    return w


def convergence_grid():
    meta, frames = conv_frames()
    k = meta["constant"]
    c = S.Canvas()
    c.header("Monte Carlo convergence   ·   real Helios renders",
             "More samples per pixel, less noise",
             f"{k['scene']} scene · {k['width']}×{k['height']} · depth {k['depth']} · seed {k['seed']} · openmp backend · "
             "only the number of samples per pixel changes")
    fw, fh, gx, gy, gap = 440, 247.5, 72, 204, 18
    for i, (spp, im, f) in enumerate(frames):
        col, row = i % 3, i // 3
        x, y = gx + col * (fw + gap), gy + row * (fh + gap)
        c.paste(im, x, y, w=fw, h=fh, radius=8)
        label_chip(c, x + 12, y + 12, f"{spp} SPP", 20)
    rx = gx + 3 * fw + 2 * gap + 44
    c.text(rx, gy + 4, "What changes", 22, "semibold")
    c.wrap(rx, gy + 44, "Each pixel averages SPP random light paths. At 1 SPP every pixel is a single random path, so "
           "neighbouring pixels disagree strongly. Doubling SPP halves the variance, so noise falls roughly with 1/√SPP.",
           1848 - rx, 17, "regular", S.TEXT_2)
    c.text(rx, gy + 250, "Render time (informational)", 17, "semibold", S.TEXT_2)
    for i, (spp, im, f) in enumerate(frames):
        c.text(rx, gy + 284 + i * 27, f"{spp:>4} SPP", 16, "mono", S.TEXT_2)
        c.text(1848, gy + 284 + i * 27, f"{f['render_seconds']:.2f} s", 16, "mono", S.TEXT, anchor="ra")
    c.text(rx, gy + 284 + 9 * 27 + 12, "cost grows linearly with SPP", 15, "regular", S.MUTED)
    c.footer("assets/showcase/convergence/convergence.json · scripts/visual_showcase/render_presentation.py convergence",
             note="Presentation renders, not formal benchmark evidence. Each panel is a separate full render; nothing is interpolated or denoised.")
    c.save(CONV / "convergence-grid.png")


def convergence_before_after():
    meta, frames = conv_frames()
    lo, hi = frames[0], frames[-1]
    c = S.Canvas()
    c.header("Monte Carlo convergence   ·   real Helios renders", f"{lo[0]} sample per pixel vs {hi[0]} samples per pixel",
             f"same scene, camera, seed and depth ({meta['constant']['scene']}, {meta['constant']['width']}×{meta['constant']['height']}); "
             "only SPP changes")
    fw, fh, y = 876, 492.75, 214
    for i, (spp, im, f) in enumerate((lo, hi)):
        x = 72 + i * (fw + 24)
        c.paste(im, x, y, w=fw, h=fh, radius=10)
        label_chip(c, x + 16, y + 16, f"{spp} SPP", 24)
        c.text(x, y + fh + 20, f"hash {f['hash_fnv1a64']}  ·  {f['render_seconds']:.2f} s", 16, "mono", S.MUTED)
    # 1:1 detail crops (native pixels, 2x nearest-neighbour so noise stays visible)
    box = (520, 300, 760, 420)
    for i, (spp, im, f) in enumerate((lo, hi)):
        x = 72 + i * (fw + 24)
        crop = im.crop(box).resize((480, 240), Image.NEAREST)
        c.paste(crop, x, y + fh + 64, w=480, h=240, radius=6)
        c.text(x + 500, y + fh + 70, "detail, 2× pixel zoom", 16, "semibold", S.TEXT_2)
        c.text(x + 500, y + fh + 96, f"pixels {box[0]}..{box[2]} × {box[1]}..{box[3]}", 15, "mono", S.MUTED)
    c.footer("assets/showcase/convergence/frames/ · presentation renders, not formal benchmark evidence")
    c.save(CONV / "convergence-before-after.png")


def overlay_frame(im, spp, i, n, k):
    c = S.Canvas(texture=False)
    c.paste(im, 0, 0, w=1920, h=1080)
    c.rect(0, 0, 1920, 110, fill=(6, 10, 15, 150))
    c.wordmark(72, 34, 26)
    c.text(300, 38, "Monte Carlo convergence  ·  real Helios renders", 22, "regular", S.TEXT_2)
    c.rect(1560, 22, 1848, 92, fill=(6, 10, 15, 200), outline=S.ACCENT, width=2, radius=12)
    c.text(1704, 57, f"{spp} SPP", 38, "monobold", S.ACCENT, anchor="mm")
    c.rect(0, 1010, 1920, 1080, fill=(6, 10, 15, 170))
    for j in range(n):
        x0 = 72 + j * 197
        c.rect(x0, 1036, x0 + 185, 1046, fill=S.ACCENT if j <= i else (60, 74, 90), radius=5)
    c.text(1848, 1020, f"{k['scene']} · {k['width']}×{k['height']} · seed {k['seed']} · only SPP changes · hard cuts between full renders",
           14, "regular", S.TEXT_2, anchor="ra")
    return c.finish()


def convergence_video():
    meta, frames = conv_frames()
    k = meta["constant"]
    holds = [0.62] * (len(frames) - 1) + [1.8]
    rendered = [overlay_frame(im, spp, i, len(frames), k) for i, (spp, im, f) in enumerate(frames)]

    def gen():
        for i, img in enumerate(rendered):
            for _ in range(int(round(holds[i] * FPS))):
                yield img
    n = encode(gen(), CONV / "convergence.mp4", fps=FPS)
    to_gif(CONV / "convergence.mp4", CONV / "convergence.gif", fps=10, width=720)
    return n


def hero():
    src = SHOWCASE / "gallery" / "reflective-hero.png"
    out = SHOWCASE / "hero"
    out.mkdir(parents=True, exist_ok=True)
    Image.open(src).save(out / "helios-hero.png", optimize=True)
    wide = SHOWCASE / "gallery" / "reflective-wide.png"
    if wide.exists():
        Image.open(wide).save(out / "helios-hero-wide.png", optimize=True)


def title_treatment(bg, size, sub=True, scrim_w=0.74):
    W, H = size
    import numpy as np
    c = S.Canvas(W, H, texture=False)
    # Smooth left-side scrim for legibility: a graphic overlay composited per pixel; the render underneath is unchanged.
    big = np.asarray(bg.convert("RGB").resize((c.s(W), c.s(H)), Image.LANCZOS), dtype=np.float32)
    x = np.linspace(0, 1, big.shape[1], dtype=np.float32)
    alpha = 0.18 + 0.74 * np.clip(1 - x / scrim_w, 0, 1) ** 1.7
    tint = np.array(S.BG, dtype=np.float32)
    out = big * (1 - alpha[None, :, None]) + tint * alpha[None, :, None]
    c.img.paste(Image.fromarray(out.clip(0, 255).astype(np.uint8)), (0, 0))
    s = H / 1080
    x = 110 * s
    c.circle(x + 26 * s, H * 0.40, 16 * s, fill=S.ACCENT)
    c.text(x + 70 * s, H * 0.40, "HELIOS", 150 * s, "brand", S.TEXT, anchor="lm", spacing=38 * s)
    if sub:
        c.text(x + 4 * s, H * 0.40 + 118 * s, "Adaptive Hybrid Distributed Path Tracing Engine", 40 * s, "light", S.TEXT)
        c.text(x + 4 * s, H * 0.40 + 178 * s, "C++20  ·  OpenMP  ·  MPI  ·  hybrid MPI + OpenMP  ·  static / dynamic / adaptive scheduling",
               22 * s, "regular", S.TEXT_2)
    c.text(W - 40 * s, H - 30 * s, "Background: real Helios render (reflective scene, 1024 SPP)", 15 * s, "regular", (200, 210, 220), anchor="rs")
    return c.finish()


def branding():
    out = SHOWCASE / "branding"
    out.mkdir(parents=True, exist_ok=True)
    bg = Image.open(SHOWCASE / "hero" / "helios-hero.png").convert("RGB")
    title_treatment(bg, (1920, 1080)).save(out / "helios-title-16x9.png", optimize=True)
    wide = SHOWCASE / "hero" / "helios-hero-wide.png"
    gbg = Image.open(wide).convert("RGB") if wide.exists() else bg
    gw, gh = 1280, 640
    r = gbg.size[0] / gbg.size[1]
    crop = gbg if abs(r - 2) < 0.01 else gbg.crop(((gbg.size[0] - int(gbg.size[1] * 2)) // 2, 0,
                                                   (gbg.size[0] + int(gbg.size[1] * 2)) // 2, gbg.size[1]))
    title_treatment(crop, (gw, gh), scrim_w=0.8).save(out / "helios-github-header.png", optimize=True)


# ------------------------------------------------------------------------------------------------ B-roll
def ease(t):
    return t * t * (3 - 2 * t)


def hero_pan(seconds=6):
    im = Image.open(SHOWCASE / "hero" / "helios-hero.png").convert("RGB")
    n = int(seconds * FPS)

    def gen():
        for k in range(n):
            t = ease(k / (n - 1))
            z = 1.0 + 0.07 * t
            w, h = 1920 / z, 1080 / z
            cx, cy = 960 + 40 * t, 540 + 20 * t
            x0 = min(max(cx - w / 2, 0), 1920 - w)
            y0 = min(max(cy - h / 2, 0), 1080 - h)
            box = (x0, y0, x0 + w, y0 + h)
            yield im.resize((1920, 1080), Image.LANCZOS, box=box)
    return encode(gen(), VID / "hero-slow-zoom.mp4", fps=FPS)


def still_hold(img, seconds):
    for _ in range(int(seconds * FPS)):
        yield img


def fade(a, b, seconds):
    n = int(seconds * FPS)
    for k in range(n):
        yield Image.blend(a, b, ease((k + 1) / n))


def reveal_video(frames_fn, steps, per_step, hold_end, out):
    imgs = [frames_fn(s) for s in steps]

    def gen():
        prev = None
        for i, img in enumerate(imgs):
            if prev is not None:
                yield from fade(prev, img, 0.25)
            yield from still_hold(img, per_step if i < len(imgs) - 1 else hold_end)
            prev = img
    return encode(gen(), out, fps=FPS)


def broll():
    import evidence_graphics as G
    VID.mkdir(parents=True, exist_ok=True)
    res = {}
    res["hero-slow-zoom.mp4"] = hero_pan()
    res["correctness-wall-reveal.mp4"] = reveal_video(lambda r: G.correctness_wall(reveal=r)[0],
                                                      [k / 7 for k in range(1, 8)], 0.45, 2.6, VID / "correctness-wall-reveal.mp4")
    res["performance-story-reveal.mp4"] = reveal_video(lambda r: G.storyboard_16x9(reveal=r),
                                                       list(range(1, 9)), 0.8, 3.0, VID / "performance-story-reveal.mp4")
    res["optimisation-reveal.mp4"] = reveal_video(lambda r: G.optimisation_before_after(reveal=r),
                                                  [0.34, 0.67, 1.0], 1.2, 3.0, VID / "optimisation-reveal.mp4")
    gallery = json.loads((SHOWCASE / "gallery" / "gallery.json").read_text())["renders"]
    order = ["reflective", "showcase", "bvh_stress", "uniform", "imbalanced", "scheduler_stress"]
    by = {g["scene"]: g for g in gallery}
    slides = []
    for sc in order:
        if sc not in by:
            continue
        g = by[sc]
        c = S.Canvas(texture=False)
        c.paste(Image.open(SHOWCASE.parents[1] / g["png"]).convert("RGB"), 0, 0, w=1920, h=1080)
        c.rect(0, 990, 1920, 1080, fill=(6, 10, 15, 165))
        c.wordmark(72, 1020, 22)
        c.text(260, 1035, f"{sc}", 24, "semibold", S.TEXT, anchor="lm")
        c.text(1848, 1035, f"real Helios render · {g['width']}×{g['height']} · {g['spp']} SPP · depth {g['max_depth']} · "
                           f"hash {g['hash_fnv1a64']}", 16, "mono", S.TEXT_2, anchor="rm")
        slides.append(c.finish())

    def gal():
        for i, img in enumerate(slides):
            if i:
                yield from fade(slides[i - 1], img, 0.5)
            yield from still_hold(img, 1.6)
    res["gallery-montage.mp4"] = encode(gal(), VID / "gallery-montage.mp4", fps=FPS)
    return res


def reel():
    """Silent ~28 s showcase reel assembled only from the finished assets."""
    import evidence_graphics as G
    title = Image.open(SHOWCASE / "branding" / "helios-title-16x9.png").convert("RGB")
    meta, frames = conv_frames()
    k = meta["constant"]
    conv = [overlay_frame(im, spp, i, len(frames), k) for i, (spp, im, f) in enumerate(frames)]
    comp = Image.open(SHOWCASE / "scheduler" / "scheduler-comparison-still.png").convert("RGB")
    wall = G.correctness_wall()[0]
    dash = Image.open(SHOWCASE / "performance" / "helios-performance-dashboard.png").convert("RGB")
    story = G.storyboard_16x9()
    import imageio_ffmpeg
    sched = [f for f in _decode(SHOWCASE / "scheduler" / "scheduler-comparison.mp4")]

    def gen():
        yield from still_hold(title, 3.0)
        yield from fade(title, conv[0], 0.4)
        for i, img in enumerate(conv):
            yield from still_hold(img, 0.45 if i < len(conv) - 1 else 0.9)
        yield from fade(conv[-1], sched[0], 0.4)
        step = max(1, len(sched) // int(6.5 * FPS))
        for f in sched[::step]:
            yield f
        yield from fade(sched[-1], wall, 0.4)
        yield from still_hold(wall, 3.2)
        yield from fade(wall, story, 0.4)
        yield from still_hold(story, 3.0)
        yield from fade(story, dash, 0.4)
        yield from still_hold(dash, 3.2)
        yield from fade(dash, title, 0.5)
        yield from still_hold(title, 2.0)
    return encode(gen(), VID / "helios-showcase-reel.mp4", fps=FPS)


def _decode(mp4):
    import imageio_ffmpeg
    r = imageio_ffmpeg.read_frames(str(mp4))
    meta = next(r)
    w, h = meta["size"]
    for buf in r:
        yield Image.frombytes("RGB", (w, h), bytes(buf))


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("convergence", "all"):
        convergence_grid()
        convergence_before_after()
        print("convergence.mp4 frames", convergence_video())
    if what in ("hero", "all"):
        hero()
    if what in ("branding", "all"):
        branding()
    if what in ("broll", "all"):
        print(broll())
    if what in ("reel", "all"):
        print("reel frames", reel())
