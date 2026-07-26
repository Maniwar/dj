// Generate mp3/README.md — the distribution sheet for DistroKid.
//
// Generated rather than hand-written on purpose: the track list, the version labels and the
// lyrics all already exist as data, and a hand-maintained copy would be wrong the first time
// anything is re-pressed. Re-run after changing tracks.json or lyrics.json:
//
//   node scripts/build-mp3-readme.mjs
//
// What DistroKid actually asks for per track is the title, the artist, songwriter credit, an
// explicit flag and the lyrics — so those are what this puts in front of you, with the exact
// filename beside each so the right audio gets attached to the right entry.

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'

const tracks = JSON.parse(readFileSync('src/data/tracks.json', 'utf8')).tracks
const lyrics = JSON.parse(readFileSync('src/data/lyrics.json', 'utf8'))

const ARTIST = 'SYSTEM OVERLOAD'
const ALBUM = 'Club Humidity — The Moist Mix 2002'

// Production notes sit in the lyric sheets as whole lines in brackets — "(heavy four-on-the-floor
// beat)" and the like. They are direction, not words anyone sings, so they have no place on a
// lyrics submission.
const NOTE = /^[([].*[)\]]\.?$/
// Speaker tags lead a line: "[Male] Put it on my tab". Useful in the app, noise on a lyric sheet.
const TAG = /^\s*\[[^\]]+\]\s*/

const clean = (text) => text.replace(TAG, '').trim()
const isSung = (l) => l.type === 'line' && !!clean(l.text) && !NOTE.test(clean(l.text))

const fileSize = (name) => {
  const p = path.join('mp3', name)
  if (!existsSync(p)) return null
  return (statSync(p).size / 1048576).toFixed(1) + ' MB'
}

let out = ''
out += `# ${ALBUM}\n\n`
out += `**Artist:** ${ARTIST}  \n`
out += `**Album:** ${ALBUM}  \n`
out += `**Tracks:** ${tracks.length} songs · ${tracks.reduce((n, t) => n + t.versions.length, 0)} audio files\n\n`

out += `> Distribution sheet for DistroKid. Generated from the app's own track and lyric data by\n`
out += `> \`scripts/build-mp3-readme.mjs\` — re-run it after changing \`src/data/tracks.json\` or\n`
out += `> \`src/data/lyrics.json\` rather than editing this file, or the two will drift apart.\n\n`

out += `## Before you upload\n\n`
out += `- **Artist name:** \`${ARTIST}\` — must match exactly across every track or DistroKid\n`
out += `  will create separate artist pages.\n`
out += `- **Songwriter credit:** DistroKid requires a real legal name per track, not the stage name.\n`
out += `- **Explicit:** flag per track — several of these carry innuendo rather than profanity, but\n`
out += `  that is a judgement call you should make deliberately rather than leave at the default.\n`
out += `- **Parody/fiction:** SYSTEM OVERLOAD, DJ Dieter and Kiki G are fictional. If any cover art\n`
out += `  or title reads as referencing a real act, expect a review hold.\n`
out += `- **Alternate versions:** where a track has more than one pressing they are listed together\n`
out += `  below. Uploading them as separate tracks on one release is usually what you want; do not\n`
out += `  upload the same recording twice under different titles.\n\n`

out += `## Track list\n\n`
out += `| # | Title | Version | File | Size |\n|---|---|---|---|---|\n`
let n = 0
for (const t of tracks) {
  for (const v of t.versions) {
    n++
    out += `| ${n} | ${t.title} | ${v.label} | \`${v.file}\` | ${fileSize(v.file) ?? '—'} |\n`
  }
}
out += `\n---\n\n# Lyrics\n\n`

for (const t of tracks) {
  const sheet = lyrics[t.slug]
  out += `## ${t.title}\n\n`
  out += `**Artist:** ${ARTIST}`
  if (sheet?.bpm) out += ` · **BPM:** ${sheet.bpm}`
  out += `\n\n`
  out += `**Files:**\n`
  for (const v of t.versions) out += `- \`${v.file}\` — ${v.label}\n`
  out += `\n`

  if (!sheet) {
    out += `_No lyric sheet on file._\n\n---\n\n`
    continue
  }

  out += '```\n'
  for (const line of sheet.lines) {
    if (line.type === 'section') {
      out += `\n[${String(line.text).toUpperCase()}]\n`
    } else if (isSung(line)) {
      out += `${clean(line.text)}\n`
    }
  }
  out += '```\n\n---\n\n'
}

writeFileSync('mp3/README.md', out)
const sung = tracks.filter((t) => lyrics[t.slug]).length
console.log(
  `[readme] mp3/README.md — ${tracks.length} songs, ${n} files, ${sung} with lyric sheets`,
)
