import { useEffect, useRef } from 'react'
import { useSiteStore } from '../state/useSiteStore'

// A halo that follows the pointer and swells on the kick.
//
// The native cursor is left exactly where it is. Replacing it with a custom graphic is the
// usual approach and it is the wrong one here: a hidden system cursor lags its replacement by
// a frame on every machine, and the moment the page stutters the user loses track of where
// their pointer actually is. A ring drawn AROUND the real cursor cannot lag it in any way that
// matters, because the thing you are actually aiming with is still being drawn by the OS.
//
// Everything it does is a transform: translate3d for the position, `scale` for the beat, both
// composited. --m-beat is already written once per frame by AudioReactive and sits at 0
// whenever nothing is playing, so the halo simply goes still with the music instead of needing
// to know anything about playback.
export default function BeatCursor() {
  const loggedOn = useSiteStore((s) => s.loggedOn)
  const reduced = useSiteStore((s) => s.reducedMotion)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loggedOn || reduced) return
    // fine pointers only — there is no cursor to decorate on a touchscreen
    if (!window.matchMedia('(pointer: fine)').matches) return

    let raf = 0
    let x = -100
    let y = -100
    const draw = () => {
      raf = 0
      const el = ref.current
      if (el) el.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }
    const onMove = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      // coalesce to one write per frame: pointermove can fire far more often than that
      if (!raf) raf = requestAnimationFrame(draw)
    }
    const onLeave = () => {
      x = -100
      y = -100
      if (!raf) raf = requestAnimationFrame(draw)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [loggedOn, reduced])

  if (!loggedOn || reduced) return null
  return <div ref={ref} className="beat-cursor" aria-hidden />
}
