import { useEffect, useRef, useState } from 'react'
import { TOUR_CLIPS } from '../data/tour.manifest'
import { useSiteStore } from '../state/useSiteStore'

// A persistent VERTICAL "world tour" progress rail down the right edge of the page. As you
// scroll the whole site top→bottom the vehicle travels down the rail and the four cities
// light up as milestones; the fill grows from the top. Beat-reactive via --m-beat.
//
// The vehicle is also a SCRUBBER: grab it and drag to travel, or click anywhere on the track
// to jump there. The rail itself stays pointer-events:none so it never blocks the page — only
// the track and the vehicle opt back in.
const LEG: Record<string, string> = { ibiza: '🛥️', tokyo: '✈️', miami: '🚌', berlin: '🚄' }

export default function TourRail() {
  const loggedOn = useSiteStore((s) => s.loggedOn)
  const rootRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [pct, setPct] = useState(0)
  const cities = TOUR_CLIPS
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  // Map a pointer position on the track to a scroll position on the page. Straight assignment
  // rather than a smooth scroll: while dragging, the vehicle must sit under the finger, and any
  // easing puts the page behind the gesture.
  const scrollFromPointer = (clientY: number) => {
    const track = trackRef.current
    if (!track) return
    const r = track.getBoundingClientRect()
    const p = Math.min(1, Math.max(0, (clientY - r.top) / Math.max(1, r.height)))
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: p * max, behavior: 'auto' })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDragging(true)
    scrollFromPointer(e.clientY)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    scrollFromPointer(e.clientY)
  }
  const endDrag = (e: React.PointerEvent) => {
    if (!dragging) return
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    setDragging(false)
  }

  // It is a control now, so it answers to the keyboard as well as the pointer.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    const step = window.innerHeight * 0.9
    const map: Record<string, number> = {
      ArrowDown: window.scrollY + step,
      ArrowUp: window.scrollY - step,
      PageDown: window.scrollY + step,
      PageUp: window.scrollY - step,
      Home: 0,
      End: max,
    }
    if (!(e.key in map)) return
    e.preventDefault()
    window.scrollTo({ top: Math.min(max, Math.max(0, map[e.key])), behavior: 'smooth' })
  }

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    let raf = 0
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      el.style.setProperty('--rail', p.toFixed(4))
      setPct(Math.round(p * 100))
      setActive(Math.min(cities.length - 1, Math.floor(p * cities.length + 0.0001)))
    }
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [cities.length])

  const current = cities[active]
  const veh = LEG[current?.id] ?? '🚐'
  const shown = loggedOn && pct > 2

  return (
    <div ref={rootRef} className={`tour-rail ${shown ? 'show' : ''} ${dragging ? 'dragging' : ''}`}>
      <span className="rail-cap" aria-hidden>
        TOUR
      </span>
      <div
        ref={trackRef}
        className="rail-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="rail-line" />
        <div className="rail-fill" />
        {cities.map((c, i) => (
          <span
            key={c.id}
            className={`rail-pin ${i <= active ? 'done' : ''} ${i === active ? 'now' : ''}`}
            style={{ top: `${(i / (cities.length - 1)) * 100}%` }}
          >
            <b>{c.city}</b>
          </span>
        ))}
        <span
          className="rail-vehicle"
          role="slider"
          tabIndex={0}
          aria-label="Tour progress — drag to travel"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${pct}% — ${current?.city ?? ''}`}
          onKeyDown={onKeyDown}
        >
          {veh}
        </span>
      </div>
      <span className="rail-pct" aria-hidden>
        {pct}%
      </span>
    </div>
  )
}
