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

export type Voice = 'dieter' | 'kiki' | 'both'

/**
 * Work out who sings each line, in priority order:
 *   1. the explicit [Male]/[Female] tag in the text — authored per line, and demonstrably the
 *      most reliable: where it disagrees with the `voice` field (51 lines) the tag is right,
 *      e.g. "[Male] Mmm. No. You are just too hot for this spaceship." is unmistakably Dieter
 *      while the field claims Kiki.
 *   2. the per-line `voice` field, which is coarse (it marks whole duet sections "both") but
 *      fine where nothing more specific exists.
 *   3. carry the previous line's singer forward — verses run on, and this stops long untagged
 *      stretches falling back to one default colour (which is why almost everything read pink:
 *      only 138 of 879 lines carry a tag).
 * Runs over a whole song at once because rule 3 needs the preceding line's answer.
 */
export function resolveVoices(lines: LyricLine[]): Voice[] {
  const out: Voice[] = []
  let carried: Voice = 'both'
  for (const l of lines) {
    const tagged = lyricVoice(l.text)
    let v: Voice
    if (tagged) v = tagged
    else if (l.voice === 'dieter' || l.voice === 'kiki' || l.voice === 'both') v = l.voice
    else if (/^mmm/i.test(cleanLyric(l.text))) v = 'dieter' // his catchphrase, nobody else's
    else v = carried
    out.push(v)
    if (v !== 'both') carried = v
  }
  return out
}
