#!/usr/bin/env node
// Scans /mp3, groups alternate mixes of the same song into a single Track,
// and writes src/data/tracks.json for the frontend to consume.
//
// GROUPING RULES (derived from the real library — three traps handled):
//   1. Strip ONLY a trailing "_<n>" before ".mp3".  "Foo_1.mp3" -> song "Foo", variant 1.
//   2. Group by the FULL base title, never by prefix. Five different songs begin with
//      "Shameless" ("Sha-Sha-Shameless", "Shameless Little Mechanic", "...Luxury Car",
//      "...in the Navy", "...on the Floor") and must NOT be merged.
//   3. Variant 0 (no suffix) is the A-side. A song may have 1 version (orphan, e.g.
//      "Shameless in the Navy") or many (e.g. "Synthesizer Is So Big" -> _1/_2/_3).

import { readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const MP3_DIR = resolve(ROOT, 'mp3')
const OUT = resolve(ROOT, 'src/data/tracks.json')

// In-lore names for the alternate pressings. Index 0 is always the A-side.
const VERSION_LABELS = [
  { label: 'A-Side · Studio Mix', badge: 'A-SIDE', vibe: 'The official multi-platinum cut, pressed clean.' },
  { label: 'White-Label Bootleg', badge: 'BOOTLEG', vibe: 'Ripped from a sweaty dubplate. Unmastered. Illegal. Superior.' },
  { label: 'Basement VIP Edit', badge: 'VIP', vibe: 'Wolfgang re-patched this at 4am in the soundproofed basement.' },
  { label: 'Sauna Dub', badge: 'DUB', vibe: 'Recorded at 98% humidity. You can hear the coals.' },
  { label: 'Liquid-Cooled Overclock', badge: 'OC', vibe: 'Clipping hard. Do not attempt without thermal paste.' },
]

const slugify = (s) =>
  s.toLowerCase().replace(/['".]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

function parse(file) {
  const stem = file.replace(/\.mp3$/i, '')
  const m = stem.match(/_(\d+)$/) // trailing _<n> ONLY
  return {
    title: m ? stem.slice(0, m.index) : stem,
    variantIndex: m ? Number(m[1]) : 0,
    file,
  }
}

let files
try {
  files = readdirSync(MP3_DIR).filter((f) => /\.mp3$/i.test(f))
} catch {
  console.error(`[build-tracks] Could not read ${MP3_DIR}. Are the MP3s in /mp3 ?`)
  process.exit(1)
}

const groups = new Map()
for (const file of files) {
  const { title, variantIndex, file: f } = parse(file)
  if (!groups.has(title)) groups.set(title, [])
  groups.get(title).push({ variantIndex, file: f })
}

const tracks = [...groups.entries()]
  .map(([title, variants]) => {
    variants.sort((a, b) => a.variantIndex - b.variantIndex)
    const slug = slugify(title)
    const versions = variants.map((v, i) => {
      const meta = VERSION_LABELS[i] ?? {
        label: `Unofficial Pressing #${i}`,
        badge: 'WHITE-LABEL',
        vibe: 'Provenance unknown. Found in a puddle.',
      }
      return {
        id: `${slug}--v${v.variantIndex}`,
        label: meta.label,
        badge: meta.badge,
        vibe: meta.vibe,
        // filenames contain spaces -> encode for the URL, keep raw for display/debug
        src: `/mp3/${encodeURIComponent(v.file)}`,
        file: v.file,
        variantIndex: v.variantIndex,
      }
    })
    return {
      slug,
      title,
      versionCount: versions.length,
      hasBootleg: versions.length > 1,
      defaultVersionId: versions[0].id,
      versions,
    }
  })
  .sort((a, b) => a.title.localeCompare(b.title))

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(
  OUT,
  JSON.stringify(
    { generatedFrom: 'mp3/', trackCount: tracks.length, fileCount: files.length, tracks },
    null,
    2,
  ) + '\n',
)

console.log(
  `[build-tracks] ${files.length} files -> ${tracks.length} tracks. ` +
    `Multi-version: ${tracks.filter((t) => t.hasBootleg).length}, ` +
    `orphans: ${tracks.filter((t) => !t.hasBootleg).length}.`,
)
