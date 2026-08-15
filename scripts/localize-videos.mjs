#!/usr/bin/env node
// Turns generated clips into the TWO renditions the site actually ships.
//
// The player picks a rendition by display width (src/lib/videoRendition.ts):
//   /assets/video/x.mp4      1280x720  — the default
//   /assets/video/hd/x.mp4   1920x1080 — big displays only
// videoSrc() swaps the prefix with NO 404 fallback, so a clip that ships only 720p is a broken
// video on any screen wide enough to ask for HD. Both renditions are therefore mandatory.
//
// This script covers the first half of that pipeline:
//   remote output -> video-masters/<id>.1080p.mp4   (the master; gitignored, re-downloadable)
//                 -> public/assets/video/<id>.mp4   (720p, silent)
//                 -> manifest entry so the master can be re-fetched by prediction id
// scripts/build-video-renditions.mjs then builds the HD twin from the master.
//
// Re-downloading a finished output by prediction id costs NO credits, so a clip whose master was
// never kept (or was discarded by an earlier version of this script) is repaired for free.
//
// Audio is stripped (-an): every video on the site is muted, the player's MP3 is the only sound.
// Idempotent, so it is safe to re-run.  node scripts/localize-videos.mjs

import { writeFileSync, readFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const RESULTS = resolve(ROOT, 'src/data/atlascloud.results.json')
const VIDEO_DIR = resolve(ROOT, 'public/assets/video')
const MASTERS_DIR = resolve(ROOT, 'video-masters')
const MANIFEST = resolve(ROOT, 'scripts/video-masters.manifest.json')
const API = 'https://api.atlascloud.ai/api/v1'
const KEY = process.env.atlascloudapikey

if (!existsSync(RESULTS)) {
  console.error('[localize] no atlascloud.results.json — nothing to do')
  process.exit(0)
}
const data = JSON.parse(readFileSync(RESULTS, 'utf8'))
const clips = data.clips ?? []

try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
} catch {
  console.error('[localize] ffmpeg not found on PATH — install it first (apt-get install -y ffmpeg)')
  process.exit(1)
}

const isRemote = (u) => typeof u === 'string' && /^https?:\/\//i.test(u)

// Anything that still points at a remote URL, OR is already local but has no master kept — the
// latter is the repair path for clips an earlier version of this script downgraded to 720p-only.
const todo = clips.filter((c) => {
  if (c.status !== 'ready') return false
  if (isRemote(c.mp4Url)) return true
  return !!c.predictionId && !existsSync(resolve(MASTERS_DIR, `${c.id}.1080p.mp4`))
})

if (!todo.length) {
  console.log('[localize] every ready clip already has a local 720p and a master — nothing to do')
  process.exit(0)
}

mkdirSync(VIDEO_DIR, { recursive: true })
mkdirSync(MASTERS_DIR, { recursive: true })
console.log(`[localize] ${todo.length} clip(s) to process`)

// Ask AtlasCloud where a finished render lives. Free: it is a lookup, not a re-render.
async function outputUrlFor(predictionId) {
  if (!KEY) throw new Error('atlascloudapikey not set — cannot look up the master')
  const res = await fetch(`${API}/model/prediction/${predictionId}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} looking up ${predictionId}`)
  const r = await res.json()
  const url = r.outputs?.[0] ?? r.data?.outputs?.[0]
  if (!url) throw new Error(`no output on prediction ${predictionId}`)
  return url
}

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {}
let changed = 0
let manifestChanged = false

for (const clip of todo) {
  const master = resolve(MASTERS_DIR, `${clip.id}.1080p.mp4`)
  const sd = resolve(VIDEO_DIR, `${clip.id}.mp4`)
  try {
    const sourceUrl = isRemote(clip.mp4Url) ? clip.mp4Url : await outputUrlFor(clip.predictionId)

    if (!existsSync(master)) {
      process.stdout.write(`  • ${clip.id} ... master `)
      const res = await fetch(sourceUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status} downloading master`)
      writeFileSync(master, Buffer.from(await res.arrayBuffer()))
      process.stdout.write(`(${(statSync(master).size / 1e6).toFixed(1)} MB) `)
    } else {
      process.stdout.write(`  • ${clip.id} ... master cached `)
    }

    if (!existsSync(sd)) {
      process.stdout.write('· 720p ')
      execFileSync('ffmpeg',
        ['-y', '-loglevel', 'error', '-i', master, '-an', '-vf', 'scale=-2:720',
         '-c:v', 'libx264', '-crf', '28', '-preset', 'medium', '-movflags', '+faststart', sd],
        { stdio: ['ignore', 'ignore', 'pipe'] })
      process.stdout.write(`(${(statSync(sd).size / 1e6).toFixed(1)} MB) `)
    } else {
      process.stdout.write('· 720p exists ')
    }

    // Record the master so it can be re-fetched later without a re-render. The manifest is
    // keyed by index in the existing file, so append rather than reshape it.
    const already = Object.values(manifest).some((m) => m?.scene === clip.id)
    if (!already && clip.predictionId) {
      manifest[String(Object.keys(manifest).length)] = {
        id: clip.predictionId,
        createdAt: new Date().toISOString(),
        file: `video-masters/${clip.id}.1080p.mp4`,
        sourceUrl,
        promptSnippet: '',
        scene: clip.id,
      }
      manifestChanged = true
    }

    clip.mp4Url = `/assets/video/${clip.id}.mp4`
    changed++
    console.log('OK')
  } catch (e) {
    console.log(`FAIL — ${e.message.split('\n')[0]}`)
  }
}

if (changed) {
  writeFileSync(RESULTS, JSON.stringify(data, null, 2) + '\n')
  console.log(`[localize] ${changed} clip(s) localized`)
}
if (manifestChanged) {
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
  console.log('[localize] recorded new master(s) in scripts/video-masters.manifest.json')
}
console.log('[localize] next: node scripts/build-video-renditions.mjs (builds the HD twins)')
