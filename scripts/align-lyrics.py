#!/usr/bin/env python3
"""
Forced alignment of the known lyrics to the actual audio -> real per-line timestamps.

Why this exists: lyrics.json has the words but no timing, so the site could only ESTIMATE
where you are in a song (progress x line-count), which visibly drifts around instrumental
intros, breakdowns and repeated choruses — and drifts differently for each version of a track.

How it works:
  1. Transcribe each audio file with word-level timestamps (faster-whisper, CPU, int8).
     The song's own lyrics are fed in as `initial_prompt` so the recogniser is biased toward
     the words we already know are coming — it only has to tell us WHEN, not WHAT.
  2. Align the known lyric tokens to the recognised tokens with difflib (monotonic matching
     blocks), which is robust to the ASR mis-hearing a sung word here and there.
  3. Each lyric line takes the timestamp of its first matched token; unmatched lines are filled
     by interpolating between their neighbours, and the whole series is forced non-decreasing.

Run (one-off, or whenever songs are added):
    python3 -m venv .venv-align && ./.venv-align/bin/pip install faster-whisper
    ./.venv-align/bin/python scripts/align-lyrics.py
    # options: ALIGN_MODEL=small ALIGN_ONLY=touch-my-subwoofer

Output: src/data/lyricTimings.json  ->  { "<versionId>": [t0, t1, ...] }  (seconds, per line)
"""
import json, os, re, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MP3_DIR = ROOT / "mp3"
OUT = ROOT / "src" / "data" / "lyricTimings.json"
CACHE = ROOT / ".align-cache"  # raw ASR word timings, so re-runs never re-transcribe
MODEL = os.environ.get("ALIGN_MODEL", "small")
ONLY = os.environ.get("ALIGN_ONLY")

NOTE_RE = re.compile(r"^[(\[].*[)\]]\.?$")
TAG_RE = re.compile(r"^\s*\[[^\]]+\]\s*")


def clean(text: str) -> str:
    """Strip the [Male]/[Female] speaker tag — nobody sings it, and as tokens they would never
    be heard, so they only served to pull the alignment off."""
    return TAG_RE.sub("", text or "").strip()

def is_sung(line: dict) -> bool:
    """Mirrors src/data/sungLines.ts — production notes like "(heavy four-on-the-floor beat)"
    are not sung, and including them shifted every later line's timestamp."""
    if line.get("type") != "line":
        return False
    t = clean(line.get("text"))
    return bool(t) and not NOTE_RE.match(t)


def align_tokens(a, b):
    """Global (Needleman-Wunsch) alignment of known tokens to heard tokens.

    difflib was used here first, and it fails on this material: it greedily takes the LONGEST
    matching block, so with a chorus that repeats two or three times it can lock a line onto the
    wrong repetition. Everything after that either bunches up or leaves a hole — in one track the
    chorus landed 49s late while three lines crammed into 0.6s. A global DP optimises the whole
    sequence at once and keeps the mapping monotonic, so repeats land on the right occurrence.

    Returns {index into a: index into b} for matched pairs only.
    """
    # ASYMMETRIC gaps. The audio contains a great deal that the lyric sheet doesn't: stutter
    # effects ("beat-beat-beat"), ad-libs, backing vocals, shouts. Skipping one of those HEARD
    # tokens should be cheap. Leaving a real LYRIC word unanchored should not — that's what
    # forces the fallback interpolation that makes a line's tail bunch up.
    MATCH, MISMATCH = 1.0, -0.6
    GAP_KNOWN = -0.55   # skipping a word we know is sung: expensive
    GAP_HEARD = -0.12   # skipping something the recogniser heard but the sheet doesn't have
    n, m = len(a), len(b)
    if not n or not m:
        return {}
    prev = [GAP_HEARD * j for j in range(m + 1)]
    ptr = [bytearray(m + 1) for _ in range(n + 1)]
    for j in range(m + 1):
        ptr[0][j] = 2
    for i in range(1, n + 1):
        cur = [prev[0] + GAP_KNOWN]
        ptr[i][0] = 1
        ai = a[i - 1]
        for j in range(1, m + 1):
            d = prev[j - 1] + (MATCH if ai == b[j - 1] else MISMATCH)
            u = prev[j] + GAP_KNOWN   # skip a known word
            l = cur[j - 1] + GAP_HEARD  # skip a heard token
            best, p = d, 0
            if u > best:
                best, p = u, 1
            if l > best:
                best, p = l, 2
            cur.append(best)
            ptr[i][j] = p
        prev = cur
    out, i, j = {}, n, m
    while i > 0 and j > 0:
        p = ptr[i][j]
        if p == 0:
            if a[i - 1] == b[j - 1]:
                out[i - 1] = j - 1
            i -= 1
            j -= 1
        elif p == 1:
            i -= 1
        else:
            j -= 1
    return out


def norm(tok: str) -> str:
    return re.sub(r"[^a-z0-9]", "", tok.lower())

def main():
    from faster_whisper import WhisperModel

    lyrics = json.loads((ROOT / "src/data/lyrics.json").read_text())
    tracks = json.loads((ROOT / "src/data/tracks.json").read_text())["tracks"]

    print(f"[align] loading model '{MODEL}' (int8 CPU)…", flush=True)
    model = WhisperModel(MODEL, device="cpu", compute_type="int8")

    out = {}
    if OUT.exists():
        out = json.loads(OUT.read_text())  # resume-friendly

    jobs = []
    for t in tracks:
        if ONLY and t["slug"] != ONLY:
            continue
        song = lyrics.get(t["slug"])
        if not song:
            continue
        known = [clean(l["text"]) for l in song["lines"] if is_sung(l)]
        if not known:
            continue
        for v in t["versions"]:
            jobs.append((v["id"], t["slug"], MP3_DIR / v["file"], known))

    print(f"[align] {len(jobs)} version(s) to align", flush=True)
    for n, (vid, slug, path, known) in enumerate(jobs, 1):
        if vid in out:
            print(f"  ({n}/{len(jobs)}) {vid} — cached", flush=True)
            continue
        if not path.exists():
            print(f"  ({n}/{len(jobs)}) {vid} — MISSING {path.name}", flush=True)
            continue
        t0 = time.time()
        CACHE.mkdir(exist_ok=True)
        cache_f = CACHE / f"{vid}.json"
        if cache_f.exists():
            heard = [(w[0], float(w[1])) for w in json.loads(cache_f.read_text())]
            segments = None
        else:
            heard = None
        prompt = " ".join(known)[:850]  # bias the recogniser with the words we expect
        segments, _ = (model.transcribe(
            str(path), word_timestamps=True, initial_prompt=prompt,
            # NB: vad_filter MUST stay off. Voice-activity detection is trained on speech and
            # throws away sung vocals over a loud instrumental — with it on, the back half of
            # every track was discarded and those lines got invented by interpolation instead.
            vad_filter=False, beam_size=5, condition_on_previous_text=False, language="en",
        ) if heard is None else (None, None))
        if heard is None:
            heard = []  # (normalised token, start seconds)
            for seg in segments:
                for w in (seg.words or []):
                    nw = norm(w.word)
                    if nw:
                        heard.append((nw, float(w.start)))
            cache_f.write_text(json.dumps(heard))

        # known tokens, tagged with the line they belong to
        ktoks, kline = [], []
        for i, line in enumerate(known):
            for tok in line.split():
                nt = norm(tok)
                if nt:
                    ktoks.append(nt)
                    kline.append(i)

        # monotonic alignment between what we know and what was heard.
        # Keep the time of EVERY word, not just the first of each line — that's what lets the
        # lyric light up word by word as it's actually sung.
        tok_time = [None] * len(ktoks)
        line_time = [None] * len(known)
        if heard and ktoks:
            pairs = align_tokens(ktoks, [h[0] for h in heard])
            for ai, bi in pairs.items():
                ts = heard[bi][1]
                tok_time[ai] = ts
                li = kline[ai]
                if line_time[li] is None or ts < line_time[li]:
                    line_time[li] = ts

        matched = sum(1 for x in line_time if x is not None)
        # fill gaps: interpolate between known anchors, then force non-decreasing
        first = next((i for i, x in enumerate(line_time) if x is not None), None)
        if first is None:
            print(f"  ({n}/{len(jobs)}) {vid} — no anchors, skipped", flush=True)
            continue
        for i in range(first):
            line_time[i] = line_time[first] * (i + 1) / (first + 1)
        last_i = first
        for i in range(first + 1, len(line_time)):
            if line_time[i] is not None:
                gap = i - last_i
                if gap > 1:
                    a, b = line_time[last_i], line_time[i]
                    for j in range(1, gap):
                        line_time[last_i + j] = a + (b - a) * j / gap
                last_i = i
        tail = line_time[last_i]
        for i in range(last_i + 1, len(line_time)):
            tail += 2.0
            line_time[i] = tail
        for i in range(1, len(line_time)):
            if line_time[i] < line_time[i - 1]:
                line_time[i] = line_time[i - 1]

        # Fill unmatched word times inside each line by INTERPOLATING BETWEEN NEIGHBOURING
        # ANCHORS, not by spreading from the line's start. Spreading from the start ignored the
        # words that were anchored, so any evenly-spread value that landed before a real anchor
        # got shoved forward by the minimum-spacing floor and the tail of the line crammed into
        # a few hundredths of a second — half a line lighting up at once.
        words_per_line = []
        for li in range(len(known)):
            idxs = [i for i, l in enumerate(kline) if l == li]
            lo = line_time[li]
            hi = line_time[li + 1] if li + 1 < len(known) else lo + 2.5
            hi = max(lo + 0.3, min(hi, lo + 8.0))
            ts = [tok_time[i] for i in idxs]
            # only trust anchors that actually sit inside this line's window
            ts = [t if (t is not None and lo - 0.05 <= t <= hi) else None for t in ts]
            n = len(ts)
            if n:
                if ts[0] is None:
                    ts[0] = lo
                anchored = [j for j, t in enumerate(ts) if t is not None]
                # before the first anchor, and between anchors, and after the last
                if anchored:
                    first, last = anchored[0], anchored[-1]
                    for j in range(first):
                        ts[j] = lo + (ts[first] - lo) * (j / max(1, first))
                    for k in range(len(anchored) - 1):
                        a_i, b_i = anchored[k], anchored[k + 1]
                        if b_i - a_i > 1:
                            a_t, b_t = ts[a_i], ts[b_i]
                            for j in range(a_i + 1, b_i):
                                ts[j] = a_t + (b_t - a_t) * ((j - a_i) / (b_i - a_i))
                    if last < n - 1:
                        # Spread the unanchored tail at the pace this line is ACTUALLY being
                        # sung — the median gap between its own anchored words — instead of a
                        # fixed floor. Where the recogniser loses the vocal (a stuttered
                        # "beat-beat-beat" effect, heavy processing, backing vocals) the tail is
                        # guesswork either way, and guessing at the line's own tempo is far
                        # closer than jamming the words together at the minimum spacing.
                        deltas = [ts[anchored[k + 1]] - ts[anchored[k]]
                                  for k in range(len(anchored) - 1)
                                  if anchored[k + 1] - anchored[k] == 1]
                        pace = sorted(deltas)[len(deltas) // 2] if deltas else 0.34
                        pace = max(0.16, min(0.75, pace))
                        for j in range(last + 1, n):
                            ts[j] = ts[last] + pace * (j - last)
                else:
                    for j in range(n):
                        ts[j] = lo + (hi - lo) * (j / n)
            # Enforce a realistic minimum sung-word duration. Nobody sings four words in a
            # tenth of a second, but that's what happens when the FOLLOWING line's anchor lands
            # early and squashes this line's remaining span — the tail then highlights in a
            # blur. Better to let a word run past the nominal line end (it simply stops being
            # shown when the line changes) than to cram it.
            for j in range(1, len(ts)):
                if ts[j] < ts[j - 1] + 0.13:
                    ts[j] = ts[j - 1] + 0.13
            words_per_line.append([round(x, 2) for x in ts])
        out[vid] = words_per_line
        OUT.write_text(json.dumps(out, indent=0, sort_keys=True))
        print(f"  ({n}/{len(jobs)}) {vid} — {matched}/{len(known)} lines anchored "
              f"({time.time()-t0:.0f}s)", flush=True)

    print(f"[align] wrote {OUT.relative_to(ROOT)} — {len(out)} versions", flush=True)

if __name__ == "__main__":
    sys.exit(main())
