import { useEffect, useRef, useState } from 'react'
import { BUILD_STAMP } from '../version'

// On-screen diagnostics, shown only with ?diag.
//
// This exists because several rounds of fixing this site's flicker were spent inferring what a
// Samsung tablet was doing from a laptop, and emulation reproduces none of it — headless Chrome
// has a desktop GPU, no thermal limit and no mobile video decoder. The only way to know what a
// device is actually doing is to ask it, on the device, while the problem is happening.
//
// Everything here is read-only and cheap: one rAF that already had to run, and a handful of
// property reads. It must not perturb what it is measuring, so there are no layout reads
// (getBoundingClientRect, offsetWidth) anywhere in the loop.
export default function Diagnostics() {
  const [on] = useState(() => /[?&]diag(?:&|=|$)/i.test(location.search))
  const ref = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (!on) return
    let raf = 0
    let last = performance.now()
    let frames = 0
    let slow = 0
    let worst = 0
    let windowStart = last
    let fps = 0
    let slowPct = 0
    // MEASURE THE JERK ITSELF, on the device, rather than inferring it from a headless test that
    // sets the text directly. The real app changes this content through a React re-render, and
    // the readings change character COUNT (43°C -> 9°C), not just glyph width — neither of which
    // a scripted string swap reproduces. This records where the headline and the player actually
    // sit, how often that changes, and by how much.
    let lastPos = ''
    let moves = 0
    let maxDx = 0
    let maxDy = 0
    let prevRect: { x: number; y: number } | null = null
    let blendCount = 0
    let promotedCount = 0
    let pausedAnims = 0
    let heapMB = 0
    let longTasks = 0

    // Long tasks block the main thread for >50ms. They do not show up in a frame-rate average,
    // which is why this page can read 60fps while visibly misbehaving.
    let po: PerformanceObserver | null = null
    try {
      po = new PerformanceObserver((l) => { longTasks += l.getEntries().length })
      po.observe({ entryTypes: ['longtask'] })
    } catch { /* not supported everywhere */ }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = now - last
      last = now
      if (dt < 500) {
        frames++
        if (dt > 26) slow++
        if (dt > worst) worst = dt
      }
      if (now - windowStart >= 500) {
        fps = Math.round((frames * 1000) / (now - windowStart))
        slowPct = frames ? Math.round((slow / frames) * 100) : 0
        frames = slow = 0
        windowStart = now

        // These walk the DOM, so they run once per half-second window rather than per frame.
        const all = document.querySelectorAll<HTMLElement>('body *')
        let b = 0, pr = 0
        all.forEach((el) => {
          const cs = getComputedStyle(el)
          if (cs.mixBlendMode !== 'normal') b++
          if (cs.willChange !== 'auto' || cs.transform !== 'none') pr++
        })
        blendCount = b
        promotedCount = pr
        pausedAnims = (document.getAnimations?.() ?? []).filter((a) => a.playState === 'paused').length
        heapMB = Math.round(((performance as any).memory?.usedJSHeapSize ?? 0) / 1048576)

        // sample the headline's position each window; any change is a real layout shift
        const h = document.querySelector('.hero-title') as HTMLElement | null
        if (h) {
          const r = h.getBoundingClientRect()
          const x = Math.round(r.left)
          const y = Math.round(r.top + window.scrollY) // page-relative, so scrolling is not a shift
          if (prevRect && (prevRect.x !== x || prevRect.y !== y)) {
            moves++
            maxDx = Math.max(maxDx, Math.abs(x - prevRect.x))
            maxDy = Math.max(maxDy, Math.abs(y - prevRect.y))
          }
          prevRect = { x, y }
          lastPos = `${x},${y}`
        }

        const el = ref.current
        if (el) {
          const v = document.querySelector('video')
          const vids = document.querySelectorAll('video')
          let playing = 0
          vids.forEach((x) => {
            if (!x.paused && !x.ended) playing++
          })
          const src = (v?.currentSrc || '').split('/').slice(-2).join('/')
          el.textContent = [
            BUILD_STAMP,
            `fps ${fps}  slow ${slowPct}%  worst ${Math.round(worst)}ms`,
            `view ${innerWidth}x${innerHeight} @${devicePixelRatio}  = ${Math.round(
              (innerWidth * devicePixelRatio * innerHeight * devicePixelRatio) / 1e6,
            )}MP`,
            `coarse ${matchMedia('(pointer: coarse)').matches}  calm ${document.documentElement.classList.contains('calm')}`,
            `video ${playing}/${vids.length} playing  ${src || '—'}`,
            `canvases ${document.querySelectorAll('canvas').length}  anims ${document.getAnimations?.().length ?? '?'}`,
            `cores ${navigator.hardwareConcurrency ?? '?'}  mem ${(navigator as any).deviceMemory ?? '?'}GB`,
            // BROWSER-LEVEL ZOOM. If the whole interface appears to pulse — player, analyser and
            // effects together — and no CSS transform sits on a common ancestor, the remaining
            // explanation is the visual viewport itself scaling. Android reports pinch-zoom and
            // font-boosting here, and neither is visible from any stylesheet.
            `vv scale ${(visualViewport?.scale ?? 1).toFixed(3)}  off ${Math.round(visualViewport?.offsetTop ?? 0)}  vvh ${Math.round(visualViewport?.height ?? 0)}`,
            // and whether anything large is carrying a live transform right now
            `root tf ${getComputedStyle(document.documentElement).transform}  body tf ${getComputedStyle(document.body).transform}`,
            `SHIFTS ${moves}  max dx ${maxDx}px  dy ${maxDy}px`,
            // BLEND LAYERS force the compositor to read back the framebuffer to blend against
            // whatever is beneath. On a tile-based mobile GPU that is the classic cause of layers
            // being evicted and re-allocated, which is what flicker looks like. Counting them
            // separates "too much work" from "too much blending".
            `blend ${blendCount}  promoted ${promotedCount}  paused-anims ${pausedAnims}`,
            // Heap is not GPU memory, but a climbing heap alongside flicker points at something
            // accumulating rather than a steady-state cost.
            `heap ${heapMB}MB  longtasks ${longTasks}`,
            `hero @ ${lastPos}`,
          ].join('\n')
          worst = 0
        }
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      po?.disconnect()
    }
  }, [on])

  if (!on) return null
  return (
    <pre
      ref={ref}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 99999,
        margin: 0,
        padding: '6px 8px',
        font: '11px/1.35 ui-monospace, Menlo, monospace',
        color: '#8bff3b',
        background: 'rgba(0,0,0,0.82)',
        pointerEvents: 'none',
        whiteSpace: 'pre',
      }}
    >
      measuring…
    </pre>
  )
}
