#!/usr/bin/env node
// Cuts the short audio excerpts the video generator conditions on.
//
// Seedance rejects anything longer than ~30s ("InvalidParameter.DurationTooLong: Duration must be
// between 1.8s and 30.2s"), and the album tracks run 2-4 minutes — so a clip cannot be fed the raw
// MP3. This writes a 10s excerpt per track into public/mp3-clips/, taken from ~30% into the song
// rather than the intro, so the generator hears the track at full energy instead of a cold open.
//
// Idempotent: existing excerpts are left alone. Requires ffmpeg (present on GitHub runners).
//   node scripts/make-audio-clips.mjs            # every track referenced by CLIPS
//   node scripts/make-audio-clips.mjs euro-trash # just the tracks whose slug matches

import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SRC_DIR = resolve(ROOT, 'mp3')
const OUT_DIR = resolve(ROOT, 'public/mp3-clips')
const SECONDS = Number(process.env.CLIP_SECONDS || 10)

const tracks = JSON.parse(readFileSync(resolve(ROOT, 'src/data/tracks.json'), 'utf8')).tracks

// Which tracks need an excerpt: every trackSlug referenced by the video CLIPS list.
const genSrc = readFileSync(resolve(ROOT, 'scripts/gen-atlascloud-videos.mjs'), 'utf8')
const slugs = [...new Set([...genSrc.matchAll(/trackSlug:\s*'([^']+)'/g)].map((m) => m[1]))]

const only = process.argv[2]
const wanted = only ? slugs.filter((s) => s.includes(only)) : slugs
mkdirSync(OUT_DIR, { recursive: true })

// Fail loudly and immediately if ffmpeg is absent. It is NOT preinstalled on ubuntu-24.04
// runners, and without this the loop below just logs ENOENT per track and exits 0 — a green
// step that produced nothing, which is what made the first two render runs fail downstream.
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
} catch {
  console.error('[clips] ffmpeg not found on PATH — install it first (apt-get install -y ffmpeg)')
  process.exit(1)
}

console.log(`[clips] ${wanted.length} track(s) to check · ${SECONDS}s each`)

function duration(file) {
  try {
    return Number(
      execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
                               '-of', 'default=noprint_wrappers=1:nokey=1', file]).toString().trim(),
    )
  } catch { return 0 }
}

let made = 0
let failed = 0
for (const slug of wanted) {
  const track = tracks.find((t) => t.slug === slug)
  if (!track) { console.log(`  ? ${slug} — no such track, skipping`); continue }
  const file = track.versions[0].file // the A-side
  const src = resolve(SRC_DIR, file)
  const out = resolve(OUT_DIR, file)
  if (!existsSync(src)) { console.log(`  ? ${file} — missing source, skipping`); continue }
  if (existsSync(out)) { console.log(`  = ${file} — already cut`); continue }

  // start ~30% in (capped at 45s) so we catch the body of the song, never a cold intro
  const dur = duration(src)
  const start = dur > SECONDS * 2 ? Math.min(45, Math.max(0, dur * 0.3)) : 0
  try {
    execFileSync('ffmpeg',
      ['-y', '-ss', String(start.toFixed(2)), '-t', String(SECONDS), '-i', src,
       '-c:a', 'libmp3lame', '-b:a', '192k', out],
      { stdio: ['ignore', 'ignore', 'pipe'] })
    made++
    console.log(`  + ${file} — ${SECONDS}s from ${start.toFixed(0)}s (${(statSync(out).size / 1024).toFixed(0)} KB)`)
  } catch (e) {
    failed++
    console.log(`  ✗ ${file} — ${String(e.stderr || e.message).split('\n').slice(-2)[0]}`)
  }
}
console.log(`[clips] ${made} new excerpt(s), ${failed} failed`)
// A silent no-op here surfaces much later as an opaque "no short audio excerpt" render error,
// so make the cut step itself the thing that goes red.
if (failed) process.exit(1)
