import { useEffect, useRef, useState } from 'react'
import { audioBus } from '../audio/audioBus'
import { useSiteStore } from '../state/useSiteStore'

// Scrolling into a new section should feel EDITED, not just scrolled. When you cross into one,
// the cut is armed — and then fires on the next DOWNBEAT rather than immediately. Waiting for
// the bar line is the whole point: a transition that lands on the 1 reads as a director's cut,
// the same wipe fired mid-bar just reads as a glitchy page.
//
// It only ever waits for a beat while something is playing; in silence it fires straight away
// so the site never feels unresponsive.
const ARM_TIMEOUT_MS = 1400 // if no downbeat arrives by then, just cut

export default function SectionCut() {
  const loggedOn = useSiteStore((s) => s.loggedOn)
  const reduced = useSiteStore((s) => s.reducedMotion)
  const [cut, setCut] = useState(0) // bump to replay the animation
  const armed = useRef(false)
  const armedAt = useRef(0)
  const current = useRef('')

  useEffect(() => {
    if (!loggedOn || reduced) return
    const sections = Array.from(document.querySelectorAll<HTMLElement>('section[id]'))
    if (!sections.length) return

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const id = (e.target as HTMLElement).id
          if (id === current.current) continue
          const first = current.current === ''
          current.current = id
          if (first) continue // no cut on the very first section we land in
          armed.current = true
          armedAt.current = performance.now()
        }
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 }, // the section crossing screen centre
    )
    sections.forEach((s) => io.observe(s))

    let raf = 0
    let lastBeat = -1
    const loop = () => {
      if (armed.current) {
        const beat = audioBus.music.beatIndex
        const onDownbeat = beat !== lastBeat && beat % 4 === 0
        const stale = performance.now() - armedAt.current > ARM_TIMEOUT_MS
        if (onDownbeat || stale || !audioBus.playing) {
          armed.current = false
          setCut((c) => c + 1)
        }
        lastBeat = beat
      } else {
        lastBeat = audioBus.music.beatIndex
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [loggedOn, reduced])

  if (!loggedOn || reduced || cut === 0) return null
  // keyed so each cut restarts the animation from the top
  return <div className="section-cut" key={cut} aria-hidden />
}
