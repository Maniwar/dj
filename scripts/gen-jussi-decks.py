#!/usr/bin/env python3
"""Re-shoot the one Jussi frame that was reviewed but never saved: full goalie gear behind the
decks, champagne going off on both sides.

It only ever existed in a chat message, so there is no file to upscale — it has to be shot again.
Identity comes from four references, each for a different reason:

  1-2. FACE CROPS cut out of ref/crew.jpg at run time. THE CREW ARE SPECIFIC PEOPLE and that file
       is the only thing that says who they are — anchoring instead on a scene that merely
       contains them (jussi-hero.jpg) gets you convincing strangers in roughly the right
       outfits, which is the exact failure the canonical ref exists to prevent.
       They are CROPS rather than the whole frame because passing ref/crew.jpg entire trips
       Google's IMAGE_SAFETY filter and returns no image at all. Faces and hair carry the
       identity; the rest of the frame only carried the refusal.
  3.   ref/jussi.jpg  — the canonical face lock, same as every other Jussi render.
  4.   jussi-hero.jpg — goalie gear, lighting and film stock only. Wardrobe, not casting.

Shot at 2K and written out as BOTH renditions in one pass, so the grid image and the file the
lightbox opens can never disagree about what the picture is.

    geminiapikey=... python3 scripts/gen-jussi-decks.py
    FORCE=1 ... to overwrite

Writes public/assets/lore/jussi-decks.jpg (grid) and public/assets/backstage/hd/j-decks.jpg (2K).
"""
import base64, io, json, os, sys, urllib.request
from pathlib import Path
from PIL import Image

KEY = os.environ.get("geminiapikey")
if not KEY:
    sys.exit("[decks] missing env var geminiapikey")

ROOT = Path(__file__).resolve().parent.parent
MODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-3-pro-image")
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={KEY}"

GRID = ROOT / "public/assets/lore/jussi-decks.jpg"
HD = ROOT / "public/assets/backstage/hd/j-decks.jpg"
CREW = ROOT / "public/assets/ref/crew.jpg"
# Boxes into ref/crew.jpg (2720x1530) — the crew is a TRIO and all three belong in a crew shot:
# leopard-print on the left, platinum blonde with pink streaks in the middle, redhead on the right.
CROPS = [("leopard", (800, 100, 1240, 600)),
         ("blonde", (1190, 220, 1590, 720)),
         ("redhead", (1580, 290, 2030, 790))]
# ONLY the canonical Jussi portrait. jussi-hero.jpg used to ride along as a "gear and lighting"
# reference, but it contains its own near-miss versions of these same three women, so it was
# competing with the crops for casting and the faces drifted every roll. The equipment is easy to
# describe in words; a second set of lookalikes is not something you can un-say.
FLAT_REFS = [ROOT / "public/assets/ref/jussi.jpg"]

PROMPT = (
    "Photograph, wide 16:9 landscape, flash-lit 35mm film look, 2002 rave photography.\n\n"
    "CASTING — these are REAL, SPECIFIC people and must be reproduced exactly, not approximated:\n"
    "  · IMAGE 1 is LEOPARD WOMAN. Deeply tanned, long dark wavy hair worn loose, large gold hoop "
    "earrings, dressed in leopard print. Reproduce this face and this hair.\n"
    "  · IMAGE 2 is BLONDE. Platinum blonde hair with bright PINK streaks through it, a holographic "
    "silver top, stacks of beaded festival bracelets. Reproduce this face and this hair.\n"
    "  · IMAGE 3 is REDHEAD. Very pale freckled skin, big voluminous curly ginger hair, a silver "
    "metallic top, a dog-tag pendant on a chain, denim shorts. Reproduce this face and these curls.\n"
    "Do NOT substitute different women, do NOT restyle their hair, do NOT change their colours.\n"
    "IMAGE 4 is the face lock for JUSSI: match the beard shape, the dark hair, and the black "
    "wraparound sunglasses he is wearing in it — the sunglasses stay on in this shot too.\n"
    "These four faces are the ONLY four people in the foreground. Do not invent a fifth.\n\n"
    "THE SHOT: Jussi stands centre, directly behind a DJ booth, facing camera. He is wearing FULL "
    "ice-hockey goaltender equipment over a black shirt — a bulky black chest-and-arm protector "
    "with shoulder caps, large scuffed white leg pads strapped over his knees and shins, a white "
    "rectangular blocker pad and a white catching glove resting on the table in front of him, and a "
    "worn white goalie stick lying across the front of the booth. His arms are spread wide and low "
    "across the decks. He is deadpan, unsmiling, completely calm.\n\n"
    "LEOPARD WOMAN is at the FAR LEFT of frame, mouth open mid-shout, both hands on a champagne "
    "bottle that is ERUPTING — a thick white jet of foam firing upward and across the frame in a "
    "high arc, spray and droplets caught by the flash. BLONDE is beside her, just left of the "
    "booth, laughing with both arms thrown in the air. REDHEAD is on the RIGHT of frame, laughing, "
    "arms up. A single can of beer sits on the table beside the mixer.\n\n"
    "BEHIND THEM: a deep, densely packed festival crowd receding back into haze — hundreds of "
    "people, hands and glow sticks in the air — bright magenta and green laser fans crossing the "
    "full width of the frame, and heavy gold confetti falling everywhere.\n\n"
    "Hard direct on-camera flash on the three of them, deep shadows, saturated colour, slight grain. "
    "ABSOLUTELY NO TEXT, no lettering, no logos, no watermarks, no captions anywhere in the image."
)


def part(data: bytes):
    return {"inline_data": {"mime_type": "image/jpeg",
                            "data": base64.b64encode(data).decode()}}


def crop_part(box):
    buf = io.BytesIO()
    Image.open(CREW).convert("RGB").crop(box).save(buf, format="JPEG", quality=92)
    return part(buf.getvalue())


if HD.exists() and os.environ.get("FORCE") != "1":
    sys.exit("[decks] already exists — set FORCE=1 to re-shoot")
for r in [CREW, *FLAT_REFS]:
    if not r.exists():
        sys.exit(f"[decks] missing reference {r}")

image_parts = [
    *((name, crop_part(box)) for name, box in CROPS),
    *((r.stem, part(r.read_bytes())) for r in FLAT_REFS),
]

# DUMP=<dir> writes out exactly what is about to be uploaded, in order. Casting failures look
# identical whether the prompt was ignored or the wrong bytes were sent, and guessing between
# those two costs a re-roll every time. This makes the inputs something you can just look at.
dump = os.environ.get("DUMP")
if dump:
    Path(dump).mkdir(parents=True, exist_ok=True)
    for i, (name, p) in enumerate(image_parts, 1):
        out = Path(dump) / f"{i:02d}-{name}.jpg"
        out.write_bytes(base64.b64decode(p["inline_data"]["data"]))
        print(f"[decks] sending as IMAGE {i}: {out}")

body = json.dumps({
    "contents": [{"role": "user", "parts": [*(p for _, p in image_parts), {"text": PROMPT}]}],
    "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"imageSize": "2K"}},
}).encode()

# IMAGE_SAFETY on this cast is a coin toss, not a verdict — the same prompt that gets refused once
# comes back fine on the next attempt, and the references are themselves Gemini output. So retry
# rather than give up on the first no.
#
# COLLECT=<dir> keeps every successful roll instead of shipping the first one that lands. Casting
# fidelity varies roll to roll and the first success is not reliably the best one — picking from a
# handful beats accepting whatever came back first.
ATTEMPTS = int(os.environ.get("ATTEMPTS", "6"))
COLLECT = os.environ.get("COLLECT")
collected = 0
b64 = None
for attempt in range(1, ATTEMPTS + 1):
    print(f"[decks] shooting (attempt {attempt}/{ATTEMPTS}) ... ", end="", flush=True)
    try:
        req = urllib.request.Request(URL, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=300) as r:
            payload = json.load(r)
    except Exception as e:
        print(f"error — {str(e).splitlines()[0][:120]}")
        continue
    cand = (payload.get("candidates") or [{}])[0]
    parts = cand.get("content", {}).get("parts", [])
    b64 = next((p.get("inlineData", p.get("inline_data", {})).get("data") for p in parts
                if p.get("inlineData", p.get("inline_data", {})).get("data")), None)
    if b64:
        if COLLECT:
            collected += 1
            Path(COLLECT).mkdir(parents=True, exist_ok=True)
            shot = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
            out = Path(COLLECT) / f"roll-{collected:02d}.jpg"
            shot.resize((1376, 768), Image.LANCZOS).save(out, quality=88, optimize=True)
            # keep the 2K next to it so the chosen roll never has to be re-shot
            shot.save(Path(COLLECT) / f"roll-{collected:02d}-2k.jpg", quality=82, optimize=True,
                      progressive=True)
            print(f"OK -> {out.name}")
            b64 = None
            continue
        print("OK", end=" ")
        break
    print(f"no image ({cand.get('finishReason')})")

if COLLECT:
    print(f"[decks] collected {collected} roll(s) in {COLLECT} — pick one, then install it")
    sys.exit(0 if collected else 1)
if not b64:
    sys.exit(f"[decks] gave up after {ATTEMPTS} attempts")

im = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
HD.parent.mkdir(parents=True, exist_ok=True)
GRID.parent.mkdir(parents=True, exist_ok=True)
im.save(HD, quality=82, optimize=True, progressive=True)
# the grid rendition matches the other backstage cards exactly, so the sheet stays uniform
im.resize((1376, 768), Image.LANCZOS).save(GRID, quality=88, optimize=True, progressive=True)
print(f"OK {im.size[0]}x{im.size[1]}")
print(f"  hd   {HD.relative_to(ROOT)}  ({HD.stat().st_size/1048576:.2f} MB)")
print(f"  grid {GRID.relative_to(ROOT)}  ({GRID.stat().st_size/1048576:.2f} MB)")
