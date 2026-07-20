#!/usr/bin/env node
// One-off: re-animate the club-floor mainstage still into a clean-hands video.
// Seedance reference-to-video, character-locked by the still + seed, motion driven by a
// real track clip. Downloads the raw mp4; compress with ffmpeg afterwards.
//   node --env-file=.env scripts/regen-club-floor-video.mjs
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

const stillPath = resolve(ROOT, 'public/assets/video/frames/club-floor.jpg')
if (!existsSync(stillPath)) { console.error('club-floor still missing — run the image regen first'); process.exit(1) }
const still = `data:image/jpeg;base64,${readFileSync(stillPath).toString('base64')}`
// any upbeat mainstage clip drives the motion energy (published + reachable by AtlasCloud)
const audioRef = 'https://maniwar.github.io/dj/mp3-clips/Touch%20My%20Subwoofer.mp3'

const STYLE =
  'Leaked-VHS-camcorder crossed with gritty high-end club documentary: tape grain, tracking glitches, ' +
  'blown gold highlights, wet lens, humid haze, magenta and acid-green lasers. NO on-screen text.'
const prompt =
  'Animate the exact scene, framing, people, outfits and staging shown in image 1 into a high-energy live ' +
  'moment. In the CENTRE, KIKI sings into her handheld microphone and bounces to the beat while DJ DIETER ' +
  'works the decks beside her, nodding and pushing the faders. The two big side SCREENS keep showing abstract ' +
  'kaleidoscopic laser starbursts (NO faces appear on them). The whole CROWD is a hyped backlit dark ' +
  'SILHOUETTE that jumps and throws its arms up in unison on the beat, dancing hard — lots of motion and ' +
  'energy. Lasers sweep, fog rolls, gold confetti rains, the camera pushes in slightly with the music. ' +
  'CRITICAL: any hand seen in sharp close-up (Kiki on the mic, Dieter on the decks) stays natural and ' +
  'anatomically correct with exactly five fingers — do NOT let fingers morph, multiply, fuse or melt; the ' +
  'distant crowd hands are dark silhouettes only. ' + STYLE

async function j(url, opts) {
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}\n${(await res.text()).slice(0, 400)}`)
  return res.json()
}
async function poll(id, { tries = 150, delay = 5000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = await j(`${API}/model/prediction/${id}`, { headers: H })
    const s = (r.status || '').toLowerCase()
    if (s === 'completed' || s === 'succeeded') return r.outputs?.[0]
    if (s === 'failed' || s === 'error') throw new Error(`job ${id} failed: ${JSON.stringify(r).slice(0, 200)}`)
    process.stdout.write('.')
    await new Promise((res) => setTimeout(res, delay))
  }
  throw new Error(`job ${id} timed out`)
}

const body = {
  model: MODEL, prompt,
  reference_images: [still],
  reference_audios: [audioRef],
  duration: 10, resolution: '1080p', ratio: '16:9',
  generate_audio: false, seed: SEED, watermark: false,
}
console.log('[club-floor] submitting…')
const r = await j(`${API}/model/generateVideo`, { method: 'POST', headers: H, body: JSON.stringify(body) })
const id = r.prediction_id || r.id || r.data?.id
console.log('[club-floor] job', id)
const mp4 = await poll(id)
if (!mp4) throw new Error('no output url')
console.log('\n[club-floor] output', mp4)
const dl = await fetch(mp4)
if (!dl.ok) throw new Error(`download HTTP ${dl.status}`)
const out = resolve(ROOT, 'public/assets/video/club-floor.raw.mp4')
writeFileSync(out, Buffer.from(await dl.arrayBuffer()))
console.log('[club-floor] wrote', out)
