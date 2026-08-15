#!/usr/bin/env node
// Turns freshly generated clips into shippable site assets.
//
// gen-atlascloud-videos.mjs records the REMOTE AtlasCloud output URL in mp4Url. The site, though,
// plays local paths (/assets/video/<id>.mp4) so the videos are served from Pages and keep working
// when the remote URL expires. This script closes that gap:
//
//   remote mp4Url -> download master -> ffmpeg to 720p, SILENT -> public/assets/video/<id>.mp4
//   -> rewrite mp4Url to the local path
//
// Audio is stripped on purpose (-an): every video on the site is muted, the player's MP3 is the
// only sound. Dropping the track is both smaller and one less way for a stray audio channel to
// escape. Idempotent — clips already pointing at /assets/ are skipped, so it is safe to re-run.
//   node scripts/localize-videos.mjs

import { writeFileSync, readFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const RESULTS = resolve(ROOT, 'src/data/atlascloud.results.json')
const VIDEO_DIR = resolve(ROOT, 'public/assets/video')
const TMP = resolve(ROOT, '.video-tmp')

if (!existsSync(RESULTS)) {
  console.error('[localize] no atlascloud.results.json — nothing to do')
  process.exit(0)
}
const data = JSON.parse(readFileSync(RESULTS, 'utf8'))
const clips = data.clips ?? []

const pending = clips.filter(
  (c) => c.status === 'ready' && typeof c.mp4Url === 'string' && /^https?:\/\//i.test(c.mp4Url),
)
if (!pending.length) {
  console.log('[localize] every ready clip is already local — nothing to do')
  process.exit(0)
}

mkdirSync(VIDEO_DIR, { recursive: true })
mkdirSync(TMP, { recursive: true })
console.log(`[localize] ${pending.length} clip(s) to bring local`)

let changed = 0
for (const clip of pending) {
  const master = resolve(TMP, `${clip.id}.master.mp4`)
  const out = resolve(VIDEO_DIR, `${clip.id}.mp4`)
  try {
    process.stdout.write(`  • ${clip.id} ... downloading `)
    const res = await fetch(clip.mp4Url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    writeFileSync(master, Buffer.from(await res.arrayBuffer()))

    process.stdout.write('· encoding ')
    // 720p, silent, faststart so it begins playing before the whole file arrives.
    execFileSync(
      'ffmpeg',
      ['-y', '-i', master, '-an', '-vf', 'scale=-2:720', '-c:v', 'libx264',
       '-crf', '28', '-preset', 'medium', '-movflags', '+faststart', out],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    )

    clip.mp4Url = `/assets/video/${clip.id}.mp4`
    changed++
    console.log(`OK (${(statSync(out).size / 1e6).toFixed(1)} MB)`)
  } catch (e) {
    // Leave the remote URL in place rather than half-writing a broken local reference.
    console.log(`FAIL — ${e.message.split('\n')[0]}`)
  }
}

if (changed) {
  writeFileSync(RESULTS, JSON.stringify(data, null, 2) + '\n')
  console.log(`[localize] rewrote ${changed} clip(s) to local paths`)
} else {
  console.log('[localize] nothing localized; results.json untouched')
}
