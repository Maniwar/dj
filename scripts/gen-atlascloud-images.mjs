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
const DIETER = 'DJ DIETER: a sleazy campy 2000s Eurodance heart-throb in his late 30s (Gunther vibe), tanned, ' +
  'with tousled natural BLOND hair (lightly styled, NOT heavily gelled or wet-look), a THIN pencil MOUSTACHE, ' +
  'cheap flashy Euro wraparound SUNGLASSES, an open black LEATHER JACKET over a bare tanned chest with a thick ' +
  'gold chain, headphones around his neck, a greasy confident smirk, glistening with sweat, hands on the DJ decks.'

// ---- REFERENCE SHEET (text-to-image) ----
const REFS = [
  { out: 'public/assets/ref/kiki.jpg', size: '1664*2496',
    prompt: `Full-length reference photo of ${KIKI} She stands mid-rave, one arm up, laser haze behind. ${WARDROBE} ${STYLE} ${NEG}` },
  { out: 'public/assets/ref/crew.jpg', size: '2720*1530',
    prompt: `Reference photo of the recurring crew together. ${TRIO} They pose as a trio on a podium, champagne, gold confetti. ${WARDROBE} ${STYLE} ${NEG}` },
  { out: 'public/assets/ref/dieter.jpg', size: '1664*2496',
    prompt: `Clear, well-lit reference PORTRAIT, waist-up and centered, of ${DIETER} He is behind the glowing DJ decks, one hand on a fader, arm raised, magenta and acid-green lasers and haze behind him. His face is large, sharp and clearly visible — this is a character reference so he must be unmistakable, not a silhouette. ${STYLE} ${NEG}` },
]

// ---- STORY / CITY SCENES (edit — reuse the refs so faces stay consistent) ----
// Each references specific ref images by index in the prompt ("woman in image 1", etc.).
const K = 'public/assets/ref/kiki.jpg', C = 'public/assets/ref/crew.jpg', D = 'public/assets/ref/dieter.jpg'
// Keep the referenced people/outfits identical; each scene is that SONG's gag, staged with
// our cast (Kiki fronting, Dieter at the decks, the leopard crew up front). Funny + campy.
const KEEP = 'Keep the EXACT same faces and outfits from the reference images — do not change the people.'
const SCENES = [
  // ---- TOUR CITIES, each themed to the song bound to it ----
  { out: 'public/assets/tour/ibiza.jpg', size: '2720*1530', refs: [C, K], // Touch My Subwoofer
    prompt: `${KEEP} FUNNY campy scene: the leopard trio (image 1) and silver-blonde Kiki (image 2) drape themselves over a COLOSSAL wall of subwoofer speakers at a white open-air Ibiza superclub at sunrise, pressing their bodies to the giant speaker cones to "feel the bass", foam and champagne spray, palm silhouettes, a mega-yacht on the horizon. ${WARDROBE} ${STYLE} ${NEG}` },
  { out: 'public/assets/tour/tokyo.jpg', size: '2720*1530', refs: [C, K, D], // Euro Airways
    prompt: `${KEEP} ABSURD funny scene: a cramped neon Tokyo micro-club dressed as an AIRPLANE CABIN — the leopard trio (image 1) buckled into tiny airline seats screaming with champagne, Kiki (image 2) as a squeaky silver flight-attendant handing out drinks, DJ Dieter (image 3) as the sleazy grinning "captain" at the cockpit/decks, lit seatbelt signs, rain-slicked windows, a red Ferrari outside. Turbulence chaos. ${WARDROBE} ${STYLE} ${NEG}` },
  { out: 'public/assets/tour/miami.jpg', size: '2720*1530', refs: [C, K, D], // Pump My Iron
    prompt: `${KEEP} RIDICULOUS funny scene: a neon-spandex GYM rave on a Miami rooftop pool deck at pink sunset — the leopard trio (image 1) and Kiki (image 2) in glitter workout gear pumping chrome dumbbells and flexing, dripping sweat, DJ Dieter (image 3) grinning as their spotter at the decks, a gold Ferrari and mega-yacht below, champagne towers. ${WARDROBE} ${STYLE} ${NEG}` },
  { out: 'public/assets/tour/berlin.jpg', size: '2720*1530', refs: [C, K, D], // The Basement VIP
    prompt: `${KEEP} DEADPAN funny scene: a dingy Berlin basement "VIP" behind a red velvet rope — mops, buckets and exposed pipes in the corner, the leopard trio (image 1) and Kiki (image 2) acting ultra-glamorous and exclusive among the cleaning supplies, DJ Dieter (image 3) guarding the rope, steam, one lonely disco light. ${WARDROBE} ${STYLE} ${NEG}` },
  // ---- MAINSTAGE / BROADCAST club frames (current-track fallback) — cast on stage ----
  { out: 'public/assets/video/frames/club-booth.jpg', size: '2720*1530', refs: [K, D, C],
    prompt: `${KEEP} KIKI G (image 1) commands the DJ decks in her silver two-piece, arm thrown up; DJ Dieter (image 2) leans in sleazily beside her at the decks; the leopard trio (image 3) scream and reach up from the front row. Lasers, fog, sweat, champagne. ${STYLE} ${NEG}` },
  { out: 'public/assets/video/frames/club-crowd.jpg', size: '2720*1530', refs: [K, D],
    prompt: `${KEEP} Camcorder view over a packed INDOOR club crowd toward the mainstage: a GIANT LED JUMBOTRON above the stage shows a big live close-up of KIKI (image 1, silver) singing, while DJ DIETER (image 2, leather jacket + wraparound shades) works the decks below; green and magenta lasers, fog, a few phone flashes. Keep the foreground clear — do NOT fill it with a wall of raised hands. ${STYLE} ${NEG}` },
  { out: 'public/assets/video/frames/club-podium.jpg', size: '2720*1530', refs: [C, K],
    prompt: `${KEEP} INSIDE a packed nightclub: the leopard trio (image 1) and Kiki (image 2) dance on a small raised DJ STAGE RISER / go-go platform above the crowd, with chrome railings, champagne spraying, gold confetti, strobes and lasers overhead. It is clearly an indoor club stage — NOT a mountain, NOT any outdoor landscape or terrain. ${WARDROBE} ${STYLE} ${NEG}` },
  { out: 'public/assets/video/frames/club-floor.jpg', size: '2720*1530', refs: [K, D],
    prompt: `${KEEP} Wide festival-scale INDOOR club mainstage seen from the crowd: TWO GIANT LED JUMBOTRON SCREENS flank the DJ booth showing huge live close-ups of KIKI (image 1, silver crop top) and DJ DIETER (image 2, leather jacket + sunglasses); big laser truss overhead, fog, gold confetti. Keep hands out of the foreground. ${STYLE} ${NEG}` },
  { out: 'public/assets/video/frames/club-vip.jpg', size: '2720*1530', refs: [C, K],
    prompt: `${KEEP} The leopard trio (image 1) and Kiki (image 2) in a VIP bottle-service booth, sparklers on champagne magnums, toasting and screaming with joy, humid haze, lasers. ${WARDROBE} ${STYLE} ${NEG}` },
  // ---- LORE story beats (match the Origin scroll-journey chapters) ----
  { out: 'public/assets/lore/munich.jpg', size: '2720*1530', refs: [D],
    prompt: `${KEEP} FUNNY: DJ Dieter (image 1) alone in a cramped 1990s soundproofed Munich basement crammed with vintage synthesizers and MIDI workstations, hugging a giant subwoofer, DOZENS of framed noise-complaint letters on the wall behind him, single bare bulb, smug proud expression. ${STYLE} ${NEG}` },
  { out: 'public/assets/lore/stockholm.jpg', size: '2720*1530', refs: [K],
    prompt: `${KEEP} FUNNY: Kiki (image 1) as a roller-skating waitress mid-glide through a late-1990s Stockholm dial-up cyber café, silver two-piece, balancing a tray of lattes, walls of beige CRT monitors and tangled ethernet cables, utterly unimpressed expression. ${WARDROBE} ${STYLE} ${NEG}` },
  { out: 'public/assets/lore/sauna.jpg', size: '2720*1530', refs: [K, D],
    prompt: `${KEEP} FUNNY origin moment: Kiki (image 1) and DJ Dieter (image 2) in a steamy wood-panelled Berlin sauna — Dieter's waterproof drum machine sparks and overheats while Kiki dumps a cedar bucket of water on the glowing coals, an enormous burst of steam, both drenched, comedic. ${STYLE} ${NEG}` },
  { out: 'public/assets/lore/doctrine.jpg', size: '2720*1530', refs: [K, D],
    prompt: `${KEEP} DEADPAN FUNNY: Kiki (image 1) and DJ Dieter (image 2) signing a soggy dripping record-contract napkin at a small table, two sound engineers in rain ponchos behind them, a cedar bucket and a tube of thermal paste on the table, humid haze. ${STYLE} ${NEG}` },
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
