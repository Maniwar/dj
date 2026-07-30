import { useEffect, useRef, useState } from 'react'
import { TOUR_CLIPS } from '../../data/tour.manifest'
import { SCENES, hydrateRealVideo } from '../../video/broadcastFrames'
import { withBase } from '../../lib/asset'
import { videoSrc } from '../../lib/videoRendition'
import { ACCENTS, useSiteStore, type AccentKey } from '../../state/useSiteStore'
import { useFxOn } from '../../perf/useFx'

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
  // See Lore: off falls back to the poster Ken-Burns each city already has, and the 🎬 button
  // reaches this through the same class rather than as a separate flag.
  const videoEnabled = useFxOn('sectionVideo')
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
      // Each city owns the light rig while you're travelling through it (Ibiza sunrise gold,
      // Tokyo neon pink, Miami aqua, Berlin basement acid), handing it back on the way out.
      const inView = rect.top < window.innerHeight && rect.bottom > 0
      const city = cities[idx]?.id as AccentKey | undefined
      useSiteStore.getState().setAccent(inView && city && city in ACCENTS ? city : 'default')
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
      // guarded for the same reason as Lore: re-issuing play/pause on an element already in
      // that state still churns the media pipeline and flashes on Android
      if (id === cities[active]?.id) {
        if (v.paused) v.play().catch(() => {})
      } else if (!v.paused) {
        v.pause()
      }
    }
  }, [active, videoMap, cities])

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
          const mp4 = videoEnabled ? videoMap[c.id] : undefined
          // data-media is what the scan layer keys its darkening off — the media is inside
          // .journey-band now, so a sibling combinator can no longer see it. Mirrors the
          // identical attribute on .lore-stop.
          return (
            <div className="journey-stop" key={c.id} data-active={i === active} data-media={mp4 ? 'video' : 'still'}>
              {/* Blurred backdrop so the crew is never cropped off the edges at narrower window
                  widths — and so the band has something to dissolve INTO instead of a void.
                  It is rendered for the CLIP as well as the still now. It used to be still-only,
                  which meant that at 3840x1080 a video stop had 570px of flat nothing either
                  side of it and the sharp clip ended on a hard vertical line — measured, and the
                  same fault the mainstage had. The clip's own poster is this exact image, so the
                  blur matches the footage it sits behind. It is a background-image, not a second
                  <video>: videoDirector.ts allows one decoder at a time. */}
              <div
                className="journey-bg-blur"
                style={{ backgroundImage: c.posterUrl ? `url(${withBase(c.posterUrl)})` : undefined }}
              />
              {/* The band CLIPS the media and carries the soft edge. Both have to happen on a
                  wrapper: .journey-bg animates Ken-Burns plus a per-beat scale, so a mask on it
                  would zoom and drift and the feather would breathe on every kick. */}
              <div className="journey-band">
              {mp4 ? (
                <video
                  className="journey-video"
                  ref={(el) => {
                    videoRefs.current[c.id] = el
                  }}
                  src={videoSrc(mp4)}
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
              </div>
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
    </section>
  )
}
