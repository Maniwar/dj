# Spotify Canvas

Vertical loops for the Now Playing view, captured from the live site rather than authored
separately — the point of a Canvas is that it looks like the record, and the light rig already
is the record.

| File | Size | Use |
|---|---|---|
| `out/canvas-1080x1920.mp4` | 1080x1920, 7.1s | **upload this one** — Spotify's recommended resolution |
| `out/canvas-720x1280.mp4` | 720x1280, 7.1s | fallback if the uploader rejects the larger file |

## Spec, as verified against Spotify's own guidelines

- **3-8 seconds** — these are 7.07s
- **Vertical 9:16** — exact at both sizes
- **MP4**, H.264 High, yuv420p, no audio track
- **No song or artist name.** Spotify shows both in the Now Playing view already and asks you
  to leave them out, which is why every piece of type is hidden before the capture.

## Why it is a rebound loop

Spotify supports three loop types; this is a Rebound. The clip is 3.5s of live footage followed
by the same 3.5s reversed, so the last frame IS the first frame and the wrap is invisible. A
straight cut of live footage cannot do that — it would jump once every few seconds, under a
track someone is actually listening to.

## Regenerating

    npx vite preview --port 4281 &
    node artwork/canvas/record.mjs      # -> artwork/canvas/raw/*.webm (gitignored)

then re-run the ffmpeg step in the commit that added this file. The capture hides `.content`,
`.player`, the lyric stage, the tour rail and the cursor layers, waits for the boot gate to
clear, and records the rig and footage alone.
