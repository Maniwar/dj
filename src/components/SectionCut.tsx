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

// A full-viewport fixed overlay that ANIMATES on every section change. On desktop it is the
// director's-cut flourish it was built to be. On a phone it is a full-screen animated layer
// compositing over playing video every time you cross a section boundary — reported as the
// page flickering "between cards" in landscape on Android. It is a flourish, not a feature, so
// phones simply don't get it.
const NO_CUT_Q = '(max-width: 768px), (max-height: 600px)'

export default function SectionCut() {
  const loggedOn = useSiteStore((s) => s.loggedOn)
  const reduced = useSiteStore((s) => s.reducedMotion)
  const [tooSmall, setTooSmall] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NO_CUT_Q).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(NO_CUT_Q)
    const on = () => setTooSmall(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const [cut, setCut] = useState(0) // bump to replay the animation
  const armed = useRef(false)
  const armedAt = useRef(0)
  const current = useRef('')
  const startWatch = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!loggedOn || reduced || tooSmall) return
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
          startWatch.current?.()
        }
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 }, // the section crossing screen centre
    )
    sections.forEach((s) => io.observe(s))

    // The watcher only runs while a cut is ARMED. It used to run every frame for the life of
    // the page purely to poll a flag that is false almost all of the time — a permanent rAF
    // loop doing nothing.
    let raf = 0
    let lastBeat = -1
    const loop = () => {
      if (!armed.current) {
        raf = 0
        return // nothing pending: stop the loop entirely rather than spin
      }
      const beat = audioBus.music.beatIndex
      const onDownbeat = beat !== lastBeat && beat % 4 === 0
      const stale = performance.now() - armedAt.current > ARM_TIMEOUT_MS
      if (onDownbeat || stale || !audioBus.playing) {
        armed.current = false
        setCut((c) => c + 1)
        raf = 0
        return
      }
      lastBeat = beat
      raf = requestAnimationFrame(loop)
    }
    startWatch.current = () => {
      lastBeat = audioBus.music.beatIndex
      if (!raf) raf = requestAnimationFrame(loop)
    }
    return () => {
      io.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [loggedOn, reduced, tooSmall])

  if (!loggedOn || reduced || tooSmall || cut === 0) return null
  // keyed so each cut restarts the animation from the top
  return <div className="section-cut" key={cut} aria-hidden />
}
