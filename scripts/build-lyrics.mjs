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
const SRC =
  process.argv[2] ||
  process.env.LYRICS_SRC ||
  '/root/.claude/uploads/89c3bf2c-722e-5b39-b472-22254fb189e6'
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
const lyrics = {}
for (const f of files) {
  const parsed = parseFile(readFileSync(join(SRC, f), 'utf8'))
  if (!parsed.title || !parsed.lyrics) continue
  const slug = slugify(parsed.title)
  lyrics[slug] = { title: parsed.title, bpm: parsed.bpm, lines: structure(parsed.lyrics) }
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(lyrics, null, 2) + '\n')
console.log(`[build-lyrics] ${files.length} files -> ${Object.keys(lyrics).length} tracks with lyrics:`)
console.log('  ' + Object.keys(lyrics).join(', '))
