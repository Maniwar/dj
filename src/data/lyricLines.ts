import lyricsData from './lyrics.json'

type Line = { type: 'section' | 'line'; voice?: string; text: string }
type Song = { title: string; bpm: number | null; lines: Line[] }
const DATA = lyricsData as Record<string, Song>

export function lyricsFor(slug: string | null): Song | null {
  if (!slug) return null
  return DATA[slug] ?? null
}

// Punchy hook lines pulled from every song — the site's ambient copy (tickers, marquees).
export function allHooks(): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const slug of Object.keys(DATA)) {
    for (const l of DATA[slug].lines) {
      if (l.type !== 'line') continue
      const t = l.text.replace(/\s+/g, ' ').trim().replace(/[.]+$/, '')
      if (t.length < 5 || t.length > 58) continue
      const key = t.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(t)
    }
  }
  return out
}

// A hand-curated shortlist of the best hooks for hero/marquee headline use.
export const TOP_HOOKS = [
  'I AM EURO-TRASH, COMPLETELY UNASHAMED',
  'TOO CHEAP, TOO LOUD, MAKING SUCH A SCENE',
  'LEOPARD PRINT AND FAKE DIAMONDS',
  'YOU SPILLED CHAMPAGNE ON MY LEATHER PANTS. MMM.',
  'DANCING ON THE TABLE, I WON’T BE TAMED',
  'WE DO NOT WAIT IN LINE. WE BREAK THE LINE.',
  'THE GLITTER IN MY HAIR, LIKE I JUST DON’T CARE',
  'CIAO LOSERS',
]
