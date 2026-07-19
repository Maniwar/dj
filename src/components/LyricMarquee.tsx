import { useMemo } from 'react'
import { allHooks } from '../data/lyricLines'

// A scrolling band of real lyric hooks — carries the songs' voice through the whole
// page between sections. Beat-reactive via CSS (var(--m-beat)).
export default function LyricMarquee({
  tint = 'magenta',
  speed = 34,
  offset = 0,
}: {
  tint?: 'magenta' | 'acid' | 'blue'
  speed?: number
  offset?: number
}) {
  const hooks = useMemo(() => {
    const h = allHooks()
    // rotate so different marquees show different lines
    return h.length ? h.slice(offset % h.length).concat(h.slice(0, offset % h.length)) : []
  }, [offset])

  if (!hooks.length) return null
  const run = hooks.map((h, i) => (
    <span className="lm-item" key={i}>
      {h} <em className="lm-dot">✦</em>{' '}
    </span>
  ))

  return (
    <div className={`lyric-marquee tint-${tint}`} aria-hidden style={{ ['--lm-speed' as any]: `${speed}s` }}>
      <div className="lm-run">
        {run}
        {run}
      </div>
    </div>
  )
}
