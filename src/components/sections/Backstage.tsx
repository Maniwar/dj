import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BACKSTAGE, WHO_LABEL, type Who } from '../../data/backstage'
import { withBase } from '../../lib/asset'

// BACKSTAGE — the Eurobeat Records archive: the band off duty, covering all four members and
// interleaved so no single member owns it. The filter chips are the cheap way to let someone
// follow one character without splitting the sheet into four blocks that each read as "their"
// section. Grid images are lazy-loaded: there are 32 of them and they sit well below the fold.
//
// Clicking a frame opens it full-screen at 2K from /assets/backstage/hd/<id>.jpg — a separate,
// heavier rendition that is only ever fetched on demand, so the grid stays cheap for everyone
// who just scrolls past it.
const ORDER: Who[] = ['kiki', 'dieter', 'crew', 'jussi']
const hiResFor = (id: string) => `/assets/backstage/hd/${id}.jpg`

export default function Backstage() {
  const [who, setWho] = useState<Who | 'all'>('all')
  const [openAt, setOpenAt] = useState<number | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const lastFocused = useRef<HTMLElement | null>(null)

  const shown = useMemo(
    () => (who === 'all' ? BACKSTAGE : BACKSTAGE.filter((o) => o.who === who)),
    [who],
  )
  const counts = useMemo(() => {
    const c = {} as Record<Who, number>
    for (const o of BACKSTAGE) c[o.who] = (c[o.who] ?? 0) + 1
    return c
  }, [])

  const open = (i: number) => {
    lastFocused.current = document.activeElement as HTMLElement
    setOpenAt(i)
  }
  const close = useCallback(() => {
    setOpenAt(null)
    // hand focus back to the frame that was opened, so keyboard users are not dumped at the top
    lastFocused.current?.focus?.()
  }, [])
  const step = useCallback(
    (d: number) => setOpenAt((i) => (i === null ? i : (i + d + shown.length) % shown.length)),
    [shown.length],
  )

  // Escape closes, arrows walk the sheet. Bound only while open.
  useEffect(() => {
    if (openAt === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openAt, close, step])

  // Lock the page behind the viewer, and put focus somewhere useful when it opens.
  useEffect(() => {
    if (openAt === null) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => { document.body.style.overflow = prev }
  }, [openAt])

  // If the filter changes underneath an open frame, the index would point at someone else.
  useEffect(() => { setOpenAt(null) }, [who])

  const active = openAt === null ? null : shown[openAt]

  return (
    <section className="backstage" id="backstage">
      <div className="bs-inner">
        <h2 className="section-title">BACKSTAGE</h2>
        <p className="section-kicker">
          eurobeat records archive · roll 07 · off duty, off the record
        </p>

        <div className="bs-filters" role="group" aria-label="Filter backstage frames by member">
          <button
            className={`bs-chip ${who === 'all' ? 'on' : ''}`}
            onClick={() => setWho('all')}
            aria-pressed={who === 'all'}
          >
            EVERYONE <span className="bs-count">{BACKSTAGE.length}</span>
          </button>
          {ORDER.map((w) => (
            <button
              key={w}
              className={`bs-chip who-${w} ${who === w ? 'on' : ''}`}
              onClick={() => setWho(w)}
              aria-pressed={who === w}
            >
              {WHO_LABEL[w]} <span className="bs-count">{counts[w] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="bs-grid">
          {shown.map((o, i) => (
            <figure className={`bs-card who-${o.who}`} key={o.id}>
              <button
                className="bs-open"
                onClick={() => open(i)}
                aria-label={`Open ${o.title} — ${WHO_LABEL[o.who]} — full size`}
              >
                <span className="bs-media">
                  <img
                    className="bs-img"
                    src={withBase(o.image)}
                    alt={`${WHO_LABEL[o.who]} — ${o.title}`}
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="bs-frame">FRAME {String(i + 1).padStart(2, '0')}</span>
                  <span className="bs-who">{WHO_LABEL[o.who]}</span>
                  <span className="bs-zoom" aria-hidden>⤢</span>
                  <span className="bs-scan" aria-hidden />
                </span>
              </button>
              <figcaption className="bs-cap">
                <h3 className="bs-title">{o.title}</h3>
                <p className="bs-note">{o.note}</p>
              </figcaption>
            </figure>
          ))}
        </div>

        <p className="bs-foot">
          ● {shown.length} frame{shown.length === 1 ? '' : 's'} · {ORDER.length} members ·
          {' '}click any frame for the full-size print
        </p>
      </div>

      {/* PORTALLED TO <body> ON PURPOSE. `.backstage` is `position: relative; z-index: 2`, which makes
          it a stacking context — so a child's z-index, however large, is still only sorted *within*
          that context. Left in place the overlay was drawn under the always-present player (z-index
          60 at the top level), which put the player squarely over the full-size photograph. Moving
          the node to <body> puts it back in the root stacking context where its z-index means what
          it says, and is what a modal wants anyway. */}
      {active && createPortal(
        <div
          className={`bs-viewer who-${active.who}`}
          role="dialog"
          aria-modal="true"
          aria-label={`${active.title} — ${WHO_LABEL[active.who]}`}
          onClick={close}
        >
          {/* stop clicks on the picture itself from closing, so people can drag/inspect it */}
          <figure className="bs-viewer-inner" onClick={(e) => e.stopPropagation()}>
            <img
              className="bs-viewer-img"
              // key on id so switching frames swaps the element rather than showing the previous
              // picture stretched into the new one's box while it loads
              key={active.id}
              src={withBase(hiResFor(active.id))}
              alt={`${WHO_LABEL[active.who]} — ${active.title}`}
              onError={(e) => {
                // fall back to the grid rendition if a hi-res file is missing, rather than
                // leaving a broken frame in a full-screen overlay
                const img = e.currentTarget
                if (!img.dataset.fellBack) {
                  img.dataset.fellBack = '1'
                  img.src = withBase(active.image)
                }
              }}
            />
            <figcaption className="bs-viewer-cap">
              <span className="bs-viewer-who">{WHO_LABEL[active.who]}</span>
              <h3 className="bs-viewer-title">{active.title}</h3>
              <p className="bs-viewer-note">{active.note}</p>
              <span className="bs-viewer-count">
                {(openAt ?? 0) + 1} / {shown.length}
              </span>
            </figcaption>
          </figure>

          <button ref={closeRef} className="bs-x" onClick={close} aria-label="Close">✕</button>
          <button
            className="bs-nav prev"
            onClick={(e) => { e.stopPropagation(); step(-1) }}
            aria-label="Previous frame"
          >‹</button>
          <button
            className="bs-nav next"
            onClick={(e) => { e.stopPropagation(); step(1) }}
            aria-label="Next frame"
          >›</button>
        </div>,
        document.body,
      )}
    </section>
  )
}
