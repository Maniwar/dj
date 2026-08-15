#!/usr/bin/env node
// Generates JUSSI JÄRVI's character images with the Gemini image models, using a real
// SOURCE PHOTO as the identity anchor so his face/beard/sunglasses stay consistent across
// every scene (the same job AtlasCloud's Seedream refs do for the rest of the cast — this
// path exists because Gemini is reachable in environments where AtlasCloud is egress-blocked).
//
// Usage:
//   node scripts/gen-jussi-gemini.mjs            # ref portrait + all scenes
//   node scripts/gen-jussi-gemini.mjs hero       # just the ones matching "hero"
//   JUSSI_SRC=/path/to/photo.jpg node scripts/gen-jussi-gemini.mjs
//
// Requires env var `geminiapikey`. Writes into public/assets/.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = process.env.geminiapikey
if (!KEY) { console.error('[gen:jussi] missing env var geminiapikey'); process.exit(1) }

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image'
const BASE = 'https://generativelanguage.googleapis.com/v1beta'
// The upright source photo of the man Jussi is based on. Kept OUT of the repo by default
// (it is a real person's photo and this repo is published) — pass JUSSI_SRC to point at it.
const SRC = process.env.JUSSI_SRC || resolve(ROOT, '.private/jussi-source.jpg')

const STYLE =
  'Raw photorealistic on-camera-flash nightlife photography, real 35mm film, high-ISO grain, realistic ' +
  'skin texture, slight motion blur, gritty photojournalistic 2000s Eurodance RAVE. Neon magenta and ' +
  'acid-green laser beams through thick haze, condensation, chrome. Authentic, unpolished, candid.'
const NEG =
  'It must look like a REAL PHOTOGRAPH — NOT illustration, cartoon, anime, CGI, 3D render or AI-smooth. ' +
  'No text, letters, logos, watermark or numbers anywhere. Hands anatomically correct with exactly five ' +
  'fingers. Nothing explicit.'
// Identity anchor — everything downstream must match the man in the supplied photo.
const KEEP =
  'Keep the EXACT face, head shape, skin tone, the huge thick dark beard that turns grey at the ends, ' +
  'the shaggy dark hair and the black rectangular wraparound sunglasses of the man in the supplied ' +
  'reference photograph. He is the same person in every image. He always wears a plain black heavy-duty ' +
  'utility work shirt, buttoned, sleeves rolled.'
const RULE =
  'JUSSI NEVER changes expression, never dances, never smiles and never looks at the camera. Whatever ' +
  'chaos surrounds him he stands or sits perfectly still and deadpan, sunglasses on, a beer in hand. ' +
  'He is a big broad-shouldered pale Finnish man in his early 40s.'

// The canonical cast references. Scenes that include Kiki / Dieter / the crew MUST pass these
// as extra reference images, or the model invents lookalike strangers in the right outfits and
// the shot silently desyncs from the 13 videos and every existing still.
const K = 'public/assets/ref/kiki.jpg'
const D = 'public/assets/ref/dieter.jpg'
const C = 'public/assets/ref/crew.jpg'

const JOBS = [
  {
    out: 'public/assets/ref/jussi.jpg', ratio: '3:4',
    prompt: `${KEEP} ${RULE} Clear, well-lit character REFERENCE PORTRAIT, waist-up and centered: he stands ` +
      `completely still and expressionless in a nightclub doorway holding a large glass of beer, magenta and ` +
      `acid-green laser haze behind him. His face and enormous beard are large, sharp and clearly visible. ` +
      `He is NOT dancing, NOT smiling, NOT posing. ${STYLE} ${NEG}`,
  },
  {
    out: 'public/assets/lore/jussi-hero.jpg', ratio: '3:4',
    prompt: `${KEEP} ${RULE} Full-length hero portrait: he stands dead still in the doorway of a wood-panelled ` +
      `Finnish sauna, thick steam rolling out around him, a wooden sauna ladle in one hand and a beer in the ` +
      `other, glowing coals visible behind. Magenta and acid-green club light bleeds in from a corridor. ` +
      `He looks profoundly unimpressed. ${STYLE} ${NEG}`,
  },
  {
    out: 'public/assets/lore/jussi-sauna.jpg', ratio: '16:9', refs: [K, D],
    prompt: `${KEEP} ${RULE} There are THREE people, each taken from a different reference image: the bearded ` +
      `Finn from image 1, the blonde woman KIKI G from image 2 (keep her exact face, platinum hair and silver ` +
      `metallic crop top), and the tanned blond man DJ DIETER from image 3 (keep his exact face, blond hair, ` +
      `thin pencil moustache, wraparound sunglasses and open black leather jacket). Use their EXACT faces from ` +
      `those references — do not invent different people — but give them NEW poses for this scene. ` +
      `HILARIOUS deadpan scene inside a cramped wood-panelled sauna: the Finn sits perfectly still on the top ` +
      `bench in his black shirt and sunglasses holding a beer, radiating calm authority, calmly pouring one ` +
      `more ladle of water onto the glowing coals — while below him Kiki and Dieter flail and gasp dramatically ` +
      `in the steam, red-faced and overwhelmed. A drum machine steams on the bench beside them. ${STYLE} ${NEG}`,
  },
  {
    out: 'public/assets/lore/jussi-hockey.jpg', ratio: '16:9', refs: [C],
    prompt: `${KEEP} ${RULE} TWO reference images: the bearded Finn from image 1, and the trio of female ` +
      `super-fans from image 2 — keep the crew's EXACT faces, hair and leopard-print two-piece rave outfits ` +
      `from that reference, but give them new dancing poses. ABSURD funny scene: the Finn wears full battered ` +
      `ice-hockey GOALTENDER pads, chest protector and blocker over his black shirt, sunglasses on, standing ` +
      `stone-faced in front of a glowing nightclub DJ booth as if defending a goal crease, a hockey stick laid ` +
      `across the decks, a beer balanced on the goalpost, while the leopard crew rave wildly around him. ` +
      `Lasers, fog. ${STYLE} ${NEG}`,
  },
  {
    out: 'public/assets/lore/jussi-beer.jpg', ratio: '16:9',
    prompt: `${KEEP} ${RULE} DEADPAN funny scene: he sits alone at a battered nightclub backstage table lit by ` +
      `one bare bulb, surrounded by a towering wall of empty beer glasses and steins arranged in neat, precise ` +
      `rows, holding one full beer, staring straight ahead expressionless. A hockey stick leans against the ` +
      `wall behind him. Laser haze creeps under the door. ${STYLE} ${NEG}`,
  },
]

if (!existsSync(SRC)) {
  console.error(`[gen:jussi] source photo not found: ${SRC}\n` +
    `  Put the upright reference photo there, or set JUSSI_SRC=/path/to/photo.jpg`)
  process.exit(1)
}
const srcB64 = readFileSync(SRC).toString('base64')

const asPart = (p) => ({
  inline_data: { mime_type: 'image/jpeg', data: readFileSync(resolve(ROOT, p)).toString('base64') },
})

async function generate(job) {
  // image 1 is ALWAYS Jussi's source photo; any job.refs follow as image 2, 3, ... and the
  // prompt addresses them by that order.
  const parts = [
    { inline_data: { mime_type: 'image/jpeg', data: srcB64 } },
    ...(job.refs ?? []).map(asPart),
    { text: job.prompt },
  ]
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: job.ratio },
    },
  }
  const res = await fetch(`${BASE}/models/${MODEL}:generateContent?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const j = await res.json()
  const outParts = j?.candidates?.[0]?.content?.parts ?? []
  const img = outParts.find((p) => p.inlineData?.data || p.inline_data?.data)
  const b64 = img?.inlineData?.data || img?.inline_data?.data
  if (!b64) throw new Error('no image in response: ' + JSON.stringify(j).slice(0, 300))
  const outPath = resolve(ROOT, job.out)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, Buffer.from(b64, 'base64'))
  return Buffer.from(b64, 'base64').length
}

const only = process.argv[2]
const jobs = only ? JOBS.filter((j) => j.out.includes(only)) : JOBS
console.log(`[gen:jussi] model=${MODEL} · ${jobs.length} image(s)`)
for (const job of jobs) {
  process.stdout.write(`  • ${job.out} ... `)
  try {
    const bytes = await generate(job)
    console.log(`OK (${(bytes / 1e6).toFixed(2)} MB)`)
  } catch (e) {
    console.log('FAIL — ' + e.message.split('\n')[0])
  }
}
