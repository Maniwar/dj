#!/usr/bin/env node
// Generates the site's raver imagery with AtlasCloud / ByteDance Seedream v5.0 Pro.
//   refs  : text-to-image  -> canonical CHARACTER reference sheet (Kiki, the trio, Dieter)
//   scenes: edit (image+prompt) -> story/city stills that REUSE the refs so the same
//           characters appear throughout (identity-locked). Run `refs` first, eyeball them,
//           then `scenes`.
// Endpoints:  POST /api/v1/model/generateImage -> { prediction_id }
//             GET  /api/v1/model/prediction/{id} -> outputs[0] = image URL
// Requires env var atlascloudapikey. Run:
//   node --env-file=.env scripts/gen-atlascloud-images.mjs refs
//   node --env-file=.env scripts/gen-atlascloud-images.mjs scenes
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = process.env.atlascloudapikey
if (!KEY) { console.error('[gen:atlas-images] missing env var atlascloudapikey'); process.exit(1) }
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const API = 'https://api.atlascloud.ai/api/v1'
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const T2I = 'bytedance/seedream-v5.0-pro/text-to-image'
const EDIT = 'bytedance/seedream-v5.0-pro/edit'

// ---- STYLE SPINE (raw photoreal 2002 Eurodance rave, like the CD cover) ----
const STYLE =
  'Raw photorealistic on-camera-flash nightlife photography, real 35mm film, high-ISO grain, harsh direct ' +
  'flash, sweaty glistening skin, real human faces, slight motion blur, gritty photojournalistic 2000s ' +
  'Eurodance RAVE. Neon magenta and acid-green laser beams through thick haze, condensation, chrome, gold ' +
  'chains, champagne spray. Authentic, unpolished, candid. Shot on a real camera.'
// The wardrobe "spicy filter": TWO-PIECE rave wear only — never a one-piece.
const WARDROBE =
  'WARDROBE is authentic two-piece festival/rave wear: a crop top or bikini top with SEPARATE hot pants / ' +
  'micro shorts, plus mesh, fishnet, body glitter, platform boots. Bare midriff between the two pieces. ' +
  'Skimpy, sweaty, wild — but TASTEFUL and non-explicit.'
const NEG =
  'It must look like a REAL PHOTOGRAPH — NOT illustration, cartoon, anime, CGI, 3D render, airbrushed or ' +
  'AI-smooth. NO one-piece dress, NO gown, NO bodysuit, NO leotard, NO catsuit, NO cocktail dress, NO ' +
  'evening dress — tops and bottoms must be visibly SEPARATE garments. No text, letters, logos, watermark, ' +
  'numbers. No extra limbs, no deformed hands, no plastic skin. Nothing explicit or nude.'

// Canonical cast — described identically everywhere so identity stays locked.
const KIKI = 'KIKI G, the blonde star: shoulder-length platinum-blonde hair, smudged glam Y2K makeup, a ' +
  'shiny SILVER metallic sequin crop top with separate silver hot pants, silver hoops.'
const TRIO = 'The three super-fans: (A) tall deep-tan woman, long dark hair, LEOPARD-PRINT crop top + separate ' +
  'leopard hot pants, big gold hoops; (B) petite woman, platinum hair with pink tips, holographic-silver bikini ' +
  'top + shorts, stacked glow bracelets; (C) freckled woman, copper curls, chrome halter top + denim micro shorts, ' +
  'a whistle. All leopard/gold/glitter, drenched in sweat, euphoric, screaming.'
const DIETER = 'DJ DIETER kept as a shadowy BACKGROUND SILHOUETTE at the decks — a broad older man in shadow, ' +
  'stubble, faint red rim-light. NOT a leather jacket, NOT sunglasses, NOT a moustache close-up. Never the focus.'

// ---- REFERENCE SHEET (text-to-image) ----
const REFS = [
  { out: 'public/assets/ref/kiki.jpg', size: '1664*2496',
    prompt: `Full-length reference photo of ${KIKI} She stands mid-rave, one arm up, laser haze behind. ${WARDROBE} ${STYLE} ${NEG}` },
  { out: 'public/assets/ref/crew.jpg', size: '2720*1530',
    prompt: `Reference photo of the recurring crew together. ${TRIO} They pose as a trio on a podium, champagne, gold confetti. ${WARDROBE} ${STYLE} ${NEG}` },
  { out: 'public/assets/ref/dieter.jpg', size: '2720*1530',
    prompt: `Reference photo: ${DIETER} Foreground empty; he is small and dark behind the decks, magenta/green lasers. ${STYLE} ${NEG}` },
]

// ---- STORY / CITY SCENES (edit — reuse the refs so faces stay consistent) ----
// Each references specific ref images by index in the prompt ("woman in image 1", etc.).
const K = 'public/assets/ref/kiki.jpg', C = 'public/assets/ref/crew.jpg', D = 'public/assets/ref/dieter.jpg'
const SCENES = [
  { out: 'public/assets/tour/ibiza.jpg', size: '2720*1530', refs: [C, K],
    prompt: `Keep the exact same people and outfits from the reference images. The leopard trio (image 1) and the silver-clad blonde (image 2) go wild at an open-air Ibiza superclub at sunrise: foam cannons, palm silhouettes, a mega-yacht on the horizon, champagne spray. ${WARDROBE} ${STYLE} ${NEG}` },
  { out: 'public/assets/tour/tokyo.jpg', size: '2720*1530', refs: [C, K],
    prompt: `Same people/outfits as the references. The leopard trio (image 1) and silver blonde (image 2) rave in a tiny neon Tokyo micro-club, rain-slicked windows, kanji neon, a red Ferrari in the wet street outside. ${WARDROBE} ${STYLE} ${NEG}` },
  { out: 'public/assets/tour/miami.jpg', size: '2720*1530', refs: [C, K],
    prompt: `Same people/outfits as the references. The leopard trio (image 1) and silver blonde (image 2) party on a Miami rooftop pool deck at pink sunset, docked mega-yacht, gold Ferrari, champagne towers, ocean humidity. ${WARDROBE} ${STYLE} ${NEG}` },
  { out: 'public/assets/tour/berlin.jpg', size: '2720*1530', refs: [C, K],
    prompt: `Same people/outfits as the references. The leopard trio (image 1) and silver blonde (image 2) in a wood-panelled Berlin sauna-warehouse club, thick steam, glowing coals, condensation, a cedar bucket. ${WARDROBE} ${STYLE} ${NEG}` },
  { out: 'public/assets/video/frames/club-booth.jpg', size: '2720*1530', refs: [K, C, D],
    prompt: `Same people/outfits as the references. KIKI G (image 1) commands the DJ decks with one arm up; the leopard super-fans (image 2) scream and reach toward her; DJ Dieter (image 3) is the dark silhouette behind. Lasers, fog, sweat. ${WARDROBE} ${STYLE} ${NEG}` },
  { out: 'public/assets/video/frames/club-vip.jpg', size: '2720*1530', refs: [C],
    prompt: `Same people/outfits as the reference. The leopard trio (image 1) in a VIP bottle-service booth, sparklers on champagne magnums, toasting and screaming with joy, humid haze, lasers. ${WARDROBE} ${STYLE} ${NEG}` },
]

async function j(url, opts) {
  const res = await fetch(url, opts)
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}\n${text.slice(0, 300)}`)
  return JSON.parse(text)
}

// Read a local ref image as a base64 data URL (so edit works before the refs are hosted).
function toDataUrl(relPath) {
  const p = resolve(ROOT, relPath)
  if (!existsSync(p)) throw new Error(`ref not found: ${relPath} (run \`refs\` first)`)
  const b64 = readFileSync(p).toString('base64')
  return `data:image/jpeg;base64,${b64}`
}

async function submit(body) {
  const r = await j(`${API}/model/generateImage`, { method: 'POST', headers: H, body: JSON.stringify(body) })
  return r.prediction_id || r.id || r.data?.id
}
async function poll(id, { tries = 90, delay = 4000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = await j(`${API}/model/prediction/${id}`, { headers: H })
    const s = (r.status || r.data?.status || '').toLowerCase()
    const outputs = r.outputs || r.data?.outputs || []
    if (s === 'completed' || s === 'succeeded') return outputs[0]
    if (s === 'failed' || s === 'error') throw new Error(`job ${id} failed: ${JSON.stringify(r).slice(0, 200)}`)
    await new Promise((res) => setTimeout(res, delay))
  }
  throw new Error(`job ${id} timed out`)
}
async function download(url, outRel) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const outPath = resolve(ROOT, outRel)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, buf)
}

async function run(job, mode) {
  const body = mode === 'scenes'
    ? { model: EDIT, prompt: job.prompt, size: job.size, output_format: 'jpeg', images: job.refs.map(toDataUrl) }
    : { model: T2I, prompt: job.prompt, size: job.size, output_format: 'jpeg' }
  const id = await submit(body)
  const url = await poll(id)
  if (!url) throw new Error('no output url')
  await download(url, job.out)
}

const mode = process.argv[2] === 'scenes' ? 'scenes' : 'refs'
const only = process.argv[3]
let jobs = mode === 'scenes' ? SCENES : REFS
if (only) jobs = jobs.filter((x) => x.out.includes(only))
console.log(`[gen:atlas-images] mode=${mode} · ${jobs.length} image(s)`)
for (const job of jobs) {
  process.stdout.write(`  • ${job.out} ... `)
  try { await run(job, mode); console.log('OK') }
  catch (e) { console.log('FAIL — ' + e.message.split('\n')[0]) }
}
