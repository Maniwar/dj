#!/usr/bin/env node
// Parses the Suno metadata .txt exports (Title + BPM + Lyrics) into a clean
// src/data/lyrics.json keyed by track slug, matched to the /mp3 library.
// Usage: node scripts/build-lyrics.mjs [sourceDir]
// Default sourceDir is the chat upload path; pass a repo path for reproducible builds.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
// Prefer an in-repo `lyrics-src/` folder so lyric builds are reproducible anywhere (the
// old default pointed at a one-off chat-upload path that no longer exists). Override with
// an arg or LYRICS_SRC.
const SRC = process.argv[2] || process.env.LYRICS_SRC || resolve(ROOT, 'lyrics-src')
const OUT = resolve(ROOT, 'src/data/lyrics.json')

const slugify = (s) =>
  s.toLowerCase().replace(/['".]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

function parseFile(txt) {
  const title = (txt.match(/^Title:\s*(.+)$/m) || [])[1]?.trim()
  const bpm = Number((txt.match(/(\d{2,3})\s*bpm/i) || [])[1] || 0) || null
  // lyrics live between the "--- Lyrics ---" header and the next "--- ..." / "Cover Art"
  let lyrics = ''
  const m = txt.match(/---\s*Lyrics\s*---\s*([\s\S]*?)\n(?:Cover Art URL|---\s*Raw API)/i)
  if (m) lyrics = m[1].trim()
  return { title, bpm, lyrics }
}

// split lyrics into structured lines, tagging speaker from [Section: Voice] headers
function structure(lyrics) {
  const out = []
  let voice = 'both'
  for (const raw of lyrics.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const head = line.match(/^\[([^\]]+)\]$/)
    if (head) {
      const h = head[1].toLowerCase()
      if (h.includes('male')) voice = 'dieter'
      else if (h.includes('female')) voice = 'kiki'
      else if (h.includes('and')) voice = 'both'
      out.push({ type: 'section', text: head[1].replace(/:.*$/, '').trim().toUpperCase() })
      continue
    }
    out.push({ type: 'line', voice, text: line })
  }
  return out
}

if (!existsSync(SRC)) {
  console.error(`[build-lyrics] source dir not found: ${SRC}`)
  process.exit(0) // don't fail the build if lyrics sources aren't present
}

const files = readdirSync(SRC).filter((f) => /\.txt$/i.test(f))
// Merge into any existing sheets so adding just the missing songs never drops the rest.
const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}
const built = {}
for (const f of files) {
  const parsed = parseFile(readFileSync(join(SRC, f), 'utf8'))
  if (!parsed.title || !parsed.lyrics) continue
  const slug = slugify(parsed.title)
  built[slug] = { title: parsed.title, bpm: parsed.bpm, lines: structure(parsed.lyrics) }
}

// Guard: never wipe existing sheets when the source folder has nothing parseable.
if (!Object.keys(built).length) {
  console.warn(
    `[build-lyrics] no parseable .txt in ${SRC} — leaving the existing ` +
      `${Object.keys(existing).length} sheet(s) untouched.`,
  )
  process.exit(0)
}

const lyrics = { ...existing, ...built }
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(lyrics, null, 2) + '\n')
console.log(`[build-lyrics] parsed ${Object.keys(built).length} file(s); lyrics.json now has ${Object.keys(lyrics).length} sheet(s):`)
console.log('  ' + Object.keys(lyrics).join(', '))
