import { useRef, useState, useEffect } from 'react'

// Any viewport too small in EITHER axis to hold the full window gets the docked bar. The
// height clause is what catches phones in landscape; it also correctly catches a short
// desktop window, which equally cannot fit a 381px player.
const COMPACT_Q = '(max-width: 768px), (max-height: 600px)'
import { useAudio } from '../../audio/AudioProvider'
import { usePlayerStore, getTrack, getVersion } from '../../state/usePlayerStore'
import { LYRIC_STYLE_LABEL, useSiteStore } from '../../state/useSiteStore'
import { useThermalReadout } from '../../hooks/useThermalReadout'
import SpectrumDisplay from './SpectrumDisplay'
import BootlegSwitch from './BootlegSwitch'
import Knob from './Knob'

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  return `${m}:${ss.toString().padStart(2, '0')}`
}

export default function Player() {
  const audio = useAudio()
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const slug = usePlayerStore((s) => s.currentTrackSlug)
  const versionId = usePlayerStore((s) => s.currentVersionId)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const volume = usePlayerStore((s) => s.volume)
  const friction = useSiteStore((s) => s.friction)
  const setFriction = useSiteStore((s) => s.setFriction)
  const toggleLyrics = useSiteStore((s) => s.toggleLyrics)
  const lyricsOpen = useSiteStore((s) => s.lyricsOpen)
  const videoEnabled = useSiteStore((s) => s.videoEnabled)
  const toggleVideo = useSiteStore((s) => s.toggleVideo)
  const lyricStyle = useSiteStore((s) => s.lyricStyle)
  const cycleLyricStyle = useSiteStore((s) => s.cycleLyricStyle)
  const toggleVisualizer = useSiteStore((s) => s.toggleVisualizer)
  const shuffle = useSiteStore((s) => s.shuffle)
  const repeat = useSiteStore((s) => s.repeat)
  const toggleShuffle = useSiteStore((s) => s.toggleShuffle)
  const toggleRepeat = useSiteStore((s) => s.toggleRepeat)
  const thermal = useThermalReadout()
  // Click-to-mute remembers the level you were at, so unmuting returns you there rather than
  // to some arbitrary default.
  const preMuteRef = useRef(0.8)
  // Opening a 19-track list scrolled to the top means hunting for what's playing.
  const currentRowRef = useRef<HTMLButtonElement>(null)
  const toggleMute = () => {
    if (volume > 0.001) {
      preMuteRef.current = volume
      audio.setVolume(0)
    } else {
      audio.setVolume(preMuteRef.current || 0.8)
    }
  }

  const tracks = usePlayerStore((s) => s.tracks)
  const track = getTrack(slug)
  const version = getVersion(slug, versionId)

  // ---- draggable window (desktop) / docked bottom bar (mobile) ----
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 24, y: 0 })
  const [placed, setPlaced] = useState(false)
  // Where the viewer last dragged the window, and whether they rolled it up. Restored on the
  // next visit — re-docking bottom-left every reload undoes a deliberate choice.
  const savePlacement = (p: { x: number; y: number }, min: boolean) => {
    try {
      localStorage.setItem('so.player', JSON.stringify({ x: p.x, y: p.y, min }))
    } catch {
      /* private mode — placement just won't persist */
    }
  }
  // start collapsed on phones — the full player eats ~40% of a mobile screen
  const [playlistOpen, setPlaylistOpen] = useState(false)
  const [minimized, setMinimized] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      const raw = localStorage.getItem('so.player')
      if (raw) return !!JSON.parse(raw).min
    } catch {
      /* fall through to the default */
    }
    return window.matchMedia(COMPACT_Q).matches // phones (either orientation) start rolled up
  })
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const winRef = useRef<HTMLDivElement>(null)
  // On phones the draggable/tilting 348px window is too big and blocks scroll — dock it as a
  // full-width compact bar at the bottom instead (CSS controls position; drag/tilt disabled).
  // Width OR height. A phone in landscape is 844px WIDE and 390px TALL, so a width-only test
  // called it a desktop and handed it the 381px-tall draggable window — 98% of the screen, and
  // on a 375px-tall device it overflowed off the bottom entirely.
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(COMPACT_Q).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(COMPACT_Q)
    const on = () => setIsMobile(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  useEffect(() => {
    if (placed) return
    // Dock bottom-left on first mount using the player's REAL height. This assumed a fixed
    // 300px, but the window grew (tools row, bootleg switch) and the stale assumption left the
    // A-SIDE / BOOTLEG version switch hanging below the fold on first boot. Clamped so the whole
    // window still fits on a short viewport.
    const h = winRef.current?.offsetHeight ?? 360
    let next = { x: 24, y: Math.max(8, window.innerHeight - h - 20) }
    try {
      const raw = localStorage.getItem('so.player')
      if (raw) {
        const saved = JSON.parse(raw)
        if (typeof saved.x === 'number' && typeof saved.y === 'number') {
          // Clamp to the CURRENT viewport: a position saved on a big monitor would otherwise
          // put the window off-screen on a laptop, with no way to drag it back.
          next = {
            x: Math.max(4, Math.min(window.innerWidth - 80, saved.x)),
            y: Math.max(4, Math.min(window.innerHeight - 40, saved.y)),
          }
        }
      }
    } catch {
      /* unreadable — use the default dock */
    }
    setPos(next)
    setPlaced(true)
  }, [placed])

  const onTitleDown = (e: React.PointerEvent) => {
    const rect = winRef.current!.getBoundingClientRect()
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onTitleMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const x = Math.max(4, Math.min(window.innerWidth - 60, e.clientX - dragRef.current.dx))
    const y = Math.max(4, Math.min(window.innerHeight - 40, e.clientY - dragRef.current.dy))
    setPos({ x, y })
  }
  const onTitleUp = () => {
    if (dragRef.current) savePlacement(pos, minimized)
    dragRef.current = null
  }

  // ---- 3D parallax tilt (imperative CSS vars, no re-renders; disabled while dragging) ----
  const onTilt = (e: React.PointerEvent) => {
    if (dragRef.current) return
    const el = winRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--ry', `${px * 12}deg`)
    el.style.setProperty('--rx', `${-py * 12}deg`)
  }
  const onTiltLeave = () => {
    const el = winRef.current
    if (!el) return
    el.style.setProperty('--ry', '0deg')
    el.style.setProperty('--rx', '0deg')
  }

  // Keyboard control. Space is the one everyone reaches for in a player and it did nothing;
  // arrows scrub. Skipped while typing in a field, and preventDefault on Space so the page
  // doesn't scroll underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      if (!useSiteStore.getState().loggedOn) return
      if (e.code === 'Space') {
        e.preventDefault()
        audio.toggle()
      } else if (e.key === 'ArrowRight') {
        audio.seek(Math.min(usePlayerStore.getState().duration, usePlayerStore.getState().currentTime + 5))
      } else if (e.key === 'ArrowLeft') {
        audio.seek(Math.max(0, usePlayerStore.getState().currentTime - 5))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [audio])

  useEffect(() => {
    if (playlistOpen) currentRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [playlistOpen, slug])

  const pct = duration ? (currentTime / duration) * 100 : 0
  const overheating = thermal.temperature > 78
  const cooling = thermal.dewPointHit

  return (
    <div
      ref={winRef}
      className={`player ${isMobile ? 'mobile' : ''} ${overheating ? 'overheating' : ''} ${
        cooling ? 'cooling' : ''
      } ${minimized ? 'minimized' : ''}`}
      style={isMobile ? undefined : { left: pos.x, top: pos.y }}
      role="region"
      aria-label="System Overload MP3-9000 player"
      onPointerMove={isMobile ? undefined : onTilt}
      onPointerLeave={isMobile ? undefined : onTiltLeave}
    >
      <div
        className="player-title"
        onPointerDown={isMobile ? undefined : onTitleDown}
        onPointerMove={isMobile ? undefined : onTitleMove}
        onPointerUp={isMobile ? undefined : onTitleUp}
      >
        <span className="dot green" />
        <span className="title-text">◈ SYSTEM OVERLOAD — MP3-9000 ◈</span>
        <div className="title-btns">
          <button
            className="tb"
            onClick={() =>
              setMinimized((m) => {
                savePlacement(pos, !m)
                return !m
              })
            }
            aria-label={minimized ? 'Restore' : 'Minimize'}
            title={minimized ? 'Restore' : 'Roll up'}
          >
            {minimized ? '▢' : '_'}
          </button>
        </div>
      </div>

      {minimized && (
        // Winamp's shade mode stayed useful when rolled up. Ours went completely blank, so a
        // collapsed player was just a title bar you had to expand to do anything with.
        <div className="player-shade">
          {/* Winamp shade mode, rebuilt for a phone. Everything you actually reach for while a
              track is playing, in one 40px strip: a live VU, real transport, the title, the
              time, and a hairline progress bar along the bottom edge.
              The VU is four bars driven straight off the audio CSS variables via scaleY — a
              TRANSFORM, so it is composited and costs nothing, unlike a second canvas with its
              own draw loop or anything animating height. */}
          <div className="shade-vu" aria-hidden>
            <i style={{ ['--b' as any]: 'var(--m-bass, 0)' }} />
            <i style={{ ['--b' as any]: 'var(--m-level, 0)' }} />
            <i style={{ ['--b' as any]: 'var(--m-beat, 0)' }} />
            <i style={{ ['--b' as any]: 'var(--m-treble, 0)' }} />
          </div>
          <button className="shade-btn" onClick={() => audio.prev()} aria-label="Previous">
            ⏮
          </button>
          <button className="shade-btn play" onClick={() => audio.toggle()} aria-label="Play/Pause">
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button className="shade-btn" onClick={() => audio.next()} aria-label="Next">
            ⏭
          </button>
          {/* the title scrolls only when it cannot fit, the way the original did */}
          <div className="shade-marquee">
            <span className="shade-title">
              {track ? track.title : 'INSERT DISC'}
              {version ? ` \u00b7 ${version.label}` : ''}
            </span>
          </div>
          <span className="shade-time">{fmt(currentTime)}</span>
          <button
            className="shade-expand"
            onClick={() => {
              setMinimized(false)
              savePlacement(pos, false)
            }}
            aria-label="Expand player"
            title="Expand"
          >
            ▲
          </button>
          <div className="shade-bar" aria-hidden>
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {!minimized && (
        <div className="player-body">
          <div className="lcd">
            <div className="lcd-row">
              <span className={`lcd-badge ${version?.badge?.toLowerCase()}`}>
                {version?.badge ?? '— —'}
              </span>
              <span className="lcd-title">
                <span className="marquee">
                  {track ? track.title : 'INSERT DISC // PRESS PLAY'} &nbsp;•&nbsp;{' '}
                  {version?.label ?? 'awaiting signal'} &nbsp;•&nbsp;{' '}
                </span>
              </span>
            </div>
            <SpectrumDisplay />
            <div className="lcd-meta">
              <span>{fmt(currentTime)}</span>
              <span className="thermal-mini" title="Rig temperature / humidity">
                🌡 {Math.round(thermal.temperature)}°C · 💧 {Math.round(thermal.humidity * 100)}%
                {cooling ? ' · ❄ LIQUID-COOLING' : overheating ? ' · ⚠ OVERHEAT' : ''}
              </span>
              <span>{fmt(duration)}</span>
            </div>
          </div>

          <input
            className="seek"
            type="range"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => audio.seek((Number(e.target.value) / 100) * (duration || 0))}
            aria-label="Seek"
            style={{ ['--pct' as any]: `${pct}%` }}
          />

          <div className="transport">
            <button className="tbtn" onClick={() => audio.prev()} aria-label="Previous">
              ⏮
            </button>
            <button className="tbtn play" onClick={() => audio.toggle()} aria-label="Play/Pause">
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button className="tbtn" onClick={() => audio.next()} aria-label="Next">
              ⏭
            </button>
            <button
              className={`tbtn sm ${shuffle ? 'on' : ''}`}
              onClick={toggleShuffle}
              aria-pressed={shuffle}
              aria-label="Shuffle"
              title={shuffle ? 'Shuffle ON' : 'Shuffle off'}
            >
              🔀
            </button>
            <button
              className={`tbtn sm ${repeat ? 'on' : ''}`}
              onClick={toggleRepeat}
              aria-pressed={repeat}
              aria-label="Repeat track"
              title={repeat ? 'Repeat ON — this track loops' : 'Repeat off'}
            >
              🔁
            </button>
            <div className="knobs">
              <Knob
                label={volume > 0.001 ? 'VOL' : 'MUTE'}
                value={volume}
                onChange={(v) => audio.setVolume(v)}
                onTap={toggleMute}
                color={volume > 0.001 ? '#12e0c0' : '#7a8590'}
              />
              <Knob label="FRICTION" value={friction} onChange={setFriction} color="#ff2e9a" />
            </div>
          </div>

          {/* Toggles get their own row. Five of them alongside transport + two knobs overflowed
              the 348px window and pushed the FRICTION knob outside it. */}
          <div className="tools">
            <button
              className={`tbtn lyr ${lyricsOpen ? 'on' : ''}`}
              onClick={toggleLyrics}
              aria-label="Toggle lyrics"
              title="Karaoke / lyrics"
            >
              🎤
            </button>
            <button
              className={`tbtn vid ${videoEnabled ? 'on' : ''}`}
              onClick={toggleVideo}
              aria-label="Toggle video backgrounds"
              title={videoEnabled ? 'Video ON — tap for stills' : 'Stills — tap for video'}
            >
              🎬
            </button>
            <button
              className="tbtn lstyle"
              onClick={cycleLyricStyle}
              aria-label="Change lyric style"
              title={`Lyric style: ${LYRIC_STYLE_LABEL[lyricStyle]} — tap to change`}
            >
              🅰
            </button>
            <button
              className={`tbtn plist ${playlistOpen ? 'on' : ''}`}
              onClick={() => setPlaylistOpen((o) => !o)}
              aria-label="Playlist"
              aria-expanded={playlistOpen}
              title={`Playlist — ${tracks.length} tracks`}
            >
              ☰
            </button>
            <button
              className="tbtn viz"
              onClick={toggleVisualizer}
              aria-label="Full-screen visualizer"
              title="Visualizer — the page steps aside (V)"
            >
              ⛶
            </button>
          </div>

          {playlistOpen && (
            // Winamp had a playlist window; with 19 tracks, prev/next alone means hunting.
            <ol className="playlist" aria-label="Playlist">
              {tracks.map((t, i) => (
                <li key={t.slug}>
                  <button
                    ref={t.slug === slug ? currentRowRef : undefined}
                    className={`pl-row ${t.slug === slug ? 'on' : ''}`}
                    onClick={() => audio.playTrack(t.slug)}
                    aria-current={t.slug === slug ? 'true' : undefined}
                  >
                    <span className="pl-n">{String(i + 1).padStart(2, '0')}</span>
                    <span className="pl-t">{t.title}</span>
                    {t.hasBootleg && <span className="pl-b" title="bootleg available">◈</span>}
                  </button>
                </li>
              ))}
            </ol>
          )}

          <BootlegSwitch track={track} currentVersionId={versionId} />
        </div>
      )}
    </div>
  )
}
