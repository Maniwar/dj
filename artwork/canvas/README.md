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

## Per-track, because the site already maps songs to scenes

`src/video/broadcastFrames.ts` binds four songs to a city and shows the mainstage for
everything else. The Canvases follow that exactly — a Canvas showing a different room than the
site does for the same song would be a small, permanent inconsistency.

| Canvas | Scene | Use for |
|---|---|---|
| `canvas-touch-my-subwoofer.mp4` | ibiza | Touch My Subwoofer |
| `canvas-euro-airways.mp4` | tokyo | Euro Airways |
| `canvas-pump-my-iron.mp4` | miami | Pump My Iron |
| `canvas-the-basement-vip.mp4` | berlin | The Basement VIP |
| `canvas-default.mp4` | club-floor | **every other track** |

    node artwork/canvas/build.mjs            # all of them
    node artwork/canvas/build.mjs <slug>     # just one

## Single shot at 720x1280, and why not 1080x1920

The first build stacked two near-square panels. That existed for a purely technical reason — a
9:16 window out of a 1920x1080 master is only 608x1080 of real detail, so a stack let both
panels be downscales instead of upscales — and letting it drive the composition was backwards.
A Canvas is conventionally one continuous vertical shot; a stacked pair reads as split-screen.

The constraint mostly evaporates at 720x1280, which Spotify accepts: 608x1080 -> 720x1280 is a
1.18x upscale, essentially native. Reaching 1080x1920 would mean 1.78x for a size no phone
resolves anyway. So: single shot, cropped at native resolution before the one scale pass.

## Not a screen recording

The very first version captured the running site and was bad in resolution, frame rate and
colour at once. Three causes, all avoidable: forced SwiftShader (software WebGL, so the light
rig itself ran at a few frames a second and the capture recorded that judder faithfully),
Playwright's `recordVideo` (VP8 at a low bitrate), and an upscale at the end — when the footage
already existed here at native 1920x1080.

Output stays at the masters' native 24fps; resampling to 30 only duplicates frames. Colour is
tagged BT.709 via `-x264-params` — the plain `-colorspace` output flags did NOT stick, and the
file probed back `color_primaries=unknown`, the untagged case where players disagree about
BT.601 vs BT.709 and the picture washes out.

## The rebound loop

3.5s forward plus the same 3.5s reversed, so the last frame IS the first and the wrap is
invisible. Spotify supports this loop type explicitly, and it is the only way live footage
loops without a seam — a straight cut would jump every few seconds under a track on repeat.
