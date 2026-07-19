import { useRef, useState, useEffect } from 'react'
import { useAudio } from '../../audio/AudioProvider'
import { usePlayerStore, getTrack, getVersion } from '../../state/usePlayerStore'
import { useSiteStore } from '../../state/useSiteStore'
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
  const thermal = useThermalReadout()

  const track = getTrack(slug)
  const version = getVersion(slug, versionId)

  // ---- draggable window ----
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 24, y: 0 })
  const [placed, setPlaced] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const winRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (placed) return
    // dock bottom-left on first mount
    const w = 340
    const h = 300
    setPos({ x: 24, y: window.innerHeight - h - 24 })
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
    dragRef.current = null
  }

  const pct = duration ? (currentTime / duration) * 100 : 0
  const overheating = thermal.temperature > 78
  const cooling = thermal.dewPointHit

  return (
    <div
      ref={winRef}
      className={`player ${overheating ? 'overheating' : ''} ${cooling ? 'cooling' : ''} ${
        minimized ? 'minimized' : ''
      }`}
      style={{ left: pos.x, top: pos.y }}
      role="region"
      aria-label="System Overload MP3-9000 player"
    >
      <div
        className="player-title"
        onPointerDown={onTitleDown}
        onPointerMove={onTitleMove}
        onPointerUp={onTitleUp}
      >
        <span className="dot green" />
        <span className="title-text">◈ SYSTEM OVERLOAD — MP3-9000 ◈</span>
        <div className="title-btns">
          <button
            className="tb"
            onClick={() => setMinimized((m) => !m)}
            aria-label={minimized ? 'Restore' : 'Minimize'}
            title={minimized ? 'Restore' : 'Roll up'}
          >
            {minimized ? '▢' : '_'}
          </button>
        </div>
      </div>

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
            <div className="knobs">
              <Knob label="VOL" value={volume} onChange={(v) => audio.setVolume(v)} color="#12e0c0" />
              <Knob
                label="FRICTION"
                value={friction}
                onChange={setFriction}
                color="#ff2e9a"
              />
            </div>
          </div>

          <BootlegSwitch track={track} currentVersionId={versionId} />
        </div>
      )}
    </div>
  )
}
