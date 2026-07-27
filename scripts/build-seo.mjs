// Generate the site's crawlable surface: robots.txt, sitemap.xml, and a real HTML page per song.
//
//   node scripts/build-seo.mjs
//
// WHY THIS EXISTS
//
// The site is a client-rendered SPA behind a "LOG ON" gate. A crawler gets an empty shell and one
// meta description — Googlebot runs JS, but it does not click through a boot sequence, so nothing
// past the gate is reachable. Meanwhile nineteen sets of lyrics sit in lyrics.json, inside a JS
// bundle, invisible. Lyrics are among the most-searched text on the web and these are already
// written, so the cheapest real traffic available is simply to serve them as HTML.
//
// These are NOT doorway pages. Each one carries the full lyric, the track's metadata, links to the
// pressings it exists in, and navigation to its neighbours — it is the page someone searching a
// line of the song actually wants. Thin pages built to catch queries and bounce people onward are
// both against Google's guidelines and useless to the reader.
//
// Output goes to public/, which Vite copies verbatim into dist/. Committed rather than gitignored
// so the generated HTML is reviewable in a diff.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'

const ORIGIN = 'https://club-humidity.com'
const ARTIST = 'SYSTEM OVERLOAD'
const ALBUM = 'Club Humidity — The Moist Mix 2002'
const COVER = `${ORIGIN}/assets/club-humidity-cover.jpg`

const tracks = JSON.parse(readFileSync('src/data/tracks.json', 'utf8')).tracks
const lyrics = JSON.parse(readFileSync('src/data/lyrics.json', 'utf8'))

// Production notes are whole bracketed lines — "(heavy four-on-the-floor beat)" — and speaker tags
// lead a line. Both are direction, not words anyone sings, so neither belongs on a lyrics page.
const NOTE = /^[([].*[)\]]\.?$/
const TAG = /^\s*\[[^\]]+\]\s*/
const clean = (t) => t.replace(TAG, '').trim()
const isSung = (l) => l.type === 'line' && !!clean(l.text) && !NOTE.test(clean(l.text))

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Songs that have both a lyric sheet and a track entry, in album order. */
const songs = tracks
  .filter((t) => lyrics[t.slug])
  .map((t) => {
    const sheet = lyrics[t.slug]
    const lines = sheet.lines.filter((l) => l.type === 'section' || isSung(l))
    // First two sung lines make the meta description: it is the part of a song someone recognises,
    // and it beats a generic template on every result page.
    const opening = lines
      .filter((l) => l.type !== 'section')
      .slice(0, 2)
      .map((l) => clean(l.text))
      .join(' / ')
    return { ...t, sheet, lines, opening }
  })

const page = ({ title, desc, canonical, jsonld, body }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="music.song">
<meta property="og:site_name" content="Club Humidity">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${COVER}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<style>
:root { color-scheme: dark; }
body { margin:0; background:#0a0705; color:#eef3f7; font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif; }
.wrap { max-width:44rem; margin:0 auto; padding:3rem 1.25rem 5rem; }
a { color:#e6c05a; }
h1 { font-size:clamp(1.8rem,6vw,2.8rem); line-height:1.1; margin:0 0 .35rem; }
h2 { font-size:1rem; letter-spacing:.14em; text-transform:uppercase; color:#9fb0c0; margin:2.5rem 0 .75rem; }
.meta { color:#9fb0c0; margin:0 0 2rem; }
.lyric { white-space:pre-wrap; font-size:1.05rem; }
.lyric .sec { display:block; margin:1.5rem 0 .35rem; font-size:.78rem; letter-spacing:.18em; color:#e6c05a; text-transform:uppercase; }
ul { padding-left:1.1rem; } li { margin:.2rem 0; }
nav.pager { display:flex; justify-content:space-between; gap:1rem; margin-top:3rem; border-top:1px solid #2a2a33; padding-top:1rem; font-size:.95rem; }
footer { margin-top:3rem; color:#7c8794; font-size:.85rem; }
</style>
</head>
<body><div class="wrap">
${body}
</div></body>
</html>
`

mkdirSync('public/lyrics', { recursive: true })

// ---- one page per song ---------------------------------------------------------------------
songs.forEach((s, i) => {
  const prev = songs[i - 1]
  const next = songs[i + 1]
  const url = `${ORIGIN}/lyrics/${s.slug}.html`

  const lyricHtml = s.lines
    .map((l) =>
      l.type === 'section'
        ? `<span class="sec">${esc(String(l.text).toUpperCase())}</span>`
        : esc(clean(l.text)),
    )
    .join('\n')

  const body = `<p><a href="${ORIGIN}/">&larr; Club Humidity</a></p>
<h1>${esc(s.title)}</h1>
<p class="meta">${esc(ARTIST)} &middot; <em>${esc(ALBUM)}</em>${s.sheet.bpm ? ` &middot; ${s.sheet.bpm} BPM` : ''}</p>

<h2>Lyrics</h2>
<div class="lyric">${lyricHtml}</div>

<h2>Versions</h2>
<ul>${s.versions.map((v) => `<li>${esc(v.label)}</li>`).join('')}</ul>

<h2>Listen</h2>
<p><a href="${ORIGIN}/">Play ${esc(s.title)} on club-humidity.com</a> — the full album, with the video and synced lyrics.</p>

<nav class="pager">
  <span>${prev ? `<a href="${prev.slug}.html">&larr; ${esc(prev.title)}</a>` : ''}</span>
  <span>${next ? `<a href="${next.slug}.html">${esc(next.title)} &rarr;</a>` : ''}</span>
</nav>
<footer><p><a href="${ORIGIN}/lyrics/">All lyrics</a> &middot; ${esc(ALBUM)} is a parody project. ${esc(ARTIST)}, DJ Dieter and Kiki G are fictional.</p></footer>`

  writeFileSync(
    `public/lyrics/${s.slug}.html`,
    page({
      title: `${s.title} — lyrics — ${ARTIST}`,
      desc: s.opening ? `“${s.opening}” — full lyrics to ${s.title} by ${ARTIST}.` : `Full lyrics to ${s.title} by ${ARTIST}.`,
      canonical: url,
      body,
      jsonld: {
        '@context': 'https://schema.org',
        '@type': 'MusicRecording',
        name: s.title,
        url,
        byArtist: { '@type': 'MusicGroup', name: ARTIST, url: ORIGIN },
        inAlbum: { '@type': 'MusicAlbum', name: ALBUM, url: ORIGIN },
        ...(s.sheet.bpm ? { additionalProperty: { '@type': 'PropertyValue', name: 'BPM', value: s.sheet.bpm } } : {}),
      },
    }),
  )
})

// ---- lyrics index --------------------------------------------------------------------------
writeFileSync(
  'public/lyrics/index.html',
  page({
    title: `Lyrics — ${ALBUM} — ${ARTIST}`,
    desc: `Full lyrics to all ${songs.length} songs on ${ALBUM} by ${ARTIST}.`,
    canonical: `${ORIGIN}/lyrics/`,
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'MusicAlbum',
      name: ALBUM,
      url: ORIGIN,
      image: COVER,
      numTracks: songs.length,
      byArtist: { '@type': 'MusicGroup', name: ARTIST, url: ORIGIN },
      track: songs.map((s) => ({
        '@type': 'MusicRecording',
        name: s.title,
        url: `${ORIGIN}/lyrics/${s.slug}.html`,
      })),
    },
    body: `<p><a href="${ORIGIN}/">&larr; Club Humidity</a></p>
<h1>Lyrics</h1>
<p class="meta">${esc(ARTIST)} &middot; <em>${esc(ALBUM)}</em> &middot; ${songs.length} songs, all at 138 BPM</p>
<ul>${songs.map((s) => `<li><a href="${s.slug}.html">${esc(s.title)}</a></li>`).join('')}</ul>
<footer><p>${esc(ALBUM)} is a parody project. ${esc(ARTIST)}, DJ Dieter and Kiki G are fictional.</p></footer>`,
  }),
)

// ---- robots.txt ----------------------------------------------------------------------------
// Deliberately permissive. Nothing here is private, and the whole point of the exercise is to be
// found. The sitemap line is what turns a crawl into a complete one.
writeFileSync(
  'public/robots.txt',
  `User-agent: *
Allow: /

Sitemap: ${ORIGIN}/sitemap.xml
`,
)

// ---- sitemap.xml ---------------------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10)
const urls = [
  { loc: `${ORIGIN}/`, priority: '1.0' },
  { loc: `${ORIGIN}/lyrics/`, priority: '0.8' },
  ...songs.map((s) => ({ loc: `${ORIGIN}/lyrics/${s.slug}.html`, priority: '0.7' })),
]
writeFileSync(
  'public/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`)
  .join('\n')}
</urlset>
`,
)

console.log(`[seo] ${songs.length} lyric pages + index, robots.txt, sitemap.xml (${urls.length} urls)`)
