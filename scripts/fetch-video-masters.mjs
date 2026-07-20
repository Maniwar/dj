#!/usr/bin/env node
// Re-download the original 1080p Seedance masters from AtlasCloud by prediction ID (downloading an
// existing output costs NO credits). Also records each clip's prompt so we can map id -> scene.
// Writes video-masters/<id>.mp4 + video-masters/manifest.json. Skips the DO-NOT-USE id.
//   node --env-file=.env scripts/fetch-video-masters.mjs
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = process.env.atlascloudapikey
if (!KEY) { console.error('missing env var atlascloudapikey'); process.exit(1) }
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const API = 'https://api.atlascloud.ai/api/v1'
const H = { Authorization: `Bearer ${KEY}` }
const OUT = resolve(ROOT, 'video-masters')
mkdirSync(OUT, { recursive: true })

const SKIP = new Set(['6e1879a23575443793922515c33404ed']) // user: do not use
const IDS = [
  'ae1d210d439140478b72e41933b75cba', '2ad5e388df4c4c61bbe65df286bf37ac',
  'a1cd5348aa60403196fefbe5c837a45d', '93e684b9c5b94840821dd1e96fd67418',
  'ec48b085d7ef4430aaf2efd04cff8c02', 'b2eb8507c291407ea868556bdeff707f',
  '34025a659d974edeb29a04c63337e28e', 'a0c90277270644dca4e46e73f77d82c2',
  '499c734fbe984f9db93da2431bc05ca8', '46d8a12e74d548e0874c3194fda7c24b',
  '5348cbfe7edb4f5ea58da44062745b9c', '3b3e6fbf53f745f2aed1980aed552b6c',
  '0c93a4406d444e429622bd80f5b54f53', 'c902c345613f406f90bef0728fa7afac',
].filter((id) => !SKIP.has(id))

const manifest = []
for (const id of IDS) {
  try {
    const r = await fetch(`${API}/model/prediction/${id}`, { headers: H })
    const j = await r.json()
    const d = j.data || j
    const url = (d.outputs || [])[0]
    const prompt = (d.prompt || d.request?.prompt || '').slice(0, 160)
    const createdAt = d.created_at || ''
    if (!url) { console.log(`  ✗ ${id} — no output url`); manifest.push({ id, error: 'no output' }); continue }
    const dl = await fetch(url)
    if (!dl.ok) { console.log(`  ✗ ${id} — download HTTP ${dl.status} (output may be purged)`); manifest.push({ id, url, error: `dl ${dl.status}` }); continue }
    const file = `video-masters/${id}.mp4`
    writeFileSync(resolve(ROOT, file), Buffer.from(await dl.arrayBuffer()))
    console.log(`  ✓ ${id}  ${createdAt}  «${prompt.slice(0, 60)}…»`)
    manifest.push({ id, createdAt, file, sourceUrl: url, promptSnippet: prompt })
  } catch (e) {
    console.log(`  ✗ ${id} — ${e.message}`)
    manifest.push({ id, error: e.message })
  }
}
writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`\n[masters] ${manifest.filter((m) => m.file).length}/${IDS.length} downloaded -> video-masters/`)
