import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { allHooks } from '../data/lyricLines'

// A scrolling band of real lyric hooks — carries the songs' voice through the whole page
// between sections. The run holds TWO identical copies and animates to -50% (see the
// .lm-run / marquee-seamless CSS) for a seamless loop. We measure one copy's width and set
// the animation duration for a CONSTANT px/sec, so the scroll stays readable no matter how
// many hooks are in it (the previous version scrolled far too fast). Beat-reactive via CSS.
export default function LyricMarquee({
  tint = 'magenta',
  pxPerSec = 70,
  offset = 0,
}: {
  tint?: 'magenta' | 'acid' | 'blue'
  pxPerSec?: number
  offset?: number
}) {
  const hooks = useMemo(() => {
    const h = allHooks()
    // rotate so different marquees show different lines
    return h.length ? h.slice(offset % h.length).concat(h.slice(0, offset % h.length)) : []
  }, [offset])

  const runRef = useRef<HTMLDivElement>(null)
  const [dur, setDur] = useState(40)

  useLayoutEffect(() => {
    const el = runRef.current
    if (!el) return
    const measure = () => {
      const oneCopy = el.scrollWidth / 2 // content is doubled; one copy = half the run
      if (oneCopy > 0) setDur(oneCopy / Math.max(10, pxPerSec))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // fonts can load after first paint and widen the run — re-measure when they settle
    ;(document as any).fonts?.ready?.then?.(measure)
    return () => ro.disconnect()
  }, [hooks, pxPerSec])

  if (!hooks.length) return null
  const run = hooks.map((h, i) => (
    <span className="lm-item" key={i}>
      {h} <em className="lm-dot">✦</em>{' '}
    </span>
  ))

  return (
    <div className={`lyric-marquee tint-${tint}`} aria-hidden>
      <div className="lm-run" ref={runRef} style={{ animationDuration: `${dur}s` }}>
        {run}
        {run}
      </div>
    </div>
  )
}
