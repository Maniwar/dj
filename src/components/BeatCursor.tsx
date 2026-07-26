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
  // Read once; a device does not switch pointer types mid-session in any way worth re-rendering
  // for, and this decides both what renders and what the effect listens for.
  const fine =
    typeof window === 'undefined' || window.matchMedia('(pointer: fine)').matches

  useEffect(() => {
    if (!loggedOn || reduced) return
    // TOUCH GETS THE EFFECTS, JUST NOT THE CURSOR.
    //
    // This used to bail outright on a coarse pointer, which was half right: there is no cursor
    // to decorate on a touchscreen, so the halo and the carried flashlight have nothing to
    // follow — a light that only moves between taps reads as broken. But the BURST and the
    // TRAIL never needed a cursor. A tap is a more deliberate gesture than a click, and dragging
    // a finger through the trail is a better way to draw than a mouse, so the two effects that
    // survive are the two that work BETTER here.

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
    // YOU SHOULD BE ABLE TO DRAW WITH IT.
    //
    // The particles now hold long enough that sweeping the cursor paints a visible line — a
    // heart, a name, whatever — and only then does the whole stroke fire off into the scene.
    // That is a far better effect than a quick spark, and it decides every number here.
    //
    // The pool must outlast the emission rate or particles get recycled mid-stroke and the
    // shape dissolves as you draw it. At ~1200px/s and a drop every 24px that is ~50 emitted a
    // second; with a 2s life, ~100 are in flight at once. 104 slots covers it. They are cheap —
    // no blending, transform and opacity only — so the cost is a bounded set of tiny composited
    // layers rather than the unbounded node churn the very first version had.
    // Smaller pool and a longer stride on touch. Phones have a fraction of the compositor
    // budget, this page already runs video behind everything, and a finger sweeps a short screen
    // far faster than a mouse crosses a desktop — the same 24px stride would emit roughly twice
    // as many particles for a stroke a third the length. This is the file that made phones warm
    // once already; the effect is worth having, but not at any price.
    const POOL = fine ? 104 : 44
    const DROP_DISTANCE = fine ? 24 : 34
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
          // HOLD — this is the drawable part. Long enough to complete a shape before any of it
          // starts moving, which is the whole point of being able to paint with it.
          { transform: from, opacity: 0.95, offset: 0, easing: 'linear' },
          { transform: from, opacity: 0.95, offset: 0.35, easing: 'cubic-bezier(0.3,0,0.5,1)' },
          // THEN FIRE: outward and away, shrinking as it recedes into the scene.
          { transform: to, opacity: 0, offset: 1 },
        ],
        // A middle ground. 780ms total with a 26% hold was too brief to draw with; 2000ms with a
        // 62% hold inverted the balance — the stroke sat there so long it stopped feeling like
        // light, and the flight was over before it registered. 1200ms with a 35% hold gives
        // ~420ms to lay a stroke down and ~780ms of flight, so the movement is the longer half
        // again while a shape still survives long enough to be seen.
        { duration: 1200, fill: 'forwards' },
      )
    }

    // On touch there is no hover, so a stroke has to mean a DRAG. Without this the trail would
    // fire on the incidental pointermove events a tap produces and spray particles at every tap.
    let dragging = false
    const onMove = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      if (fine || dragging) dropTrail(x, y)
      if (!fine) return // no halo and no flashlight to move on a touchscreen
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
      dragging = true
      // a finger starts a stroke where it lands, not from wherever the last one ended
      lastDropX = e.clientX
      lastDropY = e.clientY
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

    const onUp = () => { dragging = false }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', onUp, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.removeEventListener('pointerleave', onLeave)
      pool.forEach((d) => d.remove())
    }
  }, [loggedOn, reduced])

  if (!loggedOn || reduced) return null
  // The halo and the flashlight follow a pointer that only exists between taps, so they are not
  // rendered on a touchscreen at all — the burst and the trail are appended to the body by the
  // effect above and need no host element.
  if (!fine) return null
  return (
    <>
      <div ref={lightRef} className="flashlight" aria-hidden />
      <div ref={ref} className="beat-cursor" aria-hidden />
    </>
  )
}
