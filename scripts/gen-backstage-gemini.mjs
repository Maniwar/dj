#!/usr/bin/env node
// Generates BACKSTAGE frames for Kiki, Dieter and the crew, identity-locked to the canonical
// reference sheets in public/assets/ref/ so the faces match the rest of the site (and the 15
// videos). Same job gen-jussi-gemini.mjs does for the Finn, but anchored on refs rather than a
// source photograph.
//
//   node scripts/gen-backstage-gemini.mjs           # everything
//   node scripts/gen-backstage-gemini.mjs kiki      # only ids containing "kiki"
//
// Requires geminiapikey. Writes to public/assets/backstage/.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = process.env.geminiapikey
if (!KEY) { console.error('[backstage] missing env var geminiapikey'); process.exit(1) }

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image'
const BASE = 'https://generativelanguage.googleapis.com/v1beta'

const K = 'public/assets/ref/kiki.jpg'
const D = 'public/assets/ref/dieter.jpg'
const C = 'public/assets/ref/crew.jpg'

const STYLE =
  'Raw photorealistic on-camera-flash nightlife photography, real 35mm film, high-ISO grain, ' +
  'realistic skin texture, slight motion blur, gritty photojournalistic 2000s Eurodance RAVE. ' +
  'Neon magenta and acid-green laser haze, condensation, chrome. Authentic, unpolished, candid.'
const NEG =
  'It must look like a REAL PHOTOGRAPH — NOT illustration, cartoon, anime, CGI or 3D render. ' +
  'No text, letters, logos, watermark or numbers anywhere. Hands anatomically correct with ' +
  'exactly five fingers. Nothing explicit; keep it tasteful.'
const KEEP =
  'Use the EXACT faces, hair and outfits of the people in the reference image(s) — same people, ' +
  'unmistakably — but give them a NEW pose and action for THIS scene. Do not copy the reference pose.'

const KIKI = 'KIKI G: the blonde star with shoulder-length platinum hair, smudged glam Y2K makeup, ' +
  'a shiny SILVER metallic sequin crop top with separate silver hot pants.'
const DIETER = 'DJ DIETER: tanned, tousled BLOND hair, a THIN pencil MOUSTACHE, cheap flashy Euro ' +
  'wraparound SUNGLASSES, an open black LEATHER JACKET over a bare chest with a thick gold chain.'
const CREW = 'The three friends from the reference photo: the tall one with long dark hair, the petite ' +
  'one with platinum hair with pink tips, and the one with copper-red curls. Keep their exact faces and ' +
  'hair. They are OFF DUTY here and FULLY COVERED UP — each wears a big oversized tour jacket or hoodie ' +
  'zipped over her clothes, plus jeans or track pants. Modest, casual, warm clothing.'

const JOBS = [
  // ---------------- KIKI ----------------
  { out: 'kiki-skates.jpg', refs: [K], prompt: `${KEEP} ${KIKI} HILARIOUS scene: she cuts through a packed nightclub on ROLLER SKATES at speed, balancing a tray of coffee cups perfectly level above her head without spilling a drop, weaving between dancers, entirely unbothered — a callback to her cyber-café years. Lasers, fog.` },
  { out: 'kiki-extinguisher.jpg', refs: [K], prompt: `${KEEP} ${KIKI} DEADPAN funny scene: she carries an unplugged drum machine wrapped up in a towel cradled in both arms like a wounded animal being taken to the vet, expression grave and businesslike, striding down a backstage corridor. Bare bulb, laser haze under the door.` },
  { out: 'kiki-soundcheck.jpg', refs: [K], prompt: `${KEEP} ${KIKI} FUNNY scene: mid-soundcheck she screams into a microphone at full squeaky volume while two sound engineers behind the desk clamp their hands over their ears and wince. Empty club, house lights up, one laser.` },
  { out: 'kiki-modem.jpg', refs: [K], prompt: `${KEEP} ${KIKI} ABSURD funny scene: backstage she crouches over a beige 2000s dial-up modem and a tangle of phone cable, headphones on, expertly re-routing it, surrounded by unimpressed roadies. Neon light, cables everywhere.` },
  { out: 'kiki-autograph.jpg', refs: [K], prompt: `${KEEP} ${KIKI} FUNNY scene: she signs an autograph directly onto a delighted fan's FOREHEAD with a marker while a queue of others waits, leaning in. Club foyer, lasers, flash photography.` },
  { out: 'kiki-booth.jpg', refs: [K], prompt: `${KEEP} ${KIKI} EPIC funny scene: she stands ON TOP of the DJ booth conducting the entire crowd like an orchestra, both arms raised, hair flying, thousands of hands mirroring her. Lasers, fog, confetti.` },
  { out: 'kiki-mirror.jpg', refs: [K], prompt: `${KEEP} ${KIKI} QUIET funny scene: alone in a cramped backstage toilet, she reapplies frosted lip gloss in a cracked mirror lit by one bare bulb, while a stray green laser beam from the club cuts across her face through the doorway.` },
  { out: 'kiki-asleep.jpg', refs: [K], prompt: `${KEEP} ${KIKI} FUNNY scene: fast asleep sitting bolt upright on a stack of flight cases in her silver outfit and platform boots, still holding a microphone, as the load-out chaos continues around her. 5am, house lights, empty club.` },

  // ---------------- DIETER ----------------
  { out: 'dieter-complaint.jpg', refs: [D], prompt: `${KEEP} ${DIETER} DEADPAN funny scene: in a cramped Munich flat he proudly hangs yet another FRAMED noise complaint on a wall already covered in dozens of identical framed letters, standing back to admire it, hammer in hand.` },
  { out: 'dieter-synth.jpg', refs: [D], prompt: `${KEEP} ${DIETER} HILARIOUS scene: he cradles a large vintage synthesizer in both arms like a newborn baby, gazing down at it adoringly, rocking it gently. Backstage, neon light, roadies staring.` },
  { out: 'dieter-zip.jpg', refs: [D], prompt: `${KEEP} ${DIETER} FUNNY scene: he is hopelessly stuck halfway out of his own leather jacket, arms tangled above his head, sunglasses askew, struggling — while nobody helps. Dressing room, one bare bulb.` },
  { out: 'dieter-interview.jpg', refs: [D], prompt: `${KEEP} ${DIETER} FUNNY scene: he leans intensely toward a dictaphone giving an extremely passionate interview, gesturing wildly, while the journalist opposite has visibly fallen asleep with a notepad in their lap. Club back room.` },
  { out: 'dieter-amp.jpg', refs: [D], prompt: `${KEEP} ${DIETER} HILARIOUS scene: red-faced and straining with both arms, he attempts to lift a huge amplifier off the floor and is clearly not moving it a millimetre. Load-in, empty venue, harsh work lights.` },
  { out: 'dieter-sunbed.jpg', refs: [D], prompt: `${KEEP} ${DIETER} ABSURD funny scene: lying in a glowing tanning bed with the lid up, still wearing his wraparound sunglasses and gold chain, arms folded, utterly serene. Cheap salon, purple UV glow.` },
  { out: 'dieter-iron.jpg', refs: [D], prompt: `${KEEP} ${DIETER} DEADPAN funny scene: shirtless in his leather jacket, he meticulously irons a purple velvet tracksuit bottom on a wobbly ironing board backstage, steam rising, total concentration.` },
  { out: 'dieter-whiteboard.jpg', refs: [D], prompt: `${KEEP} ${DIETER} FUNNY scene: he passionately presents a whiteboard covered in arrows, diagrams of steam and crude drawings of a sauna to a completely EMPTY room of folding chairs. Club back room, one laser through the door.` },

  // ---------------- THE CREW ----------------
  { out: 'crew-lift.jpg', refs: [C], prompt: `${KEEP} ${CREW} FUNNY scene: the three of them perform a fully synchronised dance routine inside a cramped, mirrored service lift, caught mid-move by the opening doors. Fluorescent light, one confused security guard outside.` },
  { out: 'crew-boot.jpg', refs: [C], prompt: `${KEEP} ${CREW} DEADPAN funny scene: kneeling on a kerb outside a club at dawn, all three repair a broken platform boot with an enormous roll of gaffer tape, deeply focused, coffee cups beside them.` },
  { out: 'crew-hairdryer.jpg', refs: [C], prompt: `${KEEP} ${CREW} HILARIOUS scene: all three crowd around ONE hairdryer in a tiny backstage toilet, taking turns, hair flying everywhere, laughing. Mirror bulbs, condensation on the mirror.` },
  { out: 'crew-photobooth.jpg', refs: [C], prompt: `${KEEP} ${CREW} FUNNY scene: all three crammed into a single cramped photo booth together, limbs everywhere, pulling faces as the flash goes off. Club foyer, neon.` },
  { out: 'crew-door.jpg', refs: [C], prompt: `${KEEP} ${CREW} FUNNY scene: the three of them form a determined human wall across a backstage doorway with arms folded, blocking it completely, expressions serious — self-appointed security. Corridor, magenta light.` },
  { out: 'crew-chips.jpg', refs: [C], prompt: `${KEEP} ${CREW} DEADPAN funny scene: 6am outside a late-night food van, all three eating chips out of paper, exhausted and content, glitter still on their faces, dawn light. One traffic cone.` },
  { out: 'crew-trolleys.jpg', refs: [C], prompt: `${KEEP} ${CREW} ABSURD funny scene: all three ride luggage trolleys down an empty airport terminal, luggage piled high, laughing. Fluorescent light, polished floor.` },
  { out: 'crew-pile.jpg', refs: [C], prompt: `${KEEP} ${CREW} FUNNY scene: all three fast asleep leaning on each other across the back seat of a tour bus under a shared blanket, one boot off on the floor, neon strip light, condensation on the windows.` },

  // ---- Round two. Five more each, added when the five unused Jussi frames were finally placed:
  // he went to thirteen, so everyone goes to thirteen. The section is balanced by construction and
  // the moment one member gains frames the others have to gain the same number or it tilts again.
  // ---------------- KIKI ----------------
  { out: 'kiki-vending.jpg', refs: [K], prompt: `${KEEP} ${KIKI} FUNNY scene: backstage, her whole arm is thrust up inside a vending machine's flap trying to free a stuck snack, one platform boot braced against the glass for leverage, face set with total determination, while two roadies watch without offering to help. Corridor, strip light.` },
  { out: 'kiki-suitcase.jpg', refs: [K], prompt: `${KEEP} ${KIKI} FUNNY scene: in a cheap hotel corridor she sits on top of a wildly overstuffed suitcase, bouncing, trying to force the zip round the corner, silver sequinned clothing bursting out of every gap. Patterned carpet, one flickering wall light.` },
  { out: 'kiki-tvshow.jpg', refs: [K], prompt: `${KEEP} ${KIKI} DEADPAN funny scene: on the set of a cheap regional TV show with a painted sunset backdrop and plastic palm trees, she mimes passionately into an obviously unplugged microphone, utterly committed, while the bored floor crew look at their watches. Flat TV lighting.` },
  // Was a step-ladder scene; refused eight times running on the low camera angle alone. Rewritten
  // at eye level with a coat over the stage outfit, which is what the filter was actually objecting
  // to. The joke survived the move; the ladder was never the funny part.
  { out: 'kiki-payphone.jpg', refs: [K], prompt: `${KEEP} ${KIKI} DEADPAN funny scene: 5am in a glass street payphone box, a big oversized tour coat pulled on over her stage clothes, she feeds a growing stack of coins into the slot one after another while arguing patiently with the record label. Wet pavement, orange street light, empty street. Camera at eye level.` },
  { out: 'kiki-icebath.jpg', refs: [K], prompt: `${KEEP} ${KIKI} DEADPAN funny scene: sitting fully dressed in a backstage bathtub filled to the brim with ice and cans, boots hooked over the rim, taking a phone call on a chunky 2000s mobile with complete composure. Tiled room, one bare bulb, laser haze through the door.` },

  // ---------------- DIETER ----------------
  { out: 'dieter-fax.jpg', refs: [D], prompt: `${KEEP} ${DIETER} DEADPAN funny scene: he stands over a fax machine at 4am feeding in an ENORMOUS scroll of paper that has already pooled across the floor around his feet, watching it go with immense satisfaction. Cramped back office, one desk lamp.` },
  { out: 'dieter-poster.jpg', refs: [D], prompt: `${KEEP} ${DIETER} FUNNY scene: at night on a wet city street he pastes his own gig poster directly over somebody else's, brush and glue bucket in hand, glancing over his shoulder mid-crime. Street light, puddles, neon reflections.` },
  { out: 'dieter-mirror.jpg', refs: [D], prompt: `${KEEP} ${DIETER} HILARIOUS scene: alone in a dressing room he practises his intense DJ face in the mirror, one finger raised in the air mid-cue, rehearsing it seriously — caught by the camera. Bulb-lit mirror, cluttered counter.` },
  { out: 'dieter-catering.jpg', refs: [D], prompt: `${KEEP} ${DIETER} DEADPAN funny scene: clipboard in hand, he inspects a modest backstage catering table with the gravity of a health inspector, lifting one corner of clingfilm to peer underneath, deeply unimpressed. Strip light, folding tables.` },
  { out: 'dieter-scooter.jpg', refs: [D], prompt: `${KEEP} ${DIETER} ABSURD funny scene: he rides a tiny child's push scooter across a vast empty venue floor, a heavy record box balanced under one arm, leather jacket flying, expression completely serious. House lights, empty barriers.` },

  // ---------------- THE CREW ----------------
  { out: 'crew-setlist.jpg', refs: [C], prompt: `${KEEP} ${CREW} FUNNY scene: all three stand at a backstage wall rewriting the setlist directly onto the paintwork in thick marker, arguing over the running order, one of them holding the marker out of another's reach. Corridor, magenta light.` },
  { out: 'crew-laundry.jpg', refs: [C], prompt: `${KEEP} ${CREW} DEADPAN funny scene: 4am in a fluorescent-lit laundromat, all three slumped on plastic chairs in oversized tour jackets watching a machine full of silver sequinned stage clothes go round. Empty street outside the window.` },
  { out: 'crew-map.jpg', refs: [C], prompt: `${KEEP} ${CREW} FUNNY scene: on a dark roadside all three lean over an enormous paper road map spread across the bonnet of a van, each pointing in a completely different direction, headlights lighting them from below.` },
  { out: 'crew-nails.jpg', refs: [C], prompt: `${KEEP} ${CREW} FUNNY scene: perched on flight cases backstage, all three paint each other's nails in a chain — each doing the hands of the next — total concentration, tiny bottles balanced on the cases. Bare bulb, cables.` },
  { out: 'crew-jumpstart.jpg', refs: [C], prompt: `${KEEP} ${CREW} DEADPAN funny scene: at dawn in a car park all three jump-start the tour van, one holding the jump leads, one under the bonnet, one behind the wheel giving a thumbs up through the windscreen. Cold flat morning light, breath visible.` },
]

const OUT_DIR = 'public/assets/backstage'
mkdirSync(resolve(ROOT, OUT_DIR), { recursive: true })

const asPart = (p) => ({
  inline_data: { mime_type: 'image/jpeg', data: readFileSync(resolve(ROOT, p)).toString('base64') },
})

async function generate(job) {
  const body = {
    contents: [{ role: 'user', parts: [...job.refs.map(asPart), { text: `${job.prompt} ${STYLE} ${NEG}` }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' } },
  }
  const res = await fetch(`${BASE}/models/${MODEL}:generateContent?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = await res.json()
  const parts = j?.candidates?.[0]?.content?.parts ?? []
  const b64 = parts.find((p) => p.inlineData?.data || p.inline_data?.data)?.inlineData?.data
    ?? parts.find((p) => p.inline_data?.data)?.inline_data?.data
  if (!b64) throw new Error('no image: ' + JSON.stringify(j).slice(0, 200))
  writeFileSync(resolve(ROOT, OUT_DIR, job.out), Buffer.from(b64, 'base64'))
}

const only = process.argv[2]
const jobs = (only ? JOBS.filter((j) => j.out.includes(only)) : JOBS)
  .filter((j) => process.env.FORCE === '1' || !existsSync(resolve(ROOT, OUT_DIR, j.out)))
console.log(`[backstage] model=${MODEL} · ${jobs.length} image(s) to make`)

// Google's IMAGE_SAFETY filter refuses a good share of these on wardrobe grounds alone, and it is
// not deterministic — the same request that gets refused comes back fine on a later attempt. One
// try per job used to leave holes in the sheet that looked like bad prompts rather than bad luck.
const TRIES = Number(process.env.TRIES || 4)
let ok = 0, fail = 0
for (const job of jobs) {
  process.stdout.write(`  • ${job.out} ... `)
  // NOT existsSync — under FORCE=1 the previous render is still on disk, so checking the file
  // would report a stale image as a fresh success and quietly bury a total failure.
  let last, wrote = false
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    try { await generate(job); wrote = true; break }
    catch (e) { last = e; process.stdout.write(`retry${attempt} `) }
  }
  if (wrote) { ok++; console.log('OK') }
  else { fail++; console.log('FAIL — ' + String(last?.message ?? '').split('\n')[0].slice(0, 120)) }
}
console.log(`[backstage] ${ok} ok, ${fail} failed`)
if (fail && !ok) process.exit(1)
