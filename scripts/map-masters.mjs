#!/usr/bin/env node
// Map each 1080p master (hex-id filename) to its deployed 720p scene by matching a downscaled
// grayscale frame (they're the same video). Renames masters -> <scene>.1080p.mp4 and updates the
// manifest. The leftover master (no good match) is the rejected old club-floor.
//   node scripts/map-masters.mjs
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, renameSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const W = 32, H = 18
const TMP = '/tmp/mmap'
execSync(`mkdir -p ${TMP}`)

// grayscale WxH frame at t=1s as raw bytes (skip black intro frames)
function sig(file, tag) {
  const out = `${TMP}/${tag}.raw`
  execSync(`ffmpeg -y -loglevel error -ss 1 -i "${file}" -vframes 1 -vf scale=${W}:${H} -f rawvideo -pix_fmt gray "${out}"`)
  return readFileSync(out)
}
function sad(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s }

// deployed 720p scenes (exclude the raw + already-mapped)
const deployed = readdirSync(resolve(ROOT, 'public/assets/video'))
  .filter((f) => f.endsWith('.mp4') && !f.endsWith('.raw.mp4'))
  .map((f) => ({ name: f.replace('.mp4', ''), sig: sig(resolve(ROOT, 'public/assets/video', f), 'd_' + f) }))

const masters = readdirSync(resolve(ROOT, 'video-masters'))
  .filter((f) => f.endsWith('.mp4'))
  .map((f) => ({ id: f.replace('.mp4', ''), sig: sig(resolve(ROOT, 'video-masters', f), 'm_' + f) }))

// for each deployed scene, pick the closest master
const used = new Set()
const map = []
for (const d of deployed) {
  let best = null, bestScore = Infinity
  for (const m of masters) {
    if (used.has(m.id)) continue
    const sc = sad(d.sig, m.sig)
    if (sc < bestScore) { bestScore = sc; best = m }
  }
  if (best) { used.add(best.id); map.push({ scene: d.name, id: best.id, score: bestScore }) }
}
const leftover = masters.filter((m) => !used.has(m.id)).map((m) => m.id)

// rename masters -> <scene>.1080p.mp4
for (const { scene, id } of map) {
  const from = resolve(ROOT, 'video-masters', `${id}.mp4`)
  const to = resolve(ROOT, 'video-masters', `${scene}.1080p.mp4`)
  if (existsSync(from)) renameSync(from, to)
}
console.log('SCENE -> master id (frame-diff score, lower = surer):')
for (const { scene, id, score } of map) console.log(`  ${scene.padEnd(16)} <- ${id}  (${score})`)
console.log('leftover (rejected/unused):', leftover.join(', ') || '(none)')

// refresh manifest with the mapping
const mani = JSON.parse(readFileSync(resolve(ROOT, 'video-masters/manifest.json'), 'utf8'))
for (const e of mani) {
  const hit = map.find((x) => x.id === e.id)
  e.scene = hit ? hit.scene : (leftover.includes(e.id) ? 'REJECTED/unused' : e.scene)
  if (hit) e.file = `video-masters/${hit.scene}.1080p.mp4`
}
writeFileSync(resolve(ROOT, 'video-masters/manifest.json'), JSON.stringify(mani, null, 2))
