import { useEffect, useMemo, useRef } from 'react'
import { usePlayerStore, getTrack } from '../../state/usePlayerStore'
import { useSiteStore } from '../../state/useSiteStore'
import { lyricsFor } from '../../data/lyricLines'

// Karaoke teleprompter. No per-line timestamps exist, so we approximate the active
// line from playback progress — enough to sing along. Dieter = sleazy male (blue),
// Kiki G = squeaky female (pink).
export default function Lyrics() {
  const open = useSiteStore((s) => s.lyricsOpen)
  const toggle = useSiteStore((s) => s.toggleLyrics)
  const slug = usePlayerStore((s) => s.currentTrackSlug)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)

  const song = lyricsFor(slug)
  const activeRef = useRef<HTMLParagraphElement>(null)

  // index among *line* items (skip section headers)
  const lineOrdinals = useMemo(() => {
    if (!song) return []
    let n = 0
    return song.lines.map((l) => (l.type === 'line' ? n++ : -1))
  }, [song])
  const totalLines = useMemo(() => lineOrdinals.filter((o) => o >= 0).length, [lineOrdinals])
  const progress = duration ? currentTime / duration : 0
  const activeOrdinal = Math.min(totalLines - 1, Math.floor(progress * totalLines))

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeOrdinal])

  if (!open) return null
  const track = getTrack(slug)

  return (
    <div className="karaoke" role="dialog" aria-label="Lyrics">
      <div className="karaoke-head">
        <span className="k-title">
          🎤 {track?.title ?? 'NO SIGNAL'} {song?.bpm ? `· ${song.bpm} BPM` : ''}
        </span>
        <button className="k-close" onClick={toggle} aria-label="Close lyrics">
          ✕
        </button>
      </div>
      <div className="karaoke-body">
        {!song ? (
          <p className="k-empty">
            NO LYRIC SHEET ON FILE FOR THIS PRESSING.
            <br />
            <span>(Dieter ate it. It was moist.)</span>
          </p>
        ) : (
          song.lines.map((l, i) => {
            if (l.type === 'section')
              return (
                <p className="k-section" key={i}>
                  — {l.text} —
                </p>
              )
            const ord = lineOrdinals[i]
            const state = ord === activeOrdinal ? 'on' : ord < activeOrdinal ? 'past' : 'next'
            return (
              <p
                key={i}
                ref={ord === activeOrdinal ? activeRef : undefined}
                className={`k-line v-${l.voice ?? 'both'} ${state}`}
              >
                {l.text}
              </p>
            )
          })
        )}
      </div>
      <div className="karaoke-foot">
        <span className="v-dieter">◆ DJ DIETER</span>
        <span className="v-kiki">◆ KIKI G</span>
      </div>
    </div>
  )
}
