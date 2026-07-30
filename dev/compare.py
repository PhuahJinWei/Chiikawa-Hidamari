"""Diff two golden contact sheets, tile by tile.

    python dev/compare.py goldens/before.png goldens/after.png

Prints one line per tile — station, hour, mean and max channel delta — and exits
1 if anything moved. With --write it also drops a third image beside the second
sheet showing where.

The sheets come from goldens.html; see LIGHTING_REWORK.md for what the phases
are and which of them are supposed to show a difference. This only reports; it
has no opinion about which changes are wanted.

Needs Pillow (`pip install pillow`). Falls back to a whole-image byte compare if
Pillow is missing, which still answers the only question that matters for a
"zero diff" phase.
"""

import argparse
import hashlib
import os
import sys

# This prints em dashes, and a Windows console is not on UTF-8 by default: on a
# Japanese install stdout is cp932 and the first one raises UnicodeEncodeError.
# It bit on the "sheets are different sizes" path, so the tool crashed instead
# of explaining the thing it had correctly detected. Nothing here is worth
# failing over, so anything unencodable is replaced rather than fatal.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

# Kept in step with the constants at the top of js/goldens.js. If a tile ever
# lands in the wrong place on the sheet, these are why.
TILE_W = 300
TILE_H = 400
LABEL_H = 20
GAP = 6

STATIONS = ["cave-lantern", "house-room", "doorstep", "house-outside", "pond", "sky"]
# In step with PHASES in js/daylight.js, which is what goldens.js lays the sheet
# out from. A row here that the sheet does not have reads the tile beside it and
# reports nonsense, so this list is not optional bookkeeping.
PHASES = ["morning", "noon", "evening", "night", "midnight"]


def byte_compare(a_path, b_path):
    """The no-Pillow answer: same file or not."""
    with open(a_path, "rb") as fh:
        a = hashlib.sha256(fh.read()).hexdigest()
    with open(b_path, "rb") as fh:
        b = hashlib.sha256(fh.read()).hexdigest()
    if a == b:
        print("identical (sha256 match)")
        return 0
    print("DIFFERENT")
    print(f"  {os.path.basename(a_path)}  {a[:16]}")
    print(f"  {os.path.basename(b_path)}  {b[:16]}")
    print("\ninstall Pillow for a per-tile breakdown:  pip install pillow")
    return 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("before")
    ap.add_argument("after")
    ap.add_argument("--write", action="store_true",
                    help="save a difference image beside the second sheet")
    # Anti-aliasing and the last bit of a float are not news. Anything the eye
    # could see clears this comfortably.
    ap.add_argument("--tolerance", type=float, default=0.0,
                    help="mean delta below which a tile counts as unchanged")
    args = ap.parse_args()

    for path in (args.before, args.after):
        if not os.path.exists(path):
            print(f"no such sheet: {path}", file=sys.stderr)
            return 2

    try:
        from PIL import Image, ImageChops
    except ImportError:
        return byte_compare(args.before, args.after)

    a = Image.open(args.before).convert("RGB")
    b = Image.open(args.after).convert("RGB")

    if a.size != b.size:
        print(f"sheets are different sizes: {a.size} vs {b.size}")
        print("(a station was added or removed — the tiles do not line up)")
        return 1

    diff = ImageChops.difference(a, b)
    moved = 0

    print(f"{'station':<16} {'hour':<9} {'mean':>8} {'max':>5}")
    print("-" * 42)

    for row, station in enumerate(STATIONS):
        for col, phase in enumerate(PHASES):
            x = GAP + col * (TILE_W + GAP)
            y = GAP + row * (TILE_H + LABEL_H + GAP) + LABEL_H
            if x + TILE_W > a.width or y + TILE_H > a.height:
                continue
            tile = diff.crop((x, y, x + TILE_W, y + TILE_H))
            lo, hi = tile.getextrema()[0][0], max(ch[1] for ch in tile.getextrema())
            # Mean over every channel of every pixel.
            hist = tile.histogram()
            total = 0
            for ch in range(3):
                band = hist[ch * 256:(ch + 1) * 256]
                total += sum(v * n for v, n in enumerate(band))
            mean = total / (TILE_W * TILE_H * 3)

            if hi > 0 and mean > args.tolerance:
                moved += 1
                print(f"{station:<16} {phase:<9} {mean:>8.3f} {hi:>5}   <-- moved")
            else:
                print(f"{station:<16} {phase:<9} {mean:>8.3f} {hi:>5}")

    print("-" * 42)
    if moved:
        print(f"{moved} tile(s) moved")
    else:
        print("no tile moved")

    if args.write:
        # Stretched, because a real regression is often a couple of levels and
        # invisible at 1:1.
        out = os.path.join(os.path.dirname(os.path.abspath(args.after)), "diff.png")
        diff.point(lambda v: min(255, v * 8)).save(out)
        print(f"difference image: {out}  (x8)")

    return 1 if moved else 0


if __name__ == "__main__":
    sys.exit(main())
