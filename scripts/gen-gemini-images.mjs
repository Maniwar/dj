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

// Style spine: RAW PHOTOREAL rave photography (like a real 2002 Eurodance CD cover),
// NOT illustration/CGI/airbrushed. On-camera flash, grit, sweat, neon lasers.
const STYLE =
  'Raw photorealistic on-camera-flash nightlife photography, real 35mm film, high-ISO grain, harsh ' +
  'direct flash, realistic sweaty glistening skin, real human faces, slight motion blur, gritty ' +
  'photojournalistic 2000s Eurodance rave, neon magenta and acid-green laser beams cutting through ' +
  'thick haze and fog, condensation, wet. Trashy Euro excess: gold chains, champagne, chrome. ' +
  'WARDROBE is authentic festival/rave wear — leopard-print crop tops, bikini tops, hot pants, mesh, ' +
  'fishnet, body glitter, platform boots — NOT formal cocktail dresses. Skimpy, sweaty, wild, ' +
  'energetic, but tasteful and non-explicit. Authentic, unpolished, candid. Shot on a real camera.'

const NEG =
  'ABSOLUTELY NOT an illustration, NOT a cartoon, NOT anime, NOT CGI, NOT a 3D render, NOT airbrushed, ' +
  'NOT painterly, NOT AI-smooth — must look like a REAL PHOTOGRAPH. ' +
  'ABSOLUTELY NO TEXT: no words, letters, titles, captions, logos, numbers, watermark, signage. ' +
  'No extra limbs, no deformed hands, no plastic skin.'

const JOBS = [
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
    prompt: 'Three glamorous women in leopard-print rave wear (crop tops, hot pants, bikini tops) dancing wildly on a raised gold podium, champagne ' +
      'spraying, gold confetti falling, lasers and strobes, euphoric, mid-scream. ' + STYLE + ' ' + NEG,
  },
  {
    out: 'public/assets/video/frames/club-vip.jpg', aspect: '16:9',
    prompt: 'VIP bottle-service booth, sparklers on champagne magnums, three glamorous female super-fans in ' +
      'LEOPARD-PRINT outfits toasting and screaming with joy, moody club lighting, lasers, humid haze. ' +
      'No men. ' + STYLE + ' ' + NEG,
  },
  {
    out: 'public/assets/video/frames/club-floor.jpg', aspect: '16:9',
    prompt: 'Wide shot of a heaving Love-Parade-scale dancefloor under a giant LED wall and laser truss, ' +
      'fog, gold confetti, thousands of silhouettes with hands up, mega-festival energy. ' + STYLE + ' ' + NEG,
  },
  {
    out: 'public/assets/video/frames/club-booth.jpg', aspect: '16:9',
    prompt: 'KIKI G — a blonde woman in a shiny SILVER metallic crop top with smudged glam Y2K makeup — ' +
      'commands the DJ decks with one arm thrown in the air, while a packed crowd of female super-fans in ' +
      'LEOPARD-PRINT outfits scream and reach toward her, lasers, fog, sweat. ' +
      'NO men, no leather jackets, no sunglasses, no moustache. ' + STYLE + ' ' + NEG,
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
