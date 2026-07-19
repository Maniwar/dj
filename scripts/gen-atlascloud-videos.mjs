#!/usr/bin/env node
// Generates the character-locked party VIDEOS with AtlasCloud, each clip conditioned on
// the ACTUAL track audio so the footage is generated *to* that song (motion/energy),
// and seed-locked so the same super-fans recur city to city.
//
// Model: bytedance/seedance-2.0/reference-to-video  (accepts reference_audios + reference_images)
// Endpoints (from AtlasCloud docs):
//   upload asset:  POST https://console.atlascloud.ai/api/v1/sd/assets
//   submit job:    POST https://api.atlascloud.ai/api/v1/model/generateVideo
//   poll job:      GET  https://api.atlascloud.ai/api/v1/model/prediction/{id}   -> outputs[0] = mp4
// Requires env var `atlascloudapikey`. Run: npm run gen:videos
//
// IMPORTANT: every clip is rendered SILENT / plays muted in the site — the persistent
// player's MP3 is the only audible audio. The audio here only *drives* the visuals.
//
// NOTE: this build environment's egress policy blocks api.atlascloud.ai (403). Run this
// from an unblocked network (your machine / CI). It fails fast with a clear message here.

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = process.env.atlascloudapikey
if (!KEY) { console.error('[gen:videos] missing env var atlascloudapikey'); process.exit(1) }

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const API = 'https://api.atlascloud.ai/api/v1'
const ASSETS = 'https://console.atlascloud.ai/api/v1/sd/assets'
const MODEL = 'bytedance/seedance-2.0/reference-to-video'
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

// The locked super-fan identity — reused verbatim across every city so the crowd is consistent.
const SEED = 480917
const CHARACTER_LOCK =
  'The SAME three glamorous female super-fans in every clip: (A) tall, deep tan, long dark hair, ' +
  'leopard-print dress, gold hoops; (B) petite, platinum hair with pink tips, holographic silver, ' +
  'stacked glow bracelets; (C) freckled, copper curls, chrome halter, whistle. Drenched in sweat, ' +
  'euphoric, screaming the lyrics, champagne spray, leopard print, gold jewellery.'
const STYLE =
  'Leaked-VHS-camcorder crossed with gritty high-end club documentary: tape grain, tracking ' +
  'glitches, blown gold highlights, wet lens, humid haze. Farcical Euro-Riviera luxury excess. NO on-screen text.'

// One clip per city (extend freely). trackSlug binds the clip to a specific song's audio + tempo.
const CLIPS = [
  { id: 'ibiza',  trackSlug: 'touch-my-subwoofer', city: 'IBIZA',  scene: 'open-air white-terrace Ibiza superclub at sunrise, foam cannons, palm silhouettes, a mega-yacht on the horizon, gold baroque DJ booth' },
  { id: 'tokyo',  trackSlug: 'euro-airways',       city: 'TOKYO',  scene: 'tiny neon Tokyo micro-club, rain-slicked windows, kanji neon, low ceiling, a red Ferrari in the wet street outside' },
  { id: 'miami',  trackSlug: 'pump-my-iron',       city: 'MIAMI',  scene: 'Miami rooftop pool deck at pink sunset, infinity pool, docked mega-yacht, a gold Ferrari, champagne towers' },
  { id: 'berlin', trackSlug: 'the-basement-vip',   city: 'BERLIN', scene: 'wood-panelled Berlin sauna-warehouse club, thick steam, glowing coals, condensation, a cedar bucket' },
]

const tracks = JSON.parse(readFileSync(resolve(ROOT, 'src/data/tracks.json'), 'utf8')).tracks
const publicMp3Base = process.env.PUBLIC_MP3_BASE // e.g. https://yourhost/mp3  (must be publicly reachable by AtlasCloud)

async function j(url, opts) {
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}\n${(await res.text()).slice(0, 400)}`)
  return res.json()
}

// Upload a local file to the Asset Library, return asset://<id> (used when we can't serve a public URL)
async function uploadAsset(_path) {
  // The Asset Library accepts multipart; shape varies — see the "Asset Library" guide.
  // Left as an explicit integration point; prefer PUBLIC_MP3_BASE to hand AtlasCloud a URL.
  throw new Error('set PUBLIC_MP3_BASE to a publicly reachable /mp3 URL, or implement asset upload')
}

// base64 a local still so the clip ANIMATES that exact generated scene (character-locked by
// the image itself — same faces/outfits as the site's stills).
function toDataUrl(relPath) {
  const p = resolve(ROOT, relPath)
  if (!existsSync(p)) return null
  return `data:image/jpeg;base64,${readFileSync(p).toString('base64')}`
}

async function submit(clip, audioRef) {
  const still = toDataUrl(`public/assets/tour/${clip.id}.jpg`)
  const prompt = still
    ? `Animate the exact scene and the exact same people and outfits shown in image 1 — they dance and party energetically, perfectly in time to the provided music; the camera drifts, lasers sweep, champagne and confetti fly. ${clip.scene}. ${STYLE}`
    : `${clip.scene}. ${CHARACTER_LOCK} Their dancing hits exactly on the beat of the provided audio. ${STYLE}`
  const body = {
    model: MODEL,
    prompt,
    ...(still ? { reference_images: [still] } : {}), // lock characters to the still
    reference_audios: [audioRef], // the actual track -> motion follows its energy/tempo
    duration: 10,                 // 4..15s per clip (stitch for longer)
    resolution: '1080p',
    ratio: '16:9',
    generate_audio: false,        // SILENT — the site plays the real MP3
    seed: SEED,                   // locked identity
    watermark: false,
  }
  const r = await j(`${API}/model/generateVideo`, { method: 'POST', headers: H, body: JSON.stringify(body) })
  return r.prediction_id || r.id || r.data?.id
}

async function poll(id, { tries = 120, delay = 5000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = await j(`${API}/model/prediction/${id}`, { headers: H })
    const s = (r.status || '').toLowerCase()
    if (s === 'completed' || s === 'succeeded') return r.outputs?.[0]
    if (s === 'failed' || s === 'error') throw new Error(`job ${id} failed: ${JSON.stringify(r).slice(0,200)}`)
    await new Promise((res) => setTimeout(res, delay))
  }
  throw new Error(`job ${id} timed out`)
}

async function main() {
  const out = []
  for (const clip of CLIPS) {
    const track = tracks.find((t) => t.slug === clip.trackSlug) || tracks[0]
    const file = track.versions[0].file
    process.stdout.write(`  • ${clip.city}  ⟵  "${track.title}" ... `)
    try {
      if (!publicMp3Base) throw new Error('PUBLIC_MP3_BASE not set (AtlasCloud must fetch the track by URL)')
      const audioRef = `${publicMp3Base.replace(/\/$/, '')}/${encodeURIComponent(file)}`
      const id = await submit(clip, audioRef)
      const mp4 = await poll(id)
      out.push({ ...clip, seed: SEED, trackSlug: track.slug, status: 'ready', mp4Url: mp4 })
      console.log('OK ->', mp4)
    } catch (e) {
      out.push({ ...clip, seed: SEED, status: 'error', error: e.message })
      console.log('FAIL —', e.message.split('\n')[0])
    }
  }
  writeFileSync(resolve(ROOT, 'src/data/atlascloud.results.json'), JSON.stringify({ model: MODEL, seed: SEED, clips: out }, null, 2))
  console.log('[gen:videos] wrote src/data/atlascloud.results.json')
}

main().catch((e) => { console.error(e); process.exit(1) })
