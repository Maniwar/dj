import { useEffect, useRef, useState } from 'react'
import { TOUR_CLIPS } from '../data/tour.manifest'
import { useSiteStore } from '../state/useSiteStore'

// A persistent VERTICAL "world tour" progress rail down the right edge of the page. As you
// scroll the whole site top→bottom the vehicle travels down the rail and the four cities
// light up as milestones; the fill grows from the top. Beat-reactive via --m-beat.
// pointer-events:none so it never blocks anything. On the right edge it stays clear of the
// bottom-docked mobile player.
const LEG: Record<string, string> = { ibiza: '🛥️', tokyo: '✈️', miami: '🚌', berlin: '🚄' }

export default function TourRail() {
  const loggedOn = useSiteStore((s) => s.loggedOn)
  const rootRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [pct, setPct] = useState(0)
  const cities = TOUR_CLIPS

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
    <div ref={rootRef} className={`tour-rail ${shown ? 'show' : ''}`} aria-hidden>
      <span className="rail-cap">TOUR</span>
      <div className="rail-track">
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
        <span className="rail-vehicle">{veh}</span>
      </div>
      <span className="rail-pct">{pct}%</span>
    </div>
  )
}
