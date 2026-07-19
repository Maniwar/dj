#!/usr/bin/env node
// Generates the site's STATIC image assets with the Gemini / Imagen API (images only,
// per the brief). Writes to /public/assets/** which Vite serves natively.
// Requires env var `geminiapikey`. Run: npm run gen:images
//
// NOTE: video is NOT generated here — that's AtlasCloud (see gen-atlascloud-videos.mjs).

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = process.env.geminiapikey
if (!KEY) {
  console.error('[gen:images] missing env var geminiapikey')
  process.exit(1)
}
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const MODEL = process.env.IMAGEN_MODEL || 'imagen-4.0-generate-001'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predict?key=${KEY}`

// Shared style spine keeps every asset in the same farcical Euro-luxury world.
const STYLE =
  'Farcical European luxury Eurodance aesthetic, Y2K/Frutiger-Aero meets baroque gold opulence, ' +
  'leopard print accents, gilded gold, champagne, mega-festival EDC mainstage scale with lasers, ' +
  'pyro and god-rays, humid steamy nightclub atmosphere, cinematic, hyper-saturated, glossy, ' +
  'volumetric light, lens flares, ultra-detailed, photoreal-but-airbrushed CD-booklet art. ' +
  'Tasteful, glamorous, joyful adults celebrating.'

const NEG =
  'ABSOLUTELY NO TEXT of any kind: no words, no letters, no titles, no captions, no logos, no ' +
  'numbers, no watermark, no signage lettering, no UUID strings — a purely photographic image. ' +
  'No extra limbs, no deformed hands, not muted, not flat.'

const JOBS = [
  {
    out: 'public/assets/hero-keyart.jpg',
    aspect: '16:9',
    prompt:
      'Epic hero key art: the Eurodance duo SYSTEM OVERLOAD commanding a colossal festival mainstage. ' +
      'DJ WOLFGANG — deeply tanned European man, tiny pencil moustache, cheap chrome wraparound sunglasses, ' +
      'open black leather jacket, purple velvet tracksuit bottoms, smug synth-god energy. Beside him KIKI G — ' +
      'bubbly blonde woman, silver metallic chrome crop top, glossy Y2K makeup, platform boots, mid-laugh. ' +
      'Behind them a 50,000-strong crowd with raised hands and phone flashes, gold pyro columns, laser fans, ' +
      'a giant LED wall. ' + STYLE + ' ' + NEG,
  },
  {
    out: 'public/assets/tour/ibiza.jpg',
    aspect: '16:9',
    prompt:
      'Leaked-VHS-meets-club-documentary still: three glamorous female super-fans going wild at an open-air ' +
      'Ibiza superclub at sunrise — foam cannons, palm silhouettes, a luxury yacht on the horizon, leopard-print ' +
      'outfits, gold jewellery, champagne spray, euphoric dancing. Tape grain, timestamp "IBIZA 2004". ' +
      STYLE + ' ' + NEG,
  },
  {
    out: 'public/assets/tour/tokyo.jpg',
    aspect: '16:9',
    prompt:
      'Gritty club-doc still: the same three glamorous female super-fans raving in a tiny neon Tokyo micro-club, ' +
      'rain-slicked windows, kanji neon signage, low ceiling, leopard print, holographic silver, a red Ferrari ' +
      'parked in the wet street outside. VHS tracking glitches, timestamp "TOKYO 2004". ' + STYLE + ' ' + NEG,
  },
  {
    out: 'public/assets/tour/miami.jpg',
    aspect: '16:9',
    prompt:
      'Club-doc still: the same three glamorous female super-fans partying on a Miami rooftop pool deck at pink ' +
      'sunset — infinity pool, palm uplights, a docked mega-yacht and a gold Ferrari below, champagne towers, ' +
      'leopard print, gold sequins, ocean humidity haze. Timestamp "MIAMI 2004". ' + STYLE + ' ' + NEG,
  },
  {
    out: 'public/assets/tour/berlin.jpg',
    aspect: '16:9',
    prompt:
      'Steamy club-doc still: the same three glamorous female super-fans in a wood-panelled Berlin warehouse ' +
      'sauna-club where SYSTEM OVERLOAD short-circuited into existence — thick steam, glowing coals, condensation, ' +
      'gold and leopard accents, a cedar bucket, euphoric faces. Timestamp "BERLIN 2004". ' + STYLE + ' ' + NEG,
  },
  // ---- CLUB-ATMOSPHERE FRAMES for the persistent Broadcast layer (beat-cut between these) ----
  {
    out: 'public/assets/video/frames/club-crowd.jpg', aspect: '16:9',
    prompt: 'First-person camcorder view pushing through a packed sweaty luxury nightclub crowd, hundreds of ' +
      'raised hands and phone flashes, green and magenta lasers slicing through fog toward a gilded DJ booth. ' + STYLE + ' ' + NEG,
  },
  {
    out: 'public/assets/video/frames/club-podium.jpg', aspect: '16:9',
    prompt: 'Three glamorous women in leopard-print dresses dancing wildly on a raised gold podium, champagne ' +
      'spraying, gold confetti falling, lasers and strobes, euphoric, mid-scream. ' + STYLE + ' ' + NEG,
  },
  {
    out: 'public/assets/video/frames/club-vip.jpg', aspect: '16:9',
    prompt: 'VIP bottle-service booth dripping in gold and leopard upholstery, sparklers on champagne magnums, ' +
      'the same three glamorous women toasting and laughing, moody club lighting, humid haze. ' + STYLE + ' ' + NEG,
  },
  {
    out: 'public/assets/video/frames/club-floor.jpg', aspect: '16:9',
    prompt: 'Wide shot of a heaving Love-Parade-scale dancefloor under a giant LED wall and laser truss, ' +
      'fog, gold confetti, thousands of silhouettes with hands up, mega-festival energy. ' + STYLE + ' ' + NEG,
  },
  {
    out: 'public/assets/video/frames/club-booth.jpg', aspect: '16:9',
    prompt: 'DJ WOLFGANG (tanned European man, tiny moustache, cheap chrome sunglasses, open leather jacket) ' +
      'and KIKI G (blonde woman, silver chrome crop top, glossy Y2K makeup) commanding a gilded DJ booth, ' +
      'hands in the air, pyro behind them, adoring crowd in front. ' + STYLE + ' ' + NEG,
  },
]

async function generate(job) {
  const body = {
    instances: [{ prompt: job.prompt }],
    parameters: { sampleCount: 1, aspectRatio: job.aspect, personGeneration: 'allow_adult' },
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 300)}`)
  }
  const json = await res.json()
  const b64 = json?.predictions?.[0]?.bytesBase64Encoded
  if (!b64) throw new Error('no image bytes in response: ' + JSON.stringify(json).slice(0, 300))
  const outPath = resolve(ROOT, job.out)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, Buffer.from(b64, 'base64'))
  return outPath
}

const only = process.argv[2] // optional: generate just one, by substring of out path
const jobs = only ? JOBS.filter((j) => j.out.includes(only)) : JOBS
console.log(`[gen:images] model=${MODEL} · ${jobs.length} asset(s)`)
for (const job of jobs) {
  process.stdout.write(`  • ${job.out} ... `)
  try {
    await generate(job)
    console.log('OK')
  } catch (e) {
    console.log('FAIL — ' + e.message)
  }
}
