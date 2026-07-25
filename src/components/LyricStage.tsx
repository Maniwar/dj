import { useEffect, useMemo, useRef, useState } from 'react'
import { audioBus } from '../audio/audioBus'
import { usePlayerStore } from '../state/usePlayerStore'
import { useSiteStore } from '../state/useSiteStore'
import lyricsData from '../data/lyrics.json'

type Line = { type: string; voice?: string; text: string }
type Song = { title: string; bpm: number; lines: Line[] }
const SONGS = lyricsData as unknown as Record<string, Song | undefined>

// The lyrics were buried in a marquee and a collapsed panel — 19 songs of writing nobody sees.
// This puts the CURRENT line on screen for the whole site, as a performance rather than a
// ticker: Dieter's lines come in cold and heavy, Kiki's hot and bouncing.
//
// There are no per-line timestamps in the data, so position still comes from playback progress
// — but the line only ever CHANGES on a beat. Snapping the change to the grid is what makes it
// feel sung instead of scrubbed, and it's only possible because the beat clock is exact.
export default function LyricStage() {
  const slug = usePlayerStore((s) => s.currentTrackSlug)
  const loggedOn = useSiteStore((s) => s.loggedOn)
  const lyricsOpen = useSiteStore((s) => s.lyricsOpen) // full karaoke panel — don't double up
  const reduced = useSiteStore((s) => s.reducedMotion)
  const [idx, setIdx] = useState(0)
  const [nonce, setNonce] = useState(0) // restarts the entrance animation on each new line
  const idxRef = useRef(0)

  const song = slug ? SONGS[slug] : undefined
  // only sung lines — section markers ([CHORUS] etc.) aren't performed
  const lines = useMemo(() => (song?.lines ?? []).filter((l) => l.type === 'line'), [song])

  useEffect(() => {
    idxRef.current = 0
    setIdx(0)
  }, [slug])

  useEffect(() => {
    if (!lines.length) return
    let raf = 0
    let lastBeat = -1
    const loop = () => {
      const beat = audioBus.music.beatIndex
      // advance at most every other beat, and only ON a beat
      if (beat !== lastBeat && beat % 2 === 0) {
        lastBeat = beat
        const st = usePlayerStore.getState()
        const p = st.duration ? st.currentTime / st.duration : 0
        const target = Math.max(0, Math.min(lines.length - 1, Math.floor(p * lines.length)))
        if (target !== idxRef.current) {
          idxRef.current = target
          setIdx(target)
          setNonce((n) => n + 1)
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [lines])

  if (!loggedOn || lyricsOpen || reduced || !lines.length) return null
  const cur = lines[idx]
  const next = lines[idx + 1]
  if (!cur) return null

  return (
    <div className={`lyric-stage v-${cur.voice ?? 'both'}`} aria-live="polite">
      <div className="ls-who">{cur.voice === 'kiki' ? 'KIKI G' : cur.voice === 'dieter' ? 'DJ DIETER' : 'SYSTEM OVERLOAD'}</div>
      <div className="ls-line" key={nonce}>
        {cur.text.split(' ').map((w, i) => (
          // each word gets its own step in the entrance so the line reads like it's being sung.
          // Real spaces between the spans (rather than margins) keep the line readable to
          // screen readers and copyable as actual text.
          <span key={i}>
            <span className="ls-word" style={{ animationDelay: `${i * 42}ms` }}>
              {w}
            </span>
            {i < cur.text.split(' ').length - 1 ? ' ' : ''}
          </span>
        ))}
      </div>
      {next && <div className="ls-next">{next.text}</div>}
    </div>
  )
}
