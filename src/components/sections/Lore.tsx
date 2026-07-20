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
  // -1 = nothing active yet, so a stop's entrance animation only plays once it actually
  // crosses into view (starting at 0 consumed stop 0's fade-in while off-screen).
  const [active, setActive] = useState(-1)
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
    const items = Array.from(el.querySelectorAll<HTMLElement>('.lore-stop'))
    if (!items.length) return
    // A stop becomes active the moment it crosses the viewport's vertical centre. The
    // collapsed root (-50% top & bottom) is a single centre line, so exactly one contiguous
    // 100vh stop straddles it at a time — the entrance animation fires on the way DOWN and UP,
    // and never off-screen. Works identically on desktop and mobile (no scroll-math / no
    // address-bar resize glitches).
    // Track which stops currently straddle the centre line. active = the one in view, or -1
    // when the whole section is off-screen — so leaving (e.g. scrolling back to the top) resets
    // the cards and re-entering re-plays their fade-in, in BOTH directions.
    const visible = new Set<number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const idx = items.indexOf(e.target as HTMLElement)
          if (idx < 0) continue
          if (e.isIntersecting) visible.add(idx)
          else visible.delete(idx)
        }
        setActive(visible.size ? Math.min(...visible) : -1)
      },
      { rootMargin: '-50% 0px -50% 0px', threshold: 0 },
    )
    items.forEach((it) => io.observe(it))
    return () => io.disconnect()
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
