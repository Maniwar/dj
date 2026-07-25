# CLUB HUMIDITY 💦

**A promotional website for SYSTEM OVERLOAD — the (fictional) 2004 Eurodance duo
DJ Dieter & Kiki G — and their multi-platinum, moisture-laden album
_"Club Humidity — The Moist Mix 2002."_**

### ▶ [**LOG ON & PLUG IN — maniwar.github.io/dj**](https://maniwar.github.io/dj/)

An interactive, audio-reactive, deliberately excessive Y2K rave artifact: 19 real tracks
behind a persistent streaming MP3 player, 13 character-locked AI music videos, a WebGL
condensation layer, a scroll-driven origin story and world tour, and karaoke.

> Parody. Lovingly. All moisture reserved.
>
> **Turn your sound on.** The site starts streaming the moment you log on.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

That's it — the site reads the MP3s in `/mp3`, builds its own tracklist, and ships with all
imagery and video committed. No backend, no database, no API keys needed to run it.
Keys are only required to *regenerate* assets (see [Asset generation](#asset-generation)).

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server (regenerates the track manifest first) |
| `npm run build` | Typecheck + production build → `dist/` |
| `npm run preview` | Serve the production build |
| `npm run gen:tracks` | Scan `/mp3` → `src/data/tracks.json` |
| `npm run gen:lyrics` | Parse `lyrics-src/*.txt` → `src/data/lyrics.json` |
| `npm run gen:images` | Static imagery via Gemini/Imagen → `public/assets/` |
| `npm run gen:videos` | Music videos via AtlasCloud → `src/data/atlascloud.results.json` |

Other tools in `scripts/`: `gen-atlascloud-images.mjs` (the identity-locked reference +
scene pipeline), `fetch-video-masters.mjs` / `map-masters.mjs` (re-download the 1080p
masters), `capture.mjs` / `capture-ultrawide.mjs` / `perf.mjs` (QA), `smoke.mjs`
(headless end-to-end test).

**Stack:** React 18 · TypeScript · Vite · Three.js / react-three-fiber · Zustand · Web Audio API

**Deploy:** live at **<https://maniwar.github.io/dj/>**. Every push to `main` builds and
publishes there via `.github/workflows/deploy.yml`. It's a *project* page, so the build sets
`BASE_PATH=/dj/` and every asset URL goes through `withBase()` (`src/lib/asset.ts`) to
resolve under the subpath — which is why assets must never be referenced with a bare
leading `/`.

---

## The aesthetic

Raw photoreal 2000s Eurodance **rave** — modelled on the album's jewel-case cover:

- **Liquid chrome** dripping wordmark, bold condensed type (Anton / Oswald)
- Neon **magenta + acid-green** lasers, fog, strobes, condensation, sweat
- Trashy Euro-Riviera excess: leopard print, gold chains, Ferraris, yachts, champagne
- Bootleg-VHS-rip grit — tape grain, tracking glitches, `● REC` timestamps

**Not** gold-casino luxury. **Not** cartoon/CGI/airbrushed. **Not** formal cocktail.

### Character bible

Every generated asset is identity-locked to these three references
(`public/assets/ref/{kiki,dieter,crew}.jpg`), so the same faces recur in every scene and city.

| | |
| --- | --- |
| **Kiki G** | The blonde star. Shoulder-length platinum hair, smudged glam Y2K makeup, shiny **silver sequin crop top + silver hot pants**, silver hoops. Squeaky high-pitched vocals. |
| **DJ Dieter** | Sleazy campy Eurodance heart-throb, late 30s, full **Gunther** energy: tanned, tousled natural **blond** hair, **thin pencil moustache**, cheap flashy Euro **wraparound sunglasses**, open black **leather jacket** over a bare chest, thick chain. Deep sleazy spoken-male vocals. |
| **The crew** | The recurring trio of super-fans, always in **leopard print** + holographic silver — hot pants, bikini tops, big gold hoops. Screaming, sweaty, champagne everywhere. |

Tasteful and non-explicit throughout. Prompts carry a hard negative on mangled hands and
on any baked-in text.

---

## How it works

### Audio — one graph, no re-renders

A single `<audio>` element and Web Audio graph
(`MediaElementSource → AnalyserNode → GainNode`) live above the React tree in
`AudioProvider`, so playback survives every scroll, section change, and player drag.

60fps FFT data flows through a **module-level singleton** (`src/audio/audioBus.ts`) that
every visualizer reads from its own `useFrame`/rAF loop — never through React state. One
producer, many subscribers, zero re-renders on the hot path.

The spectrum analyzer maps **contiguous logarithmic bands** (a linear split wastes half the
display on the 11–22kHz dead zone) and runs **auto-gain** against a fast-attack /
slow-release running peak, so loud EDM shows spectral *shape* instead of pinning every bar.

### Track grouping — 39 files → 19 tracks

`scripts/build-tracks.mjs` folds alternate mixes into one track by stripping a trailing
`_N`, then grouping on the **full base title**. Three real traps in the library:

- **Prefix collision** — five *different* songs start with "Shameless"; grouping by prefix
  would merge them. Keys on the full title instead.
- **N-way alternates** — "Synthesizer Is So Big" has 4 versions, so the Bootleg Switch
  becomes a multi-position selector rather than a binary toggle.
- **Orphan** — "Shameless in the Navy" has no alternate; the switch renders rusted/disabled.

Alternates are labelled in-lore: *A-Side · Studio Mix*, *White-Label Bootleg*,
*Basement VIP Edit*, *Sauna Dub*, *Liquid-Cooled Overclock*.

### The golden rule

> **The player's MP3 is the only audible audio. Every video on the site is muted.**

Videos are rendered silent and played `muted`, so footage can never fight the music — the
visuals follow whatever track is playing, always in sync. Only the active scene's video
plays (single-decode), and the 🎬 toggle in the player swaps all video for Ken-Burns stills.

---

## Features

- **Boot gate** — a dial-up handshake sequence; "LOG ON & PLUG IN" starts the global stream
  (page scroll stays locked behind it)
- **Persistent 3D player** — draggable, mouse-parallax tilt, chrome depth, live spectrum
  analyzer, VOL + FRICTION knobs, 🎤 karaoke and 🎬 video toggles. Docks to a compact
  touch-friendly bottom bar on mobile.
- **Bootleg Switch** — flips between pressings of the current song mid-playback without
  dropping the beat (preserves `currentTime`, crossfades the swap)
- **The Broadcast** — a persistent muted club-footage layer behind the whole site, cycling
  the mainstage scenes (booth / jumbotron / podium / floor / VIP) with beat-synced cuts,
  VHS glitch and strobe. City songs show their city.
- **Thermal Runaway** — bass energy heats the rig; humidity climbs, condensation beads on
  the viewport, and crossing the dew point triggers a liquid-cooling wash + an
  "overclock" reward window
- **The Origin** — a full-bleed scroll journey: hero pages for Kiki and Dieter, then the
  origin-story beats (Munich, Stockholm, the Berlin sauna incident, the Moisture Doctrine),
  each animating in as it crosses the viewport centre
- **The Global Meltdown** — a scroll-driven world tour (Ibiza → Tokyo → Miami → Berlin)
  with a sticky HUD where a 🛥️/✈️/🚌/🚄 vehicle travels the route, plus a global tour rail
- **Whole-page music reactivity** — `--m-beat/-level/-bass/-treble` are pumped onto `:root`
  each frame, so titles, the wordmark, marquees and city names pulse in pure CSS
- **Lyrics everywhere** — all 19 songs parsed with per-voice tagging and BPM; scrolling
  lyric marquees between sections + a karaoke teleprompter (Dieter = blue, Kiki = pink)
- **Cyber Guestbook** — a 2004-era message board seeded with chaotic ravers; likes and
  posts persist to `localStorage`
- **Easter eggs** — Konami code → SAUNA MODE, hold `H` to overheat the rig, a creeping
  hit counter, permanently sold-out merch
- **Performance** — the full-screen WebGL shader auto-disables on phones
  (`src/lib/perfFlags.ts`), videos are 720p (266MB → 39MB for the Pages deploy), and
  mobile drops beat-strobe/grain/glitch and `backdrop-filter` to kill flicker

---

## Asset generation

API keys live in env vars and are read **only** by Node scripts at generation time. They
never reach the browser; the site ships finished assets and manifests.

```bash
export geminiapikey=...        # Gemini / Imagen — static images
export atlascloudapikey=...    # AtlasCloud — reference sheet, scene stills, video
```

### Images — identity-locked, two passes

`scripts/gen-atlascloud-images.mjs` is the pipeline that keeps faces consistent:

```bash
node --env-file=.env scripts/gen-atlascloud-images.mjs refs     # 1. character reference sheet
node --env-file=.env scripts/gen-atlascloud-images.mjs scenes   # 2. scenes that REUSE the refs
```

Pass 1 is text-to-image and produces the canonical Kiki / Dieter / crew references.
Eyeball those first — everything downstream inherits them. Pass 2 is an *edit*
(image + prompt) that stages each scene with the same cast, so identity is locked rather
than re-rolled. `npm run gen:images` (Gemini/Imagen) remains for plain static art.

`scripts/song-scenes.json` holds 15 lyric-driven scene designs for the songs that currently
fall back to the mainstage loop — feed a `scene` into the edit pipeline with its listed
`refs` when credits allow, then animate. Only the standouts need video.

### Video — AtlasCloud (audio-synced)

The headline feature: a track (or a stretch of one) is uploaded and the video is
**generated to that audio**, so the motion lands on the beat.

- Model: `bytedance/seedance-2.0/reference-to-video` (`reference_audios` + `reference_images`)
- `POST /api/v1/model/generateVideo` → poll `GET /api/v1/model/prediction/{id}` → `outputs[0]`
- Rendered silent (`generate_audio: false`), seed-locked to the character bible — the fixed
  seed is **`480917`**, reused for every clip so the same faces recur city to city
- Clips cap at ~10–15s, so longer pieces are stretches stitched with ffmpeg

```bash
npm run gen:videos
```

**13 clips are live** (4 cities, 5 mainstage, 4 lore) — `src/data/atlascloud.results.json`
is the manifest the site reads. The committed mp4s are 720p; the 1080p masters live outside
git and are re-downloadable by prediction id via `scripts/video-masters.manifest.json` +
`fetch-video-masters.mjs`.

---

## Project layout

```
mp3/                         19 tracks / 39 pressings — the source of truth
lyrics-src/                  the raw lyric sheets (parsed to lyrics.json)
scripts/                     manifest builders, asset generators, QA/capture tools
public/assets/
  ref/                       canonical character references (identity lock)
  video/                     13 muted 720p scene videos
  lore/, tour/, video/frames/  stills
src/
  audio/                     audioBus (FFT singleton), AudioProvider (graph, thermal, swap)
  video/                     Broadcast (muted footage), broadcastFrames (track → scene)
  components/                player/, sections/, webgl/, AudioReactive, LyricMarquee, TourRail
  state/                     usePlayerStore, useSiteStore (Zustand, low-frequency only)
  lib/                       asset (base-path safety), perfFlags (device tiering)
  data/                      tracks, lyrics, tour manifest, lore, guestbook seed, results
```

---

## Status

Live and complete end to end — all 19 tracks, all 19 lyric sheets, 13 character-locked
videos, deployed to GitHub Pages on every push to `main`.

Remaining ideas and the deeper generation notes live in **[HANDOFF.md](./HANDOFF.md)**:
scenes for the other 15 songs (designs already written in `scripts/song-scenes.json`),
per-line karaoke timing, and the Bootleg Pressing Plant concept.
