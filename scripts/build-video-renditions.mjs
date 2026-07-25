// Build the 1080p rendition of every deployed clip, from the local 1080p masters.
//
// WHY two renditions: the clips are shown with `object-fit: cover`, which scales them to the
// WIDTH of the viewport. A 1280-wide source is therefore blown up 2.7x on a 21:9 panel, 4x on
// 32:9 and 6x on a 7K ultrawide — visibly soft. Shipping 1080p to everyone would double the
// bytes for the ~90% of visitors on a laptop or phone who cannot resolve the difference, so
// instead both renditions ship and the client picks one by display width (src/lib/videoRendition.ts).
//
// The masters (video-masters/, gitignored, ~19 Mbps) are far too heavy to serve directly — this
// re-encodes them to a delivery bitrate that matches the quality bar of the existing 720p set.
//
//   node scripts/build-video-renditions.mjs
//
// Requires ffmpeg on PATH. Idempotent: skips anything already built and newer than its master.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const MASTERS = 'video-masters'
const SD_DIR = path.join('public', 'assets', 'video')
const HD_DIR = path.join(SD_DIR, 'hd')

// Constant-quality alone does NOT work here. At CRF 24 this footage — film grain, confetti,
// laser haze, every frame full of fine moving detail — came out at 6.4-10.8 Mbps, i.e. 3-4.5x
// the 720p set rather than the ~2x that 2.25x the pixels should cost. So CRF is paired with a
// hard rate cap: quality-driven where the content is easy, bounded where it isn't. ~5 Mbps is
// the target, which is the honest 1080p equivalent of the 720p set's 2.36.
const ARGS = (input, output) => [
  '-y', '-loglevel', 'error',
  '-i', input,
  '-an', // every clip is played muted; the audio track is dead weight
  '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-crf', '26', '-preset', 'slow',
  '-maxrate', '5.5M', '-bufsize', '11M',
  '-vf', 'scale=1920:-2',
  '-movflags', '+faststart', // moov atom first, so playback can start before the full download
  output,
]

if (!existsSync(MASTERS)) {
  console.error(`[renditions] no ${MASTERS}/ — run scripts/fetch-video-masters.mjs first`)
  process.exit(1)
}
mkdirSync(HD_DIR, { recursive: true })

const masters = readdirSync(MASTERS).filter((f) => f.endsWith('.1080p.mp4') && !f.startsWith('_'))
let built = 0
let skipped = 0

for (const file of masters) {
  const name = path.basename(file, '.1080p.mp4')
  const master = path.join(MASTERS, file)
  const out = path.join(HD_DIR, `${name}.mp4`)

  // only clips that are actually deployed — the masters folder also holds rejects and spares
  if (!existsSync(path.join(SD_DIR, `${name}.mp4`))) {
    console.log(`[renditions] skip ${name} (no deployed 720p twin)`)
    continue
  }
  if (existsSync(out) && statSync(out).mtimeMs >= statSync(master).mtimeMs) {
    skipped++
    continue
  }

  process.stdout.write(`[renditions] ${name} ... `)
  execFileSync('ffmpeg', ARGS(master, out), { stdio: ['ignore', 'ignore', 'inherit'] })
  const mb = (statSync(out).size / 1048576).toFixed(1)
  console.log(`${mb} MB`)
  built++
}

const total = readdirSync(HD_DIR)
  .filter((f) => f.endsWith('.mp4'))
  .reduce((t, f) => t + statSync(path.join(HD_DIR, f)).size, 0)
console.log(
  `[renditions] built ${built}, up-to-date ${skipped} — hd set is ${(total / 1048576).toFixed(1)} MB`,
)
