// A lyrics file mixes SUNG words with things nobody sings:
//   • production notes   "(Heavy relentless four-on-the-floor beat)"
//   • speaker tags       "[Female] Oops, I broke a glass!"
// Both must be handled EVERYWHERE and identically: notes rendered on screen look broken, and
// feeding either to the forced aligner wastes tokens and drags later lines out of sync.
// scripts/align-lyrics.py mirrors these rules — the timing arrays are indexed against them.
export type LyricLine = { type: string; voice?: string; text: string }

const NOTE = /^[([].*[)\]]\.?$/
const TAG = /^\s*\[([^\]]+)\]\s*/

/** The words as actually sung — speaker tag stripped off the front. */
export function cleanLyric(text: string): string {
  return text.replace(TAG, '').trim()
}

/** Who sings it, from the explicit [Male]/[Female] tag. More reliable than the `voice` field,
 *  which doesn't hold up across a track's different versions. */
export function lyricVoice(text: string): 'dieter' | 'kiki' | undefined {
  const m = text.match(TAG)
  if (!m) return undefined
  const t = m[1].toLowerCase()
  if (t.includes('female') || t.includes('kiki')) return 'kiki'
  if (t.includes('male') || t.includes('dieter')) return 'dieter'
  return undefined
}

export function isSungLine(l: LyricLine): boolean {
  if (l.type !== 'line') return false
  const t = cleanLyric(l.text)
  return !!t && !NOTE.test(t)
}
