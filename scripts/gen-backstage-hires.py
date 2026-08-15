#!/usr/bin/env python3
"""Build the hi-res versions the Backstage lightbox opens.

The grid images are 1376x768 — fine as cards, soft the moment you open one full-screen on a
big display. This re-renders each frame at 2K (2752x1536) with Gemini, asking it to reproduce
the SAME photograph rather than invent a new one, so the approved composition survives.

2K, not 4K, on purpose: 4K lands at ~7.9MB raw (~64MB across the set) for detail nobody can
resolve in a lightbox, while 2K re-encoded at q82 is ~0.7MB — smaller than the ORIGINAL file
at four times the pixels. The re-encode is the whole trick; the raw API output is 3MB.

    python3 scripts/gen-backstage-hires.py            # everything missing
    python3 scripts/gen-backstage-hires.py kiki       # only ids containing "kiki"
    FORCE=1 python3 scripts/gen-backstage-hires.py    # redo existing

Requires geminiapikey and Pillow. Writes public/assets/backstage/hd/<id>.jpg
"""
import base64, io, json, os, re, sys, urllib.request
from pathlib import Path
from PIL import Image

KEY = os.environ.get("geminiapikey")
if not KEY:
    sys.exit("[hires] missing env var geminiapikey")

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src/data/backstage.ts"
OUT_DIR = ROOT / "public/assets/backstage/hd"
MODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-3-pro-image")
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={KEY}"

PROMPT = (
    "Reproduce this exact photograph faithfully at higher resolution: identical framing, "
    "identical people, identical faces, identical pose, clothing, lighting and colour. Only add "
    "fine photographic detail, texture and sharpness. Do NOT change the composition, do NOT "
    "re-pose anyone, do NOT invent new elements, and do NOT add any text or lettering."
)

# id -> source image, straight out of the data file so the two can never drift apart.
pairs = re.findall(r"id:\s*'([^']+)'[^}]*?image:\s*'([^']+)'", DATA.read_text(), re.S)
if not pairs:
    sys.exit("[hires] could not read any frames from src/data/backstage.ts")

only = sys.argv[1] if len(sys.argv) > 1 else None
force = os.environ.get("FORCE") == "1"
OUT_DIR.mkdir(parents=True, exist_ok=True)

jobs = [(i, p) for i, p in pairs if not only or only in i]
jobs = [(i, p) for i, p in jobs if force or not (OUT_DIR / f"{i}.jpg").exists()]
print(f"[hires] {len(jobs)} frame(s) to render at 2K")

ok = fail = 0
for frame_id, rel in jobs:
    src = ROOT / ("public" + rel)
    if not src.exists():
        print(f"  ? {frame_id} — source missing ({rel})")
        fail += 1
        continue
    print(f"  • {frame_id} ... ", end="", flush=True)
    body = json.dumps({
        "contents": [{"role": "user", "parts": [
            {"inline_data": {"mime_type": "image/jpeg",
                             "data": base64.b64encode(src.read_bytes()).decode()}},
            {"text": PROMPT},
        ]}],
        "generationConfig": {"responseModalities": ["IMAGE"],
                             "imageConfig": {"imageSize": "2K"}},
    }).encode()
    try:
        req = urllib.request.Request(URL, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=240) as r:
            payload = json.load(r)
        parts = payload["candidates"][0]["content"].get("parts", [])
        b64 = next((p.get("inlineData", p.get("inline_data", {})).get("data") for p in parts
                    if p.get("inlineData", p.get("inline_data", {})).get("data")), None)
        if not b64:
            raise RuntimeError(str(payload)[:160])
        im = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
        dst = OUT_DIR / f"{frame_id}.jpg"
        # The re-encode is what makes this shippable: the raw output is ~3MB a frame.
        im.save(dst, quality=82, optimize=True, progressive=True)
        print(f"OK {im.size[0]}x{im.size[1]} ({dst.stat().st_size/1048576:.2f} MB)")
        ok += 1
    except Exception as e:
        print(f"FAIL — {str(e).splitlines()[0][:150]}")
        fail += 1

print(f"[hires] {ok} ok, {fail} failed")
sys.exit(1 if fail and not ok else 0)
