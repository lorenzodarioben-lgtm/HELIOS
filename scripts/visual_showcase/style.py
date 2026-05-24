"""Helios showcase design system: palette, fonts and a supersampled drawing canvas.

All graphics are laid out in logical 1920x1080 units and drawn at SS x resolution, then
downsampled (Lanczos) so lines and shapes are antialiased. Text uses Segoe UI; numbers,
IDs and code use Consolas; the HELIOS wordmark uses Bahnschrift.
"""
from functools import lru_cache

from PIL import Image, ImageDraw, ImageFont

# Palette
BG = (10, 15, 22)
BG_2 = (15, 22, 31)
PANEL = (18, 27, 38)
PANEL_EDGE = (36, 50, 66)
GRID = (21, 30, 41)
TEXT = (232, 238, 243)
TEXT_2 = (160, 176, 192)
MUTED = (104, 120, 138)
ACCENT = (52, 197, 208)      # Helios cyan-teal
ACCENT_DIM = (26, 92, 100)
AMBER = (242, 184, 75)       # active work / bottleneck highlight
CORAL = (236, 112, 99)       # used sparingly: "slower"
GOOD = (110, 208, 140)
# Worker / rank colours (distinct under common colour-vision deficiencies: blue-cyan vs violet vs amber)
WORKER = {0: (150, 160, 172), 1: (52, 197, 208), 2: (167, 139, 250), 3: (242, 184, 75), 4: (110, 208, 140)}
# Build colours for before/after charts
BUILD = {"prefix": (104, 120, 138), "counter": (167, 139, 250), "both": (52, 197, 208)}

FONT_DIR = "C:/Windows/Fonts/"
FONTS = {"regular": "segoeui.ttf", "semibold": "seguisb.ttf", "bold": "segoeuib.ttf", "light": "segoeuil.ttf",
         "mono": "consola.ttf", "monobold": "consolab.ttf", "brand": "bahnschrift.ttf"}


@lru_cache(maxsize=None)
def font(kind: str, px: float):
    f = ImageFont.truetype(FONT_DIR + FONTS[kind], max(1, int(round(px))))
    if kind == "brand":
        try:
            f.set_variation_by_name("SemiBold")
        except Exception:
            pass
    return f


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


class Canvas:
    """Logical-coordinate drawing surface with supersampling."""

    def __init__(self, w=1920, h=1080, ss=2, bg=BG, texture=True):
        self.w, self.h, self.ss = w, h, ss
        self.img = Image.new("RGB", (w * ss, h * ss), bg)
        self.d = ImageDraw.Draw(self.img, "RGBA")
        if texture:
            self.texture()

    def s(self, v):
        return int(round(v * self.ss))

    def box(self, x0, y0, x1, y1):
        return [self.s(x0), self.s(y0), self.s(x1), self.s(y1)]

    def texture(self, step=48):
        """Subtle technical grid plus a faint vignette glow at the top left."""
        for x in range(0, self.w + 1, step):
            self.d.line([self.s(x), 0, self.s(x), self.s(self.h)], fill=GRID + (140,), width=self.s(1))
        for y in range(0, self.h + 1, step):
            self.d.line([0, self.s(y), self.s(self.w), self.s(y)], fill=GRID + (140,), width=self.s(1))

    def rect(self, x0, y0, x1, y1, fill=None, outline=None, width=1, radius=0):
        if radius:
            self.d.rounded_rectangle(self.box(x0, y0, x1, y1), radius=self.s(radius), fill=fill,
                                     outline=outline, width=self.s(width) if outline else 0)
        else:
            self.d.rectangle(self.box(x0, y0, x1, y1), fill=fill, outline=outline,
                             width=self.s(width) if outline else 0)

    def panel(self, x0, y0, x1, y1, radius=14, fill=PANEL, edge=PANEL_EDGE):
        self.rect(x0, y0, x1, y1, fill=fill, outline=edge, width=1.2, radius=radius)

    def line(self, pts, fill=TEXT_2, width=2):
        self.d.line([self.s(v) for p in pts for v in p], fill=fill, width=self.s(width))

    def arrow(self, x0, y0, x1, y1, fill=ACCENT, width=3, head=12):
        import math
        self.line([(x0, y0), (x1, y1)], fill=fill, width=width)
        a = math.atan2(y1 - y0, x1 - x0)
        pts = [(x1, y1), (x1 - head * math.cos(a - 0.45), y1 - head * math.sin(a - 0.45)),
               (x1 - head * math.cos(a + 0.45), y1 - head * math.sin(a + 0.45))]
        self.d.polygon([self.s(v) for p in pts for v in p], fill=fill)

    def circle(self, x, y, r, fill=None, outline=None, width=1):
        self.d.ellipse(self.box(x - r, y - r, x + r, y + r), fill=fill, outline=outline,
                       width=self.s(width) if outline else 0)

    def text(self, x, y, s, size=24, kind="regular", fill=TEXT, anchor="la", spacing=0):
        f = font(kind, size * self.ss)
        if spacing:  # manual letter spacing (used for the wordmark and eyebrow labels)
            total = sum(f.getlength(ch) for ch in s) + self.s(spacing) * (len(s) - 1)
            cx = self.s(x) - (total if anchor[0] == "r" else total / 2 if anchor[0] == "m" else 0)
            for ch in s:
                self.d.text((cx, self.s(y)), ch, font=f, fill=fill, anchor="l" + anchor[1])
                cx += f.getlength(ch) + self.s(spacing)
            return total / self.ss
        self.d.text((self.s(x), self.s(y)), s, font=f, fill=fill, anchor=anchor)
        return f.getlength(s) / self.ss

    def text_width(self, s, size=24, kind="regular"):
        return font(kind, size * self.ss).getlength(s) / self.ss

    def wrap(self, x, y, s, max_w, size=24, kind="regular", fill=TEXT, line_h=1.35):
        words, line, yy = s.split(), "", y
        for w in words:
            trial = (line + " " + w).strip()
            if self.text_width(trial, size, kind) > max_w and line:
                self.text(x, yy, line, size, kind, fill)
                yy += size * line_h
                line = w
            else:
                line = trial
        if line:
            self.text(x, yy, line, size, kind, fill)
            yy += size * line_h
        return yy

    def paste(self, im, x, y, w=None, h=None, radius=0):
        """Paste a PIL image at logical (x, y), resized to logical (w, h)."""
        if w or h:
            ow, oh = im.size
            w = w or ow * h / oh
            h = h or oh * w / ow
            im = im.resize((self.s(w), self.s(h)), Image.LANCZOS)
        if radius:
            mask = Image.new("L", im.size, 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], radius=self.s(radius), fill=255)
            self.img.paste(im.convert("RGB"), (self.s(x), self.s(y)), mask)
        else:
            self.img.paste(im.convert("RGB"), (self.s(x), self.s(y)))

    def eyebrow(self, x, y, s, fill=ACCENT, size=15):
        return self.text(x, y, s.upper(), size, "semibold", fill, spacing=2.2)

    def header(self, eyebrow, title, subtitle=None, x=72, y=58):
        self.eyebrow(x, y, eyebrow)
        self.text(x, y + 26, title, 44, "semibold", TEXT)
        if subtitle:
            self.text(x, y + 86, subtitle, 21, "regular", TEXT_2)

    def footer(self, source, x=72, note=None):
        y = self.h - 44
        self.line([(x, y - 18), (self.w - x, y - 18)], fill=PANEL_EDGE, width=1)
        self.text(x, y, source, 15, "mono", MUTED)
        if note:
            self.text(x, y + 20, note, 14, "regular", MUTED)
        self.wordmark(self.w - x, y - 2, size=20, anchor="ra")

    def wordmark(self, x, y, size=20, anchor="la", fill=TEXT):
        """Simple HELIOS wordmark: letter-spaced Bahnschrift with a small cyan sun-dot."""
        w = self.text(x, y, "HELIOS", size, "brand", fill, anchor=anchor, spacing=size * 0.28)
        x0 = x - w if anchor[0] == "r" else x
        self.circle(x0 - size * 0.55, y + size * 0.62, size * 0.2, fill=ACCENT)
        return w

    def chip(self, x, y, s, fill=ACCENT_DIM, color=TEXT, size=15):
        w = self.text_width(s, size, "semibold") + 22
        self.rect(x, y, x + w, y + size + 14, fill=fill, radius=(size + 14) / 2)
        self.text(x + 11, y + 7, s, size, "semibold", color)
        return w

    def finish(self):
        return self.img.resize((self.w, self.h), Image.LANCZOS) if self.ss != 1 else self.img.copy()

    def save(self, path, **kw):
        from pathlib import Path
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.finish().save(path, optimize=True, **kw)
        return path
