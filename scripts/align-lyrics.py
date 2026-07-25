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
import json, os, re, sys, difflib, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MP3_DIR = ROOT / "mp3"
OUT = ROOT / "src" / "data" / "lyricTimings.json"
CACHE = ROOT / ".align-cache"  # raw ASR word timings, so re-runs never re-transcribe
MODEL = os.environ.get("ALIGN_MODEL", "small")
ONLY = os.environ.get("ALIGN_ONLY")

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
        known = [l["text"] for l in song["lines"] if l.get("type") == "line"]
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
            sm = difflib.SequenceMatcher(a=ktoks, b=[h[0] for h in heard], autojunk=False)
            for ai, bi, size in sm.get_matching_blocks():
                for k in range(size):
                    ts = heard[bi + k][1]
                    tok_time[ai + k] = ts
                    li = kline[ai + k]
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

        # fill unmatched word times inside each line, then emit word arrays per line
        words_per_line = []
        for li in range(len(known)):
            idxs = [i for i, l in enumerate(kline) if l == li]
            base = line_time[li]
            nxt = line_time[li + 1] if li + 1 < len(known) else base + 2.5
            span = max(0.35, min(6.0, nxt - base))
            ts = []
            for j, ti in enumerate(idxs):
                t = tok_time[ti]
                if t is None or t < base or t > base + span:
                    # spread evenly across the line's span when the word wasn't heard
                    t = base + span * (j / max(1, len(idxs)))
                ts.append(t)
            for j in range(1, len(ts)):           # keep words monotonic within the line
                if ts[j] < ts[j - 1]:
                    ts[j] = ts[j - 1]
            words_per_line.append([round(x, 2) for x in ts])
        out[vid] = words_per_line
        OUT.write_text(json.dumps(out, indent=0, sort_keys=True))
        print(f"  ({n}/{len(jobs)}) {vid} — {matched}/{len(known)} lines anchored "
              f"({time.time()-t0:.0f}s)", flush=True)

    print(f"[align] wrote {OUT.relative_to(ROOT)} — {len(out)} versions", flush=True)

if __name__ == "__main__":
    sys.exit(main())
