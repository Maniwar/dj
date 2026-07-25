import { useEffect, useMemo, useRef, useState } from 'react'
import { audioBus } from '../audio/audioBus'
import { usePlayerStore } from '../state/usePlayerStore'
import { useSiteStore } from '../state/useSiteStore'
import { cleanLyric, isSungLine, resolveVoices } from '../data/sungLines'
import lyricsData from '../data/lyrics.json'
import timingsData from '../data/lyricTimings.json'

type Line = { type: string; voice?: string; text: string }
type Song = { title: string; bpm: number; lines: Line[] }
const SONGS = lyricsData as unknown as Record<string, Song | undefined>
// Per-WORD start times from forced alignment (scripts/align-lyrics.py), keyed by version:
//   { "<versionId>": [ [w0,w1,w2], [w0,w1], ... ] }   seconds, one array per sung line.
// Per version because a bootleg edit doesn't sing a line when the studio mix does.
const TIMINGS = timingsData as unknown as Record<string, number[][] | undefined>

const HOLD_AFTER_LAST_WORD = 1.4 // how long a finished line lingers
const GAP_TO_HIDE = 2.0 // if the next line is further off than this, show nothing

// The lyrics used to be buried in a marquee and a collapsed panel — 19 songs of writing nobody
// sees. This performs the song across the whole site: each word lights up as it is actually
// SUNG, because we now have real word-level timings rather than a guess from playback progress.
export default function LyricStage() {
  const slug = usePlayerStore((s) => s.currentTrackSlug)
  const versionId = usePlayerStore((s) => s.currentVersionId)
  const loggedOn = useSiteStore((s) => s.loggedOn)
  const lyricsOpen = useSiteStore((s) => s.lyricsOpen) // full karaoke panel — don't double up
  const reduced = useSiteStore((s) => s.reducedMotion)
  const [idx, setIdx] = useState(-1) // -1 = nothing being sung right now (instrumental)
  const [sung, setSung] = useState(0) // how many words of the current line have landed
  const idxRef = useRef(-1)
  const sungRef = useRef(0)

  const song = slug ? SONGS[slug] : undefined
  // must match scripts/align-lyrics.py exactly — the timing arrays are indexed against it
  const lines = useMemo(() => (song?.lines ?? []).filter(isSungLine), [song])
  const voices = useMemo(() => resolveVoices(lines), [lines])
  const times = versionId ? TIMINGS[versionId] : undefined

  useEffect(() => {
    idxRef.current = -1
    sungRef.current = 0
    setIdx(-1)
    setSung(0)
  }, [slug, versionId])

  useEffect(() => {
    if (!lines.length || !times?.length) return
    let raf = 0
    const loop = () => {
      const now = usePlayerStore.getState().currentTime
      let li = -1
      for (let i = 0; i < times.length; i++) {
        if (times[i]?.length && times[i][0] <= now) li = i
        else break
      }
      if (li >= 0) {
        const w = times[li]
        const lineEnd = w[w.length - 1] + HOLD_AFTER_LAST_WORD
        const nextStart = li + 1 < times.length ? times[li + 1][0] : Infinity
        // THE "STUCK" FIX: once a line has finished, don't leave it frozen on screen through a
        // long instrumental waiting for the next one — step aside until the singing resumes.
        if (now > lineEnd && nextStart - now > GAP_TO_HIDE) li = -1
      }
      if (li !== idxRef.current) {
        idxRef.current = li
        setIdx(li)
        sungRef.current = 0
        setSung(0)
      }
      if (li >= 0) {
        const w = times[li]
        let n = 0
        for (let i = 0; i < w.length; i++) if (w[i] <= now) n = i + 1
        if (n !== sungRef.current) {
          if (n > sungRef.current) audioBus.hitVocal() // the word lands -> the rig answers
          sungRef.current = n
          setSung(n)
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [lines, times])

  if (!loggedOn || lyricsOpen || reduced || !lines.length) return null
  if (!times?.length) return null // unaligned version: show nothing rather than something wrong
  const cur = idx >= 0 ? lines[idx] : undefined
  if (!cur) return null
  // Resolved per song (tag > field > carried forward) so every line has a singer instead of
  // most of them falling through to one default colour.
  const voice = voices[idx]
  const words = cleanLyric(cur.text).split(' ')

  return (
    <div className={`lyric-stage${voice ? ` v-${voice}` : ''}`} aria-hidden>
      <div className="ls-line" key={idx}>
        {words.map((w, i) => {
          // already sung / landing right now / still to come
          const state = i < sung - 1 ? 'done' : i === sung - 1 ? 'now' : 'todo'
          return (
            <span key={i}>
              <span className={`ls-word ${state}`}>
                {state === 'now'
                  ? // the word being sung right now snaps in letter by letter
                    w.split('').map((ch, j) => (
                      // Two nested spans on purpose: the outer one plays the ENTRANCE and the
                      // inner one the continuous shimmer. Both animate `transform`, so on a
                      // single element the infinite one silently overrode the entrance and the
                      // per-letter cascade never showed at all.
                      <span className="ls-ch" style={{ animationDelay: `${j * 34}ms` }} key={j}>
                        <span className="ls-ch-i" style={{ animationDelay: `${j * 90}ms` }}>
                          {ch === ' ' ? '\u00a0' : ch}
                        </span>
                      </span>
                    ))
                  : w}
              </span>
              {i < words.length - 1 ? ' ' : ''}
            </span>
          )
        })}
      </div>
    </div>
  )
}
