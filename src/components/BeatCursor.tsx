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
  const lightRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loggedOn || reduced) return
    // fine pointers only — there is no cursor to decorate on a touchscreen
    if (!window.matchMedia('(pointer: fine)').matches) return

    let raf = 0
    let x = -100
    let y = -100
    // The pool EASES toward the pointer instead of being pinned to it. A torch beam has weight;
    // one locked rigidly to the cursor reads as a decal, whereas a little lag reads as a light
    // being carried. The ring and core stay pinned, so aiming is never affected.
    let lx = 0
    let ly = 0
    const draw = () => {
      raf = 0
      const el = ref.current
      if (el) el.style.transform = `translate3d(${x}px, ${y}px, 0)`
      const light = lightRef.current
      if (light) {
        lx += (x - lx) * 0.16
        ly += (y - ly) * 0.16
        light.style.transform = `translate3d(${lx}px, ${ly}px, 0)`
        // keep easing until it has caught up, otherwise it stops halfway when the pointer stops
        if (Math.abs(x - lx) > 0.5 || Math.abs(y - ly) > 0.5) raf = requestAnimationFrame(draw)
      }
    }
    // GLOW-STICK TRAIL. A dot is dropped every so often along the path and fades out on its own,
    // which is what a glow stick waved in a dark room actually leaves behind — a line of light
    // that decays rather than a solid stroke. Rate-limited by DISTANCE, not by time: moving fast
    // should draw a longer trail, and holding still should not pile hundreds of dots in one spot.
    let lastDropX = 0
    let lastDropY = 0
    const dropTrail = (px: number, py: number) => {
      if (Math.hypot(px - lastDropX, py - lastDropY) < 22) return
      lastDropX = px
      lastDropY = py
      const dot = document.createElement('div')
      dot.className = 'glow-trail'
      dot.style.left = `${px}px`
      dot.style.top = `${py}px`
      document.body.appendChild(dot)
      window.setTimeout(() => dot.remove(), 900)
    }

    const onMove = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      dropTrail(x, y)
      // coalesce to one write per frame: pointermove can fire far more often than that
      if (!raf) raf = requestAnimationFrame(draw)
    }
    const onLeave = () => {
      x = -100
      y = -100
      if (!raf) raf = requestAnimationFrame(draw)
    }
    // CLICK = a burst fired into the room. Each one is a throwaway element that removes itself
    // when its animation ends, so nothing accumulates however much the page is clicked — and
    // everything it animates is transform/opacity, so a burst costs the compositor and nothing
    // else. Spokes get individual angles and lengths so no two bursts look identical.
    const onDown = (e: PointerEvent) => {
      const burst = document.createElement('div')
      burst.className = 'click-burst'
      burst.style.left = `${e.clientX}px`
      burst.style.top = `${e.clientY}px`
      const spokes = 7
      for (let i = 0; i < spokes; i++) {
        const spoke = document.createElement('i')
        // spread them unevenly — a perfectly even star reads as a graphic, not as light
        const angle = (360 / spokes) * i + (Math.random() * 26 - 13)
        spoke.style.setProperty('--a', `${angle}deg`)
        spoke.style.setProperty('--len', `${90 + Math.random() * 130}px`)
        spoke.style.setProperty('--delay', `${Math.random() * 40}ms`)
        burst.appendChild(spoke)
      }
      document.body.appendChild(burst)
      // ONE timer, longer than the longest animation. Counting animationend events was the first
      // attempt and it leaked every node: pseudo-element animations fire on the originating
      // element too, so the expected count was wrong and the tidy never reached it. A single
      // timeout cannot miscount.
      window.setTimeout(() => burst.remove(), 900)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown)
    document.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [loggedOn, reduced])

  if (!loggedOn || reduced) return null
  return (
    <>
      <div ref={lightRef} className="flashlight" aria-hidden />
      <div ref={ref} className="beat-cursor" aria-hidden />
    </>
  )
}
