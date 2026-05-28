"""Encode PIL frames to H.264 MP4 (and optional GIF) with the ffmpeg bundled by imageio-ffmpeg."""
import subprocess
from pathlib import Path

import imageio_ffmpeg


def encode(frames, out: Path, fps=30, size=(1920, 1080), crf=17):
    """frames: iterable of PIL RGB images of `size`. Returns the number of frames written."""
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{size[0]}x{size[1]}", "-r", str(fps), "-i", "-", "-c:v", "libx264", "-preset", "slow",
           "-crf", str(crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = 0
    for im in frames:
        if im.size != size:
            raise ValueError(f"frame {n} has size {im.size}, expected {size}")
        proc.stdin.write(im.convert("RGB").tobytes())
        n += 1
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError(f"ffmpeg failed for {out}")
    return n


def to_gif(mp4: Path, gif: Path, fps=12, width=960):
    """High-quality palette GIF preview from an MP4."""
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    vf = f"fps={fps},scale={width}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a"
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(mp4), "-vf", vf, str(gif)], check=True)


def probe(mp4: Path):
    """Return (frames, width, height, fps) by decoding the file (verifies it opens and every frame decodes)."""
    reader = imageio_ffmpeg.read_frames(str(mp4))
    meta = next(reader)
    n = sum(1 for _ in reader)
    return n, meta["size"][0], meta["size"][1], meta["fps"]
