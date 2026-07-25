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
// HONEST LIMITATION: there are no per-line timestamps anywhere in the data, so this CANNOT be
// true karaoke — position is estimated from playback progress. It therefore deliberately does
// NOT claim to be the line being sung right now, and it no longer names a singer: the voice
// field doesn't hold up across a track's different versions (A-side vs bootleg vs studio mix).
// It presents the song's words as an ambient lyric card instead, changing every 2 bars so it
// reads as atmosphere rather than a karaoke prompt that's visibly wrong.
// Real sync would need forced alignment (timestamps generated from the audio itself).
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
  // rough singing duration per line — word count, floored so one-word ad-libs still take time
  const weights = useMemo(() => lines.map((l) => Math.max(2, l.text.trim().split(/\s+/).length)), [lines])
  const totalWeight = useMemo(() => weights.reduce((a, b) => a + b, 0) || 1, [weights])

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
      if (beat !== lastBeat && beat % 8 === 0) {
        lastBeat = beat
        const st = usePlayerStore.getState()
        const p = st.duration ? st.currentTime / st.duration : 0
        // Best estimate available without real timestamps. Two corrections over a flat
        // progress*lineCount mapping, which is what made it drift badly:
        //  1) vocals don't span the whole file — there's an instrumental intro and an outro,
        //     so map into a [LEAD_IN, TAIL_OUT] window instead of 0..1.
        //  2) lines aren't equal length; a nine-word line takes longer to sing than "Mmm."
        //     so position by cumulative WEIGHT rather than by line index.
        const LEAD_IN = 0.06, TAIL_OUT = 0.94
        const q = Math.max(0, Math.min(1, (p - LEAD_IN) / (TAIL_OUT - LEAD_IN)))
        const want = q * totalWeight
        let acc = 0
        let target = lines.length - 1
        for (let i = 0; i < weights.length; i++) {
          acc += weights[i]
          if (acc >= want) { target = i; break }
        }
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
  }, [lines, weights, totalWeight])

  if (!loggedOn || lyricsOpen || reduced || !lines.length) return null
  const cur = lines[idx]
  const next = lines[idx + 1]
  if (!cur) return null

  return (
    <div className="lyric-stage" aria-hidden>
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
