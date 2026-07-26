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
    // A PARTICLE EMITTER, not a trail. A trail marks where the cursor has BEEN — dots sitting
    // still on the path, fading — which is why it read as beads following the pointer. Sparks
    // thrown into a room do the opposite: they leave the source, travel outward, and SHRINK as
    // they recede, because things get smaller with distance. That shrink-while-travelling is the
    // entire depth cue; without it any particle is just a dot sliding around on the glass.
    //
    // Each one gets its own direction and throw distance, so a spray never repeats.
    //
    // A FIXED POOL, recycled — not one node per drop.
    //
    // The first version created an element on every ~22px of travel and deleted it 900ms later.
    // A brisk sweep across a wide screen is easily a hundred of those a second, each one an
    // allocation, a style resolve, a new compositor layer and then a teardown — and every one of
    // them blended, which forces the compositor to read the backdrop. That is precisely the
    // churn that was making this page flicker and phones run warm.
    //
    // Twelve nodes are created once and reused round-robin. Moving the mouse now costs two style
    // writes on an element that already exists, and the ceiling on simultaneous trail layers is
    // twelve no matter how violently the cursor is waved.
    const POOL = 18
    const DROP_DISTANCE = 26 // a denser spray now that each particle travels away
    const pool: HTMLDivElement[] = []
    for (let i = 0; i < POOL; i++) {
      const dot = document.createElement('div')
      dot.className = 'glow-trail'
      document.body.appendChild(dot)
      pool.push(dot)
    }
    let next = 0
    let lastDropX = 0
    let lastDropY = 0
    const dropTrail = (px: number, py: number) => {
      if (Math.hypot(px - lastDropX, py - lastDropY) < DROP_DISTANCE) return
      lastDropX = px
      lastDropY = py
      const dot = pool[next]
      next = (next + 1) % POOL
      // Position and scale live in ONE transform, translate first. Animating the standalone
      // `scale` property instead multiplies the translate along with it — CSS applies `scale`
      // before `transform` — which collapsed every particle toward the screen origin. Inside a
      // single transform, translate is applied first and scale operates around the placed point.
      const angle = Math.random() * Math.PI * 2
      const throwDist = 160 + Math.random() * 220
      const ex = px + Math.cos(angle) * throwDist
      // biased upward: sparks thrown into a room rise as they go, and the footage's horizon is
      // above centre, so travelling up also reads as travelling AWAY
      const ey = py + Math.sin(angle) * throwDist * 0.62 - 30 - Math.random() * 50
      const from = `translate3d(${px}px, ${py}px, 0) scale(1)`
      const to = `translate3d(${ex}px, ${ey}px, 0) scale(0.12)`
      dot.style.transform = from
      dot.getAnimations().forEach((a) => a.cancel())
      dot.animate(
        [
          // LINGER: sit where it was dropped, at full size. This is the trail half — the
          // previous version shrank to a quarter within 300ms having travelled only 28px, so it
          // collapsed before it went anywhere and never read as being fired at all.
          { transform: from, opacity: 0.9, offset: 0, easing: 'linear' },
          { transform: from, opacity: 0.9, offset: 0.34, easing: 'cubic-bezier(0.3,0,0.5,1)' },
          // THEN FIRE: outward and away, shrinking as it recedes into the scene.
          { transform: to, opacity: 0, offset: 1 },
        ],
        { duration: 1000, fill: 'forwards' },
      )
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
      // the spokes live in their own rotated group so they radiate along the floor plane
      const group = document.createElement('div')
      group.className = 'spokes'
      const spokes = 9
      for (let i = 0; i < spokes; i++) {
        const spoke = document.createElement('i')
        // spread them unevenly — a perfectly even star reads as a graphic, not as light
        const angle = (360 / spokes) * i + (Math.random() * 24 - 12)
        spoke.style.setProperty('--a', `${angle}deg`)
        spoke.style.setProperty('--len', `${120 + Math.random() * 120}px`)
        spoke.style.setProperty('--delay', `${Math.random() * 60}ms`)
        group.appendChild(spoke)
      }
      burst.appendChild(group)
      document.body.appendChild(burst)
      // ONE timer, longer than the longest animation. Counting animationend events was the first
      // attempt and it leaked every node: pseudo-element animations fire on the originating
      // element too, so the expected count was wrong and the tidy never reached it. A single
      // timeout cannot miscount.
      window.setTimeout(() => burst.remove(), 1100)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown)
    document.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerleave', onLeave)
      pool.forEach((d) => d.remove())
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
