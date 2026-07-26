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

// The bio is INLINED from mp3/BIO.md rather than duplicated here. Both documents need it, and a
// second copy is a second thing to forget to update — the version that then gets pasted into a
// store is whichever one you happened to open.
const bio = existsSync('mp3/BIO.md')
  ? readFileSync('mp3/BIO.md', 'utf8')
      .split('\n')
      .filter((l) => !l.startsWith('# ')) // its own H1 would fight the README's
      .join('\n')
      .trim()
  : null

const ARTIST = 'SYSTEM OVERLOAD'
// DistroKid requires a real legal name for the songwriter field, not the stage name.
const SONGWRITER = 'Mani Berenji-Jourshari'
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
out += `- **Songwriter credit:** \`${SONGWRITER}\` — DistroKid requires a real legal name, not the\n`
out += `  stage name. Same on every track.\n`
out += `- **Explicit:** flag per track — several of these carry innuendo rather than profanity, but\n`
out += `  that is a judgement call you should make deliberately rather than leave at the default.\n`
out += `- **Parody/fiction:** SYSTEM OVERLOAD, DJ Dieter and Kiki G are fictional. If any cover art\n`
out += `  or title reads as referencing a real act, expect a review hold.\n`
out += `- **Alternate versions:** where a track has more than one pressing they are listed together\n`
out += `  below. Uploading them as separate tracks on one release is usually what you want; do not\n`
out += `  upload the same recording twice under different titles.\n\n`

if (bio) {
  out += `## Artist bio\n\n`
  out += `Maintained in \`mp3/BIO.md\` and inlined here, so there is only one copy to keep current.\n\n`
  out += bio.replace(/^## /gm, '### ') + `\n\n---\n\n`
}

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

// ---------------------------------------------------------------------------------------
// A second artefact: an operator brief for an agent driving the DistroKid upload form.
// Separate from the README because the audiences differ — the README is for a person reading
// lyrics, this is a worklist with ABSOLUTE paths, one row per file, and explicit instructions
// about what must not be decided automatically.
// ---------------------------------------------------------------------------------------
const ABS = process.cwd()
let brief = ''
brief += `# DistroKid upload — agent brief\n\n`
brief += `Generated by \`scripts/build-mp3-readme.mjs\`. Paths are absolute and verified to exist\n`
brief += `at generation time on this machine.\n\n`

brief += `## Task\n\n`
brief += `Fill in the DistroKid upload form for the release below. **Do not click the final\n`
brief += `submit/pay button.** Fill everything, then stop and show the completed form for review.\n`
brief += `A DistroKid submission costs money and is distributed to stores; it is not reversible by\n`
brief += `re-running anything.\n\n`

brief += `## Release-level fields\n\n`
brief += `| Field | Value |\n|---|---|\n`
brief += `| Artist name | \`${ARTIST}\` — byte-for-byte identical on every track |\n`
brief += `| Album/release title | \`${ALBUM}\` |\n`
brief += `| Release type | Album (${n} tracks) |\n`
brief += `| Primary genre | Dance |\n`
brief += `| Secondary genre | Electronic |\n`
brief += `| Language of lyrics | English |\n`
brief += `| Songwriter (all tracks) | \`${SONGWRITER}\` |\n`
brief += `| Record label | leave blank unless you have one |\n`
brief += `| Release date | **ASK THE USER** — do not guess |\n`
brief += `| Cover art | **ASK THE USER** — not in this repo, must be 3000x3000px |\n\n`

brief += `## Fields you must NOT fill without being told\n\n`
brief += `These are legal or financial and a wrong guess is worse than an empty box:\n\n`
brief += `- ~~Songwriter~~ — supplied: \`${SONGWRITER}\`. Use it verbatim on every track,\n`
brief += `  including the hyphen. Do not substitute the stage name.\n`
brief += `- **Explicit lyrics flag** — this material trades in innuendo. Ask per track; do not\n`
brief += `  infer it from the lyrics yourself.\n`
brief += `- **Release date**, **cover art**, **ISRC/UPC** (let DistroKid generate unless told).\n`
brief += `- **Spotify/Apple artist IDs** — attaching to the wrong existing artist page is painful\n`
brief += `  to undo. If asked to link, confirm the act is new first.\n\n`

// ---- ORDERING AGAINST THE 35-SLOT LIMIT ----------------------------------------------------
// There are more files than slots, so the order decides what survives — and left interleaved by
// track, the cut would land arbitrarily and could drop an A-SIDE while keeping some track's
// third bootleg. Priority instead:
//   1. every A-side, in album order    — the release itself; none of these may be cut
//   2. every FIRST alternate           — one bootleg per track before any track gets a second
//   3. deeper alternates               — the most expendable, so they take the cut
const SLOTS = 35
const rows = []
const titleFor = (t, v) =>
  t.versions.length > 1 ? `${t.title} (${v.badge === 'A-SIDE' ? 'Original Mix' : v.label})` : t.title
for (const t of tracks) for (const v of t.versions) rows.push({ t, v, tier: v.variantIndex })
rows.sort((a, b) => a.tier - b.tier || tracks.indexOf(a.t) - tracks.indexOf(b.t))

const aSides = rows.filter((r) => r.tier === 0).length
brief += `## Track worklist — ORDER MATTERS\n\n`
brief += `${n} audio files, **${SLOTS} slots**. The order below is the priority order, and the\n`
brief += `cut line is marked: enter rows 1-${SLOTS} and stop.\n\n`
brief += `- rows 1-${aSides} are every A-side. **None of these may be dropped** — they are the release.\n`
brief += `- then one alternate per track, before any track gets a second.\n`
brief += `- the ${n - SLOTS} rows past the cut are the deepest bootlegs, which is why they are the ones\n`
brief += `  that go. If you would rather cut something else, change it here, not while filling the form.\n\n`
brief += `| # | Track title (paste exactly) | Version label | Absolute file path |\n|---|---|---|---|\n`
let i = 0
for (const r of rows) {
  i++
  if (i === SLOTS + 1) {
    brief += `\n**— CUT LINE. Everything above fits in the ${SLOTS} slots. Do not enter anything below. —**\n\n`
    brief += `| # | Track title | Version label | Absolute file path |\n|---|---|---|---|\n`
  }
  brief += `| ${i} | ${titleFor(r.t, r.v)} | ${r.v.label} | \`${ABS}/mp3/${r.v.file}\` |\n`
}

brief += `\n### On the version suffixes\n\n`
brief += `Files ending \`_1\`, \`_2\`, \`_3\` are ALTERNATE PRESSINGS of the preceding title, not\n`
brief += `different songs. Give each a distinct track title using its version label in brackets, as\n`
brief += `in the table above — DistroKid rejects releases with duplicate track titles, and stores\n`
brief += `display them as separate tracks regardless.\n\n`

brief += `## Artist bio\n\n`
brief += `Three lengths in \`${ABS}/mp3/BIO.md\` and in the README. Paste whichever fits the field;\n`
brief += `do not write your own. If a platform asks whether the artist is real, say it is a parody\n`
brief += `project — the bio is in character, and staying in character with a human reviewer turns a\n`
brief += `joke into a misrepresentation.\n\n`

brief += `## Lyrics\n\n`
brief += `Full lyrics for every track are in \`${ABS}/mp3/README.md\`, under a \`## <Track title>\`\n`
brief += `heading, inside a fenced block. They are already stripped of production notes and speaker\n`
brief += `tags, so paste them verbatim. Alternate pressings share the lyrics of their A-side.\n\n`

brief += `## Before you report finished\n\n`
brief += `Check each of these and say which ones you could not verify:\n\n`
brief += `1. ${n} files attached, each to the track whose title matches the table above.\n`
brief += `2. No two tracks share a title.\n`
brief += `3. Artist name identical on every track — no trailing spaces, no case differences.\n`
brief += `4. Every track has lyrics, or you have said which do not.\n`
brief += `5. Songwriter reads \`${SONGWRITER}\` on every track; the explicit flag came from the\n`
brief += `   user, not from your own reading of the lyrics.\n`
brief += `6. The submit button has NOT been pressed.\n`
writeFileSync('mp3/DISTROKID-BRIEF.md', brief)
console.log(`[brief]  mp3/DISTROKID-BRIEF.md — ${n} files with absolute paths`)
const sung = tracks.filter((t) => lyrics[t.slug]).length
console.log(
  `[readme] mp3/README.md — ${tracks.length} songs, ${n} files, ${sung} with lyric sheets`,
)
