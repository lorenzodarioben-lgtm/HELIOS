"""Convert Helios P6 output to PNG using only Python's standard library."""
import argparse
import struct
import zlib
from pathlib import Path


def chunk(kind, payload):
    body = kind + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xffffffff)


def convert(source, destination):
    data = source.read_bytes()
    header = data.split(b"\n", 3)
    if len(header) != 4 or header[0] != b"P6" or header[2] != b"255":
        raise ValueError("expected Helios P6 PPM")
    width, height = map(int, header[1].split())
    pixels = header[3]
    if len(pixels) != width * height * 3:
        raise ValueError("PPM pixel count mismatch")
    scanlines = b"".join(b"\x00" + pixels[y * width * 3:(y + 1) * width * 3]
                         for y in range(height))
    png = (b"\x89PNG\r\n\x1a\n" +
           chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) +
           chunk(b"IDAT", zlib.compress(scanlines, 6)) + chunk(b"IEND", b""))
    destination.write_bytes(png)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    convert(args.source, args.destination)
