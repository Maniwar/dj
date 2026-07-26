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

## Built from the masters, not from a screen recording

    node artwork/canvas/build.mjs <top-scene> <bottom-scene> <output-name>
    node artwork/canvas/build.mjs club-floor club-crowd canvas-1080x1920   # the default

Scene names are the `video-masters/<name>.1080p.mp4` files (gitignored, re-downloadable via
`scripts/` per the masters manifest).

The first version screen-recorded the running site and looked bad in every dimension at once.
Three separate causes, all avoidable:

- **forced SwiftShader** — software WebGL, so the light rig itself rendered at a few frames a
  second and the capture recorded the judder faithfully. The default flags get real Metal.
- **Playwright `recordVideo`** — VP8 at a low bitrate, which is the softness and the colour shift.
- **an upscale at the end**, when the footage already existed here at native 1920x1080.

So it is cut from the masters instead. Each panel is a DOWNSCALE of native 1080p
(1920x1080 -> 1707x960 -> centre-crop 1080x960), stacked to 1080x1920, so no pixel is ever
enlarged — a 9:16 window out of a single landscape master would be only 608x1080 of real
detail blown up 1.78x. Output stays at the masters' native 24fps; resampling to 30 would just
duplicate frames and reintroduce judder.

Colour is tagged BT.709 via `-x264-params`. The plain `-colorspace` output flags did NOT land
here — the file probed back as `color_primaries=unknown`, which is the untagged case where
players disagree about BT.601 vs BT.709 and the picture washes out.

## Per-song Canvas

Not possible yet. `scripts/song-scenes.json` designs a scene for 15 of the songs, but none of
them have been rendered — that is the AtlasCloud credits blocker. The 14 masters that exist are
SECTION scenes (club floor, crowd, the lore beats, the tour cities), not per-song. Once the
song scenes render, this script takes them by name and the rest of the pipeline is unchanged.
