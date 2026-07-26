import { useEffect } from 'react'

// Animations that run forever, whether or not anyone can see them.
//
// Measured on a phone: 35 CSS animations running at once, including SIX `goldsheen` loops on
// section titles and five marquees — most of them scrolled far out of view. goldsheen animates
// background-position, which is a REPAINT, so those were repainting text sixty times a second
// for nobody. That is pure heat: work the GPU does that never reaches the viewer's eyes.
//
// This pauses them when they leave the viewport and resumes when they return. The elements are
// picked deliberately rather than blanket-applied: only long-running decorative loops, never
// anything that conveys state (the beat-driven transforms, the lyric timing, the gauges).
const SELECTOR = '.section-title, .lm-run, .mono, .drip, .logon-glow'

// A generous margin means an animation is already running by the time it scrolls into view, so
// nothing is ever caught mid-pause.
const MARGIN = '60% 0px 60% 0px'

export default function PauseOffscreen() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const els = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR))
    if (!els.length) return

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement
          // toggling the CSS property directly, rather than a class, keeps this off React's
          // render path entirely — it is a visual detail, not state
          el.style.animationPlayState = e.isIntersecting ? '' : 'paused'
        }
      },
      { rootMargin: MARGIN },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  // Nothing on the page is worth animating while the tab is in the background. Browsers throttle
  // rAF there, but CSS animations and video keep going, and on a phone that is measurable
  // battery drain for a page nobody is looking at.
  useEffect(() => {
    const onVis = () => {
      const hidden = document.visibilityState === 'hidden'
      document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
        el.style.animationPlayState = hidden ? 'paused' : ''
      })
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return null
}
