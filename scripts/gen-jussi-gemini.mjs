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
    // SQUARE and CROP-SAFE to match the other heroes: the hero CSS forces background-position
    // center and ignores --focus, so the face must sit dead-centre of the frame or wide/ultrawide
    // viewports crop the head off (which is exactly what the first epic attempt did).
    out: 'public/assets/lore/jussi-hero.jpg', ratio: '1:1', refs: [C],
    prompt: `${KEEP} ${RULE} COMPOSITION IS CRITICAL: his FACE must sit at the EXACT CENTRE of the square ` +
      `frame, with generous headroom above it, so the shot stays safe when cropped to a wide letterbox. Do ` +
      `NOT place his head near the top edge. EPIC low-angle HERO SHOT, shot from slightly below so he towers ` +
      `over the camera, monumental and centred. He wears FULL battered ice-hockey GOALTENDER equipment over ` +
      `his black shirt — big white leg pads, chest protector, blocker and catching glove — sunglasses on, a ` +
      `goalie stick in one hand and a beer in the other, standing in the mouth of a hockey goal that has been ` +
      `set up on a nightclub stage. The three friends from image 2 flank him, two on one side and one on the ` +
      `other, celebrating wildly with champagne — keep their exact faces and hair from that reference and ` +
      `dress them the same way. Behind them a packed crowd roars with arms raised, magenta and acid-green ` +
      `lasers blaze through fog, gold confetti falls. He is drenched in sweat and utterly, magnificently ` +
      `expressionless in the middle of the chaos. Cinematic, huge, godlike scale. ${STYLE} ${NEG}`,
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
    prompt: `${KEEP} ${RULE} TWO reference images: the bearded Finn from image 1, and the three friends from ` +
      `image 2. ALL THREE of them must appear here — the one with long dark hair, the one with platinum hair ` +
      `with pink tips, and the one with copper-red curls. Keep their exact faces and hair from the reference ` +
      `and dress them the same way, and frame the shot WIDE so all three are fully visible, two on one side ` +
      `of him and one on the other. ABSURD funny scene: the Finn wears full battered ice-hockey GOALTENDER ` +
      `equipment — big leg pads, chest protector, blocker and catching glove over his black shirt — sunglasses ` +
      `on, standing stone-faced in front of a glowing nightclub DJ booth as if defending a goal crease, a ` +
      `hockey stick laid across the decks and a beer balanced on the goalpost, while the three friends ` +
      `celebrate and dance around him. Lasers, fog, gold confetti. ${STYLE} ${NEG}`,
  },

  // ---- more situations ----
  {
    out: 'public/assets/lore/jussi-zamboni.jpg', ratio: '16:9', refs: [C],
    prompt: `${KEEP} ${RULE} GLORIOUSLY ABSURD scene: the bearded Finn from image 1 drives a full-size ice-rink ` +
      `ZAMBONI ice-resurfacing machine straight across a packed nightclub dancefloor, sitting bolt upright at ` +
      `the controls in his black shirt and sunglasses with a beer in one hand, utterly expressionless, as the ` +
      `crowd parts around him. The three women from image 2 (same faces, leopard and holographic rave outfits) ` +
      `dance on and beside the machine, delighted. Lasers, fog, gold confetti. ${STYLE} ${NEG}`,
  },
  {
    out: 'public/assets/lore/jussi-tv.jpg', ratio: '16:9',
    prompt: `${KEEP} ${RULE} DEADPAN funny scene: at the edge of a heaving nightclub, the bearded Finn has set ` +
      `up a tiny battered portable CRT television on a road case and turned his back completely on the party ` +
      `to watch an ICE HOCKEY GAME on it. He sits on a flight case, beer in hand, face lit by the small screen, ` +
      `totally absorbed and expressionless, while behind him the dancefloor erupts in lasers, fog and confetti. ` +
      `${STYLE} ${NEG}`,
  },
  {
    out: 'public/assets/lore/jussi-rider.jpg', ratio: '16:9',
    prompt: `${KEEP} ${RULE} DEADPAN funny scene in a shabby backstage dressing room: the bearded Finn sits on ` +
      `a battered couch between two tables. On his left, an enormous pristine untouched catering spread — fruit ` +
      `platters, sandwiches, vegetables — perfectly arranged and clearly never touched. On his right, a wooden ` +
      `beer crate absolutely demolished, empty bottles everywhere. He holds one full beer and stares straight ` +
      `ahead. A hockey stick leans on the wall. One bare bulb, laser haze under the door. ${STYLE} ${NEG}`,
  },
  {
    out: 'public/assets/lore/jussi-foam.jpg', ratio: '16:9', refs: [C],
    prompt: `${KEEP} ${RULE} HILARIOUS scene at an open-air Ibiza foam party at sunrise: the bearded Finn from ` +
      `image 1 stands buried CHEST-DEEP in a rising sea of white foam, completely motionless and expressionless ` +
      `in his sunglasses, holding his beer carefully raised ABOVE the foam line to keep it safe. The women from ` +
      `image 2 (same faces and rave outfits) shriek with joy and hurl foam around him. Palm silhouettes, ` +
      `sunrise, lasers. ${STYLE} ${NEG}`,
  },
  {
    out: 'public/assets/lore/jussi-inspection.jpg', ratio: '16:9', refs: [K, D],
    prompt: `${KEEP} ${RULE} HILARIOUS deadpan scene: the bearded Finn from image 1 conducts a formal LÖYLY ` +
      `INSPECTION of a venue's sauna — he stands in the doorway holding a clipboard and a long thermometer, ` +
      `examining the wooden interior with grim professional scepticism, beer in his other hand. Behind him, ` +
      `hovering anxiously and awaiting his verdict like nervous students, are the blonde KIKI G from image 2 ` +
      `(exact face, platinum hair, silver metallic top) and DJ DIETER from image 3 (exact face, blond hair, ` +
      `thin moustache, wraparound sunglasses, open leather jacket), both wringing their hands. Steam, dim ` +
      `light, one laser creeping through the door. ${STYLE} ${NEG}`,
  },
  {
    out: 'public/assets/lore/jussi-ice.jpg', ratio: '16:9',
    prompt: `${KEEP} ${RULE} EPIC-but-deadpan scene: the bearded Finn hauls an ENORMOUS block of ice and a ` +
      `wooden cedar bucket through the middle of a packed, overheating nightclub, steam and sweat everywhere, ` +
      `the crowd blurred and delirious around him. He is completely unbothered, sunglasses on, carrying the ice ` +
      `like a man taking out the bins, a beer wedged in his elbow. Backlit by magenta and acid-green lasers ` +
      `through thick fog. He is the cooling system and nobody has noticed. ${STYLE} ${NEG}`,
  },
  {
    out: 'public/assets/lore/jussi-beerleague.jpg', ratio: '16:9',
    prompt: `${KEEP} ${RULE} QUIET funny scene, the total opposite of a nightclub: 6am in a freezing empty ` +
      `small-town ice rink, harsh fluorescent lights, completely deserted stands. The bearded Finn stands alone ` +
      `in the goal crease in full battered goaltender equipment over his black shirt, sunglasses on, absolutely ` +
      `still, breath steaming in the cold. A single open beer sits on the boards beside the net. Nobody is ` +
      `watching. This is the happiest he has ever been, and his face shows nothing. ${STYLE} ${NEG}`,
  },
  {
    out: 'public/assets/lore/jussi-booth.jpg', ratio: '16:9', refs: [D],
    prompt: `${KEEP} ${RULE} HILARIOUS scene in a cramped 2000s recording studio: the bearded Finn from image 1 ` +
      `stands at a large studio microphone wearing headphones over his sunglasses, mouth barely open, ` +
      `delivering a single unenthusiastic grunt. Through the control-room glass behind him, DJ DIETER from ` +
      `image 2 (exact face, blond hair, thin moustache, wraparound sunglasses, open leather jacket) is losing ` +
      `his mind with excitement, both arms in the air, thrilled. The Finn holds a beer at the mic stand. ` +
      `${STYLE} ${NEG}`,
  },
  {
    out: 'public/assets/lore/jussi-merch.jpg', ratio: '16:9',
    prompt: `${KEEP} ${RULE} DEADPAN funny scene: the bearded Finn stands behind a small folding merchandise ` +
      `table at the back of a club, arms folded, sunglasses on, completely expressionless, guarding neatly ` +
      `stacked t-shirts and CDs. A small queue of eager young fans hesitates a few feet away, visibly nervous, ` +
      `nobody quite willing to approach. A beer sits on the corner of the table. Lasers and fog behind them. ` +
      `${STYLE} ${NEG}`,
  },
  {
    out: 'public/assets/lore/jussi-bus.jpg', ratio: '16:9', refs: [K, D],
    prompt: `${KEEP} ${RULE} DEADPAN funny scene inside a cramped tour bus at 4am: the bearded Finn from image 1 ` +
      `is fast ASLEEP sitting bolt upright, sunglasses still on, chin up, his full beer held perfectly level and ` +
      `unspilled in one hand. Around him total chaos — the blonde KIKI G from image 2 (exact face, platinum ` +
      `hair, silver metallic crop top) and DJ DIETER from image 3 (exact face, blond hair, thin moustache, ` +
      `wraparound sunglasses, open leather jacket) are mid-argument over a tangle of cables and empty ` +
      `champagne bottles. Neon strip light, condensation on the windows. ${STYLE} ${NEG}`,
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
