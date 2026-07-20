import { useEffect, useMemo, useRef, useState } from 'react'
import { LORE_STOPS } from '../../data/lore'
import { withBase } from '../../lib/asset'
import { useSiteStore } from '../../state/useSiteStore'
import results from '../../data/atlascloud.results.json'

// The Origin — a full-bleed scroll-journey. First the two character HERO pages (Kiki,
// Dieter), then the origin story beats. Each stop is a viewport-tall scene you scroll
// through; the active one animates in. Story stops swap their still for a muted mp4 when one
// exists (results.json id "lore-<stopId>") and the video toggle is on. Accent color per
// character (Kiki=magenta, Dieter=blue, both=acid).
export default function Lore() {
  const secRef = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)
  const stops = LORE_STOPS
  const videoEnabled = useSiteStore((s) => s.videoEnabled)
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({})

  // map lore stop id -> mp4 (from the AtlasCloud results, keyed "lore-<id>")
  const loreVideos = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of (results as { clips?: Array<{ id?: string; status?: string; mp4Url?: string }> }).clips ?? []) {
      if (c.status === 'ready' && c.mp4Url && c.id?.startsWith('lore-')) m[c.id.slice(5)] = c.mp4Url
    }
    return m
  }, [])

  useEffect(() => {
    const el = secRef.current
    if (!el) return
    let raf = 0
    const update = () => {
      const rect = el.getBoundingClientRect()
      const total = el.offsetHeight - window.innerHeight
      const scrolled = Math.min(Math.max(-rect.top, 0), Math.max(1, total))
      const p = total > 0 ? scrolled / total : 0
      setActive(Math.min(stops.length - 1, Math.floor(p * stops.length + 0.0001)))
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
  }, [stops.length])

  // single-decode: only the active stop's video plays
  useEffect(() => {
    for (const [id, v] of Object.entries(videoRefs.current)) {
      if (!v) continue
      if (id === stops[active]?.id) v.play().catch(() => {})
      else v.pause()
    }
  }, [active, videoEnabled, stops])

  return (
    <section className="lore" id="lore" ref={secRef}>
      <div className="lore-title">
        <h2 className="section-title">THE ORIGIN</h2>
        <p className="section-kicker">two humans · one sauna · scroll to meet them</p>
      </div>

      <div className="lore-stops">
        {stops.map((s, i) => {
          // alternate which side the copy slides in from so the stops "swipe" across as you
          // scroll and Kiki/Dieter feed into each other
          const side = i % 2 === 0 ? 'left' : 'right'
          const vid = videoEnabled ? loreVideos[s.id] : undefined
          return (
            <div
              className={`lore-stop accent-${s.accent} ${s.kind} side-${side}`}
              key={s.id}
              data-active={i === active}
            >
              {vid ? (
                <video
                  className="lore-video"
                  ref={(el) => {
                    videoRefs.current[s.id] = el
                  }}
                  src={withBase(vid)}
                  poster={withBase(s.image)}
                  muted
                  loop
                  playsInline
                  preload="none"
                  aria-hidden
                />
              ) : (
                <div className="lore-bg" style={{ backgroundImage: `url(${withBase(s.image)})` }} />
              )}
              <div className="lore-scan" aria-hidden />
              <div className="lore-panel">
                <span className="lore-eyebrow">{s.eyebrow}</span>
                <h3 className={`lore-name ${s.kind}`}>{s.title}</h3>
                <p className="lore-body">{s.body}</p>
                {s.kind === 'hero' && (
                  <span className="lore-tag">
                    ● {s.id === 'kiki' ? 'SHE IS THE SIGNAL' : 'HE IS THE NOISE'}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
