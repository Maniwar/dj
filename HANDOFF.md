# CLUB HUMIDITY — Handoff & How To Take It Forward

Promo site for the (fictional) 2004 Eurodance duo **SYSTEM OVERLOAD** — **DJ Dieter**
(deep sleazy spoken male) & **Kiki G** (squeaky high-pitched female) — and their
multi-platinum, moisture-laden album **"Club Humidity — The Moist Mix 2002."**

Aesthetic north star: the CD jewel-case cover — **raw photoreal rave**, liquid-**chrome**
dripping wordmark, neon magenta/acid-green lasers, condensation, leopard print, Ferraris,
yachts, champagne. Bootleg-VHS-rip energy, **not** gold-casino, **not** cartoon.

---

## 1. Quick start (in VS Code / any unblocked network)

```bash
git clone <your repo>            # branch: claude/system-overload-promo-site-sy091b
cd dj
npm install
npm run dev                      # http://localhost:5173  — live site

# builds
npm run build                    # tsc + vite build -> dist/
npm run preview                  # serve the production build
```

### Environment variables (asset generation only — never shipped to the browser)
```
geminiapikey=...        # Gemini / Imagen — static images + (optional) audio transcription
atlascloudapikey=...    # AtlasCloud — the party/music videos
falapikey=...           # fal.ai — optional fallback renderer
```
The frontend never reads these. All generation runs in Node scripts at build/gen time,
writing finished assets into `/public/assets` + manifests the site reads.

---

## 2. What's DONE (working + verified in a headless browser)

- **Audio spine** — one global, uninterrupted `<audio>` + Web Audio graph
  (`MediaElementSource → Analyser → Gain`). "LOG ON & PLUG IN" starts the stream.
  60fps FFT flows through a module singleton (`src/audio/audioBus.ts`), **never** React
  state, so nothing re-renders on the hot path.
- **Track grouping** (`scripts/build-tracks.mjs` → `src/data/tracks.json`): 39 files →
  **19 tracks**. Groups by full base title (defeats the 5 "Shameless…" collisions);
  handles the 4-version "Synthesizer Is So Big" and the 1-version orphan.
- **Persistent 3D player** (`src/components/player/`): draggable, mouse-parallax tilt,
  chrome/glass, real-time spectrum, **Bootleg Switch** (swaps A-side ↔ bootleg mid-song
  without dropping playback), VOL + FRICTION knobs, 🎤 **karaoke** toggle.
- **The Broadcast** (`src/video/Broadcast.tsx`): persistent, **muted** "leaked club
  footage" behind the whole site — Gemini stills turned into moving video via Ken-Burns +
  **beat-synced hard-cuts** + VHS glitch + strobe. Always shows the current track's city.
  Swaps to real AtlasCloud mp4s automatically when they exist (see §4).
- **Mainstage lights** (`src/components/webgl/`): a lean GLSL overlay (thin lasers +
  heavy **condensation** + grain) screen-composited **over** the footage. (The old
  cartoon god-ray/LED-stage version was removed.)
- **Whole-page music reactivity** (`src/components/AudioReactive.tsx`): pumps
  `--m-beat / --m-level / --m-bass / --m-treble` onto `:root` each frame; titles, wordmark,
  cards, marquees, the journey city names all pulse in pure CSS.
- **The Global Meltdown = scroll journey** (`src/components/sections/TourJourney.tsx`):
  full-bleed city stops (Ibiza → Tokyo → Miami → Berlin) with a **sticky HUD** where a
  🛥️/✈️/🚌/🚄 vehicle travels the route as you scroll.
- **Lyrics woven throughout**: parsed to `src/data/lyrics.json`
  (`scripts/build-lyrics.mjs`), surfaced as (a) scrolling **lyric marquees** between every
  section, (b) a **karaoke** teleprompter in the player (Dieter = blue, Kiki = pink).
- **Sections**: hero (chrome dripping wordmark), lore (cursor-spotlight VIP lounge),
  tracklist, cyber guestbook (seed chaos + localStorage likes/posts), hall of fame,
  out-of-stock merch, dial-up boot gate, Konami → SAUNA MODE easter egg.
- **Real Gemini imagery** already generated in `/public/assets`: 4 tour posters +
  3 club-atmosphere frames (raw photoreal, leopard fans, no cheesy dude).

Smoke test: `node scripts/smoke.mjs` (needs `npm run preview` running) drives the whole
flow headless and screenshots to `./smoke-shots/`.

---

## 3. ⚠️ BLOCKERS (why some things must be finished from VS Code)

This session's remote environment has two hard limits — **neither is a code problem**:

1. **Gemini image credits are depleted** (`429 RESOURCE_EXHAUSTED`). Top up billing at
   https://ai.studio → then `npm run gen:images` regenerates/extends the imagery.
   (Two frames — `club-vip`, `club-booth` — are pending a top-up; the site already
   excludes them.)
2. **AtlasCloud + fal are blocked by the org egress policy** here (`403 CONNECT` to
   `api.atlascloud.ai`). The MCP server (`npx atlascloud-mcp`) hits the same host, so it
   also can't reach it from here. **Run the video generation from your own machine / CI**
   (unblocked network) — that's the main "what's left."

Gemini itself is reachable here; AtlasCloud is not.

---

## 4. ⭐ THE MAIN JOB LEFT: AtlasCloud music videos (upload song → synced video)

The plan you asked to preserve, in full. Generate, **per track (or per stretch)**, a
music video that is **generated *to* the actual song audio** and stars the **same
consistent characters** across every city.

**Model:** `bytedance/seedance-2.0/reference-to-video` (accepts `reference_audios`).
For a lip-synced performer, `bytedance/omnihuman` (image + audio → singing).

**Endpoints** (verified from AtlasCloud docs):
```
POST https://api.atlascloud.ai/api/v1/model/generateVideo      -> { prediction_id }
GET  https://api.atlascloud.ai/api/v1/model/prediction/{id}     -> outputs[0] = mp4
POST https://console.atlascloud.ai/api/v1/sd/assets             -> upload the MP3 (asset://id)
Header: Authorization: Bearer $atlascloudapikey
```

**How the audio drives it:** supply the track as `reference_audios: ["<public mp3 url>"]`
or an uploaded `asset://…`. Seedance generates motion/energy **to that audio**, so the
dancing lands on the beat. Clips cap at ~10–15s (Seedance 2.5 → 30s), so a full song is
several stretches stitched (ffmpeg) — hence "a music video for that stretch that goes with
the music." Render **silent** (`generate_audio:false`) — the site plays the real MP3; every
video is muted.

**Character consistency (lock these across ALL cities via one fixed `seed`):**
- **Kiki G** — blonde, **silver metallic crop top**, smudged glam Y2K makeup. (The star.)
- **The super-fans** — the recurring trio, all in **leopard print** + gold chains,
  screaming, champagne. (Bianca / Suki / Mel — see the character bible in
  `scripts/gen-atlascloud-videos.mjs`.)
- **DJ Dieter** — deep sleazy spoken-male energy; keep him a background/silhouette. **Do
  not** render the cheesy "leather-jacket + moustache + sunglasses catalog dude" — that
  look was explicitly rejected.
- Fixed `seed: 480917` + a reference image for every clip = same faces, new city.

**Lyric / voice matching:** `src/data/lyrics.json` has each song's lines tagged by voice
(`dieter` = sleazy male, `kiki` = squeaky female) + BPM. Use the lyric mood + BPM in the
scene prompt so the footage matches the song's stretch (e.g. Euro-Trash 138bpm: "leopard
print and fake diamonds, champagne on leather pants" → trashy podium chaos). For true
lip-sync of the vocal hooks, feed those stretches to OmniHuman/Kling-LipSync.

**Run it:**
```bash
export PUBLIC_MP3_BASE="https://<somewhere the /mp3 files are publicly reachable>"
npm run gen:videos        # scripts/gen-atlascloud-videos.mjs
```
It writes `src/data/atlascloud.results.json` (`{ clips:[{id, trackSlug, mp4Url, status }]}`).
The site already ingests this: `Broadcast` + `TourJourney` prefer a scene's real `mp4Url`
(muted, looping) over the still montage the moment it's present — **no frontend changes
needed** once the file has ready clips.

---

## 5. Suggested next steps (in priority order)

1. **Top up Gemini** → `npm run gen:images` (finish `club-vip`/`club-booth`, add more
   per-city frames; optionally regenerate a proper photoreal hero couple — Kiki in
   silver, no cheesy dude).
2. **Generate AtlasCloud videos** (§4) from an unblocked network; commit
   `atlascloud.results.json` + the mp4s (or host them and store URLs).
3. **Wire real mp4s into the journey stops** (currently poster + Ken-Burns; add a
   `<video muted loop>` when `scene.mp4` exists — the Broadcast already does this).
4. **Timed karaoke**: lyrics currently auto-scroll by % progress. If you generate
   per-line timestamps (Gemini/Whisper on the stems), swap in real timing.
5. **Bootleg Pressing Plant** (designed, not built): let fans cut their own bootleg
   (humidity=reverb, overheat=pitch) and mint it into the player's Bootleg Switch.
6. **Mobile pass**: IntersectionObserver single-decode for videos, `prefers-reduced-data`
   poster-only mode, tune breakpoints.
7. **Optional Supabase**: only if you want real cross-visitor guestbook / shared bootlegs.
   Everything is backend-free today (seed JSON + localStorage).

---

## 6. Map of the codebase

```
mp3/                         the 19 tracks (39 pressings) — source of truth
scripts/
  build-tracks.mjs           /mp3 -> src/data/tracks.json   (grouping brain)
  build-lyrics.mjs           Suno .txt exports -> src/data/lyrics.json
  gen-gemini-images.mjs      Imagen -> /public/assets/**     (static images)
  gen-atlascloud-videos.mjs  AtlasCloud -> atlascloud.results.json  (⭐ the videos)
  smoke.mjs                  headless end-to-end screenshot test
src/
  audio/        audioBus (singleton FFT), AudioProvider (graph + thermal + bootleg swap)
  video/        Broadcast (muted club footage), broadcastFrames (track->scene)
  components/   AudioReactive, LyricMarquee, Ornaments, player/*, sections/*, webgl/*
  state/        usePlayerStore, useSiteStore  (zustand, low-frequency only)
  data/         tracks.json, lyrics.json, tour.manifest, guestbook.seed, lore, types
```

Key rule enforced everywhere: **the player MP3 is the only audible audio; every video is
muted.** That's what lets footage and tracks stay perfectly in sync no matter what plays.
