#!/usr/bin/env node
// Animate ALL FOUR club-floor compositions into mainstage videos (Seedance reference-to-video),
// character-locked by each still + seed, motion driven by a real track clip. Each variant gets a
// prompt tailored to what its two side-screens show. Downloads raw mp4s; compress with ffmpeg after.
//   node --env-file=.env scripts/animate-club-floor-variants.mjs
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = process.env.atlascloudapikey
if (!KEY) { console.error('missing env var atlascloudapikey'); process.exit(1) }
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const API = 'https://api.atlascloud.ai/api/v1'
const MODEL = 'bytedance/seedance-2.0/reference-to-video'
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const SEED = 480917
const MP3 = 'https://maniwar.github.io/dj/mp3-clips'

const STYLE =
  'Leaked-VHS-camcorder crossed with gritty high-end club documentary: tape grain, tracking glitches, ' +
  'blown gold highlights, wet lens, humid haze, magenta and acid-green lasers. NO on-screen text.'
const ENERGY =
  'The whole CROWD is a hyped backlit dark SILHOUETTE that jumps and throws its arms up in unison on the beat, ' +
  'dancing hard. Lasers sweep, fog rolls, gold confetti rains, the camera pushes in slightly with the music. ' +
  'CRITICAL: any hand seen in sharp close-up (on a mic or the decks) stays natural and anatomically correct ' +
  'with exactly five fingers — do NOT let fingers morph, multiply, fuse or melt; distant crowd hands are dark ' +
  'silhouettes only. ' + STYLE
const CORE = 'Animate the exact scene, framing, people, outfits and staging shown in image 1 into a high-energy live moment. '

const VARIANTS = [
  { id: 'club-floor-v1', still: 'club-floor-v1.jpg', audio: 'Touch My Subwoofer.mp3',
    screens: 'In the CENTRE, Kiki sings into her handheld mic and Dieter mixes at the decks beside her. The LEFT ' +
      'jumbotron keeps showing Kiki’s live close-up singing and the RIGHT jumbotron keeps showing Dieter’s ' +
      'live close-up at the decks (both faces stay inside their screen bezels). ' },
  { id: 'club-floor-v2', still: 'club-floor-v2.jpg', audio: 'Pump My Iron.mp3',
    screens: 'In the CENTRE, Dieter mixes at the decks, head bobbing. BOTH big jumbotrons keep showing Kiki’s ' +
      'live close-up singing into the mic (inside their bezels). ' },
  { id: 'club-floor-v3', still: 'club-floor-v3.jpg', audio: 'Euro Airways.mp3',
    screens: 'In the CENTRE, Kiki sings into her mic and Dieter dances and gestures right beside her. The two side ' +
      'screens keep showing abstract pulsing laser graphics (no faces). ' },
  { id: 'club-floor-v4', still: 'club-floor-v4.jpg', audio: 'The Basement VIP.mp3',
    screens: 'In the CENTRE, Kiki sings into her mic and Dieter works the decks beside her. The two side screens ' +
      'keep showing abstract kaleidoscopic laser starbursts (no faces). ' },
]

function toDataUrl(rel) {
  const p = resolve(ROOT, rel); if (!existsSync(p)) throw new Error(`missing ${rel}`)
  return `data:image/jpeg;base64,${readFileSync(p).toString('base64')}`
}
async function j(url, opts) {
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error(`HTTP ${res.status}\n${(await res.text()).slice(0, 300)}`)
  return res.json()
}
async function poll(id, { tries = 150, delay = 5000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = await j(`${API}/model/prediction/${id}`, { headers: H })
    // the video prediction response nests under `data` — check both shapes
    const s = (r.status || r.data?.status || '').toLowerCase()
    const out = (r.outputs || r.data?.outputs || [])[0]
    if (s === 'completed' || s === 'succeeded') return out
    if (s === 'failed' || s === 'error') throw new Error(`job ${id} failed`)
    await new Promise((res) => setTimeout(res, delay))
  }
  throw new Error(`job ${id} timed out`)
}
async function animate(v) {
  const body = {
    model: MODEL, prompt: CORE + v.screens + ENERGY,
    reference_images: [toDataUrl(`public/assets/video/frames/variants/${v.still}`)],
    reference_audios: [`${MP3}/${encodeURIComponent(v.audio)}`],
    duration: 10, resolution: '1080p', ratio: '16:9', generate_audio: false, seed: SEED, watermark: false,
  }
  const r = await j(`${API}/model/generateVideo`, { method: 'POST', headers: H, body: JSON.stringify(body) })
  const id = r.prediction_id || r.id || r.data?.id
  const mp4 = await poll(id)
  if (!mp4) throw new Error('no output url')
  const dl = await fetch(mp4); if (!dl.ok) throw new Error(`download HTTP ${dl.status}`)
  const out = resolve(ROOT, `public/assets/video/${v.id}.raw.mp4`)
  writeFileSync(out, Buffer.from(await dl.arrayBuffer()))
  return v.id
}

console.log(`[animate] ${VARIANTS.length} club-floor variants…`)
const results = await Promise.allSettled(VARIANTS.map(animate))
results.forEach((r, i) => console.log(r.status === 'fulfilled'
  ? `  ✓ ${VARIANTS[i].id}` : `  ✗ ${VARIANTS[i].id} — ${r.reason?.message?.split('\n')[0]}`))
console.log('[animate] done — compress the .raw.mp4 files with ffmpeg next')
