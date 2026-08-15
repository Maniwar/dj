import { useEffect, useMemo, useRef, useState } from 'react'
import { LORE_STOPS } from '../../data/lore'
import { withBase } from '../../lib/asset'
import { videoSrc } from '../../lib/videoRendition'
import { useSiteStore } from '../../state/useSiteStore'
import { useFxOn } from '../../perf/useFx'
import results from '../../data/atlascloud.results.json'

// The Origin — a full-bleed scroll-journey. First the two character HERO pages (Kiki,
// Dieter), then the origin story beats. Each stop is a viewport-tall scene you scroll
// through; the active one animates in. Story stops swap their still for a muted mp4 when one
// exists (results.json id "lore-<stopId>") and the video toggle is on. Accent color per
// character (Kiki=magenta, Dieter=blue, both=acid).
export default function Lore() {
  const secRef = useRef<HTMLElement>(null)
  // The header waits for its section to actually own the screen. Gating it on the observer's
  // active index was tried and failed — no stop reported active at the moment the header should
  // appear, so it never showed at all. Scroll position is the honest signal: the title belongs
  // once the section is genuinely under you, not when its top edge first clips the viewport.
  const [titleOn, setTitleOn] = useState(false)
  useEffect(() => {
    // The ref is read INSIDE update rather than captured once. Bailing on a null ref at mount
    // — which is what happens while the boot gate still covers the page — left the listener
    // never attached and the header permanently hidden, which is exactly how the previous
    // attempt failed.
    let raf = 0
    const update = () => {
      const el = secRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setTitleOn(r.top <= window.innerHeight * 0.4 && r.bottom > window.innerHeight * 0.55)
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
  }, [])
  // -1 = nothing active yet, so a stop's entrance animation only plays once it actually
  // crosses into view (starting at 0 consumed stop 0's fade-in while off-screen).
  const [active, setActive] = useState(-1)
  const stops = LORE_STOPS
  // `sectionVideo` off falls back to each stop's still — the same path a stop with no mp4
  // already takes — so the scene composition is unchanged and up to 7 decoders stop existing.
  // The player's 🎬 button arrives through this same class rather than as a second flag ANDed on
  // top of it; see Broadcast.
  const videoEnabled = useFxOn('sectionVideo')
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
    // A 1px detection line at the exact viewport centre (rootMargin -50%/-50%) meant that
    // parking BETWEEN two slides left the boundary sitting on that line, where a single pixel
    // of scroll, a beat transform or the URL bar animating would flip isIntersecting back and
    // forth. Every flip restarted Ken-Burns AND called play() on one video and pause() on the
    // other — video play/pause thrash, which is what was flickering while standing still.
    //
    // So: choose the slide that occupies the most of the screen, and require a challenger to
    // win by a clear margin before handing over. Oscillation needs a tie; hysteresis removes
    // the tie.
    const ratios = new Map<number, number>()
    const SWITCH_MARGIN = 0.18 // how far ahead a challenger must be to take over
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const idx = items.indexOf(e.target as HTMLElement)
          if (idx < 0) continue
          ratios.set(idx, e.isIntersecting ? e.intersectionRatio : 0)
        }
        let best = -1
        let bestRatio = 0
        for (const [idx, r] of ratios) {
          if (r > bestRatio) {
            bestRatio = r
            best = idx
          }
        }
        setActive((cur) => {
          if (best < 0 || bestRatio <= 0) return -1
          if (cur < 0 || cur === best) return best
          const curRatio = ratios.get(cur) ?? 0
          return bestRatio > curRatio + SWITCH_MARGIN ? best : cur
        })
      },
      { threshold: [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1] },
    )
    items.forEach((it) => io.observe(it))
    return () => io.disconnect()
  }, [stops.length])

  // Hand the light rig this stop's colour (Kiki magenta / Dieter blue / together acid), and
  // give it back when the section scrolls away, so the lasers belong to whoever's on screen.
  useEffect(() => {
    const setAccent = useSiteStore.getState().setAccent
    const stop = active >= 0 ? stops[active] : null
    setAccent(stop ? stop.accent : 'default')
  }, [active, stops])

  // Single-decode: only the active stop's video plays. The guards matter — calling play() on
  // an already-playing element, or pause() on an already-paused one, still churns the media
  // pipeline and shows up as a flash on Android. Cheap to check, so check.
  useEffect(() => {
    const activeId = stops[active]?.id
    for (const [id, v] of Object.entries(videoRefs.current)) {
      if (!v) continue
      if (id === activeId) {
        if (v.paused) v.play().catch(() => {})
      } else if (!v.paused) {
        v.pause()
      }
    }
  }, [active, videoEnabled, stops])

  return (
    <section className="lore" id="lore" ref={secRef}>
      <div className={`lore-title ${titleOn ? 'on' : ''}`}>
        <h2 className="section-title">THE ORIGIN</h2>
        <p className="section-kicker">two humans · one finn · one sauna · scroll to meet them</p>
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
              data-media={vid ? 'video' : 'still'}
              data-id={s.id}
              style={s.focus ? ({ ['--focus']: s.focus } as React.CSSProperties) : undefined}
            >
              {/* Blurred sides-filler, behind BOTH the clip and the still. On screens wider than
                  the media band (see the 11/5 media query) the frame is centred and this fills
                  what's left, so a video stop and a still stop have the same borders. */}
              <div
                className="lore-fill"
                style={{ backgroundImage: `url(${withBase(s.image)})` }}
                aria-hidden
              />
              {/* The band CLIPS its media. Ken-Burns scales the frame up to 1.1, and on a wide
                  screen an unclipped scale would push the picture out past the band edge and
                  into the side fill — making the borders visibly breathe with the animation. */}
              <div className="lore-band">
              {vid ? (
                <video
                  className="lore-video"
                  ref={(el) => {
                    videoRefs.current[s.id] = el
                  }}
                  src={videoSrc(vid)}
                  poster={withBase(s.image)}
                  muted
                  loop
                  playsInline
                  preload="none"
                  aria-hidden
                />
              ) : (
                <div
                  className="lore-bg"
                  style={{ backgroundImage: `url(${withBase(s.image)})` }}
                />
              )}
              </div>
              <div className="lore-scan" aria-hidden />
              <div className="lore-panel">
                <span className="lore-eyebrow">{s.eyebrow}</span>
                <h3 className={`lore-name ${s.kind}`}>{s.title}</h3>
                <p className="lore-body">{s.body}</p>
                {s.roster && (
                  <ul className="lore-roster">
                    {s.roster.map((r) => (
                      <li key={r.name}>
                        <span className="lore-roster-name">{r.name}</span>
                        <span className="lore-roster-tag">{r.tag}</span>
                        <span className="lore-roster-line">{r.line}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {s.kind === 'hero' && (
                  <span className="lore-tag">
                    ●{' '}
                    {s.tag ??
                      (s.id === 'kiki'
                        ? 'SHE IS THE SIGNAL'
                        : s.id === 'dieter'
                          ? 'HE IS THE NOISE'
                          : 'THEY ARE THE HUMIDITY')}
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
