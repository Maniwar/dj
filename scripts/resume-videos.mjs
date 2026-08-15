#!/usr/bin/env node
// Collects renders that were SUBMITTED but never collected — the job kept running on AtlasCloud
// after our poll gave up. Downloading a finished output by prediction id costs NO credits, so
// this recovers abandoned work instead of paying to render it again.
//
// Picks up any clip that is not ready and has a prediction id, either structured
// (clip.predictionId) or embedded in an older error string ("job <id> timed out").
//
//   node scripts/resume-videos.mjs            # every unfinished clip
//   node scripts/resume-videos.mjs lore-jussi # just matching ids
//
// Requires atlascloudapikey. Run scripts/localize-videos.mjs afterwards to bring the mp4s local.

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = process.env.atlascloudapikey
if (!KEY) { console.error('[resume] missing env var atlascloudapikey'); process.exit(1) }

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const API = 'https://api.atlascloud.ai/api/v1'
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const RESULTS = resolve(ROOT, 'src/data/atlascloud.results.json')

if (!existsSync(RESULTS)) { console.error('[resume] no results.json'); process.exit(1) }
const data = JSON.parse(readFileSync(RESULTS, 'utf8'))

const idFrom = (clip) =>
  clip.predictionId || (String(clip.error || '').match(/job\s+([a-f0-9]{16,})/i) || [])[1] || null

const only = process.argv[2]
const terms = only ? only.split(',').map((s) => s.trim()).filter(Boolean) : []
const pending = (data.clips ?? []).filter(
  (c) => c.status !== 'ready' && idFrom(c) && (!terms.length || terms.some((t) => c.id.includes(t))),
)

if (!pending.length) {
  console.log('[resume] nothing to collect — no unfinished clip has a prediction id')
  process.exit(0)
}
console.log(`[resume] ${pending.length} clip(s) to collect`)

const TRIES = Number(process.env.POLL_TRIES || 240)
const DELAY = Number(process.env.POLL_DELAY_MS || 10000)
let recovered = 0

for (const clip of pending) {
  const id = idFrom(clip)
  process.stdout.write(`  • ${clip.id} (prediction ${id}) ... `)
  try {
    let mp4 = null
    for (let i = 0; i < TRIES; i++) {
      const res = await fetch(`${API}/model/prediction/${id}`, { headers: H })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
      const r = await res.json()
      const s = String(r.status || r.data?.status || '').toLowerCase()
      if (s === 'completed' || s === 'succeeded') {
        mp4 = r.outputs?.[0] ?? r.data?.outputs?.[0]
        break
      }
      if (s === 'failed' || s === 'error') throw new Error(`render failed: ${JSON.stringify(r).slice(0, 200)}`)
      await new Promise((r2) => setTimeout(r2, DELAY))
    }
    if (!mp4) throw new Error('still not finished')
    clip.status = 'ready'
    clip.mp4Url = mp4
    clip.predictionId = id
    delete clip.error
    recovered++
    console.log('COLLECTED')
  } catch (e) {
    clip.predictionId = id // keep it so a later run can try again
    console.log(`not yet — ${e.message.split('\n')[0]}`)
  }
}

writeFileSync(RESULTS, JSON.stringify(data, null, 2) + '\n')
console.log(`[resume] ${recovered}/${pending.length} collected`)
