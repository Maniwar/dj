#!/usr/bin/env node
// Generate 4 distinct club-floor mainstage compositions in parallel so we can pick the most
// COHERENT one (someone clearly performing at the CENTRE booth — not an empty booth flanked
// by screens) with the cleanest hands. Seedream v5.0 edit, refs = Kiki + Dieter.
//   node --env-file=.env scripts/gen-club-floor-variants.mjs
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = process.env.atlascloudapikey
if (!KEY) { console.error('missing env var atlascloudapikey'); process.exit(1) }
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const API = 'https://api.atlascloud.ai/api/v1'
const EDIT = 'bytedance/seedream-v5.0-pro/edit'
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const SIZE = '2720*1530'
const K = 'public/assets/ref/kiki.jpg', D = 'public/assets/ref/dieter.jpg'

const STYLE =
  'Raw photorealistic on-camera-flash nightlife photography, real 35mm film, high-ISO grain, harsh direct ' +
  'flash, sweaty glistening skin, real human faces, slight motion blur, gritty photojournalistic 2000s ' +
  'Eurodance RAVE. Neon magenta and acid-green laser beams through thick haze, condensation, chrome, gold ' +
  'chains, champagne spray. Authentic, unpolished, candid. Shot on a real camera.'
const NEG =
  'It must look like a REAL PHOTOGRAPH — NOT illustration, cartoon, anime, CGI, 3D render, airbrushed or ' +
  'AI-smooth. No text, letters, logos, watermark, numbers. No extra limbs, no plastic skin. Nothing explicit ' +
  'or nude. HANDS: every visible hand must be anatomically correct and relaxed with EXACTLY FIVE fingers — ' +
  'NO extra or missing fingers, NO fused, twisted, warped, bent-backwards or melting hands, NO claw hands. ' +
  'Any hand shown in SHARP CLOSE-UP DETAIL (the performers on the jumbotrons / at the booth) must be doing a ' +
  'clear defined action (on the decks, holding a mic) with five correct fingers; the distant crowd may raise ' +
  'their arms freely because they are dark backlit SILHOUETTES with no finger detail to distort.'
const KEEP =
  'Use the SAME faces, hair colour and outfits as the people in the reference images (Kiki = platinum blonde ' +
  'in a SILVER sequin two-piece; Dieter = blond, thin moustache, cheap wraparound sunglasses, open black ' +
  'leather jacket, gold chain), but give each a NEW natural pose that fits THIS scene. Only their identity ' +
  'and wardrobe carry over — not the reference pose or framing.'
const BASE =
  'Wide festival-scale INDOOR club mainstage seen from a HYPED crowd, a big laser truss overhead, sweeping ' +
  'beams, fog, gold confetti raining down. The CROWD fills the foreground as an ENERGETIC mass of BACKLIT ' +
  'DARK SILHOUETTES — arms thrown up, jumping and dancing in unison to the beat (rim-lit silhouettes so no ' +
  'finger detail is visible). Everyone on stage is mid-dance, full of movement and energy. '

// Every variant puts a real performer AT the centre booth — they differ in who is centred and
// what the two flanking jumbotron screens show.
const VARIANTS = [
  { out: 'public/assets/video/frames/variants/club-floor-v1.jpg',
    scene: BASE + 'In the CENTRE, physically on stage at a glowing clear acrylic DJ booth: DJ DIETER mixing with ' +
      'both hands on the decks, and KIKI standing beside him at the front of the booth singing into a handheld ' +
      'microphone. TWO GIANT LED JUMBOTRON SCREENS flank the booth showing the live magnified close-up feed of ' +
      'the same two performers — LEFT screen Kiki singing, RIGHT screen Dieter at the decks — each figure fully ' +
      'inside its rectangular screen bezel.' },
  { out: 'public/assets/video/frames/variants/club-floor-v2.jpg',
    scene: BASE + 'In the CENTRE, physically at the glowing clear DJ booth, DJ DIETER mixing with both hands down ' +
      'on the decks, head lowered, grinning. The TWO flanking JUMBOTRON SCREENS both show a huge live close-up of ' +
      'KIKI singing into a microphone (fully inside each screen bezel). Kiki is the on-screen star; Dieter is the ' +
      'live DJ at the booth.' },
  { out: 'public/assets/video/frames/variants/club-floor-v3.jpg',
    scene: BASE + 'In the CENTRE, at the FRONT of the glowing DJ booth, KIKI sings into a handheld microphone while ' +
      'DJ DIETER works the decks just behind her. The TWO flanking JUMBOTRON SCREENS show ONLY abstract pulsing ' +
      'magenta-and-green laser graphics and light patterns — NO people, NO faces on the screens.' },
  { out: 'public/assets/video/frames/variants/club-floor-v4.jpg',
    scene: BASE + 'In the CENTRE, physically on stage: DJ DIETER at the decks with both hands on the faders and ' +
      'KIKI beside him singing into a mic. The TWO flanking JUMBOTRON SCREENS display ONLY huge abstract ' +
      'kaleidoscopic laser visuals and sparks — NO faces, NO people on the screens.' },
]

function toDataUrl(relPath) {
  const p = resolve(ROOT, relPath)
  if (!existsSync(p)) throw new Error(`ref not found: ${relPath}`)
  return `data:image/jpeg;base64,${readFileSync(p).toString('base64')}`
}
async function j(url, opts) {
  const res = await fetch(url, opts)
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}\n${text.slice(0, 300)}`)
  return JSON.parse(text)
}
async function poll(id, { tries = 90, delay = 4000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = await j(`${API}/model/prediction/${id}`, { headers: H })
    const s = (r.status || r.data?.status || '').toLowerCase()
    const outputs = r.outputs || r.data?.outputs || []
    if (s === 'completed' || s === 'succeeded') return outputs[0]
    if (s === 'failed' || s === 'error') throw new Error(`job ${id} failed`)
    await new Promise((res) => setTimeout(res, delay))
  }
  throw new Error(`job ${id} timed out`)
}
async function run(v) {
  const body = { model: EDIT, size: SIZE, output_format: 'jpeg',
    prompt: `${KEEP} ${v.scene} ${STYLE} ${NEG}`, images: [toDataUrl(K), toDataUrl(D)] }
  const r = await j(`${API}/model/generateImage`, { method: 'POST', headers: H, body: JSON.stringify(body) })
  const id = r.prediction_id || r.id || r.data?.id
  const url = await poll(id)
  if (!url) throw new Error('no output url')
  const dl = await fetch(url); if (!dl.ok) throw new Error(`download HTTP ${dl.status}`)
  const outPath = resolve(ROOT, v.out); mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, Buffer.from(await dl.arrayBuffer()))
}

mkdirSync(resolve(ROOT, 'public/assets/video/frames/variants'), { recursive: true })
console.log(`[variants] generating ${VARIANTS.length} club-floor compositions…`)
await Promise.all(VARIANTS.map(async (v) => {
  try { await run(v); console.log(`  ✓ ${v.out}`) }
  catch (e) { console.log(`  ✗ ${v.out} — ${e.message.split('\n')[0]}`) }
}))
console.log('[variants] done')
