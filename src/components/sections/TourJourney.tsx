import { useEffect, useRef, useState } from 'react'
import { TOUR_CLIPS } from '../../data/tour.manifest'
import { SCENES, hydrateRealVideo } from '../../video/broadcastFrames'
import { withBase } from '../../lib/asset'

// Vehicle for each leg of the world tour — the crew travels city to city as you scroll.
const VEHICLES: Record<string, { icon: string; verb: string }> = {
  ibiza: { icon: '🛥️', verb: 'SET SAIL FOR' },
  tokyo: { icon: '✈️', verb: 'JETTING TO' },
  miami: { icon: '🚌', verb: 'PARTY BUS TO' },
  berlin: { icon: '🚄', verb: 'NIGHT TRAIN TO' },
}

export default function TourJourney() {
  const secRef = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)
  // Real AtlasCloud mp4 per city (empty until `npm run gen:videos` has run). Sourced from
  // atlascloud.results.json via the hydrated SCENES, matching the Broadcast's source of truth.
  const [videoMap, setVideoMap] = useState<Record<string, string>>({})
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({})
  const cities = TOUR_CLIPS

  // Pull in real videos once (if the results file has ready clips). A city's stop swaps its
  // poster Ken-Burns for a muted <video loop> the moment a real mp4 exists.
  useEffect(() => {
    let alive = true
    hydrateRealVideo().then(() => {
      if (!alive) return
      const map: Record<string, string> = {}
      for (const c of cities) {
        const fromScene = SCENES[c.id]?.mp4
        const fromClip = c.status === 'ready' && c.mp4Url ? c.mp4Url : ''
        const mp4 = fromScene || fromClip
        if (mp4) map[c.id] = mp4
      }
      setVideoMap(map)
    })
    return () => {
      alive = false
    }
  }, [cities])

  useEffect(() => {
    const el = secRef.current
    if (!el) return
    let raf = 0
    const update = () => {
      const rect = el.getBoundingClientRect()
      const total = el.offsetHeight - window.innerHeight
      const scrolled = Math.min(Math.max(-rect.top, 0), Math.max(1, total))
      const p = total > 0 ? scrolled / total : 0
      el.style.setProperty('--journey', p.toFixed(4))
      const idx = Math.min(cities.length - 1, Math.floor(p * cities.length + 0.0001))
      setActive(idx) // React bails when unchanged
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

  // Single-decode: only the active stop's video plays; the rest are paused (mobile-friendly).
  useEffect(() => {
    for (const [id, v] of Object.entries(videoRefs.current)) {
      if (!v) continue
      if (id === cities[active]?.id) v.play().catch(() => {})
      else v.pause()
    }
  }, [active, videoMap, cities])

  const current = cities[active]
  const v = VEHICLES[current?.id] ?? { icon: '🚐', verb: 'ROLLING TO' }

  return (
    <section className="journey" id="tour" ref={secRef}>
      <div className="journey-title">
        <h2 className="section-title">THE GLOBAL MELTDOWN</h2>
        <p className="section-kicker">
          one crew · one summer · four cities · scroll to travel with them
        </p>
      </div>

      <div className="journey-stops">
        {cities.map((c, i) => {
          const mp4 = videoMap[c.id]
          return (
            <div className="journey-stop" key={c.id} data-active={i === active}>
              {mp4 ? (
                <video
                  className="journey-video"
                  ref={(el) => {
                    videoRefs.current[c.id] = el
                  }}
                  src={withBase(mp4)}
                  poster={withBase(c.posterUrl)}
                  muted
                  loop
                  playsInline
                  preload="none"
                  aria-hidden
                />
              ) : (
                <div
                  className="journey-bg"
                  style={{ backgroundImage: c.posterUrl ? `url(${withBase(c.posterUrl)})` : undefined }}
                />
              )}
              <div className="journey-scan" aria-hidden />
              <div className="journey-card">
                <span className="journey-leg">
                  {VEHICLES[c.id]?.icon} STOP {String(i + 1).padStart(2, '0')} / {String(cities.length).padStart(2, '0')}
                </span>
                <h3 className="journey-city">{c.city}</h3>
                <span className="journey-venue">{c.venue} · {c.year}</span>
                <p className="journey-blurb">{c.blurb}</p>
                <span className="journey-seed">● REC · seed·{c.seed} · same leopard crew, every city</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* sticky HUD — the vehicle travels the route as you scroll */}
      <div className="journey-hud" aria-hidden>
        <div className="hud-route">
          <div className="hud-line" />
          {cities.map((c, i) => (
            <span key={c.id} className={`hud-pin ${i <= active ? 'done' : ''}`} style={{ left: `${(i / (cities.length - 1)) * 100}%` }}>
              <b>{c.city}</b>
            </span>
          ))}
          <span className="hud-vehicle">{v.icon}</span>
        </div>
        <div className="hud-label">
          {v.verb} <b>{current?.city}</b>
        </div>
      </div>
    </section>
  )
}
